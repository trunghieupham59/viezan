#include "LocalPerformance.h"
#include <QStandardPaths>
#include <QFile>
#include <QDir>
#include <QFileInfo>
#include <QSaveFile>
#include <QJsonDocument>
#include <QJsonArray>
#include <QNetworkAccessManager>
#include <QNetworkProxy>
#include <QNetworkReply>
#include <QEventLoop>
#include <QTimer>
#include <QElapsedTimer>
#include <QFutureWatcher>
#include <QtConcurrent/QtConcurrent>
#include <QRegularExpression>
#include <QThread>
#include <stdexcept>
#include <cmath>
namespace {
QString path() { return QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation) + "/local-performance.json"; }
QJsonObject load() { QFile file(path()); if (!file.open(QIODevice::ReadOnly) || file.size() > 4194304) return {}; const auto result = QJsonDocument::fromJson(file.readAll()).object(); return result.size() <= 1000 ? result : QJsonObject{}; }
bool valid(const QJsonObject &profile) { return profile.value("layers").toInt() >= 1 && profile.value("layers").toInt() <= 999 && profile.value("context").toInt() >= 512 && profile.value("context").toInt() <= 32768; }
bool save(const QJsonObject &value) { QDir().mkpath(QFileInfo(path()).absolutePath()); QSaveFile file(path()); const auto data = QJsonDocument(value).toJson(QJsonDocument::Compact); if (!file.open(QIODevice::WriteOnly) || file.write(data) != data.size() || !file.commit()) return false; QFile::setPermissions(path(), QFileDevice::ReadOwner | QFileDevice::WriteOwner); return true; }
void check(const std::shared_ptr<std::atomic_bool> &cancel) { if (cancel->load()) throw std::runtime_error("cancelled"); }
struct Reply { QByteArray bytes; double first = -1; };
Reply call(const QString &route, const QJsonObject &body, const std::shared_ptr<std::atomic_bool> &cancel, bool stream = false) {
    check(cancel); QNetworkAccessManager network; network.setProxy(QNetworkProxy::NoProxy); QNetworkRequest request(QUrl("http://127.0.0.1:11434/api/" + route)); request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json"); request.setTransferTimeout(120000); request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    QElapsedTimer elapsed; elapsed.start(); auto *reply = body.isEmpty() ? network.get(request) : network.post(request, QJsonDocument(body).toJson(QJsonDocument::Compact)); QEventLoop loop; QTimer timer, poll; timer.setSingleShot(true); poll.setInterval(100); Reply result; QByteArray pending;
    QObject::connect(reply, &QNetworkReply::readyRead, &loop, [&] {
        const auto chunk = reply->readAll(); result.bytes += chunk;
        if (result.bytes.size() > 4194304) { reply->abort(); return; }
        if (stream && result.first < 0) {
            pending += chunk;
            while (pending.contains('\n')) { const auto end = pending.indexOf('\n'); const auto event = QJsonDocument::fromJson(pending.left(end)).object(); pending.remove(0,end+1); if (!event.value("response").toString().isEmpty()) { result.first = elapsed.elapsed(); break; } }
        }
    });
    QObject::connect(reply, &QNetworkReply::finished, &loop, &QEventLoop::quit); QObject::connect(&timer, &QTimer::timeout, &loop, [&] { reply->abort(); loop.quit(); }); QObject::connect(&poll, &QTimer::timeout, &loop, [&] { if (cancel->load()) reply->abort(); }); timer.start(180000); poll.start(); loop.exec(); result.bytes += reply->readAll(); check(cancel);
    if (reply->error() != QNetworkReply::NoError || reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt() != 200 || result.bytes.size() > 4194304) throw std::runtime_error("runtimeComparisonError"); return result;
}
QJsonObject json(const QString &route, const QJsonObject &body, const std::shared_ptr<std::atomic_bool> &cancel) { QJsonParseError error; const auto value = QJsonDocument::fromJson(call(route,body,cancel).bytes, &error); if (error.error != QJsonParseError::NoError || !value.isObject() || value.object().contains("error")) throw std::runtime_error("runtimeComparisonError"); return value.object(); }
QPair<double,double> sample(const QString &name, int layers, const std::shared_ptr<std::atomic_bool> &cancel) {
    const auto reply = call("generate", {{"model",name},{"prompt","Write the numbers 1 to 20 in order, separated by spaces. Output only the numbers."},{"think",false},{"stream",true},{"keep_alive","2m"},{"options",QJsonObject{{"num_gpu",layers},{"num_ctx",2048},{"num_predict",96},{"temperature",0},{"seed",42}}}}, cancel, true);
    QString text; double rate = 0;
    for (const auto &line : reply.bytes.split('\n')) { if (line.trimmed().isEmpty()) continue; QJsonParseError error; const auto event = QJsonDocument::fromJson(line, &error).object(); if (error.error != QJsonParseError::NoError || event.contains("error")) throw std::runtime_error("runtimeComparisonError"); text += event.value("response").toString(); if (event.value("done").toBool()) { const auto time = event.value("eval_duration").toDouble(); if (time > 0) rate = event.value("eval_count").toDouble()/time*1e9; } }
    QStringList expected, numbers; for (int i=1;i<=20;++i) expected.append(QString::number(i)); auto matches = QRegularExpression("\\b[0-9]+\\b").globalMatch(text); while (matches.hasNext()) numbers.append(matches.next().captured());
    if (numbers != expected || rate <= 0 || !std::isfinite(rate) || reply.first < 0) throw std::runtime_error("runtimeComparisonError"); return {rate,reply.first};
}
QVariantMap compareModel(const QString &model, const std::shared_ptr<std::atomic_bool> &cancel) {
    const auto name = model.mid(7); const auto previous = load().value(model).toObject(); QJsonObject resident; bool touched = false; QVariantList results; QString error;
    try {
        bool installed = false; for (const auto &value : json("tags", {}, cancel).value("models").toArray()) if (value.toObject().value("name") == name) installed = true;
        if (!installed) throw std::runtime_error("runtimeComparisonError");
        const auto running = json("ps",{},cancel).value("models").toArray(); for (const auto &value : running) { const auto item = value.toObject(); if (item.value("name") != name && item.value("model") != name) throw std::runtime_error("runtimeComparisonError"); resident = item; }
        const auto info = json("show",{{"model",name}},cancel).value("model_info").toObject(); int blocks = 0; for (auto i=info.begin();i!=info.end();++i) if (i.key().endsWith(".block_count")) blocks=i.value().toInt(); if (blocks<2 || blocks>1998) throw std::runtime_error("runtimeComparisonError");
        for (const auto &mode : {QString("gpu"),QString("hybrid")}) {
            check(cancel); const int layers = mode=="gpu" ? 999 : qMax(1,blocks/2); QVariantMap result{{"id",mode},{"profile",QVariantMap{{"layers",layers},{"context",2048}}}};
            try {
                touched = true; json("generate",{{"model",name},{"keep_alive",0},{"stream",false}},cancel); for (int i=0;i<15;++i) { check(cancel); QThread::msleep(100); }
                sample(name,layers,cancel); const auto a=sample(name,layers,cancel), b=sample(name,layers,cancel); QJsonObject measured;
                for (const auto &value : json("ps",{},cancel).value("models").toArray()) if (value.toObject().value("name")==name || value.toObject().value("model")==name) measured=value.toObject();
                const auto size=measured.value("size").toDouble(), vram=measured.value("size_vram").toDouble(); if (size<=0) throw std::runtime_error("runtimeComparisonError"); const auto percent=qMin(100.0,vram/size*100);
                if (mode=="gpu" ? percent<95 : percent<=0 || percent>=95) throw std::runtime_error("runtimeComparisonError");
                result["tokensPerSecond"]=(a.first+b.first)/2; result["firstTokenMilliseconds"]=(a.second+b.second)/2; result["gpuPercent"]=percent;
            } catch (...) { check(cancel); result["error"]="runtimeComparisonError"; }
            results.append(result);
        }
    } catch (...) { if (!cancel->load()) error="runtimeComparisonError"; }
    if (touched) try {
        const auto restore=std::make_shared<std::atomic_bool>(false); json("generate",{{"model",name},{"keep_alive",0},{"stream",false}},restore);
        if (!resident.isEmpty()) { auto profile=previous.value("selected").toObject(); QJsonObject options; if (valid(profile)) options={{"num_gpu",profile.value("layers")},{"num_ctx",profile.value("context")}}; else if (resident.contains("context_length")) options["num_ctx"]=resident.value("context_length"); json("generate",{{"model",name},{"prompt",""},{"keep_alive","30m"},{"stream",false},{"options",options}},restore); }
    } catch (...) { error="runtimeRestoreError"; }
    return {{"results",results},{"error",error},{"cancelled",cancel->load()}};
}
}
QJsonObject LocalPerformance::options(const QString &model) { const auto value=load().value(model).toObject().value("selected").toObject(); return valid(value) ? QJsonObject{{"num_gpu",value.value("layers")},{"num_ctx",value.value("context")}} : QJsonObject{}; }
void LocalPerformance::selectModel(const QString &model) { if (m_busy) return; m_model=model; m_results=load().value(model).toObject().value("results").toArray().toVariantList(); m_error.clear(); emit changed(); }
void LocalPerformance::select(const QString &mode) {
    if (m_busy || !m_model.startsWith("ollama:")) return; auto values=load(), record=values.value(m_model).toObject();
    if (mode=="auto") record.remove("selected"); else { QJsonObject profile; for (const auto &value : record.value("results").toArray()) { const auto result=value.toObject(); if (result.value("id")==mode && !result.contains("error") && result.value("tokensPerSecond").toDouble()>0) profile=result.value("profile").toObject(); } if (!valid(profile)) return; record["selected"]=profile; }
    values[m_model]=record; if (!save(values)) m_error="runtimeComparisonError"; emit changed();
}
void LocalPerformance::cancel() { if (m_cancel) m_cancel->store(true); }
void LocalPerformance::compare() {
    if (m_busy || !m_model.startsWith("ollama:") || m_model.size()>512) return; m_busy=true; exclusive.store(true); m_results.clear(); m_error.clear(); m_cancel=std::make_shared<std::atomic_bool>(false); emit changed(); const auto model=m_model; const auto cancel=m_cancel;
    auto *watcher=new QFutureWatcher<QVariantMap>(this); connect(watcher,&QFutureWatcher<QVariantMap>::finished,this,[this,watcher,model] {
        const auto result=watcher->result(); watcher->deleteLater(); m_results=result.value("results").toList(); m_error=result.value("error").toString(); m_busy=false; exclusive.store(false);
        if (!result.value("cancelled").toBool() && m_error.isEmpty()) { auto values=load(), record=values.value(model).toObject(); record["results"]=QJsonArray::fromVariantList(m_results); values[model]=record; if (!save(values)) m_error="runtimeComparisonError"; } emit changed();
    }); m_future = QtConcurrent::run([model,cancel] { return compareModel(model,cancel); }); watcher->setFuture(m_future);
}

#include "CurrencyRates.h"
#include <QRegularExpression>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QEventLoop>
#include <QTimer>
#include <QFile>
#include <QSaveFile>
#include <QFileInfo>
#include <QDir>
#include <QDateTime>
#include <QLocale>
#include <QMutex>
#include <QMutexLocker>
#include <cmath>
namespace CurrencyRates {
namespace {
bool valid(const QJsonObject &object) {
    const auto rates = object.value("rates").toObject();
    const auto updated = object.value("updated").toDouble(), fetched = object.value("fetched").toDouble();
    if (!std::isfinite(updated) || !std::isfinite(fetched) || updated > QDateTime::currentSecsSinceEpoch() + 86400) return false;
    if (rates.size() > 1000 || rates.value("USD").toDouble() != 1 || object.value("updated").toDouble() <= 0 || object.value("fetched").toDouble() <= 0 || object.value("fetched").toDouble() > QDateTime::currentSecsSinceEpoch()+60) return false;
    for (auto i = rates.begin(); i != rates.end(); ++i) if (!QRegularExpression("^[A-Z]{3}$").match(i.key()).hasMatch() || !i.value().isDouble() || !std::isfinite(i.value().toDouble()) || i.value().toDouble() <= 0) return false;
    return true;
}
}
QString convert(const QString &query, const QString &cache) {
    if (query.size() > 128) return {};
    const auto match = QRegularExpression(R"(^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s+([A-Za-z]{3})\s+(?:to|in|=)\s+([A-Za-z]{3})\s*$)", QRegularExpression::CaseInsensitiveOption).match(query);
    if (!match.hasMatch()) return {};
    bool ok; const auto amount = match.captured(1).toDouble(&ok); if (!ok || !std::isfinite(amount) || std::abs(amount) > 1e15) return {};
    static QMutex mutex; QMutexLocker locker(&mutex); static qint64 retry = 0;
    QJsonObject snapshot; QFile file(cache);
    if (file.open(QIODevice::ReadOnly) && file.size() <= 524288) { const auto value = QJsonDocument::fromJson(file.readAll()).object(); if (valid(value)) snapshot = value; }
    file.close(); const auto now = QDateTime::currentSecsSinceEpoch();
    if (now-snapshot.value("fetched").toDouble() >= 86400 && now >= retry) {
        retry = now+300; QNetworkAccessManager network; QNetworkRequest request(QUrl("https://open.er-api.com/v6/latest/USD")); request.setTransferTimeout(8000); request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
        auto *reply = network.get(request); QByteArray bytes; QEventLoop loop; QTimer timer; timer.setSingleShot(true);
        QObject::connect(reply, &QNetworkReply::readyRead, &loop, [&] { bytes += reply->readAll(); if (bytes.size() > 524288) reply->abort(); });
        QObject::connect(reply, &QNetworkReply::finished, &loop, &QEventLoop::quit); QObject::connect(&timer, &QTimer::timeout, &loop, [&] { reply->abort(); loop.quit(); }); timer.start(10000); loop.exec(); bytes += reply->readAll();
        if (reply->error() == QNetworkReply::NoError && reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt() == 200 && bytes.size() <= 524288) {
            const auto object = QJsonDocument::fromJson(bytes).object(); const QJsonObject value{{"rates", object.value("rates")}, {"updated", object.value("time_last_update_unix")}, {"fetched", double(now)}};
            if (object.value("result") == "success" && object.value("base_code") == "USD" && valid(value)) {
                snapshot = value; QDir().mkpath(QFileInfo(cache).absolutePath()); QSaveFile output(cache); const auto data = QJsonDocument(value).toJson(QJsonDocument::Compact); if (output.open(QIODevice::WriteOnly) && output.write(data) == data.size() && output.commit()) QFile::setPermissions(cache, QFileDevice::ReadOwner | QFileDevice::WriteOwner);
            }
        }
    }
    const auto from = match.captured(2).toUpper(), to = match.captured(3).toUpper(); const auto rates = snapshot.value("rates").toObject(); const auto a = rates.value(from).toDouble(), b = rates.value(to).toDouble();
    if (a <= 0 || b <= 0 || !std::isfinite(amount/a*b)) return {};
    return QLocale().toString(amount, 'g', 12) + " " + from + " = " + QLocale().toString(amount/a*b, 'g', 12) + " " + to + " · " + QLocale().toString(QDateTime::fromSecsSinceEpoch(qint64(snapshot.value("updated").toDouble())).date(), QLocale::ShortFormat);
}
}

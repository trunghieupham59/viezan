#include "LocalModelManager.h"
#include <QNetworkProxy>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSharedPointer>
#include <QTimer>
#include <cmath>

std::optional<PullStep> PullStep::parse(const QByteArray &line) {
    const auto document = QJsonDocument::fromJson(line);
    const auto value = document.object();
    if (!document.isObject() || value.contains("error")) return std::nullopt;
    const auto size = [](const QJsonValue &field) -> qint64 {
        const double bytes = field.toDouble();
        return std::isfinite(bytes) && bytes > 0 && bytes < 1e15 ? qint64(bytes) : 0;
    };
    const auto total = size(value.value("total"));
    return PullStep{value.value("status").toString("running"), qMin(size(value.value("completed")), total), total};
}

LocalModelManager::LocalModelManager(QObject *parent, QNetworkAccessManager *network)
    : QObject(parent), m_network(network ? network : new QNetworkAccessManager(this)) {
    m_network->setProxy(QNetworkProxy::NoProxy);
}
LocalModelManager::~LocalModelManager() { abortReply(); }
void LocalModelManager::abortReply() {
    if (auto *reply = m_reply.data()) {
        m_reply.clear();
        reply->disconnect(this);
        reply->abort();
        reply->deleteLater();
    }
}
void LocalModelManager::cancel() {
    abortReply();
    m_step = {"cancelled"}; emit changed();
}
void LocalModelManager::run(const QString &model, bool remove) {
    if (!m_network || busy() || model.isEmpty() || model.toUtf8().size() > 505) return;
    for (const auto c : model) if (c.category() == QChar::Other_Control) return;
    QNetworkRequest request(QUrl(QString("http://127.0.0.1:11434/api/") + (remove ? "delete" : "pull")));
    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    request.setTransferTimeout(120000); request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    const auto body = QJsonDocument(QJsonObject{{"model", model}, {"stream", !remove}}).toJson(QJsonDocument::Compact);
    auto *reply = m_network->sendCustomRequest(request, remove ? "DELETE" : "POST", body);
    m_reply = reply; m_removing = remove; m_error.clear(); m_step = {"running"};
    struct Stream { QByteArray line; bool done = false, invalid = false; };
    auto stream = QSharedPointer<Stream>::create();
    auto consume = [this, reply, stream, remove](bool eof) {
        if (m_reply != reply || stream->invalid) return;
        stream->line += reply->readAll();
        if (stream->line.size() > 1048576) { stream->invalid = true; reply->abort(); return; }
        if (remove) return;
        while (m_reply == reply && !stream->line.isEmpty()) {
            auto end = stream->line.indexOf('\n'); if (end < 0 && !eof) break;
            const auto line = end < 0 ? stream->line : stream->line.left(end);
            stream->line.remove(0, end < 0 ? stream->line.size() : end + 1);
            if (line.trimmed().isEmpty()) continue;
            const auto step = PullStep::parse(line);
            if (!step) { stream->invalid = true; reply->abort(); return; }
            m_step = *step;
            if (step->status == "success") stream->done = true;
            emit changed();
        }
    };
    connect(reply, &QNetworkReply::readyRead, this, [consume] { consume(false); });
    connect(reply, &QNetworkReply::finished, this, [this, reply, stream, consume, remove] {
        consume(true);
        if (m_reply == reply) {
            const bool success = reply->error() == QNetworkReply::NoError && reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt() == 200 && !stream->invalid && (remove || stream->done);
            m_reply = nullptr; m_step = {success ? "succeeded" : "failed"}; m_error = success ? "" : "providerError";
            emit changed(); if (success) emit completed();
        }
        reply->deleteLater();
    });
    QTimer::singleShot(86400000, reply, [reply] { if (!reply->isFinished()) reply->abort(); });
    emit changed();
}

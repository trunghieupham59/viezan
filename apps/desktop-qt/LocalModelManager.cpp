#include "LocalModelManager.h"
#include <QNetworkProxy>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSharedPointer>
#include <QTimer>
LocalModelManager::LocalModelManager(QObject *parent) : QObject(parent) { m_network.setProxy(QNetworkProxy::NoProxy); }
void LocalModelManager::cancel() {
    if (auto *reply = m_reply) { m_reply = nullptr; reply->abort(); }
    m_status = "cancelled"; emit changed();
}
void LocalModelManager::run(const QString &model, bool remove) {
    if (busy() || model.isEmpty() || model.toUtf8().size() > 505) return;
    for (const auto c : model) if (c.category() == QChar::Other_Control) return;
    QNetworkRequest request(QUrl(QString("http://127.0.0.1:11434/api/") + (remove ? "delete" : "pull")));
    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    request.setTransferTimeout(120000); request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    const auto body = QJsonDocument(QJsonObject{{"model", model}, {"stream", !remove}}).toJson(QJsonDocument::Compact);
    auto *reply = m_network.sendCustomRequest(request, remove ? "DELETE" : "POST", body);
    m_reply = reply; m_progress = -1; m_error.clear(); m_status = "running"; emit changed();
    struct Stream { QByteArray line; bool done = false, invalid = false; };
    auto stream = QSharedPointer<Stream>::create();
    auto consume = [this, reply, stream, remove](bool eof) {
        if (m_reply != reply) return;
        stream->line += reply->readAll();
        if (stream->line.size() > 1048576) { stream->invalid = true; reply->abort(); return; }
        if (remove) return;
        while (!stream->line.isEmpty()) {
            auto end = stream->line.indexOf('\n'); if (end < 0 && !eof) break;
            const auto line = end < 0 ? stream->line : stream->line.left(end);
            stream->line.remove(0, end < 0 ? stream->line.size() : end + 1);
            if (line.trimmed().isEmpty()) continue;
            QJsonParseError error; const auto document = QJsonDocument::fromJson(line, &error); const auto value = document.object();
            if (error.error != QJsonParseError::NoError || !document.isObject() || value.contains("error")) { stream->invalid = true; reply->abort(); return; }
            m_status = value.value("status").toString(); const auto total = value.value("total").toDouble();
            m_progress = total > 0 ? qBound(0.0, value.value("completed").toDouble() / total, 1.0) : -1;
            if (m_status == "success") stream->done = true;
            emit changed();
        }
    };
    connect(reply, &QNetworkReply::readyRead, this, [consume] { consume(false); });
    connect(reply, &QNetworkReply::finished, this, [this, reply, stream, consume, remove] {
        if (m_reply == reply) {
            consume(true);
            const bool success = reply->error() == QNetworkReply::NoError && reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt() == 200 && !stream->invalid && (remove || stream->done);
            m_reply = nullptr; m_status = success ? "succeeded" : "failed"; m_error = success ? "" : "providerError";
            emit changed(); if (success) emit completed();
        }
        reply->deleteLater();
    });
    QTimer::singleShot(86400000, reply, [reply] { if (!reply->isFinished()) reply->abort(); });
}

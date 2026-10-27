#include "ModelCatalog.h"
#include "CredentialStore.h"
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkProxy>
#include <QEventLoop>
#include <QTimer>
#include <QUrlQuery>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
namespace ModelCatalog {
Result fetch(const QString &provider) {
    if (!QStringList{"ollama", "lmstudio", "llamacpp", "openai", "claude", "gemini"}.contains(provider)) return {};
    const bool local = QStringList{"ollama", "lmstudio", "llamacpp"}.contains(provider);
    auto key = local ? QByteArray{} : CredentialStore::read(provider);
    if (!local && key.isEmpty()) return {};
    const auto endpoint = provider == "lmstudio" ? "http://127.0.0.1:1234/v1/models" : provider == "llamacpp" ? "http://127.0.0.1:8080/v1/models" : provider == "ollama" ? "http://127.0.0.1:11434/api/tags" : provider == "openai" ? "https://api.openai.com/v1/models" : provider == "claude" ? "https://api.anthropic.com/v1/models?limit=100" : "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000";
    QNetworkAccessManager network; if (local) network.setProxy(QNetworkProxy::NoProxy);
    Result result; QString cursor;
    for (int page = 0; page < 20; ++page) {
        QUrl url(endpoint); QUrlQuery query(url); if (!cursor.isEmpty()) query.addQueryItem(provider == "claude" ? "after_id" : "pageToken", cursor); url.setQuery(query);
        QNetworkRequest request(url); request.setTransferTimeout(30000); request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
        if (!local) request.setRawHeader(provider == "openai" ? "Authorization" : provider == "claude" ? "x-api-key" : "x-goog-api-key", provider == "openai" ? "Bearer " + key : key);
        if (provider == "claude") request.setRawHeader("anthropic-version", "2023-06-01");
        auto *reply = network.get(request); QByteArray bytes; QEventLoop loop; QTimer timer; timer.setSingleShot(true);
        QObject::connect(&timer, &QTimer::timeout, reply, &QNetworkReply::abort);
        QObject::connect(reply, &QNetworkReply::readyRead, &loop, [&] { bytes += reply->readAll(); if (bytes.size() > 4194304) reply->abort(); });
        QObject::connect(reply, &QNetworkReply::finished, &loop, &QEventLoop::quit); timer.start(60000); loop.exec(); timer.stop(); bytes += reply->readAll();
        const bool valid = reply->error() == QNetworkReply::NoError && reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt() == 200 && bytes.size() <= 4194304;
        delete reply; if (!valid) { key.fill('\0'); return {}; }
        QJsonParseError error; const auto root = QJsonDocument::fromJson(bytes, &error).object(); const auto rows = root.value(provider == "ollama" || provider == "gemini" ? "models" : "data");
        if (error.error != QJsonParseError::NoError || !rows.isArray()) { key.fill('\0'); return {}; }
        for (const auto &value : rows.toArray()) {
            const auto row = value.toObject(); auto id = row.value(provider == "ollama" || provider == "gemini" ? "name" : "id").toString();
            if (provider == "gemini") { if (!row.value("supportedGenerationMethods").toArray().contains("generateContent")) continue; if (id.startsWith("models/")) id.remove(0, 7); }
            bool safe = !id.isEmpty() && id.toUtf8().size() + provider.size() + 1 <= 512;
            for (const auto c : id) if (c.category() == QChar::Other_Control) safe = false;
            if (safe) result.models.append(provider + ":" + id);
        }
        const auto next = provider == "claude" && root.value("has_more").toBool() ? root.value("last_id").toString() : root.value("nextPageToken").toString();
        if (next.isEmpty() || next == cursor) { key.fill('\0'); result.models.removeDuplicates(); result.models.sort(); result.success = true; return result; }
        cursor = next;
    }
    key.fill('\0'); return {};
}
}

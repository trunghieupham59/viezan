#include "ImageGeneration.h"
#include "CredentialStore.h"
#include "Attachments.h"
#include <QJsonDocument>
#include <QJsonArray>
#include <QJsonObject>
#include <QUuid>
#include <QTemporaryFile>
#include <QRegularExpression>
namespace ImageGeneration {
QString imageProvider(const QString &model, const std::function<bool(const QString &)> &hasKey) {
    const auto own = model.section(':', 0, 0);
    if (QStringList{"openai", "gemini"}.contains(own) && hasKey(own)) return own;
    for (const auto &provider : {QStringLiteral("openai"), QStringLiteral("gemini")}) if (hasKey(provider)) return provider;
    return {};
}
QString imageModel(const QString &provider, const QString &selected, const QStringList &available) {
    const auto image = [&](const QString &id) { return provider == "openai" ? id.startsWith("gpt-image-") : id.contains("image") && !id.startsWith("imagen"); };
    if (image(selected)) return selected;
    QStringList listed; for (const auto &model : available) if (model.startsWith(provider + ":") && image(model.mid(provider.size() + 1))) listed << model.mid(provider.size() + 1);
    listed.sort();
    for (qsizetype i = listed.size(); i-- > 0;) if (!listed[i].contains("mini")) return listed[i];
    return !listed.isEmpty() ? listed.last() : provider == "openai" ? "gpt-image-1" : "gemini-3.1-flash-image-preview";
}
CloudProtocol::Call prepare(const QVariantMap &input) {
    // Drawn by OpenAI or Gemini: the session's provider when it can draw, otherwise any keyed one.
    const auto own = input.value("model").toString().section(':', 0, 0);
    const auto provider = imageProvider(input.value("model").toString(), [](const QString &id) { return CredentialStore::has(id); });
    if (provider.isEmpty()) return {{}, {}, "imageProviderMissing"};
    if (input.value("input").toString().toUtf8().size() > 32768) return {{}, {}, "imageError"};
    // A chosen image model is kept only when it belongs to the provider that draws.
    const auto selected = own == provider ? input.value("model").toString().section(':', 1) : QString();
    const auto model = imageModel(provider, selected, input.value("availableModels").toStringList());
    if (!QRegularExpression("^[A-Za-z0-9._-]+$").match(model).hasMatch()) return {{}, {}, "imageError"};
    auto key = CredentialStore::read(provider); if (key.isEmpty()) return {{}, {}, "providerMissingKey"};
    QVariantList images; for (const auto &value : input.value("messages").toList()) if (value.toMap().value("role") == "user") images = value.toMap().value("images").toList();
    if (images.size() > 4) return {{}, {}, "imageError"}; QNetworkRequest request; QByteArray body;
    if (provider == "gemini") {
        request.setUrl(QUrl("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent")); request.setRawHeader("x-goog-api-key", key); request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
        QJsonArray parts{QJsonObject{{"text", input.value("input").toString()}}};
        for (const auto &value : images) { const auto image = value.toMap(); const auto bytes = Attachments::data(image); if (bytes.isEmpty()) return {{}, {}, "imageError"}; parts.append(QJsonObject{{"inlineData", QJsonObject{{"mimeType", image.value("mime").toString()}, {"data", QString::fromLatin1(bytes.toBase64())}}}}); }
        body = QJsonDocument(QJsonObject{{"contents", QJsonArray{QJsonObject{{"role", "user"}, {"parts", parts}}}}, {"generationConfig", QJsonObject{{"responseModalities", QJsonArray{"TEXT", "IMAGE"}}}}}).toJson(QJsonDocument::Compact);
    } else {
        request.setUrl(QUrl("https://api.openai.com/v1/images/" + QString(images.isEmpty() ? "generations" : "edits"))); request.setRawHeader("Authorization", "Bearer " + key);
        if (images.isEmpty()) {
            request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json"); body = QJsonDocument(QJsonObject{{"model", model}, {"prompt", input.value("input").toString()}, {"n", 1}, {"size", "auto"}, {"quality", "auto"}}).toJson(QJsonDocument::Compact);
        } else {
            const auto boundary = QUuid::createUuid().toByteArray(QUuid::WithoutBraces); request.setHeader(QNetworkRequest::ContentTypeHeader, "multipart/form-data; boundary=" + boundary);
            const QMap<QString, QString> fields{{"model", model}, {"prompt", input.value("input").toString()}, {"n", "1"}, {"size", "auto"}, {"quality", "auto"}};
            for (auto it = fields.cbegin(); it != fields.cend(); ++it) body += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + it.key().toUtf8() + "\"\r\n\r\n" + it.value().toUtf8() + "\r\n";
            for (const auto &value : images) { const auto image = value.toMap(); const auto bytes = Attachments::data(image); if (bytes.isEmpty()) return {{}, {}, "imageError"}; const auto mime = image.value("mime").toString().toUtf8(); const auto ext = mime == "image/jpeg" ? "jpg" : mime == "image/webp" ? "webp" : "png"; body += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"image[]\"; filename=\"image." + ext + "\"\r\nContent-Type: " + mime + "\r\n\r\n" + bytes + "\r\n"; }
            body += "--" + boundary + "--\r\n";
        }
    }
    key.fill('\0'); request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy); request.setTransferTimeout(300000);
    return {request, body, {}, "image:" + provider};
}
QVariantList decode(const QByteArray &response, const QString &provider) {
    const auto object = QJsonDocument::fromJson(response).object(); QList<QPair<QString, QString>> encoded;
    if (provider == "openai") { for (const auto &value : object.value("data").toArray()) encoded.append({value.toObject().value("b64_json").toString(), "image/png"}); }
    else { for (const auto &candidate : object.value("candidates").toArray()) for (const auto &value : candidate.toObject().value("content").toObject().value("parts").toArray()) { const auto data = value.toObject().value("inlineData").toObject(); if (!data.isEmpty()) encoded.append({data.value("data").toString(), data.value("mimeType").toString()}); } }
    if (encoded.isEmpty() || encoded.size() > 4) return {}; QVariantList result;
    for (const auto &item : encoded) {
        const auto bytes = QByteArray::fromBase64(item.first.toLatin1(), QByteArray::AbortOnBase64DecodingErrors);
        if (bytes.isEmpty() || bytes.size() > 20000000 || !QStringList{"image/png", "image/jpeg", "image/webp"}.contains(item.second)) return {};
        QTemporaryFile file; if (!file.open() || file.write(bytes) != bytes.size() || !file.flush()) return {}; const auto path = file.fileName(); file.close();
        const auto image = Attachments::ingest(QUrl::fromLocalFile(path)); if (image.isEmpty()) return {}; result.append(image);
    }
    return result;
}
}

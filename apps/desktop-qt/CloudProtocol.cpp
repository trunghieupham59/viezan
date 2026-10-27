#include "CloudProtocol.h"
#include "CredentialStore.h"
#include "Attachments.h"
#include <QJsonDocument>
#include <QFile>
#include <QJsonObject>
#include <QRegularExpression>
namespace CloudProtocol {
Call prepare(const QVariantMap &input, const QJsonArray &messages) {
    const auto modelID = input.value("model").toString();
    const auto separator = modelID.indexOf(':');
    const auto provider = modelID.left(separator), model = modelID.mid(separator + 1);
    const bool local = provider == "lmstudio" || provider == "llamacpp";
    if (!local && !QStringList{"openai", "claude", "gemini"}.contains(provider)) return {{}, {}, "providerInvalidResponse"};
    auto key = local ? QByteArray{} : CredentialStore::read(provider);
    if (!local && key.isEmpty()) return {{}, {}, "providerMissingKey"};
    QStringList system;
    QJsonArray conversation;
    for (const auto &message : messages) {
        const auto object = message.toObject();
        if (object.value("role") == "system") system.append(object.value("content").toString());
        else conversation.append(object);
    }
    QJsonArray encoded;
    for (const auto &value : messages) {
        auto object = value.toObject(); QJsonArray parts;
        const auto text = object.value("content").toString();
        if (provider == "gemini") parts.append(QJsonObject{{"text", text}});
        else parts.append(QJsonObject{{"type", "text"}, {"text", text}});
        for (const auto &value : object.value("images").toArray()) {
            const auto image = value.toObject(); const auto bytes = Attachments::data(image.toVariantMap());
            if (bytes.isEmpty()) { key.fill('\0'); return {{}, {}, "imageError"}; }
            const auto base64 = QString::fromLatin1(bytes.toBase64()); const auto mime = image.value("mime").toString();
            if (provider == "gemini") parts.append(QJsonObject{{"inlineData", QJsonObject{{"mimeType", mime}, {"data", base64}}}});
            else if (provider == "claude") parts.append(QJsonObject{{"type", "image"}, {"source", QJsonObject{{"type", "base64"}, {"media_type", mime}, {"data", base64}}}});
            else parts.append(QJsonObject{{"type", "image_url"}, {"image_url", QJsonObject{{"url", "data:" + mime + ";base64," + base64}}}});
        }
        object.remove("images");
        if (provider == "gemini") object["parts"] = parts;
        else if (parts.size() > 1) object["content"] = parts;
        encoded.append(object);
    }
    conversation = {};
    for (const auto &value : encoded) if (value.toObject().value("role") != "system") conversation.append(value);
    QJsonObject body;
    QString endpoint;
    if (provider == "claude") {
        endpoint = "https://api.anthropic.com/v1/messages";
        body = {{"model", model}, {"max_tokens", 8192}, {"stream", true}, {"system", system.join("\n\n")}, {"messages", conversation}};
    } else if (provider == "gemini") {
        if (!QRegularExpression("^[A-Za-z0-9._-]+$").match(model).hasMatch()) { key.fill('\0'); return {{}, {}, "providerInvalidResponse"}; }
        endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":streamGenerateContent?alt=sse";
        QJsonArray contents;
        for (const auto &message : conversation) {
            const auto object = message.toObject();
            contents.append(QJsonObject{{"role", object.value("role") == "assistant" ? "model" : "user"}, {"parts", object.value("parts")}});
        }
        body = {{"contents", contents}};
        if (!system.isEmpty()) body["systemInstruction"] = QJsonObject{{"parts", QJsonArray{QJsonObject{{"text", system.join("\n\n")}}}}};
    } else {
        endpoint = provider == "lmstudio" ? "http://127.0.0.1:1234/v1/chat/completions" : provider == "llamacpp" ? "http://127.0.0.1:8080/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
        body = {{"model", model}, {"stream", true}, {"stream_options", QJsonObject{{"include_usage", true}}}, {"messages", encoded}};
    }
    const auto effort = input.value("reasoningEffort", "auto").toString();
    if (QStringList{"low", "medium", "high"}.contains(effort)) {
        QFile resource(":/qml/native.json"); resource.open(QIODevice::ReadOnly);
        const auto policy = QJsonDocument::fromJson(resource.readAll()).object().value("reasoningPolicy").toObject();
        const auto supports = [&](const QString &family) { const auto pattern=policy.value(family).toString(); return !pattern.isEmpty() && QRegularExpression(pattern, QRegularExpression::CaseInsensitiveOption).match(model).hasMatch(); };
        if (provider == "openai" && supports("openai")) body["reasoning_effort"] = effort;
        if (provider == "claude" && supports("claude")) { body["thinking"] = QJsonObject{{"type", "adaptive"}}; body["output_config"] = QJsonObject{{"effort", effort}}; }
        if (provider == "gemini") {
            QJsonObject thinking;
            if (supports("geminiLevel")) thinking["thinkingLevel"] = effort;
            else if (supports("geminiBudget")) thinking["thinkingBudget"] = effort == "low" ? 1024 : effort == "medium" ? 8192 : 24576;
            if (!thinking.isEmpty()) body["generationConfig"] = QJsonObject{{"thinkingConfig", thinking}};
        }
    }
    QNetworkRequest request{QUrl(endpoint)};
    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    request.setTransferTimeout(120000);
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    request.setRawHeader("Accept", "text/event-stream");
    if (provider == "claude") { request.setRawHeader("x-api-key", key); request.setRawHeader("anthropic-version", "2023-06-01"); }
    else if (provider == "gemini") request.setRawHeader("x-goog-api-key", key);
    else if (!local) request.setRawHeader("Authorization", "Bearer " + key);
    key.fill('\0');
    return {request, QJsonDocument(body).toJson(QJsonDocument::Compact), {}};
}
Event decode(const QString &provider, const QByteArray &data, bool successfulFinish) {
    Event result; result.successfulFinish = successfulFinish;
    if (data == "[DONE]") { result.done = successfulFinish; if (!successfulFinish) result.error = "providerInvalidResponse"; return result; }
    QJsonParseError error;
    const auto document = QJsonDocument::fromJson(data, &error);
    const auto object = document.object();
    if (error.error != QJsonParseError::NoError || !document.isObject() || object.contains("error")) { result.error = "providerInvalidResponse"; return result; }
    auto usage = object.value("usageMetadata").toObject();
    if (usage.isEmpty()) usage = object.value("usage").toObject();
    if (usage.isEmpty()) usage = object.value("message").toObject().value("usage").toObject();
    for (const auto &key : {"prompt_tokens", "input_tokens", "promptTokenCount"}) if (usage.contains(key)) result.usage["input"] = usage.value(key).toInt(-1);
    for (const auto &key : {"completion_tokens", "output_tokens", "candidatesTokenCount"}) if (usage.contains(key)) result.usage["output"] = usage.value(key).toInt(-1);
    if (provider == "claude") {
        const auto type = object.value("type").toString();
        const auto delta = object.value("delta").toObject();
        if (type == "content_block_delta" && delta.value("type") == "text_delta") result.text = delta.value("text").toString();
        if (type == "message_delta" && delta.contains("stop_reason")) {
            const auto reason = delta.value("stop_reason").toString();
            if (reason != "end_turn" && reason != "stop_sequence") result.error = "providerTruncated";
            else result.successfulFinish = true;
        }
        if (type == "message_stop") { result.done = result.successfulFinish; if (!result.done) result.error = "providerInvalidResponse"; }
    } else if (provider == "gemini") {
        const auto candidates = object.value("candidates").toArray();
        if (candidates.isEmpty()) { if (object.contains("promptFeedback")) result.error = "providerInvalidResponse"; return result; }
        const auto candidate = candidates.first().toObject();
        for (const auto &part : candidate.value("content").toObject().value("parts").toArray())
            if (!part.toObject().value("thought").toBool()) result.text += part.toObject().value("text").toString();
        if (candidate.contains("finishReason")) {
            if (candidate.value("finishReason") == "STOP") { result.done = true; result.successfulFinish = true; }
            else result.error = "providerTruncated";
        }
    } else {
        const auto choices = object.value("choices").toArray();
        if (choices.isEmpty()) return result;
        const auto choice = choices.first().toObject();
        result.text = choice.value("delta").toObject().value("content").toString();
        if (choice.value("finish_reason").isString()) {
            if (choice.value("finish_reason") == "stop") result.successfulFinish = true;
            else result.error = "providerTruncated";
        }
    }
    return result;
}
}

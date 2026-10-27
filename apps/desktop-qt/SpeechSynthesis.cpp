#include "SpeechSynthesis.h"
#include "CredentialStore.h"
#include <QJsonObject>
#include <QJsonArray>
#include <QJsonDocument>
#include <QRegularExpression>
#include <QtEndian>
namespace SpeechSynthesis {
CloudProtocol::Call prepare(const QString &text, const QString &provider, const QString &voice) {
    if (text.trimmed().isEmpty() || text.toUcs4().size() > 5000 || !QStringList{"openai", "gemini", "elevenlabs"}.contains(provider)) return {{}, {}, "providerInvalidResponse"};
    const auto selected = voice.isEmpty() ? (provider == "gemini" ? QString("Aoede") : provider == "elevenlabs" ? QString("pNInz6obpgDQGcFmaJgB") : QString("alloy")) : voice;
    if (!QRegularExpression("^[A-Za-z0-9_-]{1,100}$").match(selected).hasMatch()) return {{}, {}, "providerInvalidResponse"};
    auto key = CredentialStore::read(provider); if (key.isEmpty()) return {{}, {}, "providerMissingKey"};
    const auto endpoint = provider == "gemini" ? QString("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent") : provider == "elevenlabs" ? "https://api.elevenlabs.io/v1/text-to-speech/" + selected : QString("https://api.openai.com/v1/audio/speech");
    QNetworkRequest request{QUrl(endpoint)}; request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json"); request.setTransferTimeout(60000); request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    request.setRawHeader(provider == "gemini" ? "x-goog-api-key" : provider == "elevenlabs" ? "xi-api-key" : "Authorization", provider == "openai" ? "Bearer " + key : key); key.fill('\0');
    QJsonObject body;
    if (provider == "gemini") {
        const QJsonObject voiceConfig{{"prebuiltVoiceConfig", QJsonObject{{"voiceName", selected}}}};
        const QJsonObject generation{{"responseModalities", QJsonArray{"AUDIO"}}, {"speechConfig", QJsonObject{{"voiceConfig", voiceConfig}}}};
        const QJsonArray parts{QJsonObject{{"text", text}}};
        body = {{"contents", QJsonArray{QJsonObject{{"parts", parts}}}}, {"generationConfig", generation}};
    }
    else if (provider == "elevenlabs") body = {{"text", text}, {"model_id", "eleven_multilingual_v2"}};
    else body = {{"model", "tts-1"}, {"input", text}, {"voice", selected}, {"response_format", "mp3"}};
    return {request, QJsonDocument(body).toJson(QJsonDocument::Compact), {}, provider};
}
QByteArray decode(const QByteArray &data, const QString &provider) {
    if (data.isEmpty() || data.size() > 16777216) return {};
    if (provider != "gemini") return data;
    const auto candidates = QJsonDocument::fromJson(data).object().value("candidates").toArray(); if (candidates.isEmpty()) return {};
    for (const auto &part : candidates.first().toObject().value("content").toObject().value("parts").toArray()) {
        const auto value = part.toObject().value("inlineData").toObject(); if (value.isEmpty()) continue;
        const auto bytes = QByteArray::fromBase64(value.value("data").toString().toLatin1(), QByteArray::AbortOnBase64DecodingErrors); const auto mime = value.value("mimeType").toString();
        if (bytes.isEmpty()) return {}; if (mime.startsWith("audio/wav")) return bytes;
        if ((!mime.startsWith("audio/L16") && !mime.startsWith("audio/pcm")) || !mime.contains("rate=24000") || bytes.size() % 2) return {};
        QByteArray wave("RIFF"); auto u32 = [&wave](quint32 value) { const auto number = qToLittleEndian(value); wave.append(reinterpret_cast<const char *>(&number), 4); }; auto u16 = [&wave](quint16 value) { const auto number = qToLittleEndian(value); wave.append(reinterpret_cast<const char *>(&number), 2); };
        u32(quint32(bytes.size() + 36)); wave += "WAVEfmt "; u32(16); u16(1); u16(1); u32(24000); u32(48000); u16(2); u16(16); wave += "data"; u32(quint32(bytes.size())); wave += bytes; return wave;
    }
    return {};
}
}

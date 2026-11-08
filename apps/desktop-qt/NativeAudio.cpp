#include "NativeAudio.h"
#include "CredentialStore.h"
#include "SpeechSynthesis.h"
#include "LanguageSegments.h"
#include <QCoreApplication>
#include <QPermissions>
#include <QMediaFormat>
#include <QFile>
#include <QJsonDocument>
#include <QJsonArray>
#include <QJsonObject>
#include <QUuid>
#include <QTimer>
#include <QSharedPointer>
#include <QRegularExpression>
#include <QDateTime>
#include <QFutureWatcher>
#include <QtConcurrent/QtConcurrent>
#ifdef Q_OS_WIN
#include <QSettings>
#endif

NativeAudio::NativeAudio(QObject *parent) : QObject(parent) {
    m_player.setAudioOutput(&m_output);
    connect(&m_player, &QMediaPlayer::mediaStatusChanged, this, [this](QMediaPlayer::MediaStatus status) { if (status == QMediaPlayer::EndOfMedia && m_speaking) nextVoiceChunk(); });
    connect(&m_player, &QMediaPlayer::errorOccurred, this, [this](QMediaPlayer::Error, const QString &) { if (m_speaking) { silence(); m_error = "audioError"; emit changed(); } });
    connect(&m_speech, &QTextToSpeech::stateChanged, this, [this](QTextToSpeech::State state) { if (m_activeProvider == "system") { m_speaking = state == QTextToSpeech::Speaking || state == QTextToSpeech::Paused; if (!m_speaking) m_speakingSource.clear(); emit changed(); } });
    m_capture.setAudioInput(&m_input); m_capture.setRecorder(&m_recorder);
    connect(&m_recorder, &QMediaRecorder::recorderStateChanged, this, [this](QMediaRecorder::RecorderState state) {
        if (state == QMediaRecorder::RecordingState) m_recordingStarted = QDateTime::currentMSecsSinceEpoch() / 1000.0;
        emit changed(); if (state == QMediaRecorder::StoppedState && m_transcribeRequested) transcribe();
    });
    connect(&m_recorder, &QMediaRecorder::errorOccurred, this, [this](QMediaRecorder::Error, const QString &) {
        m_error = "audioError"; m_transcribeRequested = false; m_owner.clear(); cleanup(); emit changed();
    });
    connect(&m_speech, &QTextToSpeech::errorOccurred, this, [this](QTextToSpeech::ErrorReason, const QString &) { m_error = "audioError"; emit changed(); });
}
NativeAudio::~NativeAudio() { cancel(); }
void NativeAudio::start(const QString &owner, const QString &language) {
    if (recording() || busy()) return;
    silence(); m_language = language;
    const auto generation = ++m_generation;
    m_startPending = true; m_error.clear(); emit changed();
    const auto begin = [this, owner, generation] {
        if (generation != m_generation) return;
        m_startPending = false;
        if (!m_directory.isValid()) { m_error = "audioError"; emit changed(); return; }
        m_owner = owner; m_file = m_directory.filePath(QUuid::createUuid().toString(QUuid::WithoutBraces) + ".wav");
        QMediaFormat format(QMediaFormat::Wave); format.setAudioCodec(QMediaFormat::AudioCodec::Wave);
        m_recorder.setMediaFormat(format); m_recorder.setAudioChannelCount(1); m_recorder.setAudioSampleRate(44100);
        m_recorder.setOutputLocation(QUrl::fromLocalFile(m_file)); m_recorder.record(); emit changed();
    };
    QMicrophonePermission permission;
    const auto state = microphonePermissionStatus();
    if (state == "denied") { m_startPending = false; m_error = "microphoneDenied"; emit changed(); }
    else if (state == "granted") begin();
    else qApp->requestPermission(permission, this, [this, begin, generation](const QPermission &result) {
        if (generation != m_generation) return;
        if (result.status() == Qt::PermissionStatus::Granted) begin();
        else { m_startPending = false; m_error = "microphoneDenied"; emit changed(); }
    });
}
void NativeAudio::stop(const QString &provider) {
    if (!recording()) return;
    prepareCandidates(provider); m_transcribeRequested = true; m_recorder.stop();
}
QString NativeAudio::transcriptionModel(const QStringList &available) {
    for (const auto &model : {QStringLiteral("gpt-4o-transcribe"), QStringLiteral("gpt-4o-mini-transcribe")}) if (available.contains("openai:" + model)) return model;
    return "whisper-1";
}
static CloudProtocol::Call prepareSpeech(const QString &path, const QString &provider, const QString &language, const QString &openaiModel) {
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly) || file.size() <= 0 || file.size() > 25000000 || !QStringList{"openai", "groq", "gemini"}.contains(provider)) {
        return {{}, {}, "audioError"};
    }
    const auto audio = file.readAll(); file.close();
    auto key = CredentialStore::read(provider);
    if (key.isEmpty()) return {{}, {}, "providerMissingKey"};
    const auto endpoint = provider == "groq" ? "https://api.groq.com/openai/v1/audio/transcriptions" : provider == "gemini" ? "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" : "https://api.openai.com/v1/audio/transcriptions";
    QNetworkRequest request{QUrl(endpoint)};
    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy); request.setTransferTimeout(180000);
    QByteArray body;
    if (provider == "gemini") {
        request.setRawHeader("x-goog-api-key", key); request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
        QJsonArray parts{QJsonObject{{"text", "Transcribe this audio faithfully in its original language. Return only the transcript." + (language == "auto" ? QString{} : " The source language is " + language + ".")}}, QJsonObject{{"inlineData", QJsonObject{{"mimeType", "audio/wav"}, {"data", QString::fromLatin1(audio.toBase64())}}}}};
        body = QJsonDocument(QJsonObject{{"contents", QJsonArray{QJsonObject{{"parts", parts}}}}}).toJson(QJsonDocument::Compact);
    } else {
        request.setRawHeader("Authorization", "Bearer " + key);
        const auto boundary = QUuid::createUuid().toByteArray(QUuid::WithoutBraces);
        request.setHeader(QNetworkRequest::ContentTypeHeader, "multipart/form-data; boundary=" + boundary);
        body = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\n" + (provider == "groq" ? QByteArray("whisper-large-v3-turbo") : openaiModel.toUtf8()) + "\r\n--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"recording.wav\"\r\nContent-Type: audio/wav\r\n\r\n" + audio + "\r\n--" + boundary + "--\r\n";
    }
    if (provider != "gemini" && language != "auto" && QRegularExpression("^[a-z]{2,3}(-[A-Za-z]{2,4})?$").match(language).hasMatch()) {
        const auto boundary = request.header(QNetworkRequest::ContentTypeHeader).toString().section("boundary=",1).toUtf8();
        body.prepend("--" + boundary + "\r\nContent-Disposition: form-data; name=\"language\"\r\n\r\n" + language.section('-',0,0).toUtf8() + "\r\n");
    }
    key.fill('\0');
    return {request, body, {}};
}
void NativeAudio::transcribe() {
    m_transcribeRequested = false; m_startPending = true; emit changed();
    const auto generation = m_generation; const auto provider = m_provider; const auto path = m_file; const auto language = m_language;
    auto *watcher = new QFutureWatcher<CloudProtocol::Call>(this);
    connect(watcher, &QFutureWatcher<CloudProtocol::Call>::finished, this, [this, watcher, generation, provider] {
        const auto call = watcher->result(); watcher->deleteLater(); if (generation != m_generation) return;
        m_startPending = false;
        if (!call.error.isEmpty()) { speechFailed(call.error); return; }
        dispatchSpeech(call, provider);
    });
    watcher->setFuture(QtConcurrent::run([path, provider, language, model = transcriptionModel(m_availableModels)] { return prepareSpeech(path, provider, language, model); }));
}
void NativeAudio::dispatchSpeech(const CloudProtocol::Call &call, const QString &provider) {
    auto *reply = m_network.post(call.request, call.body); m_reply = reply;
    const auto owner = m_owner; const auto generation = m_generation;
    const auto buffer = QSharedPointer<QByteArray>::create();
    connect(reply, &QNetworkReply::readyRead, this, [reply, buffer] { buffer->append(reply->readAll()); if (buffer->size() > 1048576) reply->abort(); });
    connect(reply, &QNetworkReply::finished, this, [this, reply, owner, generation, buffer, provider] {
        reply->deleteLater(); if (generation != m_generation) return;
        m_reply = nullptr; buffer->append(reply->readAll());
        QString text;
        const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        if (reply->error() == QNetworkReply::NoError && status == 200 && buffer->size() <= 1048576) {
            const auto object = QJsonDocument::fromJson(*buffer).object();
            if (provider == "gemini") {
                const auto candidates = object.value("candidates").toArray();
                if (!candidates.isEmpty() && candidates.first().toObject().value("finishReason") == "STOP")
                    for (const auto &part : candidates.first().toObject().value("content").toObject().value("parts").toArray()) text += part.toObject().value("text").toString();
            } else text = object.value("text").toString();
        }
        if (text.trimmed().isEmpty()) { speechFailed(status == 401 || status == 403 ? "providerAuthError" : status == 429 ? "providerRateLimit" : "audioError"); return; }
        cleanup(); m_owner.clear(); m_speechCandidates.clear(); emit transcribed(owner, text);
        emit changed();
    });
    QTimer::singleShot(180000, reply, [reply] { if (!reply->isFinished()) reply->abort(); });
    emit changed();
}
void NativeAudio::cleanup() { if (!m_file.isEmpty()) QFile::remove(m_file); m_file.clear(); }
void NativeAudio::cancel() {
    ++m_generation; m_startPending = false; m_transcribeRequested = false; m_recorder.stop();
    if (m_reply) { m_reply->disconnect(this); m_reply->abort(); m_reply->deleteLater(); m_reply = nullptr; }
    m_owner.clear(); m_speechCandidates.clear(); cleanup(); silence(); emit changed();
}
QString NativeAudio::microphonePermission() const {
    return microphonePermissionStatus();
}
#ifdef VIEZAN_CONTRACT_FIXTURE
static QString microphonePermissionOverride;
void NativeAudio::setMicrophonePermissionForTest(const QString &status) {
    Q_ASSERT((status.isEmpty() || QStringList{"granted", "denied", "undetermined"}.contains(status)));
    microphonePermissionOverride = status;
}
#endif
QString NativeAudio::microphonePermissionStatus() {
#ifdef VIEZAN_CONTRACT_FIXTURE
    if (!microphonePermissionOverride.isEmpty()) return microphonePermissionOverride;
#endif
#ifdef Q_OS_WIN
    // Qt 6.8 has no Windows permission backend. Desktop (unpackaged) apps
    // do not prompt for per-app permission: any explicit Deny wins. Missing
    // keys/values do not deny access. New read-only QSettings on every call
    // makes Check again observe changes; never enumerate per-app usage keys.
    const QString path = "\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone";
    for (const auto &key : {"HKEY_LOCAL_MACHINE" + path, "HKEY_CURRENT_USER" + path, "HKEY_CURRENT_USER" + path + "\\NonPackaged"}) {
        const QSettings consent(key, QSettings::NativeFormat);
        if (consent.value("Value").toString().compare("Deny", Qt::CaseInsensitive) == 0) return "denied";
    }
    return "granted";
#else
    switch (qApp->checkPermission(QMicrophonePermission{})) {
    case Qt::PermissionStatus::Granted: return "granted";
    case Qt::PermissionStatus::Denied: return "denied";
    default: return "undetermined";
    }
#endif
}
QVariantList NativeAudio::voiceList() const {
    QVariantList values; for (const auto &voice : m_speech.availableVoices()) values.append(QVariantMap{{"name", voice.name()}, {"language", voice.locale().name()}});
    return values;
}
static QString languageBase(const QString &code) { return code.section(QRegularExpression("[-_]"), 0, 0).toLower(); }
QString NativeAudio::voiceFor(const QString &language) const {
    if (m_voiceProvider != "system") return {};
    for (const auto &voice : m_speech.availableVoices()) if (voice.name() == m_voiceID && languageBase(voice.locale().name()) == languageBase(language)) return voice.name();
    for (const auto &voice : m_speech.findVoices(QLocale(language))) return voice.name();
    return {};
}
QStringList NativeAudio::voices() const { QStringList values; for (const auto &voice : m_speech.availableVoices()) values.append(voice.name()); return values; }
void NativeAudio::configureVoice(const QString &provider, const QString &voice, double rate) {
    if (!QStringList{"system", "edge", "openai", "gemini", "elevenlabs"}.contains(provider) || voice.toUtf8().size() > 256) return;
    if (!std::isfinite(rate) || rate < 0.5 || rate > 2) rate = 1;
    if (provider == m_voiceProvider && voice == m_voiceID && qFuzzyCompare(rate, m_voiceRate)) return;
    silence(); m_voiceProvider = provider; m_voiceID = voice; m_voiceRate = rate;
}
void NativeAudio::speak(const QString &text, const QString &language, const QString &source, const QString &provider) {
    silence(); if (text.isEmpty() || text.toUtf8().size() > 100000) return;
    if (!provider.isEmpty() && !QStringList{"system", "edge", "openai", "gemini", "elevenlabs"}.contains(provider)) return;
    m_error.clear(); m_speaking = true; m_voiceLanguage = language; m_speakingSource = source; m_lastSource = source;
    m_activeProvider = provider.isEmpty() ? m_voiceProvider : provider;
    if (m_activeProvider == "system") {
        // A one-off system reading uses the language's default voice, not the chosen cloud voice.
        // The chosen voice reads its own language only; other languages use the language's default.
        m_speech.setLocale(QLocale(language));
        if (provider.isEmpty()) for (const auto &voice : m_speech.availableVoices()) if (voice.name() == m_voiceID && languageBase(voice.locale().name()) == languageBase(language)) { m_speech.setVoice(voice); break; }
        // QTextToSpeech rate is -1…1 around normal (0); the multiplier 0.5–2 maps onto it.
        m_speech.setRate(qBound(-1.0, m_voiceRate >= 1 ? m_voiceRate - 1 : (m_voiceRate - 1) * 2, 1.0));
        m_speech.say(text); emit changed(); return;
    }
    m_preparing = true; m_voiceQueue = LanguageSegments::chunks(text, 3000); nextVoiceChunk(); emit changed();
}
void NativeAudio::silence() {
    if (m_edge) { m_edge->disconnect(this); m_edge->cancel(); m_edge->deleteLater(); m_edge = nullptr; }
    ++m_voiceGeneration; m_speaking = false; m_preparing = false; m_speakingSource.clear(); m_voiceQueue.clear(); m_speech.stop(); m_player.stop(); m_player.setSource(QUrl()); m_voiceBuffer.close();
    if (m_voiceReply) { m_voiceReply->disconnect(this); m_voiceReply->abort(); m_voiceReply->deleteLater(); m_voiceReply = nullptr; }
    emit changed();
}
void NativeAudio::nextVoiceChunk() {
    m_player.stop(); m_player.setSource(QUrl()); m_voiceBuffer.close();
    if (m_voiceQueue.isEmpty()) { m_speaking = false; m_preparing = false; m_speakingSource.clear(); emit changed(); return; }
    const auto text = m_voiceQueue.takeFirst(), provider = m_activeProvider, voice = m_voiceID; const auto generation = m_voiceGeneration;
    const auto rate = rateSupported(provider) ? m_voiceRate : 1.0;
    if (provider == "edge") {
        auto *edge = new EdgeSpeech(this); m_edge = edge;
        connect(edge, &EdgeSpeech::finished, this, [this, edge, generation](const QByteArray &audio) {
            if (generation != m_voiceGeneration || m_edge != edge) return;
            m_edge = nullptr; edge->deleteLater(); m_voiceBuffer.setData(audio); m_voiceBuffer.open(QIODevice::ReadOnly); m_player.setSourceDevice(&m_voiceBuffer, QUrl("speech.mp3")); m_player.play(); m_preparing = false; emit changed();
        });
        connect(edge, &EdgeSpeech::failed, this, [this, generation] { if (generation == m_voiceGeneration) { silence(); m_error = "audioError"; emit changed(); } });
        edge->start(text, m_voiceLanguage, voice, rate); return;
    }
    auto *watcher = new QFutureWatcher<CloudProtocol::Call>(this);
    connect(watcher, &QFutureWatcher<CloudProtocol::Call>::finished, this, [this, watcher, generation, provider] {
        const auto call = watcher->result(); watcher->deleteLater(); if (generation != m_voiceGeneration) return;
        if (!call.error.isEmpty()) { silence(); m_error = call.error; emit changed(); return; }
        auto *reply = m_network.post(call.request, call.body); m_voiceReply = reply; auto bytes = QSharedPointer<QByteArray>::create();
        connect(reply, &QNetworkReply::readyRead, this, [reply, bytes] { *bytes += reply->readAll(); if (bytes->size() > 16777216) reply->abort(); });
        connect(reply, &QNetworkReply::finished, this, [this, reply, bytes, generation, provider] {
            reply->deleteLater(); if (generation != m_voiceGeneration || m_voiceReply != reply) return; m_voiceReply = nullptr; *bytes += reply->readAll();
            const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
            if (status != 200 || reply->error() != QNetworkReply::NoError) { silence(); m_error = status == 401 || status == 403 ? "providerAuthError" : status == 429 ? "providerRateLimit" : "audioError"; emit changed(); return; }
            const auto audio = SpeechSynthesis::decode(*bytes, provider); if (audio.isEmpty()) { silence(); m_error = "audioError"; emit changed(); return; }
            m_voiceBuffer.setData(audio); m_voiceBuffer.open(QIODevice::ReadOnly); m_player.setSourceDevice(&m_voiceBuffer, QUrl(provider == "gemini" ? "speech.wav" : "speech.mp3")); m_player.play(); m_preparing = false; emit changed();
        });
        QTimer::singleShot(180000, reply, [reply] { if (!reply->isFinished()) reply->abort(); });
    });
    watcher->setFuture(QtConcurrent::run([text, provider, voice, rate] { return SpeechSynthesis::prepare(text, provider, voice, rate); }));
}

void NativeAudio::transcribeFile(const QString &owner, const QString &path, const QString &provider, const QString &language) {
    if (recording() || busy()) return;
    ++m_generation; m_error.clear(); m_owner = owner; m_language = language; prepareCandidates(provider);
    m_file = m_directory.filePath(QUuid::createUuid().toString(QUuid::WithoutBraces) + ".wav");
    if (!m_directory.isValid() || !QFile::copy(path, m_file)) { m_error = "audioError"; cleanup(); m_owner.clear(); emit changed(); return; }
    transcribe();
}

void NativeAudio::prepareCandidates(const QString &provider) {
    m_speechCandidates = provider == "auto" ? QStringList{"openai", "gemini", "groq"} : QStringList{provider};
    m_provider = m_speechCandidates.takeFirst();
}
void NativeAudio::speechFailed(const QString &error) {
    if (!m_speechCandidates.isEmpty()) { m_provider = m_speechCandidates.takeFirst(); transcribe(); return; }
    m_error = error; m_startPending = false; cleanup(); m_owner.clear(); emit changed();
}

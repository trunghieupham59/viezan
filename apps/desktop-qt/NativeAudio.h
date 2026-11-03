#pragma once
#include <QObject>
#include "CloudProtocol.h"
#include "EdgeSpeech.h"
#include <QAudioInput>
#include <QMediaCaptureSession>
#include <QMediaRecorder>
#include <QTextToSpeech>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QTemporaryDir>
#include <QMediaPlayer>
#include <QAudioOutput>
#include <QBuffer>

class NativeAudio final : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool speaking READ speaking NOTIFY changed)
    // Which text is being read (the caller's source id), so every speaker control shows the same state.
    Q_PROPERTY(QString speakingSource READ speakingSource NOTIFY changed)
    // The source last asked to read; kept after a failure so "Read with the system voice" can retry it.
    Q_PROPERTY(QString lastSource READ lastSource NOTIFY changed)
    // A cloud voice is being generated: reading has started but no audio plays yet.
    Q_PROPERTY(bool preparing READ preparing NOTIFY changed)
    Q_PROPERTY(QStringList voices READ voices NOTIFY changed)
    // System voices with their language ({name, language}), for grouping by language.
    Q_PROPERTY(QVariantList voiceList READ voiceList NOTIFY changed)
    Q_PROPERTY(QString owner READ owner NOTIFY changed)
    Q_PROPERTY(bool recording READ recording NOTIFY changed)
    // When the current recording started (seconds since 1970; 0 when not recording).
    Q_PROPERTY(double recordingStarted READ recordingStarted NOTIFY changed)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
public:
    explicit NativeAudio(QObject *parent = nullptr);
    // OpenAI's newer transcription models detect the language better and invent less on noise
    // than whisper-1; use the best one the account lists (provider discovery).
    static QString transcriptionModel(const QStringList &available);
    void setAvailableModels(const QStringList &models) { m_availableModels = models; }
    ~NativeAudio() override;
    bool speaking() const { return m_speaking; }
    QString speakingSource() const { return m_speaking ? m_speakingSource : QString(); }
    QString lastSource() const { return m_lastSource; }
    bool preparing() const { return m_preparing; }
    QStringList voices() const;
    QVariantList voiceList() const;
    /// The system voice that reads `language`: the chosen one when it speaks that language, otherwise the
    /// language's default (Swift NativeAudio.voice(for:)). Empty for cloud providers.
    Q_INVOKABLE QString voiceFor(const QString &language) const;
    /// Rate is the speaking multiplier (0.5–2); providers that ignore it (Gemini, ElevenLabs) read at 1.
    /// Microphone access: "granted", "denied" or "undetermined" (Swift MicrophonePermission.status).
    Q_INVOKABLE QString microphonePermission() const;
    Q_INVOKABLE void configureVoice(const QString &provider, const QString &voice, double rate = 1);
    /// Providers whose speech honours the rate multiplier (shared rule with Swift).
    static bool rateSupported(const QString &provider) { return provider != "gemini" && provider != "elevenlabs"; }
    QString owner() const { return m_owner; }
    bool recording() const { return m_recorder.recorderState() == QMediaRecorder::RecordingState; }
    double recordingStarted() const { return recording() ? m_recordingStarted : 0; }
    bool busy() const { return m_reply != nullptr || m_startPending; }
    QString error() const { return m_error; }
    Q_INVOKABLE void start(const QString &owner, const QString &language = "auto");
    Q_INVOKABLE void stop(const QString &provider);
    Q_INVOKABLE void cancel();
    void transcribeFile(const QString &owner, const QString &path, const QString &provider, const QString &language = "auto");
    /// `source` names what is read; `provider` overrides the voice provider for this reading only
    /// ("system" after a cloud voice failed). Same contract as Swift NativeAudio.speak.
    Q_INVOKABLE void speak(const QString &text, const QString &language, const QString &source = {}, const QString &provider = {});
    Q_INVOKABLE void silence();
signals:
    void changed();
    void transcribed(const QString &owner, const QString &text);
private:
    EdgeSpeech *m_edge = nullptr;
    QString m_voiceLanguage;
    QMediaPlayer m_player;
    QAudioOutput m_output;
    QBuffer m_voiceBuffer;
    QNetworkReply *m_voiceReply = nullptr;
    QStringList m_voiceQueue;
    QString m_voiceProvider = "system", m_voiceID;
    double m_voiceRate = 1;
    quint64 m_voiceGeneration = 0;
    bool m_speaking = false, m_preparing = false;
    double m_recordingStarted = 0;
    QString m_speakingSource, m_lastSource, m_activeProvider = "system";
    void nextVoiceChunk();
    QAudioInput m_input;
    QMediaCaptureSession m_capture;
    QMediaRecorder m_recorder;
    QTextToSpeech m_speech;
    QNetworkAccessManager m_network;
    QNetworkReply *m_reply = nullptr;
    QTemporaryDir m_directory;
    QString m_owner, m_file, m_error, m_provider, m_language = "auto";
    QStringList m_speechCandidates;
    void prepareCandidates(const QString &provider);
    void speechFailed(const QString &error);
    bool m_transcribeRequested = false, m_startPending = false;
    quint64 m_generation = 0;
    void transcribe();
    QStringList m_availableModels;
    void dispatchSpeech(const CloudProtocol::Call &call, const QString &provider);
    void cleanup();
};

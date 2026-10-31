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
    Q_PROPERTY(QStringList voices READ voices NOTIFY changed)
    Q_PROPERTY(QString owner READ owner NOTIFY changed)
    Q_PROPERTY(bool recording READ recording NOTIFY changed)
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
    QStringList voices() const;
    Q_INVOKABLE void configureVoice(const QString &provider, const QString &voice);
    QString owner() const { return m_owner; }
    bool recording() const { return m_recorder.recorderState() == QMediaRecorder::RecordingState; }
    bool busy() const { return m_reply != nullptr || m_startPending; }
    QString error() const { return m_error; }
    Q_INVOKABLE void start(const QString &owner, const QString &language = "auto");
    Q_INVOKABLE void stop(const QString &provider);
    Q_INVOKABLE void cancel();
    void transcribeFile(const QString &owner, const QString &path, const QString &provider, const QString &language = "auto");
    Q_INVOKABLE void speak(const QString &text, const QString &language);
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
    quint64 m_voiceGeneration = 0;
    bool m_speaking = false;
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

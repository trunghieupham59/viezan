#pragma once
#include "NativeAudio.h"
#include "SpeakerTurns.h"
#include "LocalProvider.h"
#include "AudioCapture.h"
#include <QAudioSource>
#include <QAudioFormat>
#include <QTemporaryDir>
#include <QElapsedTimer>
#include <QVariantList>
#include <QQueue>
#include <QPointer>

class Interpretation final : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantList inputs READ inputs NOTIFY changed)
    Q_PROPERTY(QVariantList sessions READ sessions NOTIFY changed)
    Q_PROPERTY(QVariantMap current READ current NOTIFY changed)
    Q_PROPERTY(bool listening READ listening NOTIFY changed)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(double level READ level NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
public:
    explicit Interpretation(QObject *parent = nullptr);
    ~Interpretation() override;
    static bool validateArchive(const QVariantList &sessions);
    bool importArchive(const QVariantList &sessions);
    QVariantList inputs() const { return m_audioCapture.inputs(); }
    QVariantList sessions() const { return m_sessions; }
    QVariantMap current() const;
    bool listening() const { return m_listening; }
    bool busy() const { return m_listening || m_starting || !m_active.isEmpty() || m_summarizing; }
    double level() const { return m_level; }
    QString error() const { return m_error; }
    Q_INVOKABLE void start(const QString &model, const QString &provider, const QString &source, const QString &target, const QString &locale, const QString &captureMode = "microphone", const QString &deviceID = {});
    Q_INVOKABLE void renameSpeaker(const QString &label, const QString &name);
    Q_INVOKABLE void stop();
    Q_INVOKABLE void cancel();
    Q_INVOKABLE void deleteSession(const QString &id);
    Q_INVOKABLE void select(const QString &id);
    // A fresh, empty transcript; the next start creates the session.
    Q_INVOKABLE void clearSelection() { if (busy()) return; m_selected.clear(); emit changed(); }
    Q_INVOKABLE void summarize(const QString &kind = "summary");
    Q_INVOKABLE void retry(const QString &id);
    Q_INVOKABLE QString exportText(bool srt = false) const;
    Q_INVOKABLE void exportFile(const QUrl &url, bool srt);
    Q_INVOKABLE void speak(const QString &text);
    void configureVoice(const QString &provider, const QString &voice) { m_audio.configureVoice(provider, voice); }
    Q_INVOKABLE void silence() { m_audio.silence(); }
signals:
    void changed();
private:
    SpeakerTurns m_turns;
    QVariantList m_sessions;
    QString m_summaryKind = "summary";
    QString m_selected, m_file, m_error, m_active, m_attempt, m_summaryID;
    bool m_listening = false, m_starting = false, m_summarizing = false, m_blocked = false;
    double m_level = 0;
    quint64 m_generation = 0;
    AudioCapture m_audioCapture;
    QString m_captureMode = "microphone", m_deviceID;
    QAudioFormat m_format;
    QByteArray m_pending, m_clip, m_preroll;
    qint64 m_totalFrames = 0, m_clipStart = 0, m_lastSpeech = 0;
    bool m_heard = false;
    NativeAudio m_audio;
    LocalProvider m_provider;
    QTemporaryDir m_directory;
    QQueue<QPair<QString, QString>> m_queue;
    void beginCapture();
    void consume(const QByteArray &data);
    void finishClip();
    void processNext();
    void translate(const QString &id, const QString &original);
    void finish(const QString &status, const QString &error = {});
    void updateSegment(const QString &id, const QVariantMap &fields, const QString &chunk = {});
    bool persist();
};

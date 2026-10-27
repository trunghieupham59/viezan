#pragma once
#include <QObject>
#include <QAudioSource>
#include <QAudioFormat>
#include <QMediaDevices>
#include <QProcess>
#include <QThread>
#include <QTimer>
#include <QElapsedTimer>
#include <QVariantList>
#include <QVector>
#include <atomic>

// All clients receive 24 kHz mono signed little-endian PCM. Device/network
// callbacks never enter the domain reducer directly.
class AudioCapture final : public QObject {
    Q_OBJECT
public:
    explicit AudioCapture(QObject *parent = nullptr);
    ~AudioCapture() override;
    QVariantList inputs() const;
    bool start(const QString &mode, const QString &deviceID);
    void stop();
signals:
    void pcm(const QByteArray &bytes);
    void failed();
    void devicesChanged();
private:
    struct Channel { QByteArray pending; QVector<float> source, ready; double phase = 0; };
    Channel m_mic, m_system;
    QMediaDevices m_devices;
    QAudioSource *m_input = nullptr;
    QProcess m_monitor;
    QThread *m_windows = nullptr;
    QTimer m_timer;
    QElapsedTimer m_clock;
    std::atomic_bool m_stop{true};
    bool m_active = false;
    qint64 m_written = 0;
    quint64 m_generation = 0;
    void receive(const QByteArray &bytes, const QAudioFormat &format, bool microphone);
    void tick();
    void error();
    void windowsLoopback(quint64 generation);
};

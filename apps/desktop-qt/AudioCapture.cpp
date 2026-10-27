#include "AudioCapture.h"
#include <QAudioDevice>
#include <QStandardPaths>
#include <QtEndian>
#include <cmath>
#include <cstring>
#ifdef Q_OS_WIN
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <mmreg.h>
#include <ksmedia.h>
#endif

AudioCapture::AudioCapture(QObject *parent) : QObject(parent) {
    m_timer.setInterval(20); m_timer.setTimerType(Qt::PreciseTimer);
    connect(&m_timer, &QTimer::timeout, this, &AudioCapture::tick);
    connect(&m_devices, &QMediaDevices::audioInputsChanged, this, &AudioCapture::devicesChanged);
    connect(&m_monitor, &QProcess::readyReadStandardOutput, this, [this] {
        QAudioFormat format; format.setSampleRate(24000); format.setChannelCount(1); format.setSampleFormat(QAudioFormat::Int16);
        receive(m_monitor.readAllStandardOutput(), format, false);
    });
    connect(&m_monitor, &QProcess::readyReadStandardError, this, [this] { m_monitor.readAllStandardError(); });
    connect(&m_monitor, &QProcess::errorOccurred, this, [this](QProcess::ProcessError) { if (m_active) error(); });
    connect(&m_monitor, &QProcess::finished, this, [this](int, QProcess::ExitStatus) { if (m_active) error(); });
}
AudioCapture::~AudioCapture() { stop(); }
QVariantList AudioCapture::inputs() const {
    QVariantList values; for (const auto &device : QMediaDevices::audioInputs()) values.append(QVariantMap{{"id", QString::fromLatin1(device.id().toBase64())}, {"name", device.description()}}); return values;
}
bool AudioCapture::start(const QString &mode, const QString &deviceID) {
    stop(); if (!QStringList{"microphone", "system", "mixed"}.contains(mode)) return false;
    m_mic = {}; m_system = {}; m_written = 0; m_stop = false; m_active = true;
    const auto generation = ++m_generation;
    if (mode != "system") {
        auto device = QMediaDevices::defaultAudioInput();
        if (!deviceID.isEmpty()) { bool found = false; for (const auto &candidate : QMediaDevices::audioInputs()) if (QString::fromLatin1(candidate.id().toBase64()) == deviceID) { device = candidate; found = true; break; } if (!found) { stop(); return false; } }
        QAudioFormat format; format.setSampleRate(24000); format.setChannelCount(1); format.setSampleFormat(QAudioFormat::Int16);
        if (!device.isFormatSupported(format)) format = device.preferredFormat();
        if (device.isNull() || !format.isValid() || format.sampleRate() < 8000 || format.sampleRate() > 192000 || format.channelCount() > 32) { stop(); return false; }
        m_input = new QAudioSource(device, format, this); auto *io = m_input->start(); if (!io) { stop(); return false; }
        connect(io, &QIODevice::readyRead, this, [this, io, format, generation] { if (generation == m_generation && m_active) receive(io->readAll(), format, true); });
        connect(m_input, &QAudioSource::stateChanged, this, [this](QAudio::State state) { if (m_active && state == QAudio::StoppedState && m_input && m_input->error() != QAudio::NoError) error(); });
    }
    if (mode != "microphone") {
#ifdef Q_OS_WIN
        m_windows = QThread::create([this, generation] { windowsLoopback(generation); }); m_windows->start();
#elif defined(Q_OS_LINUX)
        const auto program = QStandardPaths::findExecutable("parec", {"/usr/bin", "/bin", "/usr/local/bin"});
        if (program.isEmpty()) { stop(); return false; }
        m_monitor.setProgram(program); m_monitor.setArguments({"--device=@DEFAULT_MONITOR@", "--format=s16le", "--rate=24000", "--channels=1", "--latency-msec=50", "--raw"}); m_monitor.start();
#else
        stop(); return false;
#endif
    }
    m_clock.start(); m_timer.start(); return true;
}
void AudioCapture::stop() {
    m_active = false; m_stop = true; ++m_generation; m_timer.stop();
    if (m_input) { m_input->disconnect(this); m_input->stop(); m_input->deleteLater(); m_input = nullptr; }
    if (m_monitor.state() != QProcess::NotRunning) { m_monitor.terminate(); if (!m_monitor.waitForFinished(500)) { m_monitor.kill(); m_monitor.waitForFinished(500); } }
    if (m_windows) { m_windows->wait(); delete m_windows; m_windows = nullptr; }
    m_mic = {}; m_system = {};
}
void AudioCapture::error() { if (!m_active) return; stop(); emit failed(); }
void AudioCapture::receive(const QByteArray &bytes, const QAudioFormat &format, bool microphone) {
    if (!m_active || bytes.isEmpty()) return;
    auto &channel = microphone ? m_mic : m_system; channel.pending += bytes;
    const auto frameBytes = format.bytesPerFrame(), sampleBytes = format.bytesPerSample();
    if (frameBytes <= 0 || channel.pending.size() > 4000000) { error(); return; }
    const auto frames = channel.pending.size() / frameBytes;
    for (qsizetype frame = 0; frame < frames; ++frame) {
        double mono = 0;
        for (int c = 0; c < format.channelCount(); ++c) {
            const auto *sample = channel.pending.constData() + frame * frameBytes + c * sampleBytes; double value = 0;
            switch (format.sampleFormat()) {
            case QAudioFormat::UInt8: value = (quint8(*sample) - 128) / 128.0; break;
            case QAudioFormat::Int16: value = qFromLittleEndian<qint16>(sample) / 32768.0; break;
            case QAudioFormat::Int32: value = qFromLittleEndian<qint32>(sample) / 2147483648.0; break;
            case QAudioFormat::Float: { float number; std::memcpy(&number, sample, 4); value = std::isfinite(number) ? number : 0; break; }
            default: error(); return;
            }
            mono += value;
        }
        channel.source.append(float(mono / format.channelCount()));
    }
    channel.pending.remove(0, frames * frameBytes);
    const auto ratio = double(format.sampleRate()) / 24000;
    while (channel.phase + 1 < channel.source.size()) { const auto index = qsizetype(channel.phase); const auto fraction = channel.phase - index; channel.ready.append(float(channel.source[index] * (1 - fraction) + channel.source[index+1] * fraction)); channel.phase += ratio; }
    const auto consumed = qMin(qsizetype(channel.phase), channel.source.size()); channel.source.remove(0, consumed); channel.phase -= consumed;
    if (channel.ready.size() > 120000) error();
}
void AudioCapture::tick() {
    if (!m_active) return;
    const auto expected = m_clock.elapsed() * 24; const auto count = expected - m_written;
    if (count <= 0) return; if (count > 24000) { error(); return; }
    QByteArray bytes(count * 2, '\0');
    for (qint64 i = 0; i < count; ++i) {
        const auto sample = (i < m_mic.ready.size() ? m_mic.ready[i] : 0) + (i < m_system.ready.size() ? m_system.ready[i] : 0);
        qToLittleEndian<qint16>(qint16(qBound(-1.0f, sample, 1.0f) * 32767), bytes.data() + i * 2);
    }
    m_mic.ready.remove(0, qMin(qsizetype(count), m_mic.ready.size())); m_system.ready.remove(0, qMin(qsizetype(count), m_system.ready.size())); m_written += count; emit pcm(bytes);
}
void AudioCapture::windowsLoopback(quint64 generation) {
#ifdef Q_OS_WIN
    const auto report = [this, generation] { QMetaObject::invokeMethod(this, [this, generation] { if (generation == m_generation) error(); }, Qt::QueuedConnection); };
    const auto initialized = CoInitializeEx(nullptr, COINIT_MULTITHREADED); if (FAILED(initialized)) { report(); return; }
    IMMDeviceEnumerator *enumerator = nullptr; IMMDevice *device = nullptr; IAudioClient *client = nullptr; IAudioCaptureClient *capture = nullptr; WAVEFORMATEX *wave = nullptr;
    bool failed = false;
    do {
        if (FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator), reinterpret_cast<void **>(&enumerator))) || FAILED(enumerator->GetDefaultAudioEndpoint(eRender, eConsole, &device)) || FAILED(device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, reinterpret_cast<void **>(&client))) || FAILED(client->GetMixFormat(&wave))) { failed = true; break; }
        const bool floating = wave->wFormatTag == WAVE_FORMAT_IEEE_FLOAT || (wave->wFormatTag == WAVE_FORMAT_EXTENSIBLE && IsEqualGUID(reinterpret_cast<WAVEFORMATEXTENSIBLE *>(wave)->SubFormat, KSDATAFORMAT_SUBTYPE_IEEE_FLOAT));
        const bool pcm = wave->wFormatTag == WAVE_FORMAT_PCM || (wave->wFormatTag == WAVE_FORMAT_EXTENSIBLE && IsEqualGUID(reinterpret_cast<WAVEFORMATEXTENSIBLE *>(wave)->SubFormat, KSDATAFORMAT_SUBTYPE_PCM));
        if ((!floating && !pcm) || (!floating && wave->wBitsPerSample == 64) || wave->nBlockAlign < wave->nChannels * (wave->wBitsPerSample / 8) || wave->nSamplesPerSec < 8000 || wave->nSamplesPerSec > 192000 || !wave->nChannels || wave->nChannels > 32 || !QList<int>{16,24,32,64}.contains(wave->wBitsPerSample) || (floating && wave->wBitsPerSample != 32 && wave->wBitsPerSample != 64)) { failed = true; break; }
        if (FAILED(client->Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK, 10000000, 0, wave, nullptr)) || FAILED(client->GetService(__uuidof(IAudioCaptureClient), reinterpret_cast<void **>(&capture))) || FAILED(client->Start())) { failed = true; break; }
        QAudioFormat format; format.setSampleRate(int(wave->nSamplesPerSec)); format.setChannelCount(wave->nChannels); format.setSampleFormat(QAudioFormat::Float);
        while (!m_stop.load()) {
            UINT32 available = 0; if (FAILED(capture->GetNextPacketSize(&available))) { failed = true; break; }
            if (!available) { QThread::msleep(5); continue; }
            BYTE *data = nullptr; UINT32 frames = 0; DWORD flags = 0;
            if (FAILED(capture->GetBuffer(&data, &frames, &flags, nullptr, nullptr))) { failed = true; break; }
            if (frames > wave->nSamplesPerSec * 2) { capture->ReleaseBuffer(frames); failed = true; break; }
            QByteArray output(qsizetype(frames) * wave->nChannels * 4, '\0');
            if (!(flags & AUDCLNT_BUFFERFLAGS_SILENT) && data) for (UINT32 f = 0; f < frames; ++f) for (int c = 0; c < wave->nChannels; ++c) {
                const auto *sample = data + f * wave->nBlockAlign + c * (wave->wBitsPerSample / 8); float value = 0;
                if (floating && wave->wBitsPerSample == 32) std::memcpy(&value, sample, 4);
                else if (floating) { double number; std::memcpy(&number, sample, 8); value = float(number); }
                else if (wave->wBitsPerSample == 16) value = qFromLittleEndian<qint16>(sample) / 32768.0f;
                else if (wave->wBitsPerSample == 24) { qint32 number = sample[0] | (sample[1] << 8) | (sample[2] << 16); if (number & 0x800000) number |= ~0xffffff; value = number / 8388608.0f; }
                else if (wave->wBitsPerSample == 32) value = qFromLittleEndian<qint32>(sample) / 2147483648.0f;
                if (!std::isfinite(value)) value = 0; std::memcpy(output.data() + (qsizetype(f) * wave->nChannels + c) * 4, &value, 4);
            }
            capture->ReleaseBuffer(frames);
            QMetaObject::invokeMethod(this, [this, generation, output, format] { if (generation == m_generation) receive(output, format, false); }, Qt::QueuedConnection);
        }
        client->Stop();
    } while (false);
    if (capture) capture->Release(); if (client) client->Release(); if (device) device->Release(); if (enumerator) enumerator->Release(); if (wave) CoTaskMemFree(wave); CoUninitialize();
    if (failed && !m_stop.load()) report();
#else
    Q_UNUSED(generation);
#endif
}

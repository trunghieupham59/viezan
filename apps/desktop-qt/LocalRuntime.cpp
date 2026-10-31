#include "LocalRuntime.h"
#include <QStandardPaths>
#include <QCoreApplication>
#include <QFile>
#include <QDir>
#include <QFileInfo>
#include <QThread>
#include <QNetworkReply>
#include <QNetworkProxy>
#include <QJsonDocument>
#include <QJsonObject>
#include <QProcessEnvironment>
#include <QTimer>
#include <QSharedPointer>

LocalRuntime::LocalRuntime(QObject *parent) : QObject(parent) {
    m_network.setProxy(QNetworkProxy::NoProxy);
    m_process.setStandardOutputFile(QProcess::nullDevice()); m_process.setStandardErrorFile(QProcess::nullDevice()); m_process.setStandardInputFile(QProcess::nullDevice());
    connect(&m_process, &QProcess::errorOccurred, this, [this](QProcess::ProcessError) { m_busy = false; m_error = "runtimeStartError"; emit changed(); });
    connect(&m_process, &QProcess::finished, this, [this](int, QProcess::ExitStatus) { m_busy = false; m_available = false; m_version.clear(); emit changed(); });
}
LocalRuntime::~LocalRuntime() { m_process.disconnect(this); if (owned()) { m_process.terminate(); if (!m_process.waitForFinished(1500)) { m_process.kill(); m_process.waitForFinished(1500); } } }
int LocalRuntime::processors() const { return QThread::idealThreadCount(); }
void LocalRuntime::probe(std::function<void(QString)> completion) {
    QNetworkRequest request(QUrl("http://127.0.0.1:11434/api/version")); request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy); request.setTransferTimeout(2000);
    auto *reply = m_network.get(request); const auto buffer = QSharedPointer<QByteArray>::create();
    connect(reply, &QNetworkReply::readyRead, this, [reply, buffer] { *buffer += reply->readAll(); if (buffer->size() > 65536) reply->abort(); });
    connect(reply, &QNetworkReply::finished, this, [reply, buffer, completion] { *buffer += reply->readAll(); QString version; if (reply->error() == QNetworkReply::NoError && reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt() == 200 && buffer->size() <= 65536) version = QJsonDocument::fromJson(*buffer).object().value("version").toString(); reply->deleteLater(); completion(version); });
    QTimer::singleShot(2500, reply, [reply] { if (!reply->isFinished()) reply->abort(); });
}
void LocalRuntime::refresh() { const auto generation = m_generation; probe([this, generation](QString version) { if (generation != m_generation) return; m_available = !version.isEmpty(); m_version = version; m_checked = true; emit changed(); }); }
void LocalRuntime::start(int parallel, int context) {
    if (m_busy || owned() || !QList<int>{1, 2, 4}.contains(parallel) || !QList<int>{2048, 4096, 8192, 16384, 32768}.contains(context)) return;
    const auto generation = ++m_generation; m_busy = true; m_error.clear(); emit changed();
    probe([this, generation, parallel, context](QString version) {
        if (generation != m_generation) return;
        if (!version.isEmpty()) { m_available = true; m_version = version; m_busy = false; m_error = "runtimeExternal"; emit changed(); return; }
        QString binary;
#ifdef Q_OS_WIN
        const QDir patched(QCoreApplication::applicationDirPath() + "/local-ai/ollama-patched/windows/x64");
        if (patched.exists()) {
            QFile manifest(patched.filePath("runtime.json"));
            if (!manifest.open(QIODevice::ReadOnly) || manifest.size() > 65536) { m_busy = false; m_error = "runtimeMissing"; emit changed(); return; }
            const auto info = QJsonDocument::fromJson(manifest.readAll()).object(); bool complete = info.value("version") == "0.40.4-viezan-http-test" && info.value("fix") == "windows-http-keepalive-sse-v1";
            for (const auto &file : {"ollama.exe", "lib/ollama/llama-server.exe", "lib/ollama/llama-server-impl.dll", "lib/ollama/cuda_v12/ggml-cuda.dll"}) { const QFileInfo entry(patched.filePath(file)); complete = complete && entry.isFile() && !entry.isSymLink() && entry.canonicalFilePath().startsWith(patched.canonicalPath() + '/'); }
            if (!complete) { m_busy = false; m_error = "runtimeMissing"; emit changed(); return; }
            binary = patched.filePath("ollama.exe");
        } else binary = QStandardPaths::findExecutable("ollama.exe", {qEnvironmentVariable("LOCALAPPDATA") + "/Programs/Ollama", qEnvironmentVariable("ProgramFiles") + "/Ollama"});
#else
        binary = QStandardPaths::findExecutable("ollama", {"/usr/local/bin", "/usr/bin", "/opt/homebrew/bin", "/Applications/Ollama.app/Contents/Resources"});
#endif
        if (binary.isEmpty()) { m_busy = false; m_error = "runtimeMissing"; emit changed(); return; }
        auto environment = QProcessEnvironment::systemEnvironment();
        // Do not propagate provider credentials from the launching environment.
        for (const auto &key : environment.keys()) if (key.contains("KEY", Qt::CaseInsensitive) || key.contains("TOKEN", Qt::CaseInsensitive) || key.contains("SECRET", Qt::CaseInsensitive)) environment.remove(key);
        environment.insert("OLLAMA_HOST", "127.0.0.1:11434"); environment.insert("OLLAMA_NO_CLOUD", "1"); environment.insert("OLLAMA_NUM_PARALLEL", QString::number(parallel)); environment.insert("OLLAMA_CONTEXT_LENGTH", QString::number(context));
        m_process.setProcessEnvironment(environment); m_process.setProgram(binary); m_process.setArguments({"serve"}); m_process.start();
        QTimer::singleShot(500, this, [this, generation] { awaitReady(generation, 20); });
    });
}
void LocalRuntime::awaitReady(quint64 generation, int remaining) {
    if (generation != m_generation) return;
    if (!owned() || remaining <= 0) { stop(); m_error = "runtimeStartError"; emit changed(); return; }
    probe([this, generation, remaining](QString version) {
        if (generation != m_generation) return;
        if (!version.isEmpty() && owned()) { m_available = true; m_version = version; m_busy = false; emit changed(); return; }
        QTimer::singleShot(500, this, [this, generation, remaining] { awaitReady(generation, remaining - 1); });
    });
}
void LocalRuntime::stop() { ++m_generation; m_busy = false; m_available = false; m_version.clear(); if (owned()) m_process.terminate(); emit changed(); }

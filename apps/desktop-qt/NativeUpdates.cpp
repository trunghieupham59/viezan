#include "NativeUpdates.h"
#include <QCoreApplication>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QRegularExpression>
#include <QVersionNumber>
#include <QSysInfo>
#include <QStandardPaths>
#include <QDir>
#include <QUuid>
#include <QTimer>
#include <QSharedPointer>
#include <QDesktopServices>
#include <QFileInfo>
#ifdef Q_OS_WIN
#include <windows.h>
#include <wintrust.h>
#include <softpub.h>
#endif
namespace {
bool allowed(const QUrl &url) { return url.isValid() && url.scheme() == "https" && url.userInfo().isEmpty() && url.port(443) == 443 && QStringList{"api.github.com", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"}.contains(url.host().toLower()); }
QNetworkRequest request(const QUrl &url) { QNetworkRequest value(url); value.setRawHeader("User-Agent", "Viezan-Native"); value.setTransferTimeout(30000); value.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy); return value; }
}
NativeUpdates::NativeUpdates(QObject *parent) : QObject(parent) {}
void NativeUpdates::cancel() {
    ++m_generation;
    if (m_reply) { m_reply->disconnect(this); m_reply->abort(); m_reply->deleteLater(); m_reply = nullptr; }
    if (m_file) { m_file->cancelWriting(); m_file.reset(); }
    m_busy = false; m_received = 0; emit changed();
}
void NativeUpdates::fail() { cancel(); m_status = "updateError"; emit changed(); }
void NativeUpdates::get(const QUrl &url, qsizetype limit, std::function<void(QByteArray)> completion, int redirects) {
    if (!allowed(url) || redirects > 5) { fail(); return; }
    auto *reply = m_network.get(request(url)); m_reply = reply; const auto generation = m_generation; auto bytes = QSharedPointer<QByteArray>::create();
    connect(reply, &QNetworkReply::readyRead, this, [reply, bytes, limit] { *bytes += reply->readAll(); if (bytes->size() > limit) reply->abort(); });
    connect(reply, &QNetworkReply::finished, this, [this, reply, bytes, generation, limit, completion, redirects] {
        reply->deleteLater(); if (generation != m_generation) return; m_reply = nullptr;
        const auto redirect = reply->attribute(QNetworkRequest::RedirectionTargetAttribute).toUrl();
        if (!redirect.isEmpty()) { get(reply->url().resolved(redirect), limit, completion, redirects+1); return; }
        *bytes += reply->readAll();
        if (reply->error() != QNetworkReply::NoError || reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt() != 200 || bytes->size() > limit) { fail(); return; }
        completion(*bytes);
    });
    QTimer::singleShot(45000, reply, [reply] { if (!reply->isFinished()) reply->abort(); });
}
void NativeUpdates::check() {
    if (m_busy) return; cancel(); m_downloaded.clear(); m_busy = true; m_version.clear(); m_notes.clear(); m_package.clear(); m_manifest.clear(); m_status.clear(); emit changed();
    get(QUrl("https://api.github.com/repos/trunghieupham59/viezan/releases/latest"), 2097152, [this](QByteArray bytes) {
        const auto object = QJsonDocument::fromJson(bytes).object(); auto version = object.value("tag_name").toString(); if (version.startsWith('v')) version.remove(0,1);
        if (object.value("draft").toBool(true) || object.value("prerelease").toBool(true) || !QRegularExpression("^[0-9]+\\.[0-9]+\\.[0-9]+$").match(version).hasMatch()) { fail(); return; }
        if (QVersionNumber::fromString(version) <= QVersionNumber::fromString(QCoreApplication::applicationVersion())) { m_busy = false; m_status = "updateCurrent"; emit changed(); return; }
        auto arch = QSysInfo::buildCpuArchitecture(); if (arch == "x86_64") arch = "x64"; else if (arch == "aarch64") arch = "arm64";
#ifdef Q_OS_WIN
        const auto prefix = "Viezan-" + version + "-win32-" + arch; m_name = prefix + ".exe";
#else
        const auto prefix = "Viezan-" + version + "-linux-" + arch; m_name = prefix + ".AppImage";
#endif
        for (const auto &value : object.value("assets").toArray()) {
            const auto asset = value.toObject(); const QUrl url(asset.value("browser_download_url").toString());
            if (!allowed(url) || url.host() != "github.com" || !url.path().startsWith("/trunghieupham59/viezan/releases/download/")) continue;
            if (asset.value("name") == m_name) m_package = url;
            if (asset.value("name") == prefix + ".json") m_manifest = url;
        }
        if (m_package.isEmpty() || m_manifest.isEmpty()) { fail(); return; }
        m_version = version; m_notes = object.value("body").toString().left(65536); m_busy = false; m_status = "updateAvailable"; emit changed();
    });
}
void NativeUpdates::download() {
    if (m_busy || m_package.isEmpty() || m_manifest.isEmpty()) return;
    m_busy = true; m_status.clear(); m_downloaded.clear(); m_received = 0; emit changed();
    get(m_manifest, 65536, [this](QByteArray bytes) {
        const auto manifest = QJsonDocument::fromJson(bytes).object(); QJsonObject artifact;
        if (manifest.value("version") != m_version) { fail(); return; }
        for (const auto &value : manifest.value("artifacts").toArray()) if (value.toObject().value("name") == m_name) artifact = value.toObject();
        m_size = artifact.value("size").toInteger(); m_expectedHash = artifact.value("sha256").toString().toLatin1();
        if (m_size <= 0 || m_size > 2147483648LL || !QRegularExpression("^[a-f0-9]{64}$").match(QString::fromLatin1(m_expectedHash)).hasMatch()) { fail(); return; }
        const auto directory = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation) + "/updates/" + QUuid::createUuid().toString(QUuid::WithoutBraces);
        if (!QDir().mkpath(directory)) { fail(); return; }
        m_destination = directory + '/' + m_name; m_file = std::make_unique<QSaveFile>(m_destination);
        if (!m_file->open(QIODevice::WriteOnly)) { fail(); return; }
        m_file->setPermissions(QFileDevice::ReadOwner | QFileDevice::WriteOwner); m_hash.reset(); transfer(m_package);
    });
}
void NativeUpdates::transfer(const QUrl &url, int redirects) {
    if (!allowed(url) || redirects > 5) { fail(); return; }
    auto *reply = m_network.get(request(url)); m_reply = reply; const auto generation = m_generation;
    const auto consume = [this, reply, generation] {
        if (generation != m_generation || reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt() != 200) return;
        const auto bytes = reply->readAll(); m_received += bytes.size();
        if (!m_file || m_received > m_size || m_file->write(bytes) != bytes.size()) { reply->abort(); return; }
        m_hash.addData(bytes); emit changed();
    };
    connect(reply, &QNetworkReply::readyRead, this, consume);
    connect(reply, &QNetworkReply::finished, this, [this, reply, generation, redirects, consume] {
        reply->deleteLater(); if (generation != m_generation) return; m_reply = nullptr;
        const auto redirect = reply->attribute(QNetworkRequest::RedirectionTargetAttribute).toUrl();
        if (!redirect.isEmpty()) { transfer(reply->url().resolved(redirect), redirects+1); return; }
        consume();
        if (reply->error() != QNetworkReply::NoError || reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt() != 200 || m_received != m_size || m_hash.result().toHex() != m_expectedHash || !m_file || !m_file->commit()) { fail(); return; }
        m_file.reset(); m_downloaded = m_destination; m_busy = false; m_status = "updateReady"; emit changed();
    });
    QTimer::singleShot(1800000, reply, [reply] { if (!reply->isFinished()) reply->abort(); });
}
void NativeUpdates::openInstaller() {
    if (m_downloaded.isEmpty() || !QFileInfo(m_downloaded).isFile()) return;
#ifdef Q_OS_WIN
    const auto path = QDir::toNativeSeparators(m_downloaded).toStdWString();
    WINTRUST_FILE_INFO file{}; file.cbStruct = sizeof(file); file.pcwszFilePath = path.c_str();
    WINTRUST_DATA trust{}; trust.cbStruct = sizeof(trust); trust.dwUIChoice = WTD_UI_NONE; trust.fdwRevocationChecks = WTD_REVOKE_WHOLECHAIN; trust.dwUnionChoice = WTD_CHOICE_FILE; trust.pFile = &file; trust.dwStateAction = WTD_STATEACTION_VERIFY;
    GUID action = WINTRUST_ACTION_GENERIC_VERIFY_V2; const auto result = WinVerifyTrust(nullptr, &action, &trust); trust.dwStateAction = WTD_STATEACTION_CLOSE; WinVerifyTrust(nullptr, &action, &trust);
    if (result != ERROR_SUCCESS) { m_status = "updateSignatureError"; emit changed(); return; }
    QDesktopServices::openUrl(QUrl::fromLocalFile(m_downloaded));
#else
    // Keep the current AppImage available for rollback; let the user choose its replacement location.
    QFile::setPermissions(m_downloaded, QFileDevice::ReadOwner | QFileDevice::WriteOwner | QFileDevice::ExeOwner);
    QDesktopServices::openUrl(QUrl::fromLocalFile(QFileInfo(m_downloaded).absolutePath()));
#endif
}

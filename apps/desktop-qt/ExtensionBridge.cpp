#include "ExtensionBridge.h"
#include <QCoreApplication>
#include "CredentialStore.h"
#include "SpeechSynthesis.h"
#include <QJsonDocument>
#include <QJsonObject>
#include <QCryptographicHash>
#include <QDateTime>
#include <QRandomGenerator>
#include <QRegularExpression>
#include <QUuid>
#include <QFile>
#include <QFileInfo>
#include <QSaveFile>
#include <QDir>
#include <QStandardPaths>
#include <QTimer>
#include <QFutureWatcher>
#include <QtConcurrent/QtConcurrent>
namespace {
QString digest(const QByteArray &data) { return QString::fromLatin1(QCryptographicHash::hash(data, QCryptographicHash::Sha256).toHex()); }
bool trustedOrigin(const QString &origin) {
    if (origin.isEmpty()) return true;
    const QUrl url(origin, QUrl::StrictMode);
    if (!url.isValid() || !url.userInfo().isEmpty() || url.hasQuery() || url.hasFragment() || (!url.path().isEmpty() && url.path() != "/")) return false;
    if (url.scheme() == "chrome-extension") return QRegularExpression("^[a-p]{32}$").match(url.host()).hasMatch();
    return QStringList{"http", "https"}.contains(url.scheme()) && QStringList{"localhost", "127.0.0.1", "::1"}.contains(url.host());
}
}
ExtensionBridge::ExtensionBridge(QObject *parent) : QObject(parent) {
    m_file = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation) + "/extension-tokens.json";
    QFile file(m_file);
    if (file.exists()) {
        if (!file.open(QIODevice::ReadOnly) || file.size() > 1048576) m_storageBlocked = true;
        else { QJsonParseError error; const auto document = QJsonDocument::fromJson(file.readAll(), &error); if (error.error != QJsonParseError::NoError || !document.isArray()) m_storageBlocked = true; else m_tokens = document.toVariant().toList(); }
    }
    if (m_storageBlocked) m_error = "bridgeStorageError";
    connect(&m_server, &QTcpServer::newConnection, this, &ExtensionBridge::accept);
    connect(&m_provider, &LocalProvider::received, this, [this](const QVariantMap &event) {
        QTcpSocket *socket = nullptr;
        for (auto it = m_clients.cbegin(); it != m_clients.cend(); ++it) if (it.value()->id == event.value("taskID").toString()) { socket = it.key(); break; }
        if (!socket) return;
        const auto client = m_clients.value(socket); client->output += event.value("chunk").toString();
        if (event.value("terminal") == "succeeded") respond(socket, 200, {{"success", true}, {"translatedText", client->output}});
        else if (event.contains("terminal")) respond(socket, 400, {{"success", false}, {"error", event.value("errorCode", "Request failed")}});
    });
}
QVariantList ExtensionBridge::tokens() const {
    QVariantList values; for (const auto &value : m_tokens) { auto entry = value.toMap(); entry.remove("digest"); values.append(entry); } return values;
}
bool ExtensionBridge::persist(const QVariantList &tokens) {
    const auto directory = QFileInfo(m_file).absolutePath(); if (!QDir().mkpath(directory)) return false;
    QFile::setPermissions(directory, QFileDevice::ReadOwner | QFileDevice::WriteOwner | QFileDevice::ExeOwner);
    QSaveFile file(m_file); const auto data = QJsonDocument::fromVariant(tokens).toJson(QJsonDocument::Compact);
    if (!file.open(QIODevice::WriteOnly) || file.write(data) != data.size() || !file.commit()) return false;
    QFile::setPermissions(m_file, QFileDevice::ReadOwner | QFileDevice::WriteOwner); return true;
}
void ExtensionBridge::createToken(const QString &name, int days) {
    if (m_storageBlocked || name.trimmed().isEmpty() || name.size() > 80 || days < 1 || days > 365) return;
    QByteArray random; for (int i = 0; i < 8; ++i) { auto value = QRandomGenerator::system()->generate(); random.append(reinterpret_cast<const char *>(&value), sizeof(value)); }
    const auto secret = "sk-vie-" + random.toHex(); const auto now = QDateTime::currentSecsSinceEpoch();
    QVariantList next; for (const auto &value : m_tokens) if (value.toMap().value("expiresAt").toDouble() > now) next.append(value);
    next.append(QVariantMap{{"id", QUuid::createUuid().toString(QUuid::WithoutBraces)}, {"name", name}, {"digest", digest(secret)}, {"expiresAt", double(now + qint64(days) * 86400)}});
    if (persist(next)) { m_tokens = next; m_revealed = QString::fromLatin1(secret); m_error.clear(); }
    else m_error = "bridgeStorageError"; emit changed();
}
void ExtensionBridge::revoke(const QString &id) {
    if (m_storageBlocked) return;
    QVariantList next; for (const auto &entry : m_tokens) if (entry.toMap().value("id") != id) next.append(entry);
    if (persist(next)) { m_tokens = next; stop(); m_error.clear(); } else m_error = "bridgeStorageError";
    emit changed();
}
bool ExtensionBridge::authenticate(const QByteArray &secret) const {
    if (!QRegularExpression("^sk-vie-[0-9a-f]{64}$").match(QString::fromLatin1(secret)).hasMatch()) return false;
    const auto hash = digest(secret).toLatin1(); const auto now = QDateTime::currentSecsSinceEpoch();
    for (const auto &entry : m_tokens) {
        const auto token = entry.toMap(); const auto expected = token.value("digest").toByteArray();
        if (token.value("expiresAt").toDouble() <= now || expected.size() != hash.size()) continue;
        unsigned char difference = 0; for (qsizetype i = 0; i < hash.size(); ++i) difference |= static_cast<unsigned char>(expected[i]) ^ static_cast<unsigned char>(hash[i]);
        if (difference == 0) return true;
    }
    return false;
}
void ExtensionBridge::start() {
    if (!m_enabled) return;
    if (m_storageBlocked || listening()) return;
    if (!m_server.listen(QHostAddress::LocalHost, 39875)) m_error = "bridgeListenError"; else m_error.clear(); emit changed();
}
void ExtensionBridge::stop() {
    m_server.close(); m_provider.cancelAll();
    const auto sockets = m_clients.keys();
    for (auto *socket : sockets) { if (auto client = m_clients.value(socket)) { if (client->edge) { client->edge->cancel(); client->edge->deleteLater(); } if (client->reply) client->reply->abort(); } socket->abort(); socket->deleteLater(); }
    m_clients.clear(); emit changed();
}
void ExtensionBridge::accept() {
    while (auto *socket = m_server.nextPendingConnection()) {
        if (m_clients.size() >= 8 || !socket->peerAddress().isLoopback()) { socket->abort(); socket->deleteLater(); continue; }
        const auto client = QSharedPointer<Client>::create(); client->id = QUuid::createUuid().toString(QUuid::WithoutBraces); m_clients.insert(socket, client);
        socket->setReadBufferSize(278529);
        connect(socket, &QTcpSocket::readyRead, this, [this, socket] { read(socket); });
        connect(socket, &QTcpSocket::disconnected, this, [this, socket] { if (const auto client = m_clients.take(socket)) { m_provider.cancel(client->id); if (client->reply) client->reply->abort(); if (client->edge) { client->edge->cancel(); client->edge->deleteLater(); } } socket->deleteLater(); });
        QTimer::singleShot(30000, socket, [this, socket] { if (m_clients.contains(socket) && !m_clients.value(socket)->handling) socket->abort(); });
        QTimer::singleShot(180000, socket, [socket] { socket->abort(); });
    }
}
void ExtensionBridge::read(QTcpSocket *socket) {
    const auto client = m_clients.value(socket); if (!client || client->handling) return;
    client->buffer += socket->readAll();
    auto reject = [this, socket] { respond(socket, 400, {{"success", false}, {"error", "Invalid HTTP request"}}); };
    if (client->buffer.size() > 278528) { reject(); return; }
    const auto boundary = client->buffer.indexOf("\r\n\r\n");
    if (boundary < 0) { if (client->buffer.size() > 16384) reject(); return; }
    if (boundary > 16384) { reject(); return; }
    const auto lines = client->buffer.left(boundary).split('\n'); const auto first = lines.first().trimmed().split(' ');
    if (first.size() != 3 || !QList<QByteArray>{"GET", "POST", "OPTIONS"}.contains(first[0]) || !QList<QByteArray>{"HTTP/1.0", "HTTP/1.1"}.contains(first[2]) || !first[1].startsWith('/') || first[1].startsWith("//")) { reject(); return; }
    QMap<QByteArray,QByteArray> headers;
    for (auto line : lines.sliced(1)) {
        if (line.endsWith('\r')) line.chop(1); const auto separator = line.indexOf(':');
        if (separator <= 0 || line.startsWith(' ') || line.startsWith('\t') || line.contains('\0') || line.contains('\r')) { reject(); return; }
        const auto key = line.left(separator).toLower(); if (headers.contains(key)) { reject(); return; } headers[key] = line.mid(separator + 1).trimmed();
    }
    bool validSize = false; const auto size = headers.value("content-length", first[0] == "POST" ? "invalid" : "0").toLongLong(&validSize);
    if (!validSize || size < 0 || size > 262144 || headers.contains("transfer-encoding") || !QList<QByteArray>{"127.0.0.1:39875", "localhost:39875", "[::1]:39875"}.contains(headers.value("host").toLower())) { reject(); return; }
    const auto expected = boundary + 4 + size; if (client->buffer.size() < expected) return;
    if (client->buffer.size() != expected) { reject(); return; }
    client->handling = true; dispatch(socket, QString::fromLatin1(first[0]), QUrl::fromEncoded(first[1]).path(), headers, client->buffer.mid(boundary + 4)); client->buffer.clear();
}
void ExtensionBridge::dispatch(QTcpSocket *socket, const QString &method, const QString &path, const QMap<QByteArray,QByteArray> &headers, const QByteArray &bytes) {
    const auto client = m_clients.value(socket); const auto origin = QString::fromUtf8(headers.value("origin"));
    if (!trustedOrigin(origin) && !m_origins.contains(origin)) { respond(socket, 403, {{"success", false}, {"error", "Origin not allowed"}}); return; }
    client->origin = origin;
    if (method == "OPTIONS") { respond(socket, 200, {}); return; }
    if (!authenticate(headers.value("x-viezan-token"))) { respond(socket, 401, {{"success", false}, {"error", "Unauthorized"}}); return; }
    if (method == "GET" && path == "/api/status") { respond(socket, 200, {{"success", true}, {"appName", "Viezan"}, {"version", QCoreApplication::applicationVersion()}}); return; }
    if (method == "GET" && path == "/api/config") {
        const auto model = m_model; QPointer<QTcpSocket> target(socket);
        auto *watcher = new QFutureWatcher<QVariantMap>(this);
        connect(watcher, &QFutureWatcher<QVariantMap>::finished, this, [this, watcher, target, model] { const auto providers = watcher->result(); watcher->deleteLater(); if (target && m_clients.contains(target)) respond(target, 200, {{"success", true}, {"provider", model.section(':', 0, 0)}, {"model", model.section(':', 1)}, {"availableProviders", providers}}); });
        watcher->setFuture(QtConcurrent::run([] { return QVariantMap{{"openai", CredentialStore::has("openai")}, {"claude", CredentialStore::has("claude")}, {"gemini", CredentialStore::has("gemini")}}; })); return;
    }
    if (method != "POST" || (path != "/api/translate" && path != "/api/tts")) { respond(socket, 404, {{"success", false}, {"error", "Not found"}}); return; }
    QJsonParseError error; const auto document = QJsonDocument::fromJson(bytes, &error); const auto body = document.toVariant().toMap(); const auto text = body.value("text").toString();
    if (!headers.value("content-type").toLower().startsWith("application/json") || error.error != QJsonParseError::NoError || !document.isObject() || body.value("text").metaType().id() != QMetaType::QString || text.trimmed().isEmpty()) { respond(socket, 400, {{"success", false}, {"error", "Invalid request"}}); return; }
    if (path == "/api/tts") { tts(socket, text, body.value("lang", "en").toString()); return; }
    const auto target = body.value("targetLang").toString(); const auto style = body.value("translationStyle", "general").toString();
    QFile resources(":/qml/native.json"); resources.open(QIODevice::ReadOnly); const auto languages = QJsonDocument::fromJson(resources.readAll()).toVariant().toMap().value("nativeLanguages").toStringList();
    auto model = m_model; if (body.contains("provider") && body.contains("model")) model = body.value("provider").toString() + ':' + body.value("model").toString();
    if (text.toUtf8().size() > 131072 || !languages.contains(target) || !QRegularExpression("^(ollama|lmstudio|llamacpp|openai|claude|gemini):[^\\x00-\\x1f\\x7f]+$").match(model).hasMatch() || model.toUtf8().size() > 512 || !QStringList{"general", "formal", "casual", "business", "technical", "natural"}.contains(style)) { respond(socket, 400, {{"success", false}, {"error", "Invalid translation request"}}); return; }
    m_provider.start({{"id", client->id}, {"attemptID", client->id}, {"request", QVariantMap{{"feature", "translate"}, {"input", text}, {"source", "auto"}, {"target", target}, {"model", model}, {"translationStyle", style}, {"translationMode", "translate"}}}});
}
void ExtensionBridge::respond(QTcpSocket *socket, int status, const QVariantMap &value) {
    const auto client = m_clients.value(socket); if (!client) return; client->handling = true;
    const auto body = QJsonDocument::fromVariant(value).toJson(QJsonDocument::Compact);
    QByteArray headers = "HTTP/1.1 " + QByteArray::number(status) + (status == 200 ? " OK\r\n" : " Error\r\n");
    headers += "Content-Type: application/json\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\nConnection: close\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, X-Viezan-Token\r\nAccess-Control-Allow-Private-Network: true\r\n";
    if (!client->origin.isEmpty()) headers += "Access-Control-Allow-Origin: " + client->origin.toUtf8() + "\r\nVary: Origin\r\n";
    socket->write(headers + "\r\n" + body); socket->disconnectFromHost();
}
void ExtensionBridge::tts(QTcpSocket *socket, const QString &text, const QString &language) {
    if (text.toUcs4().size() > 5000 || language.size() > 16 || !QRegularExpression("^[A-Za-z-]+$").match(language).hasMatch()) { respond(socket, 400, {{"success", false}, {"error", "Invalid speech request"}}); return; }
    const auto provider = m_voiceProvider, voice = m_voiceID; QPointer<QTcpSocket> target(socket);
    if (provider == "edge") {
        auto *edge = new EdgeSpeech(this); m_clients.value(socket)->edge = edge;
        connect(edge, &EdgeSpeech::finished, this, [this, edge, target](const QByteArray &audio) { edge->deleteLater(); if (target && m_clients.contains(target)) respond(target, 200, {{"success", true}, {"provider", "edge"}, {"mimeType", "audio/mpeg"}, {"audioBase64", QString::fromLatin1(audio.toBase64())}}); });
        connect(edge, &EdgeSpeech::failed, this, [this, edge, target] { edge->deleteLater(); if (target && m_clients.contains(target)) respond(target, 400, {{"success", false}, {"error", "Speech synthesis failed"}}); });
        edge->start(text, language, voice); return;
    }
    auto *watcher = new QFutureWatcher<CloudProtocol::Call>(this);
    connect(watcher, &QFutureWatcher<CloudProtocol::Call>::finished, this, [this, watcher, target, provider] {
        const auto call = watcher->result(); watcher->deleteLater(); if (!target || !m_clients.contains(target)) return;
        if (!call.error.isEmpty()) { respond(target, 400, {{"success", false}, {"error", call.error}}); return; }
        auto *reply = m_network.post(call.request, call.body); m_clients.value(target)->reply = reply; const auto buffer = QSharedPointer<QByteArray>::create();
        connect(reply, &QNetworkReply::readyRead, this, [reply, buffer] { *buffer += reply->readAll(); if (buffer->size() > 16777216) reply->abort(); });
        connect(reply, &QNetworkReply::finished, this, [this, reply, target, buffer, provider] {
            *buffer += reply->readAll(); reply->deleteLater(); if (!target || !m_clients.contains(target)) return;
            const auto audio = reply->error() == QNetworkReply::NoError && reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt() == 200 ? SpeechSynthesis::decode(*buffer, provider) : QByteArray{};
            if (audio.isEmpty()) respond(target, 400, {{"success", false}, {"error", "Speech synthesis failed"}});
            else respond(target, 200, {{"success", true}, {"provider", provider}, {"mimeType", provider == "gemini" ? "audio/wav" : "audio/mpeg"}, {"audioBase64", QString::fromLatin1(audio.toBase64())}});
        });
        QTimer::singleShot(180000, reply, [reply] { if (!reply->isFinished()) reply->abort(); });
    });
    watcher->setFuture(QtConcurrent::run([text, provider, voice] { return SpeechSynthesis::prepare(text, provider, voice); }));
}

#include <QSettings>
#include <QUrlQuery>
#include <QSysInfo>
#include <QThread>
#include "DesktopIntegration.h"
#include "LauncherTools.h"
#include "CurrencyRates.h"
#include <QTimer>
#include <QGuiApplication>
#include <QClipboard>
#include <QKeySequence>
#include <QStandardPaths>
#include <QDirIterator>
#include <QFileInfo>
#include <QSaveFile>
#include <QJsonDocument>
#include <QDesktopServices>
#include <QProcess>
#include <QFutureWatcher>
#include <QtConcurrent/QtConcurrent>
#include <QUuid>
#include <QSet>
#include <algorithm>
#ifdef Q_OS_WIN
#include <windows.h>
#endif
#ifdef Q_OS_LINUX
#include <QDBusConnection>
#include <QDBusInterface>
#include <QDBusPendingCallWatcher>
#include <QDBusPendingReply>
#include <QDBusArgument>
#include <QDBusMetaType>
struct PortalShortcut { QString id; QVariantMap options; };
Q_DECLARE_METATYPE(PortalShortcut)
Q_DECLARE_METATYPE(QList<PortalShortcut>)
QDBusArgument &operator<<(QDBusArgument &arg, const PortalShortcut &value) { arg.beginStructure(); arg << value.id << value.options; arg.endStructure(); return arg; }
const QDBusArgument &operator>>(const QDBusArgument &arg, PortalShortcut &value) { arg.beginStructure(); arg >> value.id >> value.options; arg.endStructure(); return arg; }
#endif
namespace {
const QStringList actions{"quickChat", "translateSelection", "launcher"};
bool validKey(const QString &text) {
    const QKeySequence sequence(text, QKeySequence::PortableText);
    if (sequence.count() != 1) return false;
    const auto key = sequence[0]; return (key.keyboardModifiers() & (Qt::ControlModifier | Qt::AltModifier | Qt::MetaModifier)) && ((key.key() >= Qt::Key_A && key.key() <= Qt::Key_Z) || (key.key() >= Qt::Key_0 && key.key() <= Qt::Key_9) || key.key() == Qt::Key_Space);
}
#ifdef Q_OS_WIN
bool registerShortcut(int index, const QVariantMap &value) {
    if (!value.value("enabled").toBool()) return true;
    const QKeySequence sequence(value.value("key").toString(), QKeySequence::PortableText); const auto key = sequence[0];
    UINT mods = MOD_NOREPEAT; const auto flags = key.keyboardModifiers();
    if (flags & Qt::ControlModifier) mods |= MOD_CONTROL; if (flags & Qt::AltModifier) mods |= MOD_ALT; if (flags & Qt::ShiftModifier) mods |= MOD_SHIFT; if (flags & Qt::MetaModifier) mods |= MOD_WIN;
    return RegisterHotKey(nullptr, 0x5100 + index, mods, UINT(key.key())) != 0;
}

#endif
}
DesktopIntegration::DesktopIntegration(QObject *parent) : QObject(parent) {
    m_shortcuts = {QVariantMap{{"id", "quickChat"}, {"key", "Ctrl+Alt+Space"}, {"enabled", false}}, QVariantMap{{"id", "translateSelection"}, {"key", "Alt+T"}, {"enabled", false}}, QVariantMap{{"id", "launcher"}, {"key", "Alt+Space"}, {"enabled", false}}};
    m_file = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation) + "/shortcuts.json";
    QFile file(m_file); if (file.open(QIODevice::ReadOnly) && file.size() <= 65536) {
        const auto values = QJsonDocument::fromJson(file.readAll()).toVariant().toList();
        bool valid = values.size() == actions.size(); QSet<QString> ids;
        for (const auto &value : values) { const auto entry = value.toMap(); const auto id = entry.value("id").toString(); valid &= actions.contains(id) && !ids.contains(id) && validKey(entry.value("key").toString()) && entry.value("enabled").metaType().id() == QMetaType::Bool; ids.insert(id); }
        if (valid) m_shortcuts = values; else m_error = "shortcutError";
    }
    qApp->installNativeEventFilter(this);
#ifdef Q_OS_LINUX
    qDBusRegisterMetaType<PortalShortcut>(); qDBusRegisterMetaType<QList<PortalShortcut>>();
    auto bus = QDBusConnection::sessionBus();
    bus.connect("org.freedesktop.portal.Desktop", QString(), "org.freedesktop.portal.Request", "Response", this, SLOT(portalResponse(uint,QVariantMap,QDBusMessage)));
    bus.connect("org.freedesktop.portal.Desktop", "/org/freedesktop/portal/desktop", "org.freedesktop.portal.GlobalShortcuts", "Activated", this, SLOT(portalActivated(QDBusObjectPath,QString,qulonglong,QVariantMap)));
#endif
}
DesktopIntegration::~DesktopIntegration() { shutdown(); if (qApp) qApp->removeNativeEventFilter(this); }
bool DesktopIntegration::persist(const QVariantList &values) {
    if (!QDir().mkpath(QFileInfo(m_file).absolutePath())) return false;
    QSaveFile file(m_file); const auto bytes = QJsonDocument::fromVariant(values).toJson(QJsonDocument::Compact);
    if (!file.open(QIODevice::WriteOnly) || file.write(bytes) != bytes.size() || !file.commit()) return false;
    QFile::setPermissions(m_file, QFileDevice::ReadOwner | QFileDevice::WriteOwner); return true;
}
void DesktopIntegration::configure(const QString &id, const QString &key, bool enabled) {
    if (m_busy || !actions.contains(id) || !validKey(key)) { m_error = "shortcutError"; emit changed(); return; }
    auto next = m_shortcuts;
    for (auto &value : next) if (value.toMap().value("id") == id) value = QVariantMap{{"id", id}, {"key", key}, {"enabled", enabled}};
    apply(next);
}
void DesktopIntegration::activate() { apply(m_shortcuts); }
void DesktopIntegration::apply(const QVariantList &values) {
#ifdef Q_OS_WIN
    for (int i = 0; i < m_shortcuts.size(); ++i) UnregisterHotKey(nullptr, 0x5100 + i);
    bool success = true;
    for (int i = 0; i < values.size(); ++i) success &= registerShortcut(i, values[i].toMap());
    if (success) success = persist(values);
    if (success) { m_shortcuts = values; m_error.clear(); }
    else { for (int i = 0; i < values.size(); ++i) UnregisterHotKey(nullptr, 0x5100 + i); for (int i = 0; i < m_shortcuts.size(); ++i) registerShortcut(i, m_shortcuts[i].toMap()); m_error = "shortcutError"; }
#elif defined(Q_OS_LINUX)
    if (m_busy) return;
    bool enabled = false; for (const auto &value : values) enabled |= value.toMap().value("enabled").toBool();
    if (!enabled) { if (persist(values)) { closeSession(m_session); m_session.clear(); m_shortcuts = values; m_error.clear(); } else m_error = "shortcutError"; emit changed(); return; }
    m_candidate = values; m_busy = true; m_error.clear();
    const auto token = "viezan_" + QUuid::createUuid().toString(QUuid::Id128);
    portalRequest("CreateSession", {QVariantMap{{"handle_token", token}, {"session_handle_token", token + "_session"}}}, token);
#else
    bool enabled = false; for (const auto &value : values) enabled |= value.toMap().value("enabled").toBool();
    if (!enabled && persist(values)) m_shortcuts = values; else m_error = "shortcutPlatformHint";
#endif
    emit changed();
}
void DesktopIntegration::shutdown() {
    m_selection.clear();
#ifdef Q_OS_WIN
    for (int i = 0; i < m_shortcuts.size(); ++i) UnregisterHotKey(nullptr, 0x5100 + i);
#endif
#ifdef Q_OS_LINUX
    for (const auto &path : m_requests.keys()) { QDBusInterface request("org.freedesktop.portal.Desktop", path, "org.freedesktop.portal.Request", QDBusConnection::sessionBus()); request.asyncCall("Close"); }
    m_requests.clear(); closeSession(m_session); closeSession(m_pendingSession); m_session.clear(); m_pendingSession.clear(); m_busy = false;
#endif
}
bool DesktopIntegration::nativeEventFilter(const QByteArray &, void *message, qintptr *) {
#ifdef Q_OS_WIN
    const auto *event = static_cast<MSG *>(message);
    if (event->message == WM_HOTKEY && event->wParam >= 0x5100 && event->wParam < 0x5100 + m_shortcuts.size()) { trigger(m_shortcuts[int(event->wParam - 0x5100)].toMap().value("id").toString()); return true; }
#else
    Q_UNUSED(message)
#endif
    return false;
}
void DesktopIntegration::trigger(const QString &action) {
    if (!actions.contains(action)) return;
    QString selection; m_selection.clear(); m_error.clear();
    if (action == "translateSelection") {
#ifdef Q_OS_WIN
        selection = m_selection.capture();
#else
        if (QGuiApplication::clipboard()->supportsSelection()) selection = QGuiApplication::clipboard()->text(QClipboard::Selection);
#endif
        if (selection.toUtf8().size() > 131072) selection.clear();
        if (selection.isEmpty()) m_error = "selectionUnavailable";
    }
    emit activated(action, selection); emit changed();
}
void DesktopIntegration::refreshApplications() {
    if (m_applicationsBusy) return;
    m_applicationsBusy = true; emit changed();
    auto *watcher = new QFutureWatcher<QVariantList>(this);
    connect(watcher, &QFutureWatcher<QVariantList>::finished, this, [this, watcher] { m_applications = watcher->result(); m_applicationsBusy = false; watcher->deleteLater(); emit changed(); });
    watcher->setFuture(QtConcurrent::run([] {
        QVariantList apps; QSet<QString> known; QStringList roots, filters;
#ifdef Q_OS_WIN
        roots = {qEnvironmentVariable("APPDATA") + "/Microsoft/Windows/Start Menu/Programs", qEnvironmentVariable("PROGRAMDATA") + "/Microsoft/Windows/Start Menu/Programs"}; filters = {"*.lnk"};
#else
        roots = QStandardPaths::standardLocations(QStandardPaths::ApplicationsLocation); filters = {"*.desktop"};
#endif
        for (const auto &root : roots) {
            QDirIterator entries(root, filters, QDir::Files | QDir::NoSymLinks, QDirIterator::Subdirectories);
            while (entries.hasNext()) {
                const auto path = entries.next(); const QFileInfo info(path); const auto canonical = info.canonicalFilePath(); if (canonical.isEmpty() || known.contains(canonical)) continue;
                QString name = info.completeBaseName();
#ifndef Q_OS_WIN
                QFile file(path); if (!file.open(QIODevice::ReadOnly) || file.size() > 1048576) continue;
                bool hidden = false, section = false; QString type;
                for (const auto &line : QString::fromUtf8(file.readAll()).split('\n')) { if (line.startsWith('[')) section = line.trimmed() == "[Desktop Entry]"; if (!section) continue; if (line.startsWith("Name=")) name = line.mid(5).trimmed(); if (line == "Hidden=true" || line == "NoDisplay=true") hidden = true; if (line.startsWith("Type=")) type = line.mid(5).trimmed(); }
                if (hidden || type != "Application") continue;
#endif
                known.insert(canonical); apps.append(QVariantMap{{"id", canonical}, {"name", name}});
            }
        }
        std::sort(apps.begin(), apps.end(), [](const QVariant &a, const QVariant &b) { return a.toMap().value("name").toString().localeAwareCompare(b.toMap().value("name").toString()) < 0; }); return apps;
    }));
}
void DesktopIntegration::launch(const QString &id) {
    bool known = false; for (const auto &app : m_applications) known |= app.toMap().value("id") == id; if (!known || QFileInfo(id).canonicalFilePath() != id) return;
#ifdef Q_OS_WIN
    if (!QDesktopServices::openUrl(QUrl::fromLocalFile(id))) { m_error = "launchError"; emit changed(); }
#else
    const auto executable = QStandardPaths::findExecutable("gio");
    if (executable.isEmpty() || !QProcess::startDetached(executable, {"launch", id})) { m_error = "launchError"; emit changed(); }
#endif
}
#ifdef Q_OS_LINUX
void DesktopIntegration::closeSession(const QString &path) { if (!path.isEmpty()) { QDBusInterface session("org.freedesktop.portal.Desktop", path, "org.freedesktop.portal.Session", QDBusConnection::sessionBus()); session.asyncCall("Close"); } }
void DesktopIntegration::portalRequest(const QString &operation, const QVariantList &arguments, const QString &token) {
    auto bus = QDBusConnection::sessionBus(); auto sender = bus.baseService().mid(1).replace('.', '_');
    const auto path = "/org/freedesktop/portal/desktop/request/" + sender + '/' + token; m_requests[path] = operation;
    QDBusInterface portal("org.freedesktop.portal.Desktop", "/org/freedesktop/portal/desktop", "org.freedesktop.portal.GlobalShortcuts", bus);
    auto *watcher = new QDBusPendingCallWatcher(portal.asyncCallWithArgumentList(operation, arguments), this);
    QTimer::singleShot(120000, this, [this, path] {
        if (!m_requests.remove(path)) return;
        QDBusInterface request("org.freedesktop.portal.Desktop", path, "org.freedesktop.portal.Request", QDBusConnection::sessionBus()); request.asyncCall("Close");
        closeSession(m_pendingSession); m_pendingSession.clear(); m_busy = false; m_error = "shortcutError"; emit changed();
    });
    connect(watcher, &QDBusPendingCallWatcher::finished, this, [this, watcher, path] {
        QDBusPendingReply<QDBusObjectPath> reply = *watcher; watcher->deleteLater();
        if (reply.isError() && m_requests.remove(path)) { closeSession(m_pendingSession); m_pendingSession.clear(); m_busy = false; m_error = "shortcutError"; emit changed(); }
    });
}
void DesktopIntegration::portalResponse(uint response, const QVariantMap &results, const QDBusMessage &message) {
    const auto operation = m_requests.take(message.path()); if (operation.isEmpty()) return;
    if (response != 0) { closeSession(m_pendingSession); m_pendingSession.clear(); m_busy = false; m_error = "shortcutError"; emit changed(); return; }
    if (operation == "CreateSession") {
        m_pendingSession = results.value("session_handle").toString(); if (m_pendingSession.isEmpty()) { m_busy = false; m_error = "shortcutError"; emit changed(); return; }
        QList<PortalShortcut> shortcuts;
        for (const auto &value : m_candidate) { const auto entry = value.toMap(); if (entry.value("enabled").toBool()) shortcuts.append({entry.value("id").toString(), {{"description", "Viezan: " + entry.value("id").toString()}, {"preferred_trigger", entry.value("key").toString().toUpper().replace("SPACE", "space")}}}); }
        const auto token = "viezan_" + QUuid::createUuid().toString(QUuid::Id128);
        portalRequest("BindShortcuts", {QVariant::fromValue(QDBusObjectPath(m_pendingSession)), QVariant::fromValue(shortcuts), QString(), QVariantMap{{"handle_token", token}}}, token);
    } else {
        const auto bound = qdbus_cast<QList<PortalShortcut>>(results.value("shortcuts")); QSet<QString> ids; for (const auto &item : bound) ids.insert(item.id);
        bool complete = true; for (const auto &value : m_candidate) if (value.toMap().value("enabled").toBool() && !ids.contains(value.toMap().value("id").toString())) complete = false;
        if (complete && persist(m_candidate)) { closeSession(m_session); m_session = m_pendingSession; m_shortcuts = m_candidate; m_error.clear(); }
        else { closeSession(m_pendingSession); m_error = "shortcutError"; }
        m_pendingSession.clear(); m_busy = false; emit changed();
    }
}
void DesktopIntegration::portalActivated(const QDBusObjectPath &session, const QString &shortcut, qulonglong, const QVariantMap &) { if (session.path() == m_session) trigger(shortcut); }
#endif

void DesktopIntegration::openApplicationSettings() {
#ifdef Q_OS_WIN
    if (!QDesktopServices::openUrl(QUrl("ms-settings:appsfeatures"))) { m_error = "launchError"; emit changed(); }
#endif
}

QString DesktopIntegration::calculate(const QString &input) const { return LauncherTools::calculate(input); }
void DesktopIntegration::searchFiles(const QString &input) {
    const auto generation = ++m_fileSearchGeneration; m_files.clear(); m_currency.clear(); emit changed();
    if (input.trimmed().size() < 2) return;
    auto *watcher = new QFutureWatcher<QVariantList>(this);
    connect(watcher, &QFutureWatcher<QVariantList>::finished, this, [this, watcher, generation] { const auto values = watcher->result(); watcher->deleteLater(); if (generation == m_fileSearchGeneration) { m_files = values; emit changed(); } });
    watcher->setFuture(QtConcurrent::run([input] { return LauncherTools::files(input); }));
    const auto cache = QFileInfo(m_file).absolutePath() + "/currency.json";
    auto *rates = new QFutureWatcher<QString>(this);
    connect(rates, &QFutureWatcher<QString>::finished, this, [this, rates, generation] { const auto result = rates->result(); rates->deleteLater(); if (generation == m_fileSearchGeneration) { m_currency = result; emit changed(); } });
    rates->setFuture(QtConcurrent::run([input, cache] { return CurrencyRates::convert(input, cache); }));
}
void DesktopIntegration::openFile(const QString &path) {
    bool known = false; for (const auto &value : m_files) if (value.toMap().value("id") == path) known = true;
    if (!known || QFileInfo(path).canonicalFilePath() != path || (!QFileInfo(path).isFile() && !QFileInfo(path).isDir())) return;
    if (!QDesktopServices::openUrl(QUrl::fromLocalFile(path))) { m_error = "launchError"; emit changed(); }
}

namespace {
QString startupCommand() { return "\"" + QDir::toNativeSeparators(QCoreApplication::applicationFilePath()) + "\""; }
QString startupFile() { return QStandardPaths::writableLocation(QStandardPaths::ConfigLocation) + "/autostart/viezan-native.desktop"; }
QByteArray startupDesktop() {
    auto executable = QCoreApplication::applicationFilePath();
    executable.replace("\\", "\\\\").replace("\"", "\\\"").replace("$", "\\$").replace("`", "\\`").replace("%", "%%");
    return ("[Desktop Entry]\nType=Application\nName=Viezan\nX-Viezan-Native=true\nExec=\"" + executable + "\"\nTerminal=false\n").toUtf8();
}
}
bool DesktopIntegration::launchAtLogin() const {
#ifdef Q_OS_WIN
    QSettings settings("HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", QSettings::NativeFormat);
    return settings.value("ViezanNative").toString() == startupCommand();
#elif defined(Q_OS_LINUX)
    QFile file(startupFile()); return file.open(QIODevice::ReadOnly) && file.size() < 16384 && file.readAll() == startupDesktop();
#else
    return false;
#endif
}
void DesktopIntegration::setLaunchAtLogin(bool enabled) {
    bool success = false;
#ifdef Q_OS_WIN
    QSettings settings("HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", QSettings::NativeFormat);
    if (enabled) settings.setValue("ViezanNative", startupCommand());
    else if (settings.value("ViezanNative").toString() == startupCommand()) settings.remove("ViezanNative");
    settings.sync(); success = settings.status() == QSettings::NoError;
#elif defined(Q_OS_LINUX)
    const auto path = startupFile(); QFile existing(path); const QFileInfo info(path);
    if (info.isSymLink()) { m_error = "startupError"; emit changed(); return; }
    if (info.exists() && (!existing.open(QIODevice::ReadOnly) || existing.size() > 16384 || !existing.readAll().contains("X-Viezan-Native=true\n"))) { m_error = "startupError"; emit changed(); return; }
    existing.close();
    if (!enabled) success = !info.exists() || QFile::remove(path);
    else if (QDir().mkpath(info.absolutePath())) { QSaveFile file(path); const auto data = startupDesktop(); success = file.open(QIODevice::WriteOnly) && file.write(data) == data.size() && file.commit(); if (success) QFile::setPermissions(path, QFileDevice::ReadOwner | QFileDevice::WriteOwner); }
#endif
    m_error = success ? QString{} : "startupError"; emit changed();
}
QString DesktopIntegration::diagnostics() const {
    return "Viezan " + QCoreApplication::applicationVersion() + "\n" + QSysInfo::prettyProductName() + "\n" + QSysInfo::currentCpuArchitecture() + " · CPU: " + QString::number(QThread::idealThreadCount()) + "\nQt: " + qVersion() + " · " + QGuiApplication::platformName();
}
void DesktopIntegration::openPrivacySettings() {
#ifdef Q_OS_WIN
    QDesktopServices::openUrl(QUrl("ms-settings:privacy-microphone"));
#elif defined(Q_OS_LINUX)
    for (const auto &program : {"gnome-control-center", "systemsettings"}) {
        const auto path = QStandardPaths::findExecutable(program, {"/usr/bin", "/bin"});
        if (!path.isEmpty()) { QProcess::startDetached(path, {}); return; }
    }
#endif
}

void DesktopIntegration::searchWeb(const QString &query) {
    if (query.trimmed().isEmpty() || query.size() > 4096) return;
    QUrl url("https://www.google.com/search"); QUrlQuery parameters; parameters.addQueryItem("q", query); url.setQuery(parameters); QDesktopServices::openUrl(url);
}
void DesktopIntegration::revealFile(const QString &path) {
    bool known = false; for (const auto &value : m_files) if (value.toMap().value("id") == path) known = true;
    for (const auto &value : m_applications) if (value.toMap().value("id") == path) known = true;
    if (!known || QFileInfo(path).canonicalFilePath() != path) return;
#ifdef Q_OS_WIN
    const auto executable = qEnvironmentVariable("SystemRoot") + "/explorer.exe";
    QProcess::startDetached(executable, {"/select,", QDir::toNativeSeparators(path)});
#else
    QDesktopServices::openUrl(QUrl::fromLocalFile(QFileInfo(path).absolutePath()));
#endif
}

bool DesktopIntegration::replaceSelection(const QString &text) {
    const bool success = m_selection.replace(text); m_error = success ? QString{} : QString("selectionChanged"); emit changed(); return success;
}
bool DesktopIntegration::undoSelection() {
    const bool success = m_selection.undo(); m_error = success ? QString{} : QString("selectionChanged"); emit changed(); return success;
}

#include "AppUninstall.h"
#include <QCryptographicHash>
#include <QFutureWatcher>
#include <QRegularExpression>
#include <QSet>
#include <QtConcurrent/QtConcurrent>

namespace AppRemoval {
namespace {
QString stableID(const QString &source, const QString &key) {
    return source + ":" + QString::fromLatin1(QCryptographicHash::hash(key.toUtf8(), QCryptographicHash::Sha256).toHex());
}
Entry entry(const QString &source, const QString &key, const QString &name) {
    return {{{"id", stableID(source, key)}, {"source", source}, {"name", name},
             {"canUninstall", false}, {"canUndo", false}, {"undoKind", "none"},
             {"requiresAuthorization", false}, {"action", "unsupported"}}, {}, {}, {}};
}
bool token(const QString &value) {
    return QRegularExpression("^[A-Za-z0-9][A-Za-z0-9._+:/-]*$").match(value).hasMatch();
}
void issue(Inventory &inventory, const QString &error) {
    inventory.complete = false;
    inventory.errors.append(error);
}
bool ok(const ProcessResult &r) { return r.started && r.finished && r.exitCode == 0 && r.error.isEmpty(); }
void configure(Entry &e, const Dependencies &d, const QString &program, QStringList arguments, bool privileged) {
    const auto executable = d.tool(program);
    if (executable.isEmpty()) { e.data["reason"] = "toolUnavailable"; return; }
    if (privileged) {
        const auto pkexec = d.tool("pkexec");
        if (pkexec.isEmpty()) { e.data["reason"] = "authorizationUnavailable"; return; }
        arguments.prepend(executable);
        e.command = {pkexec, arguments, {}, false};
    } else e.command = {executable, arguments, {}, false};
    e.data["canUninstall"] = true;
    e.data["action"] = "uninstall";
    e.data["requiresAuthorization"] = privileged;
}
void scanWindows(Inventory &inventory, const Dependencies &d) {
    const auto records = d.registry();
    inventory.complete = records.complete;
    inventory.errors = records.errors;
    for (const auto &value : records.rows) {
        const auto r = value.toMap();
        const auto name = r.value("DisplayName").toString().trimmed();
        const auto release = r.value("ReleaseType").toString();
        if (name.isEmpty() || r.value("SystemComponent").toInt() == 1 ||
            !r.value("ParentKeyName").toString().isEmpty() ||
            release.contains("update", Qt::CaseInsensitive) || release.contains("hotfix", Qt::CaseInsensitive)) continue;
        const auto source = r.value("Store").toBool() ? QString("msix") : QString("registry");
        auto e = entry(source, r.value("key").toString(), name);
        e.data["version"] = r.value("DisplayVersion");
        e.data["publisher"] = r.value("Publisher");
        e.data["installLocation"] = r.value("InstallLocation");
        e.data["estimatedBytes"] = r.value("EstimatedSize").toULongLong() * 1024ULL;
        if (source == "msix") {
            e.data["action"] = "openSettings";
            e.data["settingsUrl"] = "ms-settings:appsfeatures";
        } else {
            e.command = windowsCommand(r, d.tool("msiexec"));
            e.data["canUninstall"] = !e.command.program.isEmpty();
            e.data["action"] = e.command.program.isEmpty() ? "unsupported" : "uninstall";
            if (e.command.program.isEmpty()) e.data["reason"] = "invalidUninstallCommand";
        }
        inventory.entries.append(e);
    }
    // Store/MSIX enumeration is not complete for every Windows release/account.
    auto settings = entry("msix", "settings", "Microsoft Store / MSIX");
    settings.data["action"] = "openSettings";
    settings.data["settingsUrl"] = "ms-settings:appsfeatures";
    inventory.entries.append(settings);
}
void scanLinux(Inventory &inventory, const Dependencies &d) {
    const auto flatpak = d.tool("flatpak");
    if (!flatpak.isEmpty()) for (const auto &scope : {QString("user"), QString("system")}) {
        const auto r = d.run({flatpak, {"list", "--app", "--" + scope, "--columns=ref,name,version"}, {}, false});
        if (!ok(r)) { issue(inventory, "flatpak:" + scope + ":scanFailed"); continue; }
        for (const auto &line : QString::fromUtf8(r.output).split('\n', Qt::SkipEmptyParts)) {
            const auto fields = line.split('\t');
            const auto ref = fields[0].count('/') == 2 ? "app/" + fields[0] : fields[0];
            if (fields.size() < 3 || !token(ref) || ref.count('/') != 3 || !ref.startsWith("app/")) {
                issue(inventory, "flatpak:invalidRecord"); continue;
            }
            auto e = entry("flatpak", scope + ":" + ref, fields[1]);
            e.data["scope"] = scope; e.data["version"] = fields[2];
            configure(e, d, "flatpak", {"uninstall", "--" + scope, "--noninteractive", ref}, scope == "system");
            inventory.entries.append(e);
        }
    }
    const auto snap = d.tool("snap");
    if (!snap.isEmpty()) {
        const auto r = d.run({snap, {"list"}, {}, false});
        const bool empty = r.started && r.finished && r.error.isEmpty() && r.exitCode == 1 &&
            r.output.trimmed().startsWith("No snaps are installed");
        if (empty) { /* snap uses exit 1 for an empty installation. */ }
        else if (!ok(r)) issue(inventory, "snap:scanFailed");
        else for (const auto &line : QString::fromUtf8(r.output).split('\n', Qt::SkipEmptyParts)) {
            const auto fields = line.simplified().split(' ');
            if (fields.value(0) == "Name" || line.startsWith("No snaps are installed")) continue;
            if (fields.size() < 6 || !QRegularExpression("^[a-z0-9][a-z0-9_-]*$").match(fields[0]).hasMatch()) {
                issue(inventory, "snap:invalidRecord"); continue;
            }
            auto e = entry("snap", fields[0], fields[0]);
            e.data["version"] = fields[1]; e.data["publisher"] = fields[4]; e.data["scope"] = "system";
            configure(e, d, "snap", {"remove", fields[0]}, true);
            inventory.entries.append(e);
        }
    }
    const auto desktops = d.desktops();
    if (!desktops.complete) { inventory.complete = false; inventory.errors += desktops.errors; }
    const auto dpkg = d.tool("dpkg"), rpm = d.tool("rpm");
    for (const auto &value : desktops.rows) {
        const auto desktop = value.toMap();
        const auto path = desktop.value("path").toString();
        // Only an absolute executable directly named by Exec is eligible. No env/shell wrappers.
        const auto exec = desktop.value("Exec").toString();
        const auto match = QRegularExpression(R"re(^(?:"([^"%]+\.AppImage)"|([^\s"%]+\.AppImage))(?:\s|$))re").match(exec);
        const auto image = match.captured(1).isEmpty() ? match.captured(2) : match.captured(1);
        if (image.startsWith('/')) {
            const auto info = d.appImageInfo(image);
            if (info.value("valid").toBool()) {
                auto e = entry("appimage", image, desktop.value("Name").toString());
                e.appImage = image; e.fingerprint = info;
                e.data["installLocation"] = image; e.data["canUninstall"] = true;
                e.data["canUndo"] = true; e.data["undoKind"] = "systemTrash"; e.data["action"] = "trash";
                inventory.entries.append(e);
            }
            continue;
        }
        if (!path.startsWith('/') || (dpkg.isEmpty() && rpm.isEmpty())) continue;
        const bool deb = !dpkg.isEmpty();
        const auto r = d.run(deb ? Command{dpkg, {"-S", path}, {}, false}
                                : Command{rpm, {"-qf", "--qf", "%{NAME}\\n", path}, {}, false});
        if (r.started && r.finished && r.exitCode == 1) continue; // unowned desktop file
        if (!ok(r)) { issue(inventory, "packages:ownerQueryFailed"); continue; }
        for (auto owner : QString::fromUtf8(r.output).split('\n', Qt::SkipEmptyParts)) {
            if (deb) {
                const auto delimiter = owner.indexOf(": ");
                if (delimiter < 0 || owner.mid(delimiter + 2) != path) { issue(inventory, "packages:ambiguousOwner"); continue; }
                owner = owner.left(delimiter);
            }
            if (!QRegularExpression("^[a-zA-Z0-9][a-zA-Z0-9.+_-]*(?::[a-zA-Z0-9_-]+)?$").match(owner).hasMatch()) {
                issue(inventory, "packages:invalidOwner"); continue;
            }
            auto e = entry(deb ? "deb" : "rpm", owner, desktop.value("Name").toString());
            e.data["package"] = owner; e.data["scope"] = "system";
            // The desktop owner can contain multiple apps; never purge data or autoremove.
            configure(e, d, deb ? "apt-get" : "dnf", {"remove", "-y", "--", owner}, true);
            inventory.entries.append(e);
        }
    }
}
bool sameAction(const Entry &a, const Entry &b) {
    return a.command.program == b.command.program && a.command.arguments == b.command.arguments &&
        a.command.nativeArguments == b.command.nativeArguments && a.appImage == b.appImage &&
        a.fingerprint == b.fingerprint && a.data == b.data;
}
}

Command windowsCommand(const QVariantMap &record, const QString &msiexec) {
    const auto raw = record.value("UninstallString").toString().trimmed();
    const QRegularExpression guid("\\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\}");
    const bool msi = record.value("WindowsInstaller").toInt() == 1 ||
        QRegularExpression(R"re(^"?(?:[^"\r\n]*[\\/])?msiexec(?:\.exe)?"?\s)re", QRegularExpression::CaseInsensitiveOption).match(raw).hasMatch();
    if (msi) {
        auto product = guid.match(record.value("key").toString().section('\\', -1));
        if (!product.hasMatch()) product = guid.match(raw);
        if (!product.hasMatch() || msiexec.isEmpty()) return {};
        return {msiexec, {}, "/x " + product.captured(), true};
    }
    if (raw.isEmpty() || raw.contains('\n') || raw.contains('\r')) return {};
    QString executable, args;
    if (raw.startsWith('"')) {
        const auto end = raw.indexOf('"', 1);
        if (end < 0 || (end + 1 < raw.size() && !raw[end + 1].isSpace())) return {};
        executable = raw.mid(1, end - 1); args = raw.mid(end + 1).trimmed();
    } else {
        // Refuse ambiguous unquoted paths with spaces; never guess C:\Program.exe.
        const auto end = raw.indexOf(QRegularExpression("\\s"));
        executable = end < 0 ? raw : raw.left(end); args = end < 0 ? QString() : raw.mid(end).trimmed();
    }
    if (!QRegularExpression("^[A-Za-z]:[\\\\/].*\\.exe$", QRegularExpression::CaseInsensitiveOption).match(executable).hasMatch()) return {};
    return {executable, {}, args, true};
}

QVariantList Inventory::rows() const { QVariantList result; for (const auto &e : entries) result.append(e.data); return result; }
Inventory scan(const Dependencies &d) {
    Inventory result;
    if (d.platform == Platform::Windows) scanWindows(result, d);
    else if (d.platform == Platform::Linux) scanLinux(result, d);
    else issue(result, "unsupportedPlatform");
    QSet<QString> ids;
    QList<Entry> unique;
    for (const auto &e : result.entries) {
        const auto id = e.data.value("id").toString();
        if (!ids.contains(id)) { ids.insert(id); unique.append(e); }
    }
    result.entries = unique;
    return result;
}
QVariantMap remove(const Dependencies &d, const Entry &selected, Inventory *after) {
    QVariantMap result{{"id", selected.data.value("id")}, {"status", "staleInventory"}, {"verifiedRemoved", false}};
    *after = scan(d);
    if (!after->complete) { result["status"] = "inventoryIncomplete"; return result; }
    bool found = false;
    for (const auto &e : after->entries) if (e.data.value("id") == selected.data.value("id") && sameAction(e, selected)) found = true;
    if (!found || !selected.data.value("canUninstall").toBool()) return result;
    ProcessResult process;
    if (!selected.appImage.isEmpty()) {
        // Recheck immediately before the only filesystem mutation.
        if (d.appImageInfo(selected.appImage) != selected.fingerprint) return result;
        QString trashPath;
        const bool moved = d.trash(selected.appImage, &trashPath);
        process = {true, true, moved ? 0 : 1, {}, {}};
        result["undoKind"] = moved ? "systemTrash" : "none";
        result["canUndo"] = moved;
    } else process = d.run(selected.command);
    *after = scan(d);
    bool present = false;
    for (const auto &e : after->entries) if (e.data.value("id") == selected.data.value("id")) present = true;
    const auto source = selected.data.value("source").toString();
    if (source == "deb" || source == "rpm") {
        // A launcher disappearing does not prove that its owning package was removed.
        const auto package = selected.data.value("package").toString();
        const auto check = d.run(source == "deb" ? Command{d.tool("dpkg"), {"-s", package}, {}, false}
                                                : Command{d.tool("rpm"), {"-q", package}, {}, false});
        const bool explicitlyAbsent = source == "deb"
            ? check.output.contains("is not installed") || check.output.contains("no packages found matching")
            : check.output.contains(("package " + package + " is not installed").toUtf8());
        if (check.started && check.finished && check.error.isEmpty() && check.exitCode == 1 && explicitlyAbsent) present = false;
        else if (ok(check)) {
            if (source == "rpm") present = true;
            else {
                const auto status = QRegularExpression("^Status: \\S+ \\S+ (\\S+)", QRegularExpression::MultilineOption)
                    .match(QString::fromUtf8(check.output));
                if (!status.hasMatch()) issue(*after, "packages:verificationFailed");
                else present = status.captured(1) != "not-installed" && status.captured(1) != "config-files";
            }
        }
        else issue(*after, "packages:verificationFailed");
    }
    // AppImage removal is verified against the selected file, not only its launcher.
    if (!selected.appImage.isEmpty() && d.appImageInfo(selected.appImage).value("exists").toBool()) present = true;
    result["started"] = process.started; result["processFinished"] = process.finished;
    result["exitCode"] = process.exitCode; result["inventoryComplete"] = after->complete;
    if (!process.started) result["status"] = process.error == "cancelled" ? "cancelled" : "startFailed";
    else if (!process.finished) result["status"] = "unverified";
    else if (process.exitCode == 1602 || process.exitCode == 1223 || process.exitCode == 126) result["status"] = "cancelled";
    else if (d.platform == Platform::Windows && (process.exitCode == 3010 || process.exitCode == 1641)) result["status"] = "restartRequired";
    else if (process.exitCode != 0 || !process.error.isEmpty()) result["status"] = "failed";
    else if (!after->complete) result["status"] = "unverified";
    else if (present) result["status"] = "stillInstalled";
    else { result["status"] = "removed"; result["verifiedRemoved"] = true; }
    return result;
}
}

AppUninstall::AppUninstall(QObject *parent) : AppUninstall(AppRemoval::nativeDependencies(), parent) {}
AppUninstall::AppUninstall(AppRemoval::Dependencies dependencies, QObject *parent)
    : QObject(parent), m_dependencies(std::move(dependencies)) { m_inventory.complete = false; }
AppUninstall::~AppUninstall() { m_future.waitForFinished(); }
void AppUninstall::start(std::function<Outcome()> operation) {
    m_busy = true; m_result.clear(); emit changed();
    auto *watcher = new QFutureWatcher<Outcome>(this);
    connect(watcher, &QFutureWatcher<Outcome>::finished, this, [this, watcher] {
        const auto outcome = watcher->result(); watcher->deleteLater();
        m_inventory = outcome.inventory; m_result = outcome.result; m_busy = false;
        if (m_result.value("started").toBool() && !m_result.value("processFinished").toBool())
            m_operationUnverified = true;
        emit changed(); emit finished(m_result);
    });
    m_future = QtConcurrent::run(std::move(operation)); watcher->setFuture(m_future);
}
bool AppUninstall::inventory() {
    if (m_busy) return false;
    const auto d = m_dependencies;
    start([d] { auto inventory = AppRemoval::scan(d); return Outcome{inventory, {{"status", inventory.complete ? "scanned" : "inventoryIncomplete"}}}; });
    return true;
}
bool AppUninstall::uninstall(const QString &id, bool authorizeSystem) {
    if (m_busy) return false;
    if (m_operationUnverified) {
        m_result = {{"id", id}, {"status", "operationUnverified"}};
        emit changed(); emit finished(m_result); return false;
    }
    for (const auto &e : m_inventory.entries) if (e.data.value("id").toString() == id) {
        if (e.data.value("action") == "openSettings") {
            m_result = {{"id", id}, {"status", "openSettings"}, {"settingsUrl", "ms-settings:appsfeatures"}};
            emit changed(); emit finished(m_result); return false;
        }
        if (!m_inventory.complete || !e.data.value("canUninstall").toBool()) break;
        if (e.data.value("requiresAuthorization").toBool() && !authorizeSystem) {
            m_result = {{"id", id}, {"status", "authorizationRequired"}};
            emit changed(); emit finished(m_result); return false;
        }
        const auto d = m_dependencies;
        start([d, e] { Outcome result; result.result = AppRemoval::remove(d, e, &result.inventory); return result; });
        return true;
    }
    m_result = {{"id", id}, {"status", "notAllowed"}}; emit changed(); emit finished(m_result); return false;
}

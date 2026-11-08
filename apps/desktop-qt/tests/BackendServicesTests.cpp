#include "../AppUninstall.h"
#include "../SystemAppearance.h"
#include <QCoreApplication>
#include <QEvent>
#include <QSignalSpy>
#include <QStandardPaths>
#include <QTest>
#include <atomic>

using namespace AppRemoval;
namespace {
ProcessResult success(QByteArray output = {}) { return {true, true, 0, output, {}}; }
QVariantMap winRecord(QString name = "Example") {
    return {{"key", "hklm64\\Example"}, {"DisplayName", name}, {"DisplayVersion", "1.2"},
            {"Publisher", "Vendor"}, {"EstimatedSize", 42}, {"InstallLocation", "C:\\Example"},
            {"UninstallString", "\"C:\\Program Files\\Example\\uninstall.exe\" /uninstall \"two words\""},
            {"QuietUninstallString", "C:\\NEVER-RUN.exe /silent"}};
}
struct Fake {
    Records registry, desktops;
    QSet<QString> tools;
    QList<Command> commands;
    QVariantMap image{{"valid", true}, {"exists", true}, {"size", 50}, {"modified", 1}};
    QStringList trashed;
    bool trashSuccess = true;
    std::function<ProcessResult(const Command &)> reply = [](const Command &) { return success(); };
    Dependencies dependencies(Platform platform) {
        Dependencies d;
        d.platform = platform;
        d.registry = [this] { return registry; };
        d.desktops = [this] { return desktops; };
        d.tool = [this](const QString &name) { return tools.contains(name) ? "/trusted/" + name : QString(); };
        d.run = [this](const Command &c) { commands.append(c); return reply(c); };
        d.appImageInfo = [this](const QString &) { return image; };
        d.trash = [this](const QString &path, QString *destination) {
            trashed.append(path); *destination = "/fake/Trash/item";
            if (trashSuccess) image = {{"valid", false}, {"exists", false}};
            return trashSuccess;
        };
        return d;
    }
};
Entry firstSource(const Inventory &inventory, const QString &source) {
    for (const auto &e : inventory.entries) if (e.data.value("source") == source) return e;
    return {};
}
}

class BackendServicesTests : public QObject {
    Q_OBJECT
private slots:
    void registryFiltersAndMetadata() {
        Fake f; f.registry.rows.append(winRecord());
        for (const auto &field : {QString("SystemComponent"), QString("ParentKeyName"), QString("ReleaseType")}) {
            auto hidden = winRecord("Hidden"); hidden[field] = field == "SystemComponent" ? QVariant(1) : QVariant("Security Update");
            f.registry.rows.append(hidden);
        }
        auto hotfix = winRecord("Hotfix"); hotfix["ReleaseType"] = "Hotfix"; f.registry.rows.append(hotfix);
        auto store = winRecord("Store app"); store["key"] = "msix\\package"; store["Store"] = true; f.registry.rows.append(store);
        const auto d = f.dependencies(Platform::Windows);
        const auto inventory = scan(d);
        QCOMPARE(inventory.entries.size(), 3);
        const auto app = firstSource(inventory, "registry");
        QCOMPARE(app.data.value("estimatedBytes").toULongLong(), 42ULL * 1024);
        QCOMPARE(app.data.value("publisher").toString(), "Vendor");
        QVERIFY(app.data.value("canUninstall").toBool());
        QVERIFY(!app.data.value("canUndo").toBool());
        QCOMPARE(app.command.program, "C:\\Program Files\\Example\\uninstall.exe");
        QCOMPARE(app.command.nativeArguments, "/uninstall \"two words\"");
        QCOMPARE(firstSource(inventory, "msix").data.value("action").toString(), "openSettings");
        QVERIFY(!firstSource(inventory, "msix").data.value("canUninstall").toBool());
        f.registry.rows[0] = winRecord("Renamed");
        QCOMPARE(firstSource(scan(d), "registry").data.value("id"), app.data.value("id"));
        QVERIFY(f.commands.isEmpty());
    }
    void windowsCommandParsing_data() {
        QTest::addColumn<QString>("raw"); QTest::addColumn<QString>("program"); QTest::addColumn<QString>("args");
        QTest::newRow("quoted") << "\"C:\\A B\\remove.exe\" /keep \"a \\\"quoted\\\" value\"" << "C:\\A B\\remove.exe" << "/keep \"a \\\"quoted\\\" value\"";
        QTest::newRow("simple") << "C:\\App\\remove.exe /u" << "C:\\App\\remove.exe" << "/u";
        QTest::newRow("ambiguous") << "C:\\Program Files\\remove.exe /u" << "" << "";
        QTest::newRow("unclosed") << "\"C:\\remove.exe /u" << "" << "";
        QTest::newRow("relative") << "remove.exe /u" << "" << "";
        QTest::newRow("url") << "https://example.com/remove.exe" << "" << "";
        QTest::newRow("bat") << "C:\\remove.cmd" << "" << "";
        QTest::newRow("quoted-no-space") << "\"C:\\remove.exe\"/u" << "" << "";
    }
    void windowsCommandParsing() {
        QFETCH(QString, raw); QFETCH(QString, program); QFETCH(QString, args);
        const auto c = windowsCommand({{"UninstallString", raw}}, "C:\\Windows\\System32\\msiexec.exe");
        QCOMPARE(c.program, program); QCOMPARE(c.nativeArguments, args);
    }
    void msiUsesInteractiveRemove() {
        const QString guid = "{12345678-1234-1234-1234-123456789ABC}";
        for (const auto &raw : {"MsiExec.exe /I" + guid, "\"msiexec.exe\" /X " + guid + " /qn", "\"C:\\Windows\\System32\\msiexec.exe\" /I" + guid}) {
            const auto c = windowsCommand({{"UninstallString", raw}}, "C:\\Windows\\System32\\msiexec.exe");
            QCOMPARE(c.nativeArguments, "/x " + guid); QVERIFY(c.interactive);
        }
        QCOMPARE(windowsCommand({{"WindowsInstaller", 1}, {"key", "hklm64\\" + guid}}, "msiexec").nativeArguments, "/x " + guid);
        QVERIFY(windowsCommand({{"WindowsInstaller", 1}, {"UninstallString", "bad"}}, "msiexec").program.isEmpty());
    }
    void removalOutcomes_data() {
        QTest::addColumn<int>("code"); QTest::addColumn<bool>("finished"); QTest::addColumn<bool>("disappear");
        QTest::addColumn<QString>("status");
        QTest::newRow("verified") << 0 << true << true << "removed";
        QTest::newRow("vendor-spawns-child") << 0 << true << false << "stillInstalled";
        QTest::newRow("still-running") << 0 << false << true << "unverified";
        QTest::newRow("cancelled") << 1602 << true << false << "cancelled";
        QTest::newRow("error") << 5 << true << false << "failed";
        QTest::newRow("restart") << 3010 << true << true << "restartRequired";
    }
    void removalOutcomes() {
        QFETCH(int, code); QFETCH(bool, finished); QFETCH(bool, disappear); QFETCH(QString, status);
        Fake f; f.registry.rows.append(winRecord()); auto d = f.dependencies(Platform::Windows);
        const auto selected = firstSource(scan(d), "registry");
        f.reply = [&](const Command &) { if (disappear) f.registry.rows.clear(); return ProcessResult{true, finished, code, {}, {}}; };
        Inventory after; const auto result = remove(d, selected, &after);
        QCOMPARE(result.value("status").toString(), status);
        QCOMPARE(result.value("verifiedRemoved").toBool(), status == "removed");
        QCOMPARE(f.commands.size(), 1); QVERIFY(f.trashed.isEmpty());
    }
    void failedLaunchAndPartialRescan() {
        Fake f; f.registry.rows.append(winRecord()); auto d = f.dependencies(Platform::Windows);
        const auto selected = firstSource(scan(d), "registry"); Inventory after;
        f.reply = [](const Command &) { return ProcessResult{false, false, -1, {}, "cancelled"}; };
        QCOMPARE(remove(d, selected, &after).value("status").toString(), "cancelled");
        f.reply = [&](const Command &) { f.registry.rows.clear(); f.registry.complete = false; return success(); };
        QCOMPARE(remove(d, selected, &after).value("status").toString(), "unverified");
    }
    void staleInventoryCannotExecute() {
        Fake f; f.registry.rows.append(winRecord()); auto d = f.dependencies(Platform::Windows);
        const auto selected = firstSource(scan(d), "registry");
        auto changed = winRecord(); changed["UninstallString"] = "C:\\Changed.exe"; f.registry.rows = {changed};
        Inventory after; QCOMPARE(remove(d, selected, &after).value("status").toString(), "staleInventory");
        f.registry.complete = false;
        QCOMPARE(remove(d, selected, &after).value("status").toString(), "inventoryIncomplete");
        QVERIFY(f.commands.isEmpty());
    }
    void linuxInventoryScopesAndCommands() {
        Fake f; f.tools = {"flatpak", "snap", "pkexec"};
        f.reply = [](const Command &c) {
            if (c.program.endsWith("flatpak")) return success("app/org.example.App/x86_64/stable\tExample\t1.0\n");
            return success("Name Version Rev Tracking Publisher Notes\nexample 2.0 12 latest/stable vendor -\n");
        };
        const auto inventory = scan(f.dependencies(Platform::Linux));
        QVERIFY(inventory.complete); QCOMPARE(inventory.entries.size(), 3);
        const auto user = inventory.entries[0], system = inventory.entries[1], snap = inventory.entries[2];
        QVERIFY(user.data.value("id") != system.data.value("id"));
        QCOMPARE(user.command.program, "/trusted/flatpak");
        QCOMPARE(user.command.arguments, QStringList({"uninstall", "--user", "--noninteractive", "app/org.example.App/x86_64/stable"}));
        QCOMPARE(system.command.program, "/trusted/pkexec");
        QCOMPARE(system.command.arguments[0], "/trusted/flatpak");
        QVERIFY(system.command.arguments.contains("--system"));
        QCOMPARE(snap.command.arguments, QStringList({"/trusted/snap", "remove", "example"}));
        QVERIFY(!snap.data.value("canUndo").toBool());
        for (const auto &c : f.commands) QVERIFY(c.arguments.contains("list"));
    }
    void packageOwnersAndVerification_data() {
        QTest::addColumn<bool>("deb"); QTest::newRow("dpkg") << true; QTest::newRow("rpm") << false;
    }
    void packageOwnersAndVerification() {
        QFETCH(bool, deb);
        Fake f; f.tools = {deb ? "dpkg" : "rpm", deb ? "apt-get" : "dnf", "pkexec"};
        f.desktops.rows = {QVariantMap{{"path", "/usr/share/applications/a.desktop"}, {"Name", "A"}, {"Exec", "/usr/bin/a"}}};
        bool removedLauncher = false;
        f.reply = [&](const Command &c) {
            if (c.program.endsWith("pkexec")) { removedLauncher = true; f.desktops.rows.clear(); return success(); }
            if (c.arguments.contains("-s") || c.arguments.contains("-q")) return success("Status: install ok installed\n");
            return success(deb ? "example:amd64: /usr/share/applications/a.desktop\n" : "example\n");
        };
        const auto d = f.dependencies(Platform::Linux); const auto selected = scan(d).entries[0];
        QCOMPARE(selected.command.arguments, QStringList({deb ? "/trusted/apt-get" : "/trusted/dnf", "remove", "-y", "--", deb ? "example:amd64" : "example"}));
        Inventory after; QCOMPARE(remove(d, selected, &after).value("status").toString(), "stillInstalled");
        QVERIFY(removedLauncher); QVERIFY(!selected.data.value("canUndo").toBool());
    }
    void malformedOutputAndMissingTools() {
        Fake f; f.tools = {"flatpak"};
        f.reply = [](const Command &) { return success("--all\tMalicious\t1\n"); };
        auto inventory = scan(f.dependencies(Platform::Linux));
        QVERIFY(!inventory.complete); QVERIFY(inventory.entries.isEmpty());
        f.reply = [](const Command &) { return success("app/org.example.App/x86_64/stable\tA\t1\n"); };
        inventory = scan(f.dependencies(Platform::Linux));
        QVERIFY(inventory.entries[0].data.value("canUninstall").toBool());
        QVERIFY(!inventory.entries[1].data.value("canUninstall").toBool()); // no pkexec
    }
    void flatpakShortRefAndEmptySnap() {
        Fake f; f.tools = {"flatpak", "snap"};
        f.reply = [](const Command &c) {
            if (c.program.endsWith("snap")) return ProcessResult{true, true, 1, "No snaps are installed yet. Try 'snap install hello-world'.\n", {}};
            return success("org.example.App/x86_64/stable\tExample\t\n");
        };
        const auto inventory = scan(f.dependencies(Platform::Linux));
        QVERIFY(inventory.complete); QCOMPARE(inventory.entries.size(), 2);
        QCOMPARE(inventory.entries[0].command.arguments.last(), "app/org.example.App/x86_64/stable");
    }
    void dpkgStates_data() {
        QTest::addColumn<QByteArray>("reply"); QTest::addColumn<QString>("status");
        QTest::addColumn<int>("exitCode");
        QTest::newRow("hold-installed") << QByteArray("Status: hold ok installed\n") << "stillInstalled" << 0;
        QTest::newRow("half-installed") << QByteArray("Status: deinstall reinstreq half-installed\n") << "stillInstalled" << 0;
        QTest::newRow("residual-config") << QByteArray("Status: deinstall ok config-files\n") << "removed" << 0;
        QTest::newRow("unknown") << QByteArray("warning without status\n") << "unverified" << 0;
        QTest::newRow("absent") << QByteArray("dpkg-query: package 'example' is not installed and no information is available\n") << "removed" << 1;
        QTest::newRow("database-unreadable") << QByteArray("dpkg-query: error: cannot open database\n") << "unverified" << 1;
    }
    void dpkgStates() {
        QFETCH(QByteArray, reply); QFETCH(QString, status); QFETCH(int, exitCode);
        Fake f; f.tools = {"dpkg", "apt-get", "pkexec"};
        f.desktops.rows = {QVariantMap{{"path", "/usr/share/applications/a.desktop"}, {"Exec", "/usr/bin/a"}}};
        f.reply = [&](const Command &c) {
            if (c.arguments.contains("-S")) return success("example: /usr/share/applications/a.desktop\n");
            if (c.arguments.contains("-s")) return ProcessResult{true, true, exitCode, reply, {}};
            f.desktops.rows.clear(); return success();
        };
        const auto d = f.dependencies(Platform::Linux); const auto selected = scan(d).entries[0]; Inventory after;
        QCOMPARE(remove(d, selected, &after).value("status").toString(), status);
    }
    void appImageTrashOnly() {
        Fake f; f.desktops.rows = {QVariantMap{{"path", "/home/fake/app.desktop"}, {"Name", "Portable"}, {"Exec", "\"/home/fake/My App.AppImage\" %U"}}};
        const auto d = f.dependencies(Platform::Linux); const auto selected = scan(d).entries[0];
        QVERIFY(selected.data.value("canUndo").toBool()); QCOMPARE(selected.data.value("undoKind").toString(), "systemTrash");
        Inventory after; const auto result = remove(d, selected, &after);
        QCOMPARE(result.value("status").toString(), "removed");
        QCOMPARE(f.trashed, QStringList({"/home/fake/My App.AppImage"})); QVERIFY(f.commands.isEmpty());
        QVERIFY(after.entries.isEmpty());
    }
    void appImageChangedOrTrashFails() {
        Fake f; f.desktops.rows = {QVariantMap{{"Exec", "/home/fake/App.AppImage %U"}}};
        auto d = f.dependencies(Platform::Linux); const auto selected = scan(d).entries[0]; Inventory after;
        f.image["size"] = 90;
        QCOMPARE(remove(d, selected, &after).value("status").toString(), "staleInventory"); QVERIFY(f.trashed.isEmpty());
        f.image["size"] = 50; f.trashSuccess = false;
        QCOMPARE(remove(d, selected, &after).value("status").toString(), "failed");
        f.image["valid"] = false; // e.g. symlink or missing file
        QVERIFY(scan(d).entries.isEmpty());
    }
    void asyncServiceConsentAndStore() {
        Fake f; f.registry.rows.append(winRecord());
        AppUninstall service(f.dependencies(Platform::Windows)); QSignalSpy finished(&service, &AppUninstall::finished);
        QVERIFY(!service.uninstall("unknown"));
        QVERIFY(service.inventory()); QVERIFY(service.busy()); QVERIFY(!service.inventory());
        QVERIFY(!service.uninstall("unknown")); QTRY_VERIFY(!service.busy());
        const auto store = firstSource(scan(f.dependencies(Platform::Windows)), "msix");
        QVERIFY(!service.uninstall(store.data.value("id").toString()));
        QCOMPARE(service.lastResult().value("settingsUrl").toString(), "ms-settings:appsfeatures");
        QVERIFY(f.commands.isEmpty()); QVERIFY(finished.count() >= 3);

        Fake linuxFake; linuxFake.tools = {"snap", "pkexec"};
        bool installed = true;
        linuxFake.reply = [&](const Command &c) {
            if (c.program.endsWith("pkexec")) { installed = false; return success(); }
            return success(installed ? "Name Version Rev Tracking Publisher Notes\nexample 1 1 stable vendor -\n" : "Name Version Rev Tracking Publisher Notes\n");
        };
        AppUninstall linuxService(linuxFake.dependencies(Platform::Linux));
        QVERIFY(linuxService.inventory()); QTRY_VERIFY(!linuxService.busy());
        const auto id = linuxService.apps()[0].toMap().value("id").toString();
        linuxFake.commands.clear(); QVERIFY(!linuxService.uninstall(id));
        QCOMPARE(linuxService.lastResult().value("status").toString(), "authorizationRequired");
        QVERIFY(linuxFake.commands.isEmpty());
        QVERIFY(linuxService.uninstall(id, true)); QTRY_VERIFY(!linuxService.busy());
        QCOMPARE(linuxService.lastResult().value("status").toString(), "removed");
    }
    void appearanceNotifiesAndActivationRefreshes() {
        std::atomic_int flags{0}; std::atomic_int reads{0};
        SystemAppearance appearance([&] { ++reads; const int value = flags.load(); return SystemAppearance::State{bool(value & 1), bool(value & 2)}; });
        QSignalSpy transparency(&appearance, &SystemAppearance::reduceTransparencyChanged);
        QSignalSpy contrast(&appearance, &SystemAppearance::highContrastChanged);
        QTRY_VERIFY(reads.load() > 0);
        flags = 1; appearance.refresh(); QTRY_VERIFY(appearance.reduceTransparency());
        QCOMPARE(transparency.count(), 1); QCOMPARE(contrast.count(), 0);
        flags = 3; QEvent activated(QEvent::ApplicationActivate); QCoreApplication::sendEvent(qApp, &activated);
        QTRY_VERIFY(appearance.highContrast()); QCOMPARE(contrast.count(), 1);
        const auto previousReads = reads.load(); appearance.refresh(); QTRY_VERIFY(reads.load() > previousReads);
        flags = 0; appearance.refresh(); QTRY_VERIFY(!appearance.reduceTransparency() && !appearance.highContrast());
        QCOMPARE(transparency.count(), 2); QCOMPARE(contrast.count(), 2);
    }
    void unconfirmedProcessBlocksAnotherRemoval() {
        Fake f; f.registry.rows.append(winRecord());
        f.reply = [](const Command &) { return ProcessResult{true, false, -1, {}, {}}; };
        AppUninstall service(f.dependencies(Platform::Windows));
        QVERIFY(service.inventory()); QTRY_VERIFY(!service.busy());
        const auto id = service.apps()[0].toMap().value("id").toString();
        QVERIFY(service.uninstall(id)); QTRY_VERIFY(!service.busy());
        QVERIFY(service.operationUnverified());
        QVERIFY(!service.uninstall(id));
        QCOMPARE(service.lastResult().value("status").toString(), "operationUnverified");
        QCOMPARE(f.commands.size(), 1);
    }
};
int main(int argc, char **argv) {
    QCoreApplication application(argc, argv);
    application.setOrganizationName("ViezanBackendTests");
    application.setApplicationName("ViezanBackendUninstallSolidTests");
    QStandardPaths::setTestModeEnabled(true);
    BackendServicesTests tests;
    return QTest::qExec(&tests, argc, argv);
}
#include "BackendServicesTests.moc"

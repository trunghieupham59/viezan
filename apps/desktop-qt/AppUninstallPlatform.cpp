#include "AppUninstall.h"
#include <QDir>
#include <QDirIterator>
#include <QDateTime>
#include <QElapsedTimer>
#include <QFile>
#include <QFileInfo>
#include <QProcess>
#include <QProcessEnvironment>
#include <QStandardPaths>
#include <QSet>
#ifdef Q_OS_WIN
#define NOMINMAX
#include <windows.h>
#include <shellapi.h>
#endif

namespace AppRemoval {
namespace {
constexpr int outputLimit = 8 * 1024 * 1024;
#ifdef Q_OS_WIN
QString expanded(const QString &value) {
    const DWORD size = ExpandEnvironmentStringsW(reinterpret_cast<LPCWSTR>(value.utf16()), nullptr, 0);
    if (!size || size > 32768) return {};
    std::wstring buffer(size, L'\0');
    if (!ExpandEnvironmentStringsW(reinterpret_cast<LPCWSTR>(value.utf16()), buffer.data(), size)) return {};
    return QString::fromWCharArray(buffer.c_str());
}
QVariant registryValue(HKEY key, const wchar_t *name) {
    DWORD type = 0, size = 0;
    if (RegQueryValueExW(key, name, nullptr, &type, nullptr, &size) != ERROR_SUCCESS || size > 65536) return {};
    QByteArray bytes(int(size) + 2, '\0');
    if (RegQueryValueExW(key, name, nullptr, &type, reinterpret_cast<LPBYTE>(bytes.data()), &size) != ERROR_SUCCESS) return {};
    if (type == REG_DWORD && size == sizeof(DWORD)) { DWORD number; memcpy(&number, bytes.constData(), sizeof(number)); return uint(number); }
    if ((type == REG_SZ || type == REG_EXPAND_SZ) && size % 2 == 0) {
        const auto text = QString::fromWCharArray(reinterpret_cast<const wchar_t *>(bytes.constData()));
        return type == REG_EXPAND_SZ ? expanded(text) : text;
    }
    return {};
}
Records readRegistry() {
    Records result;
    struct Root { HKEY hive; const wchar_t *path; REGSAM view; const char *label; bool store; };
    const Root roots[] = {
        {HKEY_LOCAL_MACHINE, L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall", KEY_WOW64_64KEY, "hklm64", false},
        {HKEY_LOCAL_MACHINE, L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall", KEY_WOW64_32KEY, "hklm32", false},
        {HKEY_CURRENT_USER, L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall", KEY_WOW64_64KEY, "hkcu64", false},
        {HKEY_CURRENT_USER, L"Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages", KEY_WOW64_64KEY, "msix", true}
    };
    for (const auto &root : roots) {
        HKEY key = nullptr;
        const auto opened = RegOpenKeyExW(root.hive, root.path, 0, KEY_READ | root.view, &key);
        if (opened == ERROR_FILE_NOT_FOUND) continue;
        if (opened != ERROR_SUCCESS) {
            // Store is a Settings-only action; failure must not invalidate Win32 verification.
            if (!root.store) { result.complete = false; result.errors.append(QString(root.label) + ":registryUnavailable"); }
            continue;
        }
        for (DWORD index = 0; ; ++index) {
            wchar_t name[256]; DWORD length = 256;
            const auto status = RegEnumKeyExW(key, index, name, &length, nullptr, nullptr, nullptr, nullptr);
            if (status == ERROR_NO_MORE_ITEMS) break;
            if (status != ERROR_SUCCESS || index >= 20000) {
                if (!root.store) { result.complete = false; result.errors.append("registry:enumerationFailed"); }
                break;
            }
            HKEY child = nullptr;
            if (RegOpenKeyExW(key, name, 0, KEY_READ | root.view, &child) != ERROR_SUCCESS) {
                if (!root.store) { result.complete = false; result.errors.append("registry:entryUnavailable"); }
                continue;
            }
            QVariantMap record{{"key", QString(root.label) + "\\" + QString::fromWCharArray(name)}, {"Store", root.store}};
            for (const auto *field : {L"DisplayName", L"DisplayVersion", L"Publisher", L"InstallLocation", L"EstimatedSize",
                                      L"UninstallString", L"QuietUninstallString", L"WindowsInstaller", L"SystemComponent", L"ParentKeyName", L"ReleaseType"})
                record[QString::fromWCharArray(field)] = registryValue(child, field);
            RegCloseKey(child);
            if (root.store && (record.value("DisplayName").toString().isEmpty() || record.value("DisplayName").toString().startsWith('@')))
                record["DisplayName"] = QString::fromWCharArray(name);
            result.rows.append(record);
        }
        RegCloseKey(key);
    }
    return result;
}
#endif
Records readDesktops() {
    Records result;
    const auto directories = QStandardPaths::standardLocations(QStandardPaths::ApplicationsLocation);
    QSet<QString> seen;
    for (const auto &directory : directories) {
        const QFileInfo root(directory);
        if (!root.exists()) continue;
        if (!root.isReadable()) { result.complete = false; result.errors.append("desktop:directoryUnreadable"); continue; }
        QDirIterator iterator(directory, {"*.desktop"}, QDir::Files, QDirIterator::Subdirectories);
        while (iterator.hasNext()) {
            const auto path = iterator.next();
            if (seen.contains(path)) continue;
            seen.insert(path);
            QFile file(path);
            if (result.rows.size() >= 10000 || !file.open(QIODevice::ReadOnly) || file.size() > 1024 * 1024) {
                result.complete = false; result.errors.append("desktop:entryUnreadable"); break;
            }
            // Desktop Entry strings are not INI strings: preserve Exec quoting and % codes.
            QVariantMap row{{"path", path}};
            bool inEntry = false;
            for (const auto &line : QString::fromUtf8(file.readAll()).split('\n')) {
                const auto text = line.trimmed();
                if (text.startsWith('[')) { inEntry = text == "[Desktop Entry]"; continue; }
                if (!inEntry || text.startsWith('#')) continue;
                const auto separator = text.indexOf('=');
                if (separator > 0) row[text.left(separator)] = text.mid(separator + 1);
            }
            if (row.value("Type") == "Application" && row.value("Hidden") != "true") result.rows.append(row);
        }
    }
    return result;
}
QVariantMap imageInfo(const QString &path) {
    const QFileInfo file(path);
    const bool valid = file.isAbsolute() && file.isFile() && !file.isSymLink() &&
        file.fileName().endsWith(".AppImage") && file.canonicalFilePath() == QDir::cleanPath(path);
    return {{"valid", valid}, {"exists", file.exists() || file.isSymLink()}, {"size", file.size()},
            {"modified", file.lastModified().toMSecsSinceEpoch()}, {"canonical", file.canonicalFilePath()}};
}
}

ProcessResult runProcess(const Command &command) {
#ifdef Q_OS_WIN
    if (command.interactive) {
        // ShellExecute supports the vendor manifest's normal UAC. Never retry using runas.
        const auto initialized = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
        const auto file = command.program.toStdWString(), parameters = command.nativeArguments.toStdWString();
        SHELLEXECUTEINFOW info{}; info.cbSize = sizeof(info);
        info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC;
        info.lpFile = file.c_str(); info.lpParameters = parameters.c_str(); info.nShow = SW_SHOWNORMAL;
        ProcessResult result;
        if (!ShellExecuteExW(&info)) result.error = GetLastError() == ERROR_CANCELLED ? "cancelled" : "launchFailed";
        else {
            result.started = true;
            if (info.hProcess) {
                // Do not terminate an installer on timeout. Its outcome stays unverified.
                if (WaitForSingleObject(info.hProcess, 15 * 60 * 1000) == WAIT_OBJECT_0) {
                    DWORD code;
                    if (GetExitCodeProcess(info.hProcess, &code)) { result.finished = true; result.exitCode = int(code); }
                }
                CloseHandle(info.hProcess);
            }
        }
        if (SUCCEEDED(initialized)) CoUninitialize();
        return result;
    }
#endif
    QProcess process;
    auto environment = QProcessEnvironment::systemEnvironment();
    environment.insert("LC_ALL", "C"); environment.insert("LANG", "C");
    process.setProcessEnvironment(environment);
    process.setProcessChannelMode(QProcess::MergedChannels);
    process.setProgram(command.program); process.setArguments(command.arguments);
    process.start();
    if (!process.waitForStarted(5000)) return {false, false, -1, {}, "launchFailed"};
    process.closeWriteChannel();
    ProcessResult result{true, false, -1, {}, {}};
    const bool mutation = command.arguments.contains("remove") || command.arguments.contains("uninstall");
    QElapsedTimer timer; timer.start();
    // Mutations must finish naturally: killing a package transaction can corrupt its database.
    // Read-only inventory commands have a 15-second deadline and a bounded output buffer.
    while (process.state() != QProcess::NotRunning) {
        process.waitForFinished(100);
        const auto bytes = process.readAll();
        if (result.output.size() + bytes.size() <= outputLimit) result.output += bytes;
        else result.error = "outputLimit";
        if (!mutation && (timer.elapsed() > 15000 || !result.error.isEmpty())) {
            process.kill(); process.waitForFinished(1000); result.error = "queryLimit"; return result;
        }
    }
    result.finished = process.exitStatus() == QProcess::NormalExit;
    result.exitCode = process.exitCode();
    const auto remaining = process.readAll();
    if (result.output.size() + remaining.size() <= outputLimit) result.output += remaining;
    else result.error = "outputLimit";
    return result;
}
Dependencies nativeDependencies() {
    Dependencies d;
#ifdef Q_OS_WIN
    d.platform = Platform::Windows;
    d.registry = readRegistry;
    d.tool = [](const QString &name) {
        if (name != "msiexec") return QString();
        wchar_t directory[MAX_PATH]; const auto length = GetSystemDirectoryW(directory, MAX_PATH);
        return length > 0 && length < MAX_PATH ? QString::fromWCharArray(directory) + "\\msiexec.exe" : QString();
    };
#elif defined(Q_OS_LINUX)
    d.platform = Platform::Linux;
    // Resolve package tools only in OS-owned standard directories, never the working directory.
    d.tool = [](const QString &name) { return QStandardPaths::findExecutable(name, {"/usr/bin", "/bin", "/usr/sbin", "/sbin"}); };
#else
    d.tool = [](const QString &) { return QString(); };
#endif
    d.desktops = readDesktops; d.run = runProcess; d.appImageInfo = imageInfo;
    d.trash = [](const QString &path, QString *destination) {
        if (!imageInfo(path).value("valid").toBool()) return false;
        return QFile::moveToTrash(path, destination);
    };
    return d;
}
}

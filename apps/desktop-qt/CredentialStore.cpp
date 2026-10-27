#include "CredentialStore.h"
#include <QStringList>
#if defined(Q_OS_WIN)
#include <windows.h>
#include <wincred.h>
#elif defined(Q_OS_MACOS)
#include <Security/Security.h>
#else
#include <QProcess>
#include <QFileInfo>
#endif
namespace CredentialStore {
bool validProvider(const QString &provider) { return QStringList{"openai", "claude", "gemini", "groq", "tavily", "brave", "jina", "elevenlabs"}.contains(provider); }
#if defined(Q_OS_MACOS)
static CFMutableDictionaryRef query(const QString &provider) {
    auto q = CFDictionaryCreateMutable(nullptr, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    const auto account = provider.toUtf8();
    auto name = CFStringCreateWithBytes(nullptr, reinterpret_cast<const UInt8 *>(account.constData()), account.size(), kCFStringEncodingUTF8, false);
    CFDictionarySetValue(q, kSecClass, kSecClassGenericPassword);
    CFDictionarySetValue(q, kSecAttrService, CFSTR("com.viezan.native.qt.providers"));
    CFDictionarySetValue(q, kSecAttrAccount, name); CFRelease(name);
    CFDictionarySetValue(q, kSecAttrSynchronizable, kCFBooleanFalse);
    return q;
}
#elif !defined(Q_OS_WIN)
static QByteArray secretTool(const QStringList &args, const QByteArray &input, bool *ok) {
    *ok = false;
    if (!QFileInfo::exists("/usr/bin/secret-tool")) return {};
    QProcess process;
    process.setProgram("/usr/bin/secret-tool"); process.setArguments(args);
    process.start();
    if (!process.waitForStarted(3000)) return {};
    if (!input.isEmpty()) process.write(input);
    process.closeWriteChannel();
    if (!process.waitForFinished(15000)) { process.kill(); process.waitForFinished(1000); return {}; }
    *ok = process.exitStatus() == QProcess::NormalExit && process.exitCode() == 0;
    auto result = process.readAllStandardOutput();
    if (result.endsWith('\n')) result.chop(1);
    return result;
}
#endif
QByteArray read(const QString &provider) {
    if (!validProvider(provider)) return {};
#ifdef Q_OS_WIN
    const auto target = ("ViezanNative/" + provider).toStdWString();
    PCREDENTIALW credential = nullptr;
    if (!CredReadW(target.c_str(), CRED_TYPE_GENERIC, 0, &credential)) return {};
    QByteArray result(reinterpret_cast<const char *>(credential->CredentialBlob), credential->CredentialBlobSize);
    CredFree(credential); return result;
#elif defined(Q_OS_MACOS)
    auto q = query(provider); CFDictionarySetValue(q, kSecReturnData, kCFBooleanTrue);
    CFTypeRef result = nullptr; auto status = SecItemCopyMatching(q, &result); CFRelease(q);
    if (status != errSecSuccess || !result) return {};
    auto data = static_cast<CFDataRef>(result);
    QByteArray value(reinterpret_cast<const char *>(CFDataGetBytePtr(data)), CFDataGetLength(data)); CFRelease(result); return value;
#else
    bool ok; auto result = secretTool({"lookup", "application", "viezan-native", "provider", provider}, {}, &ok);
    return ok ? result : QByteArray{};
#endif
}
bool has(const QString &provider) { auto value = read(provider); const bool exists = !value.isEmpty(); value.fill('\0'); return exists; }
bool save(const QString &provider, const QByteArray &secret) {
    if (!validProvider(provider) || secret.isEmpty() || secret.size() > 4096) return false;
    for (const auto c : secret) if (static_cast<unsigned char>(c) < 32 || c == 127) return false;
#ifdef Q_OS_WIN
    auto target = ("ViezanNative/" + provider).toStdWString();
    CREDENTIALW credential{}; credential.Type = CRED_TYPE_GENERIC; credential.TargetName = target.data();
    credential.CredentialBlobSize = secret.size(); credential.CredentialBlob = reinterpret_cast<LPBYTE>(const_cast<char *>(secret.constData()));
    credential.Persist = CRED_PERSIST_LOCAL_MACHINE;
    return CredWriteW(&credential, 0);
#elif defined(Q_OS_MACOS)
    auto q = query(provider); auto data = CFDataCreate(nullptr, reinterpret_cast<const UInt8 *>(secret.constData()), secret.size());
    auto attributes = CFDictionaryCreateMutable(nullptr, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    CFDictionarySetValue(attributes, kSecValueData, data);
    auto status = SecItemUpdate(q, attributes);
    if (status == errSecItemNotFound) { CFDictionarySetValue(q, kSecValueData, data); CFDictionarySetValue(q, kSecAttrAccessible, kSecAttrAccessibleWhenUnlockedThisDeviceOnly); status = SecItemAdd(q, nullptr); }
    CFRelease(attributes); CFRelease(data); CFRelease(q); return status == errSecSuccess;
#else
    bool ok; secretTool({"store", "--label=Viezan native provider", "application", "viezan-native", "provider", provider}, secret + '\n', &ok); return ok;
#endif
}
bool remove(const QString &provider) {
    if (!validProvider(provider)) return false;
#ifdef Q_OS_WIN
    const auto target = ("ViezanNative/" + provider).toStdWString();
    return CredDeleteW(target.c_str(), CRED_TYPE_GENERIC, 0) || GetLastError() == ERROR_NOT_FOUND;
#elif defined(Q_OS_MACOS)
    auto q = query(provider); auto status = SecItemDelete(q); CFRelease(q); return status == errSecSuccess || status == errSecItemNotFound;
#else
    bool ok; secretTool({"clear", "application", "viezan-native", "provider", provider}, {}, &ok); return ok;
#endif
}
}

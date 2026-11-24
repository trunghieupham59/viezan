#include "LauncherTools.h"
#include <QDateTime>
#include <QDir>
#include <QDirListing>
#include <QFileInfo>
#include <QSet>
#include <QStandardPaths>
#include <QElapsedTimer>
#include <QRegularExpression>
#include <algorithm>
#include <climits>
#include <tuple>
#include <cmath>
#ifdef Q_OS_MACOS
#include <CoreFoundation/CoreFoundation.h>
#include <QUrl>
#endif
namespace {
bool skippedName(const QString &name) {
    static const QSet<QString> skipped{"node_modules", "DerivedData", "Pods", "Carthage",
                                       "site-packages", "__pycache__", "target", "dist", "build"};
    return name.startsWith('.') || skipped.contains(name);
}

bool underHome(const QString &relative) {
    return QDir::isRelativePath(relative) && relative != ".." && !relative.startsWith("../");
}

bool launcherDirectory(const QFileInfo &info) {
    if (!info.isDir()) return false;
#ifdef Q_OS_MACOS
    // RTFD is a document package even when Launch Services has no type registration.
    if (info.suffix().compare("rtfd", Qt::CaseInsensitive) == 0) return false;
    const auto url = QUrl::fromLocalFile(info.absoluteFilePath()).toCFURL();
    CFBooleanRef package = nullptr;
    if (url) {
        CFURLCopyResourcePropertyForKey(url, kCFURLIsPackageKey, &package, nullptr);
        CFRelease(url);
    }
    if (package) {
        const bool isPackage = CFBooleanGetValue(package);
        CFRelease(package);
        return !isPackage;
    }
    return !info.isBundle();
#else
    return true;
#endif
}

struct Parser {
    QString source; qsizetype index = 0; int depth = 0; bool valid = true;
    void space() { while (index < source.size() && source[index].isSpace()) ++index; }
    bool take(QChar value) { space(); if (index < source.size() && source[index] == value) { ++index; return true; } return false; }
    double sum() { auto value = product(); while (valid) { if (take('+')) value += product(); else if (take('-')) value -= product(); else break; } return value; }
    double product() { auto value = unary(); while (valid) { if (take('*')) value *= unary(); else if (take('/')) { const auto divisor = unary(); if (divisor == 0) { valid = false; return 0; } value /= divisor; } else break; } return value; }
    double unary() { if (++depth >= 64) { valid = false; --depth; return 0; } double value; if (take('+')) value = unary(); else if (take('-')) value = -unary(); else value = power(); --depth; return value; }
    double power() { auto value = atom(); if (valid && take('^')) value = std::pow(value, unary()); while (valid && take('%')) value /= 100; return value; }
    double atom() {
        if (take('(')) { const auto value = sum(); if (!take(')')) valid = false; return value; }
        space(); const auto begin = index;
        while (index < source.size() && ((source[index] >= '0' && source[index] <= '9') || source[index] == '.')) ++index;
        bool number = false; const auto value = source.mid(begin, index - begin).toDouble(&number); if (!number) valid = false; return value;
    }
};
}
namespace LauncherTools {
QVariantMap paletteQuery(const QString &raw) {
    const auto query = raw.trimmed(); if (query.isEmpty()) return {};
    if (const auto value = calculate(query); !value.isEmpty()) return {{"kind", "calculation"}, {"value", value}};
    if (query.startsWith('?')) { auto text = query; while (text.startsWith('?')) text.remove(0, 1); text = text.trimmed(); return text.isEmpty() ? QVariantMap{} : QVariantMap{{"kind", "ask"}, {"value", text}}; }
    for (const auto &[prefix, kind] : {std::pair{"t ", "translate"}, std::pair{"d ", "lookup"}}) {
        if (!raw.toLower().startsWith(prefix)) continue;
        const auto text = raw.mid(2).trimmed(); return text.isEmpty() ? QVariantMap{} : QVariantMap{{"kind", kind}, {"value", text}};
    }
    return {};
}
QString calculate(const QString &input) {
    if (input.toUtf8().size() > 512) return {};
    bool expression = false; for (const auto c : input) if (QString("+-*/^%()").contains(c)) expression = true;
    if (!expression) return {}; Parser parser{input}; const auto value = parser.sum(); parser.space();
    return parser.valid && parser.index == input.size() && std::isfinite(value) ? QString::number(value, 'g', 12) : QString{};
}
QVariantList files(const QString &input) {
    QStringList roots;
    for (const auto folder : {QStandardPaths::DocumentsLocation, QStandardPaths::DesktopLocation, QStandardPaths::DownloadLocation})
        roots.append(QStandardPaths::writableLocation(folder));
    return files(input, QDir::home(), roots);
}

QVariantList files(const QString &input, const QDir &home, const QStringList &roots) {
    const auto query = input.trimmed(); if (query.size() < 2 || query.toUtf8().size() > 256) return {};
    QVariantList result; int visited = 0; QElapsedTimer timer; timer.start();
    const QDir canonicalHome(home.canonicalPath());
    QStringList pending;
    for (const auto &root : roots) {
        if (!QDir::isAbsolutePath(root)) continue;
        const QFileInfo folder(root);
        if (folder.isSymLink() || folder.isJunction() || !folder.isDir()) continue;
        // A standard folder may have a redirected ancestor or live on another volume.
        const auto path = folder.canonicalFilePath();
        if (path.isEmpty()) continue;
        const auto relative = canonicalHome.relativeFilePath(path);
        if (underHome(relative) && relative != ".") {
            const auto parts = relative.split('/', Qt::SkipEmptyParts);
            if (std::any_of(parts.cbegin(), parts.cend(), skippedName)) continue;
        }
        pending.append(path);
    }
    QSet<QString> scanned;
    while (!pending.isEmpty()) {
        if (timer.elapsed() > 2000) break;
        const QFileInfo folder(pending.takeFirst());
        const auto path = folder.absoluteFilePath();
        if (scanned.contains(path) || folder.isSymLink() || folder.isJunction() || folder.canonicalFilePath() != path) continue;
        scanned.insert(path);
        for (const auto &entry : QDirListing(path)) {
            if (++visited > 20000 || timer.elapsed() > 2000) return result;
            const QString name = entry.fileName();
            if (skippedName(name)) continue;
            const auto info = entry.fileInfo();
            if (info.isSymLink() || info.isJunction()) continue;
            const bool directory = launcherDirectory(info);
            if (directory) pending.append(info.absoluteFilePath());
            if (!name.contains(query, Qt::CaseInsensitive) || (!info.isFile() && !info.isDir())) continue;
            const auto id = info.absoluteFilePath();
            if (info.canonicalFilePath() != id) continue;
            const auto parent = canonicalHome.relativeFilePath(info.absolutePath());
            QVariantMap row{{"id", id}, {"name", name}, {"isDirectory", directory},
                            {"parent", parent == "." ? "~" : underHome(parent) ? "~/" + parent : info.absolutePath()}};
            const auto modified = info.lastModified();
            if (modified.isValid()) row.insert("modified", modified.toSecsSinceEpoch());
            result.append(row);
            if (result.size() >= 50) return result;
        }
    }
    return result;
}
}

QVariantList LauncherTools::rank(const QVariantList &applications, const QString &input, const QStringList &recent, int limit) {
    const auto needle = input.trimmed();
    QList<std::tuple<int, int, int, QVariant>> ranked;
    for (const auto &value : applications) {
        const auto app = value.toMap(); const auto name = app.value("name").toString(); const int order = recent.indexOf(app.value("id").toString());
        int tier = -1;
        if (needle.isEmpty()) { if (order < 0) continue; tier = 0; }
        else if (name.startsWith(needle, Qt::CaseInsensitive)) tier = 0;
        else {
            static const QRegularExpression separators("[ .-]");
            const auto words = name.split(separators, Qt::SkipEmptyParts);
            if (std::any_of(words.begin(), words.end(), [&needle](const QString &word) { return word.startsWith(needle, Qt::CaseInsensitive); })) tier = 1;
            else if (name.contains(needle, Qt::CaseInsensitive)) tier = 2;
        }
        if (tier >= 0) ranked.append({tier, order < 0 ? INT_MAX : order, int(name.size()), value});
    }
    std::sort(ranked.begin(), ranked.end(), [](const auto &a, const auto &b) { return std::tie(std::get<0>(a), std::get<1>(a), std::get<2>(a)) < std::tie(std::get<0>(b), std::get<1>(b), std::get<2>(b)); });
    QVariantList result; for (const auto &entry : ranked) { if (result.size() >= limit) break; result.append(std::get<3>(entry)); }
    return result;
}

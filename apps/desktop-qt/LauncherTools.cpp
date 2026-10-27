#include "LauncherTools.h"
#include <QDirIterator>
#include <QStandardPaths>
#include <QElapsedTimer>
#include <cmath>
namespace {
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
QString calculate(const QString &input) {
    if (input.toUtf8().size() > 512) return {};
    bool expression = false; for (const auto c : input) if (QString("+-*/^%()").contains(c)) expression = true;
    if (!expression) return {}; Parser parser{input}; const auto value = parser.sum(); parser.space();
    return parser.valid && parser.index == input.size() && std::isfinite(value) ? QString::number(value, 'g', 12) : QString{};
}
QVariantList files(const QString &input) {
    const auto query = input.trimmed(); if (query.size() < 2 || query.toUtf8().size() > 256) return {};
    QVariantList result; int visited = 0; QElapsedTimer timer; timer.start();
    for (const auto folder : {QStandardPaths::DocumentsLocation, QStandardPaths::DesktopLocation, QStandardPaths::DownloadLocation}) {
        const auto root = QStandardPaths::writableLocation(folder); if (root.isEmpty()) continue;
        QDirIterator iterator(root, QDir::Files | QDir::Dirs | QDir::NoSymLinks | QDir::NoDotAndDotDot, QDirIterator::Subdirectories);
        while (iterator.hasNext()) {
            const auto path = iterator.next(); if (++visited > 20000 || result.size() >= 50 || timer.elapsed() > 2000) return result;
            const auto info = iterator.fileInfo(); if (info.fileName().contains(query, Qt::CaseInsensitive) && info.canonicalFilePath() == path) result.append(QVariantMap{{"id", path}, {"name", info.fileName()}});
        }
    }
    return result;
}
}

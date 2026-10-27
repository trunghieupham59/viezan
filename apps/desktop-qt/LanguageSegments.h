#pragma once
#include <QStringList>
#include <QRegularExpression>
namespace LanguageSegments {
inline QStringList sentences(const QString &text) {
    QStringList result; static const QRegularExpression expression("[^.!?。！？\\n]+(?:[.!?。！？]+|\\n|$)");
    auto matches = expression.globalMatch(text); while (matches.hasNext()) { const auto value = matches.next().captured().trimmed(); if (!value.isEmpty()) result.append(value); } return result;
}
inline QStringList chunks(const QString &text, qsizetype limit = 3000) {
    if (text.size() <= limit) return {text}; QStringList result; QString chunk;
    for (auto line : text.split('\n')) {
        if (!chunk.isEmpty() && chunk.size() + line.size() + 1 > limit) { result.append(chunk); chunk.clear(); }
        while (line.size() > limit) {
            if (!chunk.isEmpty()) { result.append(chunk); chunk.clear(); }
            auto end = limit; while (end > 0 && !line[end - 1].isSpace()) --end;
            if (end == 0) { end = limit; if (line[end - 1].isHighSurrogate()) --end; }
            result.append(line.left(end)); line = line.mid(end).trimmed();
        }
        if (!chunk.isEmpty()) chunk += '\n'; chunk += line;
    }
    if (!chunk.isEmpty()) result.append(chunk); return result;
}
}

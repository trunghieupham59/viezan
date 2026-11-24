#pragma once
#include <QStringList>
#include <QRegularExpression>
#include <QTextBoundaryFinder>
namespace LanguageSegments {
inline QStringList sentences(const QString &text) {
    QStringList result; static const QRegularExpression expression("[^.!?。！？\\n]+(?:[.!?。！？]+|\\n|$)");
    auto matches = expression.globalMatch(text); while (matches.hasNext()) { const auto value = matches.next().captured().trimmed(); if (!value.isEmpty()) result.append(value); } return result;
}
inline QStringList chunks(const QString &text, qsizetype limit = 3000) {
    if (limit <= 0) return {};
    if (text.size() <= limit) return {text};
    QStringList result;
    QString chunk;
    for (const auto &line : text.split('\n')) {
        QStringView rest(line);
        if (!chunk.isEmpty() && chunk.size() + rest.size() + 1 > limit) {
            result.append(chunk);
            chunk.clear();
        }
        if (rest.size() > limit) {
            // The transport batch size is independent of the input limit. Break
            // the batch at a whole grapheme even when one cluster exceeds it.
            QTextBoundaryFinder boundaries(QTextBoundaryFinder::Grapheme, line);
            while (rest.size() > limit) {
                qsizetype split = limit;
                while (split > 0 && !rest[split - 1].isSpace()) --split;
                const auto offset = rest.data() - line.constData();
                boundaries.setPosition(offset + (split > 0 ? split : limit));
                if (!boundaries.isAtBoundary()) boundaries.toPreviousBoundary();
                if (boundaries.position() <= offset) boundaries.toNextBoundary();
                split = boundaries.position() - offset;
                result.append(rest.first(split).toString());
                rest = rest.sliced(split).trimmed();
            }
        }
        if (!chunk.isEmpty()) chunk += '\n';
        chunk += rest;
    }
    if (!chunk.isEmpty()) result.append(chunk);
    return result;
}
}

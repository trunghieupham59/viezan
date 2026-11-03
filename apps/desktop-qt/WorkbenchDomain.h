#pragma once
#include <QVariantMap>

// Native state reducer. No script engine, I/O, clocks, or application objects.
namespace WorkbenchDomain {
// Longest source Translate sends, in characters (Swift WorkbenchStore.translateLimit).
inline constexpr int translateLimit = 5000;
QVariantMap create(const QString &chatID, const QString &translateID);
bool validate(const QVariantMap &state);
QVariantMap recover(const QVariantMap &state);
QVariantMap command(const QVariantMap &state, const QString &name,
                    const QVariantMap &payload, const QString &id, const QString &attemptID);
// A session's first title (Swift Session.derivedTitle): the draft's first 64 characters, or the
// attached image's name when the draft is empty or is itself a file path.
QString derivedTitle(const QString &draft, const QVariantList &images);
// "Not found" dictionary replies: the suggestions (word, partOfSpeech, meaning; at most 5), or an
// invalid QVariant when `text` is not such a reply (Swift DictionaryEntry.notFound).
QVariant dictionarySuggestions(const QString &text);
// Sessions "Clear history" removes (Swift clearableHistoryCount without Interpretation).
int clearableHistory(const QVariantMap &state);
}

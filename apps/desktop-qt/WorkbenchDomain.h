#pragma once
#include <QVariantMap>

// Native state reducer. No script engine, I/O, clocks, or application objects.
namespace WorkbenchDomain {
// User-visible input limits (extended grapheme clusters, like Swift String.count).
inline constexpr int translateLimit = 5000;
inline constexpr int dictionaryTermLimit = 120;
inline constexpr int dictionaryContextLimit = 500;
inline constexpr int quickQuestionLimit = 3000;
qsizetype graphemeCount(const QString &text);
QVariantMap create(const QString &chatID, const QString &translateID);
inline constexpr int pinnedModelLimit = 8;
bool validate(const QVariantMap &state);
QVariantMap recover(const QVariantMap &state, bool repairStoredTitles = true);
QVariantMap command(const QVariantMap &state, const QString &name,
                    const QVariantMap &payload, const QString &id, const QString &attemptID,
                    bool *clearedOutput = nullptr);
// A session's first title (Swift Session.derivedTitle): the draft's first 64 characters, or the
// attached image's name when the draft is empty or is itself a file path.
QString derivedTitle(const QString &draft, const QVariantList &images);
QVariant dictionaryEntry(const QString &text);
// "Not found" dictionary replies: the suggestions (word, partOfSpeech, meaning; at most 5), or an
// invalid QVariant when `text` is not such a reply (Swift DictionaryEntry.notFound).
QVariant dictionarySuggestions(const QString &text);
// Sessions "Clear history" removes (Swift clearableHistoryCount without Interpretation).
int clearableHistory(const QVariantMap &state);
}

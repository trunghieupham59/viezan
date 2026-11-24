#pragma once
#include <QDateTime>
#include <QVariantMap>

namespace HabitSuggestions {
// now carries the local time zone for the time-of-day boost. Each historical
// session contributes once, regardless of its number of messages or retries.
QVariantList suggest(const QVariantMap &workspace, const QString &sessionID, const QDateTime &now, int limit = 3);
}

#pragma once
#include <QString>
#include <QVariantList>
#include <QVariantMap>
namespace LauncherTools {
QString calculate(const QString &input);
QVariantList files(const QString &input);
// Applications ({id, name}) for a query: name prefix, then a word prefix, then anywhere; recently
// launched first within each tier. An empty query lists only recent apps. Mirrors LauncherRanking (Swift).
QVariantList rank(const QVariantList &applications, const QString &query, const QStringList &recent, int limit = 8);
// What a palette query means beyond page names (Swift PaletteQuery): {kind: calculation|ask|translate|lookup,
// value}, or an empty map for a plain command filter.
QVariantMap paletteQuery(const QString &raw);
}

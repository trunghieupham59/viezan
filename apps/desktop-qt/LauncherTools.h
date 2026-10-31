#pragma once
#include <QString>
#include <QVariantList>
namespace LauncherTools {
QString calculate(const QString &input);
QVariantList files(const QString &input);
// Applications ({id, name}) for a query: name prefix, then a word prefix, then anywhere; recently
// launched first within each tier. An empty query lists only recent apps. Mirrors LauncherRanking (Swift).
QVariantList rank(const QVariantList &applications, const QString &query, const QStringList &recent, int limit = 8);
}

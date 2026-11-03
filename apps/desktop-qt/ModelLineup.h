#pragma once
#include <QStringList>
#include <QVariantMap>
#include <optional>

// The model picker's reading of provider listings: newest model per family, a short name derived
// from the ID, and the model that serves each purpose (fast / balanced / careful). Mirrors
// apps/macos/Sources/ViezanDomain/ModelLineup.swift rule for rule; the tests share their cases.
namespace ModelLineup {
struct Family { QString provider, name; int rank = 0; double version = 0; bool preview = false, dated = false; QString suffix; };
inline const QStringList tierNames{"fast", "balanced", "careful"};
QString provider(const QString &id);
QString model(const QString &id);
bool isChatModel(const QString &id);
std::optional<Family> family(const QString &id);
QStringList featured(const QStringList &ids, int limit = 4);
QStringList search(const QStringList &ids, const QString &query, int limit = 8);
QString shortName(const QString &id);
// {fast, balanced, careful} → model ID, or empty when the provider is local or lists one size.
QVariantMap tiers(const QString &current, const QStringList &listing);
// Picker sections: [{key, rows: [{kind: tier|model|setup|typed, tier?, model?, provider?}]}].
QVariantList sections(const QString &query, const QVariantMap &tiers, const QStringList &recent, const QMap<QString, QStringList> &listings, const QStringList &cloud, const QStringList &local);
// Distinct chat models from a newest-first history, at most three.
QStringList recent(const QStringList &history);
}

#include "ModelLineup.h"
#include "ProviderDiscovery.h"
#include <QMap>
#include <QRegularExpression>
#include <algorithm>
#include <tuple>
#include <cmath>

namespace {
const QStringList excluded{"embed", "tts", "whisper", "audio", "realtime", "image", "computer-use", "moderation",
                           "babbage", "davinci", "instruct", "transcribe", "search", "latest", "codex", "dall-e",
                           "sora", "veo", "imagen", "aqa", "learnlm", "live", "native-audio", "robotics", "deep-research"};
const QMap<QString, int> claudeRanks{{"haiku", 0}, {"sonnet", 1}, {"opus", 2}, {"fable", 3}};
const QMap<QString, int> openAIRanks{{"nano", 0}, {"mini", 1}, {"", 2}, {"pro", 3}};
const QMap<QString, int> geminiRanks{{"flash-lite", 0}, {"flash", 1}, {"pro", 2}};
// The rank of each provider's main line: Balanced lives there, Careful at or above it, Fast below it.
const QMap<QString, int> mainRank{{"claude", 1}, {"openai", 2}, {"gemini", 1}};
QString rawModel(const QString &id) { const auto colon = id.indexOf(':'); return colon >= 0 ? id.mid(colon + 1) : id; }
bool hasDate(const QString &id) { return ModelLineup::model(id).size() < rawModel(id).size(); }
double number(const QString &text) { bool ok = false; const auto value = QString(text).replace('-', '.').toDouble(&ok); return ok ? value : 0; }
QString capitalized(const QString &word) { return word.isEmpty() ? word : word.left(1).toUpper() + word.mid(1).toLower(); }
QString versionText(double version) { return std::fmod(version, 1.0) == 0 ? QString::number(qint64(version)) : QString::number(version); }
bool validModel(const QString &id) {
    const auto prefix = id.section(':', 0, 0);
    return (ProviderDiscovery::cloudProviders.contains(prefix) || ProviderDiscovery::localProviders.contains(prefix)) && id.size() > prefix.size() + 1 && id.toUtf8().size() <= 512;
}
}

namespace ModelLineup {
QString provider(const QString &id) { const auto colon = id.indexOf(':'); return colon >= 0 ? id.left(colon) : QString(); }
QString model(const QString &id) { return rawModel(id).remove(QRegularExpression(R"(-(\d{8}|\d{4}-\d{2}-\d{2})$)")); }
bool isChatModel(const QString &id) { const auto name = model(id).toLower(); return std::none_of(excluded.cbegin(), excluded.cend(), [&name](const QString &word) { return name.contains(word); }); }

std::optional<Family> family(const QString &id) {
    const auto owner = provider(id), name = model(id).toLower();
    const auto match = [&name](const QString &pattern) { return QRegularExpression(pattern).match(name); };
    if (owner == "claude") {
        const auto hit = match(R"(^claude-(fable|opus|sonnet|haiku)-(\d+(?:-\d+)?)(?:-([a-z]+))?$)"); if (!hit.hasMatch()) return std::nullopt;
        return Family{owner, hit.captured(1), claudeRanks.value(hit.captured(1)), number(hit.captured(2)), false, hasDate(id), hit.captured(3)};
    }
    if (owner == "openai") {
        if (const auto hit = match(R"(^gpt-(\d+(?:\.\d+)?)(?:-(nano|mini|pro))?(?:-([a-z]+))?$)"); hit.hasMatch()) {
            const auto size = hit.captured(2);
            return Family{owner, size.isEmpty() ? "gpt" : "gpt-" + size, openAIRanks.value(size, 2), number(hit.captured(1)), false, hasDate(id), hit.captured(3)};
        }
        if (const auto hit = match(R"(^o(\d+)(?:-(mini|pro))?$)"); hit.hasMatch()) {
            const auto size = hit.captured(2);
            return Family{owner, size.isEmpty() ? "o" : "o-" + size, openAIRanks.value(size, 2), number(hit.captured(1)), false, hasDate(id), {}};
        }
        return std::nullopt;
    }
    if (owner == "gemini") {
        const auto hit = match(R"(^gemini-(\d+(?:\.\d+)?)-(flash-lite|flash|pro)(?:-(preview|exp)(?:-[\w.-]+)?)?$)"); if (!hit.hasMatch()) return std::nullopt;
        return Family{owner, hit.captured(2), geminiRanks.value(hit.captured(2)), number(hit.captured(1)), hit.capturedLength(3) > 0, hasDate(id), {}};
    }
    return std::nullopt;
}

QStringList featured(const QStringList &ids, int limit) {
    QStringList chat; for (const auto &id : ids) if (isChatModel(id)) chat << id;
    if (chat.isEmpty() || !ProviderDiscovery::cloudProviders.contains(provider(chat.first()))) { chat.sort(); return chat; }
    const auto score = [](const Family &f) { return std::make_tuple(f.name.startsWith('o') ? 0 : 1, f.version, f.preview ? 0 : 1, f.dated ? 0 : 1); };
    QMap<int, QPair<QString, Family>> bySize;
    for (const auto &id : chat) {
        const auto found = family(id); if (!found) continue;
        if (bySize.contains(found->rank) && score(bySize.value(found->rank).second) >= score(*found)) continue;
        bySize[found->rank] = {id, *found};
    }
    if (bySize.isEmpty()) { chat.sort(); return chat.mid(0, limit + 1); }
    QStringList result; for (auto it = bySize.cend(); it != bySize.cbegin() && result.size() < limit;) { --it; result << it.value().first; }
    return result;
}

QStringList search(const QStringList &ids, const QString &query, int limit) {
    const auto needle = query.trimmed().toLower();
    QMap<QString, QString> representative;
    for (const auto &id : ids) {
        if (!isChatModel(id)) continue;
        const auto name = model(id);
        // A plain ID stands for the name; among dated snapshots only, the newest one does.
        if (representative.contains(name)) { const auto current = representative.value(name); if (!hasDate(current) || (hasDate(id) && current > id)) continue; }
        representative[name] = id;
    }
    QStringList result;
    for (auto it = representative.cbegin(); it != representative.cend() && result.size() < limit; ++it) if (needle.isEmpty() || it.key().toLower().contains(needle)) result << it.value();
    return result;
}

QString shortName(const QString &id) {
    const auto found = family(id); if (!found) return model(id);
    const auto version = versionText(found->version), codename = found->suffix.isEmpty() ? QString() : " " + capitalized(found->suffix);
    if (found->provider == "claude") return capitalized(found->name) + " " + version + codename;
    if (found->provider == "openai") {
        const auto parts = found->name.split('-'); const auto base = parts[0] == "gpt" ? "GPT-" + version : "o" + version;
        return (parts.size() > 1 ? base + " " + capitalized(parts[1]) : base) + codename;
    }
    QStringList words; for (const auto &word : found->name.split('-')) words << capitalized(word);
    return "Gemini " + version + " " + words.join(' ');
}

QVariantMap tiers(const QString &current, const QStringList &listing) {
    const auto owner = provider(current);
    if (!ProviderDiscovery::cloudProviders.contains(owner) || !mainRank.contains(owner)) return {};
    QStringList own; for (const auto &id : listing) if (provider(id) == owner) own << id;
    QList<QPair<QString, Family>> families; for (const auto &id : featured(own, 8)) if (const auto found = family(id)) families.append({id, *found});
    if (families.size() < 2) return {};
    const auto main = mainRank.value(owner);
    using Entry = QPair<QString, Family>;
    // The first of equal maxima wins, as Swift's max(by:).
    const auto best = [](const QList<Entry> &pool, auto key) -> std::optional<Entry> {
        std::optional<Entry> result; for (const auto &entry : pool) if (!result || key(result->second) < key(entry.second)) result = entry; return result;
    };
    const auto newest = [](const Family &f) { return std::make_pair(f.version, f.rank); };
    QList<Entry> large, mainLine, small;
    for (const auto &entry : families) { if (entry.second.rank >= main) large << entry; if (entry.second.rank == main) mainLine << entry; if (entry.second.rank < main) small << entry; }
    auto careful = best(large, newest); if (!careful) careful = best(families, newest); if (!careful) return {};
    const auto balanced = best(mainLine, newest).value_or(*careful);
    const auto fast = best(small, [](const Family &f) { return std::make_pair(f.version, -f.rank); }).value_or(balanced);
    return {{"fast", fast.first}, {"balanced", balanced.first}, {"careful", careful->first}};
}

QVariantList sections(const QString &query, const QVariantMap &tierMap, const QStringList &recentModels, const QMap<QString, QStringList> &listings, const QStringList &cloud, const QStringList &local) {
    const auto needle = query.trimmed(); QVariantList result;
    const auto row = [](const QString &kind, const QString &key, const QString &value) { return QVariantMap{{"kind", kind}, {key, value}}; };
    const auto section = [](const QString &key, const QVariantList &rows) { return QVariantMap{{"key", key}, {"rows", rows}}; };
    QStringList localModels; for (const auto &runtime : local) localModels += listings.value(runtime);
    if (needle.isEmpty()) {
        if (tierMap.size() == tierNames.size()) { QVariantList rows; for (const auto &tier : tierNames) rows << QVariantMap{{"kind", "tier"}, {"tier", tier}, {"model", tierMap.value(tier)}}; result << section("purpose", rows); }
        QStringList offered; for (const auto &value : tierMap) offered << value.toString();
        QVariantList picks; for (const auto &id : recentModels) if (!offered.contains(id)) picks << row("model", "model", id);
        if (!picks.isEmpty()) result << section("recent", picks);
        for (const auto &owner : cloud) {
            QVariantList rows;
            if (!listings.value(owner).isEmpty()) { for (const auto &id : featured(listings.value(owner))) rows << row("model", "model", id); }
            else rows << row("setup", "provider", owner);
            result << section(owner, rows);
        }
        QVariantList rows; if (localModels.isEmpty()) rows << row("setup", "provider", "local"); else for (const auto &id : localModels) rows << row("model", "model", id);
        result << section("local", rows); return result;
    }
    QStringList shown;
    for (const auto &owner : cloud) { const auto hits = search(listings.value(owner), needle, 6); if (hits.isEmpty()) continue; QVariantList rows; for (const auto &id : hits) { rows << row("model", "model", id); shown << id; } result << section(owner, rows); }
    QVariantList rows; for (const auto &id : localModels) if (model(id).toLower().contains(needle.toLower())) { rows << row("model", "model", id); shown << id; }
    if (!rows.isEmpty()) result << section("local", rows);
    if (needle.contains(':') && validModel(needle) && !shown.contains(needle)) result << section("typed", {row("typed", "model", needle)});
    return result;
}

QStringList recent(const QStringList &history) {
    QStringList seen; for (const auto &id : history) if (isChatModel(id) && !seen.contains(id)) { seen << id; if (seen.size() == 3) break; }
    return seen;
}
}

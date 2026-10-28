#include "ProviderDiscovery.h"

namespace ProviderDiscovery {
namespace {
QString providerOf(const QString &model) { return model.section(':', 0, 0); }
QStringList providers() { return localProviders + cloudProviders; }
// Cloud catalogs list every model; a new session gets a fast general chat model.
const QMap<QString, QStringList> cloudDefaults{
    {"openai", {"gpt-4.1-mini", "gpt-4o-mini", "gpt-4.1", "gpt-4o"}},
    {"claude", {"claude-haiku-4", "claude-sonnet-4", "claude-3-5-haiku", "claude-3-5-sonnet"}},
    {"gemini", {"gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"}},
};
}
bool chatCapable(const QString &model) {
    const auto id = model.toLower();
    for (const auto &word : {"embed", "whisper", "tts", "dall-e", "image", "moderation", "rerank"}) if (id.contains(QLatin1String(word))) return false;
    return true;
}
QStringList Snapshot::all() const {
    QStringList result; for (const auto &provider : providers()) result += models.value(provider); return result;
}
bool Snapshot::empty() const {
    if (!checked || !keyed.isEmpty()) return false;
    for (const auto &model : all()) if (chatCapable(model)) return false;
    return true;
}
QString Snapshot::availability(const QString &model) const {
    if (!checked) return "unknown";
    const auto provider = providerOf(model);
    if (!providers().contains(provider) || model.size() <= provider.size() + 1) return "unsupported";
    if (cloudProviders.contains(provider)) {
        if (!keyed.contains(provider)) return "missingKey";
        // A keyed provider whose listing failed is still usable; the request reports its own error.
        return !models.contains(provider) || models.value(provider).contains(model) ? "available" : "notInstalled";
    }
    if (!models.contains(provider)) return "offline";
    return models.value(provider).contains(model) ? "available" : "notInstalled";
}
QString Snapshot::preferredModel(const QStringList &recent) const {
    for (const auto &model : recent)
        if (availability(model) == "available" && chatCapable(model) && models.value(providerOf(model)).contains(model)) return model;
    for (const auto &provider : providers()) {
        QStringList candidates; for (const auto &model : models.value(provider)) if (chatCapable(model)) candidates << model;
        if (candidates.isEmpty()) continue;
        candidates.sort();
        for (const auto &prefix : cloudDefaults.value(provider))
            for (const auto &model : candidates) if (model.mid(provider.size() + 1).startsWith(prefix)) return model;
        return candidates.first();
    }
    return {};
}
}

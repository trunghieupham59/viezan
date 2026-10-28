#pragma once
#include <QMap>
#include <QSet>
#include <QStringList>

// Which AI sources this device can use now: local runtimes that answer on loopback
// (models already downloaded) and cloud providers with a saved key. Mirrors
// apps/macos/Sources/ViezanDomain/ProviderDiscovery.swift; lists are in preference order.
namespace ProviderDiscovery {
inline const QStringList localProviders{"ollama", "lmstudio", "llamacpp"};
inline const QStringList cloudProviders{"openai", "claude", "gemini"};
bool chatCapable(const QString &model);
struct Snapshot {
    QMap<QString, QStringList> models; // provider -> "provider:model"; absent = did not answer
    QSet<QString> keyed;               // cloud providers with a saved key
    QMap<QString, QString> failures;   // provider -> failure code of its last listing
    bool checked = false;
    QStringList all() const;
    bool empty() const;
    // unknown | available | offline | missingKey | notInstalled | unsupported
    QString availability(const QString &model) const;
    QString preferredModel(const QStringList &recent) const;
};
}

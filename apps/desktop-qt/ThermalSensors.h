#pragma once
#include <QVariantList>
#include <QVariantMap>
#include <algorithm>
#include <cmath>
// Linux hwmon sensors ("<chip> / <label>") folded into rows that mean one thing, per group,
// hottest first: the Qt counterpart of ThermalSensors (Swift), which classifies SMC keys.
// Labels are `thermal_label_*` copy ids; a sensor without a known meaning keeps its own
// driver name as its row title.
namespace ThermalSensors {
struct Meaning { QString group, label; };
inline Meaning classify(const QString &name) {
    const auto chip = name.section(" / ", 0, 0).toLower(), channel = name.section(" / ", 1).toLower();
    static const QStringList cpuChips{"coretemp", "k10temp", "zenpower", "cpu_thermal", "x86_pkg_temp", "cpu-thermal", "soc_thermal"};
    if (cpuChips.contains(chip)) {
        if (channel.startsWith("package") || channel == "tctl" || channel == "tdie" || chip == "x86_pkg_temp") return {"cpu", "cpu_package"};
        if (channel.startsWith("tccd")) return {"cpu", "cpu_die"};
        return {"cpu", "cpu_core"};
    }
    if (QStringList{"amdgpu", "radeon", "nouveau", "i915", "xe"}.contains(chip)) return {"gpu", channel == "junction" ? "gpu_die" : "gpu"};
    if (chip == "nvme" || chip == "drivetemp") return {"other", "storage"};
    if (chip.startsWith("bat") || chip == "battery") return {"other", "battery"};
    if (chip.startsWith("iwlwifi") || chip.startsWith("ath") || chip.startsWith("mt7")) return {"other", "wifi"};
    return {"other", {}};
}
// rows → [{group, label?, title, max, average, count, members:[{name, value}]}], groups cpu, gpu, other.
inline QVariantList rows(const QVariantList &sensors) {
    QMap<QString, QVariantMap> buckets; QStringList order;
    for (const auto &value : sensors) {
        const auto sensor = value.toMap(); const auto name = sensor.value("name").toString(); const auto celsius = sensor.value("value").toDouble();
        if (!std::isfinite(celsius)) continue;
        const auto meaning = classify(name); const auto key = meaning.group + '/' + (meaning.label.isEmpty() ? "name:" + name : meaning.label);
        auto &row = buckets[key];
        if (row.isEmpty()) { row = {{"id", key}, {"group", meaning.group}, {"label", meaning.label}, {"title", meaning.label.isEmpty() ? name : QString()}, {"members", QVariantList{}}}; order.append(key); }
        auto members = row.value("members").toList(); members.append(QVariantMap{{"name", name}, {"value", celsius}}); row["members"] = members;
    }
    QVariantList result;
    for (const auto &group : {QStringLiteral("cpu"), QStringLiteral("gpu"), QStringLiteral("other")}) {
        QList<QVariantMap> list;
        for (const auto &key : order) {
            auto row = buckets.value(key); if (row.value("group") != group) continue;
            auto members = row.value("members").toList();
            std::sort(members.begin(), members.end(), [](const QVariant &a, const QVariant &b) { return a.toMap().value("value").toDouble() > b.toMap().value("value").toDouble(); });
            double sum = 0; for (const auto &member : members) sum += member.toMap().value("value").toDouble();
            row["members"] = members; row["count"] = members.size(); row["max"] = members.first().toMap().value("value"); row["average"] = sum / members.size();
            list.append(row);
        }
        // Known meanings first, hottest first; rows titled by a raw driver name follow.
        std::sort(list.begin(), list.end(), [](const QVariantMap &a, const QVariantMap &b) {
            const auto ka = a.value("label").toString().isEmpty(), kb = b.value("label").toString().isEmpty();
            return ka != kb ? !ka : a.value("max").toDouble() > b.value("max").toDouble();
        });
        for (const auto &row : list) result.append(row);
    }
    return result;
}
inline QString tone(double celsius) { return celsius >= 90 ? "hot" : celsius >= 70 ? "warm" : "ok"; }
}

#include "HabitSuggestions.h"
#include <QTimeZone>
#include <algorithm>
#include <cmath>
#include <limits>

namespace {
QVariantMap actionFor(const QVariantMap &session) {
    const auto feature = session.value("feature").toString();
    if (feature == "chat") {
        const auto mode = session.value("chatMode").toString();
        if (QStringList{"web", "research", "image"}.contains(mode))
            return {{"id", "chat-" + mode}, {"feature", feature}, {"mode", mode}};
    } else if (feature == "translate") {
        const auto source = session.value("source").toString(), target = session.value("target").toString();
        return {{"id", "translate-" + source + "-" + target}, {"feature", feature}, {"source", source}, {"target", target}};
    } else if (feature == "dictionary") {
        return {{"id", feature}, {"feature", feature}};
    }
    return {};
}

struct Occurrences {
    QVariantMap action;
    int count = 0, nearby = 0;
    double score = 0;
    double latest = -std::numeric_limits<double>::infinity();
};

int minuteOfDay(QTime time) { return time.hour() * 60 + time.minute(); }
}

QVariantList HabitSuggestions::suggest(const QVariantMap &workspace, const QString &sessionID, const QDateTime &now, int limit) {
    if (!now.isValid() || limit <= 0) return {};
    constexpr double day = 86400;
    const double seconds = now.toMSecsSinceEpoch() / 1000.0;
    const int currentMinute = minuteOfDay(now.time());
    const auto zone = now.timeZone();
    const auto disabled = workspace.value("disabledModules").toStringList();
    const auto sessions = workspace.value("sessions").toList();
    QMap<QString, Occurrences> groups;
    QString excluded;
    for (const auto &value : sessions) {
        const auto session = value.toMap();
        const auto feature = session.value("feature").toString();
        if (feature == "chat" && session.value("id") == sessionID) excluded = actionFor(session).value("id").toString();
        if (disabled.contains(feature) || !session.value("comparisonParent").isNull()) continue;
        if (session.value("messages").toList().isEmpty() && session.value("output").toString().isEmpty()) continue;
        bool dated = false;
        const double updated = session.value("updated").toDouble(&dated);
        const double age = seconds - updated;
        if (!dated || !std::isfinite(updated) || age < 0 || age > 30 * day) continue;
        const auto action = actionFor(session);
        if (action.isEmpty()) continue;
        auto &group = groups[action.value("id").toString()];
        group.action = action;
        ++group.count;
        group.score += std::exp(-age / day / 10);
        group.latest = std::max(group.latest, updated);
        const auto local = QDateTime::fromSecsSinceEpoch(qint64(std::floor(updated)), zone);
        const auto distance = std::abs(minuteOfDay(local.time()) - currentMinute);
        if (std::min(distance, 1440 - distance) <= 90) ++group.nearby;
    }

    QList<Occurrences> ranked;
    for (auto it = groups.cbegin(); it != groups.cend(); ++it) {
        if (it.key() == excluded || it->count < 3) continue;
        auto group = it.value();
        if (group.nearby >= 3) group.score *= 2;
        ranked.append(group);
    }
    std::sort(ranked.begin(), ranked.end(), [](const Occurrences &a, const Occurrences &b) {
        if (a.score != b.score) return a.score > b.score;
        if (a.latest != b.latest) return a.latest > b.latest;
        return a.action.value("id").toString() < b.action.value("id").toString();
    });
    QVariantList suggestions;
    for (const auto &group : ranked) {
        auto suggestion = group.action;
        suggestion["count"] = group.count;
        suggestion["score"] = group.score;
        suggestions.append(suggestion);
        if (suggestions.size() == limit) break;
    }
    return suggestions;
}

#pragma once
#include <QVariantMap>

// Native state reducer. No script engine, I/O, clocks, or application objects.
namespace WorkbenchDomain {
QVariantMap create(const QString &chatID, const QString &translateID);
bool validate(const QVariantMap &state);
QVariantMap recover(const QVariantMap &state);
QVariantMap command(const QVariantMap &state, const QString &name,
                    const QVariantMap &payload, const QString &id, const QString &attemptID);
}

#pragma once
#include <QString>
#include <QByteArray>
namespace CredentialStore {
bool validProvider(const QString &provider);
bool save(const QString &provider, const QByteArray &secret);
bool remove(const QString &provider);
bool has(const QString &provider);
// Backend-only API. Never expose through Q_INVOKABLE or a Q_PROPERTY.
QByteArray read(const QString &provider);
}

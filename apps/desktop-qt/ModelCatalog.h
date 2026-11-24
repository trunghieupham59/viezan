#pragma once
#include <QStringList>
#include <QVariantMap>
class QJsonObject;
namespace ModelCatalog {
// error: a provider failure code ("providerAuthError", "providerMissingKey", …) when !success.
struct Result { QStringList models; bool success = false; QString error; QVariantMap ollamaSizes{}; };
Result parsePage(const QString &provider, const QJsonObject &root);
Result fetch(const QString &provider);
}

#pragma once
#include <QStringList>
namespace ModelCatalog {
// error: a provider failure code ("providerAuthError", "providerMissingKey", …) when !success.
struct Result { QStringList models; bool success = false; QString error; };
Result fetch(const QString &provider);
}

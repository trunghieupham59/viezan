#pragma once
#include <QStringList>
namespace ModelCatalog {
struct Result { QStringList models; bool success = false; };
Result fetch(const QString &provider);
}

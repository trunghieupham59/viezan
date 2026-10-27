#pragma once
#include "CloudProtocol.h"
#include <QVariantList>
namespace ImageGeneration {
CloudProtocol::Call prepare(const QVariantMap &request);
QVariantList decode(const QByteArray &response, const QString &provider);
}

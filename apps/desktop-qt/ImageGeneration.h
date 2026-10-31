#pragma once
#include "CloudProtocol.h"
#include <QVariantList>
#include <functional>
namespace ImageGeneration {
// "openai" | "gemini" | "" — who draws for this session model on this device.
QString imageProvider(const QString &model, const std::function<bool(const QString &)> &hasKey);
// The session's image model, else the newest full-size image model the account lists, else a default.
QString imageModel(const QString &provider, const QString &selected, const QStringList &available);
CloudProtocol::Call prepare(const QVariantMap &request);
QVariantList decode(const QByteArray &response, const QString &provider);
}

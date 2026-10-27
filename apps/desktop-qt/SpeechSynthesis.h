#pragma once
#include "CloudProtocol.h"
namespace SpeechSynthesis {
CloudProtocol::Call prepare(const QString &text, const QString &provider, const QString &voice);
QByteArray decode(const QByteArray &data, const QString &provider);
}

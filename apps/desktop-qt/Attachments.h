#pragma once
#include <QVariantMap>
#include <QByteArray>
#include <QUrl>
namespace Attachments {
bool quarantineUnreferenced(const QVariantMap &workspace);
QVariantMap ingest(const QUrl &source);
bool restore(const QVariantMap &attachment, const QByteArray &bytes);
QByteArray data(const QVariantMap &attachment);
}

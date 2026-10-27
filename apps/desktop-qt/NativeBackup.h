#pragma once
#include <QVariantMap>
#include <QMap>
#include <QByteArray>
namespace NativeBackup {
struct Preview { QVariantMap preferences; QVariantList sessions, attachments, tasks, prompts, interpretation; QMap<QString, QByteArray> bytes; bool valid = false; };
QByteArray exportData(const QVariantMap &workspace, const QVariantList &interpretation = {});
Preview preview(const QByteArray &data);
bool materialize(const Preview &preview);
}

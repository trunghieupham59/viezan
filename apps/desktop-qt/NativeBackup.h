#pragma once
#include <QVariantMap>
#include <QMap>
#include <QByteArray>
#include <memory>
namespace Attachments { class RestoreBatch; }
namespace NativeBackup {
struct Preview { QVariantMap preferences; QVariantList sessions, attachments, tasks, prompts, interpretation; QMap<QString, QByteArray> bytes; bool valid = false; bool migratedAppearance = false; };
QByteArray exportData(const QVariantMap &workspace, const QVariantList &interpretation = {});
Preview preview(const QByteArray &data);
std::shared_ptr<Attachments::RestoreBatch> prepareAttachments(const Preview &preview);
}

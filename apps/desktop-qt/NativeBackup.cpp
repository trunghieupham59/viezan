#include "NativeBackup.h"
#include "Interpretation.h"
#include "Attachments.h"
#include "WorkbenchDomain.h"
#include <QJsonDocument>
#include <QCryptographicHash>
#include <QUuid>
#include <QStringList>
namespace {
QString hash(const QByteArray &bytes) { return QString::fromLatin1(QCryptographicHash::hash(bytes, QCryptographicHash::Sha256).toHex()); }
QVariantList images(const QVariantMap &session) {
    auto result = session.value("images").toList();
    for (const auto &message : session.value("messages").toList()) result.append(message.toMap().value("images").toList());
    return result;
}
}
namespace NativeBackup {
QByteArray exportData(const QVariantMap &workspace, const QVariantList &interpretation) {
    if (!Interpretation::validateArchive(interpretation)) return {};
    const auto meetingData = QJsonDocument::fromVariant(interpretation).toJson(QJsonDocument::Compact);
    const auto snapshot = QJsonDocument::fromVariant(workspace).toJson(QJsonDocument::Compact);
    QMap<QString, QVariantMap> attachments;
    for (const auto &value : workspace.value("sessions").toList()) for (const auto &image : images(value.toMap())) attachments[image.toMap().value("id").toString()] = image.toMap();
    for (const auto &task : workspace.value("tasks").toList()) for (const auto &image : images(task.toMap().value("request").toMap())) attachments[image.toMap().value("id").toString()] = image.toMap();
    QVariantList records; qint64 size = snapshot.size() + meetingData.size();
    for (auto image : attachments) {
        const auto data = Attachments::data(image); size += data.size(); if (data.isEmpty() || size > 64000000) return {};
        image["data"] = QString::fromLatin1(data.toBase64()); image["sha256"] = hash(data); records.append(image);
    }
    const auto output = QJsonDocument::fromVariant(QVariantMap{{"interpretation", QString::fromLatin1(meetingData.toBase64())}, {"interpretationSHA256", hash(meetingData)}, {"format", "viezan-native-backup"}, {"version", 1}, {"workspace", QString::fromLatin1(snapshot.toBase64())}, {"sha256", hash(snapshot)}, {"attachments", records}}).toJson(QJsonDocument::Compact);
    return output.size() <= 128000000 ? output : QByteArray{};
}
Preview preview(const QByteArray &data) {
    Preview result;
    if (data.size() > 128000000) return result;
    QJsonParseError error; const auto document = QJsonDocument::fromJson(data, &error); const auto root = document.toVariant().toMap();
    if (error.error != QJsonParseError::NoError || root.value("format") != "viezan-native-backup" || root.value("version").toInt() != 1 || root.value("attachments").metaType().id() != QMetaType::QVariantList) return result;
    const auto snapshot = QByteArray::fromBase64(root.value("workspace").toByteArray(), QByteArray::AbortOnBase64DecodingErrors);
    if (snapshot.isEmpty() || hash(snapshot) != root.value("sha256")) return result;
    if (root.contains("interpretation")) {
        const auto bytes = QByteArray::fromBase64(root.value("interpretation").toByteArray(), QByteArray::AbortOnBase64DecodingErrors);
        const auto meetings = QJsonDocument::fromJson(bytes, &error);
        if (hash(bytes) != root.value("interpretationSHA256") || error.error != QJsonParseError::NoError || !meetings.isArray()) return {};
        result.interpretation = meetings.toVariant().toList(); if (!Interpretation::validateArchive(result.interpretation)) return {};
    }
    const auto state = WorkbenchDomain::recover(QJsonDocument::fromJson(snapshot, &error).toVariant().toMap());
    if (error.error != QJsonParseError::NoError || state.isEmpty()) return result;
    for (const auto &record : root.value("attachments").toList()) {
        const auto image = record.toMap(); const auto id = image.value("id").toString();
        const auto bytes = QByteArray::fromBase64(image.value("data").toByteArray(), QByteArray::AbortOnBase64DecodingErrors);
        if (QUuid(id).isNull() || id.contains('/') || id.contains('\\') || result.bytes.contains(id) || bytes.isEmpty() || bytes.size() > 20000000 || hash(bytes) != image.value("sha256") || !QStringList{"image/png", "image/jpeg", "image/gif", "image/webp"}.contains(image.value("mime").toString())) return {};
        result.bytes[id] = bytes;
        result.attachments.append(QVariantMap{{"id", id}, {"name", image.value("name")}, {"mime", image.value("mime")}});
    }
    for (const auto &key : {"locale", "appearance", "voice", "speechProvider", "runtime", "rates", "autoTranslate", "autoTranslateDelay"}) if (state.contains(key)) result.preferences[key] = state.value(key);
    result.tasks = state.value("tasks").toList(); result.prompts = state.value("prompts").toList();
    result.sessions = state.value("sessions").toList();
    for (const auto &value : result.sessions) for (const auto &image : images(value.toMap())) if (!result.attachments.contains(image)) return {};
    for (const auto &task : result.tasks) for (const auto &image : images(task.toMap().value("request").toMap())) if (!result.attachments.contains(image)) return {};
    result.valid = true; return result;
}
bool materialize(const Preview &preview) {
    if (!preview.valid) return false;
    for (const auto &image : preview.attachments) if (!Attachments::restore(image.toMap(), preview.bytes.value(image.toMap().value("id").toString()))) return false;
    return true;
}
}

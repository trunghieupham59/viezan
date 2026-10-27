#include "Attachments.h"
#include <QSet>
#include <QDateTime>
#include <functional>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QImageReader>
#include <QSaveFile>
#include <QStandardPaths>
#include <QUuid>
namespace {
QString directory() { return QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation) + "/attachments"; }
}
namespace Attachments {
QVariantMap ingest(const QUrl &source) {
    if (!source.isLocalFile()) return {};
    QFile file(source.toLocalFile());
    const QFileInfo info(file);
    if (!info.isFile() || info.size() <= 0 || info.size() > 20000000 || !file.open(QIODevice::ReadOnly)) return {};
    QImageReader reader(&file); reader.setDecideFormatFromContent(true);
    const auto format = reader.format();
    const auto size = reader.size();
    if (!QList<QByteArray>{"jpeg", "png", "webp", "gif"}.contains(format) || !size.isValid() || qint64(size.width()) * size.height() > 40000000) return {};
    file.seek(0); const auto bytes = file.read(20000001);
    if (bytes.isEmpty() || bytes.size() > 20000000) return {};
    const auto id = QUuid::createUuid().toString(QUuid::WithoutBraces);
    if (!QDir().mkpath(directory())) return {};
    QFile::setPermissions(directory(), QFileDevice::ReadOwner | QFileDevice::WriteOwner | QFileDevice::ExeOwner);
    QSaveFile output(directory() + '/' + id);
    if (!output.open(QIODevice::WriteOnly) || output.write(bytes) != bytes.size() || !output.commit()) return {};
    QFile::setPermissions(output.fileName(), QFileDevice::ReadOwner | QFileDevice::WriteOwner);
    return {{"id", id}, {"name", info.fileName()}, {"mime", "image/" + QString::fromLatin1(format)}};
}
bool restore(const QVariantMap &attachment, const QByteArray &bytes) {
    const auto id = attachment.value("id").toString();
    if (QUuid(id).isNull() || id.contains('/') || id.contains('\\') || bytes.isEmpty() || bytes.size() > 20000000 || !QDir().mkpath(directory())) return false;
    QFile::setPermissions(directory(), QFileDevice::ReadOwner | QFileDevice::WriteOwner | QFileDevice::ExeOwner);
    QFile output(directory() + '/' + id);
    if (QFileInfo::exists(output.fileName())) return data(attachment) == bytes;
    if (!output.open(QIODevice::WriteOnly | QIODevice::NewOnly)) return false;
    output.setPermissions(QFileDevice::ReadOwner | QFileDevice::WriteOwner);
    const bool success = output.write(bytes) == bytes.size() && output.flush(); output.close();
    if (!success) output.remove();
    return success;
}
QByteArray data(const QVariantMap &attachment) {
    const auto id = attachment.value("id").toString();
    if (QUuid(id).isNull() || id.contains('/') || id.contains('\\') || !QStringList{"image/jpeg", "image/png", "image/webp", "image/gif"}.contains(attachment.value("mime").toString())) return {};
    const auto live = directory() + '/' + id;
    QFile file(QFileInfo::exists(live) ? live : directory() + "/recovery/" + id); const QFileInfo info(file);
    if (info.isSymLink() || !info.isFile() || info.size() <= 0 || info.size() > 20000000 || !file.open(QIODevice::ReadOnly)) return {};
    const auto bytes = file.read(20000001);
    return bytes.size() <= 20000000 ? bytes : QByteArray{};
}
}

bool Attachments::quarantineUnreferenced(const QVariantMap &workspace) {
    QSet<QString> referenced;
    std::function<void(const QVariant &)> visit = [&](const QVariant &value) {
        if (value.metaType().id() == QMetaType::QVariantMap) { const auto map = value.toMap(); if (map.contains("mime") && map.contains("id")) referenced.insert(map.value("id").toString()); for (const auto &child : map) visit(child); }
        else if (value.metaType().id() == QMetaType::QVariantList) for (const auto &child : value.toList()) visit(child);
    }; visit(workspace);
    QDir root(directory()); if (!root.exists()) return true;
    for (const auto &file : root.entryInfoList(QDir::Files | QDir::NoSymLinks | QDir::NoDotAndDotDot)) {
        if (QUuid(file.fileName()).isNull() || referenced.contains(file.fileName()) || file.lastModified().secsTo(QDateTime::currentDateTimeUtc()) < 86400) continue;
        if (!root.mkpath("recovery")) return false;
        const auto target = root.filePath("recovery/" + file.fileName());
        if (!QFileInfo::exists(target) && !QFile::rename(file.absoluteFilePath(), target)) return false;
    }
    return true;
}

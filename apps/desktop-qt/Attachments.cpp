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
bool validRestore(const QString &id, const QByteArray &bytes) {
    return !QUuid(id).isNull() && !id.contains('/') && !id.contains('\\') && !bytes.isEmpty() && bytes.size() <= 20000000;
}
bool writeNew(const QString &path, const QByteArray &bytes) {
    QFile output(path);
    if (!output.open(QIODevice::WriteOnly | QIODevice::NewOnly)) return false;
    output.setPermissions(QFileDevice::ReadOwner | QFileDevice::WriteOwner);
    const bool success = output.write(bytes) == bytes.size() && output.flush();
    output.close();
    if (!success) output.remove();
    return success;
}
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
    // Pixel size travels with the attachment (Swift ImageAttachment.width/height); older ones have none.
    return {{"id", id}, {"name", info.fileName()}, {"mime", "image/" + QString::fromLatin1(format)}, {"width", size.width()}, {"height", size.height()}};
}
bool restore(const QVariantMap &attachment, const QByteArray &bytes) {
    const auto id = attachment.value("id").toString();
    if (!validRestore(id, bytes) || !QDir().mkpath(directory())) return false;
    QFile::setPermissions(directory(), QFileDevice::ReadOwner | QFileDevice::WriteOwner | QFileDevice::ExeOwner);
    const auto path = directory() + '/' + id;
    if (QFileInfo::exists(path)) return data(attachment) == bytes;
    return writeNew(path, bytes);
}

std::shared_ptr<RestoreBatch> RestoreBatch::prepare(const QVariantList &images, const QMap<QString, QByteArray> &bytes) {
    auto batch = std::make_shared<RestoreBatch>();
    if (images.isEmpty()) return batch;
    if (!QDir().mkpath(directory())) return {};
    QFile::setPermissions(directory(), QFileDevice::ReadOwner | QFileDevice::WriteOwner | QFileDevice::ExeOwner);
    batch->staged = std::make_unique<QTemporaryDir>(directory() + "/.import-XXXXXX");
    if (!batch->staged->isValid()) return {};
    for (const auto &image : images) {
        const auto id = image.toMap().value("id").toString();
        const auto contents = bytes.value(id);
        if (!validRestore(id, contents) || !writeNew(batch->staged->filePath(id), contents)) return {};
    }
    batch->images = images;
    batch->bytes = bytes;
    return batch;
}
bool RestoreBatch::install() {
    for (const auto &value : images) {
        const auto image = value.toMap();
        const auto id = image.value("id").toString();
        const auto path = directory() + '/' + id;
        if (QFileInfo::exists(path)) {
            if (data(image) != bytes.value(id)) return false;
        } else {
            if (!QFile::rename(staged->filePath(id), path)) return false;
            installed.append(path);
        }
    }
    return true;
}
RestoreBatch::~RestoreBatch() {
    rollback();
}
void RestoreBatch::rollback() {
    for (const auto &path : installed) QFile::remove(path);
    installed.clear();
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

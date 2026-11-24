#pragma once
#include <QFileInfo>
#include <QSaveFile>
#include <QTemporaryDir>
#include <filesystem>
#include <optional>

namespace HistoryStorage {
// Both snapshots have already been staged. A failed second rename must restore
// the exact workspace file (or its absence), even when the live draft is newer.
inline QString commit(QSaveFile &workspace, QSaveFile &transcripts) {
    const QFileInfo destination(workspace.fileName());
    std::optional<QTemporaryDir> rollback;
    QString original;
    if (destination.exists()) {
        rollback.emplace(workspace.fileName() + ".rollback-XXXXXX");
        if (!rollback->isValid() || destination.size() > 134217728) return QStringLiteral("storageError");
        original = rollback->filePath("original");
        if (!QFile::copy(workspace.fileName(), original)) return QStringLiteral("storageError");
    }
    if (!workspace.commit()) return QStringLiteral("storageError");
    if (transcripts.commit()) return {};

    if (rollback) {
        std::error_code error;
        std::filesystem::rename(QFileInfo(original).filesystemFilePath(), destination.filesystemFilePath(), error);
        if (!error) return QStringLiteral("interpretStorageError");
        rollback->setAutoRemove(false); // Preserve the original if the volume also refuses rollback.
    } else if (QFile::remove(destination.filePath())) {
        return QStringLiteral("interpretStorageError");
    }
    return QStringLiteral("storageLoadError");
}
}

#pragma once
#include <QQuickImageProvider>
#include <QImageReader>
#include <QBuffer>
#include "Attachments.h"
class AttachmentImageProvider final : public QQuickImageProvider {
public:
    AttachmentImageProvider() : QQuickImageProvider(QQuickImageProvider::Image) {}
    QImage requestImage(const QString &id, QSize *size, const QSize &requestedSize) override {
        auto data = Attachments::data({{"id", id}, {"mime", "image/png"}});
        if (data.isEmpty()) return {};
        QBuffer buffer(&data); buffer.open(QIODevice::ReadOnly);
        QImageReader reader(&buffer); reader.setAutoTransform(true);
        const auto original = reader.size();
        if (!original.isValid() || qint64(original.width()) * original.height() > 40000000) return {};
        if (size) *size = original;
        if (requestedSize.isValid()) reader.setScaledSize(original.scaled(requestedSize, Qt::KeepAspectRatio));
        return reader.read();
    }
};

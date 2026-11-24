#pragma once
#include <QVariantMap>
#include <QByteArray>
#include <QUrl>
#include <QTemporaryDir>
#include <memory>
namespace Attachments {
bool quarantineUnreferenced(const QVariantMap &workspace);
QVariantMap ingest(const QUrl &source);
bool restore(const QVariantMap &attachment, const QByteArray &bytes);
QByteArray data(const QVariantMap &attachment);

class RestoreBatch {
public:
    static std::shared_ptr<RestoreBatch> prepare(const QVariantList &images, const QMap<QString, QByteArray> &bytes);
    bool install();
    void rollback();
    void accept() { installed.clear(); }
    ~RestoreBatch();
private:
    QVariantList images;
    QMap<QString, QByteArray> bytes;
    std::unique_ptr<QTemporaryDir> staged;
    QStringList installed;
};
}

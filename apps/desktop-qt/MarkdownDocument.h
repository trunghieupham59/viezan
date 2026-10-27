#pragma once
#include <QTextDocument>
#include <QQuickTextDocument>
#include <QVariant>
class MarkdownDocument final : public QTextDocument {
public:
    explicit MarkdownDocument(QObject *parent) : QTextDocument(parent) {}
protected:
    QVariant loadResource(int, const QUrl &) override { return {}; }
};

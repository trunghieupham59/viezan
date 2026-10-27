#pragma once
#include "LocalProvider.h"
#include <QNetworkAccessManager>
#include <QPointer>
#include <functional>
class ResearchJob final : public QObject {
    Q_OBJECT
public:
    explicit ResearchJob(QObject *parent = nullptr);
    void start(const QVariantMap &request, const QVariantMap &resume);
    void cancel();
signals:
    void event(const QVariantMap &value);
private:
    QVariantMap m_request, m_state;
    LocalProvider m_provider;
    QNetworkAccessManager m_network;
    QPointer<QNetworkReply> m_search;
    QString m_internal, m_text;
    bool m_cancelled = false, m_streaming = false;
    std::function<void(QString)> m_completion;
    void checkpoint();
    void fail(const QString &code);
    void advance();
    void search(const QString &query, std::function<void(QVariantList)> completion);
    void complete(const QString &input, const QString &system, std::function<void(QString)> completion, bool streaming = false);
    void synthesize();
};

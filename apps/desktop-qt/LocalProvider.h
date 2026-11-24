#pragma once
#include <QObject>
#include "CloudProtocol.h"
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QHash>
#include <QJsonArray>
#include <QStringList>
#include <QVariantMap>

class ResearchJob;
class LocalProvider final : public QObject {
    Q_OBJECT
public:
    // An injected transport must outlive this service.
    explicit LocalProvider(QObject *parent = nullptr, QNetworkAccessManager *network = nullptr);
    ~LocalProvider() override;
    static QJsonArray dictionaryMessages(const QVariantMap &input);
    void refreshModels(const QString &provider = "ollama");
    void start(const QVariantMap &task);
    void cancel(const QString &taskID);
    void cancelAll();
signals:
    void modelsReady(const QStringList &models, bool success, const QVariantMap &ollamaSizes);
    void received(const QVariantMap &event);
private:
    QHash<QString, ResearchJob *> m_researchJobs;
    void startOne(const QVariantMap &task);
    QHash<QString, QList<QVariantMap>> m_batches;
    void dispatch(const QString &id, const QString &attempt, const QString &provider, const CloudProtocol::Call &call);
    QHash<QString, QString> m_pending;
    QNetworkAccessManager *const m_network;
    QHash<QString, QNetworkReply *> m_replies;
    QNetworkReply *m_catalog = nullptr;
    bool m_catalogBusy = false;
};

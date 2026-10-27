#pragma once
#include <QObject>
#include "CloudProtocol.h"
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QHash>
#include <QStringList>
#include <QVariantMap>

class ResearchJob;
class LocalProvider final : public QObject {
    Q_OBJECT
public:
    explicit LocalProvider(QObject *parent = nullptr);
    ~LocalProvider() override;
    void refreshModels(const QString &provider = "ollama");
    void start(const QVariantMap &task);
    void cancel(const QString &taskID);
    void cancelAll();
signals:
    void modelsReady(const QStringList &models, bool success);
    void received(const QVariantMap &event);
private:
    QHash<QString, ResearchJob *> m_researchJobs;
    void startOne(const QVariantMap &task);
    QHash<QString, QList<QVariantMap>> m_batches;
    void dispatch(const QString &id, const QString &attempt, const QString &provider, const CloudProtocol::Call &call);
    QHash<QString, QString> m_pending;
    QNetworkAccessManager m_network;
    QHash<QString, QNetworkReply *> m_replies;
    QNetworkReply *m_catalog = nullptr;
    bool m_catalogBusy = false;
};

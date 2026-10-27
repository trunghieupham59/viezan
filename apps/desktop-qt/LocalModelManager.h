#pragma once
#include <QObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
class LocalModelManager final : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(double progress READ progress NOTIFY changed)
    Q_PROPERTY(QString status READ status NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
public:
    explicit LocalModelManager(QObject *parent = nullptr);
    bool busy() const { return m_reply != nullptr; }
    double progress() const { return m_progress; }
    QString status() const { return m_status; }
    QString error() const { return m_error; }
    Q_INVOKABLE void run(const QString &model, bool remove = false);
    Q_INVOKABLE void cancel();
signals:
    void changed();
    void completed();
private:
    QNetworkAccessManager m_network;
    QNetworkReply *m_reply = nullptr;
    double m_progress = -1;
    QString m_status, m_error;
};

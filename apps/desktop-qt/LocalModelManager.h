#pragma once
#include <QObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QPointer>
#include <optional>

struct PullStep {
    QString status;
    qint64 completed = 0;
    qint64 total = 0;
    double fraction() const { return total > 0 ? double(completed) / total : -1; }
    static std::optional<PullStep> parse(const QByteArray &line);
};

class LocalModelManager final : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(bool removing READ removing NOTIFY changed)
    Q_PROPERTY(double progress READ progress NOTIFY changed)
    Q_PROPERTY(qint64 completedBytes READ completedBytes NOTIFY changed)
    Q_PROPERTY(qint64 totalBytes READ totalBytes NOTIFY changed)
    Q_PROPERTY(QString status READ status NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
public:
    explicit LocalModelManager(QObject *parent = nullptr, QNetworkAccessManager *network = nullptr);
    ~LocalModelManager() override;
    bool busy() const { return m_reply != nullptr; }
    bool removing() const { return m_removing; }
    double progress() const { return m_step.fraction(); }
    qint64 completedBytes() const { return m_step.completed; }
    qint64 totalBytes() const { return m_step.total; }
    QString status() const { return m_step.status; }
    QString error() const { return m_error; }
    Q_INVOKABLE void run(const QString &model, bool remove = false);
    Q_INVOKABLE void cancel();
signals:
    void changed();
    void completed();
private:
    void abortReply();
    QPointer<QNetworkAccessManager> m_network;
    QPointer<QNetworkReply> m_reply;
    bool m_removing = false;
    PullStep m_step;
    QString m_error;
};

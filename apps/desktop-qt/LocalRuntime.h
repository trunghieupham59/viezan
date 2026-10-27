#pragma once
#include <QObject>
#include <functional>
#include <QProcess>
#include <QNetworkAccessManager>
class LocalRuntime final : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool owned READ owned NOTIFY changed)
    Q_PROPERTY(bool available READ available NOTIFY changed)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(QString version READ version NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(int processors READ processors CONSTANT)
public:
    explicit LocalRuntime(QObject *parent = nullptr);
    ~LocalRuntime() override;
    bool owned() const { return m_process.state() != QProcess::NotRunning; }
    bool available() const { return m_available; }
    bool busy() const { return m_busy; }
    QString version() const { return m_version; }
    QString error() const { return m_error; }
    int processors() const;
    Q_INVOKABLE void refresh();
    Q_INVOKABLE void start(int parallel, int context);
    Q_INVOKABLE void stop();
private:
    QProcess m_process;
    QNetworkAccessManager m_network;
    bool m_available = false, m_busy = false;
    QString m_version, m_error;
    quint64 m_generation = 0;
    void probe(std::function<void(QString)> completion);
    void awaitReady(quint64 generation, int remaining);
signals:
    void changed();
};

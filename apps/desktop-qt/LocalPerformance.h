#pragma once
#include <QObject>
#include <QFuture>
#include <QVariantMap>
#include <QVariantList>
#include <QJsonObject>
#include <atomic>
#include <memory>
class LocalPerformance final : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(QString model READ model NOTIFY changed)
    Q_PROPERTY(QVariantList results READ results NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
public:
    explicit LocalPerformance(QObject *parent = nullptr) : QObject(parent) {}
    ~LocalPerformance() override { finishBeforeShutdown(); }
    void finishBeforeShutdown() { cancel(); m_future.waitForFinished(); }
    inline static std::atomic_bool exclusive{false};
    bool busy() const { return m_busy; }
    QString model() const { return m_model; }
    QVariantList results() const { return m_results; }
    QString error() const { return m_error; }
    static QJsonObject options(const QString &model);
    Q_INVOKABLE void selectModel(const QString &model);
    Q_INVOKABLE void select(const QString &mode);
    Q_INVOKABLE void compare();
    Q_INVOKABLE void cancel();
signals:
    void changed();
private:
    QFuture<QVariantMap> m_future;
    bool m_busy = false;
    QString m_model, m_error;
    QVariantList m_results;
    std::shared_ptr<std::atomic_bool> m_cancel;
};

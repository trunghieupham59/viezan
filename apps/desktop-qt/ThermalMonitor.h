#pragma once
#include <QObject>
#include <QVariantList>
#include <QTimer>
#include "ThermalSensors.h"
class ThermalMonitor final : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantList sensors READ sensors NOTIFY changed)
    Q_PROPERTY(QVariantList fans READ fans NOTIFY changed)
    Q_PROPERTY(QVariantList rows READ rows NOTIFY changed)
    Q_PROPERTY(bool monitoring READ monitoring NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
public:
    explicit ThermalMonitor(QObject *parent = nullptr);
    QVariantList sensors() const { return m_sensors; }
    QVariantList fans() const { return m_fans; }
    QVariantList rows() const { return ThermalSensors::rows(m_sensors); }
    bool monitoring() const { return m_timer.isActive(); }
    QString error() const { return m_error; }
    Q_INVOKABLE void start();
    Q_INVOKABLE void stop();
signals:
    void changed();
private:
    QTimer m_timer;
    QVariantList m_sensors, m_fans;
    QString m_error;
    bool m_pending = false;
    quint64 m_generation = 0;
    void sample();
};

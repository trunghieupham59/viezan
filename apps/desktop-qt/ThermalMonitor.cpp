#include "ThermalMonitor.h"
#include <QDir>
#include <QFile>
#include <QFutureWatcher>
#include <QtConcurrent/QtConcurrent>
ThermalMonitor::ThermalMonitor(QObject *parent) : QObject(parent) { m_timer.setInterval(2000); connect(&m_timer, &QTimer::timeout, this, &ThermalMonitor::sample); }
void ThermalMonitor::start() {
#ifdef Q_OS_LINUX
    if (!monitoring()) { ++m_generation; m_timer.start(); sample(); emit changed(); }
#else
    m_error = "thermalPlatformHint"; emit changed();
#endif
}
void ThermalMonitor::stop() { ++m_generation; m_timer.stop(); emit changed(); }
void ThermalMonitor::sample() {
    if (m_pending) return; m_pending = true; const auto generation = m_generation;
    auto *watcher = new QFutureWatcher<QVariantMap>(this);
    connect(watcher, &QFutureWatcher<QVariantMap>::finished, this, [this, watcher, generation] {
        const auto value = watcher->result(); watcher->deleteLater(); m_pending = false; if (generation != m_generation) return;
        m_sensors = value.value("sensors").toList(); m_fans = value.value("fans").toList(); m_error = m_sensors.isEmpty() && m_fans.isEmpty() ? "thermalReadError" : ""; emit changed();
    });
    watcher->setFuture(QtConcurrent::run([] {
        QVariantList sensors, fans;
        const QDir root("/sys/class/hwmon");
        auto read = [](const QString &path) { QFile file(path); return file.open(QIODevice::ReadOnly) ? QString::fromUtf8(file.read(4096)).trimmed() : QString(); };
        for (const auto &entry : root.entryList({"hwmon*"}, QDir::Dirs | QDir::NoDotAndDotDot)) {
            const QDir chip(root.filePath(entry)); const auto name = read(chip.filePath("name"));
            for (const auto &input : chip.entryList({"temp*_input", "fan*_input"}, QDir::Files)) {
                bool ok; const auto value = read(chip.filePath(input)).toDouble(&ok); if (!ok) continue;
                const auto channel = input.left(input.size() - 6), label = read(chip.filePath(channel + "_label"));
                const QVariantMap row{{"id", entry + '/' + channel}, {"name", name + " / " + (label.isEmpty() ? channel : label)}, {"value", input.startsWith("temp") ? value / 1000 : value}};
                if (input.startsWith("temp") && value > 0 && value < 150000) sensors.append(row);
                else if (input.startsWith("fan") && value >= 0 && value <= 30000) fans.append(row);
            }
        }
        if (sensors.isEmpty()) {
            const QDir thermal("/sys/class/thermal");
            for (const auto &entry : thermal.entryList({"thermal_zone*"}, QDir::Dirs | QDir::NoDotAndDotDot)) {
                const QDir zone(thermal.filePath(entry)); bool ok = false; const auto value = read(zone.filePath("temp")).toDouble(&ok);
                if (ok && value > 0 && value < 150000) sensors.append(QVariantMap{{"id", entry}, {"name", read(zone.filePath("type"))}, {"value", value / 1000}});
            }
        }
        return QVariantMap{{"sensors", sensors}, {"fans", fans}};
    }));
}

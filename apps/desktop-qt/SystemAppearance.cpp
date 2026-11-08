#include "SystemAppearance.h"
#include "AppUninstall.h"
#include <QCoreApplication>
#include <QEvent>
#include <QFutureWatcher>
#include <QTimer>
#include <QtConcurrent/QtConcurrent>
#ifdef Q_OS_WIN
#define NOMINMAX
#include <windows.h>
#endif

namespace {
SystemAppearance::State readAppearance() {
    SystemAppearance::State result;
#ifdef Q_OS_WIN
    DWORD value = 1, size = sizeof(value);
    if (RegGetValueW(HKEY_CURRENT_USER,
        L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
        L"EnableTransparency", RRF_RT_REG_DWORD, nullptr, &value, &size) == ERROR_SUCCESS)
        result.reduceTransparency = value == 0;
    HIGHCONTRASTW contrast{}; contrast.cbSize = sizeof(contrast);
    if (SystemParametersInfoW(SPI_GETHIGHCONTRAST, sizeof(contrast), &contrast, 0))
        result.highContrast = (contrast.dwFlags & HCF_HIGHCONTRASTON) != 0;
#elif defined(Q_OS_LINUX)
    const auto dependencies = AppRemoval::nativeDependencies();
    const auto program = dependencies.tool("gsettings");
    if (!program.isEmpty()) {
        const auto reply = dependencies.run({program, {"get", "org.gnome.desktop.a11y.interface", "high-contrast"}, {}, false});
        result.highContrast = reply.started && reply.finished && reply.exitCode == 0 && reply.output.trimmed() == "true";
    }
#endif
    return result;
}
}
SystemAppearance::SystemAppearance(QObject *parent) : SystemAppearance(readAppearance, parent) {}
SystemAppearance::SystemAppearance(Reader reader, QObject *parent) : QObject(parent), m_reader(std::move(reader)) {
    if (auto *app = QCoreApplication::instance()) app->installEventFilter(this);
    QTimer::singleShot(0, this, &SystemAppearance::refresh);
}
SystemAppearance::~SystemAppearance() { m_future.waitForFinished(); }
bool SystemAppearance::eventFilter(QObject *object, QEvent *event) {
    if (event->type() == QEvent::ApplicationActivate || event->type() == QEvent::ApplicationStateChange ||
        event->type() == QEvent::ThemeChange || event->type() == QEvent::ApplicationPaletteChange)
        refresh();
    return QObject::eventFilter(object, event);
}
void SystemAppearance::refresh() {
    if (m_busy) { m_pending = true; return; }
    m_busy = true;
    auto *watcher = new QFutureWatcher<State>(this);
    connect(watcher, &QFutureWatcher<State>::finished, this, [this, watcher] {
        const auto next = watcher->result(); watcher->deleteLater(); m_busy = false;
        const auto previous = m_state; m_state = next;
        if (previous.reduceTransparency != next.reduceTransparency) emit reduceTransparencyChanged();
        if (previous.highContrast != next.highContrast) emit highContrastChanged();
        if (m_pending) { m_pending = false; refresh(); }
    });
    m_future = QtConcurrent::run(m_reader); watcher->setFuture(m_future);
}

#include <QApplication>
#include <QLockFile>
#include <QStandardPaths>
#include <QDir>
#include <QSystemTrayIcon>
#include <QMenu>
#include <QQuickWindow>
#include <QTimer>
#include <QLocalServer>
#include <QLocalSocket>
#include <QCryptographicHash>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>
#include <QPointer>
#ifdef VIEZAN_QML_LIVE_DIR
#include <QFileSystemWatcher>
#include <QQmlError>
#endif
#include "WorkbenchBridge.h"
#include "AttachmentImageProvider.h"
#include "AppUninstall.h"
#include "SystemAppearance.h"

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);
    app.setApplicationDisplayName("Viezan");
    app.setWindowIcon(QIcon(":/qml/brand.png"));
    app.setApplicationVersion(VIEZAN_VERSION);
    app.setOrganizationName("ViezanNativePreview");
    app.setApplicationName("ViezanNativeQt");
    const auto data = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    if (!QDir().mkpath(data)) return 2;
    QLockFile lock(data + "/application.lock"); lock.setStaleLockTime(0);
    const auto serverName = "viezan-" + QString::fromLatin1(QCryptographicHash::hash(data.toUtf8(), QCryptographicHash::Sha256).toHex().left(32));
    if (!lock.tryLock(0)) {
        QLocalSocket connection; connection.connectToServer(serverName);
        if (connection.waitForConnected(1000)) { connection.write("activate"); connection.waitForBytesWritten(1000); }
        return 0;
    }
    QLocalServer::removeServer(serverName);
    QLocalServer activation; activation.setSocketOptions(QLocalServer::UserAccessOption);
    if (!activation.listen(serverName)) return 3;
    if (qEnvironmentVariableIsEmpty("QT_QUICK_CONTROLS_STYLE")) {
#ifdef Q_OS_WIN
        QQuickStyle::setStyle("FluentWinUI3");
#else
        QQuickStyle::setStyle("Fusion");
#endif
    }
    WorkbenchBridge bridge;
    AppUninstall appUninstall;
    SystemAppearance systemAppearance;
    QQmlApplicationEngine engine;
    engine.addImageProvider("attachments", new AttachmentImageProvider);
    engine.rootContext()->setContextProperty("workbench", &bridge);
    engine.rootContext()->setContextProperty("appUninstall", &appUninstall);
    engine.rootContext()->setContextProperty("systemAppearance", &systemAppearance);
    QObject::connect(&app, &QGuiApplication::aboutToQuit, &bridge, &WorkbenchBridge::shutdown);
#ifdef VIEZAN_QML_LIVE_DIR
    // Development builds load the QML sources directly so a saved file can be reloaded.
    const QUrl mainQml = QUrl::fromLocalFile(QStringLiteral(VIEZAN_QML_LIVE_DIR "/Main.qml"));
#else
    const QUrl mainQml("qrc:/qml/Main.qml");
#endif
    engine.load(mainQml);
    if (engine.rootObjects().isEmpty()) return 1;
    // A live reload replaces the window; the handlers below follow this pointer.
    QPointer<QQuickWindow> window = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
    QObject::connect(&activation, &QLocalServer::newConnection, &app, [&activation, &window] {
        while (auto *connection = activation.nextPendingConnection()) {
            connection->setReadBufferSize(32);
            QObject::connect(connection, &QLocalSocket::readyRead, connection, [connection, &window] {
                if (connection->bytesAvailable() < 8) return;
                if (connection->read(9) == "activate" && window) { window->show(); window->raise(); window->requestActivate(); }
                connection->disconnectFromServer();
            });
            QObject::connect(connection, &QLocalSocket::disconnected, connection, &QObject::deleteLater);
            QTimer::singleShot(2000, connection, [connection] { connection->abort(); connection->deleteLater(); });
        }
    });
    QMenu menu;
    QSystemTrayIcon tray(QIcon(":/qml/brand.png"));
    const auto text = [&bridge](const QString &key) { return bridge.resources().value("locales").toMap().value(bridge.state().value("locale").toString()).toMap().value(key, key).toString(); };
    auto *open = menu.addAction(text("openMain"));
    QObject::connect(open, &QAction::triggered, &app, [&window] { if (window) { window->show(); window->raise(); window->requestActivate(); } });
    for (const auto &action : {QString("quickChat"), QString("translateSelection"), QString("launcher")}) {
        auto *item = menu.addAction(text(action));
        QObject::connect(item, &QAction::triggered, &app, [&bridge, action] { bridge.desktopIntegration()->trigger(action); });
    }
    menu.addSeparator(); auto *quit = menu.addAction(text("quit"));
    QObject::connect(quit, &QAction::triggered, &app, [&bridge, &app] {
        if (bridge.localPerformance()->busy()) { bridge.localPerformance()->cancel(); return; }
        app.quit();
    });
    QObject::connect(&tray, &QSystemTrayIcon::activated, &app, [&window](QSystemTrayIcon::ActivationReason reason) { if (window && reason == QSystemTrayIcon::Trigger) { window->show(); window->raise(); window->requestActivate(); } });
    QObject::connect(bridge.thermalMonitor(), &ThermalMonitor::changed, &tray, [&bridge, &tray] {
        double highest = 0; for (const auto &sensor : bridge.thermalMonitor()->sensors()) highest = qMax(highest, sensor.toMap().value("value").toDouble());
        tray.setToolTip(bridge.thermalMonitor()->monitoring() && highest > 0 ? "Viezan · " + QString::number(highest, 'f', 0) + " °C" : "Viezan");
    });
    tray.setContextMenu(&menu); tray.setToolTip("Viezan");
    app.setQuitOnLastWindowClosed(!QSystemTrayIcon::isSystemTrayAvailable());
    if (QSystemTrayIcon::isSystemTrayAvailable()) tray.show();
    bridge.desktopIntegration()->activate();
#ifdef VIEZAN_QML_LIVE_DIR
    // Rebuild the window from the sources shortly after any QML file is saved.
    // The bridge keeps the workspace state; a file that fails to load leaves the
    // previous window closed until the next save and reports through the tray.
    const QDir liveDir(QStringLiteral(VIEZAN_QML_LIVE_DIR));
    QFileSystemWatcher watcher;
    const auto watch = [&watcher, &liveDir] {
        watcher.addPath(liveDir.path());
        for (const auto &name : liveDir.entryList({"*.qml"}, QDir::Files)) watcher.addPath(liveDir.filePath(name));
    };
    watch();
    QStringList liveWarnings;
    QObject::connect(&engine, &QQmlEngine::warnings, &app, [&liveWarnings](const QList<QQmlError> &errors) { for (const auto &error : errors) liveWarnings << error.toString(); });
    QTimer reload; reload.setSingleShot(true); reload.setInterval(250);
    QObject::connect(&watcher, &QFileSystemWatcher::fileChanged, &reload, qOverload<>(&QTimer::start));
    QObject::connect(&watcher, &QFileSystemWatcher::directoryChanged, &reload, qOverload<>(&QTimer::start));
    QObject::connect(&reload, &QTimer::timeout, &app, [&] {
        const auto geometry = window ? window->geometry() : QRect();
        const auto previous = engine.rootObjects();
        qDeleteAll(previous);
        engine.clearComponentCache(); liveWarnings.clear();
        engine.load(mainQml);
        for (auto *object : engine.rootObjects()) if (!previous.contains(object)) window = qobject_cast<QQuickWindow *>(object);
        if (window && geometry.isValid()) window->setGeometry(geometry);
        if (!window) tray.showMessage("Viezan QML", liveWarnings.value(0, "Main.qml failed to load"), QSystemTrayIcon::Warning);
        watch(); // editors replace files on save, which drops their watch
    });
#endif
    return app.exec();
}

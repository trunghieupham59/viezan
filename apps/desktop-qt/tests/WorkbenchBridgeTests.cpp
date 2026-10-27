#include "../WorkbenchBridge.h"
#include <QFile>
#include <QInputMethodEvent>
#include <QJsonDocument>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QSignalSpy>
#include <QQuickItem>
#include <QQuickWindow>
#include <QPointer>
#include <QTemporaryDir>
#include <QTest>
#include <QTimer>

static QVariantMap current(const WorkbenchBridge &bridge) {
    const auto state = bridge.state();
    const auto id = state.value("active").toMap().value(state.value("feature").toString());
    for (const auto &value : state.value("sessions").toList()) if (value.toMap().value("id") == id) return value.toMap();
    return {};
}
static QVariantMap latest(const WorkbenchBridge &bridge) { return bridge.state().value("tasks").toList().value(0).toMap(); }
static void chunk(WorkbenchBridge &bridge, const QVariantMap &task, const QString &text) {
    bridge.command("receive", {{"taskID", task.value("id")}, {"attemptID", task.value("attemptID")}, {"chunk", text}});
}
static QQuickItem *visualItem(QQuickItem *item, const QString &name) {
    if (item->objectName() == name) return item;
    for (auto *child : item->childItems()) if (auto *found = visualItem(child, name)) return found;
    return nullptr;
}

static QQuickItem *visualText(QQuickItem *item, const QString &text) {
    if (item->property("text").toString() == text) return item;
    for (auto *child : item->childItems()) if (auto *found = visualText(child, text)) return found;
    return nullptr;
}

class WorkbenchBridgeTests : public QObject {
    Q_OBJECT
private slots:
    void editorUndoDoesNotCrossSessions_data() {
        QTest::addColumn<QString>("feature");
        QTest::newRow("chat") << QString("chat");
        QTest::newRow("translate") << QString("translate");
    }
    void editorUndoDoesNotCrossSessions() {
        QFETCH(QString, feature);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("navigate", {{"feature", feature}});
        bridge.command("draft", {{"value", "Base draft"}});
        const auto oldID = current(bridge).value("id");
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        auto *editor = visualItem(root->contentItem(), feature == "chat" ? "chat-draft" : "source-draft");
        QVERIFY(editor);
        editor->forceActiveFocus();
        editor->setProperty("cursorPosition", 10);
        QTest::keyClick(root, Qt::Key_X);
        QCOMPARE(current(bridge).value("draft").toString(), QString("Base draftx"));
        QTest::keyClick(root, Qt::Key_Z, Qt::ControlModifier);
        QCOMPARE(current(bridge).value("draft").toString(), QString("Base draft"));
        QTest::keyClick(root, Qt::Key_Z, Qt::ControlModifier | Qt::ShiftModifier);
        QCOMPARE(current(bridge).value("draft").toString(), QString("Base draftx"));
        QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "new"), Q_ARG(QVariant, QVariant())));
        QTRY_VERIFY(editor->hasActiveFocus());
        const auto fresh = bridge.state();
        QVERIFY(current(bridge).value("id") != oldID);
        QTest::keyClick(root, Qt::Key_Z, Qt::ControlModifier);
        QCOMPARE(bridge.state(), fresh);
    }
    void keypadHistoryRespectsCompositionAndOpensSelection() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("draft", {{"value", "Target history 日本語"}});
        const auto target = current(bridge).value("id").toString();
        bridge.command("new");
        bridge.command("draft", {{"value", "Keep current draft"}});
        const auto before = bridge.state();
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "history"), Q_ARG(QVariant, QVariant())));
        auto *search = visualItem(root->contentItem(), "history-search");
        QVERIFY(search);
        QTRY_VERIFY(search->hasActiveFocus());
        search->setProperty("text", "Target history");
        QTRY_COMPARE(root->property("quickID").toString(), target);
        QInputMethodEvent composing(QString::fromUtf8("にほん"), {});
        QCoreApplication::sendEvent(search, &composing);
        QTRY_VERIFY(search->property("inputMethodComposing").toBool());
        QTest::keyClick(root, Qt::Key_Enter);
        QCOMPARE(bridge.state(), before);
        QVERIFY(root->findChild<QObject *>("quick-history")->property("visible").toBool());
        QInputMethodEvent finished;
        QCoreApplication::sendEvent(search, &finished);
        QTRY_VERIFY(!search->property("inputMethodComposing").toBool());
        QTest::keyClick(root, Qt::Key_Enter);
        QCOMPARE(current(bridge).value("id").toString(), target);
        QVERIFY(!root->findChild<QObject *>("quick-history")->property("visible").toBool());
        QCOMPARE(bridge.state().value("sessions"), before.value("sessions"));
    }
    void keypadSubmitAndCommands_data() {
        QTest::addColumn<QString>("feature");
        QTest::newRow("chat") << QString("chat");
        QTest::newRow("translate") << QString("translate");
    }
    void keypadSubmitAndCommands() {
        QFETCH(QString, feature);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("navigate", {{"feature", feature}});
        bridge.command("draft", {{"value", "Keypad 日本語"}});
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        auto *editor = visualItem(root->contentItem(), feature == "chat" ? "chat-draft" : "source-draft");
        QVERIFY(editor);
        editor->forceActiveFocus();
        QInputMethodEvent composing(QString::fromUtf8("にほん"), {});
        QCoreApplication::sendEvent(editor, &composing);
        QTRY_VERIFY(editor->property("inputMethodComposing").toBool());
        QTest::keyClick(root, Qt::Key_Enter, Qt::ControlModifier);
        QVERIFY(bridge.state().value("tasks").toList().isEmpty());
        QInputMethodEvent finished;
        QCoreApplication::sendEvent(editor, &finished);
        QTRY_VERIFY(!editor->property("inputMethodComposing").toBool());
        QTest::keyClick(root, Qt::Key_Enter, Qt::ControlModifier);
        QCOMPARE(latest(bridge).value("status").toString(), QString("running"));
        const auto running = bridge.state();
        QTest::keyClick(root, Qt::Key_Enter, Qt::ControlModifier);
        QCOMPARE(bridge.state(), running);
        QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "commands"), Q_ARG(QVariant, QVariant())));
        auto *search = visualItem(root->contentItem(), "command-search");
        QVERIFY(search);
        QTRY_VERIFY(search->hasActiveFocus());
        QCoreApplication::sendEvent(search, &composing);
        QTRY_VERIFY(search->property("inputMethodComposing").toBool());
        QTest::keyClick(root, Qt::Key_Enter);
        QVERIFY(root->findChild<QObject *>("command-palette")->property("visible").toBool());
        QCoreApplication::sendEvent(search, &finished);
        QTRY_VERIFY(!search->property("inputMethodComposing").toBool());
        search->setProperty("text", "Cài đặt");
        QTest::keyClick(root, Qt::Key_Enter);
        QTRY_VERIFY(root->property("settings").toBool());
        QVERIFY(!root->findChild<QObject *>("command-palette")->property("visible").toBool());
        QCOMPARE(bridge.state().value("sessions"), running.value("sessions"));
        QCOMPARE(bridge.state().value("tasks"), running.value("tasks"));
        QCOMPARE(bridge.state().value("active"), running.value("active"));
        QCOMPARE(bridge.state().value("shell").toMap().value("lastRoute").toString(), QString("settings"));
    }
    void navigationSelectionSurvivesRepeatedActivation_data() {
        QTest::addColumn<QString>("locale");
        QTest::addColumn<int>("width");
        for (const auto &locale : {"vi", "en", "ja"})
            for (int width : {640, 820, 1200, 1440})
                QTest::newRow(qPrintable(QString("%1-%2").arg(locale).arg(width))) << QString(locale) << width;
    }
    void navigationSelectionSurvivesRepeatedActivation() {
        QFETCH(QString, locale); QFETCH(int, width);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("locale", {{"value", locale}});
        const auto labels = bridge.resources().value("locales").toMap().value(locale).toMap();
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        root->setWidth(width); root->setHeight(480);
        QCoreApplication::processEvents();
        auto *nav = visualItem(root->contentItem(), "primary-navigation");
        QVERIFY(nav);
        auto *chat = visualText(nav, labels.value("chat").toString());
        auto *translate = visualText(nav, labels.value("translate").toString());
        QVERIFY(chat); QVERIFY(translate);
        QTRY_VERIFY(chat->width() > 0);
        const auto click = [&](QQuickItem *item) {
            QTest::mouseClick(root, Qt::LeftButton, Qt::NoModifier,
                item->mapToScene(QPointF(item->width()/2, item->height()/2)).toPoint());
        };
        QTRY_VERIFY(chat->property("checked").toBool());
        click(chat);
        QTRY_VERIFY(chat->property("checked").toBool());
        click(translate);
        QTRY_VERIFY(translate->property("checked").toBool());
        QVERIFY(!chat->property("checked").toBool());
        click(translate);
        QTRY_VERIFY(translate->property("checked").toBool());
        translate->forceActiveFocus();
        QTest::keyClick(root, Qt::Key_Space);
        QVERIFY(translate->property("checked").toBool());
        QCOMPARE(bridge.state().value("feature").toString(), QString("translate"));
    }
    void submitShortcutDoesNotCancelRunningTask_data() {
        QTest::addColumn<QString>("feature");
        QTest::newRow("chat") << QString("chat");
        QTest::newRow("translate") << QString("translate");
    }
    void submitShortcutDoesNotCancelRunningTask() {
        QFETCH(QString, feature);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("navigate", {{"feature", feature}});
        bridge.command("draft", {{"value", "日本語 · Tiếng Việt"}});
        bridge.command("submit");
        const auto before = bridge.state();
        QCOMPARE(latest(bridge).value("status").toString(), QString("running"));
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        auto *editor = visualItem(root->contentItem(), feature == "chat" ? "chat-draft" : "source-draft");
        QVERIFY(editor);
        editor->forceActiveFocus();
        QTRY_VERIFY(editor->hasActiveFocus());
        QTest::keyClick(root, Qt::Key_Return, Qt::ControlModifier);
        QCOMPARE(bridge.state(), before);
        QCOMPARE(latest(bridge).value("status").toString(), QString("running"));
    }
    void foundationOverlayResizeAndEscape_data() {
        QTest::addColumn<QString>("locale");
        QTest::addColumn<QString>("mode");
        for (const auto &locale : {"vi", "en", "ja"})
            for (const auto &mode : {"light", "dark"})
                QTest::newRow(qPrintable(QString("%1-%2").arg(locale).arg(mode))) << QString(locale) << QString(mode);
    }
    void foundationOverlayResizeAndEscape() {
        QFETCH(QString, locale); QFETCH(QString, mode);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("locale", {{"value", locale}});
        bridge.command("appearance", {{"mode", mode}, {"textSize", "large"}});
        for (int i = 0; i < 8; ++i) {
            bridge.command("new");
            bridge.command("draft", {{"value", QString("Draft %1 日本語").arg(i)}});
        }
        const auto before = bridge.state();
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        auto *opener = visualItem(root->contentItem(), "chat-draft");
        QVERIFY(opener);
        for (const auto &id : {"history", "commands", "activity"}) {
            root->setWidth(1440); root->setHeight(900);
            opener->forceActiveFocus();
            QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, id), Q_ARG(QVariant, QVariant::fromValue(opener))));
            const auto name = QString(id) == "history" ? "quick-history" : QString(id) == "commands" ? "command-palette" : "activity-panel";
            auto *panel = root->findChild<QObject *>(name);
            QVERIFY(panel);
            QTRY_VERIFY(panel->property("visible").toBool());
            for (int width : {640, 820, 1200, 1440}) {
                root->setWidth(width); root->setHeight(480);
                QTRY_VERIFY(panel->property("x").toDouble() >= 0);
                QTRY_VERIFY(panel->property("x").toDouble() + panel->property("width").toDouble() <= root->width());
                QTRY_VERIFY(panel->property("y").toDouble() + panel->property("height").toDouble() <= root->height());
            }
            QTest::keyClick(root, Qt::Key_Escape);
            QTRY_VERIFY(!panel->property("visible").toBool());
            QTRY_VERIFY(opener->hasActiveFocus());
        }
        QCOMPARE(bridge.state(), before);
        QCOMPARE(warnings.count(), 0);
    }
    void foundationPanelDismissControlsRemainReachable() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("locale", {{"value", "ja"}});
        for (int i = 0; i < 12; ++i) {
            bridge.command("new");
            bridge.command("draft", {{"value", QString("QA %1 日本語").arg(i)}});
            bridge.command("submit");
        }
        bridge.command("draft", {{"value", "Unsent draft\n日本語\nTiếng Việt"}});
        const auto before = bridge.state();
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        root->setWidth(640); root->setHeight(480);
        QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "activity"), Q_ARG(QVariant, QVariant())));
        auto *panel = root->findChild<QObject *>("activity-panel");
        QVERIFY(panel);
        QTRY_VERIFY(panel->property("visible").toBool());
        auto *close = visualItem(root->contentItem(), "activity-close");
        auto *scroll = visualItem(root->contentItem(), "activity-scroll");
        QVERIFY(close); QVERIFY(scroll);
        QTRY_VERIFY(close->hasActiveFocus());
        QTRY_VERIFY(close->mapToScene(QPointF(close->width(), 0)).x() <= root->width());
        const auto position = close->mapToScene(QPointF(0, 0));
        auto *flickable = scroll->property("contentItem").value<QObject *>();
        QVERIFY(flickable);
        QTRY_VERIFY(flickable->property("contentHeight").toDouble() > scroll->height());
        QVERIFY(flickable->setProperty("contentY", 300));
        QCoreApplication::processEvents();
        QCOMPARE(close->mapToScene(QPointF(0, 0)), position);
        QVERIFY(close->isVisible() && close->isEnabled());
        QVERIFY(QMetaObject::invokeMethod(close, "clicked"));
        QTRY_VERIFY(!panel->property("visible").toBool());
        QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "history"), Q_ARG(QVariant, QVariant())));
        auto *history = root->findChild<QObject *>("quick-history");
        QVERIFY(history);
        QTRY_VERIFY(history->property("visible").toBool());
        auto *snippet = visualItem(root->contentItem(), "history-snippet");
        QVERIFY(snippet);
        QVERIFY(!snippet->property("text").toString().contains('\n'));
        QCOMPARE(snippet->property("maximumLineCount").toInt(), 1);
        auto *historyClose = visualItem(root->contentItem(), "history-close");
        QVERIFY(historyClose);
        QVERIFY(historyClose->isVisible() && historyClose->isEnabled());
        QVERIFY(historyClose->mapToScene(QPointF(historyClose->width(), 0)).x() <= root->width());
        QVERIFY(QMetaObject::invokeMethod(historyClose, "clicked"));
        QTRY_VERIFY(!history->property("visible").toBool());
        QCOMPARE(bridge.state(), before);
        QCOMPARE(warnings.count(), 0);
    }
    void foundationSaveRetryControls_data() {
        QTest::addColumn<QString>("locale");
        QTest::addColumn<int>("width");
        for (const auto &locale : {"vi", "en", "ja"})
            for (int width : {640, 820, 1200, 1440})
                QTest::newRow(qPrintable(QString("%1-%2").arg(locale).arg(width))) << QString(locale) << width;
    }
    void foundationSaveRetryControls() {
        QFETCH(QString, locale); QFETCH(int, width);
        QTemporaryDir dir;
        QFile blocker(dir.filePath("blocker"));
        QVERIFY(blocker.open(QIODevice::WriteOnly)); blocker.close();
        const auto path = blocker.fileName() + "/state.json";
        WorkbenchBridge bridge(nullptr, path, false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("locale", {{"value", locale}});
        bridge.command("draft", {{"value", "Keep this draft 日本語"}});
        QCOMPARE(bridge.storageError(), QString("storageError"));
        QVERIFY(!bridge.loadBlocked());
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        root->setWidth(width); root->setHeight(480);
        QCoreApplication::processEvents();
        const auto labels = bridge.resources().value("locales").toMap().value(locale).toMap();
        auto *retry = visualText(root->contentItem(), labels.value("retrySave").toString());
        auto *notice = visualText(root->contentItem(), labels.value("storageError").toString());
        auto *draft = visualItem(root->contentItem(), "chat-draft");
        QVERIFY(retry); QVERIFY(notice); QVERIFY(draft);
        QVERIFY(retry->isVisible() && retry->isEnabled());
        QVERIFY(draft->isEnabled());
        for (auto *item : {retry, notice, draft}) {
            QVERIFY(item->width() > 0);
            QVERIFY(item->mapToScene(QPointF(0, 0)).x() >= 0);
            QVERIFY(item->mapToScene(QPointF(item->width(), 0)).x() <= root->width());
        }
        QVERIFY(blocker.remove()); // Only this test's temporary obstacle.
        QVERIFY(QMetaObject::invokeMethod(retry, "clicked"));
        QTRY_VERIFY(bridge.storageError().isEmpty());
        QTRY_VERIFY(!retry->isVisible());
        WorkbenchBridge restored(nullptr, path, false);
        QCOMPARE(current(restored).value("draft").toString(), QString("Keep this draft 日本語"));
        QCOMPARE(warnings.count(), 0);
    }
    void foundationMarkedTextAndCompactDismissal() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        root->setWidth(640); root->setHeight(480);
        auto execute = [&](const QString &id) { return QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, id), Q_ARG(QVariant, QVariant())); };
        QVERIFY(execute("commands"));
        auto *palette = root->findChild<QObject *>("command-palette");
        QVERIFY(palette);
        QTRY_VERIFY(palette->property("visible").toBool());
        auto *search = visualItem(root->contentItem(), "command-search");
        QVERIFY(search);
        QTRY_VERIFY(search->hasActiveFocus());
        QInputMethodEvent preedit(QString::fromUtf8("にほん"), {});
        QCoreApplication::sendEvent(search, &preedit);
        QTRY_VERIFY(search->property("inputMethodComposing").toBool());
        const auto before = bridge.state();
        QTest::keyClick(root, Qt::Key_Return);
        QTest::keyClick(root, Qt::Key_Escape);
        QVERIFY(palette->property("visible").toBool());
        QCOMPARE(bridge.state(), before);
        QInputMethodEvent commit;
        commit.setCommitString(QString::fromUtf8("日本"));
        QCoreApplication::sendEvent(search, &commit);
        QTRY_VERIFY(!search->property("inputMethodComposing").toBool());
        QTest::keyClick(root, Qt::Key_Escape);
        QTRY_VERIFY(!palette->property("visible").toBool());
        QVERIFY(execute("navigation"));
        auto *navigation = root->findChild<QObject *>("navigation-overlay");
        QVERIFY(navigation);
        QTRY_VERIFY(navigation->property("visible").toBool());
        QVERIFY(execute("commands"));
        QTRY_VERIFY(!navigation->property("visible").toBool());
        QVERIFY(execute("navigation"));
        QTRY_VERIFY(!palette->property("visible").toBool());
        root->setWidth(1200);
        QTRY_VERIFY(!navigation->property("visible").toBool());
        QCOMPARE(bridge.state(), before);
    }
    void foundationBlockedLoadInMountedShell() {
        QTemporaryDir dir;
        const auto path = dir.filePath("state.json");
        QFile file(path); QVERIFY(file.open(QIODevice::WriteOnly)); file.write("invalid-json"); file.close();
        WorkbenchBridge bridge(nullptr, path, false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = engine.rootObjects().first();
        const auto before = bridge.state();
        for (const auto &id : {"new", "translate", "history"})
            QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, id), Q_ARG(QVariant, QVariant())));
        QCOMPARE(bridge.state(), before);
        QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "settings"), Q_ARG(QVariant, QVariant())));
        QVERIFY(root->property("settings").toBool());
        QVERIFY(file.open(QIODevice::ReadOnly)); QCOMPARE(file.readAll(), QByteArray("invalid-json"));
    }
    void foundationLayoutAndNavigation_data() {
        QTest::addColumn<QString>("locale");
        QTest::addColumn<int>("width");
        QTest::addColumn<QString>("mode");
        for (const auto &locale : {"vi", "en", "ja"})
            for (const auto width : {640, 820, 1200, 1440})
                for (const auto &mode : {"light", "dark"})
                    QTest::newRow(qPrintable(QString("%1-%2-%3").arg(locale).arg(width).arg(mode))) << QString(locale) << width << QString(mode);
    }
    void foundationLayoutAndNavigation() {
        QFETCH(QString, locale); QFETCH(int, width); QFETCH(QString, mode);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("locale", {{"value", locale}});
        bridge.command("appearance", {{"mode", mode}});
        bridge.command("draft", {{"value", "Foundation draft 日本語"}});
        const auto before = bridge.state();
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        root->setWidth(width); root->setHeight(600);
        QCoreApplication::processEvents();
        auto *navigation = visualItem(root->contentItem(), "primary-navigation");
        QVERIFY(navigation);
        QTRY_VERIFY(qAbs(navigation->width() - (width < 900 ? 60.0 : 236.0)) < 0.5);
        QCOMPARE(bridge.state(), before);
        bridge.command("navigation", {{"collapsed", true}});
        QTRY_COMPARE(navigation->width(), 60.0);
        root->setWidth(820); QCoreApplication::processEvents();
        root->setWidth(1200); QCoreApplication::processEvents();
        QTRY_COMPARE(navigation->width(), 60.0);
        QVERIFY(bridge.state().value("shell").toMap().value("navigationCollapsed").toBool());
        QCOMPARE(bridge.state().value("sessions"), before.value("sessions"));
        WorkbenchBridge restored(nullptr, dir.filePath("state.json"), false);
        QVERIFY(restored.state().value("shell").toMap().value("navigationCollapsed").toBool());
        root->setWidth(width);
        QCoreApplication::processEvents();
        QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "commands"), Q_ARG(QVariant, QVariant())));
        auto *palette = root->findChild<QObject *>("command-palette");
        QVERIFY(palette);
        QTRY_VERIFY(palette->property("visible").toBool());
        QVERIFY(palette->property("width").toDouble() <= width);
        auto *search = visualItem(root->contentItem(), "command-search");
        QVERIFY(search);
        QTRY_VERIFY(search->hasActiveFocus());
        search->setProperty("text", locale == "vi" ? "lich su" : locale == "en" ? "History" : "履歴");
        QCoreApplication::processEvents();
        QCOMPARE(root->property("commandIndex").toInt(), 0);
        QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "activity"), Q_ARG(QVariant, QVariant())));
        QTRY_VERIFY(!palette->property("visible").toBool());
        QCOMPARE(warnings.count(), 0);
    }
    void chatStreamingKeepsSelectionAndReadingPosition_data() {
        QTest::addColumn<QString>("locale");
        QTest::addColumn<bool>("compact");
        QTest::newRow("vi-wide") << "vi" << false;
        QTest::newRow("en-wide") << "en" << false;
        QTest::newRow("ja-wide") << "ja" << false;
        QTest::newRow("vi-640") << "vi" << true;
        QTest::newRow("en-640") << "en" << true;
        QTest::newRow("ja-640") << "ja" << true;
    }
    void chatStreamingKeepsSelectionAndReadingPosition() {
        QFETCH(QString, locale);
        QFETCH(bool, compact);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("locale", {{"value", locale}});
        const auto chatID = current(bridge).value("id");
        bridge.command("draft", {{"value", "Question"}}); bridge.command("submit");
        bridge.command("draft", {{"value", "Next draft"}});
        const auto task = latest(bridge);
        const auto initial = QString("日本語・Tiếng Việt・👩🏽‍💻\n") + QString("A paragraph of readable streamed content.\n").repeated(40);
        chunk(bridge, task, initial);
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        if (compact) { root->setWidth(640); root->setHeight(600); }
        QCoreApplication::processEvents();
        auto *chat = visualItem(root->contentItem(), "chat-transcript");
        auto *list = visualItem(root->contentItem(), "chat-message-list");
        QVERIFY(chat); QVERIFY(list);
        chat->setProperty("followLatest", false);
        list->setProperty("contentY", 0);
        QCoreApplication::processEvents();
        const auto name = "chat-text-" + task.value("id").toString();
        QPointer<QQuickItem> editor = visualItem(root->contentItem(), name);
        QVERIFY(editor);
        QTRY_COMPARE(editor->property("text").toString(), initial);
        QVERIFY(QMetaObject::invokeMethod(editor, "select", Q_ARG(int, 0), Q_ARG(int, 3)));
        QCOMPARE(editor->property("selectedText").toString(), QString("日本語"));
        const auto position = list->property("contentY").toDouble();
        const auto right = editor->mapToScene(QPointF(editor->width(), 0)).x();
        QVERIFY(editor->width() > 0); QVERIFY(right <= root->width());
        chunk(bridge, task, "New chunk・日本語");
        QCoreApplication::processEvents();
        QVERIFY(editor); // Same native TextArea survives the changed snapshot.
        QCOMPARE(editor.data(), visualItem(root->contentItem(), name));
        QTRY_COMPARE(editor->property("text").toString(), initial + "New chunk・日本語");
        QCOMPARE(editor->property("selectedText").toString(), QString("日本語"));
        QCOMPARE(list->property("contentY").toDouble(), position);
        QCOMPARE(current(bridge).value("draft").toString(), QString("Next draft"));
        QVERIFY(QMetaObject::invokeMethod(chat, "returnToLatest"));
        QCoreApplication::processEvents();
        QVERIFY(chat->property("followLatest").toBool());
        QTRY_VERIFY(list->property("atYEnd").toBool());
        QCOMPARE(editor->property("selectedText").toString(), QString());
        bridge.command("new");
        QCoreApplication::processEvents();
        QTRY_COMPARE(chat->property("conversationID").toString(), current(bridge).value("id").toString());
        QTRY_COMPARE(list->property("count").toInt(), 0);
        QCOMPARE(latest(bridge).value("status").toString(), QString("running"));
        bridge.command("select", {{"sessionID", chatID}});
        QCoreApplication::processEvents();
        QTRY_COMPARE(list->property("count").toInt(), 2);
        QCOMPARE(current(bridge).value("draft").toString(), QString("Next draft"));
        QCOMPARE(warnings.count(), 0);
    }
    void roundTripAndSeparateDrafts() {
        QTemporaryDir dir;
        const auto file = dir.filePath("state.json");
        QString chatID;
        {
            WorkbenchBridge bridge(nullptr, file, false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
            chatID = current(bridge).value("id").toString();
            bridge.command("draft", {{"value", "Tiếng Việt・日本語"}});
            bridge.command("model", {{"value", "demo.slow"}});
            bridge.command("navigate", {{"feature", "translate"}});
            bridge.command("draft", {{"value", "Translate draft"}});
            bridge.shutdown();
            QVERIFY(bridge.storageError().isEmpty());
        }
        WorkbenchBridge restored(nullptr, file, false);
        QCOMPARE(current(restored).value("draft").toString(), QString("Translate draft"));
        restored.command("select", {{"sessionID", chatID}});
        QCOMPARE(current(restored).value("draft").toString(), QString("Tiếng Việt・日本語"));
        QCOMPARE(current(restored).value("model").toString(), QString("ollama:llama3.2"));
    }
    void corruptFileIsPreserved() {
        QTemporaryDir dir;
        const auto path = dir.filePath("state.json");
        QFile file(path); QVERIFY(file.open(QIODevice::WriteOnly)); file.write("invalid-json"); file.close();
        WorkbenchBridge bridge(nullptr, path, false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        QVERIFY(bridge.loadBlocked());
        bridge.command("draft", {{"value", "Do not replace"}}); bridge.save();
        QVERIFY(file.open(QIODevice::ReadOnly)); QCOMPARE(file.readAll(), QByteArray("invalid-json"));
    }
    void sharedRecoveryAndLateEvents() {
        QTemporaryDir dir;
        const auto path = dir.filePath("state.json");
        QVERIFY(QFile::copy(VIEZAN_CONTRACT_FIXTURE, path));
        WorkbenchBridge bridge(nullptr, path, false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        QCOMPARE(latest(bridge).value("status").toString(), QString("interrupted"));
        QCOMPARE(current(bridge).value("draft").toString(), QString("Bản nháp chưa gửi"));
        const auto old = latest(bridge);
        bridge.command("retry", {{"taskID", old.value("id")}});
        const auto attempt = latest(bridge);
        QVERIFY(attempt.value("attemptID") != old.value("attemptID"));
        chunk(bridge, old, "stale");
        QCOMPARE(latest(bridge).value("output").toString(), QString());
        chunk(bridge, attempt, "New result");
        bridge.shutdown();
        WorkbenchBridge restored(nullptr, path, false);
        QCOMPARE(latest(restored).value("output").toString(), QString("New result"));
        QCOMPARE(current(restored).value("messages").toList().size(), 2);
    }
    void translationInvalidation() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("navigate", {{"feature", "translate"}});
        bridge.command("draft", {{"value", "Original"}}); bridge.command("submit");
        const auto task = latest(bridge); chunk(bridge, task, "Partial");
        bridge.command("pair", {{"source", "en"}, {"target", "ja"}});
        chunk(bridge, task, "Wrong language");
        QCOMPARE(current(bridge).value("output").toString(), QString());
        QCOMPARE(latest(bridge).value("status").toString(), QString("cancelled"));
    }
    void saveFailureCanRetryWithoutLosingDraft() {
        QTemporaryDir dir;
        const auto blocker = dir.filePath("blocker");
        QFile file(blocker); QVERIFY(file.open(QIODevice::WriteOnly)); file.close();
        WorkbenchBridge bridge(nullptr, blocker + "/state.json", false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("draft", {{"value", "Keep this draft"}});
        QCOMPARE(bridge.storageError(), QString("storageError"));
        QCOMPARE(current(bridge).value("draft").toString(), QString("Keep this draft"));
        QVERIFY(file.remove()); // This test owns the temporary blocking file.
        bridge.save();
        QVERIFY(bridge.storageError().isEmpty());
        WorkbenchBridge restored(nullptr, blocker + "/state.json", false);
        QCOMPARE(current(restored).value("draft").toString(), QString("Keep this draft"));
    }
    void failureAndRetryUseQueuedProviderEvents() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("model", {{"value", "ollama:test-model"}});
        bridge.command("draft", {{"value", "Question"}}); bridge.command("submit");
        const auto first = latest(bridge);
        QTimer::singleShot(0, &bridge, [&bridge, first] {
            bridge.command("receive", {{"taskID", first.value("id")}, {"attemptID", first.value("attemptID")}, {"terminal", "failed"}});
        });
        QTRY_COMPARE(latest(bridge).value("status").toString(), QString("failed"));
        bridge.command("retry", {{"taskID", first.value("id")}});
        const auto retry = latest(bridge);
        QVERIFY(retry.value("attemptID") != first.value("attemptID"));
        QTimer::singleShot(0, &bridge, [&bridge, first, retry] {
            chunk(bridge, first, "stale");
            bridge.command("receive", {{"taskID", retry.value("id")}, {"attemptID", retry.value("attemptID")}, {"chunk", "Recovered reply"}, {"terminal", "succeeded"}});
        });
        QTRY_COMPARE(latest(bridge).value("status").toString(), QString("succeeded"));
        QCOMPARE(latest(bridge).value("output").toString(), QString("Recovered reply"));
        QCOMPARE(latest(bridge).value("attemptNumber").toInt(), 2);
        QCOMPARE(current(bridge).value("messages").toList().size(), 2);
    }
    void appearanceRoundTripKeepsWorkAndRejectsInvalidValues() {
        QTemporaryDir dir;
        const auto path = dir.filePath("state.json");
        WorkbenchBridge bridge(nullptr, path, false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("draft", {{"value", "Question"}}); bridge.command("submit");
        bridge.command("draft", {{"value", "Unsent draft"}});
        const auto before = bridge.state();
        bridge.command("appearance", {{"mode", "light"}, {"textSize", "large"}});
        bridge.command("locale", {{"value", "ja"}});
        QCOMPARE(bridge.state().value("sessions"), before.value("sessions"));
        QCOMPARE(bridge.state().value("tasks"), before.value("tasks"));
        QCOMPARE(bridge.state().value("active"), before.value("active"));
        WorkbenchBridge restored(nullptr, path, false);
        QCOMPARE(restored.state().value("appearance").toMap().value("mode").toString(), QString("light"));
        QCOMPARE(restored.state().value("appearance").toMap().value("textSize").toString(), QString("large"));
        QCOMPARE(current(restored).value("draft").toString(), QString("Unsent draft"));
        QCOMPARE(restored.state().value("locale").toString(), QString("ja"));
        const auto valid = restored.state();
        restored.command("appearance", {{"mode", "unsupported"}});
        QCOMPARE(restored.state(), valid);
    }
    void settingsLayoutAndSearch_data() {
        QTest::addColumn<QString>("locale");
        QTest::addColumn<bool>("compact");
        QTest::newRow("vi-wide") << "vi" << false;
        QTest::newRow("en-wide") << "en" << false;
        QTest::newRow("ja-wide") << "ja" << false;
        QTest::newRow("vi-640") << "vi" << true;
        QTest::newRow("en-640") << "en" << true;
        QTest::newRow("ja-640") << "ja" << true;
    }
    void settingsLayoutAndSearch() {
        QFETCH(QString, locale);
        QFETCH(bool, compact);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("locale", {{"value", locale}});
        bridge.command("appearance", {{"textSize", "large"}});
        bridge.command("draft", {{"value", "Preserve settings navigation draft"}});
        const auto before = bridge.state();
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = engine.rootObjects().first();
        if (compact) { root->setProperty("width", 640); root->setProperty("height", 600); }
        root->setProperty("settings", true);
        QCoreApplication::processEvents();
        auto *settings = root->findChild<QQuickItem *>("settings-workspace");
        QVERIFY(settings);
        QCOMPARE(settings->property("wide").toBool(), !compact);
        // Review 18 shows one category at a time; appearance controls belong here.
        settings->setProperty("activeSection", "appearance");
        QCoreApplication::processEvents();
        auto *content = qobject_cast<QQuickWindow *>(root)->contentItem();
        // Loader-created controls follow the visual tree; QObject ownership can
        // remain with the component context rather than the application root.
        auto *theme = visualItem(content, "settings-theme");
        auto *textSize = visualItem(content, "settings-text-size");
        QVERIFY(theme); QVERIFY(textSize);
        for (auto *control : {theme, textSize}) {
            const auto right = control->mapToScene(QPointF(control->width(), 0)).x();
            QVERIFY(control->width() > 0);
            QVERIFY(right <= root->property("width").toDouble());
        }
        settings->setProperty("query", locale == "vi" ? "co chu" : locale == "en" ? "text size" : "文字サイズ");
        QCoreApplication::processEvents();
        QCOMPARE(settings->property("activeSection").toString(), QString("appearance"));
        QCOMPARE(bridge.state(), before);
        settings->setProperty("query", "missing-setting");
        QCoreApplication::processEvents();
        QCOMPARE(settings->property("activeSection").toString(), QString());
        settings->setProperty("query", "");
        QCoreApplication::processEvents();
        QCOMPARE(bridge.state(), before);
        QCOMPARE(warnings.count(), 0);
    }
    void qmlLoadsWithRealBridge_data() {
        QTest::addColumn<QString>("feature");
        QTest::addColumn<bool>("library");
        QTest::addColumn<bool>("compact");
        QTest::newRow("chat") << "chat" << false << false;
        QTest::newRow("translation") << "translate" << false << false;
        QTest::newRow("chat-library") << "chat" << true << false;
        QTest::newRow("translation-library") << "translate" << true << false;
        QTest::newRow("chat-library-640") << "chat" << true << true;
        QTest::newRow("translation-library-640") << "translate" << true << true;
    }
    void qmlLoadsWithRealBridge() {
        QFETCH(QString, feature);
        QFETCH(bool, library);
        QFETCH(bool, compact);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("navigate", {{"feature", feature}});
        const auto previousID = current(bridge).value("id");
        bridge.command("draft", {{"value", "Original draft"}});
        bridge.command("new");
        bridge.command("draft", {{"value", "Active draft"}});
        const auto beforePreview = bridge.state();
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY2(!engine.rootObjects().isEmpty(), "QML must instantiate with the C++ state/resources");
        auto *root = engine.rootObjects().first();
        if (library) {
            if (compact) { root->setProperty("width", 640); root->setProperty("height", 600); }
            root->setProperty("previewID", previousID);
            root->setProperty("library", true);
            QCoreApplication::processEvents();
            auto *layout = root->findChild<QQuickItem *>("history-library");
            auto *open = root->findChild<QQuickItem *>("history-open");
            QVERIFY(layout); QVERIFY(open);
            QTRY_COMPARE(layout->property("columns").toInt(), compact ? 1 : 2);
            const auto bottomRight = open->mapToScene(QPointF(open->width(), open->height()));
            QVERIFY(open->width() > 0 && open->height() > 0);
            QVERIFY(bottomRight.x() <= root->property("width").toDouble());
            QVERIFY(bottomRight.y() <= root->property("height").toDouble());
            QCOMPARE(bridge.state(), beforePreview); // Viewing an older record must not select or save it.
            root->setProperty("historyQuery", "No matching record");
            QCoreApplication::processEvents();
            QCOMPARE(root->property("previewID").toString(), QString());
            QVERIFY(!open->isEnabled());
            QCOMPARE(bridge.state(), beforePreview);
        }
        QCoreApplication::processEvents();
        QCOMPARE(warnings.count(), 0);
    }
};
QTEST_MAIN(WorkbenchBridgeTests)
#include "WorkbenchBridgeTests.moc"

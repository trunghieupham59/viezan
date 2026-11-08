#include "../WorkbenchBridge.h"
#include "../WorkbenchDomain.h"
#include "../AttachmentImageProvider.h"
#include <QClipboard>
#include "../NativeAudio.h"
#include "../ProviderDiscovery.h"
#include <QUuid>
#include "../ImageGeneration.h"
#include "../CloudProtocol.h"
#include "../VoiceGate.h"
#include "../TextLanguage.h"
#include "../ThermalSensors.h"
#include "../LauncherTools.h"
#include "../NativeBackup.h"
#include "../LocalRuntime.h"
#include "../ModelLineup.h"
#include "../NativeUpdates.h"
#include "../Interpretation.h"
#include <QStandardPaths>
#include <QScopeGuard>
#include <QCryptographicHash>
#include <QFile>
#include <QInputMethodEvent>
#include <QHoverEvent>
#include <QJsonDocument>
#include <QJSValue>
#include <QDateTime>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQmlComponent>
#include <QQmlExpression>
#include <QSignalSpy>
#include <QQuickItem>
#include <QQuickWindow>
#include <QSGRendererInterface>
#include <QPointer>
#include <QTemporaryDir>
#include <QTest>
#include <QTimer>
#include <QtMath>

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
    void glassDisabledControlRim() {
        QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("appearance", {{"preset", "glass"}, {"mode", "light"}});
        QQmlEngine engine; QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        QQmlComponent component(&engine);
        component.setData(R"(
            import QtQuick
            import "qrc:/qml" as Viezan
            Viezan.Kit.ControlGlassSurface { width: 120; height: 36 }
        )", QUrl("qrc:/disabled-glass-test.qml"));
        QScopedPointer<QObject> owner(component.create()); QVERIFY2(owner, qPrintable(component.errorString()));
        auto *surface = qobject_cast<QQuickItem *>(owner.data()); QVERIFY(surface);
        auto *reflection = visualItem(surface, "glass-control-reflections");
        auto *rim = visualItem(surface, "glass-control-quiet-rim"); QVERIFY(reflection && rim);
        for (const auto &mode : {QString("light"), QString("dark")}) for (const bool disabled : {true, false}) {
            bridge.command("appearance", {{"preset", "glass"}, {"mode", mode}});
            surface->setProperty("inactive", disabled); QCoreApplication::processEvents();
            QCOMPARE(reflection->isVisible(), !disabled && mode == "light");
            QCOMPARE(rim->isVisible(), disabled || mode == "dark");
            QVERIFY(rim->property("color").value<QColor>().alpha() == 0);
        }
        QCOMPARE(warnings.count(), 0);
    }
    void acceleratedGlassSurfacesSurviveAppearanceChanges() {
        // Offscreen CI normally selects software. Exercise this explicitly on
        // a window-system RHI backend as well: software cannot catch the W0
        // Qt 6.8.3 imported-inline-component/Loader crash.
        QQuickWindow probe;
        probe.resize(64, 64);
        probe.show();
        QVERIFY(QTest::qWaitForWindowExposed(&probe));
        const auto api = probe.rendererInterface()->graphicsApi();
        probe.hide();
        if (api == QSGRendererInterface::Software || api == QSGRendererInterface::Unknown)
            QSKIP("Accelerated glass requires an initialized RHI backend; software is covered by the other UI tests.");
        QTest::failOnWarning("ShaderEffect: Texture t1 is not assigned a valid texture provider (QQuickItem*).");

        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("appearance", {{"preset", "glass"}, {"mode", "light"}});
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        QQmlComponent component(&engine);
        component.setData(R"(
            import QtQuick
            import "qrc:/qml" as Viezan
            Window {
                width: 400; height: 240
                Viezan.Kit.GlassPane {
                    objectName: "test-pane"
                    x: 24; y: 24; width: 180; height: 160
                    visible: workbench.state.appearance.preset === "glass"
                }
                Viezan.Kit.ControlGlassSurface {
                    objectName: "test-control"
                    x: 240; y: 64; width: 120; height: 40
                    visible: workbench.state.appearance.preset === "glass"
                }
            }
        )", QUrl("qrc:/accelerated-glass-test.qml"));
        QScopedPointer<QObject> owner(component.create());
        QVERIFY2(owner, qPrintable(component.errorString()));
        auto *window = qobject_cast<QQuickWindow *>(owner.data());
        QVERIFY(window);
        QSignalSpy frames(window, &QQuickWindow::frameSwapped);
        window->show();
        QVERIFY(QTest::qWaitForWindowExposed(window));
        QTRY_VERIFY(!frames.isEmpty());
        auto *pane = visualItem(window->contentItem(), "test-pane");
        auto *control = visualItem(window->contentItem(), "test-control");
        auto *paneShadow = visualItem(window->contentItem(), "glass-pane-shadow");
        auto *controlShadow = visualItem(window->contentItem(), "glass-control-shadow");
        QVERIFY(pane && control && paneShadow && controlShadow);
        QVERIFY(pane->property("accelerated").toBool());
        QVERIFY(control->property("accelerated").toBool());
        QVERIFY(paneShadow->property("blurEnabled").toBool());
        QVERIFY(controlShadow->property("shadowEnabled").toBool());
        for (const auto &preset : {QString("glass"), QString("graphite"), QString("glass")}) {
            for (const auto &mode : {QString("light"), QString("dark")}) {
                const auto before = frames.count();
                bridge.command("appearance", {{"preset", preset}, {"mode", mode}});
                window->update();
                QTRY_VERIFY(frames.count() > before);
                const bool glass = preset == "glass";
                QVERIFY(paneShadow->property("source").value<QObject *>() != nullptr);
                QVERIFY(controlShadow->property("source").value<QObject *>() != nullptr);
                QCOMPARE(paneShadow->isVisible(), glass);
                QCOMPARE(controlShadow->isVisible(), glass);
                QCOMPARE(paneShadow->size(), pane->size());
                QCOMPARE(controlShadow->size(), control->size());
                control->setProperty("inactive", true); window->update();
                QTRY_VERIFY(!visualItem(control, "glass-control-reflections")->isVisible());
                QCOMPARE(visualItem(control, "glass-control-quiet-rim")->isVisible(), glass);
                control->setProperty("inactive", false);
            }
        }
        window->close();

        // Also load the real shell with an isolated bridge and no provider
        // discovery, then switch the same appearance states through the bridge.
        bridge.command("route", {{"value", "home"}});
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        QSignalSpy shellFrames(root, &QQuickWindow::frameSwapped);
        QVERIFY(QTest::qWaitForWindowExposed(root));
        for (const auto &preset : {QString("glass"), QString("graphite"), QString("glass")}) {
            for (const auto &mode : {QString("light"), QString("dark")}) {
                const auto before = shellFrames.count();
                bridge.command("appearance", {{"preset", preset}, {"mode", mode}});
                root->update();
                QTRY_VERIFY(shellFrames.count() > before);
            }
        }
        root->close();
        QCOMPARE(warnings.count(), 0);
    }
    void platformShellGeometryAndShortcuts() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("locale", {{"value", "vi"}});
        bridge.command("appearance", {{"preset", "glass"}, {"mode", "light"}});
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        root->requestActivate();
        QTRY_VERIFY(root->isActive());
        auto *menu = root->findChild<QQuickItem *>("shell-menu-bar");
        auto *header = visualItem(root->contentItem(), "shell-header");
        auto *toggle = visualItem(root->contentItem(), "navigation-toggle");
        auto *breadcrumb = visualItem(root->contentItem(), "workspace-breadcrumb");
        auto *reading = visualItem(root->contentItem(), "reading-pane");
        auto *nav = visualItem(root->contentItem(), "primary-navigation");
        QVERIFY(menu && header && toggle && breadcrumb && reading && nav);
        const auto labels = bridge.resources().value("locales").toMap().value("vi").toMap();
        const auto metrics = bridge.resources().value("metrics").toMap();
#ifdef Q_OS_MACOS
        QCOMPARE(root->title(), QString("Viezan Native — ") + labels.value("home").toString());
#else
        QVERIFY(!menu->isVisible());
        QCOMPARE(menu->height(), 0.0);
        QCOMPARE(root->title(), labels.value("home").toString());
        for (const auto &mode : {QString("light"), QString("dark")}) {
            bridge.command("appearance", {{"mode", mode}});
            for (const auto size : {QSize(1280, 800), QSize(820, 640)}) {
                root->resize(size);
                for (const bool collapsed : {false, true}) {
                    bridge.command("navigation", {{"collapsed", collapsed}});
                    const bool expanded = size.width() >= metrics.value("compact").toInt() && !collapsed;
                    QTRY_COMPARE(nav->property("expanded").toBool(), expanded);
                    QTRY_COMPARE(header->mapToScene(QPointF()).x(), 0.0);
                    QTRY_COMPARE(header->mapToScene(QPointF()).y(), 0.0);
                    QTRY_COMPARE(header->width(), qreal(size.width()));
                    QVERIFY(toggle->isVisible());
                    QTRY_COMPARE(toggle->mapToScene(QPointF()).x(), metrics.value("inset").toDouble());
                    const auto expected = expanded ? reading->mapToScene(QPointF()).x() + metrics.value("inset").toDouble()
                        : toggle->mapToScene(QPointF(toggle->width(), 0)).x() + metrics.value("gap").toDouble();
                    QTRY_COMPARE(breadcrumb->mapToScene(QPointF()).x(), expected);
                    QVERIFY(!visualItem(nav, "navigation-collapse")->isVisible());
                }
            }
        }
#endif
        root->resize(1280, 800);
        bridge.command("navigation", {{"collapsed", false}});
        QTest::keyClick(root, Qt::Key_Backslash, Qt::ControlModifier);
        QTRY_VERIFY(root->property("navigationCollapsed").toBool());
        QTest::keyClick(root, Qt::Key_Backslash, Qt::ControlModifier);
        QTRY_VERIFY(!root->property("navigationCollapsed").toBool());
        for (int digit : {1, 2, 3, 0}) {
            QTest::keyClick(root, static_cast<Qt::Key>(Qt::Key_0 + digit), Qt::ControlModifier);
            const auto route = QStringList{"home", "chat", "translate", "dictionary"}.at(digit);
            QTRY_COMPARE(bridge.state().value("shell").toMap().value("lastRoute").toString(), route);
#ifndef Q_OS_MACOS
            QCOMPARE(root->title(), labels.value(route).toString());
#endif
        }
        auto *commands = root->findChild<QObject *>("command-palette");
        auto *history = root->findChild<QObject *>("quick-history");
        auto *activity = root->findChild<QObject *>("activity-panel");
        QVERIFY(commands && history && activity);
        QTest::keyClick(root, Qt::Key_K, Qt::ControlModifier);
        QTRY_VERIFY(commands->property("visible").toBool());
        QTest::keyClick(root, Qt::Key_Escape);
        QTRY_VERIFY(!commands->property("visible").toBool());
        // StandardKey is platform-dependent; send its actual key combination.
        const auto pressStandard = [root](QKeySequence::StandardKey key) {
            const QKeySequence sequence(key);
            for (int i = 0; i < sequence.count(); ++i)
                QTest::keyClick(root, sequence[i].key(), sequence[i].keyboardModifiers());
        };
        if (!QKeySequence(QKeySequence::Preferences).isEmpty()) {
            pressStandard(QKeySequence::Preferences);
        } else {
            // Qt's Windows platform theme has no Preferences binding. Keep
            // that existing StandardKey behavior; do not invent a shortcut.
            qInfo("StandardKey.Preferences has no platform binding; Settings remains available via commands.");
            QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "settings"), Q_ARG(QVariant, QVariant())));
        }
        QTRY_VERIFY(root->property("settings").toBool());
        QTest::keyClick(root, Qt::Key_H, Qt::ControlModifier | Qt::ShiftModifier);
        QVERIFY(!history->property("visible").toBool()); // Disabled in Settings.
        pressStandard(QKeySequence::New);
        QTRY_VERIFY(!root->property("settings").toBool() && !root->property("home").toBool());
        QCOMPARE(bridge.state().value("feature").toString(), QString("chat"));
        QTest::keyClick(root, Qt::Key_H, Qt::ControlModifier | Qt::ShiftModifier);
        QTRY_VERIFY(history->property("visible").toBool());
        QTest::keyClick(root, Qt::Key_Escape);
        QTRY_VERIFY(!history->property("visible").toBool());
        QTest::keyClick(root, Qt::Key_A, Qt::ControlModifier | Qt::ShiftModifier);
        QTRY_VERIFY(activity->property("visible").toBool());
        QTest::keyClick(root, Qt::Key_Escape);
        QTRY_VERIFY(!activity->property("visible").toBool());

        auto *editor = visualItem(root->contentItem(), "chat-draft");
        QVERIFY(editor);
        editor->forceActiveFocus();
        const auto beforeComposition = bridge.state();
        QInputMethodEvent preedit(QString::fromUtf8("にほん"), {});
        QCoreApplication::sendEvent(editor, &preedit);
        QVERIFY(editor->property("inputMethodComposing").toBool());
        QTest::keyClick(root, Qt::Key_K, Qt::ControlModifier);
        // Shortcuts must not commit a preedit or mutate work while opening UI.
        QCOMPARE(bridge.state(), beforeComposition);
        QInputMethodEvent cancel;
        QCoreApplication::sendEvent(editor, &cancel);
        QCOMPARE(warnings.count(), 0);
    }
    // Liquid Glass 2.0 backend (BACKEND-GAPS #2, #5, #9, #21, #24, #25, #29, #42).
    void glassBackendReducerRules() {
        using namespace WorkbenchDomain;
        auto session = [](const QVariantMap &state, const QString &id) { for (const auto &v : state.value("sessions").toList()) if (v.toMap().value("id") == id) return v.toMap(); return QVariantMap{}; };
        auto state = create("chat", "translate");
        // #21: an unchanged dictionary context neither bumps the revision nor clears the entry.
        state = command(state, "navigate", {{"feature", "dictionary"}, {"_updated", 10.0}}, "n1", "a1");
        const QString dict = "chat-dictionary";
        state = command(state, "draft", {{"sessionID", dict}, {"value", "serendipity"}}, "d1", "a1");
        state = command(state, "submit", {{"sessionID", dict}, {"_updated", 100.0}}, "t1", "a1");
        const auto json = QString(R"({"headword":"serendipity","pronunciation":"/x/","meaning":"chance","translations":[{"text":"tình cờ","pronunciation":"tình cờ"}],"related":{"synonyms":["luck"]}})");
        state = command(state, "receive", {{"taskID", "t1"}, {"attemptID", "a1"}, {"chunk", json}, {"terminal", "succeeded"}, {"_updated", 101.5}}, "r1", "a1");
        const auto task = state.value("tasks").toList().value(0).toMap();
        QCOMPARE(task.value("status").toString(), QString("succeeded")); // related words do not fail validation
        // #5: the attempt carries when it started and ended.
        QCOMPARE(task.value("started").toDouble(), 100.0);
        QCOMPARE(task.value("finished").toDouble(), 101.5);
        const auto revision = session(state, dict).value("revision").toLongLong();
        const auto unchanged = command(state, "dictionaryContext", {{"sessionID", dict}, {"value", ""}}, "c1", "a1");
        QCOMPARE(session(unchanged, dict).value("output").toString(), json);
        QCOMPARE(session(unchanged, dict).value("revision").toLongLong(), revision);
        const auto changed = command(state, "dictionaryContext", {{"sessionID", dict}, {"value", "science"}}, "c2", "a1");
        QCOMPARE(session(changed, dict).value("output").toString(), QString());

        // #24: the newest finished chat answer can be regenerated; an older one cannot.
        auto chat = command(create("c", "t"), "draft", {{"sessionID", "c"}, {"value", "Hi"}}, "x", "a");
        chat = command(chat, "submit", {{"sessionID", "c"}}, "q1", "a1");
        chat = command(chat, "receive", {{"taskID", "q1"}, {"attemptID", "a1"}, {"chunk", "Hello"}, {"terminal", "succeeded"}}, "x", "a");
        auto regenerated = command(chat, "retry", {{"taskID", "q1"}}, "x", "a2");
        QCOMPARE(regenerated.value("tasks").toList().value(0).toMap().value("status").toString(), QString("running"));
        chat = command(chat, "draft", {{"sessionID", "c"}, {"value", "Again"}}, "x", "a");
        chat = command(chat, "submit", {{"sessionID", "c"}}, "q2", "b1");
        chat = command(chat, "receive", {{"taskID", "q2"}, {"attemptID", "b1"}, {"chunk", "Sure"}, {"terminal", "succeeded"}}, "x", "a");
        QCOMPARE(command(chat, "retry", {{"taskID", "q1"}}, "x", "a3"), chat);

        // #42: the last enabled workspace page cannot be switched off.
        auto modules = create("c", "t");
        for (const auto &page : {"chat", "translate", "interpret", "dictionary", "thermal"}) modules = command(modules, "module", {{"id", page}, {"enabled", false}}, "x", "a");
        QCOMPARE(command(modules, "module", {{"id", "apps"}, {"enabled", false}}, "x", "a"), modules);
        QVERIFY(command(modules, "module", {{"id", "utilities"}, {"enabled", false}}, "x", "a") != modules);

        // #29: "new" sweeps earlier empty sessions of the feature instead of piling them up.
        auto fresh = create("c", "t");
        fresh = command(fresh, "new", {}, "n1", "a"); fresh = command(fresh, "new", {}, "n2", "a"); fresh = command(fresh, "new", {}, "n3", "a");
        int chats = 0; for (const auto &v : fresh.value("sessions").toList()) if (v.toMap().value("feature") == "chat") ++chats;
        QCOMPARE(chats, 1);

        // #9: the speaking rate is kept, validated, and survives a provider change without a rate.
        auto voice = command(create("c", "t"), "voice", {{"provider", "openai"}, {"voice", "alloy"}, {"rate", 1.25}}, "x", "a");
        QCOMPARE(voice.value("voice").toMap().value("rate").toDouble(), 1.25);
        QVERIFY(validate(voice));
        QCOMPARE(command(voice, "voice", {{"provider", "openai"}, {"voice", "alloy"}, {"rate", 3.0}}, "x", "a"), voice);
        QCOMPARE(command(voice, "voice", {{"provider", "edge"}, {"voice", ""}}, "x", "a").value("voice").toMap().value("rate").toDouble(), 1.25);
        auto legacy = create("c", "t"); legacy["voice"] = QVariantMap{{"provider", "system"}, {"voice", ""}};
        QVERIFY(validate(legacy)); // snapshots without a rate stay readable
        QVERIFY(NativeAudio::rateSupported("edge") && !NativeAudio::rateSupported("gemini") && !NativeAudio::rateSupported("elevenlabs"));
    }
    void glassBackendSmartReset() {
        using namespace WorkbenchDomain;
        auto state = create("c", "t");
        state = command(state, "navigate", {{"feature", "translate"}, {"_updated", 10.0}}, "x", "a");
        state = command(state, "draft", {{"sessionID", "t"}, {"value", "Hello"}}, "x", "a");
        state = command(state, "submit", {{"sessionID", "t"}}, "job", "a1");
        state = command(state, "receive", {{"taskID", "job"}, {"attemptID", "a1"}, {"chunk", "Xin chào"}, {"terminal", "succeeded"}}, "x", "a");
        state = command(state, "navigate", {{"feature", "chat"}, {"_updated", 1000.0}}, "x", "a");
        // Back within two hours: the finished turn stays.
        auto soon = command(state, "navigate", {{"feature", "translate"}, {"_updated", 2000.0}}, "fresh", "a");
        QCOMPARE(soon.value("active").toMap().value("translate").toString(), QString("t"));
        QVERIFY(!soon.contains("_resetNotice"));
        // Back after the break: a fresh turn opens and the old one is remembered.
        auto later = command(state, "navigate", {{"feature", "translate"}, {"_updated", 1000.0 + 7200}}, "fresh", "a");
        QVERIFY2(validate(later), "Smart reset must retain a unique session matching the new active ID; navigate must not overwrite the prepended session at its old index.");
        QCOMPARE(later.value("active").toMap().value("translate").toString(), QString("fresh"));
        QCOMPARE(later.value("_resetNotice").toMap().value("previousID").toString(), QString("t"));
        later.remove("_resetNotice");
        auto reopened = command(later, "reopenPrevious", {{"feature", "translate"}, {"previousID", "t"}}, "x", "a");
        QCOMPARE(reopened.value("active").toMap().value("translate").toString(), QString("t"));
        for (const auto &v : reopened.value("sessions").toList()) QVERIFY(v.toMap().value("id") != "fresh"); // the empty replacement leaves
        // The setting turns it off.
        auto off = command(state, "smartReset", {{"value", false}}, "x", "a");
        off = command(off, "navigate", {{"feature", "translate"}, {"_updated", 1000.0 + 7200}}, "fresh", "a");
        QCOMPARE(off.value("active").toMap().value("translate").toString(), QString("t"));
        QVERIFY(validate(off));
    }
    void smartResetPreservesSessionIdentity_data() {
        QTest::addColumn<QString>("feature");
        QTest::addColumn<int>("timeout");
        QTest::newRow("translate-two-hours") << QString("translate") << 7200;
        QTest::newRow("dictionary-thirty-minutes") << QString("dictionary") << 1800;
    }
    void smartResetPreservesSessionIdentity() {
        QFETCH(QString, feature); QFETCH(int, timeout);
        using namespace WorkbenchDomain;
        auto state = create("c", "t");
        auto sessions = state.value("sessions").toList();
        const auto previousID = state.value("active").toMap().value(feature).toString();
        for (auto &value : sessions) {
            auto item = value.toMap(); item["draft"] = "Retain draft " + item.value("id").toString();
            item["output"] = "Retain output " + item.value("id").toString(); item["updated"] = 50.0;
            if (item.value("id") == previousID) { item["model"] = "ollama:qwen3:8b"; item["source"] = "en"; item["target"] = "ja"; }
            value = item;
        }
        state["featureLeft"] = QVariantMap{{feature, 1000.0}};
        // Exercise the old active session at every list position, not just index zero.
        for (int position = 0; position < 3; ++position) {
            state["sessions"] = sessions; QVERIFY(validate(state));
            const auto soon = command(state, "navigate", {{"feature", feature}, {"_updated", 1000.0 + timeout - 1}}, "fresh", "a");
            QVERIFY(validate(soon)); QCOMPARE(soon.value("sessions"), state.value("sessions"));
            QCOMPARE(soon.value("active"), state.value("active")); QCOMPARE(soon.value("tasks"), state.value("tasks"));
            QVERIFY(!soon.contains("_resetNotice"));
            const auto reset = command(state, "navigate", {{"feature", feature}, {"_updated", 1000.0 + timeout}}, "fresh", "a");
            QVERIFY(validate(reset)); const auto after = reset.value("sessions").toList();
            QCOMPARE(after.size(), sessions.size() + 1); QCOMPARE(after.first().toMap().value("id").toString(), QString("fresh"));
            QCOMPARE(after.mid(1), sessions); // Every old record, including content and order, is intact.
            QSet<QString> ids; for (const auto &value : after) { const auto id = value.toMap().value("id").toString(); QVERIFY(!ids.contains(id)); ids.insert(id); }
            for (const auto &id : reset.value("active").toMap()) QVERIFY(ids.contains(id.toString()));
            QCOMPARE(reset.value("active").toMap().value(feature).toString(), QString("fresh"));
            const auto fresh = after.first().toMap();
            QCOMPARE(fresh.value("model").toString(), QString("ollama:qwen3:8b"));
            QCOMPARE(fresh.value("source").toString(), QString("en")); QCOMPARE(fresh.value("target").toString(), QString("ja"));
            QVERIFY(fresh.value("draft").toString().isEmpty()); QVERIFY(fresh.value("output").toString().isEmpty());
            const auto reopened = command(reset, "reopenPrevious", {{"feature", feature}, {"previousID", previousID}}, "unused", "a");
            QVERIFY(validate(reopened)); QCOMPARE(reopened.value("sessions").toList(), sessions);
            QCOMPARE(reopened.value("active"), state.value("active"));
            sessions.append(sessions.takeFirst());
        }
    }
    void featureLeftLaunchPersistence_data() {
        QTest::addColumn<QString>("feature");
        QTest::addColumn<QVariant>("leftAt");
        for (const auto &feature : {QString("translate"), QString("dictionary")}) {
            QTest::newRow(qPrintable(feature + "-fractional")) << feature << QVariant(1794072480.952);
            QTest::newRow(qPrintable(feature + "-large-integer")) << feature << QVariant::fromValue<qlonglong>(4294967296LL);
        }
    }
    void featureLeftLaunchPersistence() {
        QFETCH(QString, feature); QFETCH(QVariant, leftAt);
        QTemporaryDir dir; QVERIFY(dir.isValid()); const auto path = dir.filePath("state.json");
        auto state = WorkbenchDomain::create("c", "t"); state["feature"] = feature;
        const QVariantMap left{{"chat", 1794072258.488}, {"translate", leftAt}, {"dictionary", leftAt}};
        state["featureLeft"] = left; QVERIFY(WorkbenchDomain::validate(state));
        QFile file(path); QVERIFY(file.open(QIODevice::WriteOnly));
        const auto bytes = QJsonDocument::fromVariant(state).toJson(); QCOMPARE(file.write(bytes), bytes.size()); file.close();
        auto readState = [&]() { QFile saved(path); if (!saved.open(QIODevice::ReadOnly)) return QVariantMap{}; return QJsonDocument::fromJson(saved.readAll()).toVariant().toMap(); };
        WorkbenchBridge bridge(nullptr, path, false);
        // Assert before save() can clear the failed startup commit. On Windows
        // launch replaces this very file while reload's read handle used to be open.
        QVERIFY(!bridge.loadBlocked()); QVERIFY2(bridge.storageError().isEmpty(), qPrintable(bridge.storageError()));
        auto remaining = left; remaining.remove(feature);
        const auto persisted = readState(); QVERIFY(WorkbenchDomain::validate(persisted));
        QCOMPARE(persisted.value("featureLeft").toMap(), remaining);
        QCOMPARE(persisted.value("sessions"), state.value("sessions"));
        bridge.save(); QVERIFY(bridge.storageError().isEmpty());
        QCOMPARE(readState(), bridge.state());
        // Record a real clock() timestamp, then load -> launch -> save again.
        bridge.command("leave"); QVERIFY(bridge.storageError().isEmpty());
        QVERIFY(readState().value("featureLeft").toMap().contains(feature));
        bridge.reload(); QVERIFY(!bridge.loadBlocked()); QVERIFY(bridge.storageError().isEmpty());
        QVERIFY(!readState().value("featureLeft").toMap().contains(feature));
        bridge.save(); QVERIFY(bridge.storageError().isEmpty()); QCOMPARE(readState(), bridge.state());
        WorkbenchBridge reopened(nullptr, path, false);
        QVERIFY(!reopened.loadBlocked()); QVERIFY(reopened.storageError().isEmpty());
        reopened.save(); QVERIFY(reopened.storageError().isEmpty()); QCOMPARE(readState(), reopened.state());
    }
    void smartResetBridgePersistence_data() { smartResetPreservesSessionIdentity_data(); }
    void smartResetBridgePersistence() {
        QFETCH(QString, feature); QFETCH(int, timeout);
        for (const bool reset : {false, true}) {
            QTemporaryDir dir; const auto path = dir.filePath("state.json");
            auto state = WorkbenchDomain::create("c", "t"); auto sessions = state.value("sessions").toList();
            const auto previousID = state.value("active").toMap().value(feature).toString();
            for (auto &value : sessions) { auto item = value.toMap(); if (item.value("id") == previousID) { item["draft"] = "Saved input"; item["output"] = "Saved result"; } value = item; }
            state["sessions"] = sessions;
            state["featureLeft"] = QVariantMap{{feature, QDateTime::currentSecsSinceEpoch() - (reset ? timeout + 60 : timeout / 2)}};
            QFile file(path); QVERIFY(file.open(QIODevice::WriteOnly)); file.write(QJsonDocument::fromVariant(state).toJson()); file.close();
            WorkbenchBridge bridge(nullptr, path, false); QVERIFY(!bridge.loadBlocked());
            bridge.command("navigate", {{"feature", feature}}); QVERIFY(WorkbenchDomain::validate(bridge.state()));
            QVERIFY(bridge.storageError().isEmpty());
            const auto after = bridge.state().value("sessions").toList();
            QCOMPARE(after.size(), sessions.size() + (reset ? 1 : 0));
            QCOMPARE(reset ? after.mid(1) : after, sessions);
            const auto selected = current(bridge).value("id").toString();
            QCOMPARE(selected != previousID, reset);
            QCOMPARE(!bridge.resetNotice().isEmpty(), reset);
            bridge.save(); QVERIFY(bridge.storageError().isEmpty());
            QVERIFY(file.open(QIODevice::ReadOnly)); const auto persisted = QJsonDocument::fromJson(file.readAll()).toVariant().toMap(); file.close();
            QVERIFY(WorkbenchDomain::validate(persisted)); QVERIFY(!persisted.contains("_resetNotice"));
            QCOMPARE(persisted.value("sessions"), bridge.state().value("sessions"));
            WorkbenchBridge reloaded(nullptr, path, false); QVERIFY(!reloaded.loadBlocked());
            QVERIFY(WorkbenchDomain::validate(reloaded.state()));
            QCOMPARE(reloaded.state().value("sessions").toList(), after);
            QCOMPARE(reloaded.state().value("active"), bridge.state().value("active"));
            QVERIFY(reloaded.resetNotice().isEmpty()); // Notice is transient, not a saved command.
            if (reset) {
                const auto beforeDismiss = bridge.state(); bridge.dismissResetNotice();
                QVERIFY(bridge.resetNotice().isEmpty()); QCOMPARE(bridge.state(), beforeDismiss);
                bridge.reopenPrevious(); QCOMPARE(bridge.state(), beforeDismiss); // Dismissed notice cannot reopen later.
                // Restore the original fixture to exercise reopen with a live notice independently.
                QVERIFY(file.open(QIODevice::WriteOnly | QIODevice::Truncate)); file.write(QJsonDocument::fromVariant(state).toJson()); file.close();
                bridge.reload(); bridge.command("navigate", {{"feature", feature}});
                QVERIFY(!bridge.resetNotice().isEmpty()); bridge.reopenPrevious();
                QVERIFY(bridge.resetNotice().isEmpty()); QVERIFY(WorkbenchDomain::validate(bridge.state()));
                QCOMPARE(bridge.state().value("sessions").toList(), sessions);
                QCOMPARE(current(bridge).value("id").toString(), previousID);
                QCOMPARE(current(bridge).value("draft").toString(), QString("Saved input"));
                QCOMPARE(current(bridge).value("output").toString(), QString("Saved result"));
                bridge.save(); reloaded.reload(); QVERIFY(!reloaded.loadBlocked());
                QCOMPARE(reloaded.state().value("sessions"), bridge.state().value("sessions"));
                QCOMPARE(reloaded.state().value("active"), bridge.state().value("active"));
            }
        }
    }
    // Liquid Glass 2.0 backend, second pass (BACKEND-GAPS #4, #30, #31, #39, #40, #46, #52, #56, #57, #64, #6/#23).
    void glassBackendSecondPassReducer() {
        using namespace WorkbenchDomain;
        auto session = [](const QVariantMap &state, const QString &id) { for (const auto &v : state.value("sessions").toList()) if (v.toMap().value("id") == id) return v.toMap(); return QVariantMap{}; };
        // #31: an image-only turn takes the image's name; a dropped path its file name.
        const QVariantMap image{{"id", QUuid::createUuid().toString(QUuid::WithoutBraces)}, {"name", "beach.png"}, {"mime", "image/png"}, {"width", 1024}, {"height", 768}};
        auto state = command(create("c", "t"), "addImage", {{"sessionID", "c"}, {"image", image}}, "x", "a");
        state = command(state, "submit", {{"sessionID", "c"}, {"_updated", 10.0}}, "q1", "a1");
        QCOMPARE(session(state, "c").value("title").toString(), QString("beach.png"));
        QCOMPARE(derivedTitle("file:///Users/me/My%20Shot.png", {}), QString("My Shot.png"));
        QCOMPARE(derivedTitle("line one\nline two", {}), QString("line one line two"));
        state = command(state, "receive", {{"taskID", "q1"}, {"attemptID", "a1"}, {"chunk", "Sand"}, {"terminal", "succeeded"}}, "x", "a");
        // #57: an emptied name falls back to the first question's title.
        state = command(state, "rename", {{"sessionID", "c"}, {"value", "Holiday"}, {"_updated", 11.0}}, "x", "a");
        QCOMPARE(session(state, "c").value("title").toString(), QString("Holiday"));
        state = command(state, "rename", {{"sessionID", "c"}, {"value", "  "}, {"_updated", 12.0}}, "x", "a");
        QCOMPARE(session(state, "c").value("title").toString(), QString("beach.png"));
        // #30: every edit moves the session up, archiving and favourites included; a no-op does not.
        state = command(state, "model", {{"sessionID", "c"}, {"value", "openai:gpt-5"}, {"_updated", 20.0}}, "x", "a");
        QCOMPARE(session(state, "c").value("updated").toDouble(), 20.0);
        state = command(state, "model", {{"sessionID", "c"}, {"value", "openai:gpt-5"}, {"_updated", 21.0}}, "x", "a");
        QCOMPARE(session(state, "c").value("updated").toDouble(), 20.0);
        // #56: archiving records when; restoring drops it; a malformed value fails closed, an old state passes.
        auto archived = command(state, "archive", {{"sessionID", "c"}, {"value", true}, {"_updated", 30.0}}, "fresh", "a");
        QCOMPARE(session(archived, "c").value("archivedAt").toDouble(), 30.0);
        QCOMPARE(session(archived, "c").value("updated").toDouble(), 30.0);
        QVERIFY(validate(archived));
        QVERIFY(!session(command(archived, "archive", {{"sessionID", "c"}, {"value", false}, {"_updated", 31.0}}, "x", "a"), "c").contains("archivedAt"));
        auto broken = archived; auto sessions = broken.value("sessions").toList();
        for (auto &value : sessions) { auto item = value.toMap(); if (item.value("id") == "c") item["archivedAt"] = "yesterday"; value = item; }
        broken["sessions"] = sessions; QVERIFY(!validate(broken));
        QVERIFY(validate(create("c", "t")));
        // #40: the comparison layout is remembered and type-checked.
        auto layout = command(create("c", "t"), "compareBySentence", {{"value", true}}, "x", "a");
        QCOMPARE(layout.value("compareBySentence").toBool(), true);
        QCOMPARE(command(layout, "compareBySentence", {{"value", "yes"}}, "x", "a"), layout);
        layout["compareBySentence"] = "yes"; QVERIFY(!validate(layout));
        // #39: a dictionary context over 500 characters never reaches a provider.
        auto dictionary = command(create("c", "t"), "draft", {{"sessionID", "c-dictionary"}, {"value", "luck"}}, "x", "a");
        sessions = dictionary.value("sessions").toList();
        for (auto &value : sessions) { auto item = value.toMap(); if (item.value("id") == "c-dictionary") item["dictionaryContext"] = QString(501, 'x'); value = item; }
        dictionary["sessions"] = sessions;
        QCOMPARE(command(dictionary, "submit", {{"sessionID", "c-dictionary"}}, "d1", "a1").value("tasks").toList().size(), 0);
        // #4: "not found" replies are their own outcome, with at most 5 cleaned suggestions.
        auto lookup = command(create("c", "t"), "draft", {{"sessionID", "c-dictionary"}, {"value", "serendipituos"}}, "x", "a");
        lookup = command(lookup, "submit", {{"sessionID", "c-dictionary"}}, "d1", "a1");
        const QString reply = R"({"notFound":true,"suggestions":[{"word":"serendipitous","partOfSpeech":"tính từ","meaning":"tình cờ"},"serendipity",{"word":""}]})";
        lookup = command(lookup, "receive", {{"taskID", "d1"}, {"attemptID", "a1"}, {"chunk", reply}, {"terminal", "succeeded"}}, "x", "a");
        QCOMPARE(lookup.value("tasks").toList().value(0).toMap().value("errorCode").toString(), QString("dictionaryNotFound"));
        const auto suggestions = dictionarySuggestions(reply).toList();
        QCOMPARE(suggestions.size(), 2);
        QCOMPARE(suggestions.value(0).toMap().value("meaning").toString(), QString("tình cờ"));
        QVERIFY(!dictionarySuggestions(R"({"headword":"x"})").isValid());
        // #64: clear history refuses while a task runs, then keeps one empty session per feature.
        auto busy = command(create("c", "t"), "draft", {{"sessionID", "c"}, {"value", "Hi"}}, "x", "a");
        busy = command(busy, "model", {{"sessionID", "c"}, {"value", "openai:gpt-5"}}, "x", "a");
        busy = command(busy, "submit", {{"sessionID", "c"}}, "q1", "a1");
        QCOMPARE(clearableHistory(busy), 1);
        QCOMPARE(command(busy, "clearHistory", {}, "z", "a"), busy);
        busy = command(busy, "receive", {{"taskID", "q1"}, {"attemptID", "a1"}, {"chunk", "Hello"}, {"terminal", "succeeded"}}, "x", "a");
        const auto cleared = command(busy, "clearHistory", {}, "z", "a");
        QCOMPARE(cleared.value("sessions").toList().size(), 3);
        QVERIFY(cleared.value("tasks").toList().isEmpty());
        QCOMPARE(session(cleared, cleared.value("active").toMap().value("chat").toString()).value("model").toString(), QString("openai:gpt-5"));
        QVERIFY(validate(cleared)); QCOMPARE(clearableHistory(cleared), 0);
    }
    void glassBackendSecondPassServices() {
        // #52/#53: a backup whose images carry size and generator still matches its attachment records.
        const auto id = QUuid::createUuid().toString(QUuid::WithoutBraces);
        const QVariantMap image{{"id", id}, {"name", "a.png"}, {"mime", "image/png"}, {"width", 1024}, {"height", 1024}, {"generator", "openai:gpt-image-1"}};
        auto workspace = WorkbenchDomain::command(WorkbenchDomain::create("c", "t"), "addImage", {{"sessionID", "c"}, {"image", image}}, "x", "a");
        const auto snapshot = QJsonDocument::fromVariant(workspace).toJson(QJsonDocument::Compact); const QByteArray bytes("not-really-a-png");
        const auto sha = [](const QByteArray &data) { return QString::fromLatin1(QCryptographicHash::hash(data, QCryptographicHash::Sha256).toHex()); };
        auto record = image; record["data"] = QString::fromLatin1(bytes.toBase64()); record["sha256"] = sha(bytes);
        const auto backup = QJsonDocument::fromVariant(QVariantMap{{"format", "viezan-native-backup"}, {"version", 1}, {"workspace", QString::fromLatin1(snapshot.toBase64())}, {"sha256", sha(snapshot)}, {"attachments", QVariantList{record}}}).toJson();
        QVERIFY(NativeBackup::preview(backup).valid);
        // #56: the archive lists the most recently archived session first.
        QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        const auto first = current(bridge).value("id").toString(); bridge.command("draft", {{"sessionID", first}, {"value", "first"}});
        bridge.command("new"); const auto second = current(bridge).value("id").toString(); bridge.command("draft", {{"sessionID", second}, {"value", "second"}});
        bridge.command("archive", {{"sessionID", second}, {"value", true}}); QTest::qWait(5);
        bridge.command("archive", {{"sessionID", first}, {"value", true}});
        const auto archive = bridge.history({}, true);
        QCOMPARE(archive.size(), 2);
        QCOMPARE(archive.value(0).toMap().value("id").toString(), first);
        // #46: physical memory is known on every desktop platform.
        QVERIFY(LocalRuntime::memoryBytes() > 0);
        // #6/#23: an unknown one-off provider is refused; nothing starts.
        NativeAudio audio;
        audio.speak("Xin chào", "vi", "result", "bogus");
        QVERIFY(!audio.speaking()); QVERIFY(audio.speakingSource().isEmpty()); QVERIFY(!audio.preparing());
    }
    // Qt parity pass (BACKEND-GAPS #18, #26, #27, #28, #37, #43). ModelLineup cases are Swift's ModelLineupTests.
    void parityModelLineupMatchesSwift() {
        using namespace ModelLineup;
        QStringList claude; for (const auto &id : {"claude-fable-5", "claude-fable-5-1", "claude-haiku-4-5", "claude-haiku-5-5", "claude-opus-4-5", "claude-opus-4-6", "claude-opus-4-7", "claude-opus-4-8", "claude-opus-5", "claude-opus-5-5", "claude-sonnet-4-5", "claude-sonnet-4-6", "claude-sonnet-5", "claude-sonnet-5-5"}) claude << QString("claude:") + id;
        QCOMPARE(featured(claude), (QStringList{"claude:claude-fable-5-1", "claude:claude-opus-5-5", "claude:claude-sonnet-5-5", "claude:claude-haiku-5-5"}));
        QStringList openAI; for (const auto &id : {"babbage-002", "chat-latest", "chatgpt-image-latest", "computer-use-preview", "davinci-002", "gpt-3.5-turbo", "gpt-3.5-turbo-0125", "gpt-4.1", "gpt-4.1-mini", "gpt-5", "gpt-5-mini", "gpt-5.5", "gpt-5.5-mini", "gpt-5.5-nano", "o3", "o3-mini", "o4-mini", "text-embedding-3-small", "tts-1", "whisper-1"}) openAI << QString("openai:") + id;
        QCOMPARE(featured(openAI), (QStringList{"openai:gpt-5.5", "openai:gpt-5.5-mini", "openai:gpt-5.5-nano"}));
        QCOMPARE(featured({"openai:o3-pro", "openai:gpt-5.5", "openai:o3", "openai:gpt-5.5-mini"}), (QStringList{"openai:o3-pro", "openai:gpt-5.5", "openai:gpt-5.5-mini"}));
        QStringList gemini; for (const auto &id : {"gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-flash-preview", "gemini-3-pro", "gemini-2.5-flash-lite", "gemini-embedding-001", "gemini-2.5-flash-live-001"}) gemini << QString("gemini:") + id;
        QCOMPARE(featured(gemini), (QStringList{"gemini:gemini-3-pro", "gemini:gemini-3-flash-preview", "gemini:gemini-2.5-flash-lite"}));
        QCOMPARE(featured({"claude:claude-sonnet-5-5-20260301", "claude:claude-sonnet-5-5"}), QStringList{"claude:claude-sonnet-5-5"});
        QCOMPARE(featured({"ollama:qwen3:4b", "ollama:gemma3:4b"}), (QStringList{"ollama:gemma3:4b", "ollama:qwen3:4b"}));
        QCOMPARE(featured({"openai:zeta-1", "openai:alpha-2"}), (QStringList{"openai:alpha-2", "openai:zeta-1"}));
        QVERIFY(featured({}).isEmpty());
        // Short names.
        QCOMPARE(shortName("claude:claude-sonnet-5-5"), QString("Sonnet 5.5"));
        QCOMPARE(shortName("claude:claude-opus-5"), QString("Opus 5"));
        QCOMPARE(shortName("claude:claude-fable-5-1-20260301"), QString("Fable 5.1"));
        QCOMPARE(shortName("openai:gpt-5.5-mini"), QString("GPT-5.5 Mini"));
        QCOMPARE(shortName("openai:o4-mini"), QString("o4 Mini"));
        QCOMPARE(shortName("gemini:gemini-2.5-flash-lite"), QString("Gemini 2.5 Flash Lite"));
        QCOMPARE(shortName("ollama:qwen3:4b"), QString("qwen3:4b"));
        QCOMPARE(shortName("openai:some-new-thing-2026-05-01"), QString("some-new-thing"));
        QCOMPARE(shortName("openai:gpt-6-astra"), QString("GPT-6 Astra"));
        // Tiers.
        const QStringList claudeListing{"claude:claude-haiku-5-5", "claude:claude-sonnet-5-5", "claude:claude-opus-5-5", "claude:claude-fable-5-1"};
        QCOMPARE(tiers("claude:claude-sonnet-5-5", claudeListing), (QVariantMap{{"fast", "claude:claude-haiku-5-5"}, {"balanced", "claude:claude-sonnet-5-5"}, {"careful", "claude:claude-opus-5-5"}}));
        QCOMPARE(tiers("openai:gpt-5.5", {"openai:gpt-5.5", "openai:gpt-5.5-mini", "openai:gpt-5.5-nano", "openai:babbage-002"}), (QVariantMap{{"fast", "openai:gpt-5.5-nano"}, {"balanced", "openai:gpt-5.5"}, {"careful", "openai:gpt-5.5"}}));
        QCOMPARE(tiers("gemini:gemini-3-flash", {"gemini:gemini-3-pro", "gemini:gemini-3-flash"}), (QVariantMap{{"fast", "gemini:gemini-3-flash"}, {"balanced", "gemini:gemini-3-flash"}, {"careful", "gemini:gemini-3-pro"}}));
        QVERIFY(tiers("claude:claude-sonnet-5-5", {"claude:claude-sonnet-5-5", "claude:claude-sonnet-5"}).isEmpty());
        QVERIFY(tiers("ollama:qwen3:4b", {"ollama:qwen3:4b", "ollama:gemma3:4b"}).isEmpty());
        QStringList shown; for (const auto &id : {"gpt-6.1-sol", "gpt-6-astra", "gpt-5.5-pro", "gpt-5.5", "gpt-5.4-mini", "gpt-5.4-nano"}) shown << QString("openai:") + id;
        QCOMPARE(tiers("openai:gpt-6-astra", shown), (QVariantMap{{"fast", "openai:gpt-5.4-nano"}, {"balanced", "openai:gpt-6.1-sol"}, {"careful", "openai:gpt-6.1-sol"}}));
        QCOMPARE(tiers("openai:gpt-6.1-sol", shown + QStringList{"openai:gpt-6.1-mini"}).value("fast").toString(), QString("openai:gpt-6.1-mini"));
        // Search.
        QStringList listing; for (const auto &id : {"gpt-4o", "gpt-4o-2024-05-13", "gpt-4o-2024-08-06", "gpt-4o-mini", "gpt-4o-mini-tts", "gpt-4o-transcribe", "gpt-4o-mini-search-preview", "gpt-4.1-mini", "gpt-5", "whisper-1"}) listing << QString("openai:") + id;
        QCOMPARE(search(listing, ""), (QStringList{"openai:gpt-4.1-mini", "openai:gpt-4o", "openai:gpt-4o-mini", "openai:gpt-5"}));
        QCOMPARE(search(listing, "MINI"), (QStringList{"openai:gpt-4.1-mini", "openai:gpt-4o-mini"}));
        QCOMPARE(search({"openai:gpt-4o-2024-05-13", "openai:gpt-4o-2024-08-06"}, "4o"), QStringList{"openai:gpt-4o-2024-08-06"});
        // Sections and recent.
        const QMap<QString, QStringList> listings{{"openai", {"openai:gpt-5.5", "openai:gpt-5.5-mini", "openai:whisper-1"}}, {"claude", {"claude:claude-sonnet-5-5", "claude:claude-haiku-5-5"}}, {"ollama", {"ollama:qwen3:4b"}}};
        const QVariantMap tierMap{{"fast", "openai:gpt-5.5-mini"}, {"balanced", "openai:gpt-5.5"}, {"careful", "openai:gpt-5.5"}};
        const QStringList cloud{"openai", "claude", "gemini"}, local{"ollama", "lmstudio", "llamacpp"};
        const auto keys = [](const QVariantList &list) { QStringList out; for (const auto &v : list) out << v.toMap().value("key").toString(); return out; };
        const auto idle = sections("", tierMap, {"claude:claude-haiku-5-5", "openai:gpt-5.5"}, listings, cloud, local);
        QCOMPARE(keys(idle), (QStringList{"purpose", "recent", "openai", "claude", "gemini", "local"}));
        QCOMPARE(idle[1].toMap().value("rows").toList().size(), 1);
        QCOMPARE(idle[4].toMap().value("rows").toList().value(0).toMap().value("kind").toString(), QString("setup"));
        QCOMPARE(keys(sections("mini", tierMap, {}, listings, cloud, local)), QStringList{"openai"});
        QCOMPARE(keys(sections("openai:gpt-7", {}, {}, listings, cloud, local)).last(), QString("typed"));
        QVERIFY(sections("zzz", {}, {}, listings, cloud, local).isEmpty());
        QCOMPARE(recent({"ollama:d", "gemini:c", "ollama:d", "openai:whisper-1", "claude:a", "openai:b"}), (QStringList{"ollama:d", "gemini:c", "claude:a"}));
    }
    void parityReducerAndBridge() {
        using namespace WorkbenchDomain;
        // #18: Translate refuses a source over 5 000 characters, for a turn and for a comparison.
        auto state = command(create("c", "t"), "draft", {{"sessionID", "t"}, {"value", QString(5001, 'a')}}, "x", "a");
        QVERIFY(command(state, "submit", {{"sessionID", "t"}}, "q", "a").value("tasks").toList().isEmpty());
        QVERIFY(command(state, "compare", {{"sessionID", "t"}, {"models", QStringList{"openai:gpt-5", "claude:claude-sonnet-5"}}}, "x", "a").value("tasks").toList().isEmpty());
        state = command(state, "draft", {{"sessionID", "t"}, {"value", QString(5000, 'a')}}, "x", "a");
        QCOMPARE(command(state, "submit", {{"sessionID", "t"}}, "q", "a").value("tasks").toList().size(), 1);
        // #27: delete a session at once, never while it runs; Undo puts it back as the current one.
        auto chat = command(create("c", "t"), "draft", {{"sessionID", "c"}, {"value", "Hi"}}, "x", "a");
        chat = command(chat, "submit", {{"sessionID", "c"}}, "q1", "a1");
        QCOMPARE(command(chat, "removeSession", {{"sessionID", "c"}}, "fresh", "a"), chat);
        chat = command(chat, "receive", {{"taskID", "q1"}, {"attemptID", "a1"}, {"chunk", "Hello"}, {"terminal", "succeeded"}}, "x", "a");
        const auto removed = command(chat, "removeSession", {{"sessionID", "c"}}, "fresh", "a");
        QVERIFY(validate(removed)); QCOMPARE(removed.value("active").toMap().value("chat").toString(), QString("fresh"));
        QVERIFY(removed.value("tasks").toList().isEmpty());
        QVariantMap original; for (const auto &v : chat.value("sessions").toList()) if (v.toMap().value("id") == "c") original = v.toMap();
        const auto restored = command(removed, "restoreSession", {{"session", original}, {"index", 0}}, "x", "a");
        QCOMPARE(restored.value("active").toMap().value("chat").toString(), QString("c"));
        QCOMPARE(command(restored, "restoreSession", {{"session", original}, {"index", 0}}, "x", "a"), restored);
        // #43: update preferences are optional, typed, and the snooze lasts 24 hours.
        auto updates = command(create("c", "t"), "autoCheckUpdates", {{"value", false}}, "x", "a");
        QCOMPARE(updates.value("updates").toMap().value("autoCheck").toBool(), false);
        updates = command(updates, "snoozeUpdate", {{"version", "2.5.0"}, {"_updated", 1000.0}}, "x", "a");
        QCOMPARE(updates.value("updates").toMap().value("snoozedUntil").toDouble(), 87400.0);
        QVERIFY(validate(updates));
        auto broken = updates; broken["updates"] = QVariantMap{{"autoCheck", "yes"}}; QVERIFY(!validate(broken));
        // Bridge: remove returns what Undo needs; a fresh bridge checks updates in the background by default.
        QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        const auto id = current(bridge).value("id").toString(); bridge.command("draft", {{"sessionID", id}, {"value", "keep me"}});
        const auto undo = bridge.removeSession(id);
        QCOMPARE(undo.value("session").toMap().value("draft").toString(), QString("keep me"));
        QVERIFY(current(bridge).value("id").toString() != id);
        bridge.restoreSession(undo.value("session").toMap(), undo.value("index").toInt());
        QCOMPARE(current(bridge).value("id").toString(), id);
        QVERIFY(bridge.autoCheckUpdates()); bridge.setAutoCheckUpdates(false); QVERIFY(!bridge.autoCheckUpdates());
        QVERIFY(bridge.updatePrompt().isEmpty()); QVERIFY(!bridge.updateSnoozed("9.9.9"));
        QVERIFY(bridge.modelTiers(id).isEmpty()); // no provider listing in tests
        QCOMPARE(bridge.shortModelName("claude:claude-sonnet-5-5"), QString("Sonnet 5.5"));
        QVERIFY(bridge.rateSupported("edge")); QVERIFY(!bridge.rateSupported("gemini"));
    }
    void parityInterpretationRestoreAndCancelSummary() {
        QStandardPaths::setTestModeEnabled(true);
        QFile::remove(QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation) + "/interpretation.json");
        {
            Interpretation interpretation;
            const QVariantMap session{{"id", "meeting"}, {"created", 100.0}, {"model", "openai:gpt-5"}, {"provider", "openai"}, {"source", "en"}, {"target", "vi"}, {"locale", "vi"}, {"segments", QVariantList{}}, {"summary", ""}};
            interpretation.restoreSession(session);
            QCOMPARE(interpretation.sessions().size(), 1);
            interpretation.restoreSession(session); // already there: no duplicate
            QCOMPARE(interpretation.sessions().size(), 1);
            interpretation.deleteSession("meeting"); QVERIFY(interpretation.sessions().isEmpty());
            interpretation.restoreSession(session); QCOMPARE(interpretation.sessions().size(), 1);
            QVERIFY(!interpretation.summarizing()); interpretation.cancelSummary(); QVERIFY(!interpretation.summarizing());
        }
        QFile::remove(QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation) + "/interpretation.json");
        QStandardPaths::setTestModeEnabled(false);
    }
    // Remaining gaps (BACKEND-GAPS #8, #10, #12, #16, #32, #45, #47, #63, #66, #68).
    void windowsMicrophonePermissionAndCaptureModes() {
        const bool previous = QStandardPaths::isTestModeEnabled();
        QStandardPaths::setTestModeEnabled(true);
        const auto reset = qScopeGuard([previous] {
            NativeAudio::setMicrophonePermissionForTest({});
            QStandardPaths::setTestModeEnabled(previous);
        });
        NativeAudio audio;
        for (const auto &status : {"denied", "granted", "undetermined", "denied", "granted"}) {
            NativeAudio::setMicrophonePermissionForTest(status);
            QCOMPARE(audio.microphonePermission(), QString(status)); // every call reads again
        }
        NativeAudio::setMicrophonePermissionForTest("denied");
        audio.start("permission-fixture");
        QCOMPARE(audio.error(), QString("microphoneDenied"));
        QVERIFY(!audio.recording() && !audio.busy() && audio.owner().isEmpty());
        const auto folder = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation);
        QDir().mkpath(folder);
        const auto path = folder + "/interpretation.json";
        QFile::remove(path);
        for (const auto &mode : {"microphone", "mixed", "system"}) {
            QFile::remove(path);
            Interpretation live;
            // Fail persistence before capture, so even the system/granted branch never records.
            QVERIFY(QDir().mkdir(path));
            const auto removeBlock = qScopeGuard([path] { QDir().rmdir(path); });
            NativeAudio::setMicrophonePermissionForTest("denied");
            live.start("openai:gpt-5", "auto", "en", "vi", "vi", mode, "fixture-device");
            QVERIFY(!live.listening());
            QVERIFY(!live.busy());
            if (QString(mode) == "system") {
                QCOMPARE(live.error(), QString("interpretStorageError"));
                QCOMPARE(live.current().value("captureMode").toString(), QString("system"));
            } else {
                QCOMPARE(live.error(), QString("microphoneDenied"));
                QVERIFY(live.sessions().isEmpty());
                NativeAudio::setMicrophonePermissionForTest("granted");
                live.start("openai:gpt-5", "auto", "en", "vi", "vi", mode, "fixture-device");
                QCOMPARE(live.error(), QString("interpretStorageError"));
                QCOMPARE(live.current().value("captureMode").toString(), QString(mode));
                QCOMPARE(live.current().value("deviceID").toString(), QString("fixture-device"));
            }
        }
        QFile::remove(path);
    }
    void remainingGapsServices() {
        // #32: palette queries read sums, prefixes and questions, as Swift PaletteQuery.
        QCOMPARE(LauncherTools::paletteQuery("2+3*4"), (QVariantMap{{"kind", "calculation"}, {"value", "14"}}));
        QCOMPARE(LauncherTools::paletteQuery("? what is a mile"), (QVariantMap{{"kind", "ask"}, {"value", "what is a mile"}}));
        QCOMPARE(LauncherTools::paletteQuery("t xin chào"), (QVariantMap{{"kind", "translate"}, {"value", "xin chào"}}));
        QCOMPARE(LauncherTools::paletteQuery("D serendipity"), (QVariantMap{{"kind", "lookup"}, {"value", "serendipity"}}));
        QVERIFY(LauncherTools::paletteQuery("settings").isEmpty()); QVERIFY(LauncherTools::paletteQuery("t ").isEmpty());
        // #63: download estimates wait for a stable rate.
        QCOMPARE(NativeUpdates::remaining(10, 0.5), 10.0);
        QCOMPARE(NativeUpdates::remaining(0.5, 0.5), -1.0); QCOMPARE(NativeUpdates::remaining(10, 0.01), -1.0);
        NativeUpdates updates; QCOMPARE(updates.packageSize(), qint64(0)); QCOMPARE(updates.checkedAt(), 0.0); QCOMPARE(updates.remainingSeconds(), -1.0);
        // #10 / #16 / #8: no recording yet; a known permission word; system voices carry their language.
        NativeAudio audio;
        QCOMPARE(audio.recordingStarted(), 0.0);
        QVERIFY(QStringList({"granted", "denied", "undetermined"}).contains(audio.microphonePermission()));
        for (const auto &voice : audio.voiceList()) QVERIFY(!voice.toMap().value("language").toString().isEmpty());
        audio.configureVoice("edge", "", 1); QVERIFY(audio.voiceFor("en").isEmpty());
        // #45 / #47: launcher home and the shared local model suggestions.
        QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("module", {{"id", "interpret"}, {"enabled", false}});
        const auto home = bridge.launcherHome({});
        QStringList routes; for (const auto &page : home.value("pages").toList()) routes << page.toMap().value("route").toString();
        QCOMPARE(routes, (QStringList{"translate", "dictionary", "chat", "settings"}));
        QVERIFY(!home.contains("continue"));
        const auto chat = current(bridge).value("id").toString();
        bridge.command("draft", {{"sessionID", chat}, {"value", "Hi"}}); bridge.command("model", {{"sessionID", chat}, {"value", "openai:gpt-5"}}); bridge.command("submit", {{"sessionID", chat}});
        QCOMPARE(bridge.launcherHome(chat).value("continue").toMap().value("fresh").toBool(), true);
        QStringList suggested; for (const auto &item : bridge.resources().value("localModelSuggestions").toList()) suggested << item.toMap().value("id").toString();
        QCOMPARE(suggested, (QStringList{"qwen3:4b", "gemma3:4b", "llama3.2:3b", "qwen2.5:7b"}));
    }
    void remainingGapsInterpretation() {
        // #68 and #66 on Qt, against the test-mode store (never the app's own data).
        QStandardPaths::setTestModeEnabled(true);
        const auto folder = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation); QDir().mkpath(folder);
        const auto path = folder + "/interpretation.json";
        { QFile file(path); QVERIFY(file.open(QIODevice::WriteOnly)); file.write("not json"); }
        {
            Interpretation interpretation;
            QVERIFY(interpretation.blocked()); QCOMPARE(interpretation.error(), QString("interpretStorageError"));
            const QVariantList sessions{QVariantMap{{"id", "meeting"}, {"created", 100.0}, {"model", "openai:gpt-5"}, {"provider", "openai"}, {"source", "en"}, {"target", "vi"}, {"locale", "vi"}, {"summary", ""},
                                                    {"segments", QVariantList{QVariantMap{{"id", "s1"}, {"start", 0.0}, {"end", 2.0}, {"speaker", "A"}, {"original", "Hello"}, {"translated", "Xin chào"}, {"status", "done"}}}}}};
            { QFile file(path); QVERIFY(file.open(QIODevice::WriteOnly)); file.write(QJsonDocument::fromVariant(sessions).toJson()); }
            interpretation.reload();
            QVERIFY(!interpretation.blocked()); QVERIFY(interpretation.error().isEmpty()); QCOMPARE(interpretation.sessions().size(), 1);
            QVERIFY(interpretation.exportText(false, true).startsWith("[A] Xin chào"));
            QVERIFY(!interpretation.exportText(true, true).contains("Hello"));
            QVERIFY(interpretation.exportText(false).startsWith("[A] Hello\nXin chào"));
        }
        QFile::remove(path); QStandardPaths::setTestModeEnabled(false);
    }
    void glassBackendHistoryAndSpeechLanguage() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("route", {{"value", "chat"}});
        bridge.command("draft", {{"value", "Xin chào bạn"}});
        bridge.command("navigate", {{"feature", "translate"}});
        bridge.command("draft", {{"value", "Đường phố"}});
        bridge.command("navigate", {{"feature", "dictionary"}}); // empty dictionary session stays out of history
        QCOMPARE(bridge.history("", false, {}).size(), 2);
        QCOMPARE(bridge.history("", false, {"chat"}).size(), 1);
        QCOMPARE(bridge.history("duong", false, {}).size(), 1); // diacritics and đ fold
        QCOMPARE(bridge.history("", true, {}).size(), 0);
        QCOMPARE(bridge.speechLanguage("こんにちは"), QString("ja"));
        QCOMPARE(bridge.speechLanguage("Hello there", "en"), QString("en"));
        QCOMPARE(bridge.speechLanguage("Hello there", "auto"), QString("vi")); // falls back to the UI locale
    }
    void workspaceDropsRetiredBrowserSettingsDuringRecovery() {
        auto saved = WorkbenchDomain::create("chat-id", "translate-id");
        saved["bridge"] = QVariantMap{{"automatic", true}, {"origins", QStringList{"https://example.org"}}};
        saved["disabledModules"] = QStringList{"bridge", "thermal"};
        const auto recovered = WorkbenchDomain::recover(saved);
        QVERIFY(!recovered.contains("bridge"));
        QCOMPARE(recovered.value("disabledModules").toStringList(), QStringList{"thermal"});
        QCOMPARE(recovered.value("active"), saved.value("active"));
    }
    void voiceGlyphInstantiatesInsideLoader() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        QQmlEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        QQmlComponent component(&engine);
        component.setData(R"(
            import QtQuick
            import "qrc:/qml" as Viezan
            Item {
                width: 100; height: 40
                Loader {
                    objectName: "voice-loader"
                    sourceComponent: Viezan.Kit.VoiceGlyph { color: "black" }
                }
            }
        )", QUrl("qrc:/voice-glyph-test.qml"));
        QScopedPointer<QObject> owner(component.create());
        QVERIFY2(owner, qPrintable(component.errorString()));
        auto *loader = owner->findChild<QObject *>("voice-loader");
        QVERIFY(loader);
        auto *glyph = loader->property("item").value<QQuickItem *>();
        QVERIFY(glyph);
        QVERIFY(glyph->implicitWidth() > 0 && glyph->implicitHeight() > 0);
        QCoreApplication::processEvents();
        QCOMPARE(warnings.count(), 0);
    }
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
        // Native styles such as FluentWinUI3 keep the popup visible during its exit transition.
        QTRY_VERIFY(!root->findChild<QObject *>("quick-history")->property("visible").toBool());
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
        // Wait for the style's exit transition without weakening the state/IME checks.
        QTRY_VERIFY(!root->findChild<QObject *>("command-palette")->property("visible").toBool());
        QCOMPARE(bridge.state().value("sessions"), running.value("sessions"));
        QCOMPARE(bridge.state().value("tasks"), running.value("tasks"));
        QCOMPARE(bridge.state().value("active"), running.value("active"));
        // Settings is transient: both native clients restore Home on the next launch.
        QCOMPARE(bridge.state().value("shell").toMap().value("lastRoute").toString(), QString("home"));
    }
    void navigationSelectionSurvivesRepeatedActivation_data() {
        QTest::addColumn<QString>("locale");
        QTest::addColumn<int>("width");
        QTest::addColumn<QString>("preset");
        QTest::addColumn<QString>("mode");
        for (const auto &locale : {"vi", "en", "ja"})
            for (int width : {640, 820, 1200, 1440}) {
                QTest::newRow(qPrintable(QString("%1-%2-graphite").arg(locale).arg(width)))
                    << QString(locale) << width << QString("graphite") << QString("light");
                for (const auto &mode : {"light", "dark"})
                    QTest::newRow(qPrintable(QString("%1-%2-glass-%3").arg(locale).arg(width).arg(mode)))
                        << QString(locale) << width << QString("glass") << QString(mode);
            }
    }
    void navigationSelectionSurvivesRepeatedActivation() {
        QFETCH(QString, locale); QFETCH(int, width);
        QFETCH(QString, preset); QFETCH(QString, mode);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("locale", {{"value", locale}});
        bridge.command("appearance", {{"preset", preset}, {"mode", mode}});
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
        auto *window = qobject_cast<QQuickWindow *>(root);
        QVERIFY(window);
        window->requestActivate();
        QTRY_VERIFY(window->isActive());
        for (const auto key : {Qt::Key_0, Qt::Key_1, Qt::Key_2, Qt::Key_3, Qt::Key_N})
            QTest::keyClick(window, key, Qt::ControlModifier);
        QTest::keyClick(window, Qt::Key_H, Qt::ControlModifier | Qt::ShiftModifier);
        QCOMPARE(bridge.state(), before);
        QVERIFY(!root->findChild<QObject *>("quick-history")->property("visible").toBool());
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
        const auto metrics = bridge.resources().value("metrics").toMap();
        const auto rail = metrics.value("rail").toDouble();
        const auto sidebar = metrics.value("sidebar").toDouble();
        QVERIFY(rail > 0 && sidebar > rail);
        QTRY_VERIFY(qAbs(navigation->width() - (width < 900 ? rail : sidebar)) < 0.5);
        QCOMPARE(bridge.state(), before);
        bridge.command("navigation", {{"collapsed", true}});
        QTRY_COMPARE(navigation->width(), rail);
        root->setWidth(820); QCoreApplication::processEvents();
        root->setWidth(1200); QCoreApplication::processEvents();
        QTRY_COMPARE(navigation->width(), rail);
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
    void glassComposerKeepsEditorAndModelOwnership_data() {
        QTest::addColumn<QString>("mode");
        QTest::newRow("light") << QString("light");
        QTest::newRow("dark") << QString("dark");
    }
    void glassOverlayLayout_data() { glassComposerKeepsEditorAndModelOwnership_data(); }
    void glassOverlayLayout() {
        QFETCH(QString, mode);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("route", {{"value", "chat"}});
        bridge.command("appearance", {{"preset", "glass"}, {"mode", mode}});
        ProviderDiscovery::Snapshot snapshot; snapshot.checked = true;
        snapshot.models["ollama"] = {"ollama:llama3.2"}; bridge.applyProviderSnapshot(snapshot);
        bridge.command("model", {{"value", "ollama:llama3.2"}});
        QQmlApplicationEngine engine; QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge); engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(root);
        root->resize(1280, 800); QCoreApplication::processEvents();
        const auto strings = bridge.resources().value("locales").toMap().value(bridge.state().value("locale").toString()).toMap();
        auto *modelTrigger = visualItem(root->contentItem(), "chat-model-trigger"); QVERIFY(modelTrigger);
        QVERIFY(QMetaObject::invokeMethod(modelTrigger, "clicked"));
        auto *lineup = root->findChild<QObject *>("model-lineup-panel"); QVERIFY(lineup);
        QTRY_VERIFY(lineup->property("visible").toBool());
        const auto rows = lineup->property("rows").value<QJSValue>().toVariant().toList();
        for (const auto &provider : {QString("openai"), QString("claude"), QString("gemini")}) {
            QVariantMap setup;
            for (const auto &row : rows) if (row.toMap().value("kind") == "setup" && row.toMap().value("provider") == provider) setup = row.toMap();
            QVERIFY(!setup.isEmpty()); QVariant label;
            QVERIFY(QMetaObject::invokeMethod(lineup, "label", Q_RETURN_ARG(QVariant, label), Q_ARG(QVariant, setup)));
            const auto name = provider == "openai" ? "OpenAI" : provider == "claude" ? "Claude" : "Gemini";
            QCOMPARE(label.toString(), strings.value("setupProvider").toString().replace("{provider}", name));
        }
        auto *surface = lineup->property("background").value<QQuickItem *>(); QVERIFY(surface);
        QCOMPARE(surface->property("overlayColor").value<QColor>().alpha(), 255);
        QVERIFY(QMetaObject::invokeMethod(lineup, "close"));
        auto *opener = visualItem(root->contentItem(), "chat-tools-trigger"); QVERIFY(opener);
        auto *toolsPanel = root->findChild<QObject *>("chat-tools-panel"); QVERIFY(toolsPanel);
        for (const auto width : {640, 820, 1280}) {
            root->resize(width, 800); QCoreApplication::processEvents();
            QVERIFY(QMetaObject::invokeMethod(opener, "clicked")); QTRY_VERIFY(toolsPanel->property("visible").toBool());
            const auto top = toolsPanel->property("y").toDouble();
            const auto bottom = top + toolsPanel->property("height").toDouble();
            QVERIFY(top >= 0); QVERIFY(bottom <= opener->mapToScene(QPointF()).y()); QVERIFY(bottom <= root->height());
            auto *attach = visualItem(root->contentItem(), "chat-tools-attach"); QVERIFY(attach);
            QVERIFY(!attach->property("visualFocus").toBool());
            auto *scroll = visualItem(root->contentItem(), "chat-tools-scroll"); QVERIFY(scroll);
            auto *flick = scroll->property("contentItem").value<QQuickItem *>(); QVERIFY(flick);
            auto *stop = visualItem(root->contentItem(), "chat-tools-stop"); QVERIFY(stop);
            flick->setProperty("contentY", scroll->property("contentHeight").toDouble() - scroll->property("availableHeight").toDouble());
            QTRY_VERIFY(stop->mapToScene(QPointF(0, stop->height())).y() <= bottom);
            QVERIFY(stop->mapToScene(QPointF()).y() >= top);
            QVERIFY(stop->mapToScene(QPointF(stop->width(), 0)).x() <= root->width());
            auto *reasoning = visualItem(root->contentItem(), "chat-tools-reasoning"); QVERIFY(reasoning);
            reasoning->forceActiveFocus(Qt::TabFocusReason); QCoreApplication::processEvents();
            QVERIFY(reasoning->mapToScene(QPointF()).y() >= top);
            QTest::keyClick(root, Qt::Key_Space); QTRY_VERIFY(current(bridge).value("carefulReasoning").toBool());
            bridge.command("carefulReasoning", {{"value", false}});
            QVERIFY(QMetaObject::invokeMethod(toolsPanel, "close")); QTRY_VERIFY(!toolsPanel->property("visible").toBool());
        }
        root->resize(820, 800); QCoreApplication::processEvents();
        auto *nav = root->findChild<QObject *>("navigation-overlay"); QVERIFY(nav);
        QVERIFY(QMetaObject::invokeMethod(nav, "open")); QTRY_VERIFY(nav->property("visible").toBool());
        auto *navBackground = nav->property("background").value<QQuickItem *>(); QVERIFY(navBackground); QVERIFY(!navBackground->isVisible());
        QVERIFY(QMetaObject::invokeMethod(nav, "close"));
        root->resize(1280, 800); QCoreApplication::processEvents();
        auto *palette = root->findChild<QObject *>("command-palette"); QVERIFY(palette);
        QVERIFY(QMetaObject::invokeMethod(palette, "open")); QTRY_VERIFY(palette->property("visible").toBool());
        QCOMPARE(palette->property("width").toInt(), 560); QVERIFY(palette->property("y").toDouble() < 100);
        const auto commands = root->property("commandEntries").value<QJSValue>().toVariant().toList();
        QStringList expectedPages, expectedActions, actualPages, actualActions, actualOrder;
        const QStringList actionIDs{"new", "history", "activity", "navigation"};
        for (const auto &entry : bridge.resources().value("commands").toList()) {
            const auto id = entry.toMap().value("id").toString();
            (actionIDs.contains(id) ? expectedActions : expectedPages).append(id);
        }
        QVERIFY(expectedPages.size() >= 10); // Use the full real catalog, not a small sort fixture.
        for (const auto &entry : commands) {
            const auto row = entry.toMap(); const auto id = row.value("id").toString();
            (row.value("group") == "paletteGroupActions" ? actualActions : actualPages).append(id);
            actualOrder.append(id);
        }
        QCOMPARE(actualPages, expectedPages);
        QCOMPARE(actualActions, expectedActions);
        QCOMPARE(actualOrder, expectedPages + expectedActions);
        QVERIFY(QMetaObject::invokeMethod(palette, "close"));
        root->setProperty("library", true); QCoreApplication::processEvents();
        auto *emptyHistory = visualItem(root->contentItem(), "history-empty-message"); QVERIFY(emptyHistory);
        QTRY_COMPARE(emptyHistory->property("text").toString(), strings.value("historyEmpty").toString());
        auto *previewActions = visualItem(root->contentItem(), "history-preview-actions"); QVERIFY(previewActions);
        QVERIFY(!previewActions->isVisible());
        root->setProperty("archivedHistory", true);
        QTRY_COMPARE(emptyHistory->property("text").toString(), strings.value("historyArchivedEmpty").toString());
        root->setProperty("historyQuery", "no-match");
        QTRY_COMPARE(emptyHistory->property("text").toString(), strings.value("noHistory").toString());
        QVERIFY(visualText(root->contentItem(), strings.value("historyNoMatchesHint").toString())->isVisible());
        root->setProperty("historyQuery", ""); root->setProperty("archivedHistory", false); root->setProperty("library", false);
        auto *activity = root->findChild<QObject *>("activity-panel"); QVERIFY(activity);
        QVERIFY(QMetaObject::invokeMethod(activity, "open")); QTRY_VERIFY(activity->property("visible").toBool());
        const auto emptyHeight = activity->property("height").toDouble(); QVERIFY(emptyHeight < 140);
        bridge.command("draft", {{"value", "Synthetic activity"}}); bridge.command("submit");
        QTRY_VERIFY(activity->property("height").toDouble() > emptyHeight);
        auto *heading = visualItem(root->contentItem(), "activity-title"); QVERIFY(heading);
        QCOMPARE(heading->property("text").toString(), strings.value("activityCount").toString().replace("{count}", "1"));
        bridge.command("cancel", {{"taskID", latest(bridge).value("id")}});
        for (const auto &warning : warnings) for (const auto &error : qvariant_cast<QList<QQmlError>>(warning.at(0))) qWarning().noquote() << error.toString();
        QCOMPARE(warnings.count(), 0);
    }
    void glassOverlayScrollbarsAndPointerFocus_data() { glassComposerKeepsEditorAndModelOwnership_data(); }
    void glassOverlayScrollbarsAndPointerFocus() {
        QFETCH(QString, mode);
        QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("route", {{"value", "chat"}});
        bridge.command("appearance", {{"preset", "glass"}, {"mode", mode}});
        ProviderDiscovery::Snapshot snapshot; snapshot.checked = true; bridge.applyProviderSnapshot(snapshot);
        QQmlApplicationEngine engine; QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge); engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(root);
        root->resize(1280, 800); QCoreApplication::processEvents();
        auto *opener = visualItem(root->contentItem(), "chat-tools-trigger"); QVERIFY(opener);
        auto *tools = root->findChild<QObject *>("chat-tools-panel"); QVERIFY(tools);
        QSignalSpy toolsClosed(tools, SIGNAL(closed()));
        const auto center = [](QQuickItem *item) { return item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint(); };
        QTest::mouseMove(root, center(opener));
        QTest::mouseClick(root, Qt::LeftButton, Qt::NoModifier, center(opener));
        QTRY_VERIFY(tools->property("visible").toBool());
        // Popup grabs differ on offscreen. Reproduce the retained hover seen on
        // Windows with a native hover event, so the tooltip assertion is not vacuous.
        opener->setProperty("hoverEnabled", true);
        QHoverEvent retainedHover(QEvent::HoverEnter, center(opener), root->mapToGlobal(center(opener)), QPointF(-1, -1));
        QCoreApplication::sendEvent(opener, &retainedHover);
        QVERIFY(opener->property("hovered").toBool());
        QVERIFY(!opener->property("checked").toBool()); QVERIFY(!opener->property("checkable").toBool());
        QVERIFY(!opener->property("visualFocus").toBool());
        QQmlExpression tooltip(qmlContext(opener), opener, "ToolTip.visible");
        QVERIFY(!tooltip.evaluate().toBool()); QVERIFY2(!tooltip.hasError(), qPrintable(tooltip.error().toString()));
        QHoverEvent leaveHover(QEvent::HoverLeave, QPointF(-1, -1), root->mapToGlobal(QPoint(0, 0)), center(opener));
        QCoreApplication::sendEvent(opener, &leaveHover);
        auto *scroll = visualItem(root->contentItem(), "chat-tools-scroll"); QVERIFY(scroll);
        auto *bar = visualItem(root->contentItem(), "chat-tools-scrollbar"); QVERIFY(bar);
        auto *thumb = bar->property("contentItem").value<QQuickItem *>(); QVERIFY(thumb);
        auto *flick = scroll->property("contentItem").value<QQuickItem *>(); QVERIFY(flick);
        QTRY_VERIFY(scroll->property("contentHeight").toDouble() > scroll->height());
        QTest::mouseMove(root, QPoint(0, 0)); QTest::qWait(800); // Beyond the native 450 + 200 ms fade.
        QCOMPARE(bar->property("policy").toInt(), 2); // ScrollBar.AlwaysOn
        QVERIFY(bar->isVisible() && thumb->isVisible()); QVERIFY(thumb->opacity() > .7);
        QCOMPARE(bar->parentItem(), scroll);
        QVERIFY(qAbs(bar->height() - scroll->property("availableHeight").toDouble()) < 1);
        QVERIFY(qAbs(bar->x() + bar->width() - scroll->width()) < 1);
        QVERIFY(thumb->height() > bar->width()); // Not a zero-length bar/dot at the menu origin.
        QTest::mousePress(root, Qt::LeftButton, Qt::NoModifier, center(thumb));
        QTest::mouseMove(root, bar->mapToScene(QPointF(bar->width() / 2, bar->height() - 1)).toPoint(), 50);
        QTest::mouseRelease(root, Qt::LeftButton, Qt::NoModifier, bar->mapToScene(QPointF(bar->width() / 2, bar->height() - 1)).toPoint());
        QTRY_VERIFY(flick->property("contentY").toDouble() > 0);
        auto *stop = visualItem(root->contentItem(), "chat-tools-stop"); QVERIFY(stop);
        QTRY_VERIFY(stop->mapToScene(QPointF(0, stop->height())).y() <= scroll->mapToScene(QPointF(0, scroll->height())).y() + 1);
        QVERIFY(stop->mapToScene(QPointF()).y() >= scroll->mapToScene(QPointF()).y());
        QVERIFY(QMetaObject::invokeMethod(tools, "close")); QTRY_COMPARE(toolsClosed.count(), 1);
        QTRY_VERIFY(opener->hasActiveFocus());
        QTest::keyClick(root, Qt::Key_Tab);
        QTest::keyClick(root, Qt::Key_Backtab, Qt::ShiftModifier);
        QTRY_VERIFY(opener->hasActiveFocus());
        QTRY_VERIFY(opener->property("visualFocus").toBool());
        QTest::keyClick(root, Qt::Key_Space); QTRY_VERIFY(tools->property("visible").toBool());
        QVERIFY(tools->property("keyboardInvocation").toBool());
        auto *attach = visualItem(root->contentItem(), "chat-tools-attach"); QVERIFY(attach);
        QTRY_VERIFY(attach->property("visualFocus").toBool());
        QVERIFY(QMetaObject::invokeMethod(tools, "close")); QTRY_VERIFY(!tools->property("visible").toBool());
        auto *modelTrigger = visualItem(root->contentItem(), "chat-model-trigger"); QVERIFY(modelTrigger);
        QVERIFY(QMetaObject::invokeMethod(modelTrigger, "clicked"));
        auto *lineup = root->findChild<QObject *>("model-lineup-panel"); QVERIFY(lineup); QTRY_VERIFY(lineup->property("visible").toBool());
        auto *models = visualItem(root->contentItem(), "model-lineup-list"); QVERIFY(models);
        auto *modelBar = visualItem(root->contentItem(), "model-lineup-scrollbar"); QVERIFY(modelBar);
        const auto setupRows = lineup->property("rows").value<QJSValue>().toVariant().toList();
        bool hasLocalSetup = false;
        for (const auto &row : setupRows) hasLocalSetup |= row.toMap().value("kind") == "setup" && row.toMap().value("provider") == "local";
        QVERIFY(hasLocalSetup);
        QVERIFY(QMetaObject::invokeMethod(models, "positionViewAtEnd"));
        QQuickItem *localSetup = nullptr;
        QTRY_VERIFY(localSetup = visualItem(root->contentItem(), "model-lineup-row-" + QString::number(setupRows.size() - 1)));
        QVERIFY(QMetaObject::invokeMethod(models, "forceLayout"));
        QVERIFY(QMetaObject::invokeMethod(models, "positionViewAtEnd"));
        QCoreApplication::processEvents();
        QTRY_VERIFY(localSetup->mapToScene(QPointF(0, localSetup->height())).y() <= models->mapToScene(QPointF(0, models->height())).y() + 1);
        QVERIFY(localSetup->mapToScene(QPointF()).y() >= models->mapToScene(QPointF()).y());
        // Exercise overflow with real ModelLineup output and enough synthetic local models.
        for (int i = 0; i < 40; ++i) snapshot.models["ollama"].append("ollama:synthetic-" + QString::number(i));
        bridge.applyProviderSnapshot(snapshot);
        QTRY_VERIFY(models->property("contentHeight").toDouble() > models->height());
        QTest::mouseMove(root, QPoint(0, 0)); QTest::qWait(800);
        QCOMPARE(modelBar->property("policy").toInt(), 2); QVERIFY(modelBar->isVisible());
        auto *modelThumb = modelBar->property("contentItem").value<QQuickItem *>(); QVERIFY(modelThumb && modelThumb->isVisible());
        QVERIFY(modelThumb->opacity() > .7); QVERIFY(qAbs(modelBar->height() - models->height()) < 1);
        auto *modelSearch = visualItem(root->contentItem(), "model-lineup-search"); QVERIFY(modelSearch);
        modelSearch->setProperty("text", "unique-typed-model");
        QTRY_VERIFY(models->property("contentHeight").toDouble() <= models->height());
        QTRY_COMPARE(modelBar->property("policy").toInt(), 1); QVERIFY(!modelBar->isVisible());
        QVERIFY(QMetaObject::invokeMethod(lineup, "close")); QTRY_VERIFY(!lineup->property("visible").toBool());
        QTest::keyClick(root, Qt::Key_K, Qt::ControlModifier);
        auto *palette = root->findChild<QObject *>("command-palette"); QVERIFY(palette); QTRY_VERIFY(palette->property("visible").toBool());
        auto *commands = visualItem(root->contentItem(), "command-list"); QVERIFY(commands);
        auto *commandBar = visualItem(root->contentItem(), "command-scrollbar"); QVERIFY(commandBar);
        QTRY_VERIFY(commands->property("contentHeight").toDouble() > commands->height());
        QTest::mouseMove(root, QPoint(0, 0)); QTest::qWait(800);
        QCOMPARE(commandBar->property("policy").toInt(), 2); QVERIFY(commandBar->isVisible());
        auto *commandThumb = commandBar->property("contentItem").value<QQuickItem *>(); QVERIFY(commandThumb && commandThumb->isVisible());
        QVERIFY(commandThumb->opacity() > .7); QVERIFY(qAbs(commandBar->height() - commands->height()) < 1);
        root->setProperty("commandQuery", "no-such-command");
        QTRY_COMPARE(commandBar->property("policy").toInt(), 1); QVERIFY(!commandBar->isVisible());
        QVERIFY(QMetaObject::invokeMethod(palette, "close"));
        // A real active-chat fixture puts the composer at the bottom at the same
        // 1280x800 size. The full tools menu then fits and needs no scrollbar.
        bridge.command("model", {{"value", "ollama:synthetic-0"}});
        bridge.command("draft", {{"value", "Synthetic question"}}); bridge.command("submit");
        const auto task = latest(bridge);
        bridge.command("receive", {{"taskID", task.value("id")}, {"attemptID", task.value("attemptID")}, {"chunk", "Synthetic answer"}, {"terminal", "succeeded"}});
        QCoreApplication::processEvents();
        QVERIFY(QMetaObject::invokeMethod(opener, "clicked")); QTRY_VERIFY(tools->property("visible").toBool());
        QTRY_VERIFY(scroll->property("contentHeight").toDouble() <= scroll->height());
        QCOMPARE(bar->property("policy").toInt(), 1); QVERIFY(!bar->isVisible()); // AlwaysOff
        for (const auto &warning : warnings) for (const auto &error : qvariant_cast<QList<QQmlError>>(warning.at(0))) qWarning().noquote() << error.toString();
        QCOMPARE(warnings.count(), 0);
    }
    void glassComposerKeepsEditorAndModelOwnership() {
        QFETCH(QString, mode);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("route", {{"value", "chat"}});
        bridge.command("appearance", {{"preset", "glass"}, {"mode", mode}});
        ProviderDiscovery::Snapshot snapshot; snapshot.checked = true;
        snapshot.models["ollama"] = {"ollama:llama3.2", "ollama:qwen3:8b"};
        snapshot.models["claude"] = {"claude:claude-haiku-5-5", "claude:claude-sonnet-5-5", "claude:claude-opus-5-5"};
        bridge.applyProviderSnapshot(snapshot);
        bridge.command("model", {{"value", "ollama:llama3.2"}});
        QQmlApplicationEngine engine; QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(root);
        root->resize(1200, 820); QCoreApplication::processEvents();
        auto *composer = visualItem(root->contentItem(), "chat-composer");
        auto *scroll = visualItem(root->contentItem(), "chat-draft-scroll");
        auto *send = visualItem(root->contentItem(), "chat-send");
        auto *trigger = visualItem(root->contentItem(), "chat-model-trigger");
        auto *record = visualItem(root->contentItem(), "chat-record");
        QPointer<QQuickItem> editor = visualItem(root->contentItem(), "chat-draft");
        QVERIFY(composer && scroll && send && trigger && record && editor);
        QTRY_VERIFY(composer->property("singleRow").toBool()); QVERIFY(!send->isEnabled());
        const auto chatID = current(bridge).value("id");
        const QString draft = QString::fromUtf8("Hi 日本語");
        editor->setProperty("text", draft); editor->forceActiveFocus();
        QVERIFY(QMetaObject::invokeMethod(editor, "select", Q_ARG(int, 3), Q_ARG(int, 6)));
        const auto selected = editor->property("selectedText").toString();
        for (const auto width : {640, 820, 1200}) {
            root->setWidth(width); QCoreApplication::processEvents();
            QCOMPARE(editor.data(), visualItem(root->contentItem(), "chat-draft"));
            QCOMPARE(editor->property("text").toString(), draft);
            QCOMPARE(editor->property("selectedText").toString(), selected);
            QCOMPARE(current(bridge).value("id"), chatID); QVERIFY(editor->hasActiveFocus());
            QTRY_VERIFY(composer->property("singleRow").toBool());
            QVERIFY(trigger->width() >= 36);
            QVERIFY(trigger->mapToScene(QPointF(trigger->width(), 0)).x() <= record->mapToScene(QPointF()).x());
            QVERIFY(record->mapToScene(QPointF(record->width(), 0)).x() <= send->mapToScene(QPointF()).x());
        }
        const QString fiveLines = QString::fromUtf8("Một\nHai\n三\n四\nFive");
        editor->setProperty("text", fiveLines);
        QTRY_VERIFY(!composer->property("singleRow").toBool());
        QTRY_VERIFY(scroll->height() >= editor->height() - 1);
        const auto cap = scroll->height(); editor->setProperty("text", fiveLines + "\nSix");
        QTRY_VERIFY(editor->height() > scroll->height()); QCOMPARE(scroll->height(), cap);
        for (const auto &preset : {QString("graphite"), QString("glass"), QString("paper"), QString("glass")}) {
            bridge.command("appearance", {{"preset", preset}, {"mode", mode}}); QCoreApplication::processEvents();
            QCOMPARE(editor.data(), visualItem(root->contentItem(), "chat-draft"));
            QCOMPARE(editor->property("text").toString(), fiveLines + "\nSix");
        }
        auto *panel = root->findChild<QObject *>("model-lineup-panel"); QVERIFY(panel);
        QVERIFY(QMetaObject::invokeMethod(trigger, "clicked")); QTRY_VERIFY(panel->property("visible").toBool());
        auto *search = visualItem(root->contentItem(), "model-lineup-search"); QVERIFY(search);
        QTRY_VERIFY(search->hasActiveFocus());
        search->setProperty("text", "ollama:qwen3:8b"); QCoreApplication::processEvents();
        QInputMethodEvent preedit(QString::fromUtf8("にほん"), {}); QCoreApplication::sendEvent(search, &preedit);
        QTest::keyClick(root, Qt::Key_Return); QCOMPARE(current(bridge).value("model").toString(), QString("ollama:llama3.2"));
        QInputMethodEvent end; QCoreApplication::sendEvent(search, &end);
        QTest::keyClick(root, Qt::Key_Return);
        QTRY_COMPARE(current(bridge).value("model").toString(), QString("ollama:qwen3:8b"));
        QTRY_VERIFY(!panel->property("visible").toBool()); QTRY_VERIFY(trigger->hasActiveFocus());
        QCOMPARE(current(bridge).value("draft").toString(), fiveLines + "\nSix");
        // Tier rows are supplied by ModelLineup, and apply to the owning session.
        bridge.command("model", {{"value", "claude:claude-haiku-5-5"}});
        QVERIFY(QMetaObject::invokeMethod(trigger, "clicked")); QTRY_VERIFY(panel->property("visible").toBool());
        QQuickItem *careful = nullptr; QTRY_VERIFY(careful = visualItem(root->contentItem(), "model-lineup-row-2"));
        QVERIFY(QMetaObject::invokeMethod(careful, "clicked"));
        QTRY_COMPARE(current(bridge).value("model").toString(), QString("claude:claude-opus-5-5"));
        QVERIFY(current(bridge).value("carefulReasoning").toBool());
        QTRY_VERIFY(!panel->property("visible").toBool());
        QVERIFY(QMetaObject::invokeMethod(trigger, "clicked")); QTRY_VERIFY(panel->property("visible").toBool());
        bridge.command("new"); QTRY_VERIFY(!panel->property("visible").toBool());
        bridge.command("select", {{"sessionID", chatID}}); QCoreApplication::processEvents();
        QCOMPARE(editor->property("text").toString(), fiveLines + "\nSix");
        // Shell overlays and composer panels replace each other, without changing drafts.
        QVERIFY(QMetaObject::invokeMethod(trigger, "clicked")); QTRY_VERIFY(panel->property("visible").toBool());
        QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "history"), Q_ARG(QVariant, QVariant())));
        QTRY_VERIFY(!panel->property("visible").toBool());
        auto *history = root->findChild<QObject *>("quick-history"); QVERIFY(history);
        QTRY_VERIFY(history->property("visible").toBool()); QTest::keyClick(root, Qt::Key_Escape);
        QTRY_VERIFY(!history->property("visible").toBool());
        auto *tools = visualItem(root->contentItem(), "chat-tools-trigger"); QVERIFY(tools);
        QVERIFY(QMetaObject::invokeMethod(tools, "clicked"));
        auto *toolsPanel = root->findChild<QObject *>("chat-tools-panel"); QVERIFY(toolsPanel);
        QTRY_VERIFY(toolsPanel->property("visible").toBool());
        auto *instructions = visualItem(root->contentItem(), "chat-instructions-trigger"); QVERIFY(instructions);
        QVERIFY(QMetaObject::invokeMethod(instructions, "clicked"));
        auto *instructionsPanel = root->findChild<QObject *>("chat-instructions-panel"); QVERIFY(instructionsPanel);
        QTRY_VERIFY(instructionsPanel->property("visible").toBool()); QTRY_VERIFY(!toolsPanel->property("visible").toBool());
        auto *instructionEditor = visualItem(root->contentItem(), "chat-instructions-editor"); QVERIFY(instructionEditor);
        instructionEditor->setProperty("text", "Keep this instruction with this session.");
        QCOMPARE(current(bridge).value("systemPrompt").toString(), QString("Keep this instruction with this session."));
        bridge.command("new"); QTRY_VERIFY(!instructionsPanel->property("visible").toBool());
        QVERIFY(current(bridge).value("systemPrompt").toString().isEmpty());
        QVERIFY(bridge.state().value("tasks").toList().isEmpty());
        for (const auto &warning : warnings) for (const auto &error : qvariant_cast<QList<QQmlError>>(warning.at(0))) qWarning().noquote() << error.toString();
        QCOMPARE(warnings.count(), 0);
    }
    void glassHistoryActions_data() {
        QTest::addColumn<int>("width");
        QTest::addColumn<QString>("mode");
        for (const auto width : {640, 820, 1200, 1280}) for (const auto &mode : {QString("light"), QString("dark")})
            QTest::newRow(qPrintable(QString::number(width) + "-" + mode)) << width << mode;
    }
    void glassHistoryActions() {
        QFETCH(int, width); QFETCH(QString, mode);
        QTemporaryDir dir;
        auto state = WorkbenchDomain::create("today", "translation");
        auto sessions = state.value("sessions").toList();
        const auto now = QDateTime::currentDateTime();
        auto chat = sessions[0].toMap();
        chat["draft"] = QString::fromUtf8("Đường về nhà"); chat["title"] = "Custom title";
        chat["updated"] = double(now.toSecsSinceEpoch()); sessions[0] = chat;
        for (const auto &entry : QList<QPair<QString, int>>{{"yesterday", 1}, {"week", 3}, {"older", 10}}) {
            auto item = chat; item["id"] = entry.first; item["title"] = entry.first; item["draft"] = "Saved question";
            item["updated"] = double(now.addDays(-entry.second).toSecsSinceEpoch()); sessions.append(item);
        }
        auto translation = sessions[1].toMap(); translation["draft"] = "Hello"; translation["output"] = "Xin chào";
        translation["updated"] = double(now.addDays(-2).toSecsSinceEpoch()); sessions[1] = translation;
        auto archived = chat; archived["id"] = "archived"; archived["archived"] = true;
        archived["updated"] = double(now.addDays(-20).toSecsSinceEpoch()); archived["archivedAt"] = double(now.toSecsSinceEpoch()); sessions.append(archived);
        state["sessions"] = sessions; state["appearance"] = QVariantMap{{"preset", "glass"}, {"mode", mode}, {"textSize", "medium"}};
        state["shell"] = QVariantMap{{"lastRoute", "chat"}, {"navigationCollapsed", false}};
        QVERIFY(WorkbenchDomain::validate(state));
        QFile file(dir.filePath("state.json")); QVERIFY(file.open(QIODevice::WriteOnly)); file.write(QJsonDocument::fromVariant(state).toJson()); file.close();
        WorkbenchBridge bridge(nullptr, file.fileName(), false);
        QQmlApplicationEngine engine; QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge); engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty()); auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(root);
        root->resize(width, 800); root->setProperty("library", true); QCoreApplication::processEvents();
        const auto records = [&]() { return root->property("historyRecords").value<QJSValue>().toVariant().toList(); };
        const auto stored = [&](const QString &id) { for (const auto &item : bridge.state().value("sessions").toList()) if (item.toMap().value("id") == id) return item.toMap(); return QVariantMap{}; };
        QTRY_COMPARE(records().size(), 4);
        QCOMPARE(records()[0].toMap().value("bucket").toString(), QString("today"));
        QCOMPARE(records()[1].toMap().value("bucket").toString(), QString("yesterday"));
        QCOMPARE(records()[2].toMap().value("bucket").toString(), QString("week"));
        QCOMPARE(records()[3].toMap().value("bucket").toString(), QString("older"));
        const auto activeBefore = bridge.state().value("active");
        root->setProperty("historyFeature", ""); QTRY_COMPARE(records().size(), 5);
        root->setProperty("historyQuery", "duong"); QTRY_COMPARE(records().size(), 1);
        QCOMPARE(records()[0].toMap().value("id").toString(), QString("today"));
        QCOMPARE(bridge.state().value("active"), activeBefore);
        auto *open = visualItem(root->contentItem(), "history-open"); QVERIFY(open && open->isEnabled());
        QVERIFY(open->mapToScene(QPointF(open->width(), open->height())).x() <= root->width());
        QVERIFY(open->mapToScene(QPointF(open->width(), open->height())).y() <= root->height());
        root->setProperty("historyQuery", "no-such-session"); QTRY_COMPARE(records().size(), 0); QTRY_VERIFY(!open->isEnabled());
        auto *actions = visualItem(root->contentItem(), "history-preview-actions"); QVERIFY(actions);
        QTRY_VERIFY(!actions->isVisible()); QVERIFY(!open->isVisible());
        auto *emptyPreview = visualItem(root->contentItem(), "history-preview-empty"); QVERIFY(emptyPreview && emptyPreview->isVisible());
        root->setProperty("historyQuery", ""); root->setProperty("historyFeature", "chat"); root->setProperty("previewID", "today");
        auto *rename = visualItem(root->contentItem(), "history-rename"); QVERIFY(rename);
        QVERIFY(QMetaObject::invokeMethod(rename, "clicked")); auto *renameDialog = root->findChild<QObject *>("history-rename-dialog"); QVERIFY(renameDialog);
        QTRY_VERIFY(renameDialog->property("visible").toBool());
        auto *input = visualItem(root->contentItem(), "history-rename-input"); QVERIFY(input); input->setProperty("text", "");
        QVERIFY(QMetaObject::invokeMethod(renameDialog, "accept")); QTRY_COMPARE(stored("today").value("title").toString(), QString::fromUtf8("Đường về nhà"));
        auto *remove = visualItem(root->contentItem(), "history-delete"); QVERIFY(remove);
        const auto original = stored("today");
        QVERIFY(QMetaObject::invokeMethod(remove, "clicked")); QTRY_VERIFY(stored("today").isEmpty());
        auto *confirmation = root->findChild<QObject *>("history-delete-dialog"); QVERIFY(confirmation); QVERIFY(!confirmation->property("visible").toBool());
        QQuickItem *undo = nullptr; QTRY_VERIFY(undo = visualItem(root->contentItem(), "toast-undo"));
        QVERIFY(QMetaObject::invokeMethod(undo, "clicked")); QTRY_COMPARE(stored("today"), original);
        root->setProperty("toasts", QVariantList{}); root->setProperty("previewID", "today");
        auto *archive = visualItem(root->contentItem(), "history-archive"); QVERIFY(archive);
        QVERIFY(QMetaObject::invokeMethod(archive, "clicked")); QTRY_VERIFY(stored("today").value("archived").toBool()); QTRY_COMPARE(records().size(), 3);
        root->setProperty("archivedHistory", true); QTRY_COMPARE(records().size(), 2);
        QTRY_VERIFY(actions->isVisible());
        for (const auto &name : {"history-rename", "history-export", "history-archive", "history-delete", "history-open"}) {
            auto *button = visualItem(root->contentItem(), name); QVERIFY(button);
            QTRY_VERIFY(button->mapToScene(QPointF(button->width(), 0)).x() <= root->width());
            QCOMPARE(button->mapToScene(QPointF()).y(), open->mapToScene(QPointF()).y());
        }
        auto *filter = visualItem(root->contentItem(), "history-archive-filter"); QVERIFY(filter);
        auto *filterContent = filter->property("contentItem").value<QQuickItem *>(); QVERIFY(filterContent);
        auto *filterLabel = visualText(filterContent, filter->property("text").toString()); QVERIFY(filterLabel);
        const auto filterColor = filterLabel->property("color").value<QColor>();
        const auto theme = bridge.resources().value("themePalettes").toMap().value("glass:auto").toMap().value(mode).toMap();
        QCOMPARE(filterColor, QColor(theme.value("action").toString()));
        if (mode == "light") {
            const auto linear = [](double c) { return c <= 0.04045 ? c / 12.92 : qPow((c + 0.055) / 1.055, 2.4); };
            const auto luminance = .2126 * linear(filterColor.redF()) + .7152 * linear(filterColor.greenF()) + .0722 * linear(filterColor.blueF());
            QVERIFY(1.05 / (luminance + .05) >= 4.5);
        }
        QCOMPARE(records()[0].toMap().value("bucket").toString(), QString("today"));
        QTRY_VERIFY(!open->isEnabled());
        root->setProperty("previewID", "today"); QVERIFY(QMetaObject::invokeMethod(archive, "clicked")); QTRY_VERIFY(!stored("today").value("archived").toBool());
        root->setProperty("previewID", "archived"); QVERIFY(QMetaObject::invokeMethod(remove, "clicked")); QTRY_VERIFY(confirmation->property("visible").toBool());
        QTest::keyClick(root, Qt::Key_Escape); QTRY_VERIFY(!confirmation->property("visible").toBool()); QVERIFY(!stored("archived").isEmpty());
        QVERIFY(QMetaObject::invokeMethod(remove, "clicked")); QTRY_VERIFY(confirmation->property("visible").toBool());
        root->setProperty("toasts", QVariantList{}); QVERIFY(QMetaObject::invokeMethod(confirmation, "accept")); QTRY_VERIFY(stored("archived").isEmpty());
        QTRY_VERIFY(!visualItem(root->contentItem(), "toast-undo"));
        root->setProperty("archivedHistory", false); root->setProperty("historyFeature", "translate"); QTRY_COMPARE(records().size(), 1);
        QVERIFY(QMetaObject::invokeMethod(open, "clicked")); QTRY_VERIFY(!root->property("library").toBool());
        QCOMPARE(current(bridge).value("id").toString(), QString("translation"));
        for (const auto &warning : warnings) for (const auto &error : qvariant_cast<QList<QQmlError>>(warning.at(0))) qWarning().noquote() << error.toString();
        QCOMPARE(warnings.count(), 0);
    }
    void glassChatStates_data() { glassHistoryActions_data(); }
    void glassChatStates() {
        QFETCH(int, width); QFETCH(QString, mode);
        QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("route", {{"value", "chat"}}); bridge.command("appearance", {{"preset", "glass"}, {"mode", mode}});
        ProviderDiscovery::Snapshot snapshot; snapshot.checked = true; snapshot.models["ollama"] = {"ollama:llama3.2"}; bridge.applyProviderSnapshot(snapshot);
        bridge.command("model", {{"value", "ollama:llama3.2"}});
        QQmlApplicationEngine engine; QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge); engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty()); auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(root);
        root->resize(width, 800); QCoreApplication::processEvents();
        auto *notice = visualItem(root->contentItem(), "chat-provider-notice"); QVERIFY(notice);
        bridge.command("chatMode", {{"value", "image"}}); QTRY_COMPARE(notice->property("kind").toString(), QString("image"));
        bridge.command("chatMode", {{"value", "text"}});
        auto *editor = visualItem(root->contentItem(), "chat-draft"); QVERIFY(editor); editor->setProperty("text", "First question"); editor->forceActiveFocus();
        QInputMethodEvent preedit(QString::fromUtf8("にほん"), {}); QCoreApplication::sendEvent(editor, &preedit); QTest::keyClick(root, Qt::Key_Return, Qt::ControlModifier);
        QVERIFY(bridge.state().value("tasks").toList().isEmpty()); QInputMethodEvent end; QCoreApplication::sendEvent(editor, &end);
        QTest::keyClick(root, Qt::Key_Return, Qt::ControlModifier); QTRY_COMPARE(bridge.state().value("tasks").toList().size(), 1);
        const auto first = latest(bridge); const auto id = first.value("id").toString();
        QQuickItem *answering = nullptr; QTRY_VERIFY(answering = visualItem(root->contentItem(), "chat-answering-" + id)); QTRY_VERIFY(answering->isVisible());
        auto *send = visualItem(root->contentItem(), "chat-send"); QVERIFY(send); QVERIFY(send->isEnabled());
        bridge.command("receive", {{"taskID", id}, {"attemptID", first.value("attemptID")}, {"chunk", "Partial answer"}, {"terminal", "failed"}, {"errorCode", "providerError"}});
        QQuickItem *failure = nullptr; QTRY_VERIFY(failure = visualItem(root->contentItem(), "chat-failure-" + id)); QTRY_VERIFY(failure->isVisible());
        QQuickItem *retry = nullptr; QTRY_VERIFY(retry = visualItem(root->contentItem(), "chat-retry-" + id)); QTRY_VERIFY(retry->isVisible() && retry->isEnabled());
        bridge.command("model", {{"value", "ollama:new-model"}}); QVERIFY(QMetaObject::invokeMethod(retry, "clicked"));
        QTRY_COMPARE(latest(bridge).value("status").toString(), QString("running")); QVERIFY(latest(bridge).value("attemptID") != first.value("attemptID"));
        QCOMPARE(latest(bridge).value("request").toMap().value("model"), first.value("request").toMap().value("model"));
        const auto retried = latest(bridge);
        bridge.command("receive", {{"taskID", id}, {"attemptID", retried.value("attemptID")}, {"chunk", "Complete answer"}, {"terminal", "succeeded"}, {"usage", QVariantMap{{"input", 12}, {"output", 24}}}});
        QTRY_VERIFY(!failure->isVisible()); QTRY_VERIFY(!answering->isVisible()); QTRY_VERIFY(retry->isVisible());
        auto *meta = visualItem(root->contentItem(), "chat-meta-" + id); QVERIFY(meta); QTRY_VERIFY(meta->property("text").toString().contains("36"));
        const auto locale = bridge.resources().value("locales").toMap().value("vi").toMap();
        QVERIFY(meta->property("text").toString().contains(locale.value("durationSeconds").toString().section("{n}", 1)));
        auto *copy = visualItem(root->contentItem(), "chat-copy-" + id); QVERIFY(copy); QVERIFY(QMetaObject::invokeMethod(copy, "clicked"));
        QTRY_VERIFY(!root->property("toasts").value<QJSValue>().toVariant().toList().isEmpty());
        bridge.command("draft", {{"value", "Second question"}}); bridge.command("submit"); QTRY_VERIFY(!retry->isVisible());
        const auto second = latest(bridge); bridge.command("cancel", {{"taskID", second.value("id")}});
        QQuickItem *cancelled = nullptr; QTRY_VERIFY(cancelled = visualItem(root->contentItem(), "chat-failure-" + second.value("id").toString())); QTRY_VERIFY(cancelled->isVisible());
        for (const auto &warning : warnings) for (const auto &error : qvariant_cast<QList<QQmlError>>(warning.at(0))) qWarning().noquote() << error.toString();
        QCOMPARE(warnings.count(), 0);
    }
    void glassImageResearchAndReset_data() { glassHistoryActions_data(); }
    void glassImageResearchAndReset() {
        QFETCH(int, width); QFETCH(QString, mode);
        const bool previousTestMode = QStandardPaths::isTestModeEnabled();
        const auto restorePaths = qScopeGuard([previousTestMode] { QStandardPaths::setTestModeEnabled(previousTestMode); });
        QStandardPaths::setTestModeEnabled(true);
        QTemporaryDir dir;
        auto state = WorkbenchDomain::create("chat", "translate"); auto sessions = state.value("sessions").toList();
        for (int index : {1, 2}) { auto item = sessions[index].toMap(); item["draft"] = "Previous input"; item["output"] = "Previous result"; sessions[index] = item; }
        state["sessions"] = sessions; state["featureLeft"] = QVariantMap{{"translate", 1.0}, {"dictionary", 1.0}};
        state["appearance"] = QVariantMap{{"preset", "glass"}, {"mode", mode}, {"textSize", "medium"}};
        state["shell"] = QVariantMap{{"lastRoute", "chat"}, {"navigationCollapsed", false}};
        QFile file(dir.filePath("state.json")); QVERIFY(file.open(QIODevice::WriteOnly)); file.write(QJsonDocument::fromVariant(state).toJson()); file.close();
        WorkbenchBridge bridge(nullptr, file.fileName(), false); QVERIFY(!bridge.loadBlocked());
        ProviderDiscovery::Snapshot snapshot; snapshot.checked = true; snapshot.models["ollama"] = {"ollama:llama3.2"}; bridge.applyProviderSnapshot(snapshot);
        bridge.command("model", {{"value", "ollama:llama3.2"}});
        QQmlApplicationEngine engine; QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.addImageProvider("attachments", new AttachmentImageProvider);
        engine.rootContext()->setContextProperty("workbench", &bridge); engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty()); auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(root);
        root->resize(width, 800); QCoreApplication::processEvents();
        QImage sample(64, 48, QImage::Format_ARGB32); sample.fill(Qt::blue); QVERIFY(sample.save(dir.filePath("synthetic.png")));
        QCOMPARE(current(bridge).value("id").toString(), QString("chat"));
        bridge.attachImage(QUrl::fromLocalFile(dir.filePath("synthetic.png")), "chat");
        QTRY_VERIFY(!current(bridge).value("images").toList().isEmpty() || !bridge.storageError().isEmpty());
        QVERIFY2(bridge.storageError().isEmpty(), qPrintable(bridge.storageError() + " at " + QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation)));
        auto attachment = current(bridge).value("images").toList().value(0).toMap(); QVERIFY(!attachment.isEmpty());
        attachment["generator"] = "openai:gpt-image-1";
        bridge.command("draft", {{"value", "Synthetic image"}}); bridge.command("submit"); const auto imageTask = latest(bridge);
        bridge.command("receive", {{"taskID", imageTask.value("id")}, {"attemptID", imageTask.value("attemptID")}, {"images", QVariantList{attachment}}, {"terminal", "succeeded"}});
        QQuickItem *copyImage = nullptr; QTRY_VERIFY(copyImage = visualItem(root->contentItem(), "chat-copy-image-" + attachment.value("id").toString()));
        QVERIFY(QMetaObject::invokeMethod(copyImage, "clicked")); QVERIFY(!QGuiApplication::clipboard()->image().isNull());
        QCOMPARE(QGuiApplication::clipboard()->image().size(), QSize(64, 48));
        auto *transcript = visualItem(root->contentItem(), "chat-transcript"); QVERIFY(transcript); QVariant caption;
        QVERIFY(QMetaObject::invokeMethod(transcript, "imageCaption", Q_RETURN_ARG(QVariant, caption), Q_ARG(QVariant, QVariantList{attachment}), Q_ARG(QVariant, latest(bridge))));
        QVERIFY(caption.toString().contains("64×48")); QVERIFY(caption.toString().contains("GPT Image 1"));
        bridge.command("draft", {{"value", "Research question"}}); bridge.command("chatMode", {{"value", "research"}}); bridge.command("submit");
        const auto researchTask = latest(bridge);
        const QVariantMap research{{"phase", "survey"}, {"queries", QStringList{"Synthetic query"}}, {"cursor", 0}, {"findings", QStringList{"Synthetic evidence"}}, {"sources", QVariantList{QVariantMap{{"title", "Synthetic source"}, {"url", "https://example.org"}}}}, {"crossReference", "Synthetic cross-reference"}};
        bridge.command("receive", {{"taskID", researchTask.value("id")}, {"attemptID", researchTask.value("attemptID")}, {"research", research}});
        QQuickItem *researchToggle = nullptr; QTRY_VERIFY(researchToggle = visualItem(root->contentItem(), "chat-research-" + researchTask.value("id").toString()));
        QVERIFY(researchToggle->isVisible()); researchToggle->setProperty("checked", true); QVERIFY(QMetaObject::invokeMethod(researchToggle, "toggled"));
        QTRY_VERIFY(visualText(root->contentItem(), "Synthetic source"));
        bridge.command("cancel", {{"taskID", researchTask.value("id")}});
        // A comparison's two jobs occupy one Activity row and one running badge.
        bridge.command("navigate", {{"feature", "translate"}});
        QVERIFY2(WorkbenchDomain::validate(bridge.state()), "Backend smart reset returned an invalid active-session snapshot; do not work around this in QML.");
        bridge.reopenPrevious();
        bridge.command("compare", {{"sessionID", "translate"}, {"models", QStringList{"ollama:llama3.2", "ollama:qwen3:8b"}}});
        const auto activities = root->property("activityRows").value<QJSValue>().toVariant().toList();
        int comparisons = 0; for (const auto &row : activities) if (row.toMap().value("comparison").toBool()) { ++comparisons; QCOMPARE(row.toMap().value("tasks").toList().size(), 2); }
        QCOMPARE(comparisons, 1); QCOMPARE(root->property("runningCount").toInt(), 1);
        // Dictionary's old result triggers the independent reset notice on navigation.
        QVERIFY(QMetaObject::invokeMethod(root, "selectRoute", Q_ARG(QVariant, "dictionary")));
        QTRY_COMPARE(bridge.resetNotice().value("feature").toString(), QString("dictionary"));
        QQuickItem *reopen = nullptr; QTRY_VERIFY(reopen = visualItem(root->contentItem(), "reset-reopen")); QTRY_VERIFY(reopen->isVisible());
        QVERIFY(QMetaObject::invokeMethod(reopen, "clicked")); QTRY_VERIFY(bridge.resetNotice().isEmpty());
        QCOMPARE(current(bridge).value("id").toString(), QString("chat-dictionary")); QCOMPARE(current(bridge).value("output").toString(), QString("Previous result"));
        for (const auto &warning : warnings) for (const auto &error : qvariant_cast<QList<QQmlError>>(warning.at(0))) qWarning().noquote() << error.toString();
        QCOMPARE(warnings.count(), 0);
    }
    void glassDialogPreservesStandardActions_data() {
        QTest::addColumn<QString>("initialPreset");
        QTest::addColumn<QString>("mode");
        for (const auto &preset : {QString("graphite"), QString("glass")})
            for (const auto &mode : {QString("light"), QString("dark")})
                QTest::newRow(qPrintable(preset + "-" + mode)) << preset << mode;
    }
    void glassDialogPreservesStandardActions() {
        QFETCH(QString, initialPreset);
        QFETCH(QString, mode);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("appearance", {{"preset", initialPreset}, {"mode", mode}});
        QQmlEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        QQmlComponent component(&engine);
        component.setData(R"(
            import QtQuick
            import QtQuick.Controls
            import "qrc:/qml" as Viezan
            ApplicationWindow {
                width: 500; height: 300; visible: true
                Viezan.GlassDialog {
                    objectName: "standard-dialog"
                    title: "Synthetic dialog"
                    modal: true; focus: true
                    standardButtons: Dialog.Ok | Dialog.Cancel
                    Label { text: "Synthetic content" }
                    function acceptButton() { return footer.standardButton(Dialog.Ok) }
                    function cancelButton() { return footer.standardButton(Dialog.Cancel) }
                }
            }
        )", QUrl("qrc:/glass-dialog-test.qml"));
        QScopedPointer<QObject> owner(component.create());
        QVERIFY2(owner, qPrintable(component.errorString()));
        auto *root = qobject_cast<QQuickWindow *>(owner.data());
        QVERIFY(root);
        auto *dialog = owner->findChild<QObject *>("standard-dialog");
        QVERIFY(dialog);
        QSignalSpy accepted(dialog, SIGNAL(accepted()));
        QSignalSpy rejected(dialog, SIGNAL(rejected()));
        auto *footer = dialog->property("footer").value<QObject *>();
        QVERIFY(footer);
        auto *nativeBackground = dialog->property("background").value<QQuickItem *>();
        auto *nativeHeader = dialog->property("header").value<QQuickItem *>();
        QVERIFY(nativeBackground); QVERIFY(nativeHeader);
        const auto nativePadding = dialog->property("padding").toDouble();
        int nativeReturnActivation = -1;
        for (const auto &preset : {QString("graphite"), QString("glass"), QString("graphite")}) {
            bridge.command("appearance", {{"preset", preset}, {"mode", mode}});
            QCoreApplication::processEvents();
            QCOMPARE(dialog->property("footer").value<QObject *>(), footer);
            QVERIFY(QMetaObject::invokeMethod(dialog, "open"));
            QTRY_VERIFY(dialog->property("visible").toBool());
            QCOMPARE(dialog->property("background").value<QQuickItem *>(), nativeBackground);
            QCOMPARE(dialog->property("header").value<QQuickItem *>(), nativeHeader);
            QCOMPARE(nativeBackground->isVisible(), preset != "glass");
            if (preset == "graphite") QCOMPARE(dialog->property("padding").toDouble(), nativePadding);
            QVariant result;
            QVERIFY(QMetaObject::invokeMethod(dialog, "acceptButton", Q_RETURN_ARG(QVariant, result)));
            auto *button = qobject_cast<QQuickItem *>(result.value<QObject *>());
            QVERIFY(button);
            QVERIFY(button->metaObject()->indexOfProperty("usesGlass") >= 0);
            QCOMPARE(button->property("usesGlass").toBool(), preset == "glass");
            const auto before = accepted.count();
            button->forceActiveFocus();
            QCoreApplication::processEvents();
            QVERIFY(button->hasActiveFocus());
            QTest::keyClick(root, Qt::Key_Return);
            QCoreApplication::processEvents();
            const auto returnActivation = accepted.count() - before;
            if (nativeReturnActivation < 0) nativeReturnActivation = returnActivation;
            else QCOMPARE(returnActivation, nativeReturnActivation);
            if (!returnActivation) QTest::keyClick(root, Qt::Key_Space);
            QTRY_COMPARE(accepted.count(), before + 1);
            QTRY_VERIFY(!dialog->property("visible").toBool());
        }
        bridge.command("appearance", {{"preset", "glass"}, {"mode", mode}});
        QCoreApplication::processEvents();
        QVERIFY(QMetaObject::invokeMethod(dialog, "open"));
        QTRY_VERIFY(dialog->property("visible").toBool());
        QVariant result;
        QVERIFY(QMetaObject::invokeMethod(dialog, "cancelButton", Q_RETURN_ARG(QVariant, result)));
        auto *cancel = qobject_cast<QQuickItem *>(result.value<QObject *>());
        QVERIFY(cancel);
        cancel->forceActiveFocus();
        QCoreApplication::processEvents();
        QVERIFY(cancel->hasActiveFocus());
        QTest::keyClick(root, Qt::Key_Space);
        QTRY_COMPARE(rejected.count(), 1);
        QVERIFY(bridge.state().value("tasks").toList().isEmpty());
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
    void glassSearchAndFiltersPreserveNativeInteraction_data() {
        QTest::addColumn<QString>("mode");
        QTest::addColumn<QString>("locale");
        QTest::addColumn<int>("width");
        QTest::newRow("light-vi-640") << QString("light") << QString("vi") << 640;
        QTest::newRow("dark-ja-1200") << QString("dark") << QString("ja") << 1200;
    }
    void glassSearchAndFiltersPreserveNativeInteraction() {
        QFETCH(QString, mode); QFETCH(QString, locale); QFETCH(int, width);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("appearance", {{"preset", "glass"}, {"mode", mode}, {"textSize", "large"}});
        bridge.command("locale", {{"value", locale}});
        bridge.command("draft", {{"value", "Preserve draft 日本語"}});
        const auto sessions = bridge.state().value("sessions");
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        root->resize(width, 820);
        QCoreApplication::processEvents();
        auto *home = visualItem(root->contentItem(), "home-workspace");
        auto *filters = visualItem(root->contentItem(), "home-recent-filters");
        QVERIFY(home); QVERIFY(filters);
        QCOMPARE(filters->property("count").toInt(), 4);
        QCOMPARE(filters->property("currentIndex").toInt(), 0);
        auto *selected = filters->property("currentItem").value<QQuickItem *>();
        QVERIFY(selected);
        selected->forceActiveFocus();
        QTest::keyClick(root, Qt::Key_Right);
        QTRY_COMPARE(filters->property("currentIndex").toInt(), 1);
        QTRY_COMPARE(home->property("filter").toString(), QString("chat"));
        selected = filters->property("currentItem").value<QQuickItem *>();
        QVERIFY(selected);
        // Force the title + filters beyond the row budget independently of OS fonts.
        // Reflow must preserve the same native tabs, selection and keyboard focus.
        auto *recentTitle = visualItem(root->contentItem(), "home-recent-title");
        QVERIFY(recentTitle);
        const auto titleWidth = recentTitle->implicitWidth();
        recentTitle->setImplicitWidth(filters->parentItem()->width());
        QTRY_VERIFY(filters->mapToScene(QPointF()).y() >= recentTitle->mapToScene(QPointF(0, recentTitle->height())).y());
        QCOMPARE(filters->property("currentItem").value<QQuickItem *>(), selected);
        QVERIFY(selected->hasActiveFocus());
        QTRY_VERIFY(filters->mapToScene(QPointF(filters->width(), 0)).x() <= width);
        recentTitle->setImplicitWidth(titleWidth);
        QCoreApplication::processEvents();
        QVERIFY(filters->mapToScene(QPointF()).x() >= 0);
        // Restoring the title invalidates the layout again; a frame may still
        // be queued after processEvents, especially in a full Fluent suite.
        QTRY_VERIFY(filters->mapToScene(QPointF(filters->width(), 0)).x() <= width);
        const auto labels = bridge.resources().value("locales").toMap().value(locale).toMap();
        auto *all = visualText(filters, labels.value("filterAll").toString());
        QVERIFY(all);
        QTest::mouseClick(root, Qt::LeftButton, Qt::NoModifier, all->mapToScene(QPointF(all->width() / 2, all->height() / 2)).toPoint());
        QTRY_COMPARE(home->property("filter").toString(), QString());
        QTRY_COMPARE(filters->property("currentIndex").toInt(), 0);
        QCOMPARE(bridge.state().value("sessions"), sessions);
        QVERIFY(QMetaObject::invokeMethod(root, "openSettingsSection", Q_ARG(QVariant, "appearance")));
        QCoreApplication::processEvents();
        auto *theme = visualItem(root->contentItem(), "settings-theme");
        auto *search = visualItem(root->contentItem(), "settings-header-search");
        QVERIFY(theme); QVERIFY(search);
        QCOMPARE(theme->property("count").toInt(), 3);
        selected = theme->property("currentItem").value<QQuickItem *>();
        QVERIFY(selected);
        selected->forceActiveFocus();
        QTest::keyClick(root, Qt::Key_Right);
        QTRY_COMPARE(bridge.state().value("appearance").toMap().value("mode").toString(), mode == "light" ? QString("dark") : QString("system"));
        bridge.command("appearance", {{"mode", mode}});
        QTRY_COMPARE(theme->property("currentIndex").toInt(), mode == "light" ? 0 : 1);
        search->forceActiveFocus();
        search->setProperty("text", QString::fromUtf8("日本語"));
        QVERIFY(QMetaObject::invokeMethod(search, "select", Q_ARG(int, 0), Q_ARG(int, 3)));
        QCOMPARE(search->property("selectedText").toString(), QString::fromUtf8("日本語"));
        root->setWidth(width == 640 ? 1200 : 640);
        QCoreApplication::processEvents();
        QCOMPARE(search, visualItem(root->contentItem(), "settings-header-search"));
        QCOMPARE(search->property("selectedText").toString(), QString::fromUtf8("日本語"));
        QVERIFY(QMetaObject::invokeMethod(search, "deselect"));
        search->setProperty("cursorPosition", 3);
        const auto query = root->property("settingsQuery").toString();
        QInputMethodEvent preedit(QString::fromUtf8("にほん"), {});
        QCoreApplication::sendEvent(search, &preedit);
        QTRY_VERIFY(search->property("inputMethodComposing").toBool());
        QTest::keyClick(root, Qt::Key_Escape);
        QCOMPARE(root->property("settingsQuery").toString(), query);
        QInputMethodEvent committed;
        committed.setCommitString(QString::fromUtf8("日本"));
        QCoreApplication::sendEvent(search, &committed);
        QTRY_VERIFY(!search->property("inputMethodComposing").toBool());
        QTest::keyClick(root, Qt::Key_Escape);
        QTRY_COMPARE(root->property("settingsQuery").toString(), QString());
        QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "commands"), Q_ARG(QVariant, QVariant())));
        auto *commandSearch = visualItem(root->contentItem(), "command-search");
        QVERIFY(commandSearch);
        QTRY_VERIFY(commandSearch->hasActiveFocus());
        QTest::keyClick(root, Qt::Key_Down);
        QTRY_COMPARE(root->property("commandIndex").toInt(), 1);
        QTest::keyClick(root, Qt::Key_Up);
        QTRY_COMPARE(root->property("commandIndex").toInt(), 0);
        QTest::keyClick(root, Qt::Key_Escape);
        QTRY_VERIFY(!root->findChild<QObject *>("command-palette")->property("visible").toBool());
        QCOMPARE(bridge.state().value("sessions"), sessions);
        QCOMPARE(warnings.count(), 0);
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
    void providerSnapshotPrefersOnDeviceThenCloudDefaults() {
        ProviderDiscovery::Snapshot snapshot;
        QCOMPARE(snapshot.availability("ollama:llama3.2"), QString("unknown"));
        snapshot.checked = true;
        QVERIFY(snapshot.empty());
        snapshot.keyed = {"openai"};
        snapshot.models["openai"] = {"openai:text-embedding-3-small", "openai:whisper-1", "openai:gpt-4o", "openai:gpt-4.1-mini-2025-04-14"};
        QVERIFY(!snapshot.empty());
        QCOMPARE(snapshot.preferredModel({}), QString("openai:gpt-4.1-mini-2025-04-14"));
        QCOMPARE(snapshot.availability("ollama:llama3.2"), QString("offline"));
        QCOMPARE(snapshot.availability("claude:claude-haiku-4"), QString("missingKey"));
        QCOMPARE(snapshot.availability("demo.standard"), QString("unsupported"));
        snapshot.models["ollama"] = {"ollama:nomic-embed-text", "ollama:qwen3:4b"};
        QCOMPARE(snapshot.preferredModel({}), QString("ollama:qwen3:4b"));
        QCOMPARE(snapshot.availability("ollama:llama3.2"), QString("notInstalled"));
        // A recently used model that still runs wins over the provider order.
        QCOMPARE(snapshot.preferredModel({"ollama:llama3.2", "openai:gpt-4o"}), QString("openai:gpt-4o"));
    }
    void dictionaryAcceptsJSONInsideAMarkdownFence() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        const QString json = R"({"headword":"serendipity","pronunciation":"/ser/","meaning":"chance","translations":[{"text":"sự tình cờ","pronunciation":"sự tình cờ"}]})";
        for (const auto &[reply, valid] : QList<QPair<QString, bool>>{{"```json\n" + json + "\n```", true}, {"not json", false}}) {
            bridge.command("navigate", {{"feature", "dictionary"}});
            bridge.command("new");
            bridge.command("draft", {{"value", "serendipity"}});
            bridge.command("submit", {{"sessionID", current(bridge).value("id")}});
            const auto task = bridge.state().value("tasks").toList().first().toMap();
            bridge.command("receive", {{"taskID", task.value("id")}, {"attemptID", task.value("attemptID")}, {"chunk", reply}, {"terminal", "succeeded"}});
            const auto done = bridge.state().value("tasks").toList().first().toMap();
            QCOMPARE(done.value("status").toString(), QString(valid ? "succeeded" : "failed"));
            if (valid) QCOMPARE(current(bridge).value("output").toString(), json);
            else QCOMPARE(done.value("errorCode").toString(), QString("providerInvalidResponse"));
        }
    }
    void imageGenerationUsesAnyKeyedImageProvider() {
        const auto keys = [](const QStringList &present) { return [present](const QString &id) { return present.contains(id); }; };
        QCOMPARE(ImageGeneration::imageProvider("gemini:gemini-2.5-flash", keys({"openai", "gemini"})), QString("gemini"));
        QCOMPARE(ImageGeneration::imageProvider("claude:claude-haiku-4-5", keys({"openai"})), QString("openai"));
        QCOMPARE(ImageGeneration::imageProvider("openai:gpt-4o", keys({"gemini"})), QString("gemini"));
        QCOMPARE(ImageGeneration::imageProvider("ollama:qwen3:4b", keys({})), QString());
    }
    void refusedImageRequestExplainsTheModelCannotReadImages() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("navigate", {{"feature", "chat"}});
        bridge.command("addImage", {{"image", QVariantMap{{"id", QUuid::createUuid().toString(QUuid::WithoutBraces)}, {"name", "photo.png"}, {"mime", "image/png"}}}});
        bridge.command("draft", {{"value", "What is in this photo?"}});
        bridge.command("submit", {{"sessionID", current(bridge).value("id")}});
        const auto task = bridge.state().value("tasks").toList().first().toMap();
        QVERIFY(!task.value("request").toMap().value("messages").toList().last().toMap().value("images").toList().isEmpty());
        bridge.command("receive", {{"taskID", task.value("id")}, {"attemptID", task.value("attemptID")}, {"chunk", ""}, {"terminal", "failed"}, {"errorCode", "providerRejected"}, {"errorDetail", "image too large"}});
        QCOMPARE(bridge.state().value("tasks").toList().first().toMap().value("errorCode").toString(), QString("imageModelUnsupported"));
        QCOMPARE(bridge.state().value("tasks").toList().first().toMap().value("errorDetail").toString(), QString("image too large"));
        QCOMPARE(CloudProtocol::errorMessage(R"({"error":{"message":"The model does not exist\nor no access."}})"), QString("The model does not exist or no access."));
        QCOMPARE(ImageGeneration::imageModel("openai", "gpt-4o", {"openai:gpt-image-1", "openai:gpt-image-1-mini", "openai:gpt-image-1.5"}), QString("gpt-image-1.5"));
        QCOMPARE(ImageGeneration::imageModel("gemini", "", {"gemini:imagen-4.0", "gemini:gemini-2.5-flash-image"}), QString("gemini-2.5-flash-image"));
    }
    void quickTranslatePairRoutesTextAlreadyInThePrimaryLanguage() {
        QCOMPARE(TextLanguage::detect("Xin chào, cuộc họp bắt đầu lúc chín giờ."), QString("vi"));
        QCOMPARE(TextLanguage::detect("会議は九時に始まります。"), QString("ja"));
        QCOMPARE(TextLanguage::detect("회의는 아홉 시에 시작합니다"), QString("ko"));
        QCOMPARE(TextLanguage::detect("Встреча начнётся в девять"), QString("ru"));
        QCOMPARE(TextLanguage::detect("The meeting starts at nine"), QString());
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        QCOMPARE(bridge.quickTranslate().value("secondary").toString(), QString());
        bridge.command("quickTranslatePrimary", {{"value", "vi"}});
        bridge.command("quickTranslateSecondary", {{"value", "en"}});
        QCOMPARE(bridge.quickTranslateTarget("Xin chào các bạn, hôm nay trời đẹp."), QString("en"));
        QCOMPARE(bridge.quickTranslateTarget("Good morning"), QString("vi"));
        bridge.command("quickTranslateSecondary", {{"value", "vi"}});   // same as primary: ignored
        QCOMPARE(bridge.quickTranslate().value("secondary").toString(), QString("en"));
        bridge.command("quickTranslatePrimary", {{"value", "en"}});     // the secondary: swaps
        QCOMPARE(bridge.quickTranslate(), (QVariantMap{{"primary", "en"}, {"secondary", "vi"}}));
        bridge.command("quickTranslateSecondary", {{"value", ""}});
        QCOMPARE(bridge.quickTranslateTarget("Hello"), QString("en"));
        WorkbenchBridge reloaded(nullptr, dir.filePath("state.json"), false);
        QCOMPARE(reloaded.quickTranslate().value("primary").toString(), QString("en"));
    }
    void thermalHwmonSensorsFoldIntoNamedRows() {
        QCOMPARE(ThermalSensors::classify("coretemp / Package id 0").label, QString("cpu_package"));
        QCOMPARE(ThermalSensors::classify("coretemp / Core 3").label, QString("cpu_core"));
        QCOMPARE(ThermalSensors::classify("k10temp / Tctl").label, QString("cpu_package"));
        QCOMPARE(ThermalSensors::classify("amdgpu / edge").group, QString("gpu"));
        QCOMPARE(ThermalSensors::classify("nvme / Composite").label, QString("storage"));
        QCOMPARE(ThermalSensors::classify("acpitz / temp1").label, QString());
        const QVariantList sensors{QVariantMap{{"name", "coretemp / Core 0"}, {"value", 52.0}}, QVariantMap{{"name", "coretemp / Core 1"}, {"value", 58.0}},
            QVariantMap{{"name", "coretemp / Package id 0"}, {"value", 60.0}}, QVariantMap{{"name", "acpitz / temp1"}, {"value", 95.0}}, QVariantMap{{"name", "nvme / Composite"}, {"value", 41.0}}};
        const auto rows = ThermalSensors::rows(sensors);
        QCOMPARE(rows.size(), 4);
        QCOMPARE(rows[0].toMap().value("label").toString(), QString("cpu_package"));
        QCOMPARE(rows[1].toMap().value("count").toInt(), 2);
        QCOMPARE(rows[1].toMap().value("max").toDouble(), 58.0);
        QCOMPARE(rows[1].toMap().value("average").toDouble(), 55.0);
        // A sensor of unknown meaning keeps its driver name and follows the named rows, even when hottest.
        QCOMPARE(rows[2].toMap().value("label").toString(), QString("storage"));
        QCOMPARE(rows[3].toMap().value("title").toString(), QString("acpitz / temp1"));
        QCOMPARE(ThermalSensors::tone(70), QString("warm"));
    }
    void launcherRanksNamePrefixThenWordThenAnywhereWithRecentFirst() {
        QVariantList apps; for (const auto &name : {"Safari", "System Settings", "Photos", "Visual Studio Code", "Messages", "Notes", "Font Book"}) apps.append(QVariantMap{{"id", QString("/apps/") + name}, {"name", name}});
        const auto names = [&apps](const QString &query, const QStringList &recent) { QStringList out; for (const auto &app : LauncherTools::rank(apps, query, recent)) out.append(app.toMap().value("name").toString()); return out; };
        QCOMPARE(names("s", {}), (QStringList{"Safari", "System Settings", "Visual Studio Code", "Notes", "Photos", "Messages"}));
        QCOMPARE(names("set", {}), QStringList{"System Settings"});
        QCOMPARE(names("code", {}), QStringList{"Visual Studio Code"});
        QCOMPARE(names("s", {"/apps/System Settings"}).first(), QString("System Settings"));
        QCOMPARE(names("", {"/apps/Notes", "/apps/Safari"}), (QStringList{"Notes", "Safari"}));
        QVERIFY(names("zzz", {}).isEmpty());
    }
    void transcriptionUsesTheBestModelTheAccountLists() {
        QCOMPARE(NativeAudio::transcriptionModel({}), QString("whisper-1"));
        QCOMPARE(NativeAudio::transcriptionModel({"openai:whisper-1", "openai:gpt-4o-mini-transcribe"}), QString("gpt-4o-mini-transcribe"));
        QCOMPARE(NativeAudio::transcriptionModel({"openai:gpt-4o-mini-transcribe", "openai:gpt-4o-transcribe"}), QString("gpt-4o-transcribe"));
    }
    void voiceGateIgnoresRoomNoiseAndClosesAtAPause() {
        VoiceGate gate;
        // A fan at -38 dB (above the old fixed 0.008 RMS ≈ -42 dB threshold) is learned as the floor.
        for (int i = 0; i < 300; ++i) QVERIFY(gate.feed(-38) != VoiceGate::Finish);
        QVERIFY(!gate.heard);
        for (int i = 0; i < 20; ++i) QCOMPARE(gate.feed(-23), VoiceGate::None);
        QVERIFY(gate.heard);
        bool finished = false; for (int i = 0; i < 10; ++i) finished |= gate.feed(-38) == VoiceGate::Finish;
        QVERIFY(finished);
        // A click is dropped; continuous speech closes at a gap after 12 s, before the 25 s cap.
        bool discarded = false; gate.feed(-10); for (int i = 0; i < 10; ++i) discarded |= gate.feed(-38) == VoiceGate::Discard;
        QVERIFY(discarded);
        // Typing: short taps every 0.4 s keep the clip open but are not speech.
        bool typed = false, kept = false; for (int i = 0; i < 90; ++i) { const auto event = gate.feed(i < 80 && i % 4 == 0 ? -10 : -38); typed |= event == VoiceGate::Discard; kept |= event == VoiceGate::Finish; }
        QVERIFY(typed && !kept);
        double at = 0; for (int i = 0; i < 250 && at == 0; ++i) if (gate.feed(i >= 140 && i % 30 < 5 ? -38 : -20) == VoiceGate::Finish) at = i * VoiceGate::frame;
        QVERIFY(at >= VoiceGate::longClip && at < VoiceGate::maximum);
        QVERIFY(VoiceGate::meaningful("Xin chào") && !VoiceGate::meaningful(" ... "));
    }
    void voiceGateKeepsQuietSpeechInANoisyRoomAsOneUtterance() {
        // Levels measured on a real Mac: room noise -27…-34 dB, voice only -20…-29 dB.
        const double noise[] = {-31, -28, -33, -30, -27.5, -32, -29, -34}, speech[] = {-23, -25, -22, -26, -24, -28.8, -21, -24.5, -23.5, -25.5};
        VoiceGate gate; int finished = 0, other = 0;
        for (int i = 0; i < 60; ++i) finished += gate.feed(noise[i % 8]) == VoiceGate::Finish;
        QCOMPARE(finished, 0);
        for (int i = 0; i < 160; ++i) other += gate.feed(speech[i % 10]) != VoiceGate::None;
        QCOMPARE(other, 0);
        for (int i = 0; i < 20; ++i) { const auto event = gate.feed(noise[i % 8]); finished += event == VoiceGate::Finish; other += event == VoiceGate::Discard; }
        QCOMPARE(finished, 1); QCOMPARE(other, 0);
    }
    void speechRecognitionDefaultsToAutoInEveryEntryPoint() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        QVERIFY(!bridge.state().contains("speechProvider") || bridge.state().value("speechProvider").toString() == "auto");
        for (const auto &file : {":/qml/Main.qml", ":/qml/InterpretationWorkspace.qml"}) {
            QFile qml(file); QVERIFY(qml.open(QIODevice::ReadOnly));
            QVERIFY2(!qml.readAll().contains(R"(speechProvider || "openai")"), file); // Settings shows Auto when unset
        }
    }
    void adoptModelMovesOnlySessionsWithoutWork() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("navigate", {{"feature", "chat"}});
        bridge.command("draft", {{"value", "Earlier question"}});
        const auto started = current(bridge).value("id").toString();
        bridge.command("submit", {{"sessionID", started}});
        bridge.command("navigate", {{"feature", "translate"}});
        bridge.command("draft", {{"value", "Not sent yet"}});
        const auto blank = current(bridge).value("id").toString();
        const auto model = [&](const QString &id) { for (const auto &value : bridge.state().value("sessions").toList()) if (value.toMap().value("id") == id) return value.toMap().value("model").toString(); return QString(); };
        bridge.command("adoptModel", {{"value", "gemini:gemini-2.5-flash"}, {"sessionIDs", QStringList{started, blank}}});
        QCOMPARE(model(blank), QString("gemini:gemini-2.5-flash"));
        QCOMPARE(model(started), QString("ollama:llama3.2"));
        QCOMPARE(current(bridge).value("draft").toString(), QString("Not sent yet"));
        bridge.command("adoptModel", {{"value", "not-a-model"}, {"sessionIDs", QStringList{blank}}});
        QCOMPARE(model(blank), QString("gemini:gemini-2.5-flash"));
    }
    void providerNoticeFollowsRuntimeAndOpensLocalModels() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("route", {{"value", "chat"}});
        bridge.command("model", {{"value", "ollama:llama3.2"}});
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(root);
        auto *notice = visualItem(root->contentItem(), "provider-notice");
        QVERIFY(notice);
        // Never warns before discovery has answered.
        QCoreApplication::processEvents();
        QVERIFY(!notice->isVisible());
        ProviderDiscovery::Snapshot snapshot; snapshot.checked = true;
        bridge.applyProviderSnapshot(snapshot); // nothing local answered, no cloud key
        QTRY_VERIFY(notice->isVisible());
        QVERIFY(bridge.providersEmpty());
        snapshot.models["ollama"] = {"ollama:llama3.2"};
        bridge.applyProviderSnapshot(snapshot);
        QTRY_VERIFY(!notice->isVisible());
        // A model this device cannot run warns again and offers the one it can.
        bridge.command("model", {{"value", "claude:claude-haiku-4"}});
        QTRY_VERIFY(notice->isVisible());
        auto *use = visualItem(root->contentItem(), "provider-notice-use");
        QVERIFY(use); QTRY_VERIFY(use->isVisible());
        QMetaObject::invokeMethod(notice, "useRequested", Q_ARG(QString, "ollama:llama3.2"));
        QTRY_VERIFY(!notice->isVisible());
        QCOMPARE(current(bridge).value("model").toString(), QString("ollama:llama3.2"));
        const auto before = bridge.state();
        QVERIFY(QMetaObject::invokeMethod(root, "openSettingsSection", Q_ARG(QVariant, "localModels")));
        auto *settings = root->findChild<QQuickItem *>("settings-workspace");
        QTRY_VERIFY(settings);
        QTRY_COMPARE(settings->property("activeSection").toString(), QString("localModels"));
        QTRY_COMPARE(root->property("settingsSection").toString(), QString());
        QCOMPARE(bridge.state().value("sessions"), before.value("sessions"));
        // A synchronous "section consumed" reset would loop the binding. Leaving Chat
        // also emits the known ChatTranscript.qml:33 warning, so filter for loops only.
        for (const auto &warning : warnings)
            for (const auto &error : qvariant_cast<QList<QQmlError>>(warning.at(0)))
                QVERIFY2(!error.toString().contains("Binding loop"), qPrintable(error.toString()));
    }
    void glassW2Layout_data() {
        QTest::addColumn<int>("width"); QTest::addColumn<QString>("mode");
        for (int width : {640, 820, 1280}) for (const auto &mode : {QString("light"), QString("dark")})
            QTest::newRow(qPrintable(QString::number(width) + "-" + mode)) << width << mode;
    }
    void glassW2Layout() {
        QFETCH(int, width); QFETCH(QString, mode);
        const bool previous = QStandardPaths::isTestModeEnabled(); QStandardPaths::setTestModeEnabled(true);
        const auto reset = qScopeGuard([previous] { QStandardPaths::setTestModeEnabled(previous); NativeAudio::setMicrophonePermissionForTest({}); });
        NativeAudio::setMicrophonePermissionForTest("granted");
        QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("appearance", {{"preset","glass"}, {"mode",mode}});
        bridge.command("route", {{"value","translate"}}); bridge.command("navigate", {{"feature","translate"}});
        ProviderDiscovery::Snapshot snapshot; snapshot.checked = true; snapshot.models["ollama"] = {"ollama:llama3.2","ollama:qwen3","ollama:gemma3"}; bridge.applyProviderSnapshot(snapshot);
        bridge.command("model", {{"value","ollama:llama3.2"}});
        QQmlApplicationEngine engine; QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge); engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty()); auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(window);
        window->resize(width, width == 1280 ? 800 : 640); QCoreApplication::processEvents();
        auto *source = visualItem(window->contentItem(), "translation-source-pane"); auto *result = visualItem(window->contentItem(), "translation-result-pane"); QVERIFY(source && result);
        QTRY_VERIFY(qAbs(source->width() - result->width()) <= 1);
        QVERIFY(result->mapToScene(QPointF(result->width(),0)).x() <= width);
        auto *submit = visualItem(window->contentItem(), "translate-submit"); QVERIFY(submit);
        auto *draft = visualItem(window->contentItem(), "source-draft"); QVERIFY(draft);
        QCOMPARE(draft->property("verticalAlignment").toInt(), int(Qt::AlignTop));
        auto *resultText = visualItem(window->contentItem(), "translation-result-text"); QVERIFY(resultText);
        QCOMPARE(resultText->property("verticalAlignment").toInt(), int(Qt::AlignTop));
        auto *resultRule = visualItem(window->contentItem(), "translation-result-rule"); QVERIFY(resultRule); QVERIFY(!resultRule->isVisible());
        auto *sourceSurface = visualItem(window->contentItem(), "translation-source-surface"); QVERIFY(sourceSurface); QVERIFY(sourceSurface->isVisible());
        auto *language = visualItem(window->contentItem(), "translate-source-language"); QVERIFY(language);
        QVERIFY(visualText(language, QString::fromUtf8("Đầu vào")));
        QVERIFY(visualItem(language, "language-chevron"));
        auto *modelTrigger = visualItem(window->contentItem(), "feature-model-trigger"); QVERIFY(modelTrigger && modelTrigger->isVisible());
        QVERIFY(QMetaObject::invokeMethod(modelTrigger, "clicked"));
        auto *models = window->findChild<QObject *>("feature-model-panel"); QVERIFY(models); QTRY_VERIFY(models->property("visible").toBool());
        QVERIFY(models->property("x").toDouble() >= 0);
        QVERIFY(models->property("x").toDouble() + models->property("width").toDouble() <= width + 1);
        auto *modelList = models->findChild<QQuickItem *>("feature-model-list"); QVERIFY(modelList);
        QTRY_VERIFY(modelList->hasActiveFocus());
        const auto modelIDs = modelTrigger->parentItem()->property("featureModels").value<QJSValue>();
        const int nextIndex = qMin(modelList->property("currentIndex").toInt() + 1, modelIDs.property("length").toInt() - 1);
        QTest::keyClick(window, Qt::Key_Down); QTest::keyClick(window, Qt::Key_Return);
        QTRY_VERIFY(!models->property("visible").toBool());
        QCOMPARE(current(bridge).value("model").toString(), modelIDs.property(nextIndex).toString());
        bridge.command("model", {{"value", "ollama:llama3.2"}});
        QCOMPARE(submit->property("shortcutText").toString(), QString("Ctrl+Enter"));
        if (width == 1280) {
            auto *shortcut = visualItem(submit, "primary-shortcut"); QVERIFY(shortcut && shortcut->isVisible());
            QVERIFY(submit->mapToScene(QPointF(submit->width(), 0)).x() <= source->mapToScene(QPointF(source->width(), 0)).x());
        }


        bridge.command("draft", {{"value",QString(5001,'a')}}); QTRY_VERIFY(!submit->isEnabled());
        bridge.command("submit"); QVERIFY(bridge.state().value("tasks").toList().isEmpty());
        bridge.command("draft", {{"value",QString(5000,'a')}}); QTRY_VERIFY(submit->isEnabled());
        bridge.command("draft", {{"value","One sentence. Second sentence."}}); bridge.command("submit"); auto task = latest(bridge);
        bridge.command("receive", {{"taskID",task.value("id")}, {"attemptID",task.value("attemptID")}, {"chunk","Câu một. Câu hai."}, {"terminal","succeeded"}});
        auto *actions = visualItem(window->contentItem(), "translation-actions"); QVERIFY(actions); QTRY_VERIFY(actions->isVisible());
        for (const auto &pair : {qMakePair("translate-source-language","language-panel"), qMakePair("translate-listen","listen-panel"), qMakePair("translate-compare","compare-panel")}) {
            auto *trigger = visualItem(window->contentItem(), pair.first); QVERIFY(trigger);
            QVERIFY(QMetaObject::invokeMethod(trigger,"clicked"));
            auto *panel = QString(pair.second) == "compare-panel" ? window->findChild<QObject *>(pair.second) : trigger->findChild<QObject *>(pair.second); QVERIFY(panel); QTRY_VERIFY(panel->property("visible").toBool());
            const auto x = panel->property("x").toDouble(), y = panel->property("y").toDouble();
            QVERIFY(x >= 0 && y >= 0); QVERIFY(x + panel->property("width").toDouble() <= width + 1);
            QVERIFY(y + panel->property("height").toDouble() <= window->height() + 1);
            const auto anchor = trigger->mapToScene(QPointF());
            QVERIFY(y >= anchor.y() + trigger->height() || y + panel->property("height").toDouble() <= anchor.y());
            QVERIFY(QMetaObject::invokeMethod(panel,"close"));
        }
        // Select order is semantically significant; compare all real IDs, not an equal-key sort sample.
        bridge.command("compare", {{"sessionID",current(bridge).value("id")}, {"models",QStringList{"ollama:llama3.2","ollama:gemma3","ollama:qwen3"}}});
        QStringList columns; for (const auto &value : bridge.state().value("sessions").toList()) if (value.toMap().value("comparisonParent") == current(bridge).value("id")) columns << value.toMap().value("model").toString();
        QCOMPARE(columns, (QStringList{"ollama:llama3.2","ollama:gemma3","ollama:qwen3"}));
        for (const auto &value : bridge.state().value("tasks").toList()) {
            const auto childTask=value.toMap(); if (childTask.value("status") != "running") continue;
            bridge.command("receive",{{"taskID",childTask.value("id")},{"attemptID",childTask.value("attemptID")},{"chunk","Câu một. Câu hai."},{"terminal","succeeded"}});
        }
        bridge.command("compareBySentence", {{"value",true}}); QVERIFY(bridge.state().value("compareBySentence").toBool());
        auto *comparisonPanel=window->findChild<QObject *>("compare-panel"); QVERIFY(comparisonPanel);
        auto *comparison=comparisonPanel->findChild<QObject *>("comparison-pane"); QVERIFY(comparison);
        comparison->setProperty("choosing",false); QTRY_VERIFY(comparison->property("sentenceRows").toBool());
        bridge.command("compareBySentence", {{"value",false}}); QVERIFY(!bridge.state().value("compareBySentence").toBool());
        QTRY_VERIFY(!comparison->property("sentenceRows").toBool());
        for (const auto &value : bridge.state().value("tasks").toList()) bridge.command("cancel", {{"taskID",value.toMap().value("id")}});
        // Permission refresh is a user action; its value must not be cached by the QML binding.
        NativeAudio::setMicrophonePermissionForTest("denied");
        QVERIFY(QMetaObject::invokeMethod(window,"selectRoute",Q_ARG(QVariant,"interpret")));
        QQuickItem *card = nullptr; QTRY_VERIFY(card = visualItem(window->contentItem(),"microphone-permission-card")); QTRY_VERIFY(card->isVisible());
        auto *check = visualItem(window->contentItem(),"microphone-recheck"); QVERIFY(check);
        auto *summaryHeader = visualItem(window->contentItem(), "interpret-summary-header"); QVERIFY(summaryHeader);
        QVERIFY(!summaryHeader->isEnabled()); QVERIFY(!summaryHeader->property("glassMaterial").toBool());
        QCOMPARE(summaryHeader->property("iconName").toString(), QString("reasoning"));
        QVERIFY(summaryHeader->mapToScene(QPointF()).x() >= 0);
        QVERIFY(summaryHeader->mapToScene(QPointF(summaryHeader->width(), 0)).x() <= width);
        auto *interpretModel = visualItem(window->contentItem(), "interpret-model-picker"); QVERIFY(interpretModel && interpretModel->isVisible());
        const auto translationModel = current(bridge).value("model");
        QVERIFY(QMetaObject::invokeMethod(interpretModel, "chooseFeatureModel", Q_ARG(QVariant, "ollama:qwen3")));
        auto *interpretView = visualItem(window->contentItem(), "interpret-workspace"); QVERIFY(interpretView);
        QTRY_COMPARE(interpretView->property("modelID").toString(), QString("ollama:qwen3"));
        QCOMPARE(current(bridge).value("model"), translationModel);
        auto *swap = visualItem(window->contentItem(), "interpret-swap"); QVERIFY(swap); QVERIFY(!swap->isEnabled());
        auto *inputLanguage = visualItem(window->contentItem(), "interpret-source-language"); QVERIFY(inputLanguage);
        QVERIFY(QMetaObject::invokeMethod(inputLanguage, "chosen", Q_ARG(QString, "en")));
        QTRY_VERIFY(swap->isEnabled()); QVERIFY(QMetaObject::invokeMethod(swap, "clicked"));
        QCOMPARE(inputLanguage->property("language").toString(), QString("vi"));
        QCOMPARE(visualItem(window->contentItem(), "interpret-target-language")->property("language").toString(), QString("en"));

        QVERIFY(visualText(window->contentItem(),QString::fromUtf8("Quyền microphone · Chưa cấp")));
        auto *settings = visualItem(window->contentItem(),"microphone-settings"); QVERIFY(settings); QCOMPARE(settings->property("text").toString(),QString::fromUtf8("Mở Cài đặt hệ thống"));
        NativeAudio::setMicrophonePermissionForTest("granted"); QVERIFY(QMetaObject::invokeMethod(check,"clicked")); QTRY_VERIFY(!card->isVisible());
        NativeAudio::setMicrophonePermissionForTest("undetermined"); QVERIFY(QMetaObject::invokeMethod(check,"clicked")); QTRY_VERIFY(card->isVisible());
        const QVariantMap meeting{{"id","w2-meeting"},{"created",100.0},{"model","ollama:synthetic"},{"provider","auto"},{"source","en"},{"target","vi"},{"locale","vi"},{"captureMode","microphone"},{"deviceID","fixture-device"},{"summary",""},
            {"segments",QVariantList{QVariantMap{{"id","s1"},{"start",0.0},{"end",2.0},{"speaker","A"},{"original","Hello"},{"translated","Xin chào"},{"status","done"}}}}};
        auto *live=bridge.interpretation(); live->restoreSession(meeting); live->select("w2-meeting"); QCoreApplication::processEvents();
        auto *view=visualItem(window->contentItem(),"interpret-workspace"); QVERIFY(view);
        QVERIFY(QMetaObject::invokeMethod(view,"deleteSession",Q_ARG(QVariant,"w2-meeting")));
        QVERIFY(live->current().value("id") != "w2-meeting");
        auto toasts=window->property("toasts").value<QJSValue>(); auto undo=toasts.property(toasts.property("length").toInt()-1).property("undo"); QVERIFY(undo.isCallable()); undo.call();
        QCOMPARE(live->current().value("id").toString(),QString("w2-meeting"));
        QVERIFY(!live->exportText(false,true).contains("Hello")); QVERIFY(live->exportText(true,true).contains(QString::fromUtf8("Xin chào")));
        // No event loop turn between start and cancel: this exercises summary ownership
        // without waiting for or consuming a provider response.
        live->summarize("summary"); QVERIFY(live->summarizing()); live->cancelSummary(); QVERIFY(!live->summarizing());
        live->deleteSession("w2-meeting");
        for (const auto &warning : warnings) for (const auto &error : qvariant_cast<QList<QQmlError>>(warning.at(0))) qWarning().noquote() << error.toString();
        QCOMPARE(warnings.count(),0);
    }
    void glassW2Dictionary_data() { glassW2Layout_data(); }
    void glassW2Dictionary() {
        QFETCH(int, width); QFETCH(QString, mode);
        QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("appearance", {{"preset","glass"}, {"mode",mode}});
        bridge.command("route", {{"value","dictionary"}}); bridge.command("navigate", {{"feature","dictionary"}});
        bridge.command("model", {{"value","ollama:llama3.2"}});
        bridge.command("draft", {{"value","bank"}}); bridge.command("dictionaryContext", {{"value","We sat by the river bank."}}); bridge.command("submit"); auto task=latest(bridge);
        const QString reply=R"({"headword":"bank","pronunciation":"bank","meaning":"edge","translations":[{"text":"bờ","pronunciation":"bờ","meaning":"river edge","examples":["river bank → bờ sông"],"exampleRegisters":["everyday"]}],"contextSense":1,"related":{"derived":["banking"],"synonyms":["shore"],"antonyms":[]}})";
        bridge.command("receive", {{"taskID",task.value("id")},{"attemptID",task.value("attemptID")},{"chunk",reply},{"terminal","succeeded"}});
        QQmlApplicationEngine engine; QSignalSpy warnings(&engine,&QQmlEngine::warnings); engine.rootContext()->setContextProperty("workbench",&bridge); engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty()); auto *window=qobject_cast<QQuickWindow *>(engine.rootObjects().first()); window->resize(width,640); QCoreApplication::processEvents();
        QQuickItem *result=nullptr; QTRY_VERIFY(result=visualItem(window->contentItem(),"dictionary-result"));
        result->setProperty("selectedTab",2); QCoreApplication::processEvents(); QVERIFY(visualText(result,"shore"));
        result->setProperty("selectedTab",1); QCoreApplication::processEvents(); QVERIFY(visualText(result,QString::fromUtf8("nghĩa 01 · everyday")));
        result->setProperty("selectedTab",2); QCoreApplication::processEvents();
        auto *related=visualItem(result,"dictionary-related-shore"); QVERIFY(related); QVERIFY(QMetaObject::invokeMethod(related,"clicked"));
        QCOMPARE(current(bridge).value("draft").toString(),QString("shore")); QCOMPARE(current(bridge).value("dictionaryContext").toString(),QString("We sat by the river bank."));
        task=latest(bridge); bridge.command("receive",{{"taskID",task.value("id")},{"attemptID",task.value("attemptID")},{"chunk",reply},{"terminal","succeeded"}});
        QVariant ignored; QVERIFY(QMetaObject::invokeMethod(result,"handoff",Q_RETURN_ARG(QVariant,ignored),Q_ARG(QVariant,"translate"),Q_ARG(QVariant,"We sat by the river bank.")));
        QCOMPARE(current(bridge).value("draft").toString(),QString("We sat by the river bank."));
        bridge.command("navigate",{{"feature","dictionary"}}); const auto taskCount=bridge.state().value("tasks").toList().size(); bridge.command("draft",{{"value",QString(121,'a')}}); bridge.command("submit"); QCOMPARE(bridge.state().value("tasks").toList().size(),taskCount);
        bridge.command("draft",{{"value","bnak"}}); bridge.command("submit"); task=latest(bridge);
        bridge.command("receive",{{"taskID",task.value("id")},{"attemptID",task.value("attemptID")},{"chunk",R"({"notFound":true,"suggestions":[{"word":"bank","meaning":"edge"}]})"},{"terminal","succeeded"}});
        QCoreApplication::processEvents();
        QVERIFY(visualText(window->contentItem(),QString::fromUtf8("Không tìm thấy")));
        auto *suggestion=visualItem(window->contentItem(),"dictionary-suggestion-bank"); QVERIFY(suggestion); QVERIFY(QMetaObject::invokeMethod(suggestion,"clicked"));
        QCOMPARE(current(bridge).value("draft").toString(),QString("bank")); QCOMPARE(current(bridge).value("dictionaryContext").toString(),QString("We sat by the river bank."));
        task=latest(bridge); bridge.command("receive",{{"taskID",task.value("id")},{"attemptID",task.value("attemptID")},{"chunk",reply},{"terminal","succeeded"}});
        const auto savedID=current(bridge).value("id").toString(); bridge.command("favorite"); bridge.command("new");
        QTRY_VERIFY(visualText(window->contentItem(),QString::fromUtf8("Bạn muốn tra từ gì?")));
        QQuickItem *savedRow=nullptr; QTRY_VERIFY(savedRow=visualItem(window->contentItem(),"dictionary-saved-"+savedID));
        QVERIFY(visualItem(window->contentItem(),"dictionary-recent-"+savedID));
        QVERIFY(savedRow->mapToScene(QPointF(savedRow->width(),0)).x() <= width+1);
        QVERIFY(QMetaObject::invokeMethod(savedRow,"clicked")); QCOMPARE(current(bridge).value("id").toString(),savedID);
        QCOMPARE(warnings.count(),0);
    }
    void glassW2ListenStates() {
        QTemporaryDir dir; WorkbenchBridge bridge(nullptr,dir.filePath("state.json"),false);
        bridge.command("appearance",{{"preset","glass"},{"mode","light"}});
        bridge.command("voice",{{"provider","edge"},{"voice",""},{"rate",1.0}});
        QQmlEngine engine; QSignalSpy warnings(&engine,&QQmlEngine::warnings); engine.rootContext()->setContextProperty("workbench",&bridge);
        QQmlComponent component(&engine);
        QFile fixture(QFileInfo(QStringLiteral(VIEZAN_CONTRACT_FIXTURE)).dir().filePath("../../apps/desktop-qt/tests/ListenFixture.qml"));
        QVERIFY(fixture.open(QIODevice::ReadOnly));
        component.setData(fixture.readAll(), QUrl("qrc:/listen-fixture.qml"));
        QScopedPointer<QObject> owner(component.create()); QVERIFY2(owner,qPrintable(component.errorString()));
        auto *window=qobject_cast<QQuickWindow *>(owner.data()); QVERIFY(window);
        auto *trigger=visualItem(window->contentItem(),"trigger"); QVERIFY(trigger); QVERIFY(QMetaObject::invokeMethod(trigger,"clicked"));
        auto *audio=owner->findChild<QObject *>("audio-fixture"); QVERIFY(audio);
        QQuickItem *row=nullptr; QTRY_VERIFY(row=visualItem(window->contentItem(),"listen-source-translation")); QTRY_COMPARE(row->height(),48.0);
        auto *detail=visualItem(window->contentItem(),"listen-detail-translation"); QVERIFY(detail); QVERIFY(detail->property("text").toString().contains("Japanese voice"));
        auto *sourceDetail=visualItem(window->contentItem(),"listen-detail-source"); QVERIFY(sourceDetail); QVERIFY(sourceDetail->property("text").toString().contains("English voice"));
        audio->setProperty("speakingSource","translation"); audio->setProperty("speaking",true); audio->setProperty("preparing",true);
        QTRY_COMPARE(detail->property("text").toString(),QString::fromUtf8("Đang tạo giọng…")); QCOMPARE(row->height(),48.0);
        audio->setProperty("preparing",false); QTRY_VERIFY(detail->property("text").toString().contains(QString::fromUtf8("Đang đọc"))); QCOMPARE(row->height(),48.0);
        QVERIFY(sourceDetail->property("text").toString().contains("English voice"));
        audio->setProperty("speaking",false); audio->setProperty("error","audioError"); audio->setProperty("lastSource","source");
        auto *fallback=visualItem(window->contentItem(),"listen-system-fallback"); QVERIFY(fallback); QTRY_VERIFY(fallback->isVisible()); QVERIFY(QMetaObject::invokeMethod(fallback,"clicked"));
        QCOMPARE(audio->property("lastProvider").toString(),QString("system")); QCOMPARE(audio->property("lastText").toString(),QString("Hello")); QCOMPARE(audio->property("lastLanguage").toString(),QString("en"));
        auto *rate=visualItem(window->contentItem(),"listen-rate-1.25"); QVERIFY(rate); QVERIFY(rate->isEnabled()); QVERIFY(QMetaObject::invokeMethod(rate,"clicked"));
        QCOMPARE(bridge.state().value("voice").toMap().value("rate").toDouble(),1.25);
        bridge.command("voice",{{"provider","gemini"},{"voice",""}}); QTRY_VERIFY(!rate->isEnabled());
        QCOMPARE(warnings.count(),0);
    }
    void glassW2ComponentsLoad_data() {
        QTest::addColumn<QString>("type");
        QTest::newRow("language") << "LanguageButton";
        QTest::newRow("listen") << "ListenButton";
    }
    void glassW2ComponentsLoad() {
        QFETCH(QString, type);
        QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("appearance", {{"preset", "glass"}, {"mode", "light"}});
        QQmlEngine engine; engine.rootContext()->setContextProperty("workbench", &bridge);
        QQmlComponent component(&engine);
        component.setData(("import QtQuick\nimport QtQuick.Controls\nimport \"qrc:/qml\" as V\nApplicationWindow { visible: true; width:640; height:640; V." + type + " { objectName: \"trigger\" } }").toUtf8(), QUrl());
        QScopedPointer<QObject> object(component.create());
        QVERIFY2(object, qPrintable(component.errorString()));
    }
    void qmlLoadsWithRealBridge_data() {
        QTest::addColumn<QString>("feature");
        QTest::addColumn<bool>("library");
        QTest::addColumn<bool>("compact");
        QTest::addColumn<QString>("preset");
        QTest::addColumn<QString>("mode");
        QTest::newRow("chat") << "chat" << false << false << "graphite" << "light";
        QTest::newRow("translation") << "translate" << false << false << "graphite" << "light";
        QTest::newRow("chat-library") << "chat" << true << false << "graphite" << "light";
        QTest::newRow("translation-library") << "translate" << true << false << "graphite" << "light";
        QTest::newRow("chat-library-640") << "chat" << true << true << "graphite" << "light";
        QTest::newRow("translation-library-640") << "translate" << true << true << "graphite" << "light";
        QTest::newRow("glass-light") << "chat" << false << false << "glass" << "light";
        QTest::newRow("glass-dark") << "translate" << false << false << "glass" << "dark";
        QTest::newRow("glass-library-640") << "chat" << true << true << "glass" << "light";
        QTest::newRow("glass-library-dark-640") << "translate" << true << true << "glass" << "dark";
    }
    void qmlLoadsWithRealBridge() {
        QFETCH(QString, feature);
        QFETCH(bool, library);
        QFETCH(bool, compact);
        QFETCH(QString, preset);
        QFETCH(QString, mode);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("appearance", {{"preset", preset}, {"mode", mode}});
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
    // ---- W3 System pages ----
    void w3AppsSafety();
    void w3SystemPages();
    void w3MainAppsRoute();
    // ---- W4 Settings ----
    void w4SettingsPages_data();
    void w4SettingsPages();
    void w4SettingsPickerKeyboard();
    void w4HistoryConfirmation();
    void w4UpdateMetadata();
    void w4SettingsSearchIme();

};

// ---- W3 System pages ----
void WorkbenchBridgeTests::w3AppsSafety() {
    QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
    bridge.command("appearance", {{"preset", "glass"}, {"mode", "light"}});
    QQmlEngine engine; QSignalSpy warnings(&engine, &QQmlEngine::warnings);
    engine.rootContext()->setContextProperty("workbench", &bridge);
    QFile fixture(QFileInfo(QStringLiteral(VIEZAN_CONTRACT_FIXTURE)).dir().filePath("../../apps/desktop-qt/tests/SystemPagesFixture.qml"));
    QVERIFY(fixture.open(QIODevice::ReadOnly)); QQmlComponent component(&engine);
    component.setData(fixture.readAll(), QUrl("qrc:/w3-fixture.qml"));
    QScopedPointer<QObject> owner(component.create()); QVERIFY2(owner, qPrintable(component.errorString()));
    auto *window = qobject_cast<QQuickWindow *>(owner.data()); QVERIFY(window);
    auto *apps = window->findChild<QQuickItem *>("w3-apps"); QVERIFY(apps);
    auto *fake = window->findChild<QObject *>("fake-uninstall"); QVERIFY(fake);
    auto eval = [&](const QString &code) { QQmlExpression expression(qmlContext(window), window, code); auto value = expression.evaluate(); if (expression.hasError()) qWarning() << expression.error(); return value; };
    auto callCount = [&] { return eval("appUninstall.calls.length").toInt(); };
    QCOMPARE(fake->property("scans").toInt(), 1);
    const auto row = [](const QString &source, bool elevated) { return QVariantMap{{"id", "opaque-private-id"}, {"name", "Fixture app"}, {"source", source}, {"scope", elevated ? "system" : "user"}, {"version", "1.0"}, {"canUninstall", true}, {"requiresAuthorization", elevated}, {"action", source == "appimage" ? "trash" : "uninstall"}}; };
    auto *remove = window->findChild<QQuickItem *>("apps-uninstall"); QVERIFY(remove);
    auto *confirm = window->findChild<QObject *>("apps-confirm"); QVERIFY(confirm);
    auto *accept = window->findChild<QQuickItem *>("apps-confirm-remove"); QVERIFY(accept);
    auto *cancel = window->findChild<QQuickItem *>("apps-confirm-cancel"); QVERIFY(cancel);
    int expected = 0;
    for (const auto &source : {QString("registry"), QString("flatpak"), QString("snap"), QString("deb"), QString("rpm"), QString("appimage")}) {
        for (const bool elevated : {false, true}) {
            if (source != "flatpak" && elevated != (source == "snap" || source == "deb" || source == "rpm")) continue;
            fake->setProperty("apps", QVariantList{row(source, elevated)}); apps->setProperty("selectedID", "opaque-private-id");
            QTRY_VERIFY(remove->isEnabled());
            QVERIFY(QMetaObject::invokeMethod(remove, "clicked"));
            QTRY_VERIFY(confirm->property("opened").toBool());
            QCOMPARE(callCount(), expected); QVERIFY(cancel->hasActiveFocus());
            auto *dangerBackground = accept->property("background").value<QQuickItem *>(); QVERIFY(dangerBackground);
            QVERIFY(dangerBackground->isVisible());
            const auto palette = bridge.resources().value("themePalettes").toMap().value("glass:auto").toMap().value("light").toMap();
            QCOMPARE(dangerBackground->property("color").value<QColor>(), QColor(palette.value("danger").toString()));
            QVERIFY(QMetaObject::invokeMethod(cancel, "clicked"));
            QTRY_VERIFY(!confirm->property("opened").toBool()); QCOMPARE(callCount(), expected);
            QVERIFY(QMetaObject::invokeMethod(remove, "clicked")); QTRY_VERIFY(confirm->property("opened").toBool());
            QVERIFY(QMetaObject::invokeMethod(accept, "clicked"));
            ++expected; QTRY_COMPARE(callCount(), expected);
            QCOMPARE(eval("appUninstall.calls[appUninstall.calls.length-1].authorizeSystem").toBool(), elevated);
            QVERIFY(!remove->isEnabled()); QVERIFY(!window->findChild<QQuickItem *>("apps-refresh")->isEnabled());
            QVERIFY(!visualText(window->contentItem(), "opaque-private-id"));
            eval("appUninstall.complete({status:'removed',verifiedRemoved:false})");
            QVERIFY(!apps->property("verified").toBool());
            eval("appUninstall.complete({status:'unverified',verifiedRemoved:false,canUndo:true,undoKind:'systemTrash'})");
            QVERIFY(!apps->property("verified").toBool());
            QVERIFY(window->findChild<QQuickItem *>("apps-trash-undo")->isVisible());
            eval("appUninstall.complete({status:'removed',verifiedRemoved:true,canUndo:true,undoKind:'systemTrash'})");
            QVERIFY(apps->property("verified").toBool());
        }
    }
    fake->setProperty("inventoryComplete", false); QTRY_VERIFY(!remove->isEnabled());
    fake->setProperty("inventoryComplete", true); fake->setProperty("operationUnverified", true); QTRY_VERIFY(!remove->isEnabled());
    QVERIFY(window->findChild<QQuickItem *>("apps-refresh")->isEnabled());
    QVERIFY(QMetaObject::invokeMethod(apps, "requestRemoval")); QCOMPARE(callCount(), expected);
    fake->setProperty("operationUnverified", false);
    QVERIFY(QMetaObject::invokeMethod(remove, "clicked")); QTRY_VERIFY(confirm->property("opened").toBool());
    auto changed = row("appimage", false); changed["name"] = "Changed after confirmation";
    fake->setProperty("apps", QVariantList{changed});
    QVERIFY(QMetaObject::invokeMethod(accept, "clicked")); QCOMPARE(callCount(), expected);
    auto store = row("msix", false); store["canUninstall"] = false; store["action"] = "openSettings"; store["settingsUrl"] = "https://invalid.example";
    fake->setProperty("apps", QVariantList{store}); apps->setProperty("selectedID", "opaque-private-id");
    auto *settings = window->findChild<QQuickItem *>("apps-settings"); QVERIFY(settings);
    QTRY_VERIFY(settings->isVisible()); QVERIFY(QMetaObject::invokeMethod(settings, "clicked"));
    QCOMPARE(window->property("settingsOpened").toInt(), 1); QCOMPARE(callCount(), expected);
    const QStringList codes{"removed", "scanned", "stillInstalled", "unverified", "restartRequired", "cancelled", "startFailed", "failed", "staleInventory", "inventoryIncomplete", "notAllowed", "authorizationRequired", "operationUnverified", "openSettings", "invalidUninstallCommand", "toolUnavailable", "authorizationUnavailable", "unknown", "unsupportedPlatform", "hklm64:registryUnavailable", "hklm32:registryUnavailable", "hkcu64:registryUnavailable", "registry:enumerationFailed", "registry:entryUnavailable", "desktop:directoryUnreadable", "desktop:entryUnreadable", "flatpak:user:scanFailed", "flatpak:system:scanFailed", "flatpak:invalidRecord", "snap:scanFailed", "snap:invalidRecord", "packages:ownerQueryFailed", "packages:ambiguousOwner", "packages:invalidOwner", "packages:verificationFailed"};
    for (const auto &locale : {QString("vi"), QString("en"), QString("ja")}) {
        const auto strings = bridge.resources().value("locales").toMap().value(locale).toMap();
        for (const auto &code : codes) {
            QVariant key;
            QVERIFY(QMetaObject::invokeMethod(apps, "messageKey", Q_RETURN_ARG(QVariant, key), Q_ARG(QVariant, code)));
            QVERIFY2(code == "unknown" || key.toString() != "appsUninstallUnknown", qPrintable(code));
            QVERIFY2(!strings.value(key.toString()).toString().isEmpty(), qPrintable(locale + ":" + code));
        }
        for (auto it = strings.cbegin(); it != strings.cend(); ++it) QVERIFY(!it.key().startsWith("w3"));
    }
    apps->setProperty("query", "no such app"); QTRY_VERIFY(!apps->property("selected").value<QJSValue>().isObject());
    QCoreApplication::processEvents(); QCOMPARE(warnings.count(), 0);
}

void WorkbenchBridgeTests::w3SystemPages() {
    QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
    bridge.command("appearance", {{"preset", "glass"}, {"mode", "light"}});
    QQmlEngine engine; QSignalSpy warnings(&engine, &QQmlEngine::warnings);
    engine.rootContext()->setContextProperty("workbench", &bridge);
    QFile fixture(QFileInfo(QStringLiteral(VIEZAN_CONTRACT_FIXTURE)).dir().filePath("../../apps/desktop-qt/tests/SystemPagesFixture.qml"));
    QVERIFY(fixture.open(QIODevice::ReadOnly)); QQmlComponent component(&engine);
    component.setData(fixture.readAll(), QUrl("qrc:/w3-fixture.qml"));
    QScopedPointer<QObject> owner(component.create()); QVERIFY2(owner, qPrintable(component.errorString()));
    auto *window = qobject_cast<QQuickWindow *>(owner.data()); QVERIFY(window);
    auto eval = [&](const QString &code) { QQmlExpression expression(qmlContext(window), window, code); auto value = expression.evaluate(); if (expression.hasError()) qWarning() << expression.error(); return value; };
    auto *strip = window->findChild<QQuickItem *>("w3-recording"); QVERIFY(strip); QVERIFY(!strip->isVisible());
    eval("audio.recordingStarted = Date.now()/1000 - 14; audio.changed()");
    QTRY_VERIFY(strip->isVisible()); QCOMPARE(strip->property("timeText").toString(), QString("00:14"));
    const auto elapsed = strip->property("elapsed").toInt(); QTRY_VERIFY_WITH_TIMEOUT(strip->property("elapsed").toInt() > elapsed, 2500);
    QVERIFY(QMetaObject::invokeMethod(window->findChild<QQuickItem *>("recording-stop"), "clicked"));
    QTRY_VERIFY(!strip->isVisible()); QCOMPARE(eval("audio.cancelled").toInt(), 1);
    window->setProperty("page", "everywhere");
    auto *capability = window->findChild<QObject *>("selection-capability"); QVERIFY(capability);
    auto before = capability->property("text").toString(); eval("desktop.canReplaceSelection = true");
    QTRY_VERIFY(capability->property("text").toString() != before);
    window->setProperty("page", "thermal");
    QVERIFY(window->findChild<QQuickItem *>("thermal-unsupported")->isVisible());
    QVERIFY(!window->findChild<QQuickItem *>("thermal-manual")->isEnabled());
    window->setProperty("page", "utilities");
    auto *recorder = window->findChild<QObject *>("w3-recorder"); QVERIFY(recorder);
    eval("testRecorder.begin(desktop.shortcuts[0], null)");
    QTRY_VERIFY(recorder->property("opened").toBool());
    auto *capture = window->findChild<QQuickItem *>("shortcut-capture");
    // Several page recorders exist; use the explicitly opened recorder's own field.
    capture = recorder->findChild<QQuickItem *>("shortcut-capture"); QVERIFY(capture);
    capture->forceActiveFocus(Qt::TabFocusReason);
    QTest::keyClick(window, Qt::Key_J, Qt::ControlModifier | Qt::ShiftModifier);
    QCOMPARE(recorder->property("candidate").toString(), QString("Ctrl+Shift+J"));
    QCOMPARE(eval("desktop.calls.length").toInt(), 0);
    QTest::keyClick(window, Qt::Key_Escape); QTRY_VERIFY(!recorder->property("opened").toBool());
    QCOMPARE(eval("desktop.calls.length").toInt(), 0);
    eval("testRecorder.begin(desktop.shortcuts[0], null)");
    QTRY_VERIFY(recorder->property("opened").toBool());
    QTest::keyClick(window, Qt::Key_Space, Qt::ControlModifier | Qt::AltModifier);
    QVERIFY(!recorder->property("failure").toString().isEmpty());
    QTest::keyClick(window, Qt::Key_J, Qt::ControlModifier);
    eval("desktop.reject = true"); QVERIFY(QMetaObject::invokeMethod(recorder, "apply"));
    QVERIFY(!recorder->property("failure").toString().isEmpty()); QVERIFY(recorder->property("opened").toBool());
    QTest::keyClick(window, Qt::Key_L, Qt::ControlModifier); eval("desktop.reject = false");
    QVERIFY(QMetaObject::invokeMethod(recorder, "apply")); QTRY_VERIFY(!recorder->property("opened").toBool());
    QCOMPARE(eval("desktop.calls.length").toInt(), 2);
    for (const auto &mode : {QString("light"), QString("dark")}) for (int width : {640, 820, 1280}) {
        bridge.command("appearance", {{"preset", "glass"}, {"mode", mode}, {"textSize", "large"}}); window->resize(width, width == 640 ? 480 : 640);
        for (const auto &locale : {QString("vi"), QString("en"), QString("ja")}) {
            bridge.command("locale", {{"value", locale}});
            for (const auto &page : {QString("apps"), QString("everywhere"), QString("utilities"), QString("thermal")}) {
                window->setProperty("page", page); QCoreApplication::processEvents();
                auto *view = window->findChild<QQuickItem *>(page == "apps" ? "w3-apps" : page == "thermal" ? "w3-thermal" : "w3-desktop");
                QVERIFY(view && view->width() <= width);
                if (page == "everywhere" || page == "utilities" || page == "thermal")
                    QVERIFY2(view->property("contentWidth").toDouble() <= view->width(), qPrintable(page + ":" + locale));
            }
        }
    }
    QCoreApplication::processEvents(); QCOMPARE(warnings.count(), 0);
}

void WorkbenchBridgeTests::w3MainAppsRoute() {
    QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
    bridge.command("appearance", {{"preset", "glass"}, {"mode", "light"}});
    bridge.command("route", {{"value", "apps"}});
    QQmlApplicationEngine engine; QSignalSpy warnings(&engine, &QQmlEngine::warnings);
    engine.rootContext()->setContextProperty("workbench", &bridge);
    QQmlComponent fakeComponent(&engine);
    fakeComponent.setData(R"(
        import QtQml
        QtObject {
            property var apps: []
            property bool busy: false
            property bool inventoryComplete: true
            property bool operationUnverified: false
            property var errors: []
            property var lastResult: ({})
            property int scans: 0
            signal finished(var result)
            function inventory() { scans++; return true }
            function uninstall(id, authorizeSystem) { throw new Error("Real route must never uninstall in this test") }
        }
    )", QUrl("qrc:/w3-route-service.qml"));
    QScopedPointer<QObject> fake(fakeComponent.create()); QVERIFY2(fake, qPrintable(fakeComponent.errorString()));
    engine.rootContext()->setContextProperty("appUninstall", fake.data());
    engine.load(QUrl("qrc:/qml/Main.qml")); QVERIFY(!engine.rootObjects().isEmpty());
    QTRY_COMPARE(fake->property("scans").toInt(), 1);
    auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(window);
    QVERIFY(visualItem(window->contentItem(), "apps-inventory"));
    QCOMPARE(warnings.count(), 0);
    // Context dependency outlives the route when the engine tears it down.
    delete engine.rootObjects().first();
}

QTEST_MAIN(WorkbenchBridgeTests)
#include "WorkbenchBridgeTests.moc"

// ---- W4 Settings ----
void WorkbenchBridgeTests::w4SettingsPages_data() {
    QTest::addColumn<int>("width"); QTest::addColumn<QString>("mode"); QTest::addColumn<QString>("locale");
    QTest::newRow("1280-light-vi") << 1280 << QString("light") << QString("vi");
    QTest::newRow("1280-dark-en") << 1280 << QString("dark") << QString("en");
    QTest::newRow("820-dark-ja") << 820 << QString("dark") << QString("ja");
    QTest::newRow("640-light-vi") << 640 << QString("light") << QString("vi");
}
void WorkbenchBridgeTests::w4SettingsPages() {
    const auto previousName = QCoreApplication::applicationName();
    const bool previousMode = QStandardPaths::isTestModeEnabled();
    const auto restorePaths = qScopeGuard([previousName,previousMode] { QCoreApplication::setApplicationName(previousName); QStandardPaths::setTestModeEnabled(previousMode); });
    QCoreApplication::setApplicationName("ViezanW4SettingsTest"); QStandardPaths::setTestModeEnabled(true);

    QFETCH(int, width); QFETCH(QString, mode); QFETCH(QString, locale);
    QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
    bridge.command("appearance", {{"preset","glass"},{"mode",mode},{"textSize","large"}});
    bridge.command("locale", {{"value",locale}});
    bridge.command("draft", {{"value","W4 settings draft"}});
    const auto sessions = bridge.state().value("sessions");
    QQmlEngine engine; QSignalSpy warnings(&engine, &QQmlEngine::warnings);
    engine.rootContext()->setContextProperty("workbench", &bridge);
    QQmlComponent component(&engine);
    component.setData(R"(
        import QtQuick
        import QtQuick.Controls
        import "qrc:/qml" as Viezan
        ApplicationWindow {
            visible: true; width: 1280; height: 800
            Viezan.SettingsWorkspace { anchors.fill: parent; anchors.leftMargin: parent.width >= 900 ? 280 : 96; anchors.rightMargin: 24; anchors.topMargin: 56; anchors.bottomMargin: 24; bridge: workbench }
        }
    )", QUrl("qrc:/w4-settings-pages.qml"));
    QScopedPointer<QObject> owner(component.create()); QVERIFY2(owner, qPrintable(component.errorString()));
    auto *window = qobject_cast<QQuickWindow *>(owner.data()); QVERIFY(window);
    window->resize(width, width < 900 ? 640 : 800);
    auto *settings = visualItem(window->contentItem(), "settings-workspace"); QVERIFY(settings);
    QTRY_COMPARE(settings->property("wide").toBool(), width >= 1200);
    const QStringList sections{"general","appearance","providers","localModels","voice","modules","data","updates","about"};
    const QStringList controls{"settings-smart-reset","settings-theme","provider-status-openai","settings-device","settings-voice-rate","settings-module-chat","settings-clear-history","settings-auto-updates",""};
    for (int i = 0; i < sections.size(); ++i) {
        settings->setProperty("activeSection", sections[i]);
        QCoreApplication::processEvents();
        if (!controls[i].isEmpty()) {
            auto *control = visualItem(window->contentItem(), controls[i]); QVERIFY2(control, qPrintable(controls[i]));
            QTRY_VERIFY(control->width() > 0);
            QTRY_VERIFY2(control->mapToScene(QPointF(control->width(),0)).x() <= width, qPrintable(sections[i]));
        }
        if (sections[i] == "localModels") {
            const auto suggestions = bridge.resources().value("localModelSuggestions").toList();
            for (const auto &item : suggestions) QVERIFY(visualItem(window->contentItem(), "settings-suggestion-" + item.toMap().value("id").toString()));
        }
        if (sections[i] == "general") {
            auto *toggle = visualItem(window->contentItem(), "settings-smart-reset");
            toggle->setProperty("checked", false); QVERIFY(QMetaObject::invokeMethod(toggle,"toggled"));
            QCOMPARE(bridge.state().value("smartReset").toBool(), false);
            toggle->setProperty("checked", true); QVERIFY(QMetaObject::invokeMethod(toggle,"toggled"));
            QCOMPARE(bridge.state().value("smartReset").toBool(), true);
        }
        if (sections[i] == "modules") {
            for (const auto &id : {"translate","interpret","dictionary","thermal","apps"}) bridge.command("module", {{"id",id},{"enabled",false}});
            auto *last = visualItem(window->contentItem(),"settings-module-chat"); QVERIFY(last); QTRY_VERIFY(!last->isEnabled());
            for (const auto &id : {"translate","interpret","dictionary","thermal","apps"}) bridge.command("module", {{"id",id},{"enabled",true}});
        }
        if (sections[i] == "voice") {
            bridge.command("voice", {{"provider","gemini"},{"voice","Kore"},{"rate",1.0}});
            auto *rate = visualItem(window->contentItem(),"settings-voice-rate"); QVERIFY(rate); QTRY_VERIFY(!rate->isEnabled());
            bridge.command("voice", {{"provider","system"},{"voice",""},{"rate",1.0}});
            QTRY_VERIFY(rate->isEnabled());
        }
        if (sections[i] == "updates") {
            auto *toggle = visualItem(window->contentItem(), "settings-auto-updates"); QVERIFY(toggle);
            toggle->setProperty("checked", false); QVERIFY(QMetaObject::invokeMethod(toggle,"toggled"));
            QCOMPARE(bridge.autoCheckUpdates(), false);
            toggle->setProperty("checked", true); QVERIFY(QMetaObject::invokeMethod(toggle,"toggled"));
            QCOMPARE(bridge.autoCheckUpdates(), true);
        }
    }
    QCOMPARE(bridge.state().value("sessions"), sessions);
    QCOMPARE(warnings.count(), 0);
}
void WorkbenchBridgeTests::w4SettingsPickerKeyboard() {
    const auto previousName = QCoreApplication::applicationName();
    const bool previousMode = QStandardPaths::isTestModeEnabled();
    const auto restorePaths = qScopeGuard([previousName,previousMode] { QCoreApplication::setApplicationName(previousName); QStandardPaths::setTestModeEnabled(previousMode); });
    QCoreApplication::setApplicationName("ViezanW4SettingsTest"); QStandardPaths::setTestModeEnabled(true);

    QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
    bridge.command("appearance", {{"preset","glass"},{"mode","dark"}});
    QQmlEngine engine; QSignalSpy warnings(&engine,&QQmlEngine::warnings);
    engine.rootContext()->setContextProperty("workbench", &bridge);
    QQmlComponent component(&engine);
    component.setData(R"(
        import QtQuick
        import QtQuick.Controls
        import "qrc:/qml" as Viezan
        ApplicationWindow {
            visible: true; width: 640; height: 480
            Viezan.SettingsPicker { objectName: "w4-picker"; x: 380; y: 380; width: 200; model: Array.from({length:40}, (_,i) => ({label:"Voice " + i, group:i < 20 ? "English" : "日本語"})); textRole: "label"; currentIndex: 0; Accessible.name: "Voice" }
        }
    )", QUrl("qrc:/w4-settings-picker.qml"));
    QScopedPointer<QObject> owner(component.create()); QVERIFY2(owner,qPrintable(component.errorString()));
    auto *window = qobject_cast<QQuickWindow *>(owner.data()); QVERIFY(window);
    auto *picker = visualItem(window->contentItem(),"w4-picker"); QVERIFY(picker);
    QVERIFY(QTest::qWaitForWindowExposed(window));
    auto *popup = picker->property("popup").value<QObject *>(); QVERIFY(popup);
    QVERIFY(QMetaObject::invokeMethod(popup,"open")); QTRY_VERIFY(popup->property("visible").toBool());
    QTRY_VERIFY(popup->property("x").toDouble() >= 0);
    QVERIFY(popup->property("x").toDouble() + popup->property("width").toDouble() <= window->width());
    QVERIFY(popup->property("y").toDouble() >= 0);
    QVERIFY(popup->property("y").toDouble() + popup->property("height").toDouble() <= window->height());
    auto *list = visualItem(window->contentItem(),"w4-picker-list"); QVERIFY(list); QTRY_VERIFY(list->hasActiveFocus());
    for (int i=0; i<39; ++i) QTest::keyClick(window,Qt::Key_Down);
    QCOMPARE(list->property("currentIndex").toInt(),39);
    QVERIFY(list->property("contentY").toDouble() > 0);
    QTest::keyClick(window,Qt::Key_Return);
    QTRY_VERIFY(!popup->property("visible").toBool()); QCOMPARE(picker->property("currentIndex").toInt(),39);
    QTRY_VERIFY(picker->hasActiveFocus());
    QVERIFY(QMetaObject::invokeMethod(popup,"open")); QTRY_VERIFY(popup->property("visible").toBool());
    QTest::keyClick(window,Qt::Key_Up); QTest::keyClick(window,Qt::Key_Escape);
    QTRY_VERIFY(!popup->property("visible").toBool()); QCOMPARE(picker->property("currentIndex").toInt(),39);
    bridge.command("appearance",{{"preset","graphite"}}); QCoreApplication::processEvents();
    bridge.command("appearance",{{"preset","glass"}}); QCoreApplication::processEvents();
    QCOMPARE(warnings.count(),0);
}
void WorkbenchBridgeTests::w4HistoryConfirmation() {
    const auto previousName = QCoreApplication::applicationName();
    const bool previousMode = QStandardPaths::isTestModeEnabled();
    const auto restorePaths = qScopeGuard([previousName,previousMode] { QCoreApplication::setApplicationName(previousName); QStandardPaths::setTestModeEnabled(previousMode); });
    QCoreApplication::setApplicationName("ViezanW4SettingsTest"); QStandardPaths::setTestModeEnabled(true);

    QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
    bridge.command("appearance",{{"preset","glass"},{"mode","light"}});
    bridge.command("draft",{{"value","Only synthetic W4 history"}});
    QQmlEngine engine; QSignalSpy warnings(&engine,&QQmlEngine::warnings);
    engine.rootContext()->setContextProperty("workbench",&bridge);
    QQmlComponent component(&engine);
    component.setData(R"(
        import QtQuick
        import QtQuick.Controls
        import "qrc:/qml" as Viezan
        ApplicationWindow { visible: true; width: 820; height: 640; Viezan.DataSettings { objectName:"w4-data"; width:600; bridge:workbench } }
    )", QUrl("qrc:/w4-data.qml"));
    QScopedPointer<QObject> owner(component.create()); QVERIFY2(owner,qPrintable(component.errorString()));
    auto *window=qobject_cast<QQuickWindow *>(owner.data()); QVERIFY(window);
    auto *clear=visualItem(window->contentItem(),"settings-clear-history"); QVERIFY(clear); QVERIFY(clear->isEnabled());
    auto *dialog=owner->findChild<QObject *>("settings-clear-dialog"); QVERIFY(dialog);
    QVERIFY(QTest::qWaitForWindowExposed(window));
    QSignalSpy accepted(dialog, SIGNAL(accepted()));
    const auto before=bridge.state();
    QVERIFY(QMetaObject::invokeMethod(clear,"clicked")); QTRY_VERIFY(dialog->property("visible").toBool());
    QVERIFY(dialog->property("message").toString().contains(QString::number(bridge.clearableHistoryCount())));
    QTRY_VERIFY(qAbs(dialog->property("x").toDouble() * 2 + dialog->property("width").toDouble() - window->width()) < 2);
    QTRY_VERIFY(qAbs(dialog->property("y").toDouble() * 2 + dialog->property("height").toDouble() - window->height()) < 2);
    QTest::keyClick(window,Qt::Key_Escape); QTRY_VERIFY(!dialog->property("visible").toBool()); QCOMPARE(bridge.state(),before);
    const auto id=current(bridge).value("id");
    bridge.command("submit",{{"sessionID",id}});
    QTRY_VERIFY(!clear->isEnabled());
    bridge.command("cancel",{{"taskID",latest(bridge).value("id")}}); QTRY_VERIFY(clear->isEnabled());
    QVERIFY(QMetaObject::invokeMethod(clear,"clicked")); QTRY_VERIFY(dialog->property("visible").toBool());
    auto *confirm=visualItem(window->contentItem(),"settings-clear-dialog-confirm"); QVERIFY(confirm); QVERIFY(confirm->isEnabled());
    QVERIFY(QMetaObject::invokeMethod(confirm,"clicked"));
    QTRY_VERIFY(!dialog->property("visible").toBool()); QCOMPARE(bridge.clearableHistoryCount(),0);
    QCOMPARE(accepted.count(),1);
    QTRY_VERIFY(!clear->isEnabled()); QVERIFY(WorkbenchDomain::validate(bridge.state()));
    QCOMPARE(warnings.count(),0);
}

void WorkbenchBridgeTests::w4UpdateMetadata() {
    QTemporaryDir dir; WorkbenchBridge bridge(nullptr,dir.filePath("state.json"),false);
    bridge.command("appearance",{{"preset","glass"},{"mode","light"}});
    QQmlEngine engine; QSignalSpy warnings(&engine,&QQmlEngine::warnings);
    engine.rootContext()->setContextProperty("workbench",&bridge);
    QQmlComponent component(&engine);
    component.setData(R"(
        import QtQuick
        import QtQuick.Controls
        import "qrc:/qml" as Viezan
        ApplicationWindow {
            visible:true; width:820; height:640
            QtObject { id: update; objectName:"w4-fake-updates"; property bool busy:true; property string status:"updateDownloading"; property string version:"9.0"; property string notes:"Synthetic release notes"; property bool ready:false; property double progress:0.4; property double packageSize:64000000; property double checkedAt:Date.now()/1000-480; property double remainingSeconds:75 }
            Viezan.UpdateSettings { objectName:"w4-updates"; width:600; bridge:({resources:workbench.resources,state:workbench.state,updates:update,autoCheckUpdates:false,loadBlocked:false}) }
        }
    )",QUrl("qrc:/w4-updates.qml"));
    QScopedPointer<QObject> owner(component.create()); QVERIFY2(owner,qPrintable(component.errorString()));
    auto *window=qobject_cast<QQuickWindow *>(owner.data()); QVERIFY(window);
    auto *fake=owner->findChild<QObject *>("w4-fake-updates"); QVERIFY(fake);
    auto *size=visualItem(window->contentItem(),"settings-update-size"); QVERIFY(size); QVERIFY(size->property("text").toString().contains("64"));
    auto *remaining=visualItem(window->contentItem(),"settings-update-remaining"); QVERIFY(remaining);
    QVERIFY(remaining->isVisible()); QVERIFY(remaining->property("text").toString().contains("2"));
    fake->setProperty("remainingSeconds",30); QTRY_VERIFY(remaining->property("text").toString().contains("30"));
    fake->setProperty("remainingSeconds",-1); QTRY_VERIFY(!remaining->isVisible());
    auto *status=visualItem(window->contentItem(),"settings-update-status"); QVERIFY(status); QVERIFY(status->property("detail").toString().contains("8"));
    fake->setProperty("packageSize",0); QTRY_VERIFY(!size->isVisible());
    QCOMPARE(warnings.count(),0);
}

void WorkbenchBridgeTests::w4SettingsSearchIme() {
    QTemporaryDir dir; WorkbenchBridge bridge(nullptr,dir.filePath("state.json"),false);
    bridge.command("appearance",{{"preset","glass"},{"mode","light"}});
    bridge.command("locale",{{"value","en"}});
    QQmlApplicationEngine engine; QSignalSpy warnings(&engine,&QQmlEngine::warnings);
    engine.rootContext()->setContextProperty("workbench",&bridge);
    engine.load(QUrl("qrc:/qml/Main.qml")); QVERIFY(!engine.rootObjects().isEmpty());
    auto *window=qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(window);
    window->resize(820,640); QVERIFY(QTest::qWaitForWindowExposed(window));
    QVERIFY(QMetaObject::invokeMethod(window,"openSettingsSection",Q_ARG(QVariant,"general")));
    auto *settings=visualItem(window->contentItem(),"settings-workspace"); QVERIFY(settings);
    auto *search=visualItem(window->contentItem(),"settings-header-search"); QVERIFY(search);
    search->forceActiveFocus(); search->setProperty("text","voice");
    QInputMethodEvent preedit(QString::fromUtf8("にほん"),{}); QCoreApplication::sendEvent(search,&preedit);
    QTRY_VERIFY(search->property("inputMethodComposing").toBool());
    QTest::keyClick(window,Qt::Key_Return); QTest::keyClick(window,Qt::Key_Down);
    QCOMPARE(settings->property("activeSection").toString(),QString("general"));
    QCOMPARE(window->property("settingsQuery").toString(),QString("voice"));
    QVERIFY(search->hasActiveFocus());
    QInputMethodEvent finished; finished.setCommitString(""); QCoreApplication::sendEvent(search,&finished);
    QTRY_VERIFY(!search->property("inputMethodComposing").toBool());
    QTest::keyClick(window,Qt::Key_Return);
    QTRY_COMPARE(settings->property("activeSection").toString(),QString("voice"));
    QTRY_COMPARE(window->property("settingsQuery").toString(),QString());
    QCOMPARE(warnings.count(),0);
}

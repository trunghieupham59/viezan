#include "../WorkbenchBridge.h"
#include "../WorkbenchDomain.h"
#include "../HabitSuggestions.h"
#include "../HistoryStorage.h"
#include "../AttachmentImageProvider.h"
#include <QClipboard>
#include <QBuffer>
#include <QAccessible>
#include "../NativeAudio.h"
#include "../ProviderDiscovery.h"
#include <QUuid>
#include "../ImageGeneration.h"
#include "../CloudProtocol.h"
#include "../VoiceGate.h"
#include "../TextLanguage.h"
#include "../LanguageSegments.h"
#include "../ThermalSensors.h"
#include "../LauncherTools.h"
#include "../CurrencyRates.h"
#include <QSettings>
#include "../NativeBackup.h"
#include "../LocalRuntime.h"
#include "../ModelLineup.h"
#include "../ModelCatalog.h"
#include "../NativeUpdates.h"
#include "../Interpretation.h"
#include <QStandardPaths>
#include <QScopeGuard>
#include <QCryptographicHash>
#include <QFile>
#include <QFont>
#include <QInputMethodEvent>
#include <QHoverEvent>
#include <QJsonDocument>
#include <QJSValue>
#include <QDateTime>
#include <QTimeZone>
#include <algorithm>
#include <cmath>
#include <QElapsedTimer>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQmlComponent>
#include <QQmlExpression>
#include <QSignalSpy>
#include <QQuickItem>
#include <QQuickWindow>
#include <QSGRendererInterface>
#include <QPointer>
#include <QProcessEnvironment>
#ifdef Q_OS_WIN
#include <QProcess>
#endif
#include <QTemporaryDir>
#include <QTest>
#include <QTimer>
#include <QTextToSpeechEngine>
#include <QtMath>

static QVariantMap current(const WorkbenchBridge &bridge) {
    const auto state = bridge.state();
    const auto id = state.value("active").toMap().value(state.value("feature").toString());
    for (const auto &value : state.value("sessions").toList()) if (value.toMap().value("id") == id) return value.toMap();
    return {};
}
static QVariantMap latest(const WorkbenchBridge &bridge) { return bridge.state().value("tasks").toList().value(0).toMap(); }

// All three stores (workspace, transcripts and attachments) belong to this one test.
class TemporaryHistoryProfile {
    const QString previousName = QCoreApplication::applicationName();
    const bool previousMode = QStandardPaths::isTestModeEnabled();
    static QString directoryTemplate() {
        QStandardPaths::setTestModeEnabled(true);
        auto parent = QFileInfo(QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation)).dir();
        parent.mkpath(".");
        return parent.filePath("history-XXXXXX");
    }
public:
    QTemporaryDir dir{directoryTemplate()};
    TemporaryHistoryProfile() { QCoreApplication::setApplicationName(QFileInfo(dir.path()).fileName()); }
    ~TemporaryHistoryProfile() {
        QCoreApplication::setApplicationName(previousName);
        QStandardPaths::setTestModeEnabled(previousMode);
    }
    bool valid() const {
        return dir.isValid() && QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation) == dir.path();
    }
};

static QByteArray fileBytes(const QString &path) {
    QFile file(path);
    return file.open(QIODevice::ReadOnly) ? file.readAll() : QByteArray{};
}
static bool writeBytes(const QString &path, const QByteArray &bytes) {
    QFile file(path);
    return file.open(QIODevice::WriteOnly) && file.write(bytes) == bytes.size() && file.flush();
}
static QVariantMap meetingFixture(const QString &id) {
    return {{"id", id}, {"model", "ollama:fixture"}, {"created", 100.0}, {"segments", QVariantList{}}};
}
static QVariantMap attachmentFixture() {
    return {{"id", QUuid::createUuid().toString(QUuid::WithoutBraces)}, {"name", "fixture.png"}, {"mime", "image/png"}};
}
static void chunk(WorkbenchBridge &bridge, const QVariantMap &task, const QString &text) {
    bridge.command("receive", {{"taskID", task.value("id")}, {"attemptID", task.value("attemptID")}, {"chunk", text}});
}
static QQuickItem *visualItem(QQuickItem *item, const QString &name, bool visibleOnly = false) {
    if (visibleOnly && !item->isVisible()) return nullptr;
    if (item->objectName() == name) return item;
    for (auto *child : item->childItems()) if (auto *found = visualItem(child, name, visibleOnly)) return found;
    return nullptr;
}

static QQuickItem *visualText(QQuickItem *item, const QString &text, bool visibleOnly = false) {
    if (visibleOnly && !item->isVisible()) return nullptr;
    if (item->property("text").toString() == text) return item;
    for (auto *child : item->childItems()) if (auto *found = visualText(child, text, visibleOnly)) return found;
    return nullptr;
}

static QVariant qmlValue(QObject *object, const QString &code) {
    QQmlExpression expression(qmlContext(object), object, code);
    const QVariant result = expression.evaluate();
    if (expression.hasError()) qWarning() << expression.error();
    return result;
}

static void checkAccessibleName(QQuickItem *root, const QString &objectName, const QString &name) {
    auto *item = visualItem(root, objectName);
    QVERIFY2(item, qPrintable(objectName));
    QVERIFY(!name.isEmpty());
    QCOMPARE(qmlValue(item, "Accessible.name").toString(), name);
}

static void checkAccessible(QQuickItem *root, const QString &objectName, QAccessible::Role role, const QString &name = {}) {
    auto *item = visualItem(root, objectName);
    QVERIFY2(item, qPrintable(objectName));
    QCOMPARE(qmlValue(item, "Accessible.role").toInt(), int(role));
    if (!name.isEmpty()) QCOMPARE(qmlValue(item, "Accessible.name").toString(), name);
}

// Exercise the actual action without opening an audio device or contacting a speech provider.
static void checkSpeechAction(QQuickItem *button, const QString &text, const QString &language, const QString &sourceID) {
    QVERIFY(button && button->isVisible() && button->isEnabled());
    QQmlComponent component(qmlEngine(button));
    component.setData(R"(
        import QtQml
        QtObject {
            property string lastText: ""
            property string lastLanguage: ""
            property string speakingSource: ""
            readonly property bool speaking: !!speakingSource
            function speak(text, language, id) { lastText = text; lastLanguage = language; speakingSource = id }
            function silence() { speakingSource = "" }
        }
    )", QUrl("qrc:/speech-recorder.qml"));
    QScopedPointer<QObject> audio(component.create());
    QVERIFY2(audio, qPrintable(component.errorString()));
    const auto previous = button->property("audio");
    QVERIFY(button->setProperty("audio", QVariant::fromValue(audio.data())));
    const auto restore = qScopeGuard([&] { button->setProperty("audio", previous); });
    QVERIFY(QMetaObject::invokeMethod(button, "clicked"));
    QCOMPARE(audio->property("lastText").toString(), text);
    QCOMPARE(audio->property("lastLanguage").toString(), language);
    QCOMPARE(audio->property("speakingSource").toString(), sourceID);
    QVERIFY(button->property("checked").toBool());
    QVERIFY(QMetaObject::invokeMethod(button, "clicked"));
    QVERIFY(!audio->property("speaking").toBool());
}

// Both Settings tests use an inert runtime so rendering the component cannot probe Ollama.
static void setLocalSettingsComponent(QQmlComponent &component) {
    component.setData(R"(
            import QtQuick
            import "qrc:/qml" as V
            V.LocalModelSettings {
                bridge: ({modelManager:pullManager, locale:workbench.locale, strings:workbench.strings,
                    state:workbench.state, resources:workbench.resources, metrics:workbench.metrics,
                    palettes:workbench.palettes, appearance:workbench.appearance, shortModelName: id => workbench.shortModelName(id),
                    interpretation:workbench.interpretation, localPerformance:workbench.localPerformance,
                    localModels:workbench.localModels, installedModelSizes:workbench.installedModelSizes,
                    providerState: () => ({models:0}), modelError:"",
                    localRuntime:{refresh: () => {}, version:"", processors:1, memoryBytes:0, error:"", owned:false, available:false}})
            }
        )", QUrl("qrc:/local-settings-test.qml"));
}

// Deliver chunks, completion and cancellation without opening a socket.
class FixtureReply final : public QNetworkReply {
public:
    explicit FixtureReply(QObject *parent) : QNetworkReply(parent) {
        setAttribute(QNetworkRequest::HttpStatusCodeAttribute, 200);
        open(ReadOnly);
        m_data.open(QIODevice::ReadOnly);
    }
    void receive(const QByteArray &bytes) { m_data.buffer().append(bytes); emit readyRead(); }
    void finish() { setFinished(true); emit finished(); }
    void fail(QNetworkReply::NetworkError error) {
        setAttribute(QNetworkRequest::HttpStatusCodeAttribute, {});
        setError(error, "fixture network error");
        finish();
    }
    void abort() override {
        if (isFinished()) return;
        setError(OperationCanceledError, "cancelled");
        finish();
    }
    qint64 bytesAvailable() const override { return m_data.bytesAvailable() + QNetworkReply::bytesAvailable(); }
protected:
    qint64 readData(char *data, qint64 size) override { return m_data.read(data, size); }
private:
    QBuffer m_data;
};

class FixtureNetwork final : public QNetworkAccessManager {
public:
    FixtureReply *reply = nullptr;
    QNetworkRequest lastRequest;
    int requests = 0;
protected:
    QNetworkReply *createRequest(Operation, const QNetworkRequest &request, QIODevice *) override {
        lastRequest = request;
        ++requests;
        reply = new FixtureReply(this);
        return reply;
    }
};

class WorkbenchBridgeTests : public QObject {
    Q_OBJECT
private slots:
    // CTest runs this suite as concurrent shards (tests/RunShard.cmake). The
    // organization name is part of every QStandardPaths and QSettings location,
    // so a per-shard name keeps their files apart, also where a case switches
    // the application name or the test mode.
    void initTestCase() {
        const auto shard = qEnvironmentVariable("VIEZAN_TEST_SHARD");
        if (!shard.isEmpty()) QCoreApplication::setOrganizationName("ViezanQtTests-shard-" + shard);
    }
    void savedAppearanceMigratesToGlass_data() {
        QTest::addColumn<QString>("preset");
        QTest::addColumn<QString>("mode");
        for (const QString preset : {"absent-appearance", "absent-preset", "null", "graphite", "glass", "paper", "corporate", "midnight", "unknown"})
            for (const QString mode : {"light", "dark", "system"})
                QTest::newRow(qPrintable(preset + "-" + mode)) << preset << mode;
    }
    void savedAppearanceMigratesToGlass() {
        QFETCH(QString, preset);
        QFETCH(QString, mode);
        QTemporaryDir dir;
        const auto path = dir.filePath("state.json");
        auto state = WorkbenchDomain::create("chat", "translate");
        QCOMPARE(state.value("appearance").toMap().value("preset").toString(), "glass");
        const bool noAppearance = preset == "absent-appearance";
        if (noAppearance) {
            state.remove("appearance");
        } else {
            QVariantMap appearance{{"mode", mode}, {"textSize", "large"}, {"accent", "teal"}};
            if (preset != "absent-preset") appearance["preset"] = preset == "null" ? QVariant() : QVariant(preset);
            state["appearance"] = appearance;
        }
        QFile file(path);
        const auto original = QJsonDocument::fromVariant(state).toJson();
        QVERIFY(file.open(QIODevice::WriteOnly));
        QCOMPARE(file.write(original), original.size());
        file.close();
        WorkbenchBridge bridge(nullptr, path, false);
        if (preset == "unknown") {
            QVERIFY(bridge.loadBlocked());
            bridge.save();
            QVERIFY(file.open(QIODevice::ReadOnly));
            QCOMPARE(file.readAll(), original);
            return;
        }
        QVERIFY(!bridge.loadBlocked() && bridge.storageError().isEmpty());
        const auto migrated = bridge.appearance();
        QCOMPARE(migrated.value("preset").toString(), "glass");
        QCOMPARE(migrated.value("mode").toString(), noAppearance ? "system" : preset == "midnight" ? "dark" : mode);
        QCOMPARE(migrated.value("textSize").toString(), noAppearance ? "medium" : "large");
        QCOMPARE(migrated.value("accent").toString(), noAppearance ? "auto" : "teal");
        bridge.command("appearance", {{"preset", "unknown"}, {"mode", "light"}, {"accent", "pink"}});
        bridge.save();
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto saved = QJsonDocument::fromJson(file.readAll()).object();
        QCOMPARE(saved.value("schemaVersion").toInt(), 1);
        const auto appearance = saved.value("appearance").toObject();
        QCOMPARE(appearance.value("preset").toString(), "glass");
        QCOMPARE(appearance.value("mode").toString(), "light");
        QCOMPARE(appearance.value("accent").toString(), "pink");
        QCOMPARE(appearance.value("textSize").toString(), migrated.value("textSize").toString());
    }
    void mainScreenAccessibleNames_data() {
        QTest::addColumn<QString>("locale");
        QTest::addColumn<QString>("screen");
        QTest::addColumn<int>("width");
        for (const QString locale : {"vi", "en", "ja"})
            for (const QString screen : {"shell", "chat", "translate", "dictionary", "interpret", "settings", "launcher"})
                for (int width : {820, 1200})
                    QTest::newRow(qPrintable(locale + "-" + screen + "-" + QString::number(width))) << locale << screen << width;
    }
    void mainScreenAccessibleNames() {
        QFETCH(QString, locale);
        QFETCH(QString, screen);
        QFETCH(int, width);
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("route", {{"value", "chat"}});
        bridge.command("locale", {{"value", locale}});
        bridge.command("appearance", {{"mode", "light"}});
        QCOMPARE(bridge.locale(), locale);
        if (screen == "chat" || screen == "translate" || screen == "dictionary") {
            bridge.command("navigate", {{"feature", screen}});
            bridge.command("draft", {{"value", "bank"}});
            bridge.command("submit");
            const auto task = latest(bridge);
            QVERIFY(!task.isEmpty());
            const QString response = screen == "dictionary"
                ? R"({"headword":"bank","meaning":"river edge","translations":[{"text":"shore","pronunciation":"","examples":["river bank"]}]})"
                : "A fixture response";
            bridge.command("receive", {{"taskID", task.value("id")}, {"attemptID", task.value("attemptID")},
                {"chunk", response}, {"terminal", "succeeded"}});
        }
        QQmlEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        const bool launcher = screen == "launcher";
        QQmlComponent component(&engine, QUrl(launcher ? "qrc:/qml/Launcher.qml" : "qrc:/qml/Main.qml"));
        QVariantMap properties;
        if (launcher) properties.insert("bridge", QVariant::fromValue(&bridge));
        QScopedPointer<QObject> owner(component.createWithInitialProperties(properties));
        QVERIFY2(owner, qPrintable(component.errorString()));
        auto *window = qobject_cast<QQuickWindow *>(owner.data());
        QVERIFY(window);
        if (launcher) {
            // Mount the real results without invoking the desktop application/file search.
            window->show();
        } else {
            window->resize(width, 800);
            if (screen == "shell") {
                QVERIFY(QMetaObject::invokeMethod(window, "execute", Q_ARG(QVariant, "commands"), Q_ARG(QVariant, QVariant())));
            } else {
                QVERIFY(QMetaObject::invokeMethod(window, "selectRoute", Q_ARG(QVariant, screen)));
            }
        }
        const QHash<QString, QString> anchors{{"shell", "command-search"}, {"chat", "chat-text-" + latest(bridge).value("id").toString()},
            {"translate", "source-draft"}, {"dictionary", "dictionary-result"}, {"interpret", "interpret-workspace"},
            {"settings", "settings-language"}, {"launcher", "launcher-result-ai"}};
        QTRY_VERIFY(visualItem(window->contentItem(), anchors.value(screen), true));
        // Qt 6.8 populates implicit button names when existing controls receive
        // the activation notification. Exercise the same path on offscreen QPA.
        const bool active = QAccessible::isActive();
        QAccessible::setActive(true);
        const auto restoreAccessibility = qScopeGuard([active] { QAccessible::setActive(active); });
        const auto label = [&](const char *key) { return bridge.strings().value(key).toString(); };
        if (screen == "shell") {
            checkAccessible(window->contentItem(), "command-list", QAccessible::List, label("commands"));
        } else if (screen == "chat") {
            checkAccessible(window->contentItem(), "chat-message-list", QAccessible::List, label("chat"));
        } else if (screen == "translate") {
            checkAccessible(window->contentItem(), "translation-source-pane", QAccessible::Grouping, label("source"));
            checkAccessible(window->contentItem(), "translation-result-pane", QAccessible::Grouping, label("result"));
        }
        QStringList missing;
        int controls = 0;
        const auto visit = [&](auto &&self, QQuickItem *item, QString path) -> void {
            if (!item->isVisible()) return;
            auto *parent = item->parentItem();
            // Fusion renders the current value of a non-editable combo with a
            // disabled internal TextField. The combo owns the accessible control.
            if (parent && parent->inherits("QQuickComboBox") && !parent->property("editable").toBool()
                && parent->property("contentItem").value<QQuickItem *>() == item) return;
            if (!item->objectName().isEmpty()) path += "/" + item->objectName();
            // Select by control type as well as by AX actions: losing the role or
            // marking a button ignored must still fail the test.
            auto *ax = QAccessible::queryAccessibleInterface(item);
            const bool buttonOrField = item->inherits("QQuickAbstractButton") || item->inherits("QQuickComboBox")
                || item->inherits("QQuickTextInput") || item->inherits("QQuickTextEdit")
                || item->inherits("QQuickSlider") || item->inherits("QQuickSpinBox");
            const bool scrollBar = item->inherits("QQuickScrollBar") && item->property("interactive").toBool()
                && item->property("policy").toInt() != Qt::ScrollBarAlwaysOff && item->property("size").toDouble() < 1;
            if (buttonOrField || scrollBar || (ax && ax->actionInterface() &&
                    ax->actionInterface()->actionNames().contains(QAccessibleActionInterface::pressAction()))) {
                ++controls;
                if (!ax || ax->text(QAccessible::Name).trimmed().isEmpty())
                    missing << path + " (" + item->metaObject()->className() + ")";
            }
            for (auto *child : item->childItems()) self(self, child, path);
        };
        visit(visit, window->contentItem(), screen);
        QVERIFY(controls > 1);
        QVERIFY2(missing.isEmpty(), qPrintable(missing.join("\n")));
    }
    void regionSelectionWithKeyboard() {
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(
            import QtQuick
            import "qrc:/qml" as V
            V.RegionCapture {
                width: 200; height: 100
                bridge: QtObject {
                    property var strings: ({captureRegionHint:"Select a region"})
                    property var metrics: ({selectionOpacity:0.1, hairline:1})
                    signal captureReady(string image, int x, int y, int width, int height)
                    signal captureFinished()
                    property rect accepted
                    property bool cancelled: false
                    function finishCapture(x, y, w, h) { accepted = Qt.rect(x, y, w, h) }
                    function cancelCapture() { cancelled = true }
                }
            }
        )", QUrl("qrc:/capture-keyboard-fixture.qml"));
        QScopedPointer<QObject> owner(component.create());
        QVERIFY2(owner, qPrintable(component.errorString()));
        auto *window = qobject_cast<QQuickWindow *>(owner.data());
        QVERIFY(window);
        auto *fixture = window->property("bridge").value<QObject *>();
        QVERIFY(fixture);
        window->show();
        window->requestActivate();
        QVERIFY(QTest::qWaitForWindowActive(window));
        QTest::keyClick(window, Qt::Key_Right);
        QTest::keyClick(window, Qt::Key_Up, Qt::ShiftModifier);
        QCOMPARE(window->property("selection").toRectF(), QRectF(51, 25, 100, 49));
        QTest::keyClick(window, Qt::Key_Space);
        QCOMPARE(fixture->property("accepted").toRectF(), QRectF(.255, .25, .5, .49));
        QTest::keyClick(window, Qt::Key_Return);
        QCOMPARE(fixture->property("accepted").toRectF(), QRectF(0, 0, 1, 1));
        QTest::keyClick(window, Qt::Key_Escape);
        QVERIFY(fixture->property("cancelled").toBool());
    }
    void glassDisabledControlRim() {
        QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("appearance", {{"mode", "light"}});
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
            bridge.command("appearance", {{"mode", mode}});
            surface->setProperty("inactive", disabled); QCoreApplication::processEvents();
            QCOMPARE(reflection->isVisible(), !disabled && mode == "light");
            QCOMPARE(rim->isVisible(), disabled || mode == "dark");
            QVERIFY(rim->property("color").value<QColor>().alpha() == 0);
        }
        QCOMPARE(warnings.count(), 0);
    }
    void glassControlStates() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        QQmlEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        QQmlComponent flags(&engine);
        flags.setData("import QtQml; QtObject { property bool reduceTransparency: false; property bool highContrast: false; property bool reduceMotion: false }", QUrl("qrc:/flags.qml"));
        QScopedPointer<QObject> appearance(flags.create());
        QVERIFY(appearance);
        engine.rootContext()->setContextProperty("systemAppearance", appearance.data());
        QQmlComponent component(&engine);
        component.setData(R"(
            import QtQuick
            import QtQuick.Controls
            import "qrc:/qml" as V
            ApplicationWindow {
                visible: true; width: 420; height: 320
                palette.disabled.buttonText: "slategray"
                Column {
                    V.Kit.GlassSwitch { objectName: "switch" }
                    V.Kit.StatusBadge { objectName: "badge"; text: "Status" }
                    V.Kit.IconButton { objectName: "icon"; iconName: "close" }
                    V.Kit.PrimaryButton { objectName: "primary"; text: "Primary"; shortcutText: "F4" }
                    V.Kit.QuietButton { objectName: "quiet"; text: "Quiet" }
                    V.Kit.PanelRow { objectName: "row"; text: "Row"; iconName: "close"; detail: "Detail"; disclosure: true; selected: true }
                    V.SettingsDangerButton { objectName: "danger-button"; text: "Remove" }
                    V.Kit.FilterButton { objectName: "filter"; checked: true; text: "All" }
                }
            }
        )", QUrl("qrc:/qml/kit-states.qml"));
        QScopedPointer<QObject> owner(component.create());
        QVERIFY2(owner, qPrintable(component.errorString()));
        auto *window = qobject_cast<QQuickWindow *>(owner.data());
        QVERIFY(window && QTest::qWaitForWindowExposed(window));
        auto find = [&](const QString &name) { return visualItem(window->contentItem(), name); };
        auto *toggle = find("switch");
        auto *track = find("glass-switch-track");
        auto *badge = find("badge");
        auto *quiet = find("quiet");
        auto *thumb = find("glass-switch-thumb");
        QVERIFY(toggle && track && thumb && badge && quiet);
        appearance->setProperty("reduceMotion", true);
        const qreal left = thumb->x();
        toggle->setProperty("checked", true);
        QCOMPARE(thumb->x(), track->width() - thumb->width() - left);
        toggle->setProperty("checked", false);
        QCOMPARE(thumb->x(), left);
        appearance->setProperty("reduceMotion", false);
        for (const auto &mode : {QString("light"), QString("dark")}) {
            bridge.command("appearance", {{"mode", mode}});
            const auto colors = bridge.palettes().value(mode).toMap();
            toggle->setProperty("checked", true);
            QCOMPARE(track->property("color").value<QColor>(), QColor(colors.value("action").toString()));
            toggle->setEnabled(false);
            QCOMPARE(track->opacity(), bridge.metrics().value("disabledOpacity").toDouble());
            QCOMPARE(track->property("color"), qmlValue(toggle, "palette.disabled.button"));
            toggle->setEnabled(true);
            toggle->forceActiveFocus(Qt::TabFocusReason);
            auto *focusRing = find("glass-switch-focus");
            QVERIFY(focusRing && focusRing->isVisible());
            QCOMPARE(qmlValue(focusRing, "border.width").toInt(), bridge.metrics().value("focusRingWidth").toInt());
            QVERIFY(focusRing->width() > track->width() && focusRing->height() > track->height());
            QVERIFY(qmlValue(focusRing, "border.color") != track->property("color"));
            find("quiet")->forceActiveFocus(Qt::TabFocusReason);
            QVERIFY(!focusRing->isVisible());
            toggle->setProperty("checked", false);
            QCOMPARE(track->property("color"), qmlValue(toggle, "Qt.alpha(colors['text-disabled'], metrics.disabledOpacity)"));
            appearance->setProperty("reduceTransparency", true);
            QCOMPARE(track->property("color"), qmlValue(toggle, "appearance.control"));
            QCOMPARE(qmlValue(track, "border.color"), qmlValue(toggle, "appearance.edge"));
            QCOMPARE(track->property("color").value<QColor>().alpha(), 255);
            appearance->setProperty("reduceTransparency", false);
            auto *label = visualText(badge->property("contentItem").value<QQuickItem *>(), "Status");
            QVERIFY(label);
            QCOMPARE(qmlValue(label, "font.weight").toInt(), int(QFont::Medium));
            QCOMPARE(qmlValue(label, "font.pointSize").toReal(), qmlValue(badge, "Qt.application.font.pointSize * metrics.smallScale").toReal());
            for (const auto &tone : {"success", "warning", "danger"}) {
                badge->setProperty("tone", tone);
                QCOMPARE(label->property("color").value<QColor>(), QColor(colors.value(tone).toString()));
                QCOMPARE(qmlValue(badge, "Accessible.name").toString(), QString("Status"));
            }
            badge->setProperty("tone", "busy");
            appearance->setProperty("highContrast", true);
            QCOMPARE(qmlValue(badge, "background.color").value<QColor>().alpha(), 255);
            appearance->setProperty("highContrast", false);
            const auto originalFont = label->property("font");
            auto largeFont = originalFont.value<QFont>();
            largeFont.setPointSize(32);
            label->setProperty("font", largeFont);
            QTRY_VERIFY(badge->implicitHeight() >= label->implicitHeight());
            label->setProperty("font", originalFont);
            badge->setProperty("tone", "ready");
            QCOMPARE(label->property("color"), qmlValue(badge, "palette.highlight"));
            badge->setProperty("idle", true);
            QCOMPARE(label->property("color"), qmlValue(badge, "palette.placeholderText"));
            badge->setProperty("idle", false);
            QCOMPARE(qmlValue(quiet, "background.radius").toReal(), quiet->height() / 2);
            QVERIFY(qmlValue(quiet, "background.visible").toBool());
            for (const auto &name : {"primary", "quiet", "icon"}) {
                auto *button = find(name); QVERIFY(button);
                button->forceActiveFocus(Qt::TabFocusReason);
                QTRY_VERIFY(button->property("visualFocus").toBool());
                if (button != find("icon")) QCOMPARE(qmlValue(button, "background.border.width").toInt(), 2);
                button->setEnabled(false);
                const auto disabled = qmlValue(button, "palette.disabled.buttonText");
                QCOMPARE(qmlValue(button, "icon.color"), disabled);
                if (button != find("icon")) {
                    auto *caption = visualText(button->property("contentItem").value<QQuickItem *>(), button->property("text").toString());
                    QVERIFY(caption);
                    QCOMPARE(caption->property("color"), disabled);
                }
                button->setEnabled(true);
            }
            auto *danger = find("danger-button"); QVERIFY(danger);
            danger->setEnabled(false);
            QCOMPARE(qmlValue(danger, "icon.color"), qmlValue(danger, "palette.disabled.buttonText"));
            auto *filter = find("filter"); QVERIFY(filter);
            filter->forceActiveFocus(Qt::TabFocusReason);
            auto *ring = visualItem(filter, "checked-filter-focus"); QVERIFY(ring && ring->isVisible());
            QCOMPARE(qmlValue(ring, "border.width").toInt(), 2);
            filter->setEnabled(false);
            QCOMPARE(qmlValue(filter, "palette.buttonText"), qmlValue(filter, "palette.disabled.buttonText"));
            filter->setEnabled(true);
            auto *row = find("row"); QVERIFY(row);
            row->forceActiveFocus(Qt::TabFocusReason);
            QCOMPARE(qmlValue(row, "background.children[1].border.width").toInt(), 2);
            row->setEnabled(false);
            for (auto *child : row->property("contentItem").value<QQuickItem *>()->childItems()) {
                if (child->isVisible()) QCOMPARE(child->property("color"), qmlValue(row, "palette.disabled.buttonText"));
            }
            row->setEnabled(true);
        }
        QCOMPARE(warnings.count(), 0);
    }
    void providerStatusTones() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        QQmlEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        QQmlComponent component(&engine);
        component.setData(R"(
            import QtQuick
            import QtQuick.Controls
            import "qrc:/qml" as V
            ApplicationWindow {
                visible: true; width: 800; height: 640
                QtObject {
                    id: service
                    objectName: "provider-fixture"
                    property var strings: workbench.strings
                    property var metrics: workbench.metrics
                    property var appearance: workbench.appearance
                    property var palettes: workbench.palettes
                    property var localModels: []
                    property bool discovering: false
                    property bool credentialBusy: false
                    property string credentialStatus: ""
                    property var entry: ({keyed: false, models: -1, failure: ""})
                    signal changed()
                    function providerState(id) { return entry }
                }
                V.ProviderSettings { bridge: service; width: parent.width }
            }
        )", QUrl("qrc:/qml/provider-states-test.qml"));
        QScopedPointer<QObject> owner(component.create());
        QVERIFY2(owner, qPrintable(component.errorString()));
        auto *window = qobject_cast<QQuickWindow *>(owner.data()); QVERIFY(window);
        auto *service = owner->findChild<QObject *>("provider-fixture"); QVERIFY(service);
        auto *dot = visualItem(window->contentItem(), "provider-dot-openai");
        auto *row = visualItem(window->contentItem(), "provider-status-openai");
        QVERIFY(dot && row);
        auto verify = [&](bool keyed, int count, const QString &failure, const QString &tone, const QString &labelKey) {
            service->setProperty("entry", QVariantMap{{"keyed", keyed}, {"models", count}, {"failure", failure}});
            QCOMPARE(dot->property("tone").toString(), tone);
            QVERIFY(row->property("detail").toString().contains(bridge.strings().value(labelKey).toString()));
        };
        verify(false, -1, {}, "idle", "keyAbsent");
        verify(true, -1, {}, "warning", "keyUnverified");
        verify(true, -1, "providerNetworkError", "danger", "providerNetworkError");
        verify(true, 2, {}, "success", "keyPresent");
        service->setProperty("credentialStatus", "keyStorageError");
        checkAccessible(window->contentItem(), "key-status", QAccessible::AlertMessage);
        service->setProperty("credentialStatus", "keySaved");
        checkAccessible(window->contentItem(), "key-status", QAccessible::StaticText);
        QCOMPARE(warnings.count(), 0);
    }
    // Glass primitives keep their board geometry on every control style;
    // FluentWinUI3 otherwise insets the card frame and paints the OS accent.
    void glassKitPrimitivesFitTheControlStyle() {
        QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("appearance", {{"mode", "light"}});
        QQmlEngine engine; QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        QQmlComponent component(&engine);
        component.setData(R"(
            import QtQuick
            import QtQuick.Controls
            import "qrc:/qml" as Viezan
            Item {
                width: 600; height: 320
                Viezan.Kit.CardBox { objectName: "test-box"; title: "Title"; width: 300; Label { text: "Row" } }
                Viezan.Kit.FilterGroup {
                    objectName: "test-filters"; y: 160
                    Viezan.Kit.FilterButton { text: "All" }
                    Viezan.Kit.FilterButton { text: "Chat" }
                }
                Viezan.Kit.GlassSwitch { objectName: "test-switch"; y: 240; checked: true }
            }
        )", QUrl("qrc:/glass-kit-test.qml"));
        QScopedPointer<QObject> owner(component.create()); QVERIFY2(owner, qPrintable(component.errorString()));
        auto *root = qobject_cast<QQuickItem *>(owner.data()); QVERIFY(root);
        QCoreApplication::processEvents();
        auto *box = visualItem(root, "test-box"); QVERIFY(box);
        auto *frame = box->property("background").value<QQuickItem *>(); QVERIFY(frame);
        QCOMPARE(frame->y(), 0.0);
        QCOMPARE(frame->height(), box->height());
        auto *filters = visualItem(root, "test-filters"); QVERIFY(filters);
        QVERIFY(filters->width() > 0);
        QCOMPARE(filters->width(), filters->property("contentWidth").toReal() + filters->property("leftPadding").toReal() + filters->property("rightPadding").toReal());
        auto *toggle = visualItem(root, "test-switch"); QVERIFY(toggle);
        auto *track = visualItem(root, "glass-switch-track"); QVERIFY(track && track->isVisible());
        QCOMPARE(toggle->property("indicator").value<QQuickItem *>()->opacity(), 0.0);
        QCOMPARE(track->property("color").value<QColor>(), QColor(bridge.palettes().value("light").toMap().value("action").toString()));
        toggle->setProperty("checked", false);
        QVERIFY(track->property("color").value<QColor>().alpha() < 255);
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
        bridge.command("appearance", {{"mode", "light"}});
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
                }
                Viezan.Kit.ControlGlassSurface {
                    objectName: "test-control"
                    x: 240; y: 64; width: 120; height: 40
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
        for (const auto &mode : {QString("light"), QString("dark")}) {
            const auto before = frames.count();
            bridge.command("appearance", {{"mode", mode}});
            window->update();
            QTRY_VERIFY(frames.count() > before);
            QVERIFY(paneShadow->property("source").value<QObject *>() != nullptr);
            QVERIFY(controlShadow->property("source").value<QObject *>() != nullptr);
            QVERIFY(paneShadow->isVisible());
            QVERIFY(controlShadow->isVisible());
            QCOMPARE(paneShadow->size(), pane->size());
            QCOMPARE(controlShadow->size(), control->size());
            control->setProperty("inactive", true); window->update();
            QTRY_VERIFY(!visualItem(control, "glass-control-reflections")->isVisible());
            QVERIFY(visualItem(control, "glass-control-quiet-rim")->isVisible());
            control->setProperty("inactive", false);
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
        for (const auto &mode : {QString("light"), QString("dark")}) {
            const auto before = shellFrames.count();
            bridge.command("appearance", {{"mode", mode}});
            root->update();
            QTRY_VERIFY(shellFrames.count() > before);
        }
        root->close();
        QCOMPARE(warnings.count(), 0);
    }
    void platformShellGeometryAndShortcuts() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("locale", {{"value", "vi"}});
        bridge.command("appearance", {{"mode", "light"}});
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
        for (const auto *provider : {"system", "edge", "openai"}) QVERIFY(NativeAudio::rateSupported(provider));
        for (const auto *provider : {"gemini", "elevenlabs"}) QVERIFY(!NativeAudio::rateSupported(provider));
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
        QVariantMap record{{"id", id}, {"name", "a.png"}, {"mime", "image/png"},
                           {"data", QString::fromLatin1(bytes.toBase64())}, {"sha256", sha(bytes)}};
        const auto preview = [&] {
            const QVariantMap backup{{"format", "viezan-native-backup"}, {"version", 1},
                                     {"workspace", QString::fromLatin1(snapshot.toBase64())}, {"sha256", sha(snapshot)},
                                     {"attachments", QVariantList{record}}};
            return NativeBackup::preview(QJsonDocument::fromVariant(backup).toJson());
        };
        const auto legacy = preview();
        QVERIFY(legacy.valid);
        QCOMPARE(legacy.sessions.first().toMap().value("images").toList().first().toMap(), image);
        record.insert(image);
        QVERIFY(preview().valid);
        record["name"] = "different.png";
        QVERIFY(!preview().valid);
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
        QCOMPARE(shortName("openai:gpt-6.1-sol"), QString("GPT-6.1 Sol"));
        QCOMPARE(shortName("claude:claude-opus-6-sol"), QString("Opus 6 Sol"));
        const QStringList codenamed{"openai:gpt-6-astra", "openai:gpt-5.5", "openai:gpt-5.5-pro",
                                    "openai:gpt-5.5-mini", "openai:gpt-5.4-nano", "openai:o3"};
        QCOMPARE(featured(codenamed), (QStringList{"openai:gpt-5.5-pro", "openai:gpt-6-astra", "openai:gpt-5.5-mini", "openai:gpt-5.4-nano"}));
        QCOMPARE(tiers("openai:gpt-6-astra", codenamed).value("balanced").toString(), QString("openai:gpt-6-astra"));
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
        const QString haiku = "claude:claude-haiku-5-5", sonnet = "claude:claude-sonnet-5-5", missing = "openai:gpt-7";
        const auto pinned = sections("", tierMap, {haiku, sonnet}, listings, cloud, local, {haiku, missing});
        QCOMPARE(keys(pinned), (QStringList{"purpose", "pinned", "recent", "openai", "claude", "gemini", "local"}));
        auto models = [](const QVariant &section) {
            QStringList ids;
            for (const auto &row : section.toMap().value("rows").toList()) ids.append(row.toMap().value("model").toString());
            return ids;
        };
        QCOMPARE(models(pinned.at(1)), (QStringList{haiku, missing}));
        QCOMPARE(models(pinned.at(2)), QStringList{sonnet});
        QCOMPARE(models(sections("", tierMap, {}, listings, cloud, local, {"openai:gpt-5.5"}).at(1)), QStringList{"openai:gpt-5.5"});
        QCOMPARE(keys(sections("mini", tierMap, {}, listings, cloud, local, {haiku})), QStringList{"openai"});
        QCOMPARE(recent({"ollama:d", "gemini:c", "ollama:d", "openai:whisper-1", "claude:a", "openai:b"}), (QStringList{"ollama:d", "gemini:c", "claude:a"}));
    }
    void pinnedModelsPersistAndRejectInvalidState() {
        QTemporaryDir dir;
        const auto path = dir.filePath("state.json");
        const QString first = "openai:gpt-5.5", second = "claude:claude-sonnet-5-5";
        {
            WorkbenchBridge bridge(nullptr, path, false);
            QVERIFY(!bridge.state().contains("pinnedModels"));
            bridge.command("togglePinnedModel", {{"value", "invalid"}});
            QVERIFY(!bridge.state().contains("pinnedModels"));
            bridge.command("togglePinnedModel", {{"value", first}});
            bridge.command("togglePinnedModel", {{"value", second}});
        }
        WorkbenchBridge restored(nullptr, path, false);
        auto pins = [&] { return restored.state().value("pinnedModels").toStringList(); };
        QCOMPARE(pins(), (QStringList{first, second}));
        restored.command("togglePinnedModel", {{"value", first}});
        QCOMPARE(pins(), QStringList{second});
        restored.command("togglePinnedModel", {{"value", second}});
        QVERIFY(!restored.state().contains("pinnedModels"));
        QStringList attempts;
        for (int i = 0; i < 10; ++i) {
            attempts << "openai:gpt-" + QString::number(i);
            restored.command("togglePinnedModel", {{"value", attempts.last()}});
        }
        QCOMPARE(pins(), attempts.mid(0, 8));
        QVERIFY(!restored.canPinModel(attempts.last()));
        QVERIFY(restored.canPinModel(attempts.first()));
        restored.command("togglePinnedModel", {{"value", attempts.first()}});
        QCOMPARE(pins(), attempts.mid(1, 7));
        auto state = restored.state();
        QVERIFY(WorkbenchDomain::validate(state));
        for (const auto &bad : QVariantList{QVariant(QStringList{first, first}), QStringList{"x"}, attempts, QVariantList{42}, first}) {
            state["pinnedModels"] = bad;
            QVERIFY(!WorkbenchDomain::validate(state));
        }
        const auto corrupt = QJsonDocument::fromVariant(state).toJson();
        QFile file(dir.filePath("corrupt.json")); QVERIFY(file.open(QIODevice::WriteOnly));
        QCOMPARE(file.write(corrupt), corrupt.size()); file.close();
        WorkbenchBridge blocked(nullptr, file.fileName(), false);
        QVERIFY(blocked.loadBlocked());
        QSignalSpy changes(&blocked, &WorkbenchBridge::changed);
        blocked.command("togglePinnedModel", {{"value", first}});
        QVERIFY(!blocked.state().contains("pinnedModels"));
        QCOMPARE(changes.count(), 0);
        QVERIFY(file.open(QIODevice::ReadOnly)); QCOMPARE(file.readAll(), corrupt);
    }

    void catalogBindingsIgnoreDraftsAndChunks_data() {
        QTest::addColumn<QString>("route");
        QTest::addColumn<bool>("measureHabits");
        QTest::newRow("home-habits") << QString("home") << true;
        QTest::newRow("chat-habits") << QString("chat") << true;
        QTest::newRow("chat-models") << QString("chat") << false;
    }
    void catalogBindingsIgnoreDraftsAndChunks() {
        QFETCH(QString, route);
        QFETCH(bool, measureHabits);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("route", {{"value", route}});
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(window);
        auto *panel = window->findChild<QObject *>("model-lineup-panel");
        QObject *host = measureHabits ? visualItem(window->contentItem(), "habit-chips") : panel ? panel->parent() : nullptr;
        QVERIFY(host && host->property("bridge").isValid());

        // Wrap only this component's bridge. The counter is plain JS so reading it
        // inside a binding cannot subscribe the binding to its own increments.
        const auto count = engine.newObject();
        engine.rootContext()->setContextProperty("calls", QVariant::fromValue(count));
        qmlValue(host, R"(bridge = new Proxy(workbench, {get(target, key) {
            if (key === "modelSections" || key === "habitSuggestions") return (...args) => {
                calls[key] = (calls[key] || 0) + 1
                return target[key](...args)
            }
            return target[key]
        }}))");
        const auto method = measureHabits ? "habitSuggestions" : "modelSections";
        const auto calls = [&] { return count.property(method).toInt(); };
        const int initial = calls();
        if (measureHabits) QVERIFY(initial > 0);
        // Pins and provider discovery affect only the model catalog.
        bridge.command("togglePinnedModel", {{"value", "ollama:pinned"}});
        bridge.applyProviderSnapshot({});
        QCOMPARE(calls(), initial);
        for (int i = 1; i <= 4; ++i) bridge.command("draft", {{"value", QString(i, 'a')}});
        QCOMPARE(calls() - initial, 0);
        if (!measureHabits) {
            QCOMPARE(initial, 0);
            auto *opener = window->property("modelControl").value<QQuickItem *>();
            QVERIFY(opener && QMetaObject::invokeMethod(opener, "clicked"));
            QTRY_VERIFY(panel->property("opened").toBool());
            QVERIFY(calls() > 0);
        }
        // Keep the visible chat empty while a background chat streams.
        const auto background = bridge.createDetachedSession("chat", "Other question");
        bridge.command("submit", {{"sessionID", background}});
        const auto task = latest(bridge);
        QCOMPARE(task.value("request").toMap().value("sessionID").toString(), background);
        const int submitted = calls();
        for (int i = 0; i < 3; ++i) {
            QSignalSpy published(&bridge, &WorkbenchBridge::changed);
            chunk(bridge, task, "a");
            QVERIFY(published.count() || published.wait());
        }
        QCOMPARE(calls() - submitted, 0);
        if (measureHabits) {
            // A translation becomes eligible on completion, even when all text
            // arrived in earlier chunks and the terminal event has no text.
            const auto translation = bridge.createDetachedSession("translate", "Source");
            bridge.command("submit", {{"sessionID", translation}});
            const auto translating = latest(bridge);
            const int translatingCalls = calls();
            chunk(bridge, translating, "Result");
            QCOMPARE(calls(), translatingCalls);
            bridge.command("receive", {{"taskID", translating.value("id")}, {"attemptID", translating.value("attemptID")}, {"terminal", "succeeded"}});
            QVERIFY(calls() > translatingCalls);
            const int completed = calls();
            bridge.command("draft", {{"sessionID", translation}, {"value", "Replacement"}});
            QVERIFY(calls() > completed);
            const int cleared = calls();
            bridge.command("draft", {{"sessionID", translation}, {"value", "Replacement!"}});
            QCOMPARE(calls(), cleared);
        } else {
            panel->setProperty("query", "typed");
            QVERIFY(calls() > submitted);
            QVERIFY(QMetaObject::invokeMethod(panel, "close"));
        }
        QCOMPARE(warnings.count(), 0);
    }

    void modelPinsAndPanelShortcuts_data() {
        QTest::addColumn<QString>("mode");
        QTest::newRow("light") << QString("light");
        QTest::newRow("dark") << QString("dark");
    }
    void modelPinsAndPanelShortcuts() {
        QFETCH(QString, mode);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("route", {{"value", "chat"}});
        bridge.command("appearance", {{"mode", mode}});
        bridge.command("locale", {{"value", "vi"}});
        ProviderDiscovery::Snapshot snapshot;
        snapshot.models["ollama"] = {"ollama:alpha", "ollama:beta"};
        bridge.applyProviderSnapshot(snapshot);
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(window);
        window->resize(1280, 800); window->requestActivate(); QTRY_VERIFY(window->isActive());
        auto shortcut = [window](Qt::Key key) { QTest::keyClick(window, key, Qt::ControlModifier | Qt::ShiftModifier); };
        auto *panel = window->findChild<QObject *>("model-lineup-panel");
        auto *tools = window->findChild<QObject *>("chat-tools-panel"); QVERIFY(panel && tools);
        auto *opener = window->property("modelControl").value<QQuickItem *>(); QVERIFY(opener);
        shortcut(Qt::Key_M); QTRY_VERIFY(panel->property("visible").toBool());
        auto *search = visualItem(window->contentItem(), "model-lineup-search"); QVERIFY(search);
        QTRY_VERIFY(search->hasActiveFocus());
        search->setProperty("text", "alpha");
        auto pins = [&] { return bridge.state().value("pinnedModels").toStringList(); };
        auto pressPin = [window] { QTest::keyClick(window, Qt::Key_P, Qt::ControlModifier); };
        pressPin(); QTRY_COMPARE(pins(), QStringList{"ollama:alpha"});
        auto *pin = visualItem(window->contentItem(), "model-pin-0", true); QVERIFY(pin);
        for (const auto &locale : {"vi", "en", "ja"}) {
            bridge.command("locale", {{"value", locale}});
            pin = visualItem(window->contentItem(), "model-pin-0", true); QVERIFY(pin);
            QCOMPARE(qmlValue(pin, "Accessible.name").toString(), bridge.strings().value("unpinModelNamed").toString().replace("{name}", "alpha"));
        }
        QTest::mouseClick(window, Qt::LeftButton, Qt::NoModifier, pin->mapToScene(pin->boundingRect().center()).toPoint());
        QTRY_VERIFY(pins().isEmpty());
        pressPin(); QTRY_COMPARE(pins().size(), 1);
        search->setProperty("text", "");
        const auto rows = panel->property("rows").value<QJSValue>().toVariant().toList();
        QCOMPARE(rows.first().toMap().value("section").toString(), QString("pinned"));
        for (int i = 1; i < rows.size(); ++i) {
            QTest::keyClick(window, Qt::Key_Down);
            QCOMPARE(panel->property("selectedIndex").toInt(), i);
        }
        QCOMPARE(rows.last().toMap().value("model").toString(), QString("ollama:beta"));
        QTest::keyClick(window, Qt::Key_Up);
        const auto providerIndex = panel->property("selectedIndex").toInt();
        QCOMPARE(rows.at(providerIndex).toMap().value("model").toString(), QString("ollama:alpha"));
        auto *row = visualItem(window->contentItem(), "model-lineup-row-" + QString::number(providerIndex), true); QVERIFY(row);
        QTest::mouseClick(window, Qt::RightButton, Qt::NoModifier, row->mapToScene(row->boundingRect().center()).toPoint());
        auto *menu = window->findChild<QObject *>("model-pin-menu"); QVERIFY(menu);
        QTRY_VERIFY(menu->property("visible").toBool());
        QVERIFY(qmlValue(menu, "popupType === Popup.Item").toBool());
        QTest::keyClick(window, Qt::Key_Escape);
        QTRY_VERIFY(!menu->property("visible").toBool());
        QVERIFY(panel->property("visible").toBool());
        QTRY_VERIFY(search->hasActiveFocus());
        QTest::mouseClick(window, Qt::RightButton, Qt::NoModifier, row->mapToScene(row->boundingRect().center()).toPoint());
        QTRY_VERIFY(menu->property("visible").toBool());
        QTest::keyClick(window, Qt::Key_Down); QTest::keyClick(window, Qt::Key_Return);
        QTRY_VERIFY(pins().isEmpty());
        search->setProperty("text", "alpha");
        row = visualItem(window->contentItem(), "model-lineup-row-0", true); QVERIFY(row);
        QTest::mouseClick(window, Qt::RightButton, Qt::NoModifier, row->mapToScene(row->boundingRect().center()).toPoint());
        QTRY_VERIFY(menu->property("visible").toBool());
        bridge.command("new");
        QTRY_VERIFY(!panel->property("visible").toBool());
        QVERIFY(!menu->property("visible").toBool());
        shortcut(Qt::Key_M); QTRY_VERIFY(panel->property("opened").toBool());
        QTRY_VERIFY(search->hasActiveFocus());
        // A typed pin remains selectable after discovery drops it.
        search->setProperty("text", "openai:gpt-missing"); pressPin();
        QTRY_COMPARE(pins(), QStringList{"openai:gpt-missing"});
        search->setProperty("text", ""); QTest::keyClick(window, Qt::Key_Return);
        QTRY_COMPARE(current(bridge).value("model").toString(), QString("openai:gpt-missing"));
        for (int i = 1; i < 8; ++i) bridge.command("togglePinnedModel", {{"value", "ollama:p" + QString::number(i)}});
        shortcut(Qt::Key_M); QTRY_VERIFY(search->hasActiveFocus());
        search->setProperty("text", "beta");
        QTRY_VERIFY(visualItem(window->contentItem(), "model-pin-0", true));
        QTRY_VERIFY(!visualItem(window->contentItem(), "model-pin-0", true)->isEnabled());
        auto *disabledPin = visualItem(window->contentItem(), "model-pin-0", true);
        QCOMPARE(qmlValue(disabledPin, "icon.color"), qmlValue(disabledPin, "palette.disabled.buttonText"));
        QCOMPARE(qmlValue(disabledPin, "Accessible.name").toString(), bridge.strings().value("pinModelNamed").toString().replace("{name}", "beta"));
        pressPin(); QCOMPARE(pins().size(), 8);
        shortcut(Qt::Key_M); QTRY_VERIFY(!panel->property("visible").toBool()); QTRY_VERIFY(opener->hasActiveFocus());
        shortcut(Qt::Key_T); QTRY_VERIFY(tools->property("visible").toBool());
        shortcut(Qt::Key_T); QTRY_VERIFY(!tools->property("visible").toBool());
        shortcut(Qt::Key_T); QTest::keyClick(window, Qt::Key_Escape);
        QTRY_VERIFY(window->property("toolsControl").value<QQuickItem *>()->hasActiveFocus());
        opener->setEnabled(false); shortcut(Qt::Key_M); QVERIFY(!panel->property("visible").toBool());
        QTest::keyClick(window, Qt::Key_2, Qt::ControlModifier);
        QTRY_COMPARE(bridge.state().value("feature").toString(), QString("translate"));
        opener = window->property("modelControl").value<QQuickItem *>(); QVERIFY(opener);
        shortcut(Qt::Key_M); auto *featurePanel = window->findChild<QObject *>("model-lineup-panel");
        QVERIFY(featurePanel); QTRY_VERIFY(featurePanel->property("visible").toBool());
        QTest::keyClick(window, Qt::Key_Escape); QTRY_VERIFY(opener->hasActiveFocus());
        QTest::keyClick(window, Qt::Key_0, Qt::ControlModifier);
        QTRY_VERIFY(!window->property("modelControl").value<QQuickItem *>());
        shortcut(Qt::Key_M); shortcut(Qt::Key_T); QVERIFY(window->property("home").toBool());
        QCOMPARE(warnings.count(), 0);
    }

    void pullStepReadsBytesAndRejectsBadLines() {
        const auto step = PullStep::parse(R"({"status":"pulling 6a0746a1ec1a","digest":"sha256:6a07","total":4900000000,"completed":2100000000})");
        QVERIFY(step);
        QCOMPARE(step->status, QString("pulling 6a0746a1ec1a"));
        QCOMPARE(step->completed, 2100000000LL);
        QCOMPARE(step->total, 4900000000LL);
        QCOMPARE(step->fraction(), 2.1 / 4.9);
        for (const auto &line : {R"({"status":"pulling manifest"})", R"({"total":-5,"completed":3})",
                                 R"({"total":0})", R"({"total":1e30})", R"({"total":1e15})", R"({"total":"10"})"}) {
            const auto unknown = PullStep::parse(line);
            QVERIFY(unknown);
            QCOMPARE(unknown->total, 0);
            QCOMPARE(unknown->completed, 0);
            QCOMPARE(unknown->fraction(), -1.);
        }
        const auto capped = PullStep::parse(R"({"total":100,"completed":250})");
        QVERIFY(capped);
        QCOMPARE(capped->completed, 100);
        QCOMPARE(capped->status, QString("running"));
        for (const auto &value : {"-2", "1e15", "null", "true"}) {
            const auto invalidCount = PullStep::parse(QByteArray(R"({"total":100,"completed":)") + value + "}");
            QVERIFY(invalidCount);
            QCOMPARE(invalidCount->completed, 0);
        }
        for (const auto &line : {R"({"error":"pull model manifest: file does not exist"})", "not json", "[1]"})
            QVERIFY(!PullStep::parse(line));
    }

    void localCatalogUsesOnlyValidSizes() {
        QJsonArray models{QJsonObject{{"name", "known"}, {"size", 2600000000.0}},
                          QJsonObject{{"name", "absent"}}, QJsonObject{{"name", "bad\nname"}, {"size", 8}}};
        const QList<double> invalid{-1, 0, qQNaN(), qInf(), 1e15, 1e16};
        for (qsizetype i = 0; i < invalid.size(); ++i)
            models.append(QJsonObject{{"name", QString::number(i)}, {"size", invalid[i]}});
        const auto page = ModelCatalog::parsePage("ollama", QJsonObject{{"models", models}});
        QVERIFY(page.success);
        QCOMPARE(page.models.size(), 2 + invalid.size());
        QVERIFY(!page.ollamaSizes.contains("ollama:bad\nname"));
        QCOMPARE(page.ollamaSizes.value("ollama:known").toLongLong(), 2600000000LL);
        QCOMPARE(page.ollamaSizes.value("ollama:absent").toLongLong(), 0);
        for (qsizetype i = 0; i < invalid.size(); ++i)
            QCOMPARE(page.ollamaSizes.value("ollama:" + QString::number(i)).toLongLong(), 0);
        QVERIFY(!ModelCatalog::parsePage("ollama", {}).success);
    }

    void localCatalogKeepsLargestDuplicateSize() {
        const QJsonArray models{QJsonObject{{"name", "model"}, {"size", 10}},
                                QJsonObject{{"name", "model"}, {"size", 42}},
                                QJsonObject{{"name", "model"}, {"size", 7}},
                                QJsonObject{{"name", "model"}}};
        const auto page = ModelCatalog::parsePage("ollama", {{"models", models}});
        QVERIFY(page.success);
        QCOMPARE(page.ollamaSizes.value("ollama:model").toLongLong(), 42);
    }

    void localModelHeadlineIsTheAppliedProfileOrTheFastest() {
        const QJsonObject gpu{{"layers", 99}, {"context", 4096}}, cpu{{"layers", 1}, {"context", 4096}};
        const QJsonObject slow{{"id", "cpu"}, {"profile", cpu}, {"tokensPerSecond", 12.5}};
        const QJsonObject fast{{"id", "gpu"}, {"profile", gpu}, {"tokensPerSecond", 48.2}};
        QJsonArray invalid{QJsonObject{{"id", "mixed"}, {"profile", gpu}, {"tokensPerSecond", 90}, {"error", "runtimeComparisonError"}}};
        for (double rate : {0., -1., qInf(), qQNaN()})
            invalid.append(QJsonObject{{"id", "invalid"}, {"profile", cpu}, {"tokensPerSecond", rate}});
        auto results = invalid;
        results.append(slow);
        results.append(fast);
        QCOMPARE(LocalPerformance::headline(results, {}), fast);
        QCOMPARE(LocalPerformance::headline(results, cpu), slow);
        QCOMPARE(LocalPerformance::headline(results, {{"layers", 1}, {"context", 2048}}), fast);
        QVERIFY(LocalPerformance::headline(invalid, cpu).isEmpty());
        QVERIFY(LocalPerformance::headline({}, gpu).isEmpty());
    }

    void installedModelRowsRefreshStoredMeasurements() {
        const auto name = QCoreApplication::applicationName();
        const bool testMode = QStandardPaths::isTestModeEnabled();
        const auto restore = qScopeGuard([&] {
            QCoreApplication::setApplicationName(name);
            QStandardPaths::setTestModeEnabled(testMode);
        });
        QStandardPaths::setTestModeEnabled(true);
        const auto parent = QFileInfo(QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation)).absolutePath();
        QVERIFY(QDir().mkpath(parent));
        QTemporaryDir dir(parent + "/measured-XXXXXX");
        QVERIFY(dir.isValid());
        QCoreApplication::setApplicationName(QFileInfo(dir.path()).fileName());
        QCOMPARE(QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation), dir.path());

        const QString model = "ollama:qwen3:4b", missing = "ollama:other";
        const QJsonObject gpu{{"layers", 99}, {"context", 4096}}, hybrid{{"layers", 2}, {"context", 4096}};
        const auto writeStore = [&](double rate) {
            const QJsonArray results{QJsonObject{{"id", "gpu"}, {"profile", gpu}, {"tokensPerSecond", rate}},
                                     QJsonObject{{"id", "hybrid"}, {"profile", hybrid}, {"tokensPerSecond", 12}}};
            QFile file(dir.filePath("local-performance.json"));
            const auto bytes = QJsonDocument(QJsonObject{{model, QJsonObject{{"results", results}}}}).toJson();
            return file.open(QIODevice::WriteOnly) && file.write(bytes) == bytes.size();
        };
        QVERIFY(writeStore(48.2));
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("locale", {{"value", "vi"}});
        ProviderDiscovery::Snapshot snapshot;
        snapshot.models["ollama"] = {model, missing};
        snapshot.ollamaSizes.insert(model, 2600000000LL);
        bridge.applyProviderSnapshot(snapshot);
        QQmlEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.rootContext()->setContextProperty("pullManager", bridge.modelManager());
        QQmlComponent component(&engine);
        setLocalSettingsComponent(component);
        QScopedPointer<QObject> owner(component.create());
        QVERIFY2(owner, qPrintable(component.errorString()));
        auto *root = qobject_cast<QQuickItem *>(owner.data());
        QVERIFY(root);
        const auto detail = [&](const QString &id) {
            auto *row = visualItem(root, "installed-model-" + id);
            return row ? row->property("detail").toString() : QString();
        };
        QTRY_COMPARE(detail(model), "2,6 GB · " + model + " · gpu · 48,2 token/giây");
        QCOMPARE(detail(missing), missing + " · Chưa đo được");

        auto *performance = bridge.localPerformance();
        performance->selectModel(model);
        performance->select("hybrid");
        QTRY_COMPARE(detail(model), "2,6 GB · " + model + " · hybrid · 12,0 token/giây");
        performance->select("auto");
        QTRY_COMPARE(detail(model), "2,6 GB · " + model + " · gpu · 48,2 token/giây");

        // Changing only the size or app language must format the cached rate.
        QVERIFY(writeStore(51));
        snapshot.ollamaSizes.clear();
        bridge.applyProviderSnapshot(snapshot);
        bridge.command("locale", {{"value", "en"}});
        QTRY_COMPARE(detail(model), model + " · gpu · 48.2 tokens/s");
        bridge.command("locale", {{"value", "ja"}});
        QTRY_COMPARE(detail(model), model + " · gpu・48.2トークン/秒");
        QCOMPARE(detail(missing), missing + " · 未計測");

        // Cancel synchronously on start, before the worker can issue a runtime request.
        connect(performance, &LocalPerformance::changed, performance, [performance] {
            if (performance->busy()) performance->cancel();
        });
        performance->compare();
        QTRY_VERIFY(!performance->busy());
        QTRY_COMPARE(detail(model), model + " · gpu・51.0トークン/秒");
        bridge.applyProviderSnapshot({});
        QTRY_VERIFY(!visualItem(root, "installed-model-" + model));
        QVERIFY(performance->measured().isEmpty());
        QVERIFY(writeStore(60));
        bridge.applyProviderSnapshot(snapshot);
        QTRY_COMPARE(detail(model), model + " · gpu・60.0トークン/秒");
        QCOMPARE(warnings.count(), 0);
    }

    void localModelProgressTracksLayerAndClearsOnExit() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("locale", {{"value", "vi"}});
        FixtureNetwork network;
        LocalModelManager manager(nullptr, &network);
        QQmlEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.rootContext()->setContextProperty("pullManager", &manager);
        QQmlComponent component(&engine);
        setLocalSettingsComponent(component);
        QScopedPointer<QObject> owner(component.create());
        QVERIFY2(owner, qPrintable(component.errorString()));
        auto *root = qobject_cast<QQuickItem *>(owner.data());
        QVERIFY(root);
        auto *status = visualItem(root, "local-model-status");
        auto *bar = visualItem(root, "local-model-progress");
        QVERIFY(status && bar);
        auto *accessible = QAccessible::queryAccessibleInterface(bar); QVERIFY(accessible);
        QSignalSpy feedback(root, SIGNAL(feedback(QString,bool))); QVERIFY(feedback.isValid());
        const auto checkProgress = [&] {
            QCOMPARE(accessible->text(QAccessible::Name), bridge.strings().value("downloadModel").toString());
            QCOMPARE(accessible->text(QAccessible::Description), status->property("text").toString());
        };
        QSignalSpy succeeded(&manager, &LocalModelManager::completed);
        for (const auto terminal : {QString("cancelled"), QString("failed"), QString("succeeded")}) {
            feedback.clear();
            manager.run("fixture");
            network.reply->receive(R"({"status":"pulling layer","completed":2100000000,)");
            network.reply->receive("\"total\":4900000000}\n");
            QCOMPARE(status->property("text").toString(), QString("Đang tải · 2,1 / 4,9 GB"));
            QCOMPARE(bar->property("value").toDouble(), 2.1 / 4.9);
            QVERIFY(!bar->property("indeterminate").toBool());
            checkProgress();
            network.reply->receive("{\"status\":\"pulling manifest\"}\n");
            QCOMPARE(status->property("text").toString(), QString("Đang tải"));
            QVERIFY(bar->property("indeterminate").toBool());
            checkProgress();
            network.reply->receive("{\"total\":5000000,\"completed\":500000}\n");
            QCOMPARE(status->property("text").toString(), QString("Đang tải · 0,5 / 5,0 MB"));
            checkProgress();
            QCOMPARE(feedback.count(), 0);
            if (terminal == "cancelled") manager.cancel();
            else if (terminal == "failed") network.reply->receive("{\"error\":\"fixture\"}\n");
            else {
                network.reply->receive(R"({"status":"success"})"); // final line without a newline
                network.reply->finish();
            }
            QCOMPARE(feedback.count(), 1);
            QVERIFY(!manager.busy());
            QCOMPARE(manager.status(), terminal);
            QCOMPARE(manager.totalBytes(), 0);
            QCOMPARE(manager.completedBytes(), 0);
            QCOMPARE(manager.progress(), -1.);
            QCOMPARE(status->property("text").toString(), bridge.strings().value(terminal == "succeeded" ? "modelInstalled" : terminal).toString());
            QCOMPARE(status->isVisible(), terminal != "failed");
            QVERIFY(!bar->isVisible());
        }
        QCOMPARE(succeeded.count(), 1);
        manager.run("fixture", true);
        network.reply->finish();
        QCOMPARE(status->property("text").toString(), bridge.strings().value("succeeded").toString());
        QCOMPARE(warnings.count(), 0);
    }

    void launcherCurrencyMatchesSwift() {
        using namespace CurrencyRates;
        struct Example { QString text, locale; double amount; QString from, to; };
        const QList<Example> examples{
            {"2$", "en", 2, "USD", {}}, {"$2", "en", 2, "USD", {}}, {"2 usd", "en", 2, "USD", {}},
            {"2USD", "en", 2, "USD", {}}, {"100 yen", "en", 100, "JPY", {}}, {"50€", "en", 50, "EUR", {}},
            {"£ 10", "en", 10, "GBP", {}}, {"1000₩", "en", 1000, "KRW", {}}, {"US$ 3", "en", 3, "USD", {}},
            {"2 usd to vnd", "en", 2, "USD", "VND"}, {"2$ in jpy", "en", 2, "USD", "JPY"},
            {"2$ → eur", "en", 2, "USD", "EUR"}, {"2$ = eur", "en", 2, "USD", "EUR"},
            {"2 usd vnd", "en", 2, "USD", "VND"}, {"$2 vnd", "en", 2, "USD", "VND"},
            {"2$ inr", "en", 2, "USD", "INR"}, {"2$ to", "en", 2, "USD", {}},
            {"2 usd to usd", "en", 2, "USD", {}}, {"1.5 usd", "en", 1.5, "USD", {}},
            {"1,500 usd", "en", 1500, "USD", {}}, {"1.5m usd", "en", 1500000, "USD", {}},
            {"2 krw", "en", 2, "KRW", {}}, {"2 đô sang yên", "vi", 2, "USD", "JPY"},
            {"2 do la", "vi", 2, "USD", {}}, {"50.000đ", "vi", 50000, "VND", {}},
            {"50.000 đồng", "vi", 50000, "VND", {}}, {"1,5 usd", "vi", 1.5, "USD", {}},
            {"1.500.000 vnd", "vi", 1500000, "VND", {}}, {"500k vnd", "vi", 500000, "VND", {}},
            {"2tr vnd", "vi", 2000000, "VND", {}}, {"100円", "ja", 100, "JPY", {}},
            {"100ドル に 円", "ja", 100, "USD", "JPY"}, {"1万円", "ja", 10000, "JPY", {}},
            {"1.234,50 eur", "vi", 1234.5, "EUR", {}}, {"1,234.50 eur", "en", 1234.5, "EUR", {}}
        };
        for (const auto &example : examples) {
            const auto query = parse(example.text, example.locale);
            QVERIFY2(query.has_value(), qPrintable(example.text));
            QCOMPARE(query->amount, example.amount); QCOMPARE(query->from, example.from); QCOMPARE(query->to, example.to);
        }
        for (const auto &text : QStringList{"", "2", "2 + 2", "chat", "2 abc", "1password", "2$ to abc", "2 m",
                 "12 tr", "2 in", "usd", "$", "2$$", "9999999999999999 usd", "2,5,5 usd", QString(61, 'x')})
            QVERIFY2(!parse(text, "en"), qPrintable(text));
        QCOMPARE(codes().size(), 30);
        QCOMPARE(defaultTarget("en", {}), "USD"); QCOMPARE(defaultTarget("vi", {}), "VND");
        QCOMPARE(defaultTarget("ja", {}), "JPY"); QCOMPARE(defaultTarget("vi", "JPY"), "JPY");
        QCOMPARE(defaultTarget("vi", "XXX"), "VND"); QCOMPARE(defaultTarget("vi", {}, "VND"), "USD");
        QCOMPARE(defaultTarget("en", {}, "USD"), "EUR"); QCOMPARE(defaultTarget("vi", "JPY", "JPY"), "VND");
        const QJsonObject snapshot{{"rates", QJsonObject{{"USD", 1}, {"VND", 25000}, {"JPY", 150}}}, {"updated", 1}};
        const auto dong = quote({2, "USD", "VND"}, "vi", {}, snapshot);
        QCOMPARE(dong.value("value").toString(), "50.000"); QCOMPARE(dong.value("rate").toString(), "25.000");
        QVERIFY(!dong.value("date").toString().isEmpty());
        const auto usd = quote({300, "JPY", "USD"}, "en", {}, snapshot);
        QCOMPARE(usd.value("value").toString(), "2.00");
        QCOMPARE(usd.value("rate").toString(), QLocale("en").toString(1. / 150, 'g', 6));
        QVERIFY(!quote({1, "USD", "EUR"}, "en", {}, snapshot).contains("value"));
    }

    void currencyRateUsesLocalizedSignificantDigits() {
        const QJsonObject snapshot{{"rates", QJsonObject{{"USD", 1}, {"VND", 25400}, {"EUR", 0.002}}}};
        const auto rate = [&](const QString &from, const QString &to, const QString &locale) {
            return CurrencyRates::quote({100000, from, to}, locale, {}, snapshot).value("rate").toString();
        };
        QCOMPARE(rate("VND", "USD", "vi"), "0,0000393701");
        QCOMPARE(rate("VND", "USD", "en"), "0.0000393701");
        QCOMPARE(rate("EUR", "VND", "ja"), "12,700,000");
        QCOMPARE(rate("EUR", "USD", "en"), "500");
    }

    void currencyShutdownCancelsPendingLoad() {
        FixtureNetwork network;
        DesktopIntegration desktop(nullptr, &network);
        desktop.loadCurrencyRates(true);
        QCOMPARE(desktop.currencyStatus(), "loading");
        QPointer<FixtureReply> reply = network.reply;
        QVERIFY(reply && !reply->isFinished());
        desktop.loadCurrencyRates(true);
        QCOMPARE(network.requests, 1);
        desktop.shutdown();
        QVERIFY(desktop.currencyStatus() != "loading");
        QCOMPARE(reply->error(), QNetworkReply::OperationCanceledError);
        QSignalSpy late(&desktop, &DesktopIntegration::currencyChanged);
        desktop.loadCurrencyRates(true);
        QCOMPARE(network.requests, 1);
        QTRY_VERIFY(reply.isNull());
        QCOMPARE(late.count(), 0);
        {
            DesktopIntegration closing(nullptr, &network);
            closing.loadCurrencyRates(true);
            reply = network.reply;
            QVERIFY(reply && !reply->isFinished());
        }
        QVERIFY(reply && reply->error() == QNetworkReply::OperationCanceledError);
        QTRY_VERIFY(reply.isNull());
    }

    void currencyRefreshBoundsAndCache() {
        QTemporaryDir dir;
        const auto path = dir.filePath("currency.json");
        const QJsonObject stale{{"rates", QJsonObject{{"USD", 1}}}, {"updated", 1}, {"fetched", 1}};
        QFile cache(path);
        QVERIFY(cache.open(QIODevice::WriteOnly));
        const auto data = QJsonDocument(stale).toJson();
        QCOMPARE(cache.write(data), data.size());
        cache.close();
        FixtureNetwork network;
        CurrencyRates::Loader rates(nullptr, &network);
        QSignalSpy loaded(&rates, &CurrencyRates::Loader::loaded);
        rates.load(path, false);
        QCOMPARE(network.lastRequest.transferTimeout(), 8000);
        QCOMPARE(network.reply->readBufferSize(), 512 * 1024 + 1);
        auto *deadline = network.reply->findChild<QTimer *>(Qt::FindDirectChildrenOnly);
        QVERIFY(deadline && deadline->isActive() && deadline->isSingleShot());
        QCOMPARE(deadline->interval(), 10000);
        deadline->start(0);
        QTRY_COMPARE(loaded.size(), 1);
        QCOMPARE(loaded.takeFirst().first().toJsonObject(), stale);

        rates.load(path, true);
        network.reply->receive(QByteArray(512 * 1024, ' '));
        QVERIFY(!network.reply->isFinished());
        network.reply->receive("x");
        QCOMPARE(network.reply->error(), QNetworkReply::OperationCanceledError);
        QCOMPARE(loaded.size(), 1);
        QCOMPARE(loaded.takeFirst().first().toJsonObject(), stale);

        rates.load(path, true);
        network.reply->receive(R"({"result":"success","base_code":"USD","time_last_update_unix":42,"rates":{"USD":1,"JPY":150}})");
        network.reply->finish();
        QCOMPARE(loaded.size(), 1);
        const auto fresh = loaded.takeFirst().first().toJsonObject();
        QCOMPARE(fresh.value("updated").toInt(), 42);
        const int requests = network.requests;
        rates.load(path, false);
        QCOMPARE(loaded.size(), 1);
        QCOMPARE(loaded.takeFirst().first().toJsonObject(), fresh);
        QCOMPARE(network.requests, requests);
    }

    void destroyingLocalModelManagerAbortsOwnedOperation_data() {
        QTest::addColumn<bool>("remove");
        QTest::newRow("pull") << false;
        QTest::newRow("delete") << true;
    }

    void destroyingLocalModelManagerAbortsOwnedOperation() {
        QFETCH(bool, remove);
        FixtureNetwork network;
        QPointer<FixtureReply> reply;
        {
            LocalModelManager manager(nullptr, &network);
            manager.run("fixture", remove);
            reply = network.reply;
            QVERIFY(reply && !reply->isFinished());
        }
        QVERIFY(reply && reply->error() == QNetworkReply::OperationCanceledError);
        QTRY_VERIFY(reply.isNull());
    }

    void modelTierSetsEffortOnlyInChat() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        ProviderDiscovery::Snapshot providers;
        providers.models["openai"] = {"openai:gpt-5-mini", "openai:gpt-5", "openai:gpt-5-pro"};
        bridge.applyProviderSnapshot(providers);
        for (const auto &feature : {QString("translate"), QString("chat")}) {
            bridge.command("navigate", {{"feature", feature}});
            const auto id = current(bridge).value("id").toString();
            bridge.command("model", {{"sessionID", id}, {"value", "openai:gpt-5"}});
            const auto tiers = bridge.modelTiers(id);
            QCOMPARE(tiers.size(), 3);
            for (const auto &previous : {QString("low"), QString("medium")}) {
                for (const auto &tier : tiers.keys()) {
                    bridge.command(feature == "chat" ? "chatReasoning" : "reasoning", {{"sessionID", id}, {"value", previous}});
                    bridge.applyModelTier(id, tier);
                    const auto session = current(bridge);
                    QCOMPARE(session.value("model"), tiers.value(tier));
                    const QString expected = feature == "translate" ? previous : tier == "careful" ? "high" : "auto";
                    QCOMPARE(session.value("reasoningEffort").toString(), expected);
                    QCOMPARE(session.value("carefulReasoning").toBool(), expected == "high");
                }
            }
        }
    }

    void systemSpeechFinishBelongsToItsUtterance() {
        NativeAudio audio;
        auto *first = new QTextToSpeech(&audio);
        audio.beginSystemSpeech(first, "first");
        QVERIFY(audio.speaking());
        first->stateChanged(QTextToSpeech::Ready);
        QVERIFY(!audio.speaking() && audio.speakingSource().isEmpty());
        auto *second = new QTextToSpeech(&audio);
        audio.beginSystemSpeech(second, "second");
        first->stateChanged(QTextToSpeech::Ready);
        first->errorOccurred(QTextToSpeech::ErrorReason::Playback, "late error");
        QVERIFY(audio.speaking() && audio.error().isEmpty());
        QCOMPARE(audio.speakingSource(), QString("second"));
        audio.silence();
        second->stateChanged(QTextToSpeech::Speaking);
        second->stateChanged(QTextToSpeech::Ready);
        QVERIFY(!audio.speaking() && audio.speakingSource().isEmpty());
    }

    void voicesFollowTheLanguageTheyRead() {
        struct FixtureVoices : QTextToSpeechEngine { using QTextToSpeechEngine::createVoice; };
        const auto make = [](const QString &name, const QString &locale) {
            return FixtureVoices::createVoice(name, QLocale(locale), QVoice::Unknown, QVoice::Other, name);
        };
        const QList<QVoice> voices{make("JA default", "ja_JP"), make("JA selected", "ja_JP"),
                                   make("EN regional", "en_GB"), make("EN default", "en_US")};
        const QString selected = "JA selected";
        const auto japanese = NativeAudio::preferredVoice(voices, QLocale("ja"), selected);
        const auto english = NativeAudio::preferredVoice(voices, QLocale("en"), selected);
        QVERIFY(japanese && english);
        QCOMPARE(japanese->name(), selected);
        QCOMPARE(english->name(), QString("EN default"));
        QVERIFY(!NativeAudio::preferredVoice(voices, QLocale("vi"), selected));
        NativeAudio audio;
        audio.configureVoice("edge", selected);
        QVERIFY(audio.voiceFor("en").isEmpty());
        QCOMPARE(audio.recordingStarted(), 0.0);
    }

    void localRuntimeChecksCompletedProbes() {
        FixtureNetwork network;
        LocalRuntime runtime(nullptr, &network);
        QVERIFY(!runtime.checked());
        runtime.refresh();
        QVERIFY(network.reply && !runtime.checked());
        network.reply->fail(QNetworkReply::ConnectionRefusedError);
        QVERIFY(runtime.checked() && !runtime.available());
        runtime.refresh();
        network.reply->receive(R"({"version":"1.2.3"})");
        network.reply->finish();
        QVERIFY(runtime.checked() && runtime.available());
        QCOMPARE(runtime.version(), QString("1.2.3"));
    }

    void providerTransportFailures_data() {
        QTest::addColumn<QString>("model");
        QTest::addColumn<QNetworkReply::NetworkError>("failure");
        QTest::addColumn<QString>("expected");
        QTest::newRow("ollama-refused") << "ollama:qwen3:4b" << QNetworkReply::ConnectionRefusedError << "providerOffline";
        QTest::newRow("lmstudio-unreachable") << "lmstudio:gemma" << QNetworkReply::HostNotFoundError << "providerOffline";
        QTest::newRow("llamacpp-timeout") << "llamacpp:gemma" << QNetworkReply::TimeoutError << "providerOffline";
        QTest::newRow("cloud-timeout") << "openai:gpt-4o" << QNetworkReply::TimeoutError << "providerError";
        QTest::newRow("cloud-missing-key") << "openai:gpt-4o" << QNetworkReply::NoError << "providerMissingKey";
    }
    void providerTransportFailures() {
        QFETCH(QString, model);
        QFETCH(QNetworkReply::NetworkError, failure);
        QFETCH(QString, expected);
        FixtureNetwork network;
        LocalProvider provider(nullptr, &network);
        QSignalSpy events(&provider, &LocalProvider::received);
        if (model.startsWith("openai:") && failure != QNetworkReply::NoError)
            QVERIFY(CredentialStore::save("openai", "synthetic"));
        const auto clearKey = qScopeGuard([] { CredentialStore::remove("openai"); });
        const QVariantMap request{{"model", model}, {"feature", "chat"}, {"input", "fixture"}};
        provider.start({{"id", "job"}, {"attemptID", "a"}, {"request", request}});
        if (failure != QNetworkReply::NoError) {
            QTRY_VERIFY(network.reply);
            network.reply->fail(failure);
        }
        QTRY_COMPARE(events.size(), 1);
        QCOMPARE(events.first().first().toMap().value("terminal").toString(), QString("failed"));
        QCOMPARE(events.first().first().toMap().value("errorCode").toString(), expected);
        QCOMPARE(network.requests, failure == QNetworkReply::NoError ? 0 : 1);
    }

    void speechReadinessAndTranscriptionFailures() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        ProviderDiscovery::Snapshot snapshot;
        snapshot.checked = true;
        snapshot.speechKeyed.insert("groq");
        bridge.applyProviderSnapshot(snapshot);
        QCOMPARE(bridge.state().value("speechProvider", "auto").toString(), QString("auto"));
        QVERIFY(bridge.speechReady("auto") && bridge.speechReady("groq"));
        QVERIFY(!bridge.speechReady("openai") && bridge.providersEmpty());
        bridge.command("speechProvider", {{"value", "openai"}});
        QCOMPARE(bridge.state().value("speechProvider").toString(), QString("openai"));

        QFile recording(dir.filePath("synthetic.wav"));
        QVERIFY(recording.open(QIODevice::WriteOnly));
        QVERIFY(recording.write("fixture audio bytes") > 0);
        recording.close();
        FixtureNetwork network;
        NativeAudio audio(nullptr, &network);
        QSignalSpy errors(&audio, &NativeAudio::transcriptionFailed);
        audio.transcribeFile("first", recording.fileName(), "openai");
        QTRY_COMPARE(errors.size(), 1);
        QCOMPARE(errors.takeFirst(), (QVariantList{"first", "providerMissingKey"}));
        QCOMPARE(network.requests, 0);

        QVERIFY(CredentialStore::save("groq", "synthetic"));
        const auto clearKey = qScopeGuard([] { CredentialStore::remove("groq"); });
        audio.transcribeFile("second", recording.fileName(), "auto");
        QTRY_COMPARE(network.requests, 1);
        QCOMPARE(network.lastRequest.url().host(), QString("api.groq.com"));
        network.reply->fail(QNetworkReply::HostNotFoundError);
        QTRY_COMPARE(errors.size(), 1);
        QCOMPARE(errors.takeFirst(), (QVariantList{"second", "providerNetworkError"}));
        audio.transcribeFile("third", recording.fileName(), "groq");
        QTRY_COMPARE(network.requests, 2);
        network.reply->receive(QByteArray(1048577, 'x'));
        QTRY_COMPARE(errors.size(), 1);
        QCOMPARE(errors.takeFirst(), (QVariantList{"third", "audioError"}));
    }

    void importedTitlesRoundTripAcrossSnapshotAndBackup() {
        const QString clean = QStringLiteral("Giải thích ngắn gọn");
        const QString damaged = QStringLiteral("Gi·∫£i th√≠ch ng·∫Øn g·ªçn");
        for (const QString &title : {damaged, clean, QStringLiteral("√2 ≈ 1,41"), QStringLiteral("plain title")}) {
            auto state = WorkbenchDomain::create("chat", "translate");
            auto sessions = state.value("sessions").toList();
            auto chat = sessions.first().toMap();
            chat["title"] = title;
            chat["draft"] = damaged;
            sessions[0] = chat;
            state["sessions"] = sessions;
            const auto expected = title == damaged ? clean : title;
            auto saved = WorkbenchDomain::recover(state);
            QCOMPARE(saved.value("sessions").toList().first().toMap().value("title").toString(), expected);
            QCOMPARE(WorkbenchDomain::recover(saved), saved);
            const auto preview = NativeBackup::preview(NativeBackup::exportData(state));
            QVERIFY(preview.valid);
            QCOMPARE(preview.sessions.first().toMap().value("title").toString(), expected);
            QCOMPARE(preview.sessions.first().toMap().value("draft").toString(), damaged);
        }
    }

    void dictionaryOptionalAnnotations() {
        const QJsonObject sense{{"text", "one"}, {"pronunciation", "p"}, {"examples", QJsonArray{"a", "b"}}};
        QJsonObject entry{{"headword", "bank"}, {"meaning", "m"}, {"translations", QJsonArray{sense}}};
        const auto read = [&] { return WorkbenchDomain::dictionaryEntry(QString::fromUtf8(QJsonDocument(entry).toJson())).toMap(); };
        auto parsed = read();
        QVERIFY(!parsed.contains("related") && !parsed.contains("contextSense"));
        QVERIFY(!parsed.value("translations").toList().first().toMap().contains("exampleRegisters"));
        entry["related"] = QJsonObject{{"derived", QJsonArray{" riverbank "}}, {"synonyms", QJsonArray{"shore", "edge", ""}}, {"antonyms", QJsonArray{}}};
        entry["contextSense"] = 1;
        auto annotated = sense;
        annotated["exampleRegisters"] = QJsonArray{" casual "};
        entry["translations"] = QJsonArray{annotated};
        parsed = read();
        const auto related = parsed.value("related").toMap();
        QCOMPARE(related.value("derived").toStringList(), QStringList{"riverbank"});
        QCOMPARE(related.value("synonyms").toStringList(), (QStringList{"shore", "edge"}));
        QVERIFY(!related.contains("antonyms"));
        QCOMPARE(parsed.value("contextSense").toInt(), 1);
        QCOMPARE(parsed.value("translations").toList().first().toMap().value("exampleRegisters").toStringList(), QStringList{"casual"});
        entry["related"] = "luck, chance";
        entry["contextSense"] = 9;
        annotated["exampleRegisters"] = "formal";
        entry["translations"] = QJsonArray{annotated};
        parsed = read();
        QCOMPARE(parsed.value("headword").toString(), QString("bank"));
        QVERIFY(!parsed.contains("related") && !parsed.contains("contextSense"));
        QVERIFY(!parsed.value("translations").toList().first().toMap().contains("exampleRegisters"));
    }

    void inputLimitsCountGraphemes() {
        using namespace WorkbenchDomain;
        const QString accent = QStringLiteral("e\u0301");
        const QString family = QStringLiteral("👩‍👩‍👧‍👦");
        const QString smile = QStringLiteral("😀");
        QCOMPARE(graphemeCount({}), 0);
        QCOMPARE(graphemeCount(family), 1);
        QCOMPARE(smile.size(), 2);
        QCOMPARE(graphemeCount(accent + family + smile), 3);
        const QString prefix(2999, 'a');
        QCOMPARE(LanguageSegments::chunks(prefix + family + accent), (QStringList{prefix, family + accent}));
        QCOMPARE(LanguageSegments::chunks(family + "x", 1), (QStringList{family, "x"}));

        const auto fresh = create("chat", "translate");
        const auto edit = [&](const QString &session, const QString &text) {
            return command(fresh, "draft", {{"sessionID", session}, {"value", text}}, "id", "attempt");
        };
        const QVariantMap compare{{"sessionID", "translate"}, {"models", QStringList{"demo.standard", "demo.slow"}}};
        for (int n : {5000, 5001}) {
            const auto source = accent.repeated(n);
            QCOMPARE(source.toUcs4().size(), n * 2);
            auto state = edit("translate", source);
            QCOMPARE(command(state, "submit", {{"sessionID", "translate"}}, "id", "a").value("tasks").toList().size(), n == 5000 ? 1 : 0);
            QCOMPARE(command(state, "compare", compare, "id", "a").value("tasks").toList().size(), n == 5000 ? 2 : 0);
        }

        const QString dictionary = "chat-dictionary";
        auto state = edit(dictionary, family.repeated(120));
        const QString context = smile.repeated(500);
        state = command(state, "dictionaryContext", {{"sessionID", dictionary}, {"value", context}}, "id", "a");
        auto sent = command(state, "submit", {{"sessionID", dictionary}}, "id", "a");
        QCOMPARE(sent.value("tasks").toList().first().toMap().value("request").toMap().value("dictionaryContext").toString(), context);
        QCOMPARE(command(state, "dictionaryContext", {{"sessionID", dictionary}, {"value", context + accent}}, "id", "a"), state);
        state = edit(dictionary, family.repeated(121));
        QCOMPARE(command(state, "submit", {{"sessionID", dictionary}}, "id", "a"), state);

        const QVariantMap quick{{"sessionID", "chat"}, {"quickAI", true}};
        state = edit("chat", " " + accent.repeated(3000) + " ");
        const auto quickTasks = command(state, "submit", quick, "id", "a").value("tasks").toList();
        QCOMPARE(quickTasks.size(), 1);
        QCOMPARE(quickTasks.first().toMap().value("request").toMap().value("input").toString(), accent.repeated(3000));
        state = edit("chat", accent.repeated(3001));
        QCOMPARE(command(state, "submit", quick, "id", "a"), state);
        sent = command(state, "submit", {{"sessionID", "chat"}}, "id", "a");
        QCOMPARE(sent.value("tasks").toList().size(), 1);
        sent = command(sent, "cancel", {{"taskID", "id"}}, "x", "b");
        QCOMPARE(command(sent, "retry", {{"taskID", "id"}, {"quickAI", true}}, "x", "c"), sent);
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
    void interpretationSummaryPromptsAskForOneSectionEach() {
        QSet<QString> prompts;
        for (const auto &kind : {"summary", "actionItems", "decisions", "speakerAnalysis"}) {
            const auto prompt = Interpretation::summaryPrompt(kind, "vi");
            QVERIFY(prompt.contains("language vi")); QVERIFY(prompt.contains("only")); prompts.insert(prompt);
        }
        QCOMPARE(prompts.size(), 4);
        QVERIFY(Interpretation::summaryPrompt("summary", "vi").contains("do not add sections for action items, decisions, speakers"));
        QVERIFY(!Interpretation::summaryPrompt("actionItems", "vi").contains("decisions"));
    }
    void interpretationRepeatedSummaryLimit() {
        TemporaryHistoryProfile profile;
        QVERIFY(profile.valid());
        Interpretation live;
        auto session = meetingFixture("long-meeting");
        session["segments"] = QVariantList{QVariantMap{{"id", "line"}, {"original", QString(262145, 'a')}}};
        live.restoreSession(session);
        QCOMPARE(live.current(), session);
        QSignalSpy failures(&live, &Interpretation::failed);
        for (int attempt = 1; attempt <= 2; ++attempt) {
            live.summarize();
            QCOMPARE(failures.size(), attempt);
            QCOMPARE(failures.last(), (QVariantList{"interpretSummaryLimit"}));
            QCOMPARE(live.error(), QString("interpretSummaryLimit"));
        }
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
            QVERIFY(!interpretation.summarizing());
            const auto beforeCancel = interpretation.sessions();
            interpretation.cancelSummary();
            QVERIFY(!interpretation.summarizing());
            QVERIFY(interpretation.error().isEmpty());
            QCOMPARE(interpretation.sessions(), beforeCancel);
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
    void updateInstaller() {
        NativeUpdates updates;
        QVERIFY(!updates.canInstall());
        QVERIFY(!updates.install());
        QCOMPARE(NativeUpdates::installerArguments("C:/Viezan Apps/Viezan"), QStringLiteral(R"(/S --force-run /D=C:\Viezan Apps\Viezan)"));
    }
    void updateAppImageEligibility() {
        QTemporaryDir dir; QVERIFY(dir.isValid());
        const auto target = dir.filePath("Viezan.AppImage"), link = dir.filePath("alias.lnk");
        QVERIFY(writeBytes(target, "installed"));
        QVERIFY(NativeUpdates::replaceableAppImage(target));
        {
            const auto previousDirectory = QDir::currentPath();
            QVERIFY(QDir::setCurrent(dir.path()));
            const auto restoreDirectory = qScopeGuard([&] { QDir::setCurrent(previousDirectory); });
            QVERIFY(!NativeUpdates::replaceableAppImage("Viezan.AppImage"));
        }
        QVERIFY(!NativeUpdates::replaceableAppImage({}));
        QVERIFY(!NativeUpdates::replaceableAppImage(dir.path()));
        QVERIFY(!NativeUpdates::replaceableAppImage(dir.filePath("missing")));
        QVERIFY(QFile::link(target, link));
        QVERIFY(!NativeUpdates::replaceableAppImage(link));
#ifdef Q_OS_UNIX
        const auto permissions = QFile::permissions(dir.path());
        const auto restore = qScopeGuard([&] { QFile::setPermissions(dir.path(), permissions); });
        QVERIFY(QFile::setPermissions(dir.path(), QFile::ReadOwner | QFile::ExeOwner));
        QVERIFY(!NativeUpdates::replaceableAppImage(target));
#endif
    }
    void updateAppImageEnvironment() {
        QProcessEnvironment original;
        original.insert("APPDIR", "/tmp/mount/");
        original.insert("APPIMAGE", "/apps/Viezan.AppImage");
        original.insert("ARGV0", "Viezan");
        original.insert("OWD", "/work");
        original.insert("PATH", "/tmp/mount/bin::/tmp/mount-other/bin:/usr/bin");
        original.insert("LD_LIBRARY_PATH", "/tmp/mount:/tmp/mount/lib");
        original.insert("LABEL", "using /tmp/mount for this test");
        const auto clean = NativeUpdates::appImageEnvironment(original);
        QCOMPARE(clean.value("PATH"), QString(":/tmp/mount-other/bin:/usr/bin"));
        QCOMPARE(clean.value("LABEL"), original.value("LABEL"));
        for (const auto key : {"APPDIR", "APPIMAGE", "ARGV0", "OWD", "LD_LIBRARY_PATH"}) QVERIFY(!clean.contains(key));
        original.remove("APPDIR");
        QCOMPARE(NativeUpdates::appImageEnvironment(original).value("PATH"), original.value("PATH"));
    }
    void updateAppImageReplacement() {
        QTemporaryDir dir, cache; QVERIFY(dir.isValid() && cache.isValid());
        const auto target = dir.filePath("Viezan.AppImage"), previous = target + ".previous", downloaded = cache.filePath("download");
        QDir contents(dir.path()); contents.setFilter(QDir::AllEntries | QDir::Hidden | QDir::System | QDir::NoDotAndDotDot);
        const QStringList installed{"Viezan.AppImage", "Viezan.AppImage.previous"};
        QVERIFY(writeBytes(target, "original"));
        QVERIFY(!NativeUpdates::replaceAppImage(target, downloaded));
        QCOMPARE(fileBytes(target), QByteArray("original"));
        QCOMPARE(contents.entryList(), QStringList{"Viezan.AppImage"});

        const QByteArray update(150000, 'a');
        QVERIFY(writeBytes(downloaded, update));
        QVERIFY(NativeUpdates::replaceAppImage(target, downloaded));
        QCOMPARE(fileBytes(target), update);
        QCOMPARE(fileBytes(previous), QByteArray("original"));
#ifdef Q_OS_UNIX
        QCOMPARE(QFile::permissions(target), QFile::permissions(previous) | QFile::ExeOwner | QFile::ExeUser);
#endif
        contents.refresh(); QCOMPARE(contents.entryList(), installed);

        QVERIFY(writeBytes(downloaded, "next"));
        QVERIFY(NativeUpdates::replaceAppImage(target, downloaded));
        QCOMPARE(fileBytes(target), QByteArray("next"));
        QCOMPARE(fileBytes(previous), update);
        contents.refresh(); QCOMPARE(contents.entryList(), installed);
    }
    void updateManifestSignature() {
        QFile file(VIEZAN_UPDATE_SIGNATURE_FIXTURE); QVERIFY(file.open(QIODevice::ReadOnly));
        const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
        const auto manifest = fixture.value("manifest").toString().toUtf8(), signature = fixture.value("signature").toString().toLatin1(), key = fixture.value("publicKey").toString().toLatin1();
        QVERIFY(NativeUpdates::isSigned(manifest, signature, key));
        QVERIFY(NativeUpdates::isSigned(manifest, signature + '\n', key));
        auto changed = manifest; changed.replace("9.9.9", "9.9.8");
        QVERIFY(!NativeUpdates::isSigned(changed, signature, key));
        auto reversed = signature; std::reverse(reversed.begin(), reversed.end());
        QVERIFY(!NativeUpdates::isSigned(manifest, reversed, key));
        QVERIFY(!NativeUpdates::isSigned(manifest, {}, key));
        QVERIFY(!NativeUpdates::isSigned(manifest, signature, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="));
        QVERIFY(!NativeUpdates::isSigned(manifest, signature, ""));
        // The key the app ships with accepts a release signature and nothing signed by another key.
        QVERIFY(NativeUpdates::isSigned(manifest, fixture.value("releaseSignature").toString().toLatin1()));
        QVERIFY(!NativeUpdates::isSigned(manifest, signature));
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
        QCOMPARE(NativeUpdates::remaining(10, 1), -1.0);
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
        QStringList suggested;
        for (const auto &item : bridge.resources().value("localModelSuggestions").toList()) {
            const auto model = item.toMap();
            suggested << model.value("id").toString();
            QVERIFY(model.value("bytes").toLongLong() > 0);
            QVERIFY(!model.value("name").toString().isEmpty());
            QVERIFY(model.value("note").toString().startsWith("suggestion_"));
        }
        QCOMPARE(suggested, (QStringList{"qwen3:4b", "gemma3:4b", "llama3.2:3b", "qwen2.5:7b"}));
    }
    void remainingGapsInterpretation() {
        // #68 and #66 on Qt, against the test-mode store (never the app's own data).
        const bool previousMode = QStandardPaths::isTestModeEnabled();
        QStandardPaths::setTestModeEnabled(true);
        const auto folder = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation); QDir().mkpath(folder);
        const auto path = folder + "/interpretation.json";
        const auto cleanup = qScopeGuard([&] {
            QFile::remove(path);
            QStandardPaths::setTestModeEnabled(previousMode);
        });
        { QFile file(path); QVERIFY(file.open(QIODevice::WriteOnly)); file.write("not json"); }
        {
            QTemporaryDir workspace;
            QFile saved(workspace.filePath("workbench.json"));
            WorkbenchBridge bridge(nullptr, saved.fileName(), false);
            auto &interpretation = *bridge.interpretation();
            QVERIFY(interpretation.blocked()); QCOMPARE(interpretation.error(), QString("interpretStorageError"));
            bridge.command("draft", {{"value", "Keep this chat until both stores can be cleared"}});
            bridge.save();
            const auto before = bridge.state();
            QVERIFY(saved.open(QIODevice::ReadOnly));
            const auto original = saved.readAll();
            saved.close();
            bridge.command("clearHistory");
            QCOMPARE(bridge.state(), before);
            QCOMPARE(bridge.storageError(), QString("interpretStorageError"));
            QVERIFY(saved.open(QIODevice::ReadOnly));
            QCOMPARE(saved.readAll(), original);
            saved.close();
            QFile damaged(path);
            QVERIFY(damaged.open(QIODevice::ReadOnly));
            QCOMPARE(damaged.readAll(), QByteArray("not json"));
            damaged.close();
            const QVariantList sessions{QVariantMap{{"id", "meeting"}, {"created", 100.0}, {"model", "openai:gpt-5"}, {"provider", "openai"}, {"source", "en"}, {"target", "vi"}, {"locale", "vi"}, {"summary", ""},
                                                    {"segments", QVariantList{QVariantMap{{"id", "s1"}, {"start", 0.0}, {"end", 2.0}, {"speaker", "A"}, {"original", "Hello"}, {"translated", "Xin chào"}, {"status", "done"}}}}}};
            { QFile file(path); QVERIFY(file.open(QIODevice::WriteOnly)); file.write(QJsonDocument::fromVariant(sessions).toJson()); }
            interpretation.reload();
            QVERIFY(!interpretation.blocked()); QVERIFY(interpretation.error().isEmpty()); QCOMPARE(interpretation.sessions().size(), 1);
            QVERIFY(interpretation.exportText(false, true).startsWith("[A] Xin chào"));
            QVERIFY(!interpretation.exportText(true, true).contains("Hello"));
            QVERIFY(interpretation.exportText(false).startsWith("[A] Hello\nXin chào"));
            QTemporaryDir exports;
            for (bool srt : {false, true}) for (bool translatedOnly : {false, true}) {
                const auto path = exports.filePath(srt ? "session.srt" : "session.txt");
                interpretation.exportFile(QUrl::fromLocalFile(path), srt, translatedOnly);
                QFile file(path);
                QVERIFY(file.open(QIODevice::ReadOnly));
                const auto contents = QString::fromUtf8(file.readAll());
                QCOMPARE(contents.contains("Hello"), !translatedOnly);
                QCOMPARE(contents.contains("00:00:00,000 --> 00:00:02,000"), srt);
                QVERIFY(contents.contains("Xin chào"));
            }
            QCOMPARE(bridge.clearableHistoryCount(), 2);
            bridge.command("clearHistory");
            QVERIFY(bridge.storageError().isEmpty());
            QCOMPARE(bridge.clearableHistoryCount(), 0);
            QCOMPARE(bridge.state().value("sessions").toList().size(), 3);
            QVERIFY(interpretation.sessions().isEmpty());
            WorkbenchBridge reopened(nullptr, saved.fileName(), false);
            QVERIFY(!reopened.loadBlocked() && !reopened.interpretation()->blocked());
            QCOMPARE(reopened.clearableHistoryCount(), 0);
        }
    }
    void habitThresholdWindowDecayAndLocalHours() {
        const QTimeZone zone(7 * 3600);
        const QDateTime now(QDate(2026, 11, 8), QTime(0, 30), zone);
        constexpr double day = 86400;
        const auto session = [&](double days, QString source = "en") {
            return QVariantMap{{"feature", "translate"}, {"source", source}, {"target", "vi"},
                               {"output", "Saved"}, {"updated", now.toSecsSinceEpoch() - days * day}};
        };
        const auto suggest = [&](QVariantList sessions) {
            return HabitSuggestions::suggest({{"sessions", sessions}}, {}, now);
        };
        const QVariantList recent{session(0), session(1), session(2)};
        const QVariantList old{session(20, "ja"), session(23, "ja"), session(25, "ja")};
        const auto ranked = suggest(old + recent);
        QCOMPARE(ranked.size(), 2);
        QCOMPARE(ranked[0].toMap().value("id").toString(), QString("translate-en-vi"));
        QCOMPARE(ranked[1].toMap().value("id").toString(), QString("translate-ja-vi"));
        QVERIFY(ranked[0].toMap().value("score").toDouble() > ranked[1].toMap().value("score").toDouble());
        QVERIFY(suggest({session(0), session(1), session(30.01), session(-1)}).isEmpty());
        QCOMPARE(suggest({session(0), session(1), session(30)}).first().toMap().value("count").toInt(), 3);
        QCOMPARE(suggest({session(0, "auto"), session(1, "auto"), session(2, "auto")}).first().toMap().value("source").toString(), QString("auto"));

        QVariantList lateSessions;
        double baseScore = 0;
        for (int date : {5, 6, 7}) {
            const QDateTime timestamp(QDate(2026, 11, date), QTime(23, 30), zone);
            const auto age = timestamp.secsTo(now) / day;
            lateSessions << session(age);
            baseScore += std::exp(-age / 10);
        }
        const auto nearbySuggestions = suggest(lateSessions);
        const auto fiveHoursLater = HabitSuggestions::suggest({{"sessions", lateSessions}}, {}, now.addSecs(5 * 3600));
        QCOMPARE(nearbySuggestions.size(), 1); QCOMPARE(fiveHoursLater.size(), 1);
        QVERIFY(std::abs(nearbySuggestions.first().toMap().value("score").toDouble() - baseScore * 2) < 1e-6);
        QVERIFY(std::abs(fiveHoursLater.first().toMap().value("score").toDouble() - baseScore * std::exp(-5.0 / 24 / 10)) < 1e-6);
        QVERIFY(suggest(lateSessions.mid(0, 2)).isEmpty());
    }
    void habitFiltersModesModulesAndEmptyWork() {
        const auto now = QDateTime::fromSecsSinceEpoch(1793534400);
        QVariantMap translation{{"feature", "translate"}, {"source", "en"}, {"target", "vi"},
                                {"updated", now.toSecsSinceEpoch()}, {"output", "Saved"}};
        auto comparison = translation, empty = translation, undated = translation;
        comparison["comparisonParent"] = "parent";
        empty["draft"] = "Draft only"; empty["output"] = "";
        undated.remove("updated");
        QVariantMap state{{"sessions", QVariantList{comparison, empty, undated, translation, translation}}};
        QVERIFY(HabitSuggestions::suggest(state, {}, now).isEmpty());
        QVariantList history;
        for (int i = 0; i < 3; ++i) {
            history << translation;
            auto lookup = translation; lookup["feature"] = "dictionary"; history << lookup;
            for (const auto *mode : {"text", "image", "research", "web"})
                history << QVariantMap{{"feature", "chat"}, {"chatMode", mode}, {"messages", QVariantList{"message"}}, {"updated", now.toSecsSinceEpoch()}};
        }
        history << QVariantMap{{"feature", "chat"}, {"id", "current"}, {"chatMode", "image"}};
        state["sessions"] = history;
        const auto ranked = HabitSuggestions::suggest(state, "current", now, 2);
        QCOMPARE(ranked.size(), 2);
        QCOMPARE(ranked[0].toMap().value("id").toString(), QString("chat-research"));
        QCOMPARE(ranked[1].toMap().value("id").toString(), QString("chat-web"));
        state["disabledModules"] = QStringList{"chat", "dictionary"};
        const auto enabled = HabitSuggestions::suggest(state, "current", now);
        QCOMPARE(enabled.size(), 1);
        QCOMPARE(enabled.first().toMap().value("id").toString(), QString("translate-en-vi"));
        QVERIFY(HabitSuggestions::suggest(state, "current", now, 0).isEmpty());
        QVERIFY(HabitSuggestions::suggest(state, "current", now.addDays(31)).isEmpty());
    }
    void habitChipsNavigateWithoutReplacingWork_data() {
        QTest::addColumn<QString>("mode");
        QTest::newRow("light") << QString("light");
        QTest::newRow("dark") << QString("dark");
    }
    void habitChipsNavigateWithoutReplacingWork() {
        QFETCH(QString, mode);
        QTemporaryDir dir;
        auto state = WorkbenchDomain::create("chat", "translation");
        auto sessions = state.value("sessions").toList();
        const qint64 now = QDateTime::currentSecsSinceEpoch();
        for (int i = 0; i < 3; ++i) {
            for (int index : {0, 1, 2}) {
                auto session = sessions[index].toMap();
                session["id"] = QString("history-%1-%2").arg(i).arg(index);
                session["output"] = "Saved";
                session["updated"] = now - 86400 * (i + 1);
                session["archived"] = true;
                if (index == 0) session["chatMode"] = "research";
                if (index == 1) session["source"] = "auto";
                sessions.append(session);
            }
        }
        state["sessions"] = sessions;
        const auto path = dir.filePath("state.json");
        QFile file(path); QVERIFY(file.open(QIODevice::WriteOnly));
        QVERIFY(file.write(QJsonDocument::fromVariant(state).toJson()) > 0); file.close();
        WorkbenchBridge bridge(nullptr, path, false);
        bridge.command("appearance", {{"mode", mode}});
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(window);
        window->resize(820, 640);
        const auto chip = [&](QString action) { return visualItem(window->contentItem(), "habit-" + action, true); };
        QQuickItem *research = nullptr;
        QTRY_VERIFY(research = chip("chat-research"));
        // A failed reload preserves the snapshot for recovery but locks its actions.
        const auto savedState = bridge.state();
        QVERIFY(file.open(QIODevice::WriteOnly | QIODevice::Truncate));
        file.write("{"); file.close();
        bridge.reload();
        QVERIFY(bridge.loadBlocked());
        research = chip("chat-research");
        QVERIFY(research && !research->isEnabled());
        QVERIFY(file.open(QIODevice::WriteOnly | QIODevice::Truncate));
        file.write(QJsonDocument::fromVariant(savedState).toJson()); file.close();
        bridge.reload();
        QTRY_VERIFY((research = chip("chat-research")) && research->isEnabled());
        auto *chipLabel = visualText(research, research->property("text").toString(), true);
        QVERIFY(chipLabel);
        auto largeFont = chipLabel->property("font").value<QFont>();
        largeFont.setPointSize(36);
        chipLabel->setProperty("font", largeFont);
        QTRY_VERIFY(research->height() >= chipLabel->implicitHeight());
        research->forceActiveFocus(Qt::TabFocusReason);
        QTest::keyClick(window, Qt::Key_Space);
        QTRY_COMPARE(current(bridge).value("chatMode").toString(), QString("research"));
        QVERIFY(!window->property("home").toBool());
        QVERIFY(!chip("chat-research"));
        auto *composer = visualItem(window->contentItem(), "chat-composer");
        QQuickItem *translate = nullptr;
        QTRY_VERIFY(translate = chip("translate-auto-vi"));
        QVERIFY(composer);
        QVERIFY(translate->mapToScene(QPointF()).y() >= composer->mapToScene(QPointF(0, composer->height())).y());
        bridge.command("draft", {{"sessionID", "translation"}, {"value", "Keep this translation"}});
        bridge.command("module", {{"id", "dictionary"}, {"enabled", false}});
        QTRY_VERIFY(!chip("dictionary"));
        // Binding updates can replace chips; exercise the current visible control.
        translate = chip("translate-auto-vi"); QVERIFY(translate);
        QVERIFY(QMetaObject::invokeMethod(translate, "clicked"));
        QCOMPARE(current(bridge).value("feature").toString(), QString("translate"));
        QVERIFY(current(bridge).value("id") != "translation");
        QCOMPARE(current(bridge).value("source").toString(), QString("auto"));
        QCOMPARE(current(bridge).value("target").toString(), QString("vi"));
        bridge.command("select", {{"sessionID", "translation"}});
        QCOMPARE(current(bridge).value("draft").toString(), QString("Keep this translation"));
        bridge.command("module", {{"id", "dictionary"}, {"enabled", true}});
        QVERIFY(QMetaObject::invokeMethod(window, "selectRoute", Q_ARG(QVariant, "chat")));
        QQuickItem *lookup = nullptr;
        QTRY_VERIFY(lookup = chip("dictionary"));
        QVERIFY(QMetaObject::invokeMethod(lookup, "clicked"));
        QCOMPARE(current(bridge).value("feature").toString(), QString("dictionary"));
        QVERIFY(QMetaObject::invokeMethod(window, "selectRoute", Q_ARG(QVariant, "chat")));
        bridge.command("draft", {{"value", "Question"}}); bridge.command("submit");
        QTRY_VERIFY(!chip("dictionary"));
        QCOMPARE(warnings.count(), 0);
    }
    void chatReasoningPreservesSessionAndAttempt() {
        QTemporaryDir dir;
        const auto path = dir.filePath("state.json");
        auto legacy = WorkbenchDomain::create("chat", "translation");
        auto sessions = legacy.value("sessions").toList();
        auto chat = sessions.first().toMap();
        chat["carefulReasoning"] = true;
        sessions[0] = chat;
        legacy["sessions"] = sessions;
        QFile file(path);
        QVERIFY(file.open(QIODevice::WriteOnly));
        QVERIFY(file.write(QJsonDocument::fromVariant(legacy).toJson()) > 0);
        file.close();
        WorkbenchBridge bridge(nullptr, path, false);
        QVERIFY(current(bridge).value("carefulReasoning").toBool());
        QVERIFY(!current(bridge).contains("reasoningEffort"));
        // The Glass tools panel reads legacy Careful and follows the active model.
        bridge.command("route", {{"value", "chat"}});
        {
            QQmlApplicationEngine engine;
            QSignalSpy warnings(&engine, &QQmlEngine::warnings);
            engine.rootContext()->setContextProperty("workbench", &bridge);
            engine.load(QUrl("qrc:/qml/Main.qml"));
            QVERIFY(!engine.rootObjects().isEmpty());
            auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(window);
            auto *trigger = visualItem(window->contentItem(), "chat-tools-trigger", true); QVERIFY(trigger);
            QVERIFY(QMetaObject::invokeMethod(trigger, "clicked"));
            auto *panel = window->findChild<QObject *>("chat-tools-panel"); QVERIFY(panel);
            QTRY_VERIFY(panel->property("visible").toBool());
            const auto menuRow = [&](const QString &level) {
                return visualItem(window->contentItem(), "chat-tools-reasoning-" + level);
            };
            auto *high = menuRow("high"), *low = menuRow("low"), *medium = menuRow("medium"), *automatic = menuRow("auto");
            QVERIFY(high && low && medium && automatic);
            QVERIFY(high->property("selected").toBool() && high->property("enabled").toBool());
            QVERIFY(automatic->property("enabled").toBool() && !automatic->property("selected").toBool());
            QVERIFY(!low->property("enabled").toBool() && !medium->property("enabled").toBool());
            bridge.command("model", {{"value", "openai:gpt-5.5"}});
            QTRY_VERIFY(low->property("enabled").toBool() && medium->property("enabled").toBool());
            QVERIFY(QMetaObject::invokeMethod(low, "clicked"));
            QTRY_COMPARE(current(bridge).value("reasoningEffort").toString(), "low");
            bridge.command("draft", {{"value", "Retain this session"}});
            const auto id = current(bridge).value("id");
            bridge.command("new");
            QVERIFY(automatic->property("selected").toBool() && !low->property("selected").toBool());
            bridge.command("select", {{"sessionID", id}});
            QCOMPARE(current(bridge).value("id"), id);
            QVERIFY(low->property("selected").toBool() && !automatic->property("selected").toBool());
            ProviderDiscovery::Snapshot discovered;
            discovered.models["openai"] = {"openai:gpt-5.5", "openai:gpt-5.5-pro"};
            bridge.applyProviderSnapshot(discovered);
            bridge.applyModelTier(id.toString(), "careful");
            QCOMPARE(current(bridge).value("reasoningEffort").toString(), "high");
            QVERIFY(high->property("selected").toBool() && !low->property("selected").toBool());
            QCOMPARE(warnings.count(), 0);
        }
        bridge.command("draft", {{"value", "Question"}});
        bridge.command("submit");
        const auto first = latest(bridge);
        const auto revision = current(bridge).value("revision");
        QVERIFY(first.value("request").toMap().value("carefulReasoning").toBool());
        bridge.command("chatReasoning", {{"value", "high"}});
        QCOMPARE(current(bridge).value("reasoningEffort").toString(), QString("high"));
        QVERIFY(current(bridge).value("carefulReasoning").toBool());
        bridge.command("chatReasoning", {{"value", "medium"}});
        bridge.command("chatReasoning", {{"value", "unknown"}});
        QCOMPARE(current(bridge).value("reasoningEffort").toString(), QString("medium"));
        QVERIFY(!current(bridge).value("carefulReasoning").toBool());
        QCOMPARE(current(bridge).value("revision"), revision);
        QCOMPARE(latest(bridge), first);
        bridge.command("cancel", {{"taskID", first.value("id")}});
        bridge.command("retry", {{"taskID", first.value("id")}});
        QCOMPARE(latest(bridge).value("request"), first.value("request"));
        QCOMPARE(latest(bridge).value("status").toString(), QString("running"));
        bridge.command("cancel", {{"taskID", first.value("id")}});
        bridge.command("navigate", {{"feature", "translate"}});
        const auto translation = current(bridge);
        bridge.command("chatReasoning", {{"value", "high"}});
        QCOMPARE(current(bridge), translation);
        bridge.reload();
        bridge.command("select", {{"sessionID", "chat"}});
        QCOMPARE(current(bridge).value("reasoningEffort").toString(), QString("medium"));
        bridge.command("carefulReasoning", {{"value", true}});
        QCOMPARE(current(bridge).value("reasoningEffort").toString(), QString("high"));
        bridge.command("carefulReasoning", {{"value", false}});
        QCOMPARE(current(bridge).value("reasoningEffort").toString(), QString("auto"));
        bridge.command("chatReasoning", {{"value", "low"}});
        bridge.command("carefulReasoning", {{"value", false}});
        QCOMPARE(current(bridge).value("reasoningEffort").toString(), QString("low"));
        bridge.command("draft", {{"value", "Next question"}});
        bridge.command("submit");
        QCOMPARE(latest(bridge).value("request").toMap().value("reasoningEffort").toString(), QString("low"));
        for (const auto *id : {"openai:gpt-5.5", "claude:claude-opus-5-5", "gemini:gemini-3-pro", "gemini:gemini-2.5-flash"})
            QVERIFY2(bridge.supportsEffort(id), id);
        for (const auto *id : {"ollama:llama3.2", "lmstudio:gpt-5.5", "llamacpp:gemini-3-pro", "openai:gpt-5-chat", "claude:claude-haiku-5-5", "unknown:gpt-5.5"})
            QVERIFY2(!bridge.supportsEffort(id), id);
    }
    void interpretationPlaybackSourceCancelsDuringPreparation() {
        Interpretation live;
        live.configureVoice("edge", {});
        QString preparingSource;
        connect(&live, &Interpretation::playbackChanged, &live, [&] {
            if (!live.preparing()) return;
            preparingSource = live.speakingSource();
            live.silence(); // Stop synchronously, before a provider request can start.
        });
        live.speak("Synthetic sentence", "interpret:s1");
        QCOMPARE(preparingSource, QString("interpret:s1"));
        QVERIFY(live.speakingSource().isEmpty());
        QVERIFY(!live.preparing());
    }
    void interpretationExportErrorKeepsRetryOnPage() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("route", {{"value", "interpret"}});
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(window);
        auto *view = visualItem(window->contentItem(), "interpret-workspace"); QVERIFY(view);
        auto *notice = visualItem(view, "interpret-storage-error"); QVERIFY(notice);
        auto *retry = visualItem(view, "interpret-reload"); QVERIFY(retry);
        const auto sequence = window->property("toastSequence").toInt();
        const auto missing = QUrl::fromLocalFile(dir.filePath("missing/transcript.txt"));
        for (int attempt = 0; attempt < 2; ++attempt) {
            QVERIFY(QMetaObject::invokeMethod(view, "saveSession", Q_ARG(QVariant, missing), Q_ARG(QVariant, false)));
            QCOMPARE(bridge.interpretation()->error(), QString("interpretStorageError"));
            QVERIFY(view->property("exportFailed").toBool());
            QVERIFY(notice->isVisible() && retry->isVisible() && retry->isEnabled());
            QCOMPARE(window->property("toastSequence").toInt(), sequence);
        }
    }
    void interpretationRowPlaybackAndExport_data() {
        QTest::addColumn<QString>("mode");
        QTest::newRow("light") << QString("light");
        QTest::newRow("dark") << QString("dark");
    }
    void interpretationRowPlaybackAndExport() {
        QFETCH(QString, mode);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("appearance", {{"mode", mode}});
        QQmlEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        QQmlComponent component(&engine);
        component.setData(R"(
            import QtQuick
            import QtQuick.Controls
            import "qrc:/qml" as V
            V.Main {
                width: 1280; height: 800
                property QtObject playbackFixture: QtObject {
                    objectName: "fixture"
                    property var current: ({id:"meeting", created:100, model:"demo.slow", source:"en", target:"vi",
                        segments:["a","b"].map(id => ({id, start:0, original:id, translated:"test-" + id, status:"done"}))})
                    property var sessions: [current]
                    property var inputs: []
                    property bool listening: false
                    property bool busy: false
                    property bool blocked: false
                    property bool summarizing: false
                    property real level: 0
                    property string error: "audioError"
                    signal changed()
                    signal failed(string code)
                    property string speakingSource: ""
                    property bool preparing: false
                    property string spokenText: ""
                    function speak(text, source) { speakingSource = source; preparing = true; spokenText = text }
                    function silence() { speakingSource = ""; preparing = false }
                    property bool only: false
                    property bool subtitles: false
                    function exportText(srt, translatedOnly) { only = translatedOnly; subtitles = srt; return "test" }
                    function exportFile(url, srt, translatedOnly) { only = translatedOnly; subtitles = srt }
                }
            }
        )", QUrl("qrc:/interpret-playback-test.qml"));
        QScopedPointer<QObject> owner(component.create());
        QVERIFY2(owner, qPrintable(component.errorString()));
        QVERIFY(QMetaObject::invokeMethod(owner.data(), "selectRoute", Q_ARG(QVariant, "interpret")));
        auto *window = qobject_cast<QQuickWindow *>(owner.data());
        QVERIFY(window);
        auto *view = visualItem(window->contentItem(), "interpret-workspace");
        auto *fixture = owner->findChild<QObject *>("fixture");
        QVERIFY(view && fixture);
        const auto sequence = window->property("toastSequence").toInt();
        QVERIFY(view->setProperty("live", QVariant::fromValue(fixture)));
        auto *notice = visualItem(view, "interpret-storage-error"); QVERIFY(notice);
        QVERIFY(QMetaObject::invokeMethod(fixture, "changed"));
        QCOMPARE(window->property("toastSequence").toInt(), sequence);
        const auto toasts = [window] { return window->property("toasts").value<QJSValue>().toVariant().toList(); };
        for (int attempt = 1; attempt <= 2; ++attempt) {
            QVERIFY(QMetaObject::invokeMethod(fixture, "failed", Q_ARG(QString, "audioError")));
            QVERIFY(QMetaObject::invokeMethod(fixture, "changed"));
            QCOMPARE(window->property("toastSequence").toInt(), sequence + attempt);
            const auto active = toasts();
            QCOMPARE(active.size(), 1);
            const auto toast = active.first().toMap();
            QCOMPARE(toast.value("level").toString(), QString("danger"));
            QCOMPARE(toast.value("key").toString(), QString("interpret-error"));
            QCOMPARE(toast.value("text"), bridge.strings().value("audioError"));
            if (attempt == 1) {
                QVERIFY(QMetaObject::invokeMethod(window, "dismissToast", Q_ARG(QVariant, toast.value("id"))));
                QVERIFY(toasts().isEmpty());
            }
        }
        QVERIFY(!notice->isVisible());
        QVERIFY(fixture->setProperty("error", ""));
        QVERIFY(fixture->setProperty("blocked", true));
        QVERIFY(notice->isVisible());
        QCOMPARE(window->property("toastSequence").toInt(), sequence + 2);
        QVERIFY(fixture->setProperty("blocked", false));
        QQuickItem *a = nullptr, *b = nullptr;
        QTRY_VERIFY(a = visualItem(view, "interpret-speaker-a", true));
        QTRY_VERIFY(b = visualItem(view, "interpret-speaker-b", true));
        QVERIFY(QMetaObject::invokeMethod(a, "clicked"));
        QCOMPARE(fixture->property("spokenText").toString(), QString("test-a"));
        QCOMPARE(fixture->property("speakingSource").toString(), QString("interpret:a"));
        QCOMPARE(a->property("iconName").toString(), QString("history"));
        QCOMPARE(b->property("iconName").toString(), QString("listen"));
        fixture->setProperty("preparing", false);
        QCOMPARE(a->property("iconName").toString(), QString("stop"));
        QVERIFY(QMetaObject::invokeMethod(b, "clicked"));
        QCOMPARE(a->property("iconName").toString(), QString("listen"));
        QCOMPARE(fixture->property("speakingSource").toString(), QString("interpret:b"));
        QVERIFY(QMetaObject::invokeMethod(b, "clicked"));
        QVERIFY(fixture->property("speakingSource").toString().isEmpty());
        auto *copy = visualItem(view, "interpret-copy-glass");
        QVERIFY(copy && copy->isVisible());
        for (bool original : {false, true}) {
            view->setProperty("showOriginal", original);
            QVERIFY(QMetaObject::invokeMethod(copy, "clicked"));
            QCOMPARE(fixture->property("only").toBool(), !original);
            QVERIFY(!fixture->property("subtitles").toBool());
            for (bool srt : {true, false}) {
                QVERIFY(QMetaObject::invokeMethod(view, "saveSession", Q_ARG(QVariant, QUrl::fromLocalFile(dir.filePath("export"))), Q_ARG(QVariant, srt)));
                QCOMPARE(fixture->property("only").toBool(), !original);
                QCOMPARE(fixture->property("subtitles").toBool(), srt);
            }
        }
        QCOMPARE(warnings.count(), 0);
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
    void chatComposerEnter_data() {
        QTest::addColumn<Qt::Key>("key");
        QTest::addColumn<Qt::KeyboardModifiers>("modifiers");
        QTest::newRow("return") << Qt::Key_Return << Qt::KeyboardModifiers{};
        QTest::newRow("keypad") << Qt::Key_Enter << Qt::KeyboardModifiers(Qt::KeypadModifier);
    }
    void chatComposerEnter() {
        QFETCH(Qt::Key, key);
        QFETCH(Qt::KeyboardModifiers, modifiers);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("route", {{"value", "chat"}});
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(window);
        auto *draft = visualItem(window->contentItem(), "chat-draft");
        auto *send = visualItem(window->contentItem(), "chat-send");
        QVERIFY(draft && send);
        const QString hint = bridge.strings().value("send").toString() + " (Enter) · "
            + bridge.strings().value("ai_chat_popup_new_line").toString() + " (Shift+Enter)";
        QCOMPARE(qmlValue(send, "Accessible.description").toString(), hint);
        draft->forceActiveFocus();
        QTRY_VERIFY(draft->hasActiveFocus());

        for (const QString empty : {QString(""), QString("  ")}) {
            draft->setProperty("text", empty);
            QVERIFY(!send->isEnabled());
            QTest::keyClick(window, key, modifiers);
            QCOMPARE(current(bridge).value("draft").toString(), empty);
            QVERIFY(bridge.state().value("tasks").toList().isEmpty());
        }

        draft->setProperty("text", "ab");
        draft->setProperty("cursorPosition", 1);
        QTest::keyClick(window, key, modifiers | Qt::ShiftModifier);
        QCOMPARE(current(bridge).value("draft").toString(), QString("a\nb"));
        QVERIFY(bridge.state().value("tasks").toList().isEmpty());

        QInputMethodEvent preedit(QStringLiteral("に"), {});
        QCoreApplication::sendEvent(draft, &preedit);
        QVERIFY(draft->property("inputMethodComposing").toBool());
        QVERIFY(!send->isEnabled());
        QTest::keyClick(window, key, modifiers);
        QVERIFY(bridge.state().value("tasks").toList().isEmpty());
        QCOMPARE(current(bridge).value("draft").toString(), QString("a\nb"));
        QVERIFY(draft->property("inputMethodComposing").toBool());
        QCOMPARE(draft->property("preeditText").toString(), QStringLiteral("に"));
        QInputMethodEvent commit;
        commit.setCommitString(QStringLiteral("日"));
        QCoreApplication::sendEvent(draft, &commit);
        QVERIFY(!draft->property("inputMethodComposing").toBool());
        const QString message = QStringLiteral("a\n日b");
        QCOMPARE(current(bridge).value("draft").toString(), message);

        ProviderDiscovery::Snapshot providers;
        providers.checked = true;
        bridge.applyProviderSnapshot(providers);
        QVERIFY(!send->isEnabled());
        QTest::keyClick(window, key, modifiers);
        QVERIFY(bridge.state().value("tasks").toList().isEmpty());
        QCOMPARE(current(bridge).value("draft").toString(), message);
        providers.models["ollama"] = {"ollama:llama3.2"};
        bridge.applyProviderSnapshot(providers);
        bridge.command("model", {{"value", "ollama:llama3.2"}});
        QVERIFY(send->isEnabled());
        QTest::keyClick(window, key, modifiers);
        QCOMPARE(bridge.state().value("tasks").toList().size(), 1);
        const auto task = latest(bridge);
        QCOMPARE(task.value("request").toMap().value("input").toString(), message);
        QCOMPARE(task.value("status").toString(), QString("running"));

        draft->setProperty("text", "Follow-up");
        const auto running = bridge.state();
        QTest::keyClick(window, key, modifiers);
        QTest::keyClick(window, key, modifiers | Qt::ControlModifier);
        QCOMPARE(bridge.state(), running);
        bridge.command("receive", {{"taskID", task.value("id")}, {"attemptID", task.value("attemptID")}, {"terminal", "succeeded"}});
        QTest::keyClick(window, key, modifiers | Qt::ControlModifier);
        QCOMPARE(bridge.state().value("tasks").toList().size(), 2);
        const auto followUp = latest(bridge);
        QCOMPARE(followUp.value("request").toMap().value("input").toString(), QString("Follow-up"));
        bridge.command("cancel", {{"taskID", followUp.value("id")}});
        draft->setProperty("text", "Keep draft");
        QVERIFY(send->isEnabled());
        QVERIFY(writeBytes(dir.filePath("state.json"), "{"));
        bridge.reload();
        QVERIFY(bridge.loadBlocked());
        QVERIFY(!send->isEnabled());
        const auto blocked = bridge.state();
        QTest::keyClick(window, key, modifiers);
        QCOMPARE(bridge.state(), blocked);
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
        QTest::addColumn<QString>("mode");
        for (const auto &locale : {"vi", "en", "ja"})
            for (int width : {640, 820, 1200, 1440}) {
                for (const auto &mode : {"light", "dark"})
                    QTest::newRow(qPrintable(QString("%1-%2-glass-%3").arg(locale).arg(width).arg(mode)))
                        << QString(locale) << width << QString(mode);
            }
    }
    void navigationSelectionSurvivesRepeatedActivation() {
        QFETCH(QString, locale); QFETCH(int, width);
        QFETCH(QString, mode);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        // Feature regression fixtures resume Chat; fresh production installs open Home.
        bridge.command("route", {{"value", "chat"}});
        bridge.command("locale", {{"value", locale}});
        bridge.command("appearance", {{"mode", mode}});
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
        auto *search = visualItem(root->contentItem(), "navigation-search", true);
        QVERIFY(search);
        QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "history"), Q_ARG(QVariant, QVariant::fromValue(opener))));
        QVERIFY(QMetaObject::invokeMethod(search, "clicked"));
        auto *palette = root->findChild<QObject *>("command-palette");
        QVERIFY(palette);
        QTRY_VERIFY(palette->property("visible").toBool());
        auto *commandSearch = visualItem(root->contentItem(), "command-search", true);
        QVERIFY(commandSearch);
        QVERIFY(QMetaObject::invokeMethod(root, "execute", Q_ARG(QVariant, "activity"), Q_ARG(QVariant, QVariant::fromValue(commandSearch))));
        QTest::keyClick(root, Qt::Key_Escape);
        QTRY_VERIFY(search->hasActiveFocus());
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
        const auto margin = metrics.value("small").toDouble();
        const auto rail = metrics.value("rail").toDouble() + margin;
        const auto sidebar = metrics.value("sidebar").toDouble() + margin;
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
        bridge.command("appearance", {{"mode", mode}});
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
            QVERIFY(top >= 0); QVERIFY(bottom <= root->height());
            // The menu never covers its opener: above it, or below when that side has more room.
            const auto openerTop = opener->mapToScene(QPointF()).y();
            const bool belowOpener = toolsPanel->property("placeBelow").toBool();
            if (belowOpener) { QVERIFY(top >= openerTop + opener->height()); QVERIFY(root->height() - (openerTop + opener->height()) > openerTop); }
            else QVERIFY(bottom <= openerTop);
            QVERIFY(belowOpener || toolsPanel->property("above").toDouble() >= toolsPanel->property("needed").toDouble() || toolsPanel->property("above").toDouble() >= toolsPanel->property("below").toDouble());
            auto *attach = visualItem(root->contentItem(), "chat-tools-attach"); QVERIFY(attach);
            QVERIFY(!attach->property("visualFocus").toBool());
            auto *scroll = visualItem(root->contentItem(), "chat-tools-scroll"); QVERIFY(scroll);
            auto *flick = scroll->property("contentItem").value<QQuickItem *>(); QVERIFY(flick);
            auto *stop = visualItem(root->contentItem(), "chat-tools-stop"); QVERIFY(stop);
            flick->setProperty("contentY", scroll->property("contentHeight").toDouble() - scroll->property("availableHeight").toDouble());
            QTRY_VERIFY(stop->mapToScene(QPointF(0, stop->height())).y() <= bottom);
            QVERIFY(stop->mapToScene(QPointF()).y() >= top);
            QVERIFY(stop->mapToScene(QPointF(stop->width(), 0)).x() <= root->width());
            for (const auto &level : {QString("auto"), QString("low"), QString("medium"), QString("high")}) {
                auto *row = visualItem(root->contentItem(), "chat-tools-reasoning-" + level);
                QVERIFY(row);
                QCOMPARE(row->isEnabled(), level == "auto" || level == "high");
                QCOMPARE(row->property("selected").toBool(), level == "auto");
            }
            auto *reasoning = visualItem(root->contentItem(), "chat-tools-reasoning-high"); QVERIFY(reasoning);
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
        QStringList navigation;
        for (const auto &entry : bridge.resources().value("navigation").toList())
            navigation.append(entry.toMap().value("id").toString());
        QCOMPARE(actualPages, navigation);
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
        bridge.command("appearance", {{"mode", mode}});
        ProviderDiscovery::Snapshot snapshot; snapshot.checked = true; bridge.applyProviderSnapshot(snapshot);
        QQmlApplicationEngine engine; QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge); engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(root);
        root->resize(1280, 800); QCoreApplication::processEvents();
        auto *opener = visualItem(root->contentItem(), "chat-tools-trigger"); QVERIFY(opener);
        auto *tools = root->findChild<QObject *>("chat-tools-panel"); QVERIFY(tools);
        const bool accessibilityWasActive = QAccessible::isActive();
        QAccessible::setActive(true);
        const auto restoreAccessibility = qScopeGuard([accessibilityWasActive] { QAccessible::setActive(accessibilityWasActive); });
        auto *accessibleOpener = QAccessible::queryAccessibleInterface(opener);
        QVERIFY(accessibleOpener);
        QVERIFY(!accessibleOpener->state().checked);
        QSignalSpy toolsClosed(tools, SIGNAL(closed()));
        const auto center = [](QQuickItem *item) { return item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint(); };
        QTest::mouseMove(root, center(opener));
        QTest::mouseClick(root, Qt::LeftButton, Qt::NoModifier, center(opener));
        QTRY_VERIFY(tools->property("visible").toBool());
        const auto openState = accessibleOpener->state();
        QVERIFY((openState.expandable && openState.expanded) || (openState.checkable && openState.checked));
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
        QVERIFY(!accessibleOpener->state().expanded && !accessibleOpener->state().checked);
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
        // Wait for the active-chat layout before clicking its new on-screen position.
        // Processing pending events once can leave the opener at its empty-chat position.
        const auto metrics = bridge.metrics();
        const auto roomNeeded = tools->property("needed").toDouble() + metrics.value("small").toDouble() + metrics.value("inset").toDouble();
        QTRY_VERIFY(opener->mapToScene(QPointF()).y() >= roomNeeded);
        QTest::mouseClick(root, Qt::LeftButton, Qt::NoModifier, center(opener));
        QTRY_VERIFY(tools->property("visible").toBool());
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
        bridge.command("appearance", {{"mode", mode}});
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
            if (width == 640) {
                // Shell-Minimum moves recording into Tools; hidden controls have no layout slot.
                QVERIFY(!record->isVisible());
                QVERIFY(trigger->mapToScene(QPointF(trigger->width(), 0)).x() <= send->mapToScene(QPointF()).x());
            } else {
                QVERIFY(record->isVisible());
                QVERIFY(trigger->mapToScene(QPointF(trigger->width(), 0)).x() <= record->mapToScene(QPointF()).x());
                QVERIFY(record->mapToScene(QPointF(record->width(), 0)).x() <= send->mapToScene(QPointF()).x());
            }
        }
        const QString fiveLines = QString::fromUtf8("Một\nHai\n三\n四\nFive");
        editor->setProperty("text", fiveLines);
        QTRY_VERIFY(!composer->property("singleRow").toBool());
        QTRY_VERIFY(scroll->height() >= editor->height() - 1);
        const auto cap = scroll->height(); editor->setProperty("text", fiveLines + "\nSix");
        QTRY_VERIFY(editor->height() > scroll->height()); QCOMPARE(scroll->height(), cap);
        for (const QString accent : {"teal", "violet", "auto"}) {
            bridge.command("appearance", {{"accent", accent}}); QCoreApplication::processEvents();
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
    void historyRenameDialog_data() {
        QTest::addColumn<bool>("failSave");
        QTest::newRow("keyboard") << false;
        QTest::newRow("save-failure") << true;
    }
    void historyRenameDialog() {
        QFETCH(bool, failSave);
        QTemporaryDir dir;
        const auto path = dir.filePath("state.json");
        WorkbenchBridge bridge(nullptr, path, false);
        bridge.command("route", {{"value", "chat"}});
        bridge.command("draft", {{"value", "First session"}});
        const auto target = current(bridge).value("id");
        bridge.command("new");
        bridge.command("draft", {{"value", "Second session"}});
        bridge.save();
        const auto active = current(bridge).value("id");
        QVERIFY(target != active && bridge.storageError().isEmpty());
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(window);
        window->resize(1280, 800);
        window->requestActivate(); QTRY_VERIFY(window->isActive());
        window->setProperty("library", true);
        window->setProperty("previewID", target);
        auto *rename = visualItem(window->contentItem(), "history-rename", true);
        QVERIFY(rename && rename->isEnabled());
        QVERIFY(QMetaObject::invokeMethod(rename, "clicked"));
        auto *dialog = window->findChild<QObject *>("history-rename-dialog");
        auto *input = visualItem(window->contentItem(), "history-rename-input");
        QVERIFY(dialog && input);
        QTRY_VERIFY(input->hasActiveFocus());
        const auto before = bridge.state().value("sessions");
        if (!failSave) {
            for (auto key : {Qt::Key_Delete, Qt::Key_Down, Qt::Key_Up}) {
                QTest::keyClick(window, key);
                QCOMPARE(window->property("previewID"), target);
                QCOMPARE(bridge.state().value("sessions"), before);
                QVERIFY(input->hasActiveFocus());
            }
            QTest::keyClick(window, Qt::Key_Escape);
            QTRY_VERIFY(!dialog->property("visible").toBool());
            QVERIFY(window->property("library").toBool());
            QVERIFY(QMetaObject::invokeMethod(rename, "clicked"));
            QTRY_VERIFY(input->hasActiveFocus());
        } else {
            QVERIFY(QFile::rename(path, dir.filePath("before.json")));
            QVERIFY(QDir().mkdir(path)); // Deterministic write failure, including for privileged test users.
        }
        input->setProperty("text", "Renamed fixture");
        QTest::keyClick(window, Qt::Key_Return);
        QTRY_VERIFY(!dialog->property("visible").toBool());
        QVERIFY(window->property("library").toBool());
        QCOMPARE(current(bridge).value("id"), active);
        const auto renamed = bridge.strings().value("historyRenamed").toString();
        QVERIFY(!renamed.isEmpty());
        const auto toasts = window->property("toasts").value<QJSValue>().toVariant().toList();
        const bool notified = std::any_of(toasts.cbegin(), toasts.cend(), [&](const QVariant &toast) {
            return toast.toMap().value("text") == renamed;
        });
        QCOMPARE(!bridge.storageError().isEmpty(), failSave);
        QCOMPARE(notified, !failSave);
        if (!failSave) {
            QFile stored(path); QVERIFY(stored.open(QIODevice::ReadOnly));
            const auto saved = QJsonDocument::fromJson(stored.readAll()).toVariant().toMap().value("sessions").toList();
            const auto found = std::find_if(saved.cbegin(), saved.cend(), [&](const QVariant &row) { return row.toMap().value("id") == target; });
            QVERIFY(found != saved.cend());
            QCOMPARE(found->toMap().value("title").toString(), "Renamed fixture");
        }
    }
    void shellToastStack() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(window);
        const auto toasts = [&] { return window->property("toasts").value<QJSValue>().toVariant().toList(); };
        qmlValue(window, "notify('First error', null, true)");
        qmlValue(window, "notify('Old success')");
        qmlValue(window, "notify('Second error', function() {}, true, undefined, 'retry')");
        auto rows = toasts();
        QCOMPARE(rows.size(), 3);
        QCOMPARE(rows[0].toMap().value("level").toString(), "danger");
        QCOMPARE(rows[1].toMap().value("level").toString(), "success");
        QCOMPARE(rows[0].toMap().value("key"), rows[0].toMap().value("id"));
        QVERIFY(rows[0].toMap().value("key") != rows[1].toMap().value("key"));
        const auto cardName = [](const QVariant &row) {
            return "shell-toast-" + row.toMap().value("id").toString();
        };
        auto *danger = visualItem(window->contentItem(), cardName(rows[2]));
        QVERIFY(danger);
        auto *timer = danger->findChild<QObject *>("toast-timer");
        QVERIFY(timer && timer->property("running").isValid());
        QVERIFY(!timer->property("running").toBool());
        const auto replacedId = rows[2].toMap().value("id");

        qmlValue(window, "notify('New success')");
        rows = toasts();
        QCOMPARE(rows.size(), 3);
        QCOMPARE(rows[0].toMap().value("text").toString(), "First error");
        QCOMPARE(rows[1].toMap().value("text").toString(), "Second error");
        QCOMPARE(rows[2].toMap().value("text").toString(), "New success");
        qmlValue(window, "notify('Recovered', null, true, 'info', 'retry')");
        rows = toasts();
        QCOMPARE(rows.size(), 3);
        QCOMPARE(rows[1].toMap().value("text").toString(), "New success");
        const auto replacement = rows[2].toMap();
        QCOMPARE(replacement.value("text").toString(), "Recovered");
        QCOMPARE(replacement.value("key").toString(), "retry");
        QCOMPARE(replacement.value("level").toString(), "info");
        QVERIFY(replacement.value("id") != replacedId);
        QVERIFY(!visualItem(window->contentItem(), "shell-toast-" + replacedId.toString()));
        checkAccessible(window->contentItem(), cardName(rows[2]), QAccessible::StatusBar, "Recovered");

        for (const auto text : {"A", "B", "C", "D"})
            qmlValue(window, QString("notify('%1', null, true)").arg(text));
        rows = toasts();
        QCOMPARE(rows.size(), 3);
        QCOMPARE(rows[0].toMap().value("text").toString(), "B");
        QCOMPARE(rows[2].toMap().value("text").toString(), "D");
    }
    void shellToastInteraction() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(window);
        window->requestActivate();
        QTRY_VERIFY(window->isActive());
        QTest::mouseMove(window, QPoint(1, 1));
        auto *header = visualItem(window->contentItem(), "shell-header");
        QVERIFY(header);
        header->forceActiveFocus();
        const auto newestCard = [&] {
            const auto rows = window->property("toasts").value<QJSValue>().toVariant().toList();
            return rows.isEmpty() ? nullptr : visualItem(window->contentItem(), "shell-toast-" + rows.last().toMap().value("id").toString());
        };
        qmlValue(window, "notify('Warning with Undo', function() {}, false, 'warning')");
        auto *older = newestCard();
        QVERIFY(older);
        qmlValue(window, "notify('Warning', null, false, 'warning')");
        auto *newer = newestCard();
        QVERIFY(newer);
        auto *undo = visualItem(older, "toast-undo");
        auto *close = visualText(newer, bridge.strings().value("close").toString());
        auto *actionTimer = older->findChild<QObject *>("toast-timer");
        auto *warningTimer = newer->findChild<QObject *>("toast-timer");
        QVERIFY(undo && close && actionTimer && warningTimer);
        const auto metrics = bridge.metrics();
        QCOMPARE(actionTimer->property("interval").toInt(), 1000 * metrics.value("toastActionSeconds").toInt());
        QCOMPARE(warningTimer->property("interval").toInt(), 1000 * metrics.value("toastWarningSeconds").toInt());
        checkAccessible(window->contentItem(), newer->objectName(), QAccessible::AlertMessage, "Warning");
        QTRY_COMPARE(newer->mapToScene({}).y(), header->mapToScene({0, header->height()}).y() + metrics.value("small").toReal());
        QCOMPARE(newer->mapToScene({newer->width(), 0}).x(), header->mapToScene({header->width(), 0}).x() - metrics.value("inset").toReal());
        QVERIFY(newer->y() < older->y());
        QTest::keyClick(window, Qt::Key_Escape);
        QCOMPARE(newestCard(), newer);
        QVERIFY(warningTimer->property("running").toBool());
        QTest::mouseMove(window, close->mapToScene(close->boundingRect().center()).toPoint());
        QTRY_VERIFY(!warningTimer->property("running").toBool() && !actionTimer->property("running").toBool());
        close->forceActiveFocus(Qt::TabFocusReason);
        QTest::mouseMove(window, QPoint(1, 1));
        QTest::keyClick(window, Qt::Key_Tab);
        QCOMPARE(window->activeFocusItem(), undo);
        QVERIFY(!warningTimer->property("running").toBool() && !actionTimer->property("running").toBool());
        qmlValue(window, "notify('Brief')");
        auto *brief = newestCard();
        QVERIFY(brief);
        auto *briefTimer = brief->findChild<QObject *>("toast-timer");
        QVERIFY(briefTimer);
        QCOMPARE(briefTimer->property("interval").toInt(), 1000 * metrics.value("toastBriefSeconds").toInt());
        QVERIFY(!briefTimer->property("running").toBool());
        QCOMPARE(window->activeFocusItem(), undo);
        QTest::keyClick(window, Qt::Key_Escape);
        QCOMPARE(newestCard(), newer);
        QCOMPARE(window->activeFocusItem(), undo);
        header->forceActiveFocus();
        QTRY_VERIFY(warningTimer->property("running").toBool() && actionTimer->property("running").toBool());
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
        state["sessions"] = sessions; state["appearance"] = QVariantMap{{"mode", mode}, {"textSize", "medium"}};
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
    void researchChipFollowsRunningTask() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("draft", {{"value", "Synthetic question"}});
        bridge.command("submit");
        const auto task = latest(bridge);
        const auto id = task.value("id").toString();
        QQmlEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        QQmlComponent component(&engine, QUrl("qrc:/qml/ChatTranscript.qml"));
        QQuickWindow window;
        QScopedPointer<QObject> owner(component.createWithInitialProperties({
            {"bridge", QVariant::fromValue(&bridge)}, {"session", current(bridge)},
            {"readingPointSize", 13}, {"width", 640}, {"height", 480}}));
        QVERIFY2(owner, qPrintable(component.errorString()));
        auto *root = qobject_cast<QQuickItem *>(owner.data());
        QVERIFY(root);
        root->setParentItem(window.contentItem());
        window.show();
        for (const auto &[seconds, expected] : QList<QPair<double, QString>>{
                 {0, "0:00"}, {102.9, "1:42"}, {3725, "1:02:05"},
                 {-1, "0:00"}, {qQNaN(), "0:00"}, {qInf(), "0:00"}}) {
            QVariant formatted;
            QVERIFY(QMetaObject::invokeMethod(root, "elapsed", Q_RETURN_ARG(QVariant, formatted), Q_ARG(QVariant, seconds)));
            QCOMPARE(formatted.toString(), expected);
        }
        QQuickItem *chip = nullptr;
        QTRY_VERIFY(chip = visualItem(root, "chat-answering-" + id, true));
        QCOMPARE(chip->property("text").toString(), bridge.strings().value("chatAnswering").toString());
        QVERIFY(!visualItem(root, "chat-research-stop-" + id, true));
        bridge.command("chatMode", {{"value", "research"}});
        root->setProperty("session", current(bridge));
        QVERIFY(visualItem(root, "chat-answering-" + id, true));
        QVERIFY(!visualItem(root, "chat-research-stop-" + id, true));
        QVERIFY(chip->property("now").toDouble() >= QDateTime::currentSecsSinceEpoch() - 2);
        bridge.command("chatMode", {{"value", "text"}});
        root->setProperty("session", current(bridge));
        auto webTask = task;
        auto request = task.value("request").toMap();
        request["chatMode"] = "web"; webTask["request"] = request;
        root->setProperty("snapshot", QVariantMap{{"tasks", QVariantList{webTask}}});
        QVERIFY(visualItem(root, "chat-research-stop-" + id, true));
        root->setProperty("snapshot", bridge.state());
        const QVariantMap research{{"phase", "survey"}};
        bridge.command("receive", {{"taskID", id}, {"attemptID", task.value("attemptID")}, {"research", research}});
        root->setProperty("snapshot", bridge.state());
        QTRY_VERIFY(chip = visualItem(root, "chat-researching-" + id, true));
        const auto label = bridge.strings().value("researching").toString();
        QTRY_VERIFY(chip->property("now").toDouble() > 0);
        auto legacy = latest(bridge);
        legacy["started"] = chip->property("now").toDouble() - 102.9;
        root->setProperty("snapshot", QVariantMap{{"tasks", QVariantList{legacy}}});
        const auto first = bridge.strings().value("researchingElapsed").toString().replace("{time}", "1:42");
        QCOMPARE(chip->property("text").toString(), first);
        QCOMPARE(qmlValue(chip, "Accessible.name").toString(), label);
        QTRY_VERIFY_WITH_TIMEOUT(chip->property("text").toString() != first, 4000);
        QCOMPARE(qmlValue(chip, "Accessible.name").toString(), label);
        auto *clockText = visualText(chip->property("contentItem").value<QQuickItem *>(), chip->property("text").toString());
        QVERIFY(clockText && qmlValue(clockText, "Accessible.ignored").toBool());

        legacy.remove("started");
        root->setProperty("snapshot", QVariantMap{{"tasks", QVariantList{legacy}}});
        QTRY_COMPARE(chip->property("text").toString(), label);
        QVERIFY(visualItem(root, "chat-research-stop-" + id, true));
        bridge.command("receive", {{"taskID", id}, {"attemptID", task.value("attemptID")}, {"terminal", "succeeded"}});
        root->setProperty("snapshot", bridge.state());
        QVERIFY(QMetaObject::invokeMethod(root, "reconcile"));
        QTRY_VERIFY(!chip->isVisible());
        QVERIFY(!visualItem(root, "chat-research-stop-" + id, true));
        QCOMPARE(warnings.count(), 0);
    }

    void glassChatStates_data() { glassHistoryActions_data(); }
    void glassChatStates() {
        QFETCH(int, width); QFETCH(QString, mode);
        QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("route", {{"value", "chat"}}); bridge.command("appearance", {{"mode", mode}});
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
        QTest::keyClick(root, Qt::Key_Return); QTRY_COMPARE(bridge.state().value("tasks").toList().size(), 1);
        const auto first = latest(bridge); const auto id = first.value("id").toString();
        QQuickItem *answering = nullptr; QTRY_VERIFY(answering = visualItem(root->contentItem(), "chat-answering-" + id)); QTRY_VERIFY(answering->isVisible());
        auto *send = visualItem(root->contentItem(), "chat-send"); QVERIFY(send); QVERIFY(send->isEnabled());
        chunk(bridge, first, "Streaming");
        QTRY_VERIFY(visualText(root->contentItem(), "Streaming", true));
        QVERIFY(!visualItem(root->contentItem(), "chat-speak-" + id, true));
        bridge.command("receive", {{"taskID", id}, {"attemptID", first.value("attemptID")}, {"chunk", "Partial answer"}, {"terminal", "failed"}, {"errorCode", "providerError"}});
        QQuickItem *failure = nullptr; QTRY_VERIFY(failure = visualItem(root->contentItem(), "chat-failure-" + id)); QTRY_VERIFY(failure->isVisible());
        QQuickItem *retry = nullptr; QTRY_VERIFY(retry = visualItem(root->contentItem(), "chat-retry-" + id)); QTRY_VERIFY(retry->isVisible() && retry->isEnabled());
        bridge.command("model", {{"value", "ollama:new-model"}}); QVERIFY(QMetaObject::invokeMethod(retry, "clicked"));
        QTRY_COMPARE(latest(bridge).value("status").toString(), QString("running")); QVERIFY(latest(bridge).value("attemptID") != first.value("attemptID"));
        QCOMPARE(latest(bridge).value("request").toMap().value("model"), first.value("request").toMap().value("model"));
        const auto retried = latest(bridge);
        bridge.command("receive", {{"taskID", id}, {"attemptID", retried.value("attemptID")}, {"chunk", "Complete answer"}, {"terminal", "succeeded"}, {"usage", QVariantMap{{"input", 12}, {"output", 24}}}});
        QTRY_VERIFY(!failure->isVisible()); QTRY_VERIFY(!answering->isVisible()); QTRY_VERIFY(retry->isVisible());
        checkSpeechAction(visualItem(root->contentItem(), "chat-speak-" + id), "Complete answer",
                          bridge.speechLanguage("Complete answer", bridge.locale()), id);
        auto *meta = visualItem(root->contentItem(), "chat-meta-" + id); QVERIFY(meta); QTRY_VERIFY(meta->property("text").toString().contains("36"));
        const auto locale = bridge.resources().value("locales").toMap().value("vi").toMap();
        QVERIFY(meta->property("text").toString().contains(locale.value("durationSeconds").toString().section("{n}", 1)));
        auto *copy = visualItem(root->contentItem(), "chat-copy-" + id); QVERIFY(copy); QVERIFY(QMetaObject::invokeMethod(copy, "clicked"));
        QTRY_VERIFY(!root->property("toasts").value<QJSValue>().toVariant().toList().isEmpty());
        bridge.command("chatMode", {{"value", "web"}});
        bridge.command("draft", {{"value", "Second question"}}); bridge.command("submit"); QTRY_VERIFY(!retry->isVisible());
        const auto second = latest(bridge);
        const auto secondID = second.value("id").toString();
        QVERIFY(!second.contains("research"));
        QQuickItem *chip = nullptr, *stop = nullptr;
        QTRY_VERIFY(chip = visualItem(root->contentItem(), "chat-researching-" + secondID, true));
        QTRY_VERIFY(stop = visualItem(root->contentItem(), "chat-research-stop-" + secondID, true));
        QCOMPARE(qmlValue(stop, "Accessible.name").toString(), bridge.strings().value("stop").toString());
        QCOMPARE(send->property("text"), stop->property("text"));
        QVERIFY(send->isVisible() && send->isEnabled());
        QCOMPARE(stop->parentItem(), chip->parentItem());
        QTRY_VERIFY(stop->x() >= chip->x() + chip->width());
        QTRY_VERIFY(qAbs(stop->y() + stop->height() / 2 - chip->y() - chip->height() / 2) <= 1);

        const auto otherSession = bridge.createDetachedSession("chat", "Background question");
        bridge.command("submit", {{"sessionID", otherSession}});
        const auto background = latest(bridge);
        QCOMPARE(background.value("request").toMap().value("sessionID").toString(), otherSession);
        QCOMPARE(background.value("status").toString(), "running");
        stop->forceActiveFocus(Qt::TabFocusReason);
        QTRY_VERIFY(stop->hasActiveFocus());
        QTest::keyClick(root, Qt::Key_Space);
        QTRY_VERIFY(!visualItem(root->contentItem(), "chat-research-stop-" + secondID, true));
        QVERIFY(!visualItem(root->contentItem(), "chat-researching-" + secondID, true));
        const auto cancelled = bridge.state().value("tasks").toList().value(1).toMap();
        QCOMPARE(cancelled.value("id").toString(), secondID);
        QCOMPARE(cancelled.value("status").toString(), "cancelled");
        QCOMPARE(latest(bridge), background);
        QTRY_VERIFY(visualItem(root->contentItem(), "chat-failure-" + secondID, true));
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
        state["appearance"] = QVariantMap{{"mode", mode}, {"textSize", "medium"}};
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
        auto *editor = visualItem(root->contentItem(), "chat-draft");
        auto *send = visualItem(root->contentItem(), "chat-send");
        QVERIFY(editor && send && send->isEnabled());
        QVERIFY(current(bridge).value("draft").toString().isEmpty());
        editor->forceActiveFocus();
        QTest::keyClick(root, Qt::Key_Return);
        const auto imageTask = latest(bridge);
        QCOMPARE(imageTask.value("status").toString(), QString("running"));
        const auto messages = imageTask.value("request").toMap().value("messages").toList();
        QVERIFY(!messages.isEmpty());
        QCOMPARE(messages.constLast().toMap().value("images").toList().value(0).toMap().value("id"), attachment.value("id"));
        bridge.command("receive", {{"taskID", imageTask.value("id")}, {"attemptID", imageTask.value("attemptID")}, {"images", QVariantList{attachment}}, {"terminal", "succeeded"}});
        QQuickItem *copyImage = nullptr; QTRY_VERIFY(copyImage = visualItem(root->contentItem(), "chat-copy-image-" + attachment.value("id").toString()));
        QVERIFY(QMetaObject::invokeMethod(copyImage, "clicked")); QVERIFY(!QGuiApplication::clipboard()->image().isNull());
        QCOMPARE(QGuiApplication::clipboard()->image().size(), QSize(64, 48));
        auto *transcript = visualItem(root->contentItem(), "chat-transcript"); QVERIFY(transcript); QVariant caption;
        QVERIFY(QMetaObject::invokeMethod(transcript, "imageCaption", Q_RETURN_ARG(QVariant, caption), Q_ARG(QVariant, QVariantList{attachment}), Q_ARG(QVariant, latest(bridge))));
        QVERIFY(caption.toString().contains("64×48")); QVERIFY(caption.toString().contains("GPT Image 1"));
        bridge.command("draft", {{"value", "Research question"}}); bridge.command("chatMode", {{"value", "research"}}); bridge.command("submit");
        const auto researchTask = latest(bridge);
        const auto researchID = researchTask.value("id").toString();
        QVERIFY(!researchTask.contains("research"));
        QTRY_VERIFY(visualItem(root->contentItem(), "chat-researching-" + researchID, true));
        QTRY_VERIFY(visualItem(root->contentItem(), "chat-research-stop-" + researchID, true));
        const QVariantMap research{{"phase", "survey"}, {"queries", QStringList{"Synthetic query"}}, {"cursor", 0}, {"findings", QStringList{"Synthetic evidence"}}, {"sources", QVariantList{QVariantMap{{"title", "Synthetic source"}, {"url", "https://example.org"}}}}, {"crossReference", "Synthetic cross-reference"}};
        bridge.command("receive", {{"taskID", researchTask.value("id")}, {"attemptID", researchTask.value("attemptID")}, {"research", research}});
        QQuickItem *researchToggle = nullptr; QTRY_VERIFY(researchToggle = visualItem(root->contentItem(), "chat-research-" + researchTask.value("id").toString()));
        QTRY_VERIFY(researchToggle->isVisible()); researchToggle->setProperty("checked", true); QVERIFY(QMetaObject::invokeMethod(researchToggle, "toggled"));
        QTRY_VERIFY(visualText(root->contentItem(), "Synthetic source"));
        auto *composerStop = visualItem(root->contentItem(), "chat-send", true);
        QVERIFY(composerStop && composerStop->isEnabled());
        QCOMPARE(composerStop->property("text").toString(), bridge.strings().value("stop").toString());
        QVERIFY(QMetaObject::invokeMethod(composerStop, "clicked"));
        QTRY_COMPARE(latest(bridge).value("status").toString(), "cancelled");
        QVERIFY(!visualItem(root->contentItem(), "chat-research-stop-" + researchID, true));
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
        QTest::addColumn<QString>("mode");
        QTest::newRow("light") << QString("light");
        QTest::newRow("dark") << QString("dark");
    }
    void glassDialogPreservesStandardActions() {
        QFETCH(QString, mode);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("appearance", {{"mode", mode}});
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
        for (const QString accent : {"pink", "teal", "auto"}) {
            bridge.command("appearance", {{"accent", accent}});
            QCoreApplication::processEvents();
            QVERIFY(qmlValue(dialog, "!!Overlay.modal").toBool());
            QCOMPARE(dialog->property("footer").value<QObject *>(), footer);
            QVERIFY(QMetaObject::invokeMethod(dialog, "open"));
            QTRY_VERIFY(dialog->property("visible").toBool());
            QCOMPARE(dialog->property("background").value<QQuickItem *>(), nativeBackground);
            QCOMPARE(dialog->property("header").value<QQuickItem *>(), nativeHeader);
            QVERIFY(!nativeBackground->isVisible());
            QCOMPARE(dialog->property("padding").toDouble(), nativePadding);
            QVariant result;
            QVERIFY(QMetaObject::invokeMethod(dialog, "acceptButton", Q_RETURN_ARG(QVariant, result)));
            auto *button = qobject_cast<QQuickItem *>(result.value<QObject *>());
            QVERIFY(button);
            QVERIFY(button->metaObject()->indexOfProperty("glassMaterial") >= 0);
            QVERIFY(button->property("glassMaterial").toBool());
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
        bridge.command("appearance", {{"mode", mode}});
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
    void invalidSnapshotBlocksWrites_data() {
        QTest::addColumn<QString>("field");
        QTest::addColumn<QVariant>("invalidValue");
        QTest::newRow("future-schema") << QString("schemaVersion") << QVariant(99);
        QTest::newRow("missing-task-list") << QString("tasks") << QVariant{};
        QTest::newRow("disabled-modules-scalar") << QString("disabledModules") << QVariant("bridge");
        QTest::newRow("task-object") << QString("tasks") << QVariant(QVariantMap{{"pending", "job"}});
        QTest::newRow("collapsed-string") << QString("shell")
            << QVariant(QVariantMap{{"navigationCollapsed", "false"}});
        QTest::newRow("invalid-appearance") << QString("appearance")
            << QVariant(QVariantMap{{"mode", "invalid"}, {"textSize", "large"}});
        QTest::newRow("string-leave-time") << QString("featureLeft")
            << QVariant(QVariantMap{{"translate", "1000.5"}});
        QTest::newRow("string-snooze-time") << QString("updates")
            << QVariant(QVariantMap{{"snoozedVersion", "2.0"}, {"snoozedUntil", "87400"}});
        QTest::newRow("voice-rate-bool") << QString("voice")
            << QVariant(QVariantMap{{"provider", "system"}, {"voice", ""}, {"rate", true}});
        QTest::newRow("voice-rate-string") << QString("voice")
            << QVariant(QVariantMap{{"provider", "system"}, {"voice", ""}, {"rate", "1.25"}});
    }
    void invalidSnapshotBlocksWrites() {
        QFETCH(QString, field);
        QFETCH(QVariant, invalidValue);
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        auto workspace = WorkbenchDomain::create("chat", "translate");
        workspace = WorkbenchDomain::command(workspace, "draft", {{"value", "Bản nháp 日本語"}}, "id", "attempt");
        if (invalidValue.isValid()) workspace[field] = invalidValue;
        else workspace.remove(field);
        const auto bytes = QJsonDocument::fromVariant(workspace).toJson();
        QFile file(dir.filePath("workbench.json"));
        QVERIFY(file.open(QIODevice::WriteOnly));
        QCOMPARE(file.write(bytes), bytes.size());
        file.close();

        WorkbenchBridge bridge(nullptr, file.fileName(), false);
        QVERIFY(bridge.loadBlocked());
        QCOMPARE(bridge.storageError(), QString("storageLoadError"));
        const auto before = bridge.state();
        bridge.command("draft", {{"value", "Overwrite"}});
        bridge.command("navigation", {{"collapsed", true}});
        bridge.save();
        bridge.shutdown();
        QCOMPARE(bridge.state(), before);
        QVERIFY(file.open(QIODevice::ReadOnly));
        QCOMPARE(file.readAll(), bytes);
    }
    void savedAttemptRequiresTypedTimesAndMessageList() {
        using namespace WorkbenchDomain;
        auto draft = command(create("c", "t"), "draft", {{"value", "Hello"}}, "id", "a");
        auto state = command(draft, "submit", {{"_updated", 1000.5}}, "job", "a1");
        state = command(state, "receive", {{"taskID", "job"}, {"attemptID", "a1"}, {"terminal", "succeeded"},
                                           {"chunk", "Hi"}, {"_updated", 1001.5}}, "id", "a");
        const auto original = state.value("tasks").toList().first().toMap();
        QVERIFY(validate(state));
        for (const auto *key : {"started", "finished"}) {
            auto task = original;
            task[key] = "1000.5";
            state["tasks"] = QVariantList{task};
            QVERIFY2(recover(state).isEmpty(), key);
            task[key] = QVariant::fromValue(nullptr); // Swift's optional timestamp.
            state["tasks"] = QVariantList{task};
            QVERIFY2(!recover(state).isEmpty(), key);
        }
        auto task = original;
        auto request = task.value("request").toMap();
        request["messages"] = QVariantMap{{"content", "wrong shape"}};
        task["request"] = request;
        state["tasks"] = QVariantList{task};
        QVERIFY(recover(state).isEmpty());
    }
    void olderSnapshotKeepsDraftIdentityAndPartialReply() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto path = dir.filePath("state.json");
        QVERIFY(QFile::copy(VIEZAN_CONTRACT_FIXTURE, path));
        WorkbenchBridge bridge(nullptr, path, false);
        QVERIFY(!bridge.loadBlocked());
        QCOMPARE(bridge.state().value("active").toMap().value("chat").toString(), QString("chat-fixture"));
        QCOMPARE(current(bridge).value("draft").toString(), QString("Bản nháp chưa gửi"));
        const auto task = latest(bridge);
        QCOMPARE(task.value("status").toString(), QString("interrupted"));
        QCOMPARE(task.value("attemptID").toString(), QString("attempt-fixture"));
        QCOMPARE(task.value("request").toMap().value("model").toString(), QString("ollama:llama3.2"));
        QVERIFY(!task.contains("started") && !task.contains("finished"));
        const auto reply = current(bridge).value("messages").toList().last().toMap();
        QCOMPARE(reply.value("id"), task.value("id"));
        QCOMPARE(reply.value("text").toString(), QString("Phản hồi dở dang"));
        QCOMPARE(bridge.appearance().value("preset").toString(), "glass");
        QCOMPARE(bridge.appearance().value("mode").toString(), "system");
        QVERIFY(!bridge.state().value("shell").toMap().value("navigationCollapsed").toBool());
        bridge.command("navigation", {{"collapsed", true}});
        WorkbenchBridge reopened(nullptr, path, false);
        QVERIFY(!reopened.loadBlocked());
        QCOMPARE(current(reopened), current(bridge));
        QCOMPARE(latest(reopened), task);
        QVERIFY(reopened.state().value("shell").toMap().value("navigationCollapsed").toBool());
    }
    void streamingShutdownFlushesPartialReplyAndDraft() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        QFile file(dir.filePath("workbench.json"));
        WorkbenchBridge bridge(nullptr, file.fileName(), false);
        bridge.command("draft", {{"value", "Question"}});
        bridge.command("submit");
        const auto task = latest(bridge);
        QCOMPARE(task.value("status").toString(), QString("running"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto submitted = file.readAll();
        file.close();
        bridge.command("draft", {{"value", "Unsent 日本語"}});
        for (int i = 0; i < 100; ++i) chunk(bridge, task, "a");
        QCOMPARE(latest(bridge).value("output").toString(), QString(100, 'a'));
        QVERIFY(file.open(QIODevice::ReadOnly));
        QCOMPARE(file.readAll(), submitted);
        file.close();
        bridge.shutdown();
        QVERIFY(bridge.storageError().isEmpty());
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto saved = QJsonDocument::fromJson(file.readAll()).toVariant().toMap();
        file.close();
        QCOMPARE(saved.value("tasks").toList().first().toMap().value("status").toString(), QString("interrupted"));
        WorkbenchBridge reopened(nullptr, file.fileName(), false);
        QVERIFY(!reopened.loadBlocked());
        QCOMPARE(current(reopened).value("draft").toString(), QString("Unsent 日本語"));
        QCOMPARE(current(reopened).value("messages").toList().last().toMap().value("text").toString(), QString(100, 'a'));
        QCOMPARE(latest(reopened).value("attemptID"), task.value("attemptID"));
        QCOMPARE(latest(reopened).value("status").toString(), QString("interrupted"));
    }
    void navigationSaveRetriesWithoutChangingWork() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto path = dir.filePath("state.json");
        WorkbenchBridge bridge(nullptr, path, false);
        bridge.command("draft", {{"value", "Unsent"}});
        const auto before = bridge.state();
        QVERIFY(QDir().mkdir(path)); // A directory cannot be replaced by QSaveFile.
        bridge.command("navigation", {{"collapsed", true}});
        QCOMPARE(bridge.storageError(), QString("storageError"));
        QCOMPARE(bridge.state().value("sessions"), before.value("sessions"));
        QCOMPARE(bridge.state().value("tasks"), before.value("tasks"));
        QVERIFY(bridge.state().value("shell").toMap().value("navigationCollapsed").toBool());
        QVERIFY(QDir().rmdir(path));
        bridge.save();
        QVERIFY(bridge.storageError().isEmpty());
        QSignalSpy changes(&bridge, &WorkbenchBridge::changed);
        bridge.command("navigation", {{"collapsed", true}});
        QCOMPARE(changes.count(), 0);
        WorkbenchBridge reopened(nullptr, path, false);
        QVERIFY(!reopened.loadBlocked());
        QCOMPARE(current(reopened).value("draft").toString(), QString("Unsent"));
        QVERIFY(reopened.state().value("shell").toMap().value("navigationCollapsed").toBool());
    }
    void simultaneousTasksKeepTheirSessionsAndModels() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        const auto chat = current(bridge).value("id");
        bridge.command("model", {{"value", "ollama:chat"}});
        bridge.command("draft", {{"value", "Question"}});
        bridge.command("submit");
        const auto first = latest(bridge);
        bridge.command("draft", {{"value", "Next question"}});
        bridge.command("navigate", {{"feature", "translate"}});
        bridge.command("model", {{"value", "ollama:translate"}});
        bridge.command("draft", {{"value", "Hello"}});
        bridge.command("submit");
        const auto translation = current(bridge);
        const auto second = latest(bridge);
        QVERIFY(first.value("id") != second.value("id"));
        QCOMPARE(second.value("status").toString(), QString("running"));
        bridge.command("model", {{"sessionID", chat}, {"value", "ollama:next"}});
        chunk(bridge, first, "Reply");
        bridge.command("cancel", {{"taskID", first.value("id")}});
        QCOMPARE(current(bridge), translation);
        QCOMPARE(latest(bridge), second);
        const auto tasks = bridge.state().value("tasks").toList();
        QCOMPARE(tasks.size(), 2);
        QCOMPARE(tasks.last().toMap().value("request"), first.value("request"));
        QCOMPARE(first.value("request").toMap().value("model").toString(), QString("ollama:chat"));
        QCOMPARE(tasks.last().toMap().value("status").toString(), QString("cancelled"));
        bridge.command("select", {{"sessionID", chat}});
        QCOMPARE(current(bridge).value("draft").toString(), QString("Next question"));
        QCOMPARE(current(bridge).value("messages").toList().last().toMap().value("text").toString(), QString("Reply"));
    }
    void cancelledAttemptCannotFinishItsRetry() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("draft", {{"value", "Question"}});
        bridge.command("submit");
        const auto first = latest(bridge);
        bridge.command("cancel", {{"taskID", first.value("id")}});
        chunk(bridge, first, "late");
        QCOMPARE(current(bridge).value("messages").toList().last().toMap().value("text").toString(), QString());
        bridge.command("retry", {{"taskID", first.value("id")}});
        const auto retry = latest(bridge);
        QVERIFY(retry.value("attemptID") != first.value("attemptID"));
        QCOMPARE(retry.value("attemptNumber").toInt(), 2);
        const auto finish = [&](const QVariantMap &attempt, const QString &reply) {
            bridge.command("receive", {{"taskID", attempt.value("id")}, {"attemptID", attempt.value("attemptID")},
                                       {"chunk", reply}, {"terminal", "succeeded"}});
        };
        finish(first, "stale");
        QCOMPARE(latest(bridge), retry);
        finish(retry, "New reply");
        QCOMPARE(bridge.state().value("tasks").toList().size(), 1);
        QCOMPARE(latest(bridge).value("status").toString(), QString("succeeded"));
        const auto messages = current(bridge).value("messages").toList();
        QCOMPARE(messages.size(), 2);
        QCOMPARE(messages.first().toMap().value("text").toString(), QString("Question"));
        QCOMPARE(messages.last().toMap().value("text").toString(), QString("New reply"));
    }
    void editingTranslationEndsAttemptAndRejectsLateCompletion_data() {
        QTest::addColumn<QString>("edit");
        QTest::addColumn<QVariantMap>("payload");
        QTest::newRow("draft") << QString("draft") << QVariantMap{{"value", "Edited"}};
        QTest::newRow("languages") << QString("pair") << QVariantMap{{"source", "en"}, {"target", "ja"}};
    }
    void editingTranslationEndsAttemptAndRejectsLateCompletion() {
        QFETCH(QString, edit);
        QFETCH(QVariantMap, payload);
        using namespace WorkbenchDomain;
        auto state = command(create("c", "t"), "navigate", {{"feature", "translate"}}, "id", "a");
        state = command(state, "draft", {{"value", "Original"}}, "id", "a");
        state = command(state, "submit", {{"_updated", 1000.0}}, "job", "a1");
        QCOMPARE(state.value("tasks").toList().first().toMap().value("started").toDouble(), 1000.0);
        state = command(state, "receive", {{"taskID", "job"}, {"attemptID", "a1"}, {"chunk", "Partial"}}, "id", "a");
        payload["_updated"] = 1001.5;
        state = command(state, edit, payload, "id", "a");
        const auto task = state.value("tasks").toList().first().toMap();
        QCOMPARE(task.value("status").toString(), QString("cancelled"));
        const auto session = state.value("sessions").toList().at(1).toMap();
        QCOMPARE(session.value("id").toString(), QString("t"));
        QVERIFY(session.value("output").toString().isEmpty());
        QCOMPARE(session.value("draft").toString(), edit == "draft" ? QString("Edited") : QString("Original"));
        QCOMPARE(session.value("target").toString(), edit == "pair" ? QString("ja") : QString("vi"));
        QCOMPARE(command(state, "receive", {{"taskID", "job"}, {"attemptID", "a1"}, {"terminal", "succeeded"},
                                             {"chunk", "late"}, {"_updated", 1003.0}}, "id", "a"), state);
        QCOMPARE(command(state, "retry", {{"taskID", "job"}}, "id", "a2"), state);
        QCOMPARE(task.value("finished").toDouble(), 1001.5);
    }
    void failedClearPreservesBothHistoriesAndAttachments() {
        TemporaryHistoryProfile profile;
        QVERIFY(profile.valid());
        const auto workspace = profile.dir.filePath("workbench.json");
        const auto transcripts = profile.dir.filePath("interpretation.json");
        WorkbenchBridge bridge(nullptr, workspace, false);
        auto *live = bridge.interpretation();
        live->restoreSession(meetingFixture("original"));
        const auto meetings = live->sessions();
        QCOMPARE(meetings.size(), 1);
        for (const auto feature : {"chat", "translate", "dictionary"})
            bridge.command("draft", {{"sessionID", bridge.state().value("active").toMap().value(feature)}, {"value", feature}});
        const auto image = attachmentFixture();
        QVERIFY(Attachments::restore(image, "image bytes"));
        const auto path = profile.dir.filePath("attachments/" + image.value("id").toString());
        QFile oldImage(path);
        QVERIFY(oldImage.open(QIODevice::ReadWrite));
        QVERIFY(oldImage.setFileTime(QDateTime::currentDateTimeUtc().addDays(-2), QFileDevice::FileModificationTime));
        oldImage.close();
        bridge.command("addImage", {{"image", image}});
        QCOMPARE(bridge.clearableHistoryCount(), 4);
        QVERIFY(bridge.storageError().isEmpty());
        const auto disk = fileBytes(workspace), originalMeetings = fileBytes(transcripts);
        QVERIFY(!disk.isEmpty() && !originalMeetings.isEmpty());
        bridge.command("draft", {{"value", "newer unsaved draft"}});
        const auto before = bridge.state();
        QVERIFY(QFile::rename(transcripts, transcripts + ".saved"));
        QVERIFY(QDir().mkdir(transcripts));
        bool publishedPartial = false;
        const auto observe = [&] {
            if (bridge.state() != before || live->sessions() != meetings) publishedPartial = true;
        };
        const auto a = connect(&bridge, &WorkbenchBridge::changed, this, observe);
        const auto b = connect(live, &Interpretation::changed, this, observe);
        bridge.command("clearHistory");
        disconnect(a);
        disconnect(b);
        QVERIFY(!bridge.storageError().isEmpty());
        QCOMPARE(fileBytes(workspace), disk);
        QCOMPARE(bridge.state(), before);
        QCOMPARE(live->sessions(), meetings);
        QVERIFY(!publishedPartial);
        QCOMPARE(fileBytes(path), QByteArray("image bytes"));
        QVERIFY(QDir().rmdir(transcripts));
        QVERIFY(QFile::rename(transcripts + ".saved", transcripts));
        QCOMPARE(fileBytes(transcripts), originalMeetings);
        bridge.command("clearHistory");
        QVERIFY(bridge.storageError().isEmpty());
        QCOMPARE(bridge.clearableHistoryCount(), 0);
        QVERIFY(!QFileInfo::exists(path));
        WorkbenchBridge reopened(nullptr, workspace, false);
        QCOMPARE(reopened.clearableHistoryCount(), 0);
    }

    void secondHistoryCommitFailureRestoresOriginalFile_data() {
        QTest::addColumn<bool>("existingWorkspace");
        QTest::newRow("existing") << true;
        QTest::newRow("first-save") << false;
    }
    void secondHistoryCommitFailureRestoresOriginalFile() {
        QFETCH(bool, existingWorkspace);
        QTemporaryDir dir;
        const auto first = dir.filePath("workbench.json"), second = dir.filePath("interpretation.json");
        const QByteArray original = "{\n  \"original\": true\n}\n";
        if (existingWorkspace) QVERIFY(writeBytes(first, original));
        QVERIFY(writeBytes(second, "original transcripts"));
        QSaveFile workspace(first), transcripts(second);
        QVERIFY(workspace.open(QIODevice::WriteOnly) && transcripts.open(QIODevice::WriteOnly));
        QCOMPARE(workspace.write("new workspace"), 13);
        QCOMPARE(transcripts.write("[]"), 2);
        transcripts.cancelWriting(); // Force commit failure after staging, independently of OS permissions.
        QCOMPARE(HistoryStorage::commit(workspace, transcripts), QString("interpretStorageError"));
        QCOMPARE(QFileInfo::exists(first), existingWorkspace);
        if (existingWorkspace) QCOMPARE(fileBytes(first), original);
        QCOMPARE(fileBytes(second), QByteArray("original transcripts"));
        QCOMPARE(QDir(dir.path()).entryList(QDir::AllEntries | QDir::Hidden | QDir::NoDotAndDotDot).size(),
                 existingWorkspace ? 2 : 1);
    }

    void failedArchivedDeletionKeepsSavedDraft() {
        QTemporaryDir dir;
        const auto path = dir.filePath("workbench.json");
        WorkbenchBridge bridge(nullptr, path, false);
        const auto id = current(bridge).value("id");
        bridge.command("draft", {{"value", "Archived 日本語"}});
        bridge.command("archive", {{"sessionID", id}, {"value", true}});
        const auto archived = bridge.history({}, true);
        QCOMPARE(archived.size(), 1);
        QCOMPARE(archived.first().toMap().value("draft").toString(), QString("Archived 日本語"));
        const auto bytes = fileBytes(path);
        QVERIFY(!bytes.isEmpty());
        QVERIFY(QFile::rename(path, path + ".saved"));
        QVERIFY(QDir().mkdir(path));
        bridge.command("deleteArchived", {{"sessionID", id}});
        QCOMPARE(bridge.storageError(), QString("storageError"));
        QCOMPARE(bridge.history({}, true), archived);
        QVERIFY(QDir().rmdir(path));
        QVERIFY(QFile::rename(path + ".saved", path));
        QCOMPARE(fileBytes(path), bytes);
        WorkbenchBridge reopened(nullptr, path, false);
        QCOMPARE(reopened.history({}, true), archived);
        bridge.command("deleteArchived", {{"sessionID", id}});
        QVERIFY(bridge.storageError().isEmpty());
        reopened.reload();
        QVERIFY(reopened.history({}, true).isEmpty());
    }

    void failedBackupPreservesBothStores_data() {
        QTest::addColumn<QString>("fault");
        for (const QString fault : {"workspace-write", "transcript-write", "attachment-conflict", "blocked-reload", "shutdown"})
            QTest::newRow(qPrintable(fault)) << fault;
    }
    void failedBackupPreservesBothStores() {
        QFETCH(QString, fault);
        TemporaryHistoryProfile profile;
        QVERIFY(profile.valid());
        const auto workspace = profile.dir.filePath("workbench.json");
        const auto transcripts = profile.dir.filePath("interpretation.json");
        WorkbenchBridge bridge(nullptr, workspace, false);
        bridge.command("draft", {{"value", "local draft"}});
        bridge.save();
        bridge.interpretation()->restoreSession(meetingFixture("local"));
        const auto meetings = bridge.interpretation()->sessions();
        QCOMPARE(meetings.size(), 1);
        auto source = WorkbenchDomain::create("incoming", "incoming-translate");
        // Export sorts IDs. Encounter the new attachment before the shared one.
        auto image = attachmentFixture(), shared = attachmentFixture();
        image["id"] = "00000000-0000-4000-8000-000000000001";
        shared["id"] = "00000000-0000-4000-8000-000000000002";
        const auto imagePath = profile.dir.filePath("attachments/" + image.value("id").toString());
        const auto sharedPath = profile.dir.filePath("attachments/" + shared.value("id").toString());
        QVERIFY(Attachments::restore(image, "imported image"));
        QVERIFY(Attachments::restore(shared, "shared image"));
        source = WorkbenchDomain::command(source, "addImage", {{"image", image}}, "id", "attempt");
        source = WorkbenchDomain::command(source, "addImage", {{"image", shared}}, "id", "attempt");
        const auto backup = NativeBackup::exportData(source, {meetingFixture("incoming")});
        QVERIFY(!backup.isEmpty());
        QVERIFY(QFile::remove(imagePath));
        const auto path = profile.dir.filePath("backup.json");
        QVERIFY(writeBytes(path, backup));
        bridge.inspectBackup(QUrl::fromLocalFile(path));
        QTRY_VERIFY(!bridge.backupBusy());
        QCOMPARE(bridge.backupPreview().value("newSessions").toInt(), 3);

        bridge.confirmBackup();
        QVERIFY(bridge.backupBusy());
        const auto blockedPath = fault == "transcript-write" ? transcripts : workspace;
        if (fault.endsWith("-write")) {
            QVERIFY(QFile::rename(blockedPath, blockedPath + ".saved"));
            QVERIFY(QDir().mkdir(blockedPath));
        } else if (fault == "attachment-conflict") {
            QVERIFY(writeBytes(sharedPath, "existing image with same ID"));
        } else if (fault == "blocked-reload") {
            QVERIFY(writeBytes(workspace, "damaged during import"));
            bridge.reload();
            QVERIFY(bridge.loadBlocked());
        } else {
            bridge.shutdown();
        }
        const auto before = bridge.state();
        const auto diskPath = fault == "workspace-write" ? workspace + ".saved" : workspace;
        const auto meetingPath = fault == "transcript-write" ? transcripts + ".saved" : transcripts;
        const auto disk = fileBytes(diskPath), meetingDisk = fileBytes(meetingPath);
        QVERIFY(!disk.isEmpty() && !meetingDisk.isEmpty());
        QTRY_VERIFY(!bridge.backupBusy());
        QCOMPARE(bridge.backupStatus(), QString("backupError"));
        QCOMPARE(bridge.interpretation()->sessions(), meetings);
        QCOMPARE(bridge.state(), before);
        QCOMPARE(fileBytes(diskPath), disk);
        QCOMPARE(fileBytes(meetingPath), meetingDisk);
        QVERIFY(!QFileInfo::exists(imagePath));
        QCOMPARE(fileBytes(sharedPath), fault == "attachment-conflict" ? QByteArray("existing image with same ID") : QByteArray("shared image"));
        if (fault.endsWith("-write")) {
            QVERIFY(QDir().rmdir(blockedPath));
            QVERIFY(QFile::rename(blockedPath + ".saved", blockedPath));
            bridge.confirmBackup();
            QTRY_VERIFY(!bridge.backupBusy());
            QCOMPARE(bridge.backupStatus(), QString("succeeded"));
            WorkbenchBridge reopened(nullptr, workspace, false);
            QCOMPARE(reopened.interpretation()->sessions().size(), 2);
            QCOMPARE(reopened.state().value("sessions").toList().size(), 6);
            QCOMPARE(fileBytes(imagePath), QByteArray("imported image"));
        }
    }

    void malformedTranscriptBlocksWrites_data() {
        QTest::addColumn<QVariant>("invalidSession");
        auto session = meetingFixture("bad");
        session["segments"] = QVariantMap{{"do-not-lose", "source text"}};
        QTest::newRow("segments-object") << QVariant(session);
        session["segments"] = "transcript text";
        QTest::newRow("segments-string") << QVariant(session);
        session["segments"] = QVariantList{"wrong entry"};
        QTest::newRow("segment-scalar") << QVariant(session);
        QTest::newRow("session-scalar") << QVariant("wrong session");
    }
    void malformedTranscriptBlocksWrites() {
        QFETCH(QVariant, invalidSession);
        TemporaryHistoryProfile profile;
        QVERIFY(profile.valid());
        const auto path = profile.dir.filePath("interpretation.json");
        Interpretation live;
        live.restoreSession(meetingFixture("keep"));
        const auto before = live.sessions();
        QCOMPARE(before.size(), 1);
        const auto damaged = QJsonDocument::fromVariant(QVariantList{invalidSession}).toJson();
        QVERIFY(writeBytes(path, damaged));
        live.reload();
        QVERIFY(live.blocked());
        QCOMPARE(live.sessions(), before);
        QVERIFY(!live.clearAll());
        live.cancel();
        QCOMPARE(fileBytes(path), damaged);
        QVERIFY(!Interpretation::validateArchive({invalidSession}));
    }

    void transcriptReloadReleasesTranslation() {
        TemporaryHistoryProfile profile;
        QVERIFY(profile.valid());
        const auto path = profile.dir.filePath("interpretation.json");
        QVERIFY(writeBytes(path, "broken"));
        WorkbenchBridge bridge(nullptr, profile.dir.filePath("workbench.json"), false);
        bridge.command("navigate", {{"feature", "translate"}});
        bridge.command("autoTranslate", {{"enabled", true}, {"delay", 100}});
        bridge.command("clearHistory");
        QCOMPARE(bridge.storageError(), QString("interpretStorageError"));
        bridge.interpretation()->reload();
        QCOMPARE(bridge.storageError(), QString("interpretStorageError"));
        QVERIFY(writeBytes(path, "[]"));
        bridge.interpretation()->reload();
        QCOMPARE(bridge.storageError(), QString{});
        bridge.command("draft", {{"value", "Auto translate after retry"}});
        QTRY_COMPARE(bridge.state().value("tasks").toList().size(), 1);
        QVERIFY(writeBytes(profile.dir.filePath("workbench.json"), "broken workspace"));
        bridge.reload();
        bridge.interpretation()->reload();
        QCOMPARE(bridge.storageError(), QString("storageLoadError"));
    }

    void failedRemovalKeepsDraftAvailableForRetryAndUndo() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto path = dir.filePath("workbench.json");
        const auto previous = dir.filePath("previous.json");
        WorkbenchBridge bridge(nullptr, path, false);
        bridge.command("draft", {{"value", "Keep this draft 日本語"}});
        bridge.save();
        QVERIFY(bridge.storageError().isEmpty());
        const auto before = bridge.state();
        const auto session = current(bridge);
        const auto id = session.value("id").toString();
        QVERIFY(QFile::rename(path, previous));
        QVERIFY(QDir().mkdir(path));
        bool removalPublished = false;
        const auto observer = connect(&bridge, &WorkbenchBridge::changed, this, [&] {
            if (current(bridge).value("id") != id) removalPublished = true;
        });
        QVERIFY(bridge.removeSession(id).isEmpty());
        disconnect(observer);
        QCOMPARE(bridge.storageError(), QString("storageError"));
        QCOMPARE(bridge.state(), before);
        QVERIFY(!removalPublished);
        QVERIFY(QDir().rmdir(path));
        QVERIFY(QFile::rename(previous, path));
        const auto removed = bridge.removeSession(id);
        QVERIFY(bridge.storageError().isEmpty());
        QCOMPARE(removed.value("session").toMap(), session);
        QVERIFY(current(bridge).value("id") != id);
        bridge.restoreSession(session, removed.value("index").toInt());
        WorkbenchBridge reopened(nullptr, path, false);
        QVERIFY(!reopened.loadBlocked());
        QCOMPARE(current(reopened), session);
    }
    void comparisonKeepsCallerOrderAndParentDraft() {
        using namespace WorkbenchDomain;
        const auto draft = command(create("c", "t"), "draft", {{"sessionID", "t"}, {"value", "Xin chào"}}, "id", "a");
        const QStringList requested{"ollama:a", "openai:b", "ollama:a", "claude:c"};
        const auto compared = command(draft, "compare", {{"sessionID", "t"}, {"models", requested}, {"_updated", 100.0}}, "id", "a");
        QVERIFY(validate(compared));
        QStringList columns;
        for (const auto &value : compared.value("sessions").toList()) {
            const auto session = value.toMap();
            if (session.value("comparisonParent") == "t") columns.append(session.value("model").toString());
        }
        QCOMPARE(columns, (QStringList{"ollama:a", "openai:b", "claude:c"}));
        QCOMPARE(compared.value("active"), draft.value("active"));
        const auto tasks = compared.value("tasks").toList();
        QCOMPARE(tasks.size(), 3);
        for (const auto &value : tasks) {
            const auto task = value.toMap();
            QCOMPARE(task.value("request").toMap().value("input").toString(), QString("Xin chào"));
            QCOMPARE(task.value("status").toString(), QString("running"));
            QCOMPARE(task.value("started").toDouble(), 100.0);
        }
    }
    void historySearchesMessagesAndOrdersEditsAcrossFeatures() {
        using namespace WorkbenchDomain;
        auto state = create("first", "translation");
        state = command(state, "draft", {{"value", "Đổi ngôn ngữ 日本語"}}, "id", "a");
        state = command(state, "submit", {}, "job", "a1");
        state = command(state, "receive", {{"taskID", "job"}, {"attemptID", "a1"}, {"chunk", "Phản hồi tiếng Việt"},
                                           {"terminal", "succeeded"}}, "id", "a");
        state = command(state, "new", {}, "second", "a");
        state = command(state, "draft", {{"value", "Second"}, {"_updated", 10.0}}, "id", "a");
        state = command(state, "draft", {{"sessionID", "first"}, {"value", "Next prompt"}, {"_updated", 20.0}}, "id", "a");
        state = command(state, "draft", {{"sessionID", "translation"}, {"value", "Newest"}, {"_updated", 30.0}}, "id", "a");
        QTemporaryDir dir;
        QFile file(dir.filePath("state.json"));
        QVERIFY(file.open(QIODevice::WriteOnly));
        const auto bytes = QJsonDocument::fromVariant(state).toJson();
        QCOMPARE(file.write(bytes), bytes.size());
        file.close();
        WorkbenchBridge bridge(nullptr, file.fileName(), false);
        QVERIFY(!bridge.loadBlocked());
        const auto ids = [&](const QString &query, const QStringList &features) {
            QStringList found;
            for (const auto &row : bridge.history(query, false, features)) found << row.toMap().value("id").toString();
            return found;
        };
        QCOMPARE(ids(" ", {}), (QStringList{"translation", "first", "second"}));
        QCOMPARE(ids("", {"chat"}), (QStringList{"first", "second"}));
        for (const auto &query : {"doi ngon ngu", "phan hoi", "日本語"}) {
            QCOMPARE(ids(query, {"chat"}), QStringList{"first"});
            QVERIFY(ids(query, {"translate"}).isEmpty());
        }
        QCOMPARE(ids("newest", {}), QStringList{"translation"});
        QCOMPARE(ids("", {"translate"}), QStringList{"translation"});
    }
    void newSessionSweepsOnlyEmptySiblings() {
        using namespace WorkbenchDomain;
        auto state = command(create("keep", "other"), "draft", {{"value", "Keep me"}}, "id", "a");
        for (const auto *id : {"empty1", "empty2", "empty3"}) state = command(state, "new", {}, id, "a");
        QVERIFY(validate(state));
        QCOMPARE(state.value("active").toMap().value("chat").toString(), QString("empty3"));
        QStringList ids;
        for (const auto &value : state.value("sessions").toList()) {
            const auto session = value.toMap();
            ids << session.value("id").toString();
            QCOMPARE(session.value("draft").toString(), session.value("id") == "keep" ? QString("Keep me") : QString());
        }
        ids.sort();
        QCOMPARE(ids, (QStringList{"empty3", "keep", "keep-dictionary", "other"}));
    }
    void firstTitleKeepsWholeCharactersAndImageNames() {
        using WorkbenchDomain::derivedTitle;
        const QVariantList images{QVariantMap{{"name", "screenshot.png"}}};
        QCOMPARE(derivedTitle("file:///tmp/x.png", images), QString("screenshot.png"));
        QCOMPARE(derivedTitle("", images), QString("screenshot.png"));
        QCOMPARE(derivedTitle("file:///tmp/B%C3%A1o%20c%C3%A1o.png", {}), QString("Báo cáo.png"));
        QCOMPARE(derivedTitle("Hello\nworld", images), QString("Hello world"));
        const auto prefix = QString(63, 'a');
        for (const auto &character : {QString("x"), QString("a\u0301"), QString("👩‍💻")})
            QCOMPARE(derivedTitle(prefix + character + "z", {}), prefix + character);
    }
    void workspacePromptLimitCountsUtf8Bytes() {
        using namespace WorkbenchDomain;
        const auto initial = create("c", "t");
        const QString exact = QString(QChar(0x00e9)).repeated(16384);
        const auto saved = command(initial, "systemPrompt", {{"value", exact}}, "id", "a");
        QVERIFY(validate(saved));
        auto sessions = saved.value("sessions").toList();
        auto chat = sessions.first().toMap();
        QCOMPARE(chat.value("systemPrompt").toString(), exact);
        QCOMPARE(command(saved, "systemPrompt", {{"value", exact + 'a'}}, "id", "a"), saved);
        chat["systemPrompt"] = exact + 'a';
        sessions[0] = chat;
        auto invalid = saved;
        invalid["sessions"] = sessions;
        QVERIFY(!validate(invalid));
        QVERIFY(recover(invalid).isEmpty());
    }
    void bundledLocalesAndReadingMetricsMatchTheContract() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        const auto resources = bridge.resources();
        const auto locales = resources.value("locales").toMap();
        const auto keys = locales.value("vi").toMap().keys();
        QVERIFY(!keys.isEmpty());
        QCOMPARE(locales.value("en").toMap().keys(), keys);
        QCOMPARE(locales.value("ja").toMap().keys(), keys);
        QCOMPARE(resources.value("fixtures").toMap().value("models").toList().size(), 3);
        const auto metrics = bridge.metrics();
        QVERIFY(metrics.value("reading").toDouble() > metrics.value("sidebar").toDouble());
        const auto scales = resources.value("textScales").toMap();
        QVERIFY(scales.value("small").toDouble() > 0);
        QVERIFY(scales.value("small").toDouble() < scales.value("medium").toDouble());
        QVERIFY(scales.value("medium").toDouble() < scales.value("large").toDouble());
    }
    void discoveryRetainsStartedChatsAndAdoptsNewModelForBlankOnes() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("draft", {{"value", "Earlier question"}});
        bridge.command("submit");
        const auto task = latest(bridge);
        QCOMPARE(task.value("status").toString(), QString("running"));
        const auto started = current(bridge);
        bridge.command("navigate", {{"feature", "translate"}});
        const auto blank = current(bridge);
        ProviderDiscovery::Snapshot snapshot;
        snapshot.checked = true;
        bridge.applyProviderSnapshot(snapshot);
        QVERIFY(bridge.providersChecked() && bridge.providersEmpty());
        QVERIFY(bridge.preferredModel().isEmpty());
        QCOMPARE(current(bridge), blank);
        QCOMPARE(bridge.availability(blank.value("model").toString()), QString("offline"));
        snapshot.keyed.insert("gemini");
        snapshot.models["gemini"] = {"gemini:gemini-2.5-flash", "gemini:gemini-2.5-pro"};
        bridge.applyProviderSnapshot(snapshot);
        QVERIFY(!bridge.providersEmpty());
        QCOMPARE(current(bridge).value("model").toString(), QString("gemini:gemini-2.5-flash"));
        QVERIFY(bridge.localModels().contains("gemini:gemini-2.5-pro"));
        bridge.command("select", {{"sessionID", started.value("id")}});
        QCOMPARE(current(bridge), started);
        QCOMPARE(latest(bridge), task);
        bridge.command("new");
        QVERIFY(current(bridge).value("id") != started.value("id"));
        QCOMPARE(current(bridge).value("model").toString(), QString("gemini:gemini-2.5-flash"));
    }
    void dictionaryRequestUsesSharedPrompt() {
        const auto messages = LocalProvider::dictionaryMessages({{"source", "en"}, {"target", "vi"},
                                                                 {"input", "serendipity"}, {"dictionaryContext", "science"}});
        QCOMPARE(messages.size(), 2);
        const auto instruction = messages.first().toObject();
        QCOMPARE(instruction.value("role").toString(), QString("system"));
        const auto system = instruction.value("content").toString();
        for (const auto *field : {"\"vi\"", "\"en\"", "\"related\"", "nuance", "notFound", "→"})
            QVERIFY2(system.contains(QString::fromUtf8(field)), field);
        QVERIFY(!system.contains("{{SOURCE}}") && !system.contains("{{TARGET}}"));
        const auto user = messages.last().toObject();
        QCOMPARE(user.value("role").toString(), QString("user"));
        QCOMPARE(user.value("content").toString(), QString("Term: serendipity\nContext: science"));
    }
    void oneOffReadingKeepsSourceAndPreferredProvider() {
        NativeAudio audio;
        audio.configureVoice("system", {}, 1);
        QString source;
        bool wasSpeaking = false;
        connect(&audio, &NativeAudio::changed, this, [&] {
            if (!audio.preparing()) return;
            source = audio.speakingSource();
            wasSpeaking = audio.speaking();
            audio.silence(); // Cancel in the notification, before preparing any provider request.
        });
        audio.speak("Xin chào", "vi", "result", "openai");
        QCOMPARE(source, QString("result"));
        QVERIFY(wasSpeaking);
        QVERIFY(!audio.speaking() && !audio.preparing() && audio.speakingSource().isEmpty());
        QCOMPARE(audio.lastSource(), QString("result"));
        QSignalSpy changes(&audio, &NativeAudio::changed);
        audio.configureVoice("system", {}, 1);
        QCOMPARE(changes.count(), 0);
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
        bridge.command("appearance", {{"mode", mode}, {"textSize", "large"}});
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
        const auto accentLabel = bridge.strings().value("themeAccent").toString();
        auto *accent = visualText(content, accentLabel);
        QVERIFY(accent);
        QVERIFY(theme->mapToScene(QPointF()).y() < accent->mapToScene(QPointF()).y());
        QVERIFY(accent->mapToScene(QPointF()).y() < textSize->mapToScene(QPointF()).y());
        settings->setProperty("query", locale == "vi" ? "co chu" : locale == "en" ? "text size" : "文字サイズ");
        QCoreApplication::processEvents();
        QCOMPARE(settings->property("activeSection").toString(), QString("appearance"));
        QCOMPARE(bridge.state(), before);
        settings->setProperty("query", "missing-setting");
        QCoreApplication::processEvents();
        QCOMPARE(qmlValue(settings, "matches.length").toInt(), 0);
        QCOMPARE(settings->property("activeSection").toString(), QString("appearance"));
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
        QVERIFY(CloudProtocol::errorMessage("<html>bad gateway</html>").isEmpty());
        QCOMPARE(ImageGeneration::imageModel("openai", "gpt-4o", {"openai:gpt-image-1", "openai:gpt-image-1-mini", "openai:gpt-image-1.5"}), QString("gpt-image-1.5"));
        QCOMPARE(ImageGeneration::imageModel("gemini", "", {"gemini:imagen-4.0", "gemini:gemini-2.5-flash-image"}), QString("gemini-2.5-flash-image"));
        QCOMPARE(ImageGeneration::imageModel("openai", "gpt-image-1-mini", {"openai:gpt-image-1-mini", "openai:gpt-image-1.5"}), QString("gpt-image-1-mini"));
        QCOMPARE(ImageGeneration::imageModel("openai", "", {}), QString("gpt-image-1"));
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
        bridge.command("navigate", {{"feature", "translate"}});
        bridge.command("pair", {{"source", "en"}, {"target", "ja"}});
        QCOMPARE(bridge.quickTranslate().value("primary").toString(), QString("ja"));
        bridge.command("quickTranslatePrimary", {{"value", "vi"}});
        bridge.command("quickTranslateSecondary", {{"value", "en"}});
        QCOMPARE(bridge.quickTranslateTarget("Xin chào các bạn, hôm nay trời đẹp."), QString("en"));
        QCOMPARE(bridge.quickTranslateTarget("Good morning"), QString("vi"));
        bridge.command("quickTranslateSecondary", {{"value", "vi"}});   // same as primary: ignored
        QCOMPARE(bridge.quickTranslate().value("secondary").toString(), QString("en"));
        bridge.command("quickTranslatePrimary", {{"value", "en"}});     // the secondary: swaps
        QCOMPARE(bridge.quickTranslate(), (QVariantMap{{"primary", "en"}, {"secondary", "vi"}}));
        WorkbenchBridge paired(nullptr, dir.filePath("state.json"), false);
        QCOMPARE(paired.quickTranslate(), bridge.quickTranslate());
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
    void launcherFilesCarryKindAndDateAndSkipExcludedPaths() {
        QTemporaryDir temp;
        QVERIFY(temp.isValid());
        const QDir fixture(QFileInfo(temp.path()).canonicalFilePath());
        // Both a hidden ancestor and an account named "build" are outside the search filter.
        const QDir home(fixture.filePath(".accounts/build"));
        const QDir outside(fixture.filePath(".accounts/build-other"));
        QVERIFY(outside.mkpath("."));
        for (const auto &folder : {"Documents/plan reports", "Documents/.cache", "Documents/project/node_modules",
                                   "Documents/project/build", "Documents/plan.app", "Documents/plan.rtfd"})
            QVERIFY(home.mkpath(folder));
        const QString document = home.filePath("Documents/plan.md");
        const auto stamp = QDateTime::fromSecsSinceEpoch(1700000000);
        for (const auto &path : {document, home.filePath("plan home.md"), home.filePath("Documents/.plan.md"),
                                 home.filePath("Documents/.cache/plan.md"), home.filePath("Documents/project/node_modules/plan.md"),
                                 home.filePath("Documents/project/build/plan.md"), outside.filePath("plan outside.md")}) {
            QFile file(path);
            QVERIFY(file.open(QIODevice::WriteOnly));
            QCOMPARE(file.write("x"), 1);
            QVERIFY(file.flush());
            QVERIFY(file.setFileTime(stamp, QFileDevice::FileModificationTime));
        }
        QVERIFY(QFile::link(document, home.filePath("Documents/plan link.lnk")));
        const QStringList roots{home.path(), outside.path(), home.filePath("Documents/.cache"),
                                home.filePath("Documents/project/node_modules"), home.filePath("Documents/missing")};
        const auto rows = LauncherTools::files("PLAN", home, roots);
        QMap<QString, QVariantMap> byName;
        for (const auto &value : rows) {
            const auto row = value.toMap();
            byName.insert(row.value("name").toString(), row);
        }
        QCOMPARE(rows.size(), 6);
        QCOMPARE(byName.size(), rows.size());
        const auto plan = byName.value("plan.md");
        QCOMPARE(plan.value("id").toString(), document);
        QCOMPARE(plan.value("isDirectory"), QVariant(false));
        QCOMPARE(plan.value("modified").toLongLong(), stamp.toSecsSinceEpoch());
        QCOMPARE(plan.value("parent").toString(), QString("~/Documents"));
        QCOMPARE(byName.value("plan home.md").value("parent").toString(), QString("~"));
        QCOMPARE(byName.value("plan outside.md").value("parent").toString(), outside.path());
        QCOMPARE(byName.value("plan reports").value("isDirectory"), QVariant(true));
#ifdef Q_OS_MACOS
        QCOMPARE(byName.value("plan.app").value("isDirectory"), QVariant(false));
        QCOMPARE(byName.value("plan.rtfd").value("isDirectory"), QVariant(false));
#else
        QCOMPARE(byName.value("plan.app").value("isDirectory"), QVariant(true));
#endif
        QVERIFY(LauncherTools::files("missing", home, roots).isEmpty());
    }

    void launcherFilesAcceptRedirectedRoots_data() {
        QTest::addColumn<bool>("outsideHome");
        QTest::newRow("linked-home") << false;
        QTest::newRow("redirected-documents") << true;
    }

    void launcherFilesAcceptRedirectedRoots() {
        QFETCH(bool, outsideHome);
        QTemporaryDir temp;
        QVERIFY(temp.isValid());
        const QDir fixture(QFileInfo(temp.path()).canonicalFilePath());
        QVERIFY(fixture.mkpath("accounts/user/Documents"));
        QVERIFY(fixture.mkpath("accounts/user-other/Documents"));
        QVERIFY(fixture.mkpath("private"));
        const auto linkDirectory = [&](const QString &target, const QString &link) {
#ifdef Q_OS_WIN
            // A junction exercises Windows redirection without requiring symlink privileges.
            QProcess cmd;
            cmd.setWorkingDirectory(fixture.path());
            cmd.start("cmd.exe", {"/D", "/C", "mklink", "/J", QDir::toNativeSeparators(link),
                                  QDir::toNativeSeparators(target)});
            return cmd.waitForFinished() && cmd.exitCode() == 0;
#else
            return QFile::link(fixture.filePath(target), fixture.filePath(link));
#endif
        };
        QVERIFY(linkDirectory("accounts/user", "home"));
        const QDir home(fixture.filePath("home"));
        const QString documents = outsideHome ? "accounts/user-other/Documents" : "accounts/user/Documents";
        const QDir root(fixture.filePath(documents));
        QVERIFY(linkDirectory("private", documents + "/linked-folder"));
        QVERIFY(linkDirectory("private", "linked-root"));
        for (const auto &file : {root.filePath("plan.txt"), fixture.filePath("private/plan-secret.txt")}) {
            QFile sample(file);
            QVERIFY(sample.open(QIODevice::WriteOnly));
        }
        const QStringList roots{outsideHome ? root.path() : home.filePath("Documents"),
                                fixture.filePath("linked-root")};
        const auto hits = LauncherTools::files("plan", home, roots);
        QCOMPARE(hits.size(), 1);
        const auto row = hits.first().toMap();
        // Qt resolves a symbolic link in the path but keeps a Windows junction, so compare
        // with the canonical form of the path the search was given.
        QCOMPARE(row.value("id").toString(), QFileInfo(QDir(roots.first()).filePath("plan.txt")).canonicalFilePath());
        QCOMPARE(row.value("parent").toString(), outsideHome ? root.path() : QString("~/Documents"));
        QVERIFY(LauncherTools::files("linked", home, roots).isEmpty());
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
    void transcriptionCopyFailureReturnsBeforeDelivery() {
        QTemporaryDir dir;
        NativeAudio audio;
        QSignalSpy failed(&audio, &NativeAudio::transcriptionFailed);
        const auto missing = dir.filePath("missing.wav");
        audio.transcribeFile("segment", missing, "auto");
        QCOMPARE(failed.size(), 0);
        QTRY_COMPARE(failed.size(), 1);
        QCOMPARE(failed.first(), (QVariantList{"segment", "audioError"}));
        audio.transcribeFile("cancelled", missing, "auto");
        audio.cancel();
        QCoreApplication::processEvents();
        QCOMPARE(failed.size(), 1);
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
        auto *notice = visualItem(root->contentItem(), "chat-provider-notice");
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
        // An unavailable local model offers the Local AI settings for this session.
        bridge.command("model", {{"value", "ollama:missing"}});
        QTRY_VERIFY(notice->isVisible());
        auto *manage = visualText(notice, bridge.strings().value("openLocalModels").toString(), true);
        QVERIFY(manage);
        const auto before = bridge.state();
        QVERIFY(QMetaObject::invokeMethod(manage, "clicked"));
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
        bridge.command("appearance", {{"mode",mode}});
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
        auto *resultRule = visualItem(window->contentItem(), "translation-result-rule"); QVERIFY(resultRule); QVERIFY(resultRule->isVisible()); // W5a: the empty result keeps its footer.
        auto *sourceSurface = visualItem(window->contentItem(), "translation-source-surface"); QVERIFY(sourceSurface); QVERIFY(sourceSurface->isVisible());
        auto *language = visualItem(window->contentItem(), "translate-source-language"); QVERIFY(language);
        QVERIFY(visualText(language, QString::fromUtf8("Đầu vào")));
        QVERIFY(visualItem(language, "language-chevron"));
        auto *modelTrigger = visualItem(window->contentItem(), "feature-model-trigger"); QVERIFY(modelTrigger && modelTrigger->isVisible());
        QVERIFY(QMetaObject::invokeMethod(modelTrigger, "clicked"));
        // Feature views open the same searchable lineup as Chat, without its reasoning tiers.
        auto *models = modelTrigger->parentItem()->findChild<QObject *>("model-lineup-panel"); QVERIFY(models); QTRY_VERIFY(models->property("visible").toBool());
        QVERIFY(models->property("x").toDouble() >= 0);
        QVERIFY(models->property("x").toDouble() + models->property("width").toDouble() <= width + 1);
        QVERIFY(models->property("y").toDouble() >= modelTrigger->mapToScene(QPointF(0, modelTrigger->height())).y());
        auto *modelSearch = models->findChild<QQuickItem *>("model-lineup-search"); QVERIFY(modelSearch);
        QTRY_VERIFY(modelSearch->hasActiveFocus());
        const auto modelRows = models->property("rows").value<QJSValue>();
        for (int i = 0; i < modelRows.property("length").toInt(); ++i) QVERIFY(modelRows.property(i).property("kind").toString() != "tier");
        const int nextIndex = qMin(models->property("selectedIndex").toInt() + 1, modelRows.property("length").toInt() - 1);
        const auto nextModel = modelRows.property(nextIndex).property("model").toString(); QVERIFY(!nextModel.isEmpty());
        QTest::keyClick(window, Qt::Key_Down); QTest::keyClick(window, Qt::Key_Return);
        QTRY_VERIFY(!models->property("visible").toBool());
        QCOMPARE(current(bridge).value("model").toString(), nextModel);
        bridge.command("model", {{"value", "ollama:llama3.2"}});
        QCOMPARE(submit->property("shortcutText").toString(), QString("Ctrl+Enter"));
        if (width == 1280) {
            auto *shortcut = visualItem(submit, "primary-shortcut"); QVERIFY(shortcut && shortcut->isVisible());
            QVERIFY(submit->mapToScene(QPointF(submit->width(), 0)).x() <= source->mapToScene(QPointF(source->width(), 0)).x());
        }


        bridge.command("draft", {{"value",QString(5001,'a')}}); QTRY_VERIFY(!submit->isEnabled());
        bridge.command("submit"); QVERIFY(bridge.state().value("tasks").toList().isEmpty());
        const QString sourceAtLimit = QStringLiteral("e\u0301").repeated(5000);
        bridge.command("draft", {{"value", sourceAtLimit}}); QTRY_VERIFY(submit->isEnabled());
        auto *count = visualItem(window->contentItem(), "translate-count"); QVERIFY(count);
        QCOMPARE(count->property("text").toString(), QLocale(bridge.locale()).toString(WorkbenchDomain::graphemeCount(sourceAtLimit)) + " / 5 000");
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
    void translationActionsRespectRunningSession_data() {
        QTest::addColumn<QString>("source");
        QTest::addColumn<QString>("target");
        QTest::addColumn<QString>("locale");
        QTest::newRow("english") << QString("en") << QString("ja") << QString("vi");
        QTest::newRow("auto") << QString("auto") << QString("ja") << QString("vi");
        QTest::newRow("auto-to-vietnamese-locale") << QString("auto") << QString("vi") << QString("vi");
        QTest::newRow("auto-to-english-locale") << QString("auto") << QString("en") << QString("en");
    }
    void translationActionsRespectRunningSession() {
        QFETCH(QString, source);
        QFETCH(QString, target);
        QFETCH(QString, locale);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("locale", {{"value", locale}});
        bridge.command("navigate", {{"feature", "translate"}});
        bridge.command("route", {{"value", "translate"}});
        bridge.command("pair", {{"source", source}, {"target", target}});
        bridge.command("draft", {{"value", "Synthetic source"}});
        const auto id = current(bridge).value("id").toString();
        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.addImageProvider("attachments", new AttachmentImageProvider);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(window);
        auto item = [&](const QString &name) { return visualItem(window->contentItem(), name); };
        auto *input = item("translate-source-language");
        auto *output = item("translate-target-language");
        auto *swap = visualText(window->contentItem(), bridge.strings().value("swap").toString(), true);
        auto *compare = item("translate-compare"); QVERIFY(input && output && swap && compare);
        QVERIFY(input->isEnabled() && output->isEnabled() && compare->isEnabled());
        QCOMPARE(swap->isEnabled(), source != "auto");
        bridge.command("submit");
        auto task = latest(bridge);
        QCOMPARE(task.value("status").toString(), "running");
        chunk(bridge, task, "合成の訳");
        QVERIFY(!input->isEnabled() && !output->isEnabled() && !swap->isEnabled() && !compare->isEnabled());
        auto *clear = item("translation-clear"); auto *reuse = item("translation-use-as-source");
        QVERIFY(clear && reuse); QVERIFY(!clear->isVisible() && !reuse->isVisible());
        bridge.command("receive", {{"taskID", task.value("id")}, {"attemptID", task.value("attemptID")}, {"terminal", "succeeded"}});
        QVERIFY(input->isEnabled() && output->isEnabled() && compare->isEnabled());
        QCOMPARE(swap->isEnabled(), source != "auto");
        QVERIFY(clear->isVisible() && reuse->isVisible());
        checkAccessibleName(window->contentItem(), "translation-clear", bridge.strings().value("clearSource").toString());
        checkAccessibleName(window->contentItem(), "translation-use-as-source", bridge.strings().value("useAsSource").toString());
        reuse->forceActiveFocus();
        QTest::keyClick(window, Qt::Key_Space);
        QCOMPARE(current(bridge).value("id").toString(), id);
        QCOMPARE(current(bridge).value("source").toString(), target);
        const auto nextTarget = current(bridge).value("target").toString();
        auto otherLanguages = bridge.resources().value("nativeLanguages").toStringList();
        otherLanguages.removeAll(target);
        QVERIFY(!otherLanguages.isEmpty());
        const auto autoTarget = locale == target ? otherLanguages.first() : locale;
        QCOMPARE(nextTarget, source == "auto" ? autoTarget : source);
        QCOMPARE(current(bridge).value("draft").toString(), "合成の訳");
        QVERIFY(current(bridge).value("output").toString().isEmpty() && !reuse->isVisible());
        const auto message = bridge.strings().value("usedAsSource").toString();
        QVERIFY(!message.isEmpty() && message != "usedAsSource");
        QVERIFY(visualText(window->contentItem(), message, true));
        auto *undo = item("toast-undo");
        QVERIFY(undo && undo->isVisible() && undo->isEnabled());
        QCOMPARE(undo->property("text").toString(), bridge.strings().value("undo").toString());
        undo->forceActiveFocus();
        QTest::keyClick(window, Qt::Key_Space);
        QCOMPARE(current(bridge).value("source").toString(), source);
        QCOMPARE(current(bridge).value("target").toString(), target);
        QCOMPARE(current(bridge).value("draft").toString(), "Synthetic source");
        QVERIFY(current(bridge).value("output").toString().isEmpty());
        QVERIFY(!visualText(window->contentItem(), message, true));
        clear->forceActiveFocus();
        QTest::keyClick(window, Qt::Key_Space);
        QVERIFY(current(bridge).value("draft").toString().isEmpty() && !clear->isVisible());
        QImage sample(8, 8, QImage::Format_RGB32);
        sample.fill(Qt::white);
        const auto path = dir.filePath("fixture.png");
        QVERIFY(sample.save(path)); bridge.attachImage(QUrl::fromLocalFile(path), id);
        QTRY_COMPARE(current(bridge).value("images").toList().size(), 1);
        bridge.command("submit"); task = latest(bridge);
        bridge.command("receive", {{"taskID", task.value("id")}, {"attemptID", task.value("attemptID")},
                                   {"chunk", "{\"blocks\":[]}"}, {"terminal", "succeeded"}});
        QVERIFY(!current(bridge).value("output").toString().isEmpty());
        QVERIFY(!reuse->isVisible() && !compare->isVisible());
        QCOMPARE(warnings.count(), 0);
    }

    void translationUseAsSourceUndoAfterSessionSwitch() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("navigate", {{"feature", "translate"}});
        bridge.command("route", {{"value", "translate"}});
        bridge.command("pair", {{"source", "en"}, {"target", "vi"}});
        bridge.command("draft", {{"value", "First draft"}});
        const auto owner = current(bridge);
        bridge.command("submit");
        const auto task = latest(bridge);
        bridge.command("receive", {{"taskID", task.value("id")}, {"attemptID", task.value("attemptID")},
                                   {"chunk", "First translation"}, {"terminal", "succeeded"}});

        QQmlApplicationEngine engine;
        QSignalSpy warnings(&engine, &QQmlEngine::warnings);
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(window);
        auto *reuse = visualItem(window->contentItem(), "translation-use-as-source", true);
        QVERIFY(reuse);
        reuse->forceActiveFocus();
        QTest::keyClick(window, Qt::Key_Space);
        QCOMPARE(current(bridge).value("draft").toString(), "First translation");

        bridge.command("new");
        bridge.command("pair", {{"source", "ja"}, {"target", "en"}});
        bridge.command("draft", {{"value", "Second draft"}});
        bridge.command("autoTranslate", {{"enabled", true}, {"delay", 800}});
        const auto second = current(bridge);
        QVERIFY(second.value("id") != owner.value("id"));
        auto *undo = visualItem(window->contentItem(), "toast-undo", true);
        QVERIFY(undo);
        undo->forceActiveFocus();
        QTest::keyClick(window, Qt::Key_Space);
        QCOMPARE(current(bridge), second);
        QTRY_COMPARE(latest(bridge).value("request").toMap().value("sessionID"), second.value("id"));
        QCOMPARE(latest(bridge).value("request").toMap().value("input"), second.value("draft"));

        bridge.command("select", {{"sessionID", owner.value("id")}});
        const auto restored = current(bridge);
        for (const auto *key : {"id", "source", "target", "draft"})
            QCOMPARE(restored.value(key), owner.value(key));
        QVERIFY(restored.value("output").toString().isEmpty());
        QCOMPARE(warnings.count(), 0);
    }

    void translationEditHidesReuseAndCompareClosesOnStart() {
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("navigate", {{"feature", "translate"}});
        bridge.command("route", {{"value", "translate"}});
        bridge.command("draft", {{"value", "Source"}});
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(window);
        auto *draft = visualItem(window->contentItem(), "source-draft", true);
        auto *compare = visualItem(window->contentItem(), "translate-compare", true);
        auto *reuse = visualItem(window->contentItem(), "translation-use-as-source");
        auto *panel = window->findChild<QObject *>("compare-panel");
        QVERIFY(draft && compare && reuse && panel);
        draft->forceActiveFocus();
        QTest::keyClick(window, Qt::Key_Return, Qt::ControlModifier);
        const auto task = latest(bridge);
        QCOMPARE(task.value("status").toString(), "running");
        bridge.command("receive", {{"taskID", task.value("id")}, {"attemptID", task.value("attemptID")},
                                   {"chunk", "Result"}, {"terminal", "succeeded"}});
        QVERIFY(reuse->isVisible());
        QTest::keySequence(window, QKeySequence::SelectAll);
        QTest::keyClick(window, Qt::Key_X);
        QCOMPARE(current(bridge).value("draft").toString(), "x");
        QVERIFY(!reuse->isVisible());

        bridge.command("autoTranslate", {{"enabled", true}, {"delay", 800}});
        compare->forceActiveFocus();
        QTest::keyClick(window, Qt::Key_Space);
        QVERIFY(panel->property("visible").toBool());
        QTRY_COMPARE(latest(bridge).value("status").toString(), "running");
        QCOMPARE(latest(bridge).value("request").toMap().value("input").toString(), "x");
        QTRY_VERIFY(!panel->property("visible").toBool());
    }

    void dictionaryContextShortcut_data() { modelPinsAndPanelShortcuts_data(); }
    void dictionaryContextShortcut() {
        QFETCH(QString, mode);
        QTemporaryDir dir;
        const auto path = dir.filePath("state.json");
        // Older workspaces can contain a context longer than the editor now accepts.
        auto state = WorkbenchDomain::create("chat", "translation");
        auto sessions = state.value("sessions").toList();
        for (auto &entry : sessions) {
            auto item = entry.toMap();
            if (item.value("feature") != "dictionary") continue;
            item["dictionaryContext"] = QString(501, 'x');
            item["draft"] = "bank";
            entry = item;
        }
        state["sessions"] = sessions;
        QFile file(path);
        QVERIFY(file.open(QIODevice::WriteOnly));
        QVERIFY(file.write(QJsonDocument::fromVariant(state).toJson()) > 0);
        file.close();
        WorkbenchBridge bridge(nullptr, path, false);
        bridge.command("appearance", {{"mode", mode}});
        bridge.command("navigate", {{"feature", "dictionary"}});
        bridge.command("route", {{"value", "dictionary"}});
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(window);
        window->requestActivate(); QTRY_VERIFY(window->isActive());
        const auto item = [window](const QString &name) { return visualItem(window->contentItem(), name); };
        auto *term = item("source-draft"), *context = item("dictionary-context"), *toggle = item("dictionary-context-toggle");
        auto *remove = item("dictionary-remove-context"), *lookup = item("dictionary-lookup");
        QVERIFY(term && context && toggle && remove && lookup);
        auto shortcut = [window] { QTest::keyClick(window, Qt::Key_C, Qt::ControlModifier | Qt::ShiftModifier); };
        QCOMPARE(current(bridge).value("dictionaryContext").toString().size(), 501);
        QVERIFY(!lookup->isEnabled());
        context->forceActiveFocus();
        QTest::keySequence(window, QKeySequence::SelectAll);
        QInputMethodEvent contextEdit;
        const QString contextAtLimit = QStringLiteral("e\u0301").repeated(500);
        contextEdit.setCommitString(contextAtLimit);
        QCoreApplication::sendEvent(context, &contextEdit);
        QCOMPARE(context->property("text").toString(), contextAtLimit);
        QCOMPARE(current(bridge).value("dictionaryContext").toString(), contextAtLimit);
        QTest::keyClick(window, Qt::Key_X);
        QCOMPARE(context->property("text").toString(), contextAtLimit);
        QCOMPARE(item("dictionary-context-count")->property("text").toString(), QString("500 / 500"));
        bridge.command("draft", {{"value", QStringLiteral("😀").repeated(120)}});
        QCOMPARE(item("dictionary-term-count")->property("text").toString(), QString("120 / 120"));
        QVERIFY(lookup->isEnabled());
        checkAccessibleName(window->contentItem(), "dictionary-remove-context", bridge.strings().value("dictionaryRemoveContext").toString());
        remove->forceActiveFocus();
        QTest::keyClick(window, Qt::Key_Space);
        QVERIFY(term->hasActiveFocus());
        QVERIFY(!context->isVisible());
        QInputMethodEvent preedit(QStringLiteral("に"), {});
        QCoreApplication::sendEvent(term, &preedit);
        shortcut();
        QVERIFY(term->hasActiveFocus() && term->property("inputMethodComposing").toBool());
        QVERIFY(!context->isVisible());
        QInputMethodEvent finish;
        QCoreApplication::sendEvent(term, &finish);
        shortcut();
        QTRY_VERIFY(context->hasActiveFocus());
        QTest::keyClick(window, Qt::Key_X);
        QCOMPARE(current(bridge).value("dictionaryContext").toString(), QString("x"));
        shortcut();
        QVERIFY(term->hasActiveFocus() && context->isVisible() && toggle->property("checked").toBool());
        QCOMPARE(context->property("text").toString(), QString("x"));
        QVERIFY(qmlValue(toggle, "Accessible.selected").toBool());
        toggle->forceActiveFocus();
        QTest::keyClick(window, Qt::Key_Space);
        QVERIFY(context->hasActiveFocus());
        QTest::keySequence(window, QKeySequence::SelectAll);
        shortcut();
        QVERIFY(context->hasActiveFocus());
        QCOMPARE(context->property("selectedText").toString(), "x");
        remove->forceActiveFocus();
        QTest::keyClick(window, Qt::Key_Space);
        QVERIFY(!context->isVisible() && term->hasActiveFocus());
        QVERIFY(current(bridge).value("dictionaryContext").toString().isEmpty());
        QTest::keySequence(window, QKeySequence::SelectAll);
        const auto selected = term->property("selectedText").toString();
        QVERIFY(!selected.isEmpty());
        shortcut();
        QVERIFY(term->hasActiveFocus() && !context->isVisible());
        QCOMPARE(term->property("selectedText").toString(), selected);
        QTest::keyClick(window, Qt::Key_H, Qt::ControlModifier | Qt::ShiftModifier);
        auto *search = item("history-search"); QVERIFY(search);
        QTRY_VERIFY(search->hasActiveFocus());
        shortcut();
        QVERIFY(search->hasActiveFocus() && !context->isVisible());
        auto *allHistory = visualText(window->contentItem(), bridge.strings().value("allHistory").toString(), true);
        QVERIFY(allHistory);
        allHistory->forceActiveFocus();
        QTest::keyClick(window, Qt::Key_Space);
        auto *rename = visualItem(window->contentItem(), "history-rename", true);
        QVERIFY(rename && rename->isEnabled());
        rename->forceActiveFocus();
        QTest::keyClick(window, Qt::Key_Space);
        auto *dialog = window->findChild<QObject *>("history-rename-dialog"); QVERIFY(dialog);
        auto *renameInput = item("history-rename-input"); QVERIFY(renameInput);
        QTRY_VERIFY(renameInput->hasActiveFocus());
        shortcut();
        QVERIFY(renameInput->hasActiveFocus() && dialog->property("visible").toBool());
        QTest::keyClick(window, Qt::Key_Escape);
        QTRY_VERIFY(!dialog->property("visible").toBool());
        QTest::keyClick(window, Qt::Key_2, Qt::ControlModifier);
        QTRY_COMPARE(current(bridge).value("feature").toString(), "translate");
        auto *source = visualItem(window->contentItem(), "source-draft", true); QVERIFY(source);
        source->forceActiveFocus();
        shortcut();
        QVERIFY(source->hasActiveFocus());
    }
    void dictionaryEnterAfterMiss_data() {
        QTest::addColumn<QString>("draftChange");
        QTest::addColumn<bool>("focusResult");
        QTest::addColumn<Qt::KeyboardModifiers>("modifiers");
        QTest::newRow("new-term") << QString("typed") << false << Qt::KeyboardModifiers{};
        QTest::newRow("restored-new-term") << QString("restored") << false << Qt::KeyboardModifiers{};
        QTest::newRow("same-term") << QString() << false << Qt::KeyboardModifiers{};
        QTest::newRow("keypad-result") << QString() << true << Qt::KeyboardModifiers(Qt::KeypadModifier);
        QTest::newRow("shift-in-term") << QString() << false << Qt::KeyboardModifiers(Qt::ShiftModifier);
        QTest::newRow("ctrl-in-result") << QString() << true << Qt::KeyboardModifiers(Qt::ControlModifier);
    }
    void dictionaryEnterAfterMiss() {
        QFETCH(QString, draftChange);
        QFETCH(bool, focusResult);
        QFETCH(Qt::KeyboardModifiers, modifiers);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("navigate", {{"feature", "dictionary"}});
        bridge.command("route", {{"value", "dictionary"}});
        bridge.command("draft", {{"value", "bnak"}});
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
        QVERIFY(window);
        auto *term = visualItem(window->contentItem(), "source-draft", true);
        QVERIFY(term);
        term->forceActiveFocus();
        QTest::keyClick(window, Qt::Key_Return);
        const auto miss = latest(bridge);
        QCOMPARE(miss.value("request").toMap().value("input").toString(), "bnak");
        bridge.command("receive", {{"taskID", miss.value("id")}, {"attemptID", miss.value("attemptID")},
                                   {"chunk", R"({"notFound":true,"suggestions":["bank"]})"}, {"terminal", "succeeded"}});
        auto *result = visualItem(window->contentItem(), "dictionary-result", true);
        QVERIFY(result && visualItem(result, "dictionary-suggestion-bank", true));
        if (draftChange == "restored") {
            // A valid saved workspace can pair an edited draft with the previous lookup's output.
            auto saved = bridge.state();
            auto sessions = saved.value("sessions").toList();
            for (auto &value : sessions) {
                auto session = value.toMap();
                if (session.value("id") != current(bridge).value("id")) continue;
                session["draft"] = "elm";
                value = session;
            }
            saved["sessions"] = sessions;
            QVERIFY(writeBytes(dir.filePath("state.json"), QJsonDocument::fromVariant(saved).toJson()));
            bridge.reload();
            QVERIFY(!bridge.loadBlocked());
            term = visualItem(window->contentItem(), "source-draft", true);
            QVERIFY(term);
            term->forceActiveFocus();
            QCOMPARE(term->property("text").toString(), "elm");
        } else if (draftChange == "typed") {
            QTest::keySequence(window, QKeySequence::SelectAll);
            for (const auto key : {Qt::Key_E, Qt::Key_L, Qt::Key_M})
                QTest::keyClick(window, key);
            QCOMPARE(current(bridge).value("draft").toString(), "elm");
        }
        if (focusResult) result->forceActiveFocus();
        const auto key = modifiers.testFlag(Qt::KeypadModifier) ? Qt::Key_Enter : Qt::Key_Return;
        QTest::keyClick(window, key, modifiers);
        if (modifiers & ~Qt::KeypadModifier) {
            QCOMPARE(latest(bridge).value("id"), miss.value("id"));
            QCOMPARE(current(bridge).value("draft").toString(), "bnak");
        } else {
            QCOMPARE(latest(bridge).value("status").toString(), "running");
            QCOMPARE(latest(bridge).value("request").toMap().value("input").toString(), draftChange.isEmpty() ? "bank" : "elm");
        }
    }
    void glassW2Dictionary_data() { glassW2Layout_data(); }
    void glassW2Dictionary() {
        QFETCH(int, width); QFETCH(QString, mode);
        QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("appearance", {{"mode",mode}});
        bridge.command("route", {{"value","dictionary"}}); bridge.command("navigate", {{"feature","dictionary"}});
        bridge.command("model", {{"value","ollama:llama3.2"}});
        bridge.command("draft", {{"value","bank"}}); bridge.command("dictionaryContext", {{"value","We sat by the river bank."}}); bridge.command("submit"); auto task=latest(bridge);
        const QString reply=R"({"headword":"bank","pronunciation":"bank","meaning":"edge","translations":[{"text":"bờ","pronunciation":"bờ","meaning":"river edge","examples":["river bank → bờ sông"],"exampleRegisters":["everyday"]}],"contextSense":1,"related":{"derived":["banking"],"synonyms":["shore"],"antonyms":[]}})";
        bridge.command("receive", {{"taskID",task.value("id")},{"attemptID",task.value("attemptID")},{"chunk",reply},{"terminal","succeeded"}});
        QQmlApplicationEngine engine; QSignalSpy warnings(&engine,&QQmlEngine::warnings); engine.rootContext()->setContextProperty("workbench",&bridge); engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty()); auto *window=qobject_cast<QQuickWindow *>(engine.rootObjects().first()); window->resize(width,640); QCoreApplication::processEvents();
        QQuickItem *result=nullptr; QTRY_VERIFY(result=visualItem(window->contentItem(),"dictionary-result"));
        checkSpeechAction(visualItem(result, "dictionary-speak-0"), "bờ", current(bridge).value("target").toString(),
                          current(bridge).value("id").toString() + ":sense:0");
        result->setProperty("selectedTab",2); QCoreApplication::processEvents(); QVERIFY(visualText(result,"shore"));
        QVERIFY(visualText(result, bridge.strings().value("relatedHint").toString(), true));
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
        auto *term = visualItem(window->contentItem(), "source-draft", true); QVERIFY(term);
        term->forceActiveFocus();
        QInputMethodEvent composing(QString::fromUtf8("に"), {});
        QCoreApplication::sendEvent(term, &composing);
        QTest::keyClick(window, Qt::Key_Return);
        QCOMPARE(latest(bridge).value("id"), task.value("id"));
        QInputMethodEvent end;
        QCoreApplication::sendEvent(term, &end);
        QTest::keyClick(window, mode == "dark" ? Qt::Key_Enter : Qt::Key_Return);
        QCOMPARE(latest(bridge).value("request").toMap().value("input").toString(), "bank");
        QCOMPARE(current(bridge).value("draft").toString(),QString("bank")); QCOMPARE(current(bridge).value("dictionaryContext").toString(),QString("We sat by the river bank."));
        task=latest(bridge); bridge.command("receive",{{"taskID",task.value("id")},{"attemptID",task.value("attemptID")},{"chunk",reply},{"terminal","succeeded"}});
        // Return in the result area also picks the first suggestion. A click still selects its own row.
        for (const bool keyboard : {true, false}) {
            bridge.command("draft", {{"value", "bnak"}}); bridge.command("submit"); task = latest(bridge);
            bridge.command("receive", {{"taskID", task.value("id")}, {"attemptID", task.value("attemptID")},
                                       {"chunk", R"({"notFound":true,"suggestions":["bank","blank"]})"}, {"terminal", "succeeded"}});
            auto *activeResult = visualItem(window->contentItem(), "dictionary-result", true); QVERIFY(activeResult);
            if (keyboard) {
                activeResult->forceActiveFocus();
                QTest::keyClick(window, Qt::Key_Return);
            } else {
                auto *second = visualItem(activeResult, "dictionary-suggestion-blank", true); QVERIFY(second);
                QVERIFY(QMetaObject::invokeMethod(second, "clicked"));
            }
            task = latest(bridge);
            QCOMPARE(task.value("request").toMap().value("input").toString(), keyboard ? "bank" : "blank");
            bridge.command("receive", {{"taskID", task.value("id")}, {"attemptID", task.value("attemptID")}, {"chunk", reply}, {"terminal", "succeeded"}});
        }
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
        bridge.command("appearance",{{"mode","light"}});
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
        bridge.command("appearance", {{"mode", "light"}});
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
        QTest::addColumn<QString>("mode");
        QTest::newRow("chat") << "chat" << false << false << "light";
        QTest::newRow("translation") << "translate" << false << false << "light";
        QTest::newRow("chat-library") << "chat" << true << false << "light";
        QTest::newRow("translation-library") << "translate" << true << false << "light";
        QTest::newRow("chat-library-640") << "chat" << true << true << "light";
        QTest::newRow("translation-library-640") << "translate" << true << true << "light";
        QTest::newRow("glass-dark") << "translate" << false << false << "dark";
        QTest::newRow("glass-library-dark-640") << "translate" << true << true << "dark";
    }
    void qmlLoadsWithRealBridge() {
        QFETCH(QString, feature);
        QFETCH(bool, library);
        QFETCH(bool, compact);
        QFETCH(QString, mode);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        bridge.command("appearance", {{"mode", mode}});
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
            root->setProperty("width", compact ? 640 : 1440);
            root->setProperty("height", 600);
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

    // ---- W5b Panels ----
    void w5bLauncher();
    void launcherPrefixHidesUseWith_data() {
        QTest::addColumn<QString>("query");
        QTest::addColumn<QString>("kind");
        QTest::newRow("translate") << QString("t hello") << QString("translate");
        QTest::newRow("dictionary") << QString("d hello") << QString("dictionary");
        QTest::newRow("ask") << QString("? hello") << QString("ai");
    }
    void launcherPrefixHidesUseWith() {
        QFETCH(QString, query);
        QFETCH(QString, kind);
        QTemporaryDir dir;
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *launcher = qmlValue(engine.rootObjects().first(), "launcher").value<QQuickWindow *>(); QVERIFY(launcher);
        auto rows = [&](const QString &q) {
            launcher->setProperty("query", q);
            return launcher->property("items").value<QJSValue>().toVariant().toList();
        };
        const auto prefixRows = rows(query);
        QVERIFY(!prefixRows.isEmpty());
        const auto prefix = prefixRows.first().toMap();
        QCOMPARE(prefix.value("id").toString(), "prefix");
        QCOMPARE(prefix.value("kind").toString(), kind);
        QCOMPARE(prefix.value("query").toString(), "hello");
        const auto useWith = [&](const QString &q) { return bridge.strings().value("launcher_section_use_with").toString().replace("{query}", q).toUpper(); };
        for (const auto &row : prefixRows) QVERIFY(row.toMap().value("section") != useWith(query));
        if (kind != "ai") {
            bridge.command("module", {{"id", kind}, {"enabled", false}});
            const auto disabled = rows(query);
            QVERIFY(std::none_of(disabled.cbegin(), disabled.cend(), [](const QVariant &row) { return row.toMap().value("id") == "prefix"; }));
            QVERIFY(std::any_of(disabled.cbegin(), disabled.cend(), [&](const QVariant &row) { return row.toMap().value("section") == useWith(query); }));
        }
        const auto plain = rows("hello");
        QVERIFY(std::any_of(plain.cbegin(), plain.cend(), [&](const QVariant &row) { return row.toMap().value("section") == useWith("hello"); }));
    }
    void launcherSettingsJumpMatchesTitleAndTermWordsOnly();
    void launcherOpensMatchingSettingsSection();
    void w5bQuickPanels_data();
    void w5bQuickPanels();
    void w5bUpdateSheet();

    // ---- W5a Shell ----
    void w5aCompactShell_data();
    void w5aCompactShell();
    void w5aSolidAppearance();
    void w5aPaletteQueries();
    void buttonLabelsAreCentred();
    void navigationFitsShortWindow();
    // Timings only (no thresholds): run with `ViezanQtTests performanceBaseline`.
    void performanceBaseline();
    void settledChatContextIsReleased();

    void failedSessionExportEmitsActionFailure() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        QSignalSpy failed(&bridge, &WorkbenchBridge::actionFailed);
        bridge.exportSession(QUrl::fromLocalFile(dir.filePath("missing/session.json")), current(bridge).value("id").toString());
        QCOMPARE(failed.count(), 1);
        QCOMPARE(failed.first().first().toString(), QString("exportError"));
        QVERIFY(bridge.storageError().isEmpty());
    }

    void emptyImageAttachmentEmitsActionFailure() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto path = dir.filePath("empty.png");
        QVERIFY(writeBytes(path, {}));
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        QSignalSpy failed(&bridge, &WorkbenchBridge::actionFailed);
        bridge.attachImage(QUrl::fromLocalFile(path), current(bridge).value("id").toString());
        QTRY_COMPARE(failed.count(), 1);
        QCOMPARE(failed.first().first().toString(), QString("imageError"));
        QVERIFY(bridge.storageError().isEmpty());
    }

    void shellShowsOneToastPerFileAction() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
        QQmlApplicationEngine engine;
        engine.rootContext()->setContextProperty("workbench", &bridge);
        engine.load(QUrl("qrc:/qml/Main.qml"));
        QVERIFY(!engine.rootObjects().isEmpty());
        auto *window = engine.rootObjects().first();
        const QVariant sessionID = current(bridge).value("id");
        const auto exportHistory = [&](const QString &name) {
            const QVariant url = QUrl::fromLocalFile(dir.filePath(name));
            return QMetaObject::invokeMethod(window, "exportHistory", Q_ARG(QVariant, url), Q_ARG(QVariant, sessionID));
        };
        const int initial = window->property("toastSequence").toInt();
        QVERIFY(exportHistory("missing/session.json"));
        QCOMPARE(window->property("toastSequence").toInt(), initial + 1);
        QVERIFY(qmlValue(window, "toasts[toasts.length-1].text === t('exportError') && toasts[toasts.length-1].error").toBool());
        QVERIFY(exportHistory("session.json"));
        QCOMPARE(window->property("toastSequence").toInt(), initial + 2);
        QVERIFY(qmlValue(window, "toasts[toasts.length-1].text === tpl('fileSaved', {name:'session.json'}) && !toasts[toasts.length-1].error").toBool());
        bridge.exportImage(QUrl::fromLocalFile(dir.filePath("empty.png")), {});
        QCOMPARE(window->property("toastSequence").toInt(), initial + 3);
        QVERIFY(qmlValue(window, "toasts[toasts.length-1].key === 'action-exportError' && toasts[toasts.length-1].level === 'danger'").toBool());
    }

};

// ---- W3 System pages ----
void WorkbenchBridgeTests::w3AppsSafety() {
    QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
    bridge.command("appearance", {{"mode", "light"}});
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
    auto *inventory = visualItem(window->contentItem(), "apps-inventory"); QVERIFY(inventory);
    checkAccessible(apps, "apps-inventory", QAccessible::List, bridge.strings().value("apps").toString());
    checkAccessibleName(apps, "apps-busy", bridge.strings().value("refresh").toString());
    checkAccessible(apps, "apps-result", QAccessible::AlertMessage);
    checkAccessible(apps, "apps-trash-undo", QAccessible::AlertMessage);
    checkAccessible(apps, "apps-unverified", QAccessible::AlertMessage);
    checkAccessible(apps, "apps-errors", QAccessible::AlertMessage);
    checkAccessible(apps, "apps-blocked", QAccessible::AlertMessage);
    auto first = row("flatpak", false);
    auto second = first;
    second["id"] = "second-app";
    fake->setProperty("apps", QVariantList{first, second});
    QVERIFY(QTest::qWaitForWindowExposed(window));
    inventory->forceActiveFocus(Qt::TabFocusReason);
    QTest::keyClick(window, Qt::Key_Down);
    QTRY_COMPARE(inventory->property("currentIndex").toInt(), 1);
    QVERIFY(apps->property("selectedID").toString().isEmpty());
    QTest::keyClick(window, Qt::Key_Return);
    QTRY_COMPARE(apps->property("selectedID").toString(), QString("second-app"));
    QTest::keyClick(window, Qt::Key_Up);
    QTest::keyClick(window, Qt::Key_Space);
    QTRY_COMPARE(apps->property("selectedID").toString(), first.value("id").toString());
    QCOMPARE(qmlValue(inventory, "currentItem.Accessible.selected").toBool(), true);
    window->resize(640, 480);
    auto *back = visualItem(apps, "apps-back"); QVERIFY(back);
    QTRY_VERIFY(back->isVisible());
    QVERIFY(QMetaObject::invokeMethod(back, "clicked"));
    QTRY_VERIFY(inventory->hasActiveFocus() || inventory->isAncestorOf(window->activeFocusItem()));
    QTest::keyClick(window, Qt::Key_Return);
    QTRY_VERIFY(back->hasActiveFocus());
    window->resize(1280, 800);
    int expected = 0;
    for (const auto &source : {QString("registry"), QString("flatpak"), QString("snap"), QString("deb"), QString("rpm"), QString("appimage")}) {
        for (const bool elevated : {false, true}) {
            if (source != "flatpak" && elevated != (source == "snap" || source == "deb" || source == "rpm")) continue;
            fake->setProperty("apps", QVariantList{row(source, elevated)}); apps->setProperty("selectedID", "opaque-private-id");
            QTRY_VERIFY(remove->isEnabled());
            QVERIFY(QMetaObject::invokeMethod(remove, "clicked"));
            QTRY_VERIFY(confirm->property("opened").toBool());
            QCOMPARE(callCount(), expected); QVERIFY(cancel->hasActiveFocus());
            QTest::keyClick(window, Qt::Key_Tab);
            QTRY_VERIFY(accept->hasActiveFocus());
            QTest::keyClick(window, Qt::Key_Tab);
            QTRY_VERIFY(cancel->hasActiveFocus());
            QCOMPARE(confirm->property("width").toInt(), 440);
            QCOMPARE(qmlValue(confirm, "glassPanelBackground.radius").toInt(), 18);
            auto *scrim = visualItem(window->contentItem(), "blocking-dialog-scrim", true); QVERIFY(scrim);
            QCOMPARE(scrim->property("color").value<QColor>().alpha(), qRound(255 * 0.22));
            auto *dangerBackground = accept->property("background").value<QQuickItem *>(); QVERIFY(dangerBackground);
            QVERIFY(dangerBackground->isVisible());
            const auto palette = bridge.resources().value("themePalettes").toMap().value("glass:auto").toMap().value("light").toMap();
            QCOMPARE(dangerBackground->property("color").value<QColor>(), QColor(palette.value("danger").toString()));
            QVERIFY(QMetaObject::invokeMethod(cancel, "clicked"));
            QTRY_VERIFY(!confirm->property("opened").toBool()); QTRY_VERIFY(remove->hasActiveFocus()); QCOMPARE(callCount(), expected);
            QVERIFY(QMetaObject::invokeMethod(remove, "clicked")); QTRY_VERIFY(confirm->property("opened").toBool());
            QVERIFY(QMetaObject::invokeMethod(accept, "clicked"));
            ++expected; QTRY_COMPARE(callCount(), expected);
            if (!apps->property("scanning").toBool()) checkAccessibleName(apps, "apps-busy", bridge.strings().value("appsUninstall").toString());
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
    bridge.command("appearance", {{"mode", "light"}});
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
    const QString recording = bridge.strings().value("recordingDraftHint").toString();
    checkAccessible(strip, "recording-elapsed", QAccessible::StaticText, recording);
    const auto elapsed = strip->property("elapsed").toInt(); QTRY_VERIFY_WITH_TIMEOUT(strip->property("elapsed").toInt() > elapsed, 2500);
    checkAccessible(strip, "recording-elapsed", QAccessible::StaticText, recording);
    QVERIFY(QMetaObject::invokeMethod(window->findChild<QQuickItem *>("recording-stop"), "clicked"));
    QTRY_VERIFY(!strip->isVisible()); QCOMPARE(eval("audio.cancelled").toInt(), 1);
    window->setProperty("page", "everywhere");
    auto *capability = window->findChild<QObject *>("selection-capability"); QVERIFY(capability);
    QVERIFY(capability->property("idle").toBool());
    auto before = capability->property("text").toString(); eval("desktop.canReplaceSelection = true");
    QTRY_VERIFY(capability->property("text").toString() != before);
    QVERIFY(!capability->property("idle").toBool());
    QCOMPARE(capability->property("tone").toString(), QString("success"));
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
    QCOMPARE(recorder->property("width").toInt(), 460);
    checkAccessible(window->contentItem(), "shortcut-error", QAccessible::AlertMessage);
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
    QTest::keyClick(window, Qt::Key_L, Qt::ControlModifier);
    eval("desktop.reject = false; desktop.defer = true");
    QVERIFY(QMetaObject::invokeMethod(recorder, "apply"));
    QVERIFY(recorder->property("waiting").toBool());
    auto *status = recorder->findChild<QQuickItem *>("shortcut-error"); QVERIFY(status);
    QVERIFY(status->isVisible());
    QCOMPARE(status->property("text").toString(), bridge.strings().value("inProgress").toString());
    eval("desktop.busy = false; desktop.changed()");
    QTRY_VERIFY(!recorder->property("opened").toBool());
    QCOMPARE(eval("desktop.calls.length").toInt(), 2);
    window->setProperty("page", "thermal");
    checkAccessible(window->contentItem(), "thermal-error", QAccessible::AlertMessage);
    auto *reason = visualItem(window->contentItem(), "thermal-reason"); QVERIFY(reason);
    auto *reasonDialog = window->findChild<QObject *>("thermal-reason-dialog"); QVERIFY(reasonDialog);
    QVERIFY(QMetaObject::invokeMethod(reason, "clicked"));
    QTRY_VERIFY(reasonDialog->property("opened").toBool());
    QVERIFY(reason->property("popupOpen").toBool());
    QTest::keyClick(window, Qt::Key_Escape);
    QTRY_VERIFY(reason->hasActiveFocus());
    QVERIFY(!reason->property("popupOpen").toBool());
    eval("monitor.rows = [{id:'other/name:probe',group:'other',title:'Probe',count:1,average:42,max:42,members:[{name:'Probe A',value:42}]}]");
    auto *sensor = visualItem(window->contentItem(), "thermal-sensor-other/name:probe"); QVERIFY(sensor);
    reason->forceActiveFocus(Qt::TabFocusReason);
    for (int i = 0; i < 20 && !sensor->hasActiveFocus(); ++i) QTest::keyClick(window, Qt::Key_Backtab, Qt::ShiftModifier);
    QVERIFY(sensor->hasActiveFocus());
    QCOMPARE(qmlValue(sensor, "Accessible.name").toString(), "Probe");
    QVERIFY(qmlValue(sensor, "Accessible.description").toString().contains("Probe A 42 °C"));
    QTRY_VERIFY(qmlValue(sensor, "ToolTip.visible").toBool());
    eval("monitor.rows = [Object.assign({}, monitor.rows[0], {max:45,members:[{name:'Probe A',value:45}]})]");
    QVERIFY(sensor->hasActiveFocus());
    QVERIFY(qmlValue(sensor, "Accessible.description").toString().contains("Probe A 45 °C"));
    eval("monitor.rows = [Object.assign({}, monitor.rows[0], {id:'other/name:second'}), monitor.rows[0]]");
    QTRY_VERIFY(window->activeFocusItem() && window->activeFocusItem()->objectName() == "thermal-sensor-other/name:probe");
    for (const auto &key : {"sensorStatus", "fanControl", "translateSelection", "allShortcuts", "launcherPitch"}) {
        window->setProperty("page", QString(key) == "translateSelection" ? "everywhere" : QString(key) == "allShortcuts" || QString(key) == "launcherPitch" ? "utilities" : "thermal");
        auto *view = window->findChild<QQuickItem *>(window->property("page").toString() == "thermal" ? "w3-thermal" : "w3-desktop");
        QVERIFY(view);
        auto *heading = visualText(view, bridge.strings().value(key).toString()); QVERIFY(heading);
        QCOMPARE(qmlValue(heading, "Accessible.role").toInt(), int(QAccessible::Heading));
    }
    for (const auto &mode : {QString("light"), QString("dark")}) for (int width : {640, 820, 1280}) {
        bridge.command("appearance", {{"mode", mode}, {"textSize", "large"}}); window->resize(width, width == 640 ? 480 : 640);
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
    bridge.command("appearance", {{"mode", "light"}});
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
    const auto finish = [&](const QVariantMap &result) {
        return QMetaObject::invokeMethod(fake.data(), "finished", Q_ARG(QVariant, result));
    };
    const auto toasts = [&] { return window->property("toasts").value<QJSValue>().toVariant().toList(); };
    QVERIFY(finish({{"status", "inventoryIncomplete"}})); // initial inventory
    QVERIFY(toasts().isEmpty());
    QVERIFY(finish({{"status", "failed"}}));
    QCOMPARE(toasts().size(), 1);
    const auto failure = toasts().first().toMap();
    QCOMPARE(failure.value("key").toString(), QString("apps-result"));
    QCOMPARE(failure.value("level").toString(), QString("danger"));
    QCOMPARE(failure.value("text"), bridge.strings().value("appsUninstallFailed"));
    QVERIFY(!visualItem(window->contentItem(), "apps-result", true));
    QVERIFY(finish({{"status", "removed"}, {"verifiedRemoved", true}, {"canUndo", true}, {"undoKind", "systemTrash"}}));
    QCOMPARE(toasts().size(), 1);
    const auto success = toasts().first().toMap();
    QCOMPARE(success.value("key"), failure.value("key"));
    QCOMPARE(success.value("level").toString(), QString("success"));
    QCOMPARE(success.value("text"), bridge.strings().value("appsUninstallVerified"));
    QVERIFY(visualItem(window->contentItem(), "apps-trash-undo", true));
    QCOMPARE(warnings.count(), 0);
    // Context dependency outlives the route when the engine tears it down.
    delete engine.rootObjects().first();
}

// ---- Workspace size ----
void WorkbenchBridgeTests::settledChatContextIsReleased() {
    using WorkbenchDomain::command;
    const auto context = [](const QVariantMap &state, const QString &id) { for (const auto &value : state.value("tasks").toList()) if (value.toMap().value("id") == id) return value.toMap().value("request").toMap().value("messages").toList().size(); return qsizetype(-1); };
    auto state = WorkbenchDomain::create("chat", "translate");
    state = command(state, "route", {{"value", "chat"}}, "x", "a");
    state = command(state, "draft", {{"value", "One"}}, "x", "a"); state = command(state, "submit", {}, "q1", "a1");
    state = command(state, "receive", {{"taskID", "q1"}, {"attemptID", "a1"}, {"chunk", "First"}, {"terminal", "succeeded"}}, "x", "a");
    // The newest answer keeps its frozen context: it can still be regenerated.
    QCOMPARE(context(state, "q1"), 1);
    QCOMPARE(context(WorkbenchDomain::recover(state), "q1"), 1);
    state = command(state, "draft", {{"value", "Two"}}, "x", "a"); state = command(state, "submit", {}, "q2", "b1");
    QCOMPARE(context(state, "q1"), 0); QCOMPARE(context(state, "q2"), 3);
    state = command(state, "receive", {{"taskID", "q2"}, {"attemptID", "b1"}, {"terminal", "failed"}, {"errorCode", "providerError"}}, "x", "a");
    state = command(state, "draft", {{"value", "Three"}}, "x", "a"); state = command(state, "submit", {}, "q3", "c1");
    // A failed attempt stays retryable, so its request is kept whole.
    QCOMPARE(context(state, "q2"), 3);
    QVERIFY(WorkbenchDomain::validate(state));
    // Workspaces written before this rule shrink when they are loaded.
    auto legacy = state; auto tasks = legacy.value("tasks").toList();
    for (auto &value : tasks) { auto task = value.toMap(); if (task.value("id") == "q1") { auto request = task.value("request").toMap(); request["messages"] = QVariantList{QVariantMap{{"role", "user"}, {"content", "One"}, {"images", QVariantList{}}}}; task["request"] = request; value = task; } }
    legacy["tasks"] = tasks; QCOMPARE(context(legacy, "q1"), 1);
    QCOMPARE(context(WorkbenchDomain::recover(legacy), "q1"), 0);
}

// ---- Performance baseline ----
void WorkbenchBridgeTests::performanceBaseline() {
    QTemporaryDir dir; const auto file = dir.filePath("state.json");
    QElapsedTimer timer; timer.start();
    {
        WorkbenchBridge seed(nullptr, file, false);
        seed.command("route", {{"value", "chat"}});
        const auto answer = QString("A paragraph of readable streamed content. ").repeated(12);
        for (int session = 0; session < 20; ++session) {
            if (session) seed.command("new");
            for (int turn = 0; turn < 10; ++turn) {
                seed.command("draft", {{"value", QString("Question %1").arg(turn)}}); seed.command("submit");
                const auto task = latest(seed);
                seed.command("receive", {{"taskID", task.value("id")}, {"attemptID", task.value("attemptID")}, {"chunk", answer}, {"terminal", "succeeded"}});
            }
        }
        seed.shutdown(); QVERIFY(seed.storageError().isEmpty());
    }
    qInfo() << "perf seedMs" << timer.elapsed();
    qInfo() << "perf stateBytes" << QFileInfo(file).size();
    timer.restart();
    WorkbenchBridge bridge(nullptr, file, false);
    qInfo() << "perf bridgeStartMs" << timer.elapsed();
    QQmlApplicationEngine engine; QSignalSpy warnings(&engine, &QQmlEngine::warnings);
    engine.rootContext()->setContextProperty("workbench", &bridge);
    timer.restart();
    engine.load(QUrl("qrc:/qml/Main.qml"));
    QVERIFY(!engine.rootObjects().isEmpty());
    QCoreApplication::processEvents();
    qInfo() << "perf qmlLoadMs" << timer.elapsed();
    timer.restart();
    for (int key = 0; key < 20; ++key) { bridge.command("draft", {{"value", QString("Typing %1").arg(key)}}); QCoreApplication::processEvents(); }
    qInfo() << "perf draftKeystrokeMs" << timer.elapsed() / 20.0;
    bridge.command("submit");
    const auto task = latest(bridge);
    timer.restart();
    qint64 reducerNs = 0;
    for (int token = 0; token < 20; ++token) { QElapsedTimer step; step.start(); chunk(bridge, task, "token "); reducerNs += step.nsecsElapsed(); QTest::qWait(40); }
    qInfo() << "perf streamReducerMs" << reducerNs / 20e6;
    qInfo() << "perf streamFrameMs" << timer.elapsed() / 20.0 - 40;
    bridge.command("receive", {{"taskID", task.value("id")}, {"attemptID", task.value("attemptID")}, {"terminal", "succeeded"}});
    QTRY_VERIFY(current(bridge).value("messages").toList().last().toMap().value("text").toString().endsWith(QString("token ").repeated(20)));
    QCOMPARE(warnings.count(), 0);
}

QTEST_MAIN(WorkbenchBridgeTests)
#include "WorkbenchBridgeTests.moc"

// ---- W4 Settings ----
void WorkbenchBridgeTests::w4SettingsPages_data() {
    QTest::addColumn<int>("width"); QTest::addColumn<QString>("mode"); QTest::addColumn<QString>("locale");
    QTest::newRow("1280-light-vi") << 1280 << QString("light") << QString("vi");
    QTest::newRow("1280-dark-en") << 1280 << QString("dark") << QString("en");
    // Default window width: the open app sidebar must not collapse the section column.
    QTest::newRow("1044-light-vi") << 1044 << QString("light") << QString("vi");
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
    bridge.command("appearance", {{"mode",mode},{"textSize","large"}});
    bridge.command("locale", {{"value",locale}});
    bridge.command("draft", {{"value","W4 settings draft"}});
    const auto installID = bridge.resources().value("localModelSuggestions").toList().first().toMap().value("id").toString();
    ProviderDiscovery::Snapshot local;
    local.models["ollama"] = {"ollama:" + installID};
    bridge.applyProviderSnapshot(local);
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
    QTRY_COMPARE(settings->property("wide").toBool(), width >= 820);
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
        auto text = [&](const char *key) { return bridge.strings().value(key).toString(); };
        if (sections[i] == "providers") {
            checkAccessibleName(settings, "key-busy", text("apiKey"));
            checkAccessible(settings, "key-status", QAccessible::StaticText);
            auto *edit = visualItem(settings, "edit-key-openai");
            auto *input = visualItem(settings, "key-input-openai");
            QVERIFY(edit && input);
            QVERIFY(QMetaObject::invokeMethod(edit, "clicked"));
            QTRY_VERIFY(input->hasActiveFocus());
            input->setProperty("text", "synthetic");
            QTest::keyClick(window, Qt::Key_Escape);
            QTRY_VERIFY(edit->hasActiveFocus());
            QVERIFY(!input->isVisible());
            QVERIFY(input->property("text").toString().isEmpty());
        }
        if (sections[i] == "data") {
            checkAccessibleName(settings, "backup-busy", text("backupTitle"));
            checkAccessible(settings, "usage-invalid", QAccessible::AlertMessage);
        }
        if (sections[i] == "updates") {
            checkAccessibleName(settings, "update-progress", text("updateStatus"));
            checkAccessibleName(settings, "update-notes", text("releaseNotes"));
        }
        if (width >= 900) {
            auto *nav = visualItem(settings, "settings-nav-" + sections[i]); QVERIFY(nav);
            nav->forceActiveFocus(Qt::TabFocusReason);
            QCOMPARE(qmlValue(nav, "background.border.width").toInt(), 2);
        }
        if (sections[i] == "localModels") {
            auto *ready = visualItem(settings, "runtime-status-ollama");
            auto *offline = visualItem(settings, "runtime-status-lmstudio");
            auto *installed = visualItem(settings, "installed-status-" + installID);
            QVERIFY(ready && offline && installed);
            QCOMPARE(ready->property("tone").toString(), QString("success"));
            QVERIFY(!ready->property("idle").toBool() && offline->property("idle").toBool());
            QVERIFY(installed->isVisible());
            QCOMPARE(installed->property("tone").toString(), QString("success"));
            checkAccessibleName(settings, "local-model-progress", text("downloadModel"));
            checkAccessibleName(settings, "benchmark-busy", text("runtimeCompare"));
            for (const auto &id : {"runtime-error", "local-model-error", "benchmark-error"})
                checkAccessible(settings, id, QAccessible::AlertMessage);
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
    bridge.command("appearance", {{"mode","dark"}});
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
    bridge.command("appearance",{{"mode","dark"}}); QCoreApplication::processEvents();
    bridge.command("appearance",{{"mode","light"}}); QCoreApplication::processEvents();
    QCOMPARE(warnings.count(),0);
}
void WorkbenchBridgeTests::w4HistoryConfirmation() {
    const auto previousName = QCoreApplication::applicationName();
    const bool previousMode = QStandardPaths::isTestModeEnabled();
    const auto restorePaths = qScopeGuard([previousName,previousMode] { QCoreApplication::setApplicationName(previousName); QStandardPaths::setTestModeEnabled(previousMode); });
    QCoreApplication::setApplicationName("ViezanW4SettingsTest"); QStandardPaths::setTestModeEnabled(true);

    QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
    bridge.command("appearance",{{"mode","light"}});
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
    QCOMPARE(dialog->property("width").toInt(), 420);
    QCOMPARE(qmlValue(dialog, "background.radius").toInt(), 18);
    QVERIFY(dialog->property("message").toString().contains(QString::number(bridge.clearableHistoryCount())));
    QTRY_VERIFY(qAbs(dialog->property("x").toDouble() * 2 + dialog->property("width").toDouble() - window->width()) < 2);
    QTRY_VERIFY(qAbs(dialog->property("y").toDouble() * 2 + dialog->property("height").toDouble() - window->height()) < 2);
    QTest::keyClick(window,Qt::Key_Escape); QTRY_VERIFY(!dialog->property("visible").toBool()); QCOMPARE(bridge.state(),before);
    QTRY_VERIFY(clear->hasActiveFocus());
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
    auto *keep = visualItem(window->contentItem(), "settings-history-keep");
    QVERIFY(keep);
    QTRY_VERIFY(keep->hasActiveFocus());
    QCOMPARE(warnings.count(),0);
}

void WorkbenchBridgeTests::w4UpdateMetadata() {
    QTemporaryDir dir; WorkbenchBridge bridge(nullptr,dir.filePath("state.json"),false);
    bridge.command("appearance",{{"mode","light"}});
    QQmlEngine engine; QSignalSpy warnings(&engine,&QQmlEngine::warnings);
    engine.rootContext()->setContextProperty("workbench",&bridge);
    QQmlComponent component(&engine);
    component.setData(R"(
        import QtQuick
        import QtQuick.Controls
        import "qrc:/qml" as Viezan
        ApplicationWindow {
            visible:true; width:820; height:640
            QtObject { id: update; objectName:"w4-fake-updates"; property bool busy:true; property string status:"updateDownloading"; property string version:"9.0"; property string notes:"Synthetic release notes"; property bool ready:false; property bool canInstall:false; property double progress:0.4; property double packageSize:64000000; property double checkedAt:Date.now()/1000-480; property double remainingSeconds:75 }
            Viezan.UpdateSettings { objectName:"w4-updates"; width:600; bridge:({resources:workbench.resources,strings:workbench.strings,metrics:workbench.metrics,palettes:workbench.palettes,appearance:workbench.appearance,locale:workbench.locale,disabledModules:workbench.disabledModules,voice:workbench.voice,state:workbench.state,updates:update,autoCheckUpdates:false,loadBlocked:false}) }
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
    fake->setProperty("busy", false); fake->setProperty("ready", true); fake->setProperty("canInstall", true); fake->setProperty("status", "updateReady");
    QTRY_VERIFY(status->property("detail").toString().contains(bridge.strings().value("updateReadyInstall").toString()));
    checkAccessibleName(window->contentItem(), "settings-update-install", bridge.strings().value("installUpdate").toString());
    fake->setProperty("status", "updateInstallError");
    QTRY_VERIFY(visualText(window->contentItem(), bridge.strings().value("updateInstallError").toString(), true));
    checkAccessibleName(window->contentItem(), "settings-update-install", bridge.strings().value("openUpdate").toString());
    QCOMPARE(warnings.count(),0);
}

void WorkbenchBridgeTests::w4SettingsSearchIme() {
    QTemporaryDir dir; WorkbenchBridge bridge(nullptr,dir.filePath("state.json"),false);
    bridge.command("appearance",{{"mode","light"}});
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

// ---- W5b Panels ----
void WorkbenchBridgeTests::launcherSettingsJumpMatchesTitleAndTermWordsOnly() {
    QTemporaryDir dir;
    WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
    const auto sections = bridge.resources().value("settingsSections").toList();
    const auto ids = [&](const QString &query, const QString &locale = "vi") {
        QStringList result;
        for (const auto &hit : bridge.settingsJump(query, locale, sections))
            result.append(hit.toMap().value("id").toString());
        return result;
    };
    QVERIFY(ids("c").isEmpty());
    QCOMPARE(ids("giao"), (QStringList{"appearance", "general"}));
    QCOMPARE(ids("sao luu"), QStringList{"data"});
    QCOMPARE(ids("du lieu").value(0), "data");
    QCOMPARE(ids("appear", "en").value(0), "appearance");
    QCOMPARE(ids("音声", "ja").value(0), "voice");
    const QVariantMap kana{{"title", "ガイド パネル"}};
    for (const auto &query : {QStringLiteral("ガイ"), QStringLiteral("パネ")}) {
        QCOMPARE(bridge.settingsJump(query.normalized(QString::NormalizationForm_D), "ja", {kana}), QVariantList{kana});
    }
    QVERIFY(bridge.settingsJump("カイ", "ja", {kana}).isEmpty());
    QVERIFY(bridge.settingsJump("ハネ", "ja", {kana}).isEmpty());
    QVERIFY(ids("zzzz").isEmpty());
    QVERIFY(ids("iao").isEmpty());
    QVERIFY(ids("kho bao mat").isEmpty());
    QVERIFY(ids("giu khi chuyen").isEmpty()); // Only in a long term in General.
    for (const auto *query : {"ch", "co", "te", "du"}) QVERIFY(ids(query).size() <= 3);

    const auto label = QStringLiteral("Đô").normalized(QString::NormalizationForm_D) + QString(38, u'x');
    const QVariantMap exact{{"title", "A"}, {"terms", QStringList{label}}};
    const QVariantMap longer{{"title", "B"}, {"terms", QStringList{label + u'x'}}};
    QCOMPARE(bridge.settingsJump(" do ", "vi", {longer, exact}), QVariantList{exact});
}

void WorkbenchBridgeTests::launcherOpensMatchingSettingsSection() {
    QTemporaryDir dir;
    WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
    bridge.command("locale", {{"value", "vi"}});
    QQmlApplicationEngine engine;
    QSignalSpy warnings(&engine, &QQmlEngine::warnings);
    engine.rootContext()->setContextProperty("workbench", &bridge);
    engine.load(QUrl("qrc:/qml/Main.qml"));
    QVERIFY(!engine.rootObjects().isEmpty());
    auto *main = qobject_cast<QQuickWindow *>(engine.rootObjects().first());
    QVERIFY(main);
    auto *launcher = qmlValue(main, "launcher").value<QQuickWindow *>();
    QVERIFY(launcher);
    const auto matches = [&](const QString &query) {
        launcher->setProperty("query", query);
        QVariantList found;
        const auto items = launcher->property("items").value<QJSValue>().toVariant().toList();
        for (const auto &item : items)
            if (item.toMap().contains("sectionID")) found.append(item);
        return found;
    };
    QVERIFY(matches("").isEmpty());
    QVERIFY(matches("  ỡ ").isEmpty());
    QVERIFY(matches(QString::fromUtf8("ô").normalized(QString::NormalizationForm_D)).isEmpty());
    QCOMPARE(matches("ch").size(), 3);
    const auto titles = matches("giao dien");
    QVERIFY(titles.size() >= 2);
    QCOMPARE(titles.first().toMap().value("sectionID").toString(), "appearance");
    QVERIFY(matches("KHO BAO MAT").isEmpty());
    const auto shortcut = matches("phim tat");
    QVERIFY(!shortcut.isEmpty());
    QCOMPARE(shortcut.first().toMap().value("sectionID").toString(), "general");
    bridge.command("module", {{"id", "utilities"}, {"enabled", false}});
    for (const auto &row : matches("phim tat")) QVERIFY(row.toMap().value("sectionID") != "general");

    const auto results = matches(" GIONG NOI ");
    QVERIFY(!results.isEmpty());
    const auto voice = results.first().toMap();
    QCOMPARE(voice.value("id").toString(), "settings-voice");
    QCOMPARE(voice.value("title"), bridge.strings().value("voiceTitle"));
    QCOMPARE(voice.value("detail"), bridge.strings().value("settings"));
    QCOMPARE(voice.value("section").toString(), bridge.strings().value("launcher_section_viezan").toString().toUpper());
    main->hide();
    launcher->show();
    auto *field = visualItem(launcher->contentItem(), "launcher-query");
    QVERIFY(field);
    field->forceActiveFocus();
    launcher->setProperty("selectedID", voice.value("id"));
    QTest::keyClick(launcher, Qt::Key_Return);
    launcher->setProperty("query", ""); // Disarm the pending file lookup for the synthetic query.
    QTRY_VERIFY(main->isVisible() && !launcher->isVisible());
    QQuickItem *settings = nullptr;
    QTRY_VERIFY(settings = visualItem(main->contentItem(), "settings-workspace"));
    QTRY_COMPARE(settings->property("activeSection").toString(), "voice");
    main->setProperty("settingsQuery", "KHO BAO MAT");
    QTRY_COMPARE(qmlValue(settings, "matches.map(section => section.id).join(',')").toString(), "providers");
    QCOMPARE(warnings.count(), 0);
}

void WorkbenchBridgeTests::w5bLauncher() {
    const auto previousName = QCoreApplication::applicationName();
    const auto previousOrg = QCoreApplication::organizationName();
    const bool testMode = QStandardPaths::isTestModeEnabled();
    const auto reset = qScopeGuard([&] {
        QCoreApplication::setApplicationName(previousName);
        QCoreApplication::setOrganizationName(previousOrg);
        QStandardPaths::setTestModeEnabled(testMode);
    });
    QStandardPaths::setTestModeEnabled(true);
    QCoreApplication::setOrganizationName("ViezanQtFixtures");
    const auto parent = QFileInfo(QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation)).absolutePath();
    QVERIFY(QDir().mkpath(parent));
    QTemporaryDir dir(parent + "/launcher-XXXXXX");
    QVERIFY(dir.isValid());
    QCoreApplication::setApplicationName(QFileInfo(dir.path()).fileName());
    QCOMPARE(QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation), dir.path());
    const auto clearTarget = qScopeGuard([] { QSettings().remove("launcher/currencyTarget"); });
    // The first lookup fails offline. An explicit retry supplies a synthetic snapshot.
    FixtureNetwork network;
    DesktopIntegration money(nullptr, &network);
    WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
    bridge.command("appearance", {{"mode", "light"}});
    bridge.command("locale", {{"value", "en"}});
    QQmlEngine engine; QSignalSpy warnings(&engine, &QQmlEngine::warnings);
    engine.rootContext()->setContextProperty("workbench", &bridge);
    engine.rootContext()->setContextProperty("fixtureRates", &money);
    QQmlComponent component(&engine);
    component.setData(R"(
        import QtQuick
        import "qrc:/qml" as V
        V.Launcher {
            bridge: proxy
            QtObject {
                id: desktop; objectName: "launcher-desktop-fixture"
                property var applications: [{id:"fixture-app",name:"Synthetic app"}]
                property var files: []
                property string currencyStatus: fixtureRates.currencyStatus
                property alias currencyTarget: preference.target
                property QtObject preference: QtObject {
                    id: preference
                    property string target: fixtureRates.currencyTarget
                    onTargetChanged: fixtureRates.currencyTarget = target
                }
                property var currencyCodes: fixtureRates.currencyCodes
                function currencyQuote(input, locale) { return fixtureRates.currencyQuote(input, locale) }
                function loadCurrencyRates(retry) { fixtureRates.loadCurrencyRates(retry) }
                property string error: ""
                property bool applicationsBusy: false
                function rankApplications(q) { return applications }
                function calculate(q) { return workbench.desktopIntegration.calculate(q) }
                function paletteQuery(q) { return workbench.desktopIntegration.paletteQuery(q) }
                property int fileSearches: 0
                function searchFiles(q) { ++fileSearches }
                property var launches: []
                function launch(id) { launches = launches.concat(id); error = "launchError" }
            }
            QtObject {
                id: proxy
                property var resources: workbench.resources; property var strings: workbench.strings; property var metrics: workbench.metrics; property var palettes: workbench.palettes; property var appearance: workbench.appearance; property var locale: workbench.locale; property var disabledModules: workbench.disabledModules; property var voice: workbench.voice
                property var state: workbench.state
                property var desktopIntegration: desktop
                function launcherHome(id) { return workbench.launcherHome(id) }
                function settingsJump(query, locale, sections) { return workbench.settingsJump(query, locale, sections) }
                property string copied: ""
                function copy(value) { copied = value }
                function moduleEnabled(id) { return workbench.moduleEnabled(id) }
            }
        }
    )", QUrl("qrc:/w5b-launcher.qml"));
    QScopedPointer<QObject> owner(component.create()); QVERIFY2(owner, qPrintable(component.errorString()));
    auto *window = qobject_cast<QQuickWindow *>(owner.data()); QVERIFY(window);
    auto rows = [&] { return owner->property("items").value<QJSValue>().toVariant().toList(); };
    QVERIFY(rows().size() >= 7); QCOMPARE(rows().first().toMap().value("kind").toString(), QString("ai"));
    bool settings = false; for (const auto &value : rows()) settings |= value.toMap().value("route") == "settings"; QVERIFY(settings);
    bridge.command("module", {{"id", "dictionary"}, {"enabled", false}});
    for (const auto &value : rows()) QVERIFY(value.toMap().value("route") != "dictionary");
    const auto chat = bridge.createDetachedSession("chat", "Continue synthetic chat");
    bridge.command("submit", {{"sessionID", chat}});
    owner->setProperty("quickSessionID", chat);
    bool continuation = false; for (const auto &value : rows()) continuation |= value.toMap().value("kind") == "continue"; QVERIFY(continuation);
    owner->setProperty("query", "= 12*7"); QTRY_COMPARE(rows().first().toMap().value("copy").toString(), QString("84"));
    owner->setProperty("query", "? hello"); QTRY_COMPARE(rows().first().toMap().value("query").toString(), QString("hello"));
    QVERIFY(!rows().first().toMap().value("title").toString().contains("{query}"));
    owner->setProperty("query", "synthetic");
    owner->setProperty("selectedID", "fixture-app"); owner->setProperty("resultsQuery", "synthetic");
    QCOMPARE(owner->property("current").value<QJSValue>().toVariant().toMap().value("id").toString(), QString("fixture-app"));
    window->show(); window->requestActivate(); QVERIFY(QTest::qWaitForWindowExposed(window));
    auto *field = visualItem(window->contentItem(), "launcher-query"); QVERIFY(field); field->forceActiveFocus();
    auto *desktop = owner->findChild<QObject *>("launcher-desktop-fixture"); QVERIFY(desktop);
    const auto yesterday = QDateTime::currentDateTime().addDays(-1).toSecsSinceEpoch();
    desktop->setProperty("files", QVariantList{
        QVariantMap{{"id","document"}, {"name","plan.md"}, {"parent","~/Documents"}, {"modified",yesterday}, {"isDirectory",false}},
        QVariantMap{{"id","folder"}, {"name","Reports"}, {"parent","~"}, {"isDirectory",true}},
        QVariantMap{{"id","bare"}, {"name","no-metadata.md"}}});
    for (const auto &locale : {"vi", "ja", "en"}) {
        bridge.command("locale", {{"value", locale}});
        const auto strings = bridge.strings();
        const auto fileKind = strings.value("launcher_file").toString(), folderKind = strings.value("launcher_folder").toString();
        const auto subtitle = "~/Documents · " + strings.value("group_yesterday").toString().toLower();
        auto *item = visualItem(window->contentItem(), "launcher-result-document");
        QTRY_VERIFY((item = visualItem(window->contentItem(), "launcher-result-document")));
        QTRY_COMPARE(qmlValue(item, "Accessible.name").toString(), "plan.md, " + fileKind + ", " + subtitle);
        QVERIFY(qmlValue(item, "Accessible.description").toString().isEmpty());
        auto *title = visualText(item, "plan.md", true), *detail = visualText(item, subtitle, true), *kind = visualText(item, fileKind, true);
        QVERIFY(title && detail && kind);
        QVERIFY(qmlValue(title, "Accessible.ignored").toBool());
        QVERIFY(qmlValue(kind, "Accessible.ignored").toBool());
        QTRY_VERIFY(detail->mapToItem(item, QPointF{}).y() > title->mapToItem(item, QPointF{}).y());
        QTRY_VERIFY(kind->mapToItem(item, QPointF{}).x() > detail->mapToItem(item, QPointF{}).x());
        checkAccessibleName(window->contentItem(), "launcher-result-folder", "Reports, " + folderKind + ", ~");
        checkAccessibleName(window->contentItem(), "launcher-result-bare", "no-metadata.md, " + fileKind);
        QCOMPARE(owner->property("current").value<QJSValue>().toVariant().toMap().value("id").toString(), QString("fixture-app"));
    }
    desktop->setProperty("files", QVariantList{});
    QInputMethodEvent preedit(QString::fromUtf8("にほん"), {}); QCoreApplication::sendEvent(field, &preedit);
    QTRY_VERIFY(field->property("inputMethodComposing").toBool());
    QSignalSpy ask(owner.data(), SIGNAL(askRequested(QString)));
    QTest::keyClick(window, Qt::Key_Return, Qt::ControlModifier); QCOMPARE(ask.count(), 0);
    QTest::keyClick(window, Qt::Key_Escape); QCOMPARE(owner->property("query").toString(), QString("synthetic"));
    QInputMethodEvent finished; finished.setCommitString(""); QCoreApplication::sendEvent(field, &finished);
    QVERIFY(QMetaObject::invokeMethod(owner.data(), "activate", Q_ARG(QVariant, owner->property("current").value<QJSValue>().toVariant()), Q_ARG(QVariant, 0)));
    QVERIFY(owner->property("failed").toBool());
    auto *retry = visualItem(window->contentItem(), "launcher-retry", true); QVERIFY(retry);
    QTest::keyClick(window, Qt::Key_Tab);
    QTRY_VERIFY(retry->hasActiveFocus()); QCOMPARE(ask.count(), 0);
    QTest::keyClick(window, Qt::Key_Space);
    QVERIFY(window->isVisible() && owner->property("failed").toBool());
    desktop->setProperty("applications", QVariantList{
        QVariantMap{{"id", "fixture-app"}, {"name", "First app"}},
        QVariantMap{{"id", "second-app"}, {"name", "Second app"}}});
    field->forceActiveFocus();
    QTest::keyClick(window, Qt::Key_Down);
    QCOMPARE(owner->property("selectedID").toString(), "second-app");
    QVERIFY(!retry->isVisible());
    QCOMPARE(desktop->property("launches").value<QJSValue>().toVariant().toStringList(), (QStringList{"fixture-app", "fixture-app"}));
    QTest::keyClick(window, Qt::Key_Up);
    QCOMPARE(owner->property("selectedID").toString(), "fixture-app");
    QVERIFY(!retry->isVisible());
    QTest::keyClick(window, Qt::Key_Return);
    QTest::keyClick(window, Qt::Key_Tab);
    QTRY_VERIFY(retry->hasActiveFocus());
    QTest::keyClick(window, Qt::Key_Escape);
    QVERIFY(!window->isVisible());
    window->show(); window->requestActivate();
    field->forceActiveFocus();
    owner->setProperty("query", "? hello");
    auto *prefix = visualItem(window->contentItem(), "launcher-result-prefix");
    QTRY_VERIFY((prefix = visualItem(window->contentItem(), "launcher-result-prefix")));
    QCOMPARE(qmlValue(prefix, "Accessible.name").toString(), rows().first().toMap().value("title").toString());
    QVERIFY(qmlValue(prefix, "Accessible.description").toString().isEmpty());
    QVERIFY(qmlValue(prefix, "Accessible.selected").toBool());
    QTest::keyClick(window, Qt::Key_Down);
    QVERIFY(!qmlValue(prefix, "Accessible.selected").toBool());
    QSignalSpy announcements(field, SIGNAL(resultAnnouncementChanged()));
    owner->setProperty("query", "=12*7");
    QTRY_COMPARE(field->property("resultAnnouncement").toString(), QString("12*7 = 84"));
    QVERIFY(announcements.count() > 0);
    owner->setProperty("query", ""); QVERIFY(!owner->property("failed").toBool());
    // Rates may finish after the query changes. The selected app stays selected.
    owner->setProperty("query", "2$");
    QTRY_COMPARE(money.currencyStatus(), "loading");
    auto row = [&] { return rows().first().toMap(); };
    QCOMPARE(row().value("detail").toString(), bridge.strings().value("launcher_currency_loading").toString());
    QCOMPARE(field->property("resultAnnouncement").toString(), row().value("detail").toString());
    QTest::keyClick(window, Qt::Key_Return); QVERIFY(window->isVisible());
    owner->setProperty("selectedID", "fixture-app");
    network.reply->abort();
    QTRY_COMPARE(money.currencyStatus(), "unavailable");
    QCOMPARE(owner->property("current").value<QJSValue>().toVariant().toMap().value("id").toString(), "fixture-app");
    QCOMPARE(row().value("detail").toString(), bridge.strings().value("launcher_currency_unavailable").toString());
    owner->setProperty("selectedID", "currency"); QTest::keyClick(window, Qt::Key_Return);
    QTRY_COMPARE(money.currencyStatus(), "loading");
    owner->setProperty("query", "3$ to jpy");
    network.reply->receive(R"({"result":"success","base_code":"USD","time_last_update_unix":1700000000,"rates":{"USD":1,"VND":25000,"JPY":150}})");
    network.reply->finish();
    QTRY_COMPARE(row().value("copy").toString(), "450");
    auto *picker = visualItem(window->contentItem(), "launcher-currency-target", true); QVERIFY(picker);
    QVERIFY(!picker->isEnabled()); QVERIFY(row().value("detail").toString().contains("150"));
    owner->setProperty("query", "3$");
    QTRY_VERIFY(visualItem(window->contentItem(), "launcher-currency-target", true)->isEnabled());
    auto *currencyRow = visualItem(window->contentItem(), "launcher-result-currency", true); QVERIFY(currencyRow);
    auto *rate = visualText(currencyRow, row().value("detail").toString(), true); QVERIFY(rate);
    QVERIFY(qmlValue(rate, "Accessible.ignored").toBool());
    QCOMPARE(qmlValue(rate, "font.pointSize").toDouble(), qmlValue(window, "Qt.application.font.pointSize * metrics.captionScale").toDouble());
    picker = visualItem(window->contentItem(), "launcher-currency-target", true);
    QVERIFY(visualItem(picker, "launcher-currency-chevron", true));
    QTest::keyClick(window, Qt::Key_Backtab);
    QTRY_VERIFY(picker->hasActiveFocus());
    QTest::keyClick(window, Qt::Key_Escape);
    QVERIFY(!window->isVisible());
    window->show(); window->requestActivate();
    QTest::mouseClick(window, Qt::LeftButton, Qt::NoModifier, picker->mapToScene(picker->boundingRect().center()).toPoint());
    auto *targetMenu = owner->findChild<QObject *>("launcher-currency-menu"); QVERIFY(targetMenu);
    QTRY_VERIFY(targetMenu->property("visible").toBool());
    QTest::keyClick(window, Qt::Key_Escape);
    QTRY_VERIFY(!targetMenu->property("visible").toBool());
    QTRY_VERIFY(picker->hasActiveFocus());
    QTest::keyClick(window, Qt::Key_Space);
    QTRY_VERIFY(targetMenu->property("visible").toBool());
    window->hide();
    QTRY_VERIFY(!targetMenu->property("visible").toBool());
    window->show();
    owner->setProperty("query", "pending visible search");
    window->hide();
    const int searches = desktop->property("fileSearches").toInt();
    QTest::qWait(320);
    QCOMPARE(desktop->property("fileSearches").toInt(), searches);
    owner->setProperty("query", "hidden fixture");
    QTest::qWait(320);
    QCOMPARE(desktop->property("fileSearches").toInt(), searches);
    window->show(); window->requestActivate();
    owner->setProperty("query", "3$");
    QTRY_VERIFY(picker = visualItem(window->contentItem(), "launcher-currency-target", true));
    QTest::mouseClick(window, Qt::LeftButton, Qt::NoModifier, picker->mapToScene(picker->boundingRect().center()).toPoint());
    QTRY_VERIFY(targetMenu->property("visible").toBool());
    // USD is the source, so VND is the first available target.
    QTest::keyClick(window, Qt::Key_Down); QTest::keyClick(window, Qt::Key_Return);
    QTRY_COMPARE(money.currencyTarget(), "VND");
    DesktopIntegration restored; QCOMPARE(restored.currencyTarget(), "VND");
    QTRY_VERIFY(field->hasActiveFocus());
    QTRY_COMPARE(row().value("copy").toString(), "75,000");
    QVERIFY(row().value("title").toString().contains("75,000 VND"));
    QCOMPARE(field->property("resultAnnouncement").toString(), row().value("title").toString());
    QTest::keyClick(window, Qt::Key_Return);
    QTRY_VERIFY(!window->isVisible());
    QCOMPARE(owner->property("bridge").value<QObject *>()->property("copied").toString(), "75,000");
    window->show(); window->requestActivate();
    owner->setProperty("query", "");
    field->forceActiveFocus();
    const QString longQuestion = QStringLiteral("e\u0301").repeated(3001);
    QInputMethodEvent question;
    question.setCommitString(longQuestion);
    QCoreApplication::sendEvent(field, &question);
    QTest::keyClick(window, Qt::Key_Return, Qt::ControlModifier);
    QCOMPARE(ask.count(), 1);
    QCOMPARE(ask.first().first().toString(), longQuestion);
    QCOMPARE(warnings.count(), 0);
}

void WorkbenchBridgeTests::w5bQuickPanels_data() {
    QTest::addColumn<QString>("locale"); QTest::addColumn<QString>("mode");
    for (const auto &locale : {"vi", "en", "ja"}) for (const auto &mode : {"light", "dark"})
        QTest::newRow(qPrintable(QString(locale) + "-" + mode)) << QString(locale) << QString(mode);
}
void WorkbenchBridgeTests::w5bQuickPanels() {
    QFETCH(QString, locale); QFETCH(QString, mode);
    QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
    bridge.command("appearance", {{"mode", mode}}); bridge.command("locale", {{"value", locale}});
    QQmlEngine engine; QSignalSpy warnings(&engine, &QQmlEngine::warnings);
    engine.rootContext()->setContextProperty("workbench", &bridge);
    QQmlComponent component(&engine);
    component.setData(R"(
        import QtQuick
        import "qrc:/qml" as V
        V.DesktopPanels {
            bridge: proxy
            QtObject {
                id:desktop; objectName:"selection-fixture"
                property bool canReplaceSelection:false
                property bool canUndoSelection:false
                property string error:""
                property string replacement:""
                function replaceSelection(value) { replacement=value; return true }
                signal activated(string action, string selectedText)
            }
            QtObject {
                id:proxy; objectName:"quick-proxy"
                property var resources:workbench.resources; property var strings: workbench.strings; property var metrics: workbench.metrics; property var palettes: workbench.palettes; property var appearance: workbench.appearance; property var locale: workbench.locale; property var disabledModules: workbench.disabledModules; property var voice: workbench.voice
                property var state:workbench.state
                property var localModels:workbench.localModels
                property var desktopIntegration:desktop
                property bool providersEmpty:false
                property string copied:""
                function copy(value) { copied=value }
                function graphemeCount(text, trimmed) { return workbench.graphemeCount(text, !!trimmed) }
                function availability(model) { return workbench.availability(model) }
                function createDetachedSession(feature,text) { return workbench.createDetachedSession(feature,text) }
                function command(name,values) { workbench.command(name,values) }
                function moduleEnabled(id) { return workbench.moduleEnabled(id) }
                function shortModelName(id) { return workbench.shortModelName(id) }
                function quickTranslateTarget(text) { return workbench.quickTranslateTarget(text) }
                function modelSections(query,id) { return workbench.modelSections(query,id) }
            }
        }
    )", QUrl("qrc:/w5b-quick.qml"));
    QScopedPointer<QObject> owner(component.create());
    QVERIFY2(owner, qPrintable(component.errorString()));
    auto *window = qobject_cast<QQuickWindow *>(owner.data()); QVERIFY(window);
    QVERIFY(QMetaObject::invokeMethod(owner.data(), "activate", Q_ARG(QVariant, "translateSelection"), Q_ARG(QVariant, QString(5001, 'x'))));
    QTRY_VERIFY(owner->property("tooLong").toBool()); QVERIFY(!owner->property("canSubmit").toBool());
    QCOMPARE(bridge.state().value("tasks").toList().size(), 0);
    auto *limit = visualItem(window->contentItem(), "quick-too-long"); QVERIFY(limit); QVERIFY(limit->isVisible());
    auto *selection = owner->findChild<QObject *>("selection-fixture"); QVERIFY(selection);
    selection->setProperty("error", "selectionUnavailable");
    auto *selectionError = visualItem(window->contentItem(), "quick-selection-error"); QVERIFY(selectionError); QTRY_VERIFY(selectionError->isVisible());
    selection->setProperty("error", "");
    const auto translationID = owner->property("ownerID").toString();
    bridge.command("draft", {{"sessionID", translationID}, {"value", "hello"}});
    bridge.command("model", {{"sessionID", translationID}, {"value", "demo.slow"}});
    QVERIFY(owner->property("canSubmit").toBool());
    bridge.command("submit", {{"sessionID", translationID}});
    // A QML var holding a C++ map may be returned as QVariantMap or QJSValue.
    const auto runningTask = [&] { return engine.toScriptValue(owner->property("task")); };
    QTRY_COMPARE(runningTask().property("request").property("sessionID").toString(), translationID);
    const auto task = latest(bridge);
    bridge.command("receive", {{"taskID", task.value("id")}, {"attemptID", task.value("attemptID")}, {"terminal", "failed"}, {"errorCode", "providerNetworkError"}});
    QTRY_COMPARE(owner->property("errorCode").toString(), QString("providerNetworkError"));
    QVERIFY(owner->property("canRetry").toBool());
    QVERIFY(QMetaObject::invokeMethod(owner.data(), "retry"));
    QCOMPARE(latest(bridge).value("request").toMap().value("sessionID").toString(), translationID);
    QCOMPARE(latest(bridge).value("status").toString(), QString("running"));
    const auto translated = latest(bridge);
    bridge.command("receive", {{"taskID", translated.value("id")}, {"attemptID", translated.value("attemptID")},
                               {"chunk", "Synthetic result"}, {"terminal", "succeeded"}});
    auto *proxy = owner->findChild<QObject *>("quick-proxy"); QVERIFY(proxy);
    QVERIFY(QMetaObject::invokeMethod(owner.data(), "copyAnswer"));
    QCOMPARE(proxy->property("copied").toString(), "Synthetic result");
    auto *feedback = visualItem(window->contentItem(), "quick-feedback", true); QVERIFY(feedback);
    QCOMPARE(feedback->property("text"), bridge.strings().value("copied"));
    selection->setProperty("canReplaceSelection", true);
    auto *replace = visualItem(window->contentItem(), "quick-replace", true); QVERIFY(replace && replace->isEnabled());
    QVERIFY(QMetaObject::invokeMethod(replace, "clicked"));
    QCOMPARE(selection->property("replacement").toString(), "Synthetic result");
    QCOMPARE(feedback->property("text"), bridge.strings().value("quickReplaced"));
    // A different active main-window session must not change the detached panel owner.
    bridge.command("navigate", {{"feature", "chat"}}); QCOMPARE(owner->property("ownerID").toString(), translationID);
    QVERIFY(QMetaObject::invokeMethod(owner.data(), "activate", Q_ARG(QVariant, "quickChat"), Q_ARG(QVariant, "")));
    const auto chatID = owner->property("ownerID").toString(); QVERIFY(chatID != translationID);
    auto *draft = visualItem(window->contentItem(), "quick-draft"); QVERIFY(draft);
    bridge.command("draft", {{"sessionID", chatID}, {"value", "Synthetic draft"}});
    draft->forceActiveFocus(); QInputMethodEvent preedit(QString::fromUtf8("にほん"), {}); QCoreApplication::sendEvent(draft, &preedit);
    QTRY_VERIFY(draft->property("inputMethodComposing").toBool());
    const auto count = bridge.state().value("tasks").toList().size();
    QTest::keyClick(window, Qt::Key_Return, Qt::ControlModifier); QCOMPARE(bridge.state().value("tasks").toList().size(), count);
    QInputMethodEvent finished; finished.setCommitString(""); QCoreApplication::sendEvent(draft, &finished);
    for (const auto &size : {QSize(480, 560), QSize(352, 520)}) {
        window->resize(size); QCoreApplication::processEvents();
        auto *send = visualItem(window->contentItem(), "quick-send"); QVERIFY(send);
        QVERIFY(send->mapToScene(QPointF(send->width(), send->height())).x() <= window->width());
    }
    auto *model = visualItem(window->contentItem(), "quick-model"); QVERIFY(model);
    draft->forceActiveFocus(Qt::TabFocusReason);
    const auto beforeTab = draft->property("text").toString();
    QTest::keyClick(window, Qt::Key_Tab);
    QCOMPARE(draft->property("text").toString(), beforeTab);
    QVERIFY(model->hasActiveFocus());
    QTest::keyClick(window, Qt::Key_Backtab, Qt::ShiftModifier);
    QVERIFY(draft->hasActiveFocus());
    QTest::keyClick(window, Qt::Key_Backtab, Qt::ShiftModifier);
    QVERIFY(!draft->hasActiveFocus());
    QVERIFY(QMetaObject::invokeMethod(model, "clicked"));
    checkAccessible(window->contentItem(), "quick-model-list", QAccessible::List, bridge.strings().value("model").toString());
    auto *list = visualItem(window->contentItem(), "quick-model-list"); QVERIFY(list);
    auto *menu = owner->findChild<QObject *>("quick-model-menu"); QVERIFY(menu);
    auto *settings = visualText(menu->property("contentItem").value<QQuickItem *>(), bridge.strings().value("quickOpenSettings").toString(), true); QVERIFY(settings);
    QTRY_VERIFY(list->hasActiveFocus());
    QTest::keyClick(window, Qt::Key_Tab);
    QVERIFY(settings->hasActiveFocus());
    QTest::keyClick(window, Qt::Key_Backtab, Qt::ShiftModifier);
    QVERIFY(list->hasActiveFocus());
    QTest::keyClick(window, Qt::Key_Backtab, Qt::ShiftModifier);
    QVERIFY(settings->hasActiveFocus());
    QTest::keyClick(window, Qt::Key_Escape);
    QTRY_VERIFY(model->hasActiveFocus());
    auto *sendButton = visualItem(window->contentItem(), "quick-send");
    auto *stopButton = visualItem(window->contentItem(), "quick-stop"); QVERIFY(sendButton && stopButton);
    bridge.command("model", {{"sessionID", chatID}, {"value", "demo.slow"}});
    sendButton->forceActiveFocus(Qt::TabFocusReason);
    QTest::keyClick(window, Qt::Key_Space);
    QTRY_VERIFY(stopButton->isVisible());
    QVERIFY(stopButton->hasActiveFocus());
    QTest::keyClick(window, Qt::Key_Space);
    QTRY_VERIFY(!stopButton->isVisible());
    QVERIFY(sendButton->isEnabled() ? sendButton->hasActiveFocus() : draft->hasActiveFocus());
    checkAccessible(window->contentItem(), "quick-feedback", QAccessible::AlertMessage);
    proxy->setProperty("providersEmpty", true); QTRY_VERIFY(owner->property("missingModel").toBool());
    QVERIFY(!owner->property("canSubmit").toBool());
    auto *notice = visualItem(window->contentItem(), "quick-provider-notice"); QVERIFY(notice); QVERIFY(notice->isVisible());
    QCOMPARE(owner->property("ownerID").toString(), chatID);
    QVERIFY(QMetaObject::invokeMethod(owner.data(), "ask", Q_ARG(QVariant, "")));
    QVERIFY(owner->property("quickAI").toBool());
    QVERIFY(!owner->property("canSubmit").toBool());
    auto *composer = visualItem(window->contentItem(), "quick-composer"); QVERIFY(composer);
    QTRY_VERIFY2(composer->height() < 100, qPrintable(QString("composer=%1 draftWidth=%2 draftHeight=%3").arg(composer->height()).arg(draft->width()).arg(draft->property("contentHeight").toDouble())));
    proxy->setProperty("providersEmpty", false);
    bridge.command("model", {{"sessionID", chatID}, {"value", "demo.slow"}});
    const QString questionAtLimit = QStringLiteral("e\u0301").repeated(3000);
    const auto before = bridge.state().value("tasks");
    QVERIFY(QMetaObject::invokeMethod(owner.data(), "ask", Q_ARG(QVariant, questionAtLimit + QStringLiteral("😀"))));
    QCOMPARE(bridge.state().value("tasks"), before);
    QVERIFY(!sendButton->isEnabled());
    auto *questionLimit = visualItem(window->contentItem(), "quick-question-limit");
    QVERIFY(questionLimit && questionLimit->isVisible());
    QVERIFY(questionLimit->property("text").toString().startsWith("3001 / 3000"));
    QVERIFY(QMetaObject::invokeMethod(owner.data(), "ask", Q_ARG(QVariant, questionAtLimit)));
    auto *thinking = visualItem(window->contentItem(), "quick-thinking"); QVERIFY(thinking); QTRY_VERIFY(thinking->isVisible());
    checkAccessibleName(window->contentItem(), "quick-message-user", bridge.strings().value("you").toString());
    checkAccessibleName(window->contentItem(), "quick-result", bridge.strings().value("result").toString());
    const auto quickTask = latest(bridge);
    chunk(bridge, quickTask, "Synthetic reply");
    checkAccessibleName(window->contentItem(), "quick-message-assistant", bridge.strings().value("response").toString());
    bridge.command("receive", {{"taskID", quickTask.value("id")}, {"attemptID", quickTask.value("attemptID")}, {"terminal", "failed"}, {"errorCode", "providerNetworkError"}});
    QTRY_VERIFY(owner->property("canRetry").toBool());
    QCOMPARE(owner->property("ownerID").toString(), chatID);
    QCOMPARE(warnings.count(), 0);
}

void WorkbenchBridgeTests::w5bUpdateSheet() {
    const auto previousVersion = QCoreApplication::applicationVersion();
    QCoreApplication::setApplicationVersion("2.5.0");
    const auto restoreVersion = qScopeGuard([previousVersion] { QCoreApplication::setApplicationVersion(previousVersion); });
    QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
    bridge.command("appearance", {{"mode", "light"}});
    QQmlEngine engine; QSignalSpy warnings(&engine, &QQmlEngine::warnings);
    engine.rootContext()->setContextProperty("workbench", &bridge);
    QQmlComponent component(&engine);
    component.setData(R"(
        import QtQuick
        import QtQuick.Controls
        import "qrc:/qml" as V
        ApplicationWindow {
            visible:true; width:820; height:640
            property alias updatePresentation: sheet
            QtObject {
                id:update; objectName:"update-fixture"
                property bool busy:false
                property bool ready:false
                property bool canInstall:false
                property bool installSucceeds:false
                property string version:"9.0"
                property string notes:"Synthetic notes"
                property string status:"updateAvailable"
                property real packageSize:64000000
                property real progress:0.4
                property real checkedAt:0
                property real remainingSeconds:20
                property int downloads:0
                property int installs:0
                function download() { downloads++; busy=true }
                function cancel() { busy=false }
                function openInstaller() { installs++ }
                function install() { if (installSucceeds) return true; status="updateInstallError"; return false }
                function check() { busy=true }
            }
            QtObject {
                id:proxy; objectName:"update-proxy"
                property var resources:workbench.resources; property var strings: workbench.strings; property var metrics: workbench.metrics; property var palettes: workbench.palettes; property var appearance: workbench.appearance; property var locale: workbench.locale; property var disabledModules: workbench.disabledModules; property var voice: workbench.voice
                property var state:workbench.state
                property var updates:update
                property var updatePrompt:({})
                property bool autoCheckUpdates:false
                property bool loadBlocked:false
                property bool failSave:false
                property string storageError:""
                function save() { storageError=failSave ? "storageError" : "" }
                property int snoozes:0
                property int dismisses:0
                property int presentations:0
                function snoozeUpdate() { snoozes++; updatePrompt=({}) }
                function dismissUpdatePrompt() { dismisses++; updatePrompt=({}) }
                function presentUpdateIfAvailable() { presentations++; updatePrompt=({version:"9.0",notes:"Synthetic notes"}) }
            }
            V.UpdateSettings { id:settings; objectName:"update-settings-fixture"; width:600; bridge:proxy }
            V.UpdateSheet { id:sheet; bridge:proxy }
        }
    )", QUrl("qrc:/w5b-updates.qml"));
    QScopedPointer<QObject> owner(component.create()); QVERIFY2(owner, qPrintable(component.errorString()));
    auto *window = qobject_cast<QQuickWindow *>(owner.data()); QVERIFY(window);
    auto *proxy = owner->findChild<QObject *>("update-proxy"); auto *update = owner->findChild<QObject *>("update-fixture"); auto *sheet = owner->findChild<QObject *>("update-sheet"); QVERIFY(proxy && update && sheet);
    QVERIFY(!sheet->property("visible").toBool());
    auto click = [&](const QString &name) { auto *item = visualItem(window->contentItem(), name); return item && QMetaObject::invokeMethod(item, "clicked"); };
    QVERIFY(click("settings-check-updates")); QCOMPARE(proxy->property("presentations").toInt(), 0);
    delete owner->findChild<QObject *>("update-settings-fixture");
    update->setProperty("busy", false); QTRY_VERIFY(sheet->property("visible").toBool()); QCOMPARE(proxy->property("presentations").toInt(), 1);
    QCOMPARE(sheet->property("phase").toString(), QString("available"));
    checkAccessibleName(window->contentItem(), "update-sheet-notes", bridge.strings().value("releaseNotes").toString());
    auto *summary = visualItem(window->contentItem(), "update-sheet-status"); QVERIFY(summary);
    for (const auto &locale : {QString("vi"), QString("en"), QString("ja")}) {
        bridge.command("locale", {{"value", locale}});
        const auto strings = bridge.resources().value("locales").toMap().value(locale).toMap();
        for (const double bytes : {64000000.0, 0.0, -1.0}) {
            update->setProperty("packageSize", bytes);
            const auto expected = strings.value(bytes > 0 ? "updateSheetSummary" : "updateSheetSummaryNoSize").toString()
                .replace("{version}", "9.0").replace("{size}", QLocale(locale).toString(64.0, 'f', 1) + " MB").replace("{current}", "2.5.0");
            QTRY_COMPARE(summary->property("text").toString(), expected);
            QVERIFY(!expected.contains('{'));
            int visibleLabels = 0;
            for (auto *item : summary->parentItem()->childItems()) if (item->isVisible() && item->property("text").isValid()) ++visibleLabels;
            QCOMPARE(visibleLabels, 2); // Heading plus one summary; no duplicate metadata labels.
        }
    }
    auto *snooze = visualItem(window->contentItem(), "update-sheet-snooze"); QVERIFY(snooze);
    snooze->forceActiveFocus(Qt::TabFocusReason);
    // Keep the prompt and version metadata on screen while each operation fails.
    for (const auto *operation : {"check", "download"}) {
        QVERIFY(QMetaObject::invokeMethod(update, operation));
        QVERIFY(update->property("busy").toBool()); QVERIFY(snooze->hasActiveFocus());
        update->setProperty("status", "updateError");
        update->setProperty("busy", false);
        auto *body = sheet->property("contentItem").value<QQuickItem *>(); QVERIFY(body);
        QQuickItem *error = nullptr;
        QTRY_VERIFY(error = visualText(body, bridge.strings().value("updateError").toString(), true));
        QTRY_VERIFY(error->height() > 0 && error->width() > 0);
        QTRY_VERIFY(error->mapToItem(body, QPointF(0, 0)).y() >= summary->mapToItem(body, QPointF(0, summary->height())).y());
        QTRY_VERIFY(error->mapToItem(body, QPointF(0, error->height())).y() <= body->height() + 1);
        update->setProperty("status", "updateAvailable");
    }
    update->setProperty("packageSize", 64000000.0);
    auto *download = visualItem(window->contentItem(), "update-sheet-download");
    auto *cancel = visualItem(window->contentItem(), "update-sheet-cancel");
    auto *install = visualItem(window->contentItem(), "update-sheet-install"); QVERIFY(download && cancel && install);
    download->forceActiveFocus(Qt::TabFocusReason);
    QVERIFY(click("update-sheet-download")); QVERIFY(cancel->hasActiveFocus());
    QCOMPARE(update->property("downloads").toInt(), 2); QCOMPARE(sheet->property("phase").toString(), QString("downloading"));
    const auto strings = bridge.resources().value("locales").toMap().value("ja").toMap();
    QTRY_COMPARE(summary->property("text").toString(), strings.value("updateDownloading").toString().replace("{percent}", "40"));
    QVERIFY(click("update-sheet-snooze")); QTRY_VERIFY(!sheet->property("visible").toBool()); QCOMPARE(proxy->property("snoozes").toInt(), 1); QCOMPARE(proxy->property("dismisses").toInt(), 0); QVERIFY(update->property("busy").toBool());
    QVERIFY(QMetaObject::invokeMethod(proxy, "presentUpdateIfAvailable")); QTRY_VERIFY(sheet->property("visible").toBool());
    cancel->forceActiveFocus(Qt::TabFocusReason);
    QVERIFY(click("update-sheet-cancel")); QVERIFY(!update->property("busy").toBool()); QVERIFY(download->hasActiveFocus());
    update->setProperty("ready", true); QCOMPARE(sheet->property("phase").toString(), QString("ready"));
    QVERIFY(install->hasActiveFocus());
    checkAccessible(window->contentItem(), "update-sheet-status", QAccessible::StatusBar);
    QTRY_COMPARE(summary->property("text").toString(), strings.value("updateReadyVersion").toString().replace("{version}", "9.0"));
    QCOMPARE(update->property("installs").toInt(), 0); QVERIFY(click("update-sheet-install")); QCOMPARE(update->property("installs").toInt(), 1);
    QVERIFY(click("update-sheet-close")); QTRY_VERIFY(!sheet->property("visible").toBool()); QCOMPARE(proxy->property("dismisses").toInt(), 1);
    QVERIFY(QMetaObject::invokeMethod(proxy, "presentUpdateIfAvailable")); QTRY_VERIFY(sheet->property("visible").toBool());
    QTest::keyClick(window, Qt::Key_Escape); QTRY_VERIFY(!sheet->property("visible").toBool()); QCOMPARE(proxy->property("dismisses").toInt(), 2);
    QSignalSpy quit(&engine, &QQmlEngine::quit);
    update->setProperty("canInstall", true); update->setProperty("status", "updateReady");
    QVERIFY(QMetaObject::invokeMethod(proxy, "presentUpdateIfAvailable")); QTRY_VERIFY(sheet->property("visible").toBool());
    checkAccessibleName(window->contentItem(), "update-sheet-install", strings.value("installUpdate").toString());
    QVERIFY(visualText(window->contentItem(), strings.value("updateReadyInstall").toString(), true));
    proxy->setProperty("failSave", true);
    QVERIFY(click("update-sheet-install")); QTRY_VERIFY(!sheet->property("visible").toBool());
    QCOMPARE(proxy->property("storageError").toString(), QString("storageError")); QCOMPARE(update->property("status").toString(), QString("updateReady")); QCOMPARE(quit.count(), 0);
    proxy->setProperty("failSave", false);
    QVERIFY(QMetaObject::invokeMethod(proxy, "presentUpdateIfAvailable")); QTRY_VERIFY(sheet->property("visible").toBool());
    QVERIFY(click("update-sheet-install")); QCOMPARE(quit.count(), 0);
    QVERIFY(visualText(window->contentItem(), strings.value("updateInstallError").toString(), true));
    checkAccessibleName(window->contentItem(), "update-sheet-install", strings.value("openUpdate").toString());
    QVERIFY(click("update-sheet-install")); QCOMPARE(update->property("installs").toInt(), 2);
    update->setProperty("status", "updateReady"); update->setProperty("installSucceeds", true);
    proxy->setProperty("loadBlocked", true); proxy->setProperty("failSave", true);
    QVERIFY(click("update-sheet-install")); QCOMPARE(quit.count(), 1);
    QCOMPARE(warnings.count(), 0);
}

// ---- W5a Shell ----
void WorkbenchBridgeTests::w5aCompactShell_data() {
    QTest::addColumn<int>("width"); QTest::addColumn<QString>("mode"); QTest::addColumn<QString>("locale");
    QTest::newRow("compact-light-vi") << 820 << QString("light") << QString("vi");
    QTest::newRow("compact-dark-en") << 820 << QString("dark") << QString("en");
    QTest::newRow("compact-dark-ja") << 820 << QString("dark") << QString("ja");
    QTest::newRow("minimum-light-vi") << 640 << QString("light") << QString("vi");
    QTest::newRow("minimum-dark-ja") << 640 << QString("dark") << QString("ja");
    QTest::newRow("breakpoint-light-vi") << 900 << QString("light") << QString("vi");
    QTest::newRow("wide-light-en") << 1280 << QString("light") << QString("en");
}

void WorkbenchBridgeTests::w5aCompactShell() {
    QFETCH(int,width); QFETCH(QString,mode); QFETCH(QString,locale);
    QTemporaryDir dir; WorkbenchBridge bridge(nullptr,dir.filePath("state.json"),false);
    bridge.command("appearance",{{"mode",mode}});
    bridge.command("locale",{{"value",locale}});
    bridge.command("route",{{"value","home"}});
    bridge.command("navigation",{{"collapsed",false}});
    QQmlApplicationEngine engine; QSignalSpy warnings(&engine,&QQmlEngine::warnings);
    engine.rootContext()->setContextProperty("workbench",&bridge);
    engine.load(QUrl("qrc:/qml/Main.qml")); QVERIFY(!engine.rootObjects().isEmpty());
    auto *window=qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(window);
    window->resize(width,width == 640 ? 480 : width == 820 ? 640 : 800);
    QVERIFY(QTest::qWaitForWindowExposed(window));
    auto *nav=visualItem(window->contentItem(),"primary-navigation"); QVERIFY(nav);
    QTRY_COMPARE(nav->property("expanded").toBool(),width >= 900);
    auto *grid=visualItem(window->contentItem(),"home-quick-grid"); QVERIFY(grid);
    QTRY_COMPARE(grid->property("columns").toInt(),width < 1100 ? 2 : 4);
    auto *pill=visualItem(window->contentItem(),"home-model-pill"); QVERIFY(pill);
    QCOMPARE(pill->isVisible(),width < 1100);
    auto *intro=visualItem(window->contentItem(),"home-intro"); QVERIFY(intro);
    if (width < 900) QVERIFY(intro->property("titleScale").toDouble() < 1.6);
    QVERIFY(grid->mapToScene(QPointF(grid->width(),0)).x() <= width);

    QVERIFY(QMetaObject::invokeMethod(window,"selectRoute",Q_ARG(QVariant,"chat")));
    bridge.command("draft",{{"value","Synthetic W5a draft"}});
    auto *draft=visualItem(window->contentItem(),"chat-draft"); QVERIFY(draft);
    auto *composer=visualItem(window->contentItem(),"chat-composer"); QVERIFY(composer);
    auto *transcript=visualItem(window->contentItem(),"chat-transcript"); QVERIFY(transcript);
    auto *reading=visualItem(window->contentItem(),"reading-pane"); QVERIFY(reading);
    QTRY_VERIFY(composer->property("singleRow").toBool());
    if (width < 900) QTRY_VERIFY(qAbs(composer->width() - (reading->width()-48)) <= 1);
    if (width < 900) QTRY_VERIFY(qAbs(composer->mapToScene(QPointF()).x()-transcript->mapToScene(QPointF()).x()) <= 1);
    QVERIFY(composer->mapToScene(QPointF(composer->width(),composer->height())).y() <= window->height());
    auto *lineupLabel=visualItem(window->contentItem(),"chat-lineup-label"); QVERIFY(lineupLabel);
    QCOMPARE(lineupLabel->isVisible(),width >= 760);
    auto *crumb=visualItem(window->contentItem(),"session-breadcrumb-title"); QVERIFY(crumb && crumb->isVisible());
    QPointer<QQuickItem> sameDraft=draft;
    const auto sessionID=current(bridge).value("id");
    window->resize(1280,800); QCoreApplication::processEvents();
    window->resize(width,width == 640 ? 480 : 640); QCoreApplication::processEvents();
    QCOMPARE(visualItem(window->contentItem(),"chat-draft"),sameDraft.data());
    QCOMPARE(current(bridge).value("id"),sessionID);
    QCOMPARE(current(bridge).value("draft").toString(),QString("Synthetic W5a draft"));
    QVERIFY(!bridge.state().value("shell").toMap().value("navigationCollapsed").toBool());

    QVERIFY(QMetaObject::invokeMethod(window,"selectRoute",Q_ARG(QVariant,"translate")));
    auto *source=visualItem(window->contentItem(),"translate-source-language");
    auto *target=visualItem(window->contentItem(),"translate-target-language");
    auto *model=visualItem(window->contentItem(),"feature-model-trigger"); QVERIFY(source && target && model);
    QTRY_VERIFY(qAbs(source->mapToScene(QPointF()).y()-model->mapToScene(QPointF()).y()) <= 1);
    QVERIFY(model->mapToScene(QPointF(model->width(),0)).x() <= width);
    QCOMPARE(visualItem(source,"language-direction")->isVisible(),width >= 1100);
    if (width < 1100) QTRY_COMPARE(model->width(),32.0);
    QCOMPARE(model->height(), source->height());
    auto *surface=visualItem(window->contentItem(),"translation-result-surface"); QVERIFY(surface);
    QVERIFY(surface->property("color").value<QColor>().alphaF() > 0);
    auto *actions=visualItem(window->contentItem(),"translation-actions"); QVERIFY(actions);
    QTRY_VERIFY(actions->isVisible());
    QTRY_VERIFY(actions->mapToScene(QPointF(actions->width(),actions->height())).y() <= window->height());
    auto *listen=visualItem(window->contentItem(),"translate-listen"); QVERIFY(listen && !listen->isEnabled());
    model->forceActiveFocus(Qt::TabFocusReason); QTest::keyClick(window,Qt::Key_Space);
    // Route Loader destruction is deferred; scope the popup to this picker,
    // not an identically named popup in the retiring Chat view.
    auto *panel=model->parentItem()->findChild<QObject *>("model-lineup-panel"); QVERIFY(panel);
    QTRY_VERIFY(panel->property("visible").toBool());
    QTest::keyClick(window,Qt::Key_Escape); QTRY_VERIFY(!panel->property("visible").toBool());
    QTRY_VERIFY(model->hasActiveFocus());
    QCOMPARE(warnings.count(),0);
}

void WorkbenchBridgeTests::w5aSolidAppearance() {
    QTemporaryDir dir; WorkbenchBridge bridge(nullptr,dir.filePath("state.json"),false);
    bridge.command("appearance",{{"mode","light"}});
    QQmlApplicationEngine engine; QSignalSpy warnings(&engine,&QQmlEngine::warnings);
    engine.rootContext()->setContextProperty("workbench",&bridge);
    QQmlComponent fakeComponent(&engine);
    fakeComponent.setData("import QtQml; QtObject { property bool reduceTransparency: false; property bool highContrast: false }",QUrl("qrc:/w5a-appearance.qml"));
    QScopedPointer<QObject> fake(fakeComponent.create()); QVERIFY2(fake,qPrintable(fakeComponent.errorString()));
    engine.rootContext()->setContextProperty("systemAppearance",fake.data());
    engine.load(QUrl("qrc:/qml/Main.qml")); QVERIFY(!engine.rootObjects().isEmpty());
    auto *window=qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(window);
    window->resize(820,640); QVERIFY(QTest::qWaitForWindowExposed(window));
    QVERIFY(QMetaObject::invokeMethod(window,"selectRoute",Q_ARG(QVariant,"chat")));
    auto *nav=visualItem(window->contentItem(),"navigation-glass-pane"); QVERIFY(nav);
    auto *reading=visualItem(window->contentItem(),"reading-pane"); QVERIFY(reading);
    auto *readingSurface=reading->property("background").value<QQuickItem *>(); QVERIFY(readingSurface);
    auto *palette=window->findChild<QObject *>("command-palette"); QVERIFY(palette);
    QVERIFY(QMetaObject::invokeMethod(palette,"open")); QTRY_VERIFY(palette->property("visible").toBool());
    auto *overlay=palette->property("background").value<QQuickItem *>(); QVERIFY(overlay);
    auto *overlayFace=visualItem(overlay,"glass-pane-face"); QVERIFY(overlayFace);
    auto *toggle=visualItem(window->contentItem(),"navigation-toggle"); QVERIFY(toggle);
    auto *controlFace=visualItem(toggle,"glass-control-solid-face"); QVERIFY(controlFace);
    auto *control=controlFace->parentItem(); QVERIFY(control);
    auto *search=visualItem(window->contentItem(),"command-search"); QVERIFY(search);
    auto *searchFace=visualItem(search->property("background").value<QQuickItem *>(),"search-field-face"); QVERIFY(searchFace);
    auto *searchBorder=searchFace->property("border").value<QObject *>(); QVERIFY(searchBorder);
    window->requestActivate(); QTRY_VERIFY(window->isActive());
    QColor lightPane;
    for (const auto &mode : {QString("light"),QString("dark")}) {
        bridge.command("appearance",{{"mode",mode}});
        const auto theme=bridge.resources().value("themePalettes").toMap().value("glass:auto").toMap().value(mode).toMap();
        // 00 → 10 → 11 → 01 → 00 exercises NOTIFY and independent flags.
        for (const auto flags : {qMakePair(false,false),qMakePair(true,false),qMakePair(true,true),qMakePair(false,true),qMakePair(false,false)}) {
            fake->setProperty("reduceTransparency",flags.first); fake->setProperty("highContrast",flags.second);
            const bool solid=flags.first || flags.second;
            QTRY_COMPARE(window->property("solidChrome").toBool(),solid);
            QTRY_COMPARE(nav->property("solid").toBool(),solid);
            QTRY_COMPARE(readingSurface->property("solid").toBool(),solid);
            QTRY_COMPARE(controlFace->isVisible(),solid);
            if (solid) {
                for (auto *pane : {nav,readingSurface,overlayFace->parentItem()}) {
                    QCOMPARE(pane->property("solidColor").value<QColor>().alpha(),255);
                    QVERIFY(!visualItem(pane,"glass-pane-highlight")->isVisible());
                    QVERIFY(!visualItem(pane,"glass-pane-shadow")->isVisible());
                    auto *face=visualItem(pane,"glass-pane-face"); QVERIFY(face);
                    const auto edge=face->property("border").value<QObject *>(); QVERIFY(edge);
                    QCOMPARE(edge->property("color").value<QColor>(),QColor(theme.value(flags.second ? "border-strong" : "border").toString()));
                }
                toggle->forceActiveFocus(); QTRY_VERIFY(!search->hasActiveFocus());
                QTRY_COMPARE(searchBorder->property("color").value<QColor>(),QColor(theme.value(flags.second ? "border-strong" : "border").toString()));
                search->forceActiveFocus(); QTRY_VERIFY(search->hasActiveFocus());
                QTRY_COMPARE(searchBorder->property("color").value<QColor>(),QColor(theme.value("border-strong").toString()));
                QVERIFY(!visualItem(control,"glass-control-reflections")->isVisible());
                QVERIFY(!visualItem(control,"glass-control-shadow")->isVisible());
                QCOMPARE(controlFace->property("color").value<QColor>().alpha(),255);
                if (mode == "light") lightPane=nav->property("solidColor").value<QColor>();
                else QVERIFY(lightPane != nav->property("solidColor").value<QColor>());
            }
        }
    }
    fake->setProperty("reduceTransparency",false);
    fake->setProperty("highContrast",false); QTRY_VERIFY(!window->property("solidChrome").toBool());
    fake->setProperty("highContrast",true); QTRY_VERIFY(window->property("solidChrome").toBool());
    QCOMPARE(warnings.count(),0);
}

void WorkbenchBridgeTests::w5aPaletteQueries() {
    QTemporaryDir dir; WorkbenchBridge bridge(nullptr,dir.filePath("state.json"),false);
    bridge.command("appearance",{{"mode","light"}});
    QQmlApplicationEngine engine; QSignalSpy warnings(&engine,&QQmlEngine::warnings);
    engine.rootContext()->setContextProperty("workbench",&bridge);
    engine.load(QUrl("qrc:/qml/Main.qml")); QVERIFY(!engine.rootObjects().isEmpty());
    auto *window=qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(window);
    window->resize(820,640); QVERIFY(QTest::qWaitForWindowExposed(window));
    window->requestActivate(); QTRY_VERIFY(window->isActive());
    auto *palette=window->findChild<QObject *>("command-palette"); QVERIFY(palette);
    auto entries=[&] { return window->property("commandEntries").value<QJSValue>().toVariant().toList(); };
    QTest::keyClick(window,Qt::Key_K,Qt::ControlModifier); QTRY_VERIFY(palette->property("visible").toBool());
    auto *search=visualItem(window->contentItem(),"command-search"); QVERIFY(search);
    for (const auto &locale : {QString("vi"),QString("en"),QString("ja")}) {
        bridge.command("locale",{{"value",locale}});
        const auto strings=bridge.resources().value("locales").toMap().value(locale).toMap();
        search->setProperty("text","2+3*4");
        QTRY_COMPARE(entries().first().toMap().value("kind").toString(),QString("calculation"));
        QCOMPARE(entries().first().toMap().value("label").toString(),strings.value("paletteCalc").toString().replace("{result}","14"));
        QVERIFY(entries().size() > 10); QCOMPARE(entries()[1].toMap().value("group").toString(),QString("paletteGroupPages"));
    }
    const auto before=bridge.state();
    QInputMethodEvent preedit(QString::fromUtf8("にほん"),{}); QCoreApplication::sendEvent(search,&preedit);
    QTRY_VERIFY(search->property("inputMethodComposing").toBool());
    QTest::keyClick(window,Qt::Key_Return); QVERIFY(palette->property("visible").toBool()); QCOMPARE(bridge.state(),before);
    QInputMethodEvent finished; finished.setCommitString(""); QCoreApplication::sendEvent(search,&finished);
    QTest::keyClick(window,Qt::Key_Return); QTRY_VERIFY(!palette->property("visible").toBool());
    QCOMPARE(QGuiApplication::clipboard()->text(),QString("14")); QCOMPARE(bridge.state(),before);
    for (const auto &pair : {qMakePair(QString("? synthetic question"),QString("chat")),qMakePair(QString("t synthetic translation"),QString("translate")),qMakePair(QString("d synthetic"),QString("dictionary"))}) {
        QTest::keyClick(window,Qt::Key_K,Qt::ControlModifier); QTRY_VERIFY(palette->property("visible").toBool());
        search->setProperty("text",pair.first); QCoreApplication::processEvents();
        const auto value=entries().first().toMap().value("value").toString(); QVERIFY(!value.isEmpty());
        const auto oldID=current(bridge).value("id");
        QTest::keyClick(window,Qt::Key_Return); QTRY_VERIFY(!palette->property("visible").toBool());
        QCOMPARE(bridge.state().value("feature").toString(),pair.second);
        QVERIFY(current(bridge).value("id") != oldID);
        QCOMPARE(latest(bridge).value("request").toMap().value("sessionID"),current(bridge).value("id"));
        QCOMPARE(latest(bridge).value("request").toMap().value("input").toString(),value);
        bridge.command("cancel",{{"taskID",latest(bridge).value("id")}});
    }
    QTest::keyClick(window,Qt::Key_K,Qt::ControlModifier); QTRY_VERIFY(palette->property("visible").toBool());
    search->setProperty("text","t disabled module");
    QTRY_COMPARE(entries().first().toMap().value("id").toString(),QString("query-result"));
    QTest::keyClick(window,Qt::Key_Down); QCOMPARE(window->property("commandIndex").toInt(),1);
    QTest::keyClick(window,Qt::Key_Up); QCOMPARE(window->property("commandIndex").toInt(),0);
    bridge.command("module",{{"id","translate"},{"enabled",false}});
    QTRY_VERIFY(entries().first().toMap().value("id").toString() != "query-result");
    const auto blockedState=bridge.state();
    QVERIFY(QMetaObject::invokeMethod(window,"runPaletteEntry",Q_ARG(QVariant,"query-result")));
    QCOMPARE(bridge.state(),blockedState);
    QTest::keyClick(window,Qt::Key_Escape); QTRY_VERIFY(!palette->property("visible").toBool());
    QCOMPARE(warnings.count(),0);
}

// Every visible button or single-line control (chips, pickers) gives its content a full
// line and centres a lone label.
static void collectOffCentre(QQuickItem *item, const QString &where, QStringList &found) {
    if (!item->isVisible()) return;
    if (item->height() > 0 && (item->inherits("QQuickAbstractButton") || (item->inherits("QQuickControl") && item->height() <= 48))) {
        auto *content = item->property("contentItem").value<QQuickItem *>();
        QList<QQuickItem *> labels, pending{item};
        while (!pending.isEmpty()) {
            auto *next = pending.takeFirst();
            for (auto *child : next->childItems()) if (child->isVisible()) pending << child;
            if (next->inherits("QQuickText") && next->width() > 0 && !next->property("text").toString().isEmpty()) labels << next;
        }
        const auto name = where + " " + (item->objectName().isEmpty() ? item->property("text").toString() : item->objectName());
        if (content && content->isVisible() && content->height() + 0.5 < content->implicitHeight())
            found << QString("%1: content %2 < %3").arg(name).arg(content->height()).arg(content->implicitHeight());
        else if (item->inherits("QQuickAbstractButton") && labels.size() == 1 && labels.first()->property("lineCount").toInt() == 1) {
            auto *label = labels.first();
            const auto painted = label->property("contentHeight").toDouble();
            const auto top = label->mapToItem(item, QPointF(0, 0)).y() + (label->property("verticalAlignment").toInt() == Qt::AlignVCenter ? (label->height() - painted) / 2 : label->property("verticalAlignment").toInt() == Qt::AlignBottom ? label->height() - painted : label->property("topPadding").toDouble());
            const auto offset = top + painted / 2 - item->height() / 2;
            if (qAbs(offset) > 1.0) found << QString("%1: label %2 px off centre").arg(name).arg(offset);
        }
    }
    for (auto *child : item->childItems()) collectOffCentre(child, where, found);
}
void WorkbenchBridgeTests::buttonLabelsAreCentred() {
    QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
    bridge.command("appearance", {{"mode", "dark"}});
    bridge.command("locale", {{"value", "vi"}});
    ProviderDiscovery::Snapshot snapshot; snapshot.checked = true; snapshot.models["ollama"] = {"ollama:llama3.2"}; bridge.applyProviderSnapshot(snapshot);
    bridge.command("route", {{"value", "chat"}}); bridge.command("model", {{"value", "ollama:llama3.2"}});
    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty("workbench", &bridge); engine.load(QUrl("qrc:/qml/Main.qml"));
    QVERIFY(!engine.rootObjects().isEmpty()); auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(root);
    root->resize(1044, 760); QVERIFY(QTest::qWaitForWindowExposed(root));
    // A failed answer with partial text shows Copy, Retry and the meta chip.
    bridge.command("draft", {{"value", "Question"}}); bridge.command("submit");
    QTRY_COMPARE(bridge.state().value("tasks").toList().size(), 1);
    const auto task = latest(bridge);
    bridge.command("receive", {{"taskID", task.value("id")}, {"attemptID", task.value("attemptID")}, {"chunk", "Answer"}, {"terminal", "failed"}, {"errorCode", "providerError"}});
    QQuickItem *retry = nullptr; QTRY_VERIFY(retry = visualItem(root->contentItem(), "chat-retry-" + task.value("id").toString())); QTRY_VERIFY(retry->isVisible());
    QStringList found;
    // Home, Local models and the system pages start real device services that outlive
    // the test; they share these controls and are left out.
    for (const auto &route : {QString("chat"), QString("translate"), QString("dictionary")}) {
        bridge.command("route", {{"value", route}}); bridge.command("navigate", {{"feature", route}}); QTest::qWait(150);
        collectOffCentre(root->contentItem(), route, found);
    }
    for (const auto &section : {QString("general"), QString("appearance"), QString("providers"), QString("voice"), QString("modules"), QString("data"), QString("updates"), QString("about")}) {
        QVERIFY(QMetaObject::invokeMethod(root, "openSettingsSection", Q_ARG(QVariant, section))); QTest::qWait(150);
        collectOffCentre(root->contentItem(), "settings/" + section, found);
    }
    found.removeDuplicates();
    QVERIFY2(found.isEmpty(), qPrintable("\n" + found.join("\n")));
}

// At the minimum window height the sidebar scrolls its destinations instead of
// overflowing the pane above the header and below the window.
void WorkbenchBridgeTests::navigationFitsShortWindow() {
    QTemporaryDir dir; WorkbenchBridge bridge(nullptr, dir.filePath("state.json"), false);
    bridge.command("appearance", {{"mode", "light"}});
    bridge.command("route", {{"value", "chat"}});
    QQmlApplicationEngine engine; QSignalSpy warnings(&engine, &QQmlEngine::warnings);
    engine.rootContext()->setContextProperty("workbench", &bridge); engine.load(QUrl("qrc:/qml/Main.qml"));
    QVERIFY(!engine.rootObjects().isEmpty()); auto *root = qobject_cast<QQuickWindow *>(engine.rootObjects().first()); QVERIFY(root);
    root->resize(1044, 480); QVERIFY(QTest::qWaitForWindowExposed(root));
    auto *navigation = visualItem(root->contentItem(), "primary-navigation"); QVERIFY(navigation);
    auto *destinations = visualItem(navigation, "navigation-destinations"); QVERIFY(destinations);
    QTRY_VERIFY(navigation->mapToScene(QPointF(0, 0)).y() >= 0);
    QTRY_VERIFY(navigation->mapToScene(QPointF(0, navigation->height())).y() <= root->height());
    QVERIFY(destinations->mapToItem(navigation, QPointF(0, 0)).y() >= 0);
    QVERIFY(destinations->mapToItem(navigation, QPointF(0, destinations->height())).y() <= navigation->height());
    QVERIFY(destinations->property("contentHeight").toDouble() > destinations->height());
    QCoreApplication::processEvents(); QCOMPARE(warnings.count(), 0);
}

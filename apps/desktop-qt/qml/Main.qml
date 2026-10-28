import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs
import QtQuick.Controls.impl

ApplicationWindow {
    id: root
    property int beforeCaptureVisibility: Window.Windowed
    RegionCapture { bridge: workbench }
    Connections {
        target: workbench
        function onCapturePreparing() { root.beforeCaptureVisibility = root.visibility; root.hide() }
        function onCaptureFinished() { root.visibility = root.beforeCaptureVisibility; root.raise(); root.requestActivate() }
    }
    DesktopPanels { bridge: workbench; onOpenMainRequested: sessionID => { root.choose(sessionID); root.show(); root.raise(); root.requestActivate() } }
    visible: true
    readonly property var workspace: workbench.state
    readonly property var metrics: workbench.resources.metrics
    readonly property bool darkMode: workspace.appearance?.preset === "midnight" || workspace.appearance?.mode === "dark" || (workspace.appearance?.mode !== "light" && workspace.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
    readonly property var colors: workbench.resources.themePalettes[(workspace.appearance?.preset || "graphite") + ":" + (workspace.appearance?.accent || "auto")][darkMode ? "dark" : "light"]
    palette.window: colors["sidebar-bg"]
    palette.base: colors.surface
    palette.alternateBase: colors.canvas
    palette.text: colors.text
    palette.windowText: colors.text
    palette.buttonText: colors.text
    palette.button: colors.surface
    palette.placeholderText: colors["text-muted"]
    palette.midlight: colors.border
    palette.mid: colors["border-strong"]
    palette.link: colors["action-text"]
    palette.highlight: colors.action
    palette.highlightedText: colors["action-fg"]
    palette.disabled.buttonText: colors["text-disabled"]
    palette.disabled.button: colors["surface-subtle"]
    readonly property var session: root.workspace.sessions.find(item => item.id === root.workspace.active[root.workspace.feature])
    readonly property var activeTask: root.workspace.tasks.find(task => task.request.sessionID === session.id && task.status === "running")
    readonly property var languages: workbench.resources.nativeLanguages
    readonly property var models: Array.from(new Set(workbench.localModels.concat([session.model]).filter(id => !id.startsWith("demo.")))).sort()
    readonly property real readingPointSize: Qt.application.font.pointSize * workbench.resources.textScales[root.workspace.appearance?.textSize || "medium"]
    readonly property bool compact: width < metrics.compact
    readonly property bool navigationCollapsed: !!workspace.shell?.navigationCollapsed
    property var overlayOpener: null
    property bool replacingOverlay: false
    property int composerFocusEpoch: 0
    property string commandQuery: ""
    property int commandIndex: 0
    readonly property var commandEntries: workbench.resources.commands.filter(item =>
        (!workbench.loadBlocked || ["settings", "activity"].includes(item.id)) &&
        (item.id !== "history" || (!home && !settings && !library)) && normalize(t(item.title)).includes(normalize(commandQuery.trim())))
    function normalize(value) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d") }
    function composing() { return !!root.activeFocusItem?.inputMethodComposing }
    function closeOverlays(restore) {
        replacingOverlay = !restore
        history.close(); activity.close(); navigationOverlay.close(); commands.close()
        replacingOverlay = false
    }
    function restoreOverlayFocus() {
        if (!replacingOverlay && overlayOpener) overlayOpener.forceActiveFocus()
    }
    function toggleOverlay(popup, opener) {
        if (popup.visible) { popup.close(); return }
        const previous = overlayOpener
        const switching = history.visible || activity.visible || navigationOverlay.visible || commands.visible
        closeOverlays(false)
        overlayOpener = switching ? previous : (opener || root.activeFocusItem)
        popup.open()
    }
    // One-shot section request for Settings (consumed when the workspace opens it).
    property string settingsSection: ""
    function openSettingsSection(section) { settingsQuery = ""; settingsSection = section; selectRoute("settings") }
    // Reads localModels so bindings re-evaluate when discovery publishes a new snapshot.
    function modelUnavailable(model) { workbench.localModels; const state = workbench.availability(model || ""); return state !== "available" && state !== "unknown" }
    function selectRoute(route) {
        if (!workbench.moduleEnabled(route)) return
        if (workbench.loadBlocked && route !== "settings") return
        closeOverlays(true); library = false; systemRoute = ["utilities", "everywhere", "thermal", "interpret", "apps"].includes(route) ? route : ""; settings = route === "settings" || !!systemRoute; home = route === "home"; command("route", {value: route})
        if (!settings && !home) command("navigate", {feature: route})
    }
    function execute(id, opener) {
        if (["home", "chat", "translate", "dictionary", "settings", "utilities", "everywhere", "thermal", "interpret", "apps"].includes(id)) selectRoute(id)
        else if (id === "commands") toggleOverlay(commands, opener || root.activeFocusItem)
        else if (id === "navigation") {
            if (compact) toggleOverlay(navigationOverlay, opener || navigationTrigger)
            else { closeOverlays(true); command("navigation", {collapsed: !navigationCollapsed}) }
        } else if (id === "history" && !home && !settings && !library && !workbench.loadBlocked) toggleOverlay(history, opener || historyTrigger)
        else if (id === "activity") toggleOverlay(activity, opener || activityTrigger)
        else if (id === "new" && !workbench.loadBlocked) {
            closeOverlays(false); if (home || settings) command("navigate", {feature: "chat"}); home = false; settings = false; library = false; command("new"); command("route", {value: workspace.feature}); composerFocusEpoch++
        }
    }
    onCompactChanged: if (navigationOverlay.visible) navigationOverlay.close()
    onCommandQueryChanged: commandIndex = 0
    property string systemRoute: ["utilities", "everywhere", "thermal", "interpret", "apps"].includes(workspace.shell?.lastRoute) ? workspace.shell.lastRoute : ""
    property bool settings: !!systemRoute
    property bool home: workspace.shell?.lastRoute === "home" || !workspace.shell?.lastRoute
    property bool library: false
    property string settingsQuery: ""
    readonly property int runningCount: workspace.tasks.filter(task => task.status === "running").length
    readonly property bool workspacePage: home || ["everywhere", "apps", "thermal", "utilities"].includes(systemRoute)
    property bool favoritesOnly: false
    property bool archivedHistory: false
    property string historyQuery: ""
    property string previewID: ""
    property string quickID: ""
    readonly property var historyRecords: root.workspace.sessions.filter(matches)
    onHistoryRecordsChanged: {
        if (!historyRecords.some(item => item.id === quickID)) quickID = historyRecords[0]?.id || ""
        if (!historyRecords.some(item => item.id === previewID)) previewID = historyRecords[0]?.id || ""
    }
    width: metrics.sidebar + metrics.reading + metrics.gutter * 2
    height: metrics.reading
    minimumWidth: metrics.minWindowWidth
    minimumHeight: metrics.minWindowHeight
    // System pages (Interpretation, Apps, Thermal…) share the settings shell but keep their own name.
    title: "Viezan Native — " + t(home ? "home" : settings ? (systemRoute || "settings") : root.workspace.feature)
    color: palette.base
    function t(key) { return workbench.resources.locales[root.workspace.locale][key] || key }
    function command(name, payload) { workbench.command(name, payload || {}) }
    function titleFor(item) { return item.title || t(item.feature === "chat" ? "newChat" : item.feature === "dictionary" ? "newLookup" : "newTranslation") }
    function lang(code) { return t("lang_" + code) }
    // Delegates to Kit.ModelLabel so every view formats model IDs the same way.
    Kit.ModelLabel { id: modelFormatter; visible: false }
    function modelLabel(id) { return modelFormatter.format(id) }
    function speechText() {
        if (session.feature === "chat") return session.messages.filter(message => message.role === "assistant").slice(-1)[0]?.text || ""
        if (session.feature === "dictionary") { try { const entry = JSON.parse(session.output); return entry.headword + ". " + entry.meaning } catch (_) { return "" } }
        return (session.images || []).length ? workbench.imageTranslationText(session.output) : session.output
    }
    function matches(item) {
        const normalize = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d")
        return (!root.library || !root.favoritesOnly || item.feature !== "dictionary" || !!item.favorite) && !item.comparisonParent && item.feature === root.workspace.feature && !!item.archived === (root.library && root.archivedHistory) && normalize(titleFor(item) + " " + item.draft + " " + item.output + " " + item.messages.map(message => message.text).join(" ")).includes(normalize(historyQuery.trim()))
    }
    function choose(id) { closeOverlays(true); command("select", {sessionID: id}); settings = false; home = false; library = false; command("route", {value: workspace.feature}) }
    function moveHistory(list, offset) {
        if (!historyRecords.length) return
        const id = list.preview ? previewID : quickID
        let index = historyRecords.findIndex(item => item.id === id)
        if (index < 0) index = offset > 0 ? -1 : historyRecords.length
        index = Math.max(0, Math.min(index + offset, historyRecords.length - 1))
        if (list.preview) previewID = historyRecords[index].id
        else quickID = historyRecords[index].id
        list.positionViewAtIndex(index, ListView.Contain)
    }
    function historySections(item) {
        if (!item) return []
        if (item.feature !== "chat") return [{label: t("source"), text: item.draft || t("noContent")}, {label: t("result"), text: item.output || t("emptyResult")}]
        const sections = item.messages.map(message => ({label: message.role === "assistant" ? "Viezan" : t("you"), text: message.text || t(root.workspace.tasks.find(task => task.id === message.id)?.status || "noContent")}))
        if (item.draft) sections.push({label: t("unsentDraft"), text: item.draft})
        return sections.length ? sections : [{label: t("historyPreview"), text: t("noContent")}]
    }
    function submit() { if (activeTask) command("cancel", {taskID: activeTask.id}); else command("submit") }
    function submitKey(event, isComposing) {
        event.accepted = !!(event.modifiers & Qt.ControlModifier) && !isComposing
        if (event.accepted) command("submit")
    }
    function placeHistory() {
        const anchor = historyTrigger.mapToItem(Overlay.overlay, 0, historyTrigger.height)
        history.x = Math.max(metrics.inset, Math.min(anchor.x, root.width - history.width - metrics.inset))
        history.y = Math.max(metrics.inset, Math.min(anchor.y, root.height - history.height - metrics.inset))
    }
    onWidthChanged: if (history.visible) placeHistory()
    onHeightChanged: if (history.visible) placeHistory()
    onClosing: function(close) { workbench.shutdown(); if (workbench.storageError && !workbench.loadBlocked) close.accepted = false }
    menuBar: MenuBar {
        Menu {
            title: t("commands")
            MenuItem { action: Action { text: t("commands"); shortcut: "Ctrl+K"; onTriggered: root.execute("commands", root.activeFocusItem) } }
            MenuItem { action: Action { text: t("toggleNavigation"); shortcut: "Ctrl+\\"; onTriggered: root.execute("navigation", root.activeFocusItem) } }
            MenuSeparator {}
            MenuItem { action: Action { text: t("home"); shortcut: "Ctrl+0"; enabled: !workbench.loadBlocked; onTriggered: root.execute("home") } }
            MenuItem { action: Action { text: t("chat"); shortcut: "Ctrl+1"; enabled: !workbench.loadBlocked; onTriggered: root.execute("chat") } }
            MenuItem { action: Action { text: t("translate"); shortcut: "Ctrl+2"; enabled: !workbench.loadBlocked; onTriggered: root.execute("translate") } }
            MenuItem { action: Action { text: t("dictionary"); shortcut: "Ctrl+3"; enabled: !workbench.loadBlocked; onTriggered: root.execute("dictionary") } }
            MenuItem { action: Action { text: t("settings"); shortcut: StandardKey.Preferences; onTriggered: root.execute("settings") } }
            MenuSeparator {}
            MenuItem { action: Action { text: t("newWork"); shortcut: StandardKey.New; enabled: !workbench.loadBlocked; onTriggered: root.execute("new") } }
            MenuItem { action: Action { text: t("history"); shortcut: "Ctrl+Shift+H"; enabled: !root.settings && !root.library && !workbench.loadBlocked; onTriggered: root.execute("history", root.activeFocusItem) } }
            MenuItem { action: Action { text: t("activity"); shortcut: "Ctrl+Shift+A"; onTriggered: root.execute("activity", root.activeFocusItem) } }
        }
    }

    component ShellButton: ToolButton {
        id: shellButton
        property string iconName
        property bool showsLabel: false
        property bool primary: false
        palette.buttonText: !enabled ? root.colors["text-disabled"] : primary ? root.colors["action-text"] : root.colors.text
        leftPadding: showsLabel ? metrics.gap : 0
        rightPadding: leftPadding
        background: Rectangle {
            radius: metrics.surfaceRadius
            color: shellButton.primary ? Qt.tint(shellButton.palette.base, Qt.alpha(shellButton.palette.highlight, metrics.selectionOpacity)) : shellButton.hovered ? shellButton.palette.alternateBase : "transparent"
            border.width: shellButton.visualFocus ? metrics.hairline : 0
            border.color: shellButton.visualFocus ? shellButton.palette.highlight : shellButton.palette.midlight
        }
        implicitWidth: showsLabel ? implicitContentWidth + leftPadding + rightPadding : metrics.control
        implicitHeight: metrics.control
        display: showsLabel ? AbstractButton.TextBesideIcon : AbstractButton.IconOnly
        icon.source: "icons/" + iconName + ".svg"
        icon.color: primary ? palette.highlight : palette.buttonText
        icon.width: metrics.icon
        icon.height: metrics.icon
        Accessible.name: text
        ToolTip.visible: hovered
        ToolTip.text: text
    }
    RowLayout {
        anchors.fill: parent
        spacing: 0
        PrimaryNavigation {
            objectName: "primary-navigation"
            bridge: workbench
            route: root.home ? "home" : root.settings ? (root.systemRoute || "settings") : root.workspace.feature
            expanded: !root.compact && !root.navigationCollapsed
            Layout.preferredWidth: expanded ? metrics.sidebar : metrics.rail
            Layout.minimumWidth: Layout.preferredWidth
            Layout.maximumWidth: Layout.preferredWidth
            Layout.fillHeight: true
            onSelected: route => root.selectRoute(route)
            onCommands: opener => root.execute("commands", opener)
            onToggleRequested: opener => root.execute("navigation", opener)
        }
        ColumnLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 0
            ToolBar {
                id: shellHeader
                Layout.fillWidth: true
                implicitHeight: metrics.navControl + metrics.small
                background: Rectangle { color: root.palette.base }
                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: metrics.gutter
                    anchors.rightMargin: metrics.inset
                    // Rail widths: the toggle leads the header; expanded, it sits in the sidebar.
                    ShellButton { id: navigationTrigger; visible: root.compact || root.navigationCollapsed; objectName: "navigation-toggle"; iconName: "expand"; text: t("expandNavigation"); onClicked: execute("navigation", this) }
                    ShellButton { visible: library; iconName: "back"; text: t("back"); onClicked: library = false }
                    // Workspace pages read "Workspace / Page"; feature pages read "Feature / Session".
                    RowLayout {
                        visible: root.workspacePage
                        spacing: metrics.small
                        Layout.fillWidth: true
                        Accessible.role: Accessible.Heading
                        Accessible.name: t("workspace") + " / " + t(root.home ? "home" : root.systemRoute)
                        Label { text: t("workspace"); color: root.palette.placeholderText; Accessible.ignored: true }
                        Label { text: "/"; color: root.palette.placeholderText; Accessible.ignored: true }
                        Label { text: t(root.home ? "home" : root.systemRoute); font.bold: true; elide: Text.ElideRight; Layout.fillWidth: true; Accessible.ignored: true }
                    }
                    Label { visible: !root.workspacePage; text: settings ? t(root.systemRoute || "settings") : library ? t("history") : t(root.workspace.feature) + " / " + titleFor(session); elide: Text.ElideRight; Layout.fillWidth: true; font.bold: true; Accessible.role: Accessible.Heading }
                    ShellButton { visible: root.workspacePage && workbench.moduleEnabled("utilities"); showsLabel: !root.compact; iconName: "utilities"; text: t("launcher"); enabled: !workbench.loadBlocked; onClicked: workbench.desktopIntegration.trigger("launcher") }
                    TextField {
                        visible: root.systemRoute === "" && settings
                        objectName: "settings-header-search"
                        Layout.preferredWidth: metrics.sidebar
                        implicitHeight: metrics.compactControl
                        text: root.settingsQuery
                        placeholderText: t("settingsSearch")
                        Accessible.name: placeholderText
                        selectByMouse: true
                        // Text entry: neutral border and caret, no accent ring.
                        background: Rectangle { color: root.palette.base; radius: metrics.compactControl / 2; border.width: metrics.hairline; border.color: parent.activeFocus ? root.palette.mid : root.palette.midlight }
                        onTextChanged: root.settingsQuery = text
                        Keys.onEscapePressed: event => { if (!inputMethodComposing) { root.settingsQuery = ""; event.accepted = true } else event.accepted = false }
                    }
                    ShellButton { visible: root.systemRoute === "interpret"; showsLabel: !root.compact; iconName: "new"; text: t("summarize"); enabled: !workbench.interpretation.busy && !!workbench.interpretation.current.segments?.length; onClicked: workbench.interpretation.summarize("summary") }
                    ShellButton { visible: root.systemRoute === "interpret"; showsLabel: !root.compact; iconName: "history"; text: t("history"); enabled: !workbench.interpretation.busy; onClicked: contentLoader.item?.openHistory?.() }
                    ShellButton { visible: root.systemRoute === "interpret"; showsLabel: !root.compact; primary: true; iconName: "new"; text: t("newInterpretation"); enabled: !workbench.interpretation.busy; onClicked: workbench.interpretation.clearSelection() }
                    Rectangle { visible: root.systemRoute === "interpret"; color: root.palette.midlight; implicitWidth: metrics.hairline; implicitHeight: metrics.compactControl }
                    ShellButton { visible: !home && !settings && !library && root.workspace.feature === "translate"; showsLabel: !root.compact; iconName: "new"; text: t("addImage"); enabled: !workbench.loadBlocked && !(root.session.images || []).length; onClicked: { imagePicker.ocr = false; imagePicker.ownerID = root.session.id; imagePicker.open() } }
                    ShellButton { visible: !home && !settings && !library && root.workspace.feature === "dictionary"; showsLabel: !root.compact; iconName: "dictionary"; text: t("savedWords"); enabled: !workbench.loadBlocked; onClicked: { root.favoritesOnly = true; root.library = true } }
                    ShellButton { id: historyTrigger; showsLabel: !root.compact; visible: !home && !settings && !library; iconName: "history"; text: t("history"); enabled: !workbench.loadBlocked; onClicked: execute("history", this) }
                    ShellButton { showsLabel: !root.compact; primary: true; visible: !home && !settings && !library; iconName: "new"; text: t(root.workspace.feature === "chat" ? "newChat" : root.workspace.feature === "dictionary" ? "newLookup" : "newTranslation"); enabled: !workbench.loadBlocked; onClicked: execute("new", this) }
                    Rectangle { visible: !home && !settings && !library; color: root.palette.midlight; implicitWidth: metrics.hairline; implicitHeight: metrics.compactControl }
                    ShellButton { id: activityTrigger; showsLabel: !root.compact; iconName: "activity"; text: t("activity") + (root.runningCount ? " · " + root.runningCount : ""); onClicked: execute("activity", this) }
                }
            }
            Rectangle { color: root.palette.midlight; implicitHeight: metrics.hairline; Layout.fillWidth: true }
        ColumnLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.margins: metrics.gutter
            spacing: metrics.gap
            RowLayout {
                visible: workbench.storageError.length > 0
                Label { text: t(workbench.storageError); wrapMode: Text.Wrap; Layout.fillWidth: true }
                Button { text: t(workbench.loadBlocked ? "retryLoad" : "retrySave"); onClicked: workbench.loadBlocked ? workbench.reload() : workbench.save() }
            }

            RowLayout {
                visible: workbench.audio.recording || workbench.audio.busy
                Label { text: t(workbench.audio.recording ? "record" : "running"); Layout.fillWidth: true }
                Button { text: t("stop"); onClicked: workbench.audio.cancel() }
            }
            RowLayout {
                visible: workbench.ocrBusy
                Label { text: t("extractImageText"); Layout.fillWidth: true }
                Button { text: t("stop"); onClicked: workbench.cancelOCR() }
            }
            RowLayout {
                visible: workbench.interpretation.busy && root.systemRoute !== "interpret"
                Label { text: t("interpret") + " · " + t(workbench.interpretation.listening ? "record" : "running"); Layout.fillWidth: true; wrapMode: Text.Wrap }
                Button { text: t("open"); onClicked: root.selectRoute("interpret") }
                Button { text: t("stop"); onClicked: workbench.interpretation.listening ? workbench.interpretation.stop() : workbench.interpretation.cancel() }
            }
            Loader {
                id: contentLoader
                Layout.fillWidth: true
                Layout.fillHeight: true
                enabled: settings || !workbench.loadBlocked
                sourceComponent: home ? homeView : settings ? (systemRoute === "apps" ? applicationsView : systemRoute === "interpret" ? interpretationView : systemRoute === "thermal" ? thermalView : systemRoute === "utilities" || systemRoute === "everywhere" ? desktopView : settingsView) : library ? libraryView : root.workspace.feature === "chat" ? chatView : translateView
            }
        }
        }
    }
    component ModelPicker: ColumnLayout {
        // Compact: borderless model menu; refresh/configure stay reachable as icons.
        property bool compact: false
        spacing: metrics.small
        RowLayout {
            spacing: metrics.small
            Kit.StatusDot { visible: root.modelUnavailable(session.model); tone: "failed"; failedColor: root.colors.danger }
            ComboBox {
                id: modelCombo
                flat: parent.parent.compact
                implicitHeight: metrics.control
                implicitContentWidthPolicy: ComboBox.WidestText
                Layout.maximumWidth: metrics.sidebar
                background: Rectangle { visible: !modelCombo.flat || modelCombo.hovered; color: modelCombo.flat ? root.colors["surface-hover"] : root.colors.surface; radius: metrics.controlRadius; border.width: modelCombo.flat ? 0 : metrics.hairline; border.color: root.colors.border }
                model: root.models.map(id => root.modelLabel(id))
                ToolTip.visible: hovered; ToolTip.text: session.model
                currentIndex: root.models.indexOf(session.model)
                Accessible.name: t("model") + (root.modelUnavailable(session.model) ? ", " + t("unavailable") : "")
                onActivated: command("model", {value: root.models[currentIndex]})
            }
            // Compact: one options control holds refresh and configuration.
            Kit.IconButton {
                visible: parent.parent.compact
                iconName: "refresh"; text: t("configureModel")
                onClicked: modelOptions.open()
                Menu {
                    id: modelOptions
                    Repeater {
                        model: ["ollama", "lmstudio", "llamacpp", "openai", "claude", "gemini"]
                        delegate: MenuItem { required property string modelData; text: t("refreshModels") + " · " + modelData; enabled: !workbench.loadingModels; onTriggered: workbench.refreshModels(modelData) }
                    }
                    MenuSeparator {}
                    MenuItem { text: t("configureModel"); onTriggered: { modelDialog.ownerID = session.id; modelID.text = session.model; instructions.text = session.systemPrompt || ""; modelDialog.open() } }
                }
            }
            Button {
                visible: !parent.parent.compact
                icon.source: "icons/refresh.svg"
                text: t("refreshModels")
                display: AbstractButton.IconOnly
                implicitHeight: metrics.control
                implicitWidth: metrics.control
                Accessible.name: text
                ToolTip.visible: hovered
                ToolTip.text: text
                enabled: !workbench.loadingModels
                onClicked: modelRefreshMenu.open()
                Menu {
                    id: modelRefreshMenu
                    Repeater {
                        model: ["ollama", "lmstudio", "llamacpp", "openai", "claude", "gemini"]
                        delegate: MenuItem { required property string modelData; text: modelData; onTriggered: workbench.refreshModels(modelData) }
                    }
                }
            }
            Button { visible: !parent.parent.compact; text: t("configureModel"); icon.source: "icons/settings.svg"; display: AbstractButton.IconOnly; Accessible.name: text; ToolTip.visible: hovered; ToolTip.text: text; implicitHeight: metrics.control; implicitWidth: metrics.control; onClicked: { modelDialog.ownerID = session.id; modelID.text = session.model; instructions.text = session.systemPrompt || ""; modelDialog.open() } }
            BusyIndicator { running: workbench.loadingModels; visible: running; implicitWidth: metrics.control; implicitHeight: metrics.control }
        }

        Dialog {
            id: modelDialog
            property string ownerID: ""
            title: t("configureModel")
            modal: true
            standardButtons: Dialog.Ok | Dialog.Cancel
            onAccepted: { root.command("model", {sessionID: ownerID, value: modelID.text.trim()}); root.command("systemPrompt", {sessionID: ownerID, value: instructions.text}) }
            ColumnLayout {
                TextField { id: modelID; placeholderText: t("modelID"); Accessible.name: placeholderText; Layout.fillWidth: true }
                Label { text: t("modelIDHint"); wrapMode: Text.Wrap; Layout.maximumWidth: metrics.sidebar + metrics.editor }
                ComboBox { id: savedPrompt; model: root.workspace.prompts || []; textRole: "name"; Accessible.name: t("promptLibrary"); Layout.fillWidth: true; onActivated: { instructions.text = model[currentIndex].text; promptName.text = model[currentIndex].name } }
                TextField { id: promptName; placeholderText: t("promptName"); Accessible.name: placeholderText; Layout.fillWidth: true }
                RowLayout {
                    Button { text: t("savePrompt"); enabled: !!promptName.text.trim(); onClicked: root.command("savePrompt", {name: promptName.text, text: instructions.text}) }
                    Button { text: t("deletePrompt"); enabled: savedPrompt.currentIndex >= 0; onClicked: { deleteSavedPrompt.promptID = savedPrompt.model[savedPrompt.currentIndex].id; deleteSavedPrompt.open() } }
                }
                TextArea { id: instructions; placeholderText: t("systemPrompt"); Accessible.name: placeholderText; wrapMode: TextEdit.Wrap; Layout.fillWidth: true }
            }
        }
        Label { text: workbench.modelError ? t(workbench.modelError) : ""; visible: !!workbench.modelError; wrapMode: Text.Wrap; Layout.maximumWidth: metrics.sidebar }
    }
    Dialog {
        id: deleteSavedPrompt
        property string promptID: ""
        title: t("deletePrompt"); modal: true; standardButtons: Dialog.Yes | Dialog.Cancel
        onAccepted: root.command("deletePrompt", {id: promptID})
    }
    Dialog {
        id: renameDialog
        property string ownerID
        title: t("rename"); modal: true; anchors.centerIn: parent
        standardButtons: Dialog.Save | Dialog.Cancel
        TextField { id: renameInput; maximumLength: 256; Accessible.name: t("sessionTitle") }
        onAccepted: command("rename", {sessionID: ownerID, value: renameInput.text})
    }
    FileDialog {
        id: sessionExport
        property string ownerID
        fileMode: FileDialog.SaveFile
        defaultSuffix: "json"
        nameFilters: ["JSON (*.json)"]
        onAccepted: workbench.exportSession(selectedFile, ownerID)
    }
    FileDialog {
        id: imagePicker
        property string ownerID
        property bool ocr: false
        nameFilters: ["Images (*.png *.jpg *.jpeg *.gif *.webp)"]
        onAccepted: { if (ocr) workbench.extractImageText(selectedFile, ownerID); else workbench.attachImage(selectedFile, ownerID) }
    }
    component ImageControls: ColumnLayout {
        // Compact: icon menu inside a composer row; attachments render as chips.
        property bool compact: false
        Button {
            text: t("attachImage"); icon.source: "icons/new.svg"
            display: parent.compact ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon
            flat: parent.compact
            implicitWidth: parent.compact ? metrics.control : implicitContentWidth + leftPadding + rightPadding
            Accessible.name: text; ToolTip.visible: hovered; ToolTip.text: text
            implicitHeight: metrics.control
            onClicked: attachmentMenu.open()
            Menu {
                id: attachmentMenu
                MenuItem { text: t("attachImage"); enabled: ["chat", "translate"].includes(root.session.feature) && (root.session.images || []).length < (root.session.feature === "translate" ? 1 : 4); onTriggered: { imagePicker.ocr = false; imagePicker.ownerID = root.session.id; imagePicker.open() } }
                MenuItem { text: t("captureImage"); enabled: ["chat", "translate"].includes(root.session.feature) && (root.session.images || []).length < (root.session.feature === "translate" ? 1 : 4); onTriggered: workbench.captureImage(root.session.id) }
                MenuSeparator {}
                MenuItem { text: t("extractImageText"); enabled: !workbench.ocrBusy; onTriggered: { imagePicker.ocr = true; imagePicker.ownerID = root.session.id; imagePicker.open() } }
                MenuItem { text: t("stop"); visible: workbench.ocrBusy; height: visible ? implicitHeight : 0; onTriggered: workbench.cancelOCR() }
                // Chat modes ride in the "+" menu (Review 18 shows one attach control).
                MenuSeparator { visible: root.session.feature === "chat"; height: visible ? implicitHeight : 0 }
                Repeater {
                    model: root.session.feature === "chat" ? ["text", "web", "research", "image"] : []
                    delegate: MenuItem { required property string modelData; text: t("chatMode_" + modelData); checkable: true; checked: (root.session.chatMode || "text") === modelData; onTriggered: command("chatMode", {value: modelData}) }
                }
                MenuItem { visible: root.session.feature === "chat"; height: visible ? implicitHeight : 0; text: t("carefulReasoning"); checkable: true; checked: root.session.carefulReasoning || false; onTriggered: command("carefulReasoning", {value: checked}) }
                MenuItem { visible: root.session.feature === "chat"; height: visible ? implicitHeight : 0; text: t(workbench.audio.speaking ? "stopSpeaking" : "listen"); enabled: workbench.audio.speaking || !!root.speechText().trim(); onTriggered: workbench.audio.speaking ? workbench.audio.silence() : workbench.audio.speak(root.speechText(), session.target) }
            }
        }
        Label { text: t(workbench.ocrError); visible: !!workbench.ocrError && !parent.compact; wrapMode: Text.Wrap; Layout.maximumWidth: metrics.sidebar }
        Repeater {
            model: parent.compact ? [] : root.session.images || []
            delegate: RowLayout {
                required property var modelData
                Label { textFormat: Text.PlainText; text: modelData.name; elide: Text.ElideMiddle; Layout.maximumWidth: metrics.sidebar; ToolTip.visible: attachmentHover.hovered; ToolTip.text: text; HoverHandler { id: attachmentHover } }
                Button { text: t("removeAttachment"); icon.source: "icons/close.svg"; display: AbstractButton.IconOnly; Accessible.name: text; ToolTip.visible: hovered; ToolTip.text: text; implicitWidth: metrics.compactControl; implicitHeight: metrics.compactControl; onClicked: workbench.command("removeImage", {sessionID: root.session.id, imageID: modelData.id}) }
            }
        }
    }
    component AudioControls: ColumnLayout {
        // Compact: record icon only; speech output moves to the options menu.
        property bool compact: false
        RowLayout {
            spacing: metrics.small
            Kit.IconButton { visible: parent.parent.compact; iconName: "interpret"; text: t(workbench.audio.recording ? "stopRecording" : "record"); checked: workbench.audio.recording; enabled: !workbench.audio.busy; onClicked: workbench.audio.recording ? workbench.audio.stop(workspace.speechProvider || "openai") : workbench.startRecording() }
            Button { visible: !parent.parent.compact; text: t(workbench.audio.recording ? "stopRecording" : "record"); implicitHeight: metrics.control; enabled: !workbench.audio.busy; onClicked: workbench.audio.recording ? workbench.audio.stop(workspace.speechProvider || "openai") : workbench.startRecording() }
            Button {
                visible: !parent.parent.compact
                text: t(workbench.audio.speaking ? "stopSpeaking" : "listen"); implicitHeight: metrics.control
                enabled: workbench.audio.speaking || !!root.speechText().trim()
                onClicked: workbench.audio.speaking ? workbench.audio.silence() : workbench.audio.speak(root.speechText(), session.target)
            }
            Button {
                visible: !parent.parent.compact
                text: t("speechProvider"); icon.source: "icons/settings.svg"; display: AbstractButton.IconOnly
                implicitWidth: metrics.control; implicitHeight: metrics.control; Accessible.name: text; ToolTip.visible: hovered; ToolTip.text: text
                onClicked: speechMenu.open()
                Menu {
                    id: speechMenu
                    Repeater {
                        model: ["auto", "openai", "gemini", "groq"]
                        delegate: MenuItem { required property string modelData; text: modelData === "auto" ? t("reasoning_auto") : modelData; checkable: true; checked: (workspace.speechProvider || "openai") === modelData; onTriggered: root.command("speechProvider", {value: modelData}) }
                    }
                    MenuSeparator {}
                    MenuItem { text: t("speechAutoHint"); enabled: false; implicitWidth: metrics.sidebar; contentItem: Label { text: t("speechAutoHint"); wrapMode: Text.Wrap; color: palette.text } }
                }
            }
            BusyIndicator { visible: running; running: workbench.audio.busy; implicitWidth: metrics.control; implicitHeight: metrics.control }
            Button { text: t("stop"); visible: workbench.audio.busy; onClicked: workbench.audio.cancel() }
        }
        Label { text: workbench.audio.error ? t(workbench.audio.error) : ""; visible: !!text; wrapMode: Text.Wrap; Layout.maximumWidth: metrics.sidebar }
        Button { text: t("insertTranscript"); visible: !!workbench.pendingTranscript; onClicked: workbench.insertTranscript() }
    }
    component LanguagePicker: ComboBox {
        implicitContentWidthPolicy: ComboBox.WidestText
        property bool source: true
        readonly property var choices: (source ? ["auto"] : []).concat(root.languages)
        model: choices.map(code => lang(code))
        currentIndex: choices.indexOf(source ? session.source : session.target)
        Accessible.name: t(source ? "inputLanguage" : "outputLanguage")
        onActivated: command("pair", {source: source ? choices[currentIndex] : session.source, target: source ? session.target : choices[currentIndex]})
    }
    component AttachmentChips: Flow {
        visible: (root.session.images || []).length > 0
        spacing: metrics.small
        Repeater {
            model: root.session.images || []
            delegate: Kit.StatusBadge {
                required property var modelData
                text: modelData.name
                Kit.IconButton { iconName: "close"; text: t("removeAttachment") + " " + modelData.name; implicitWidth: metrics.compactControl; implicitHeight: metrics.compactControl; onClicked: workbench.command("removeImage", {sessionID: root.session.id, imageID: modelData.id}) }
            }
        }
    }
    component RetryNotice: RowLayout {
        readonly property var lastTask: root.workspace.tasks.find(task => task.request.sessionID === session.id)
        visible: !!lastTask && ["failed", "interrupted", "cancelled"].includes(lastTask.status)
        Label { text: lastTask ? t(lastTask.status === "failed" ? (lastTask.errorCode || "providerError") : lastTask.status) : ""; Layout.fillWidth: true; wrapMode: Text.Wrap }
        Button { text: t("retry"); enabled: !activeTask && !!lastTask && (session.feature === "chat" || lastTask.request.revision === session.revision); onClicked: command("retry", {taskID: lastTask.id}) }
    }
    Component {
        id: chatView
        ColumnLayout {
            spacing: metrics.gap
            ChatTranscript {
                bridge: workbench
                session: root.session
                readingPointSize: root.readingPointSize
                Layout.fillWidth: true
                Layout.fillHeight: true
            }
            RetryNotice { Layout.fillWidth: true }
            // Same column as the composer it warns about; never a frame around it.
            Kit.ProviderNotice { model: session.model; dangerColor: root.colors.danger; Layout.fillWidth: true; Layout.maximumWidth: metrics.reading; Layout.alignment: Qt.AlignHCenter; onOpenRequested: section => root.openSettingsSection(section); onUseRequested: model => command("model", {value: model}) }
            Frame {
                padding: metrics.inset
                background: Rectangle { color: root.palette.base; radius: metrics.surfaceRadius; border.width: metrics.hairline; border.color: chatDraft.activeFocus ? root.palette.mid : root.palette.midlight }
                Layout.fillWidth: true
                Layout.maximumWidth: metrics.reading
                Layout.alignment: Qt.AlignHCenter
                ColumnLayout {
                    anchors.fill: parent
                    AttachmentChips { Layout.fillWidth: true }
                    ScrollView {
                        contentWidth: availableWidth
                        Layout.fillWidth: true
                        Layout.preferredHeight: Math.min(metrics.editor, Math.max(metrics.composerMinimum - metrics.control - metrics.inset, chatDraft.contentHeight + metrics.small))
                        TextArea {
                            id: chatDraft
                            objectName: "chat-draft"
                            Connections { target: root; function onComposerFocusEpochChanged() { chatDraft.forceActiveFocus() } }
                            Component.onCompleted: if (root.composerFocusEpoch > 0) forceActiveFocus()
                            text: session.draft
                            font.pointSize: root.readingPointSize
                            placeholderText: t("prompt")
                            wrapMode: TextEdit.Wrap
                            selectByMouse: true
                            background: null
                            Accessible.name: t("draft")
                            onTextChanged: if (text !== session.draft) command("draft", {value: text})
                            Keys.onReturnPressed: event => root.submitKey(event, inputMethodComposing)
                            Keys.onEnterPressed: event => root.submitKey(event, inputMethodComposing)
                        }
                    }
                    // Review 18: one control row under the editor.
                    RowLayout {
                        spacing: metrics.small
                        ImageControls { compact: true }
                        ModelPicker { compact: true }
                        AudioControls { compact: true }
                        Label { visible: (session.chatMode || "text") !== "text"; text: t("chatMode_" + (session.chatMode || "text")); color: root.palette.link }
                        Item { Layout.fillWidth: true }
                        Button {
                            id: sendButton
                            implicitHeight: metrics.control
                            leftPadding: metrics.inset
                            rightPadding: metrics.inset
                            text: t(activeTask ? "stop" : "send")
                            enabled: !!activeTask || !!session.draft.trim() || (["chat", "translate"].includes(session.feature) && (session.images || []).length > 0)
                            contentItem: Label { text: sendButton.text; Accessible.ignored: true; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter; color: !sendButton.enabled ? root.colors["text-disabled"] : activeTask ? root.colors.danger : root.colors["action-fg"] }
                            background: Rectangle { radius: metrics.controlRadius; color: !sendButton.enabled ? root.colors["surface-subtle"] : activeTask ? root.colors.surface : root.colors.action; border.width: sendButton.visualFocus ? metrics.hairline : 0; border.color: root.colors["border-strong"] }
                            onClicked: root.submit()
                        }
                    }
                }
            }
        }
    }
    Component {
        id: translateView
        ColumnLayout {
            spacing: metrics.gap
            // Review 18 language row: input ⇄ output, session model at the trailing edge.
            // Below the reading width the model takes its own line: RowLayout keeps
            // non-filling controls at their preferred width, so one row would overflow.
            GridLayout {
                Layout.fillWidth: true
                columns: width >= metrics.reading ? 2 : 1
                columnSpacing: metrics.small
                rowSpacing: metrics.tight
                RowLayout {
                    spacing: metrics.small
                    Layout.fillWidth: true
                    Label { text: t("inputLanguage"); color: root.palette.placeholderText }
                    LanguagePicker { source: true; flat: true }
                    ToolButton { text: "⇄"; Accessible.name: t("swap"); ToolTip.visible: hovered; ToolTip.text: t("swap"); onClicked: command("pair", {source: session.target, target: session.source === "auto" ? "en" : session.source}) }
                    Label { text: t("outputLanguage"); color: root.palette.placeholderText }
                    LanguagePicker { source: false; flat: true }
                    Item { Layout.fillWidth: true }
                }
                ModelPicker { compact: true }
            }
            Rectangle { color: root.palette.midlight; implicitHeight: metrics.hairline; Layout.fillWidth: true }
            Kit.ProviderNotice { model: session.model; dangerColor: root.colors.danger; Layout.fillWidth: true; onOpenRequested: section => root.openSettingsSection(section); onUseRequested: model => command("model", {value: model}) }
            Dialog {
                id: translationOptionsDialog
                property string ownerID: ""
                onOpened: ownerID = root.session.id
                Connections { target: root; function onSessionChanged() { if (translationOptionsDialog.visible && root.session.id !== translationOptionsDialog.ownerID) translationOptionsDialog.close() } }
                parent: Overlay.overlay
                title: t("translationOptions")
                modal: false
                standardButtons: Dialog.Close
                width: Math.min(root.width - metrics.inset * 2, metrics.reading)
                height: Math.min(root.height - metrics.inset * 2, metrics.editor * 3)
                x: (root.width - width) / 2; y: (root.height - height) / 2
                closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
                contentItem: ScrollView {
                    id: translationOptionsScroll
                    contentWidth: availableWidth
                    TranslationOptions {
                        width: translationOptionsScroll.availableWidth
                        bridge: workbench
                        session: root.session
                    }
                }
            }
            // Review 18 dictionary: one search field with its lookup action, then the entry.
            Frame {
                visible: session.feature === "dictionary"
                Layout.fillWidth: true
                padding: metrics.small
                leftPadding: metrics.gap
                rightPadding: metrics.small
                background: Rectangle { radius: metrics.largeRadius; color: "transparent"; border.width: metrics.hairline; border.color: termDraft.activeFocus ? root.palette.mid : root.palette.midlight }
                RowLayout {
                    anchors.fill: parent
                    spacing: metrics.small
                    Image { source: "icons/search.svg"; sourceSize.width: metrics.icon; sourceSize.height: metrics.icon; Accessible.ignored: true }
                    TextField {
                        id: termDraft
                        objectName: session.feature === "dictionary" ? "source-draft" : "dictionary-term"
                        Layout.fillWidth: true
                        text: session.draft
                        font.pointSize: Qt.application.font.pointSize * metrics.sectionScale
                        placeholderText: t("dictionaryPlaceholder")
                        Accessible.name: t("source")
                        background: null
                        selectByMouse: true
                        onTextEdited: if (text !== session.draft) command("draft", {value: text})
                        Keys.onReturnPressed: event => { event.accepted = !inputMethodComposing; if (event.accepted && !!text.trim() && Array.from(text).length <= 120) root.submit() }
                        Keys.onEnterPressed: event => { event.accepted = !inputMethodComposing; if (event.accepted && !!text.trim() && Array.from(text).length <= 120) root.submit() }
                        Connections { target: root; function onComposerFocusEpochChanged() { if (root.session.feature === "dictionary") termDraft.forceActiveFocus() } }
                    }
                    Button { visible: !!activeTask; text: t("stop"); onClicked: root.submit() }
                    Kit.PrimaryButton { visible: !activeTask; text: t("lookup"); enabled: !!session.draft.trim() && Array.from(session.draft).length <= 120; onClicked: root.submit() }
                }
            }
            TextField {
                visible: session.feature === "dictionary"
                Layout.fillWidth: true
                background: null
                placeholderText: t("dictionaryContext")
                Accessible.name: placeholderText
                maximumLength: 500
                text: session.dictionaryContext || ""
                onTextEdited: command("dictionaryContext", {value: text})
            }
            Label { visible: session.feature === "dictionary" && Array.from(session.draft).length > 120; text: t("dictionaryTermLimit"); wrapMode: Text.Wrap; Layout.fillWidth: true }
            ScrollView {
                visible: session.feature === "dictionary"
                Layout.fillWidth: true
                Layout.fillHeight: true
                contentWidth: availableWidth
                ColumnLayout {
                    width: Math.min(parent.width, metrics.reading)
                    x: (parent.width - width) / 2
                    spacing: metrics.inset
                    // Centered like the other empty states (matches macOS).
                    Label { visible: !session.output; text: t(activeTask ? "running" : "dictionaryEmpty"); color: root.palette.placeholderText; wrapMode: Text.Wrap; horizontalAlignment: Text.AlignHCenter; Layout.fillWidth: true; Layout.topMargin: metrics.large }
                    RowLayout {
                        visible: !!session.output
                        Layout.fillWidth: true
                        Item { Layout.fillWidth: true }
                        Button { flat: true; text: t(session.favorite ? "savedWord" : "saveWord"); checkable: true; checked: !!session.favorite; onClicked: command("favorite") }
                    }
                    DictionaryResult { visible: !!session.output; Layout.fillWidth: true; output: session.output; bridge: workbench }
                }
            }
            Kit.Card {
                visible: session.feature !== "dictionary"
                padding: 0
                clip: true
                Layout.fillWidth: true
                Layout.fillHeight: true
            GridLayout {
                id: panes
                anchors.fill: parent
                // Review 18 stacks the editors below the reading width (its 820 px preview).
                columns: session.feature === "dictionary" ? 1 : width >= metrics.reading ? 2 : 1
                columnSpacing: 0
                rowSpacing: 0
                Frame {
                    padding: metrics.inset
                    background: Item { Rectangle { visible: panes.columns > 1; anchors.right: parent.right; width: metrics.hairline; height: parent.height; color: root.colors.border } }
                    Layout.fillWidth: true
                    Layout.fillHeight: session.feature !== "dictionary"
                    Layout.preferredWidth: metrics.sidebar
                    ColumnLayout {
                        anchors.fill: parent
                        RowLayout {
                            Layout.minimumHeight: metrics.control
                            Label { text: t(session.feature === "dictionary" ? "lookup" : "source"); font.bold: true; Layout.fillWidth: true }
                            Label { text: lang(session.source); color: root.palette.placeholderText }
                        }
                        Rectangle { Layout.fillWidth: true; implicitHeight: metrics.hairline; color: root.colors.border }
                        ScrollView {
                            contentWidth: availableWidth
                            Layout.fillWidth: true; Layout.fillHeight: session.feature !== "dictionary"
                            Layout.preferredHeight: session.feature === "dictionary" ? metrics.control * 2 : metrics.editor
                            TextArea {
                                id: sourceDraft
                                objectName: session.feature === "dictionary" ? "panel-source-draft" : "source-draft"
                                Connections { target: root; function onComposerFocusEpochChanged() { sourceDraft.forceActiveFocus() } }
                                Component.onCompleted: if (root.composerFocusEpoch > 0) forceActiveFocus()
                                text: session.draft; font.pointSize: root.readingPointSize; placeholderText: t("sourcePlaceholder"); wrapMode: TextEdit.Wrap; selectByMouse: true; background: null; Accessible.name: t("source")
                                onTextChanged: if (text !== session.draft) command("draft", {value: text})
                                Keys.onReturnPressed: event => root.submitKey(event, inputMethodComposing)
                                Keys.onEnterPressed: event => root.submitKey(event, inputMethodComposing)
                            }
                        }
                        Rectangle { Layout.fillWidth: true; implicitHeight: metrics.hairline; color: root.colors.border }
                        AttachmentChips { Layout.fillWidth: true }
                        RowLayout {
                            Layout.minimumHeight: metrics.control
                            spacing: metrics.small
                            ImageControls { compact: true; visible: session.feature === "translate" }
                            AudioControls { compact: true }
                            Label { text: t("draft"); color: root.palette.placeholderText; elide: Text.ElideRight; Layout.fillWidth: true }
                            Button { visible: !!activeTask; text: t("stop"); onClicked: root.submit() }
                            Kit.PrimaryButton { visible: !activeTask; text: t(session.feature === "dictionary" ? "lookup" : "translateText"); icon.source: "icons/" + (session.feature === "dictionary" ? "search" : "translate") + ".svg"; enabled: !!session.draft.trim() || (session.feature === "translate" && (session.images || []).length > 0); onClicked: root.submit() }
                        }
                    }
                }
                Frame {
                    padding: metrics.inset
                    // Rounded only on the corners it shares with the card outline.
                    background: Rectangle {
                        readonly property real r: metrics.radius
                        color: root.colors["surface-subtle"]
                        topRightRadius: panes.columns > 1 ? r : 0; bottomRightRadius: r; bottomLeftRadius: panes.columns > 1 ? 0 : r
                        Rectangle { visible: panes.columns === 1; width: parent.width; height: metrics.hairline; color: root.colors.border }
                    }
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.preferredWidth: metrics.sidebar
                    ColumnLayout {
                        anchors.fill: parent
                        RowLayout {
                            Layout.minimumHeight: metrics.control
                            Label { text: t("result"); font.bold: true; Layout.fillWidth: true }
                            Button { visible: session.feature === "translate"; flat: true; text: t("style_" + (session.translationStyle || "general")) + " ▾"; Accessible.name: t("translationOptions"); ToolTip.visible: hovered; ToolTip.text: t("translationOptions"); onClicked: translationOptionsDialog.open() }
                        }
                        Rectangle { Layout.fillWidth: true; implicitHeight: metrics.hairline; color: root.colors.border }
                        ScrollView {
                            visible: session.feature !== "dictionary" && !(session.images || []).length
                            contentWidth: availableWidth
                            Layout.fillWidth: true; Layout.fillHeight: true
                            TextArea { visible: session.feature !== "dictionary"; text: session.output; font.pointSize: root.readingPointSize; placeholderText: t("emptyResult"); readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; Accessible.name: t("result") }
                        }
                        ImageTranslationView {
                            visible: session.feature === "translate" && (session.images || []).length > 0
                            Layout.fillWidth: true; Layout.fillHeight: true
                            bridge: workbench; session: root.session
                        }
                        DictionaryResult {
                            visible: session.feature === "dictionary"
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            output: session.output
                            bridge: workbench
                        }
                        Rectangle { Layout.fillWidth: true; implicitHeight: metrics.hairline; color: root.colors.border }
                        RowLayout {
                            Layout.minimumHeight: metrics.control
                            Label { text: lang(session.target); color: root.palette.placeholderText; Layout.fillWidth: true }
                            Button { visible: session.feature === "dictionary"; text: t(session.favorite ? "savedWord" : "saveWord"); checkable: true; checked: !!session.favorite; onClicked: command("favorite") }
                            Button { visible: session.feature === "translate" && !(session.images || []).length; text: t("compare"); onClicked: translationOptionsDialog.open() }
                            Kit.IconButton { iconName: "interpret"; text: t(workbench.audio.speaking ? "stopSpeaking" : "listen"); enabled: workbench.audio.speaking || !!root.speechText().trim(); onClicked: workbench.audio.speaking ? workbench.audio.silence() : workbench.audio.speak(root.speechText(), session.target) }
                            Button { text: t("copy"); enabled: !!session.output; onClicked: workbench.copy((session.images || []).length ? workbench.imageTranslationText(session.output) : session.output) }
                        }
                    }
                }
            }
                // Outline drawn above both panes so their fills never hide it.
                Rectangle { anchors.fill: parent; color: "transparent"; radius: metrics.radius; border.width: metrics.hairline; border.color: root.colors.border }
            }
            RetryNotice { Layout.fillWidth: true }
        }
    }
    Component {
        id: homeView
        HomeWorkspace {
            bridge: workbench
            dangerColor: root.colors.danger
            onStart: feature => { root.selectRoute(feature); if (feature !== "interpret") { root.command("new"); root.composerFocusEpoch++ } }
            onResume: sessionID => root.choose(sessionID)
            onSettings: root.selectRoute("settings")
        }
    }
    Component {
        id: applicationsView
        ApplicationsWorkspace { bridge: workbench }
    }
    Component {
        id: interpretationView
        InterpretationWorkspace { bridge: workbench; dangerColor: root.colors.danger; onOpenSettings: section => root.openSettingsSection(section) }
    }
    Component {
        id: thermalView
        ThermalWorkspace { bridge: workbench }
    }
    Component {
        id: desktopView
        DesktopWorkspace { bridge: workbench; route: root.systemRoute; onRouteRequested: value => root.selectRoute(value); onNewTranslation: { root.selectRoute("translate"); root.command("new"); root.composerFocusEpoch++ } }
    }

    Component {
        id: settingsView
        SettingsWorkspace { bridge: workbench; dangerColor: root.colors.danger; query: root.settingsQuery; requestedSection: root.settingsSection; onQueryEdited: value => root.settingsQuery = value; onSectionOpened: root.settingsSection = "" }
    }
    component HistoryList: ListView {
        id: historyList
        property bool preview: false
        clip: true
        model: root.historyRecords
        currentIndex: root.historyRecords.findIndex(item => item.id === (preview ? previewID : quickID))
        spacing: metrics.small
        delegate: ItemDelegate {
            id: historyRow
            required property var modelData
            width: historyList.width
            text: titleFor(modelData)
            // Only a cut-off title needs a tooltip; a fresh panel under the pointer must not cover search.
            ToolTip.visible: hovered && rowTitle.truncated
            ToolTip.text: titleFor(modelData)
            highlighted: modelData.id === (historyList.preview ? previewID : quickID)
            padding: metrics.gap
            background: Rectangle { radius: metrics.controlRadius; color: historyRow.highlighted ? Qt.tint(root.colors.surface, Qt.alpha(root.colors.action, metrics.selectionOpacity)) : historyRow.hovered ? root.colors["surface-hover"] : "transparent"; border.width: historyRow.visualFocus ? metrics.hairline : 0; border.color: root.colors.action }
            Accessible.name: titleFor(modelData) + (modelData.id === session.id ? ", " + t("currentSession") : "")
            Accessible.role: historyList.preview ? Accessible.ListItem : Accessible.Button
            Accessible.selected: highlighted
            contentItem: ColumnLayout {
                spacing: metrics.small
                Label { id: rowTitle; text: titleFor(modelData); color: root.colors.text; font.bold: true; elide: Text.ElideRight; Layout.fillWidth: true }
                Label { objectName: "history-snippet"; text: (modelData.draft || modelData.messages[modelData.messages.length - 1]?.text || modelData.output || "").replace(/\s+/g, " "); maximumLineCount: 1; wrapMode: Text.NoWrap; color: root.colors.text; elide: Text.ElideRight; Layout.fillWidth: true; visible: text.length > 0 }
                RowLayout {
                    Label { text: root.modelLabel(modelData.model); color: root.colors["text-muted"]; elide: Text.ElideRight; Layout.fillWidth: true }
                    Label { text: t("currentSession"); color: root.colors.text; visible: modelData.id === session.id }
                }
            }
            onClicked: historyList.preview ? previewID = modelData.id : choose(modelData.id)
        }
        Label { anchors.centerIn: parent; visible: historyList.count === 0; text: t("noHistory") }
        ScrollBar.vertical: ScrollBar {}
    }
    component SearchHistory: TextField {
        objectName: "history-search"
        property var targetList: null
        text: historyQuery
        placeholderText: t("historySearch")
        Accessible.name: t("historySearch")
        selectByMouse: true
        onTextChanged: historyQuery = text
        Keys.onDownPressed: function(event) { if (!inputMethodComposing && targetList) { root.moveHistory(targetList, 1); event.accepted = true } else event.accepted = false }
        Keys.onUpPressed: function(event) { if (!inputMethodComposing && targetList) { root.moveHistory(targetList, -1); event.accepted = true } else event.accepted = false }
        function acceptResult(event) {
            if (inputMethodComposing || !targetList) { event.accepted = false; return }
            if (!targetList.preview && root.historyRecords.some(item => item.id === quickID)) root.choose(quickID)
            event.accepted = true
        }
        Keys.onReturnPressed: event => acceptResult(event)
        Keys.onEnterPressed: event => acceptResult(event)
    }
    Component {
        id: libraryView
        GridLayout {
            id: libraryLayout
            objectName: "history-library"
            readonly property bool wide: width >= metrics.reading
            columns: wide ? 2 : 1
            columnSpacing: metrics.gutter
            rowSpacing: metrics.inset
            Frame {
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.maximumWidth: libraryLayout.wide ? metrics.sidebar + metrics.gutter : Infinity
                Layout.preferredWidth: libraryLayout.wide ? metrics.sidebar + metrics.gutter : -1
                Layout.minimumWidth: libraryLayout.wide ? metrics.sidebar + metrics.gutter : 0
                Layout.maximumHeight: libraryLayout.wide ? Infinity : libraryLayout.height / 2
                ColumnLayout {
                    anchors.fill: parent
                    CheckBox { visible: root.workspace.feature === "dictionary"; text: t("favorite"); checked: root.favoritesOnly; onToggled: root.favoritesOnly = checked }
                    CheckBox { text: t("archivedSessions"); checked: root.archivedHistory; onToggled: root.archivedHistory = checked }
                    SearchHistory { id: librarySearch; targetList: libraryHistory; Layout.fillWidth: true; Component.onCompleted: forceActiveFocus() }
                    HistoryList { id: libraryHistory; preview: true; Layout.fillWidth: true; Layout.fillHeight: true }
                }
            }
            Frame {
                id: previewCard
                objectName: "history-preview"
                readonly property var selected: root.historyRecords.find(item => item.id === previewID)
                Layout.fillWidth: true
                Layout.fillHeight: true
                ColumnLayout {
                    anchors.fill: parent
                    spacing: metrics.inset
                    Label { text: t("historyPreview"); Layout.fillWidth: true }
                    Label { text: previewCard.selected ? titleFor(previewCard.selected) : t(root.historyRecords.length ? "chooseHistory" : "noHistory"); font.bold: true; maximumLineCount: 2; elide: Text.ElideRight; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Label { text: previewCard.selected?.model || ""; visible: !!previewCard.selected; Layout.fillWidth: true }
                    ScrollView {
                        id: previewScroll
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        contentWidth: availableWidth
                        ColumnLayout {
                            width: previewScroll.availableWidth
                            spacing: metrics.gutter
                            Repeater {
                                model: root.historySections(previewCard.selected)
                                delegate: ColumnLayout {
                                    required property var modelData
                                    Layout.fillWidth: true
                                    Label { text: modelData.label; font.bold: true; Layout.fillWidth: true }
                                    TextArea { text: modelData.text; font.pointSize: root.readingPointSize; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; Layout.fillWidth: true; Accessible.name: modelData.label }
                                }
                            }
                        }
                    }
                    RowLayout {
                        Button { text: t("exportSession"); enabled: !!previewCard.selected; onClicked: { sessionExport.ownerID = previewID; sessionExport.open() } }
                        Button { text: t("rename"); enabled: !!previewCard.selected; onClicked: { renameDialog.ownerID = previewID; renameInput.text = previewCard.selected.title; renameDialog.open() } }
                        Button { text: t(root.archivedHistory ? "restoreSession" : "archiveSession"); enabled: !!previewCard.selected; onClicked: command("archive", {sessionID: previewID, value: !root.archivedHistory}) }
                        Button { text: t("deletePermanently"); visible: root.archivedHistory; enabled: !!previewCard.selected; onClicked: { deleteHistory.ownerID = previewID; deleteHistory.open() } }
                        Label { text: t("currentSession"); visible: previewCard.selected?.id === session.id }
                        Item { Layout.fillWidth: true }
                        Button { objectName: "history-open"; text: t("open"); highlighted: true; enabled: !!previewCard.selected && !root.archivedHistory; onClicked: choose(previewID) }
                    }
                }
            }
        }
    }
    Dialog {
        id: deleteHistory
        property string ownerID: ""
        title: root.t("deletePermanentlyConfirm")
        modal: true
        standardButtons: Dialog.Ok | Dialog.Cancel
        onAccepted: root.command("deleteArchived", {sessionID: ownerID})
    }
    Popup {
        id: history
        padding: metrics.inset
        background: Rectangle { color: root.palette.base; radius: metrics.surfaceRadius; border.width: metrics.hairline; border.color: root.palette.midlight }
        objectName: "quick-history"
        parent: Overlay.overlay
        width: Math.min(metrics.sidebar + metrics.editor, root.width - metrics.inset * 2)
        height: Math.min(metrics.editor * 3, root.height - shellHeader.height - metrics.inset, metrics.control * (Math.min(Math.max(quickHistory.count, 1), 4) * 3 + 3) + metrics.inset * 3)
        modal: false
        focus: true
        closePolicy: Popup.CloseOnPressOutside | (root.composing() ? 0 : Popup.CloseOnEscape)
        onAboutToShow: { historyQuery = ""; quickID = session.id; root.placeHistory() }
        onOpened: historySearch.forceActiveFocus()
        onClosed: root.restoreOverlayFocus()
        ColumnLayout {
            anchors.fill: parent
            RowLayout {
                Layout.fillWidth: true
                Label { text: t("history"); font.bold: true; Layout.fillWidth: true }
                ShellButton { objectName: "history-close"; iconName: "close"; text: t("close"); onClicked: history.close() }
            }
            SearchHistory { id: historySearch; targetList: quickHistory; Layout.fillWidth: true }
            HistoryList { id: quickHistory; Layout.fillWidth: true; Layout.fillHeight: true }
            Rectangle { Layout.fillWidth: true; implicitHeight: metrics.hairline; color: root.colors.border }
            // Review 18: a quiet link row, not a second bordered button.
            Button {
                id: allHistory
                text: t("allHistory")
                flat: true
                Layout.fillWidth: true
                contentItem: RowLayout {
                    Label { text: allHistory.text; color: root.palette.link; elide: Text.ElideRight; Layout.fillWidth: true; Accessible.ignored: true }
                    IconImage { source: "icons/back.svg"; rotation: 180; color: root.palette.link; sourceSize.width: metrics.icon; sourceSize.height: metrics.icon; Accessible.ignored: true }
                }
                Accessible.name: text
                onClicked: { root.closeOverlays(false); historyQuery = ""; previewID = session.id; library = true }
            }
        }
    }
    Popup {
        id: activity
        padding: metrics.inset
        background: Rectangle { color: root.palette.base; radius: metrics.surfaceRadius; border.width: metrics.hairline; border.color: root.palette.midlight }
        objectName: "activity-panel"
        onOpened: activityClose.forceActiveFocus()
        parent: Overlay.overlay
        x: Math.max(metrics.inset, root.width - width - metrics.inset)
        y: shellHeader.height
        width: Math.min(metrics.sidebar + metrics.editor, root.width - metrics.inset * 2)
        height: Math.min(metrics.editor * 3, root.height - y - metrics.inset)
        modal: false
        focus: true
        closePolicy: Popup.CloseOnPressOutside | (root.composing() ? 0 : Popup.CloseOnEscape)
        onClosed: root.restoreOverlayFocus()
        ColumnLayout {
            anchors.fill: parent
            RowLayout {
                Layout.fillWidth: true
                Label { text: t("activity"); font.bold: true; Layout.fillWidth: true }
                ShellButton { id: activityClose; objectName: "activity-close"; iconName: "close"; text: t("close"); onClicked: activity.close() }
            }
            ScrollView {
                id: activityScroll
                objectName: "activity-scroll"
                Layout.fillWidth: true
                Layout.fillHeight: true
                contentWidth: availableWidth
                ColumnLayout {
                    width: activityScroll.availableWidth
                    Label { visible: root.workspace.tasks.length === 0; text: t("noTasks") }
                    Repeater {
                        model: root.workspace.tasks
                        delegate: Frame {
                            required property var modelData
                            readonly property var target: root.workspace.sessions.find(item => item.id === modelData.request.sessionID)
                            Layout.fillWidth: true
                            ColumnLayout {
                                anchors.fill: parent
                                Label { text: titleFor(target); elide: Text.ElideRight; Layout.fillWidth: true }
                                Label { text: t(modelData.status) + " · " + root.modelLabel(modelData.request.model); wrapMode: Text.Wrap; Layout.fillWidth: true }
                                RowLayout {
                                    Button { text: t("open"); onClicked: choose(target.id) }
                                    Button {
                                        visible: modelData.status !== "succeeded"
                                        text: t(modelData.status === "running" ? "stop" : "retry")
                                        enabled: modelData.status === "running" || (!root.workspace.tasks.some(task => task.request.sessionID === target.id && task.status === "running") && (target.feature === "chat" || target.revision === modelData.request.revision))
                                        onClicked: command(modelData.status === "running" ? "cancel" : "retry", {taskID: modelData.id})
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    Popup {
        id: navigationOverlay
        objectName: "navigation-overlay"
        parent: Overlay.overlay
        y: shellHeader.height
        width: metrics.sidebar
        height: root.height - y
        padding: 0
        modal: false
        focus: true
        closePolicy: Popup.CloseOnPressOutside | (root.composing() ? 0 : Popup.CloseOnEscape)
        onClosed: root.restoreOverlayFocus()
        onOpened: contentItem.focusInitial()
        contentItem: PrimaryNavigation {
            bridge: workbench
            route: root.home ? "home" : root.settings ? (root.systemRoute || "settings") : root.workspace.feature
            expanded: true
            dismissible: true
            onSelected: route => root.selectRoute(route)
            onCommands: opener => root.execute("commands", opener)
            onDismissed: navigationOverlay.close()
        }
    }
    Popup {
        id: commands
        padding: metrics.inset
        background: Rectangle { color: root.palette.base; radius: metrics.surfaceRadius; border.width: metrics.hairline; border.color: root.palette.midlight }
        objectName: "command-palette"
        parent: Overlay.overlay
        width: Math.min(metrics.sidebar + metrics.editor, root.width - metrics.inset * 2)
        height: Math.min(metrics.editor * 3, root.height - shellHeader.height - metrics.inset * 2)
        x: (root.width - width) / 2
        y: shellHeader.height + metrics.inset
        modal: false
        focus: true
        closePolicy: Popup.CloseOnPressOutside | (root.composing() ? 0 : Popup.CloseOnEscape)
        onAboutToShow: { root.commandQuery = ""; root.commandIndex = 0 }
        onOpened: commandSearch.forceActiveFocus()
        onClosed: root.restoreOverlayFocus()
        function move(offset) { root.commandIndex = Math.max(0, Math.min(root.commandIndex + offset, root.commandEntries.length - 1)); commandList.positionViewAtIndex(root.commandIndex, ListView.Contain) }
        function run(id) { root.execute(id) }
        ColumnLayout {
            anchors.fill: parent
            RowLayout {
                Label { text: t("commands"); font.bold: true; Layout.fillWidth: true }
                ShellButton { iconName: "close"; text: t("close"); onClicked: commands.close() }
            }
            TextField {
                id: commandSearch
                objectName: "command-search"
                Layout.fillWidth: true
                placeholderText: t("commandSearch")
                Accessible.name: placeholderText
                text: root.commandQuery
                onTextChanged: root.commandQuery = text
                Keys.onDownPressed: event => { event.accepted = !inputMethodComposing; if (event.accepted) commands.move(1) }
                Keys.onUpPressed: event => { event.accepted = !inputMethodComposing; if (event.accepted) commands.move(-1) }
                function acceptCommand(event) {
                    event.accepted = !inputMethodComposing
                    if (event.accepted && root.commandEntries[root.commandIndex]) commands.run(root.commandEntries[root.commandIndex].id)
                }
                Keys.onReturnPressed: event => acceptCommand(event)
                Keys.onEnterPressed: event => acceptCommand(event)
            }
            ListView {
                id: commandList
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                model: root.commandEntries
                delegate: ItemDelegate {
                    id: commandItem
                    required property var modelData
                    required property int index
                    width: commandList.width
                    text: t(modelData.title)
                    Accessible.role: Accessible.Button
                    Accessible.name: text
                    highlighted: index === root.commandIndex
                    Accessible.selected: highlighted
                    // Label, not the default content item: titles such as "Nhiệt độ & quạt"
                    // must not turn "&" into a mnemonic. Selection matches settings navigation.
                    contentItem: RowLayout {
                        spacing: metrics.small
                        IconImage { source: "icons/" + commandItem.modelData.icon + ".svg"; color: commandItem.highlighted ? palette.link : palette.text; sourceSize.width: metrics.icon; sourceSize.height: metrics.icon; Layout.preferredWidth: metrics.icon; Layout.preferredHeight: metrics.icon; Accessible.ignored: true }
                        Label { text: commandItem.text; color: commandItem.highlighted ? palette.link : palette.text; font.bold: commandItem.highlighted; elide: Text.ElideRight; Layout.fillWidth: true; Accessible.ignored: true }
                    }
                    background: Rectangle { radius: metrics.radius; color: commandItem.highlighted ? Qt.tint(palette.base, Qt.alpha(palette.highlight, metrics.selectionOpacity)) : commandItem.hovered ? palette.alternateBase : "transparent" }
                    onClicked: commands.run(modelData.id)
                }
                Label { anchors.centerIn: parent; visible: !commandList.count; text: t("noCommands") }
                ScrollBar.vertical: ScrollBar {}
            }
        }
    }

}

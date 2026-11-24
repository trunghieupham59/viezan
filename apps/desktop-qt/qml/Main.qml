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
    DesktopPanels { id: panels; bridge: workbench; onOpenMainRequested: sessionID => { root.choose(sessionID); root.show(); root.raise(); root.requestActivate() }; onLauncherRequested: launcher.toggle() }
    Launcher { id: launcher; bridge: workbench; onAskRequested: text => panels.ask(text); onOpenMainRequested: sessionID => { root.choose(sessionID); root.show(); root.raise(); root.requestActivate() } }
    visible: true
    readonly property var workspace: workbench.state
    readonly property var metrics: workbench.metrics
    readonly property bool darkMode: workbench.appearance?.mode === "dark" || (workbench.appearance?.mode !== "light" && workbench.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
    readonly property var colors: workbench.palettes[darkMode ? "dark" : "light"]
    SurfaceAppearance { id: surfaceAppearance }
    readonly property bool solidChrome: surfaceAppearance.solid
    readonly property bool lightGlass: !darkMode
    readonly property bool nativeWindowHeader: Qt.platform.os !== "osx"
    readonly property real workspaceGutter: compact ? metrics.gap : metrics.inset
    palette.window: colors["sidebar-bg"]
    // Keep light Glass reading, composer and popup surfaces opaque.
    palette.base: solidChrome ? surfaceAppearance.reading : lightGlass ? Qt.tint(colors["sidebar-bg"], colors.surface) : colors.surface
    palette.alternateBase: solidChrome ? surfaceAppearance.control : lightGlass ? Qt.tint(colors["sidebar-bg"], colors.canvas) : colors.canvas
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
    // `resources` never changes: convert it once instead of on every binding update.
    readonly property var nativeResources: workbench.resources
    readonly property var textScales: nativeResources.textScales
    readonly property real readingPointSize: Qt.application.font.pointSize * metrics.labelScale * textScales[workbench.appearance?.textSize || "medium"]
    readonly property bool compact: width < metrics.compact
    readonly property bool navigationCollapsed: !!workspace.shell?.navigationCollapsed
    property var overlayOpener: null
    property bool replacingOverlay: false
    property var composerPopup: null
    property int composerFocusEpoch: 0
    property string commandQuery: ""
    property int commandIndex: 0
    readonly property var paletteResult: workbench.desktopIntegration.paletteQuery(commandQuery)
    readonly property var commandEntries: {
        const special = paletteResult.kind
        const entries = nativeResources.commands.filter(item =>
        (!workbench.loadBlocked || ["settings", "activity"].includes(item.id)) &&
        (item.id !== "history" || (!home && !settings && !library)) &&
        (["new", "history", "activity", "navigation", "settings"].includes(item.id) || workbench.moduleEnabled(item.id)) && (special || normalize(t(item.title)).includes(normalize(commandQuery.trim()))))
        .map(item => Object.assign({}, item, {group: ["new", "history", "activity", "navigation"].includes(item.id) ? "paletteGroupActions" : "paletteGroupPages"}))
        // QV4 sort is not stable for equal group keys. Preserve catalog order
        // within each group, including the ten real page commands.
        const ordered = entries.filter(item => item.group === "paletteGroupPages").concat(entries.filter(item => item.group === "paletteGroupActions"))
        const feature = ({ask:"chat", translate:"translate", lookup:"dictionary"})[special]
        if (!special || workbench.loadBlocked || (feature && !workbench.moduleEnabled(feature))) return ordered
        return [{id:"query-result", kind:special, value:paletteResult.value, group:"", icon:({calculation:"copy", ask:"reasoning", translate:"translate", lookup:"dictionary"})[special], label:tpl(({calculation:"paletteCalc", ask:"paletteAsk", translate:"paletteTranslate", lookup:"paletteLookup"})[special], {result:paletteResult.value, query:paletteResult.value, text:paletteResult.value})}].concat(ordered)
    }
    function runPaletteEntry(id) {
        if (id !== "query-result") { execute(id); return }
        const result = paletteResult
        if (!result.kind || workbench.loadBlocked) return
        if (result.kind === "calculation") { workbench.copy(result.value); closeOverlays(true); notify(t("copied")); return }
        const feature = ({ask:"chat", translate:"translate", lookup:"dictionary"})[result.kind]
        if (!feature || !workbench.moduleEnabled(feature)) return
        selectRoute(feature); command("new")
        const owner = root.session.id
        command("draft", {sessionID:owner, value:result.value})
        command("submit", {sessionID:owner}); composerFocusEpoch++
    }
    function normalize(value) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d") }
    function composing() { return !!root.activeFocusItem?.inputMethodComposing }
    function closeOverlays(restore) {
        replacingOverlay = !restore
        history.close(); activity.close(); navigationOverlay.close(); commands.close(); if (composerPopup) composerPopup.close()
        replacingOverlay = false
    }
    function showComposerPanel(panel, opener) {
        const closing = panel.visible
        closeOverlays(false)
        overlayOpener = opener
        composerPopup = panel
        if (closing) restoreOverlayFocus(); else panel.open()
    }
    function restoreOverlayFocus() {
        if (!replacingOverlay && overlayOpener) overlayOpener.forceActiveFocus()
    }
    function toggleOverlay(popup, opener) {
        if (popup.visible) { popup.close(); return }
        let returnTo = opener || root.activeFocusItem
        // An opener inside the outgoing popup disappears with it.
        for (let item = returnTo; item; item = item.parent) {
            if (item === root.Overlay.overlay) { returnTo = overlayOpener; break }
        }
        closeOverlays(false)
        overlayOpener = returnTo
        popup.open()
    }
    // One-shot section request for Settings (consumed when the workspace opens it).
    property string settingsSection: ""
    function openSettingsSection(section) { settingsQuery = ""; settingsSection = section; selectRoute("settings") }
    function selectRoute(route) {
        if (!workbench.moduleEnabled(route)) return
        if (workbench.loadBlocked && route !== "settings") return
        closeOverlays(true); library = false; systemRoute = ["utilities", "everywhere", "thermal", "interpret", "apps"].includes(route) ? route : ""; settings = route === "settings" || !!systemRoute; home = route === "home"; command("route", {value: route})
        if (!settings && !home) command("navigate", {feature: route})
    }
    function activateHabit(action) {
        if (workbench.loadBlocked || !workbench.moduleEnabled(action.feature)) return
        const fromHome = home
        selectRoute(action.feature)
        // Preserve the previous translation and any active chat when starting from Home.
        if ((action.feature === "translate" || (action.feature === "chat" && fromHome))
            && (session.draft || session.output || session.messages.length || session.images?.length)) command("new")
        if (action.feature === "chat") command("chatMode", {sessionID: session.id, value: action.mode})
        if (action.feature === "translate") command("pair", {sessionID: session.id, source: action.source, target: action.target})
        composerFocusEpoch++
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
    readonly property int runningCount: activityRows.filter(row => row.tasks.some(task => task.status === "running")).length + (workbench.interpretation.busy ? 1 : 0)
    readonly property bool workspacePage: home || ["everywhere", "apps", "thermal", "utilities"].includes(systemRoute)
    property bool favoritesOnly: false
    property bool archivedHistory: false
    property string historyQuery: ""
    property string previewID: ""
    property string quickID: ""
    property string historyFeature: workspace.feature
    onLibraryChanged: if (library) historyFeature = workspace.feature
    // Glass keeps history in a popup and the library: skip the search while neither is open.
    readonly property bool historyShown: library || history.visible
    readonly property var historyRecords: !historyShown ? [] : (workspace, workbench.history(historyQuery, library && archivedHistory, library ? (historyFeature ? [historyFeature] : []) : [workspace.feature]))
            .filter(item => !library || !favoritesOnly || item.feature !== "dictionary" || !!item.favorite)
            .map(item => Object.assign({}, item, {bucket: historyBucket(library && archivedHistory ? (item.archivedAt || item.updated) : item.updated)}))
    readonly property var recentSessions: !(session.messages || []).length && !activeTask ? (workspace, workbench.history("", false, [])).filter(item => item.id !== session.id).slice(0, 3) : []
    readonly property var activityRows: {
        let result = [], groups = {}
        const sessionByID = {}
        for (const item of workspace.sessions) sessionByID[item.id] = item
        for (const task of workspace.tasks) {
            const target = sessionByID[task.request.sessionID]
            if (!target) continue
            if (target.comparisonParent) {
                if (!groups[target.comparisonParent]) {
                    const row = {id: target.comparisonParent, comparison: true, tasks: []}
                    groups[target.comparisonParent] = row; result.push(row)
                }
                groups[target.comparisonParent].tasks.push(task)
            } else result.push({id: target.id, comparison: false, tasks: [task]})
        }
        return result
    }
    function historyBucket(seconds) {
        if (!seconds) return "older"
        const date = new Date(seconds * 1000), today = new Date(), yesterday = new Date()
        yesterday.setDate(today.getDate() - 1)
        if (date.toDateString() === today.toDateString()) return "today"
        if (date.toDateString() === yesterday.toDateString()) return "yesterday"
        const week = new Date(); week.setDate(today.getDate() - 7)
        return date > week ? "week" : "older"
    }
    function tpl(key, values) { let text = t(key); for (const name in values) text = text.split("{" + name + "}").join(values[name]); return text }
    function relativeTime(seconds) {
        if (!seconds) return ""
        const minutes = Math.max(0, Math.floor((Date.now() / 1000 - seconds) / 60))
        if (!minutes) return t("historyJustNow")
        if (minutes < 60) return tpl("historyMinutesAgo", {n: minutes})
        if (minutes < 1440) return tpl("historyHoursAgo", {n: Math.floor(minutes / 60)})
        if (minutes < 10080) return tpl("historyDaysAgo", {n: Math.floor(minutes / 1440)})
        return new Date(seconds * 1000).toLocaleDateString(Qt.locale(workspace.locale), Locale.ShortFormat)
    }
    function historySnippet(item) {
        if (workspace.tasks.some(task => task.request.sessionID === item.id && task.status === "running")) return t("running")
        if (library && archivedHistory) return tpl("archivedAgo", {time: relativeTime(item.archivedAt || item.updated)})
        if (item.feature === "chat") return item.messages.slice(-1)[0]?.text || item.draft || workbench.shortModelName(item.model)
        let output = item.output
        if (item.feature === "dictionary" && output) { try { output = JSON.parse(output).meaning || JSON.parse(output).headword } catch (_) {} }
        return output || lang(item.source) + " → " + lang(item.target)
    }
    property bool exportingFile: false
    property bool exportFailed: false
    Connections {
        target: workbench
        function onActionFailed(code) {
            if (root.exportingFile && code === "exportError") root.exportFailed = true
            else root.notify(root.t(code), null, true, "danger", "action-" + code)
        }
    }
    function announceExport(url, operation) {
        exportingFile = true; exportFailed = false
        try { operation() } finally { exportingFile = false }
        notify(exportFailed ? t("exportError") : tpl("fileSaved", {name: decodeURIComponent(url.toString().split("/").pop())}), null, exportFailed)
    }
    function exportHistory(url, id) {
        if (!workspace.sessions.some(item => item.id === id)) return
        announceExport(url, function() { workbench.exportSession(url, id) })
    }
    property var toasts: []
    property int toastSequence: 0
    function notify(text, undo, error, level, key) {
        const id = ++toastSequence
        key = key ?? id
        if (!["info", "success", "warning", "danger"].includes(level))
            level = error ? "danger" : "success"
        const remaining = toasts.filter(item => item.key !== key)
        if (remaining.length === 3) {
            const oldestTimed = remaining.findIndex(item => item.level !== "danger")
            remaining.splice(Math.max(0, oldestTimed), 1)
        }
        toasts = remaining.concat([{id, key, text, undo: undo || null, level, error: level === "danger"}])
    }
    function dismissToast(id) { toasts = toasts.filter(item => item.id !== id) }
    function useResultAsSource() {
        const previous = {sessionID: session.id, source: session.source, target: session.target, draft: session.draft}
        let nextTarget = previous.source
        if (nextTarget === "auto") {
            nextTarget = workspace.locale !== previous.target ? workspace.locale
                : nativeResources.nativeLanguages.find(code => code !== previous.target) ?? workspace.locale
        }
        command("pair", {sessionID: previous.sessionID, source: previous.target, target: nextTarget, draft: session.output})
        notify(t("usedAsSource"), () => command("pair", previous), false, "success", "use-as-source-" + previous.sessionID)
    }
    function removeHistory(id) {
        const record = workspace.sessions.find(item => item.id === id)
        if (!record) return
        if (record.archived) { deleteHistory.ownerID = id; deleteHistory.open(); return }
        const removed = workbench.removeSession(id)
        if (removed.session) notify(t("sessionDeleted"), function() { workbench.restoreSession(removed.session, removed.index); if (workspace.sessions.some(item => item.id === id) && !workbench.storageError) notify(t("sessionRestored")) })
    }
    function archiveHistory(id, archived) {
        command("archive", {sessionID: id, value: archived})
        if (workspace.sessions.some(item => item.id === id && !!item.archived === archived) && !workbench.storageError)
            notify(t(archived ? "sessionArchived" : "sessionRestored"), function() { archiveHistory(id, !archived) })
    }

    onHistoryRecordsChanged: {
        if (!historyShown) return
        if (!historyRecords.some(item => item.id === quickID)) quickID = historyRecords[0]?.id || ""
        if (!historyRecords.some(item => item.id === previewID)) previewID = historyRecords[0]?.id || ""
    }
    width: metrics.sidebar + metrics.reading + metrics.gutter * 2
    height: metrics.reading
    minimumWidth: metrics.minWindowWidth
    minimumHeight: metrics.minWindowHeight
    // System pages (Interpretation, Apps, Thermal…) share the settings shell but keep their own name.
    title: (Qt.platform.os === "osx" ? "Viezan Native — " : "") + t(home ? "home" : settings ? (systemRoute || "settings") : root.workspace.feature)
    color: colors["app-bg"]
    // Liquid Glass 2.0: the lit scene behind every layer, light and dark.
    background: Kit.AppBackdrop { }
    readonly property var localeStrings: workbench.strings
    function t(key) { return localeStrings[key] || key }
    function command(name, payload) { workbench.command(name, payload || {}) }
    function titleFor(item) { return item.title || t(item.feature === "chat" ? "newChat" : item.feature === "dictionary" ? "newLookup" : "newTranslation") }
    function lang(code) { return t("lang_" + code) }
    // Delegates to Kit.ModelLabel so every view formats model IDs the same way.
    function modelLabel(id) { return workbench.shortModelName(id) }
    function speechText() {
        if (session.feature === "chat") return session.messages.filter(message => message.role === "assistant").slice(-1)[0]?.text || ""
        if (session.feature === "dictionary") { try { const entry = JSON.parse(session.output); return entry.headword + ". " + entry.meaning } catch (_) { return "" } }
        return (session.images || []).length ? workbench.imageTranslationText(session.output) : session.output
    }
    function choose(id) { if (workspace.sessions.find(item => item.id === id)?.archived) return; closeOverlays(true); command("select", {sessionID: id}); settings = false; home = false; library = false; command("route", {value: workspace.feature}) }
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
    // macOS keeps the system menu. Other platforms register window shortcuts
    // independently of the hidden menu, with the same action enabled rules.
    component ShellAction: Action {
        id: shellAction
        property var keySequence
        shortcut: Qt.platform.os === "osx" ? keySequence : ""
        property Shortcut windowShortcut: Shortcut {
            sequence: Qt.platform.os === "osx" ? "" : shellAction.keySequence
            context: Qt.WindowShortcut
            enabled: Qt.platform.os !== "osx" && shellAction.enabled
            onActivated: shellAction.trigger()
        }
    }
    ShellAction { id: commandsAction; keySequence: "Ctrl+K"; text: t("commands"); onTriggered: root.execute("commands", root.activeFocusItem) }
    ShellAction { id: navigationAction; keySequence: "Ctrl+\\"; text: t("toggleNavigation"); onTriggered: root.execute("navigation", root.activeFocusItem) }
    ShellAction { id: homeAction; keySequence: "Ctrl+0"; text: t("home"); enabled: !workbench.loadBlocked; onTriggered: root.execute("home") }
    ShellAction { id: chatAction; keySequence: "Ctrl+1"; text: t("chat"); enabled: !workbench.loadBlocked; onTriggered: root.execute("chat") }
    ShellAction { id: translateAction; keySequence: "Ctrl+2"; text: t("translate"); enabled: !workbench.loadBlocked; onTriggered: root.execute("translate") }
    ShellAction { id: dictionaryAction; keySequence: "Ctrl+3"; text: t("dictionary"); enabled: !workbench.loadBlocked; onTriggered: root.execute("dictionary") }
    ShellAction { id: settingsAction; keySequence: StandardKey.Preferences; text: t("settings"); onTriggered: root.execute("settings") }
    ShellAction { id: newAction; keySequence: StandardKey.New; text: t("newWork"); enabled: !workbench.loadBlocked; onTriggered: root.execute("new") }
    ShellAction { id: historyAction; keySequence: "Ctrl+Shift+H"; text: t("history"); enabled: !root.settings && !root.library && !workbench.loadBlocked; onTriggered: root.execute("history", root.activeFocusItem) }
    ShellAction { id: activityAction; keySequence: "Ctrl+Shift+A"; text: t("activity"); onTriggered: root.execute("activity", root.activeFocusItem) }
    // A focused popup can consume the window's shortcut context. Route the
    // remaining key event through the same menu action and enabled state.
    function panelKey(event) {
        if (event.modifiers !== (Qt.ControlModifier | Qt.ShiftModifier)) return
        const action = event.key === Qt.Key_M ? modelAction : event.key === Qt.Key_T ? toolsAction : null
        if (action && action.enabled) { event.accepted = true; action.trigger() }
    }
    Connections {
        target: root.composerPopup?.visible && root.activeFocusItem ? root.activeFocusItem.Keys : null
        function onPressed(event) { root.panelKey(event) }
    }
    readonly property Item modelControl: contentLoader.item?.modelControl ?? null
    readonly property Item toolsControl: contentLoader.item?.toolsControl ?? null
    ShellAction { id: modelAction; keySequence: "Ctrl+Shift+M"; text: t("model"); enabled: !!root.modelControl?.visible && root.modelControl.enabled && !root.composing(); onTriggered: root.modelControl.clicked() }
    ShellAction { id: toolsAction; keySequence: "Ctrl+Shift+T"; text: t("attachImage"); enabled: !!root.toolsControl?.visible && root.toolsControl.enabled && !root.composing(); onTriggered: { root.toolsControl.forceActiveFocus(Qt.ShortcutFocusReason); root.toolsControl.clicked() } }
    menuBar: MenuBar {
        objectName: "shell-menu-bar"
        visible: Qt.platform.os === "osx"
        height: visible ? implicitHeight : 0
        Menu {
            title: t("commands")
            MenuItem { action: commandsAction }
            MenuItem { action: navigationAction }
            MenuSeparator {}
            MenuItem { action: homeAction }
            MenuItem { action: chatAction }
            MenuItem { action: translateAction }
            MenuItem { action: dictionaryAction }
            MenuItem { action: settingsAction }
            MenuSeparator {}
            MenuItem { action: newAction }
            MenuItem { action: historyAction }
            MenuItem { action: activityAction }
            MenuItem { action: modelAction }
            MenuItem { action: toolsAction }
        }
    }

    component ShellButton: Kit.GlassToolButton {
        id: shellButton
        property string iconName
        property bool showsLabel: false
        property bool primary: false
        readonly property color materialBase: root.colors[root.lightGlass ? "titlebar-bg" : "sidebar-bg"]
        palette.buttonText: !enabled ? root.colors["text-disabled"] : primary ? root.colors["action-text"] : root.colors.text
        leftPadding: showsLabel ? metrics.gap : 0
        rightPadding: leftPadding
        // The style's vertical padding leaves the 32 pt pill less than its 20 pt icon.
        topPadding: 0
        bottomPadding: 0
        // `.btn.glass` pill 32; "new" (`.tint`) keeps clear glass and reads accent text.
        font.weight: primary ? Font.DemiBold : Font.Medium
        background: Rectangle {
            radius: height / 2
            color: shellButton.enabled ? "transparent" : root.colors["surface-subtle"]
            Kit.ControlGlassSurface {
                anchors.fill: parent
                visible: shellButton.enabled
                radius: parent.radius
                pressed: shellButton.down
                hovered: shellButton.hovered
                inactive: !shellButton.enabled
            }
            Rectangle {
                anchors.fill: parent
                radius: parent.radius
                color: "transparent"
                visible: shellButton.visualFocus
                border.width: metrics.focusRingWidth
                border.color: shellButton.palette.highlight
            }
            border.width: !shellButton.enabled ? metrics.hairline : 0
            border.color: shellButton.visualFocus ? shellButton.palette.highlight : root.colors.border
        }
        implicitWidth: showsLabel ? implicitContentWidth + leftPadding + rightPadding : metrics.compactControl
        implicitHeight: metrics.compactControl
        display: showsLabel ? AbstractButton.TextBesideIcon : AbstractButton.IconOnly
        icon.source: "icons/" + iconName + ".svg"
        icon.color: !enabled ? root.colors["text-disabled"] : primary ? palette.highlight : palette.buttonText
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
            id: primaryNavigation
            headerToggle: !root.nativeWindowHeader
            objectName: "primary-navigation"
            bridge: workbench
            route: root.home ? "home" : root.settings ? (root.systemRoute || "settings") : root.workspace.feature
            opacity: navigationOverlay.visible ? 0 : 1
            enabled: !navigationOverlay.visible
            expanded: !root.compact && !root.navigationCollapsed
            // Glass reserves the `small` window margin to the left of the pane.
            Layout.preferredWidth: (expanded ? metrics.sidebar : metrics.rail) + metrics.small
            Layout.minimumWidth: Layout.preferredWidth
            Layout.maximumWidth: Layout.preferredWidth
            Layout.fillHeight: true
            onSelected: route => root.selectRoute(route)
            commandsOpen: commands.visible
            onCommands: opener => root.execute("commands", opener)
            onToggleRequested: opener => root.execute("navigation", opener)
        }
        ColumnLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 0
            ToolBar {
                id: shellHeader
                objectName: "shell-header"
                // With an OS title bar, Glass owns one full-width header row.
                Layout.leftMargin: root.nativeWindowHeader ? -primaryNavigation.width : 0
                Layout.fillWidth: true
                implicitHeight: metrics.navControl + metrics.small
                Binding { target: shellHeader; property: "leftPadding"; value: 0; when: root.nativeWindowHeader; restoreMode: Binding.RestoreBindingOrValue }
                Binding { target: shellHeader; property: "rightPadding"; value: 0; when: root.nativeWindowHeader; restoreMode: Binding.RestoreBindingOrValue }
                background: Item {
                    Kit.ChromeSurface {
                        objectName: "header-glass-surface"
                        visible: false
                        anchors.fill: parent
                        anchors.leftMargin: metrics.small
                        anchors.rightMargin: metrics.small
                        anchors.topMargin: metrics.tight
                        anchors.bottomMargin: metrics.tight
                        radius: height / 2
                        fillColor: Qt.tint(root.colors["sidebar-bg"], root.colors["titlebar-material"])
                        edgeColor: root.colors["material-border"]
                        edgeHighlight: root.colors["material-highlight"]
                    }
                }
                RowLayout {
                    id: headerRow
                    anchors.fill: parent
                    // Glass: the breadcrumb sits at the reading pane's edge + inset.
                    anchors.leftMargin: root.nativeWindowHeader ? metrics.inset : metrics.gap + metrics.inset
                    anchors.rightMargin: metrics.gap
                    Binding { target: headerRow; property: "spacing"; value: metrics.gap; when: root.nativeWindowHeader; restoreMode: Binding.RestoreBindingOrValue }
                    // macOS retains the sidebar toggle; the OS-frame header starts at inset.
                    ShellButton { id: navigationTrigger; visible: root.nativeWindowHeader || root.compact || root.navigationCollapsed; objectName: "navigation-toggle"; iconName: primaryNavigation.expanded ? "collapse" : "expand"; text: t(primaryNavigation.expanded ? "collapseNavigation" : "expandNavigation"); popupOpen: root.compact ? navigationOverlay.visible : primaryNavigation.expanded; onClicked: execute("navigation", this) }
                    Item {
                        visible: root.nativeWindowHeader && primaryNavigation.expanded
                        Layout.preferredWidth: primaryNavigation.width + metrics.gap - navigationTrigger.implicitWidth - metrics.gap * 2
                    }
                    ShellButton { visible: library; iconName: "back"; text: t("back"); onClicked: library = false }
                    // Workspace pages read "Workspace / Page"; feature pages read "Feature / Session".
                    RowLayout {
                        objectName: "workspace-breadcrumb"
                        visible: root.workspacePage
                        spacing: metrics.small
                        Layout.fillWidth: true
                        Accessible.role: Accessible.Heading
                        Accessible.name: t("workspace") + " / " + t(root.home ? "home" : root.systemRoute)
                        Label { visible: root.width >= metrics.reading; text: t("workspace"); color: root.colors["chrome-fg-muted"]; Accessible.ignored: true }
                        Label { visible: root.width >= metrics.reading; text: "/"; color: root.colors["chrome-fg-muted"]; Accessible.ignored: true }
                        Label { text: t(root.home ? "home" : root.systemRoute); font.bold: true; elide: Text.ElideRight; Layout.fillWidth: true; Accessible.ignored: true }
                    }
                    // Glass splits feature titles too: muted feature, strong session.
                    RowLayout {
                        visible: !root.workspacePage && !settings && !library
                        spacing: metrics.small
                        Layout.fillWidth: true
                        Accessible.role: Accessible.Heading
                        Accessible.name: t(root.workspace.feature) + " / " + titleFor(session)
                        Label { visible: root.width >= metrics.reading; text: t(root.workspace.feature); color: root.colors["chrome-fg-muted"]; Accessible.ignored: true }
                        Label { text: "/"; visible: root.width >= metrics.reading; color: root.colors["chrome-fg-muted"]; Accessible.ignored: true }
                        Label { objectName: "session-breadcrumb-title"; text: titleFor(session); font.bold: true; elide: Text.ElideRight; Layout.fillWidth: true; Accessible.ignored: true }
                    }
                    Label { visible: !root.workspacePage && !(!settings && !library); text: settings ? t(root.systemRoute || "settings") : library ? t("history") : t(root.workspace.feature) + " / " + titleFor(session); elide: Text.ElideRight; Layout.fillWidth: true; font.bold: true; Accessible.role: Accessible.Heading }
                    ShellButton { visible: root.workspacePage && workbench.moduleEnabled("utilities"); showsLabel: !root.compact; iconName: "utilities"; text: t("launcher"); enabled: !workbench.loadBlocked; onClicked: workbench.desktopIntegration.trigger("launcher") }
                    Kit.SearchField {
                        id: settingsHeaderSearch
                        compact: true
                        visible: root.systemRoute === "" && settings
                        objectName: "settings-header-search"
                        Layout.preferredWidth: metrics.sidebar
                        implicitHeight: metrics.compactControl
                        text: root.settingsQuery
                        placeholderText: t("settingsSearch")
                        Accessible.name: placeholderText
                        selectByMouse: true
                        onTextChanged: root.settingsQuery = text
                        Keys.onReturnPressed: event => { if (inputMethodComposing) event.accepted = false; else contentLoader.item?.activateSearchResult?.() }
                        Keys.onEnterPressed: event => { if (inputMethodComposing) event.accepted = false; else contentLoader.item?.activateSearchResult?.() }
                        Keys.onDownPressed: event => { if (inputMethodComposing) event.accepted = false; else contentLoader.item?.focusSearchResults?.() }
                        Keys.onEscapePressed: event => { if (!inputMethodComposing) { root.settingsQuery = ""; event.accepted = true } else event.accepted = false }
                    }
                    ShellButton { visible: root.systemRoute === "interpret"; showsLabel: !root.compact; objectName: "interpret-summary-header"; glassMaterial: enabled; iconName: "reasoning"; text: t("summarize"); enabled: !workbench.interpretation.busy && !!workbench.interpretation.current.segments?.length; onClicked: workbench.interpretation.summarize("summary") }
                    ShellButton { id: interpretHistoryTrigger; visible: root.systemRoute === "interpret"; showsLabel: !root.compact; iconName: "history"; text: t("history"); ToolTip.visible: hovered && !root.composerPopup?.visible; enabled: !workbench.interpretation.busy; popupOpen: !!contentLoader.item?.historyOpen; onClicked: contentLoader.item?.openHistory?.(interpretHistoryTrigger) }
                    ShellButton { visible: root.systemRoute === "interpret"; showsLabel: !root.compact; primary: true; iconName: "new"; text: t("newInterpretation"); enabled: !workbench.interpretation.busy; onClicked: workbench.interpretation.clearSelection() }
                    Rectangle { visible: root.systemRoute === "interpret"; color: root.colors["border-strong"]; implicitWidth: metrics.hairline; implicitHeight: metrics.inset + metrics.hairline * 2 }
                    ShellButton { visible: !home && !settings && !library && root.workspace.feature === "translate"; showsLabel: !root.compact; iconName: "image"; text: t("addImage"); enabled: !workbench.loadBlocked && !(root.session.images || []).length; popupOpen: imagePicker.visible; onClicked: { imagePicker.ocr = false; imagePicker.ownerID = root.session.id; imagePicker.open() } }
                    ShellButton { visible: !home && !settings && !library && root.workspace.feature === "dictionary"; showsLabel: !root.compact; iconName: "dictionary"; text: t("savedWords"); enabled: !workbench.loadBlocked; onClicked: { root.favoritesOnly = true; root.library = true } }
                    ShellButton { id: historyTrigger; showsLabel: !root.compact; visible: !home && !settings && !library; iconName: "history"; text: t("history"); enabled: !workbench.loadBlocked; popupOpen: history.visible; onClicked: execute("history", this) }
                    ShellButton { showsLabel: !root.compact; primary: true; visible: !home && !settings && !library; iconName: "new"; text: t(root.workspace.feature === "chat" ? "newChat" : root.workspace.feature === "dictionary" ? "newLookup" : "newTranslation"); enabled: !workbench.loadBlocked; onClicked: execute("new", this) }
                    Rectangle { visible: (!home && !settings && !library) || (root.workspacePage && workbench.moduleEnabled("utilities")); color: root.colors["border-strong"]; implicitWidth: metrics.hairline; implicitHeight: metrics.inset + metrics.hairline * 2 }
                    ShellButton { id: activityTrigger; showsLabel: !root.compact; iconName: "activity"; text: t("activity") + (root.runningCount ? " · " + root.runningCount : ""); popupOpen: activity.visible; onClicked: execute("activity", this) }
                }
            }
        Pane {
            objectName: "reading-pane"
            Layout.fillWidth: true
            Layout.fillHeight: true
            // `.content` (Glass): the one warm reading pane, gap from the navigation pane and
            // the window edge, small from the header and the bottom.
            Layout.leftMargin: metrics.gap
            Layout.rightMargin: Layout.leftMargin
            Layout.topMargin: metrics.small
            Layout.bottomMargin: metrics.small
            padding: metrics.gutter - metrics.gap
            background: Kit.GlassPane {
                startRole: "canvas"; endRole: "canvas"
                shadowRole: "shadow-sm-color"
                borderRole: root.darkMode ? "border" : "material-border"
            }
            contentItem: ColumnLayout {
            spacing: 0
            Pane {
                visible: workbench.storageError.length > 0
                Layout.fillWidth: true
                padding: metrics.tight
                background: Rectangle { color: Qt.alpha(root.colors["text-strong"], metrics.selectionOpacity / 2); border.width: metrics.hairline; border.color: Qt.alpha(root.colors.danger, metrics.selectionOpacity * 2) }
                contentItem: RowLayout {
                    Label { Accessible.role: Accessible.AlertMessage; text: t(workbench.storageError); wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Kit.GlassButton { flat: true; glassMaterial: false; text: t(workbench.loadBlocked ? "retryLoad" : "retrySave"); onClicked: workbench.loadBlocked ? workbench.reload() : workbench.save() }
                }
            }
            RecordingStrip { bridge: workbench; Layout.fillWidth: true }
            RowLayout {
                visible: workbench.audio.busy && workbench.audio.recordingStarted === 0
                Label { text: t("running"); Layout.fillWidth: true }
                Kit.GlassButton { text: t("stop"); onClicked: workbench.audio.cancel() }
            }
            RowLayout {
                visible: workbench.ocrBusy
                Label { text: t("extractImageText"); Layout.fillWidth: true }
                Kit.GlassButton { text: t("stop"); onClicked: workbench.cancelOCR() }
            }
            Pane {
                visible: workbench.interpretation.busy && root.systemRoute !== "interpret"
                Layout.fillWidth: true
                padding: metrics.tight
                background: Rectangle { color: Qt.alpha(root.colors["tone-green"], metrics.selectionOpacity) }
                contentItem: RowLayout {
                    Label { text: t("interpret") + " · " + t(workbench.interpretation.listening ? "listening" : "running"); Layout.fillWidth: true; wrapMode: Text.Wrap }
                    Kit.QuietButton { text: t("open"); onClicked: root.selectRoute("interpret") }
                    Kit.QuietButton { text: t("stop"); palette.buttonText: root.colors.danger; onClicked: workbench.interpretation.listening ? workbench.interpretation.stop() : workbench.interpretation.cancel() }
                }
            }
            RowLayout {
                objectName: "shell-reset-notice"
                visible: !root.home && !root.settings && !root.library && root.workspace.feature !== "chat" && workbench.resetNotice.feature === root.workspace.feature
                Layout.fillWidth: true
                Label { text: root.t("resetNotice"); font.pointSize: Qt.application.font.pointSize * metrics.smallScale; color: root.colors["text-muted"]; Layout.fillWidth: true; wrapMode: Text.Wrap }
                Kit.QuietButton { objectName: "reset-reopen"; text: root.t("reopenPrevious"); onClicked: workbench.reopenPrevious() }
                Kit.IconButton { iconName: "close"; text: root.t("close"); onClicked: workbench.dismissResetNotice() }
            }
            Loader {
                id: contentLoader
                Layout.topMargin: metrics.gap
                Layout.fillWidth: true
                Layout.fillHeight: true
                enabled: settings || !workbench.loadBlocked
                sourceComponent: home ? homeView : settings ? (systemRoute === "apps" ? applicationsView : systemRoute === "interpret" ? interpretationView : systemRoute === "thermal" ? thermalView : systemRoute === "utilities" || systemRoute === "everywhere" ? desktopView : settingsView) : library ? glassLibraryView : root.workspace.feature === "chat" ? chatView : translateView
            }
            }
        }
        }
    }
    GlassDialog {
        id: deleteSavedPrompt
        property string promptID: ""
        title: t("deletePrompt"); modal: true; standardButtons: Dialog.Yes | Dialog.Cancel
        onAccepted: root.command("deletePrompt", {id: promptID})
    }
    GlassDialog {
        id: renameDialog
        property string ownerID
        objectName: "history-rename-dialog"
        parent: Overlay.overlay
        width: Math.min(metrics.notificationInline, root.width - metrics.inset * 2)
        title: t("rename"); modal: true; anchors.centerIn: parent
        closePolicy: root.composing() ? 0 : Popup.CloseOnEscape
        standardButtons: Dialog.Save | Dialog.Cancel
        ColumnLayout {
            width: parent.width
            Label { text: t("historyRenameHint"); wrapMode: Text.Wrap; Layout.fillWidth: true }
            TextField { id: renameInput; objectName: "history-rename-input"; maximumLength: 256; Accessible.name: t("sessionTitle"); Layout.fillWidth: true; Keys.onReturnPressed: event => { event.accepted = !inputMethodComposing; if (event.accepted) renameDialog.accept() }; Keys.onEnterPressed: event => { event.accepted = !inputMethodComposing; if (event.accepted) renameDialog.accept() } }
        }
        onOpened: { renameInput.forceActiveFocus(); renameInput.selectAll() }
        onAccepted: { command("rename", {sessionID: ownerID, value: renameInput.text}); if (!workbench.storageError) notify(t("historyRenamed")) }
    }
    FileDialog {
        id: sessionExport
        property string ownerID
        fileMode: FileDialog.SaveFile
        defaultSuffix: "json"
        nameFilters: ["JSON (*.json)"]
        onAccepted: root.exportHistory(selectedFile, ownerID)
    }
    FileDialog {
        id: imagePicker
        property string ownerID
        property bool ocr: false
        nameFilters: ["Images (*.png *.jpg *.jpeg *.gif *.webp)"]
        onAccepted: { if (ocr) workbench.extractImageText(selectedFile, ownerID); else workbench.attachImage(selectedFile, ownerID) }
    }
    component ImageControls: ColumnLayout {
        id: imageControls
        readonly property alias toolsControl: attachmentButton
        readonly property var efforts: ["auto", "low", "medium", "high"]
        readonly property string effort: root.session.reasoningEffort ?? (root.session.carefulReasoning ? "high" : "auto")
        readonly property bool adjustable: workbench.supportsEffort(root.session.model)
        function effortEnabled(level) { return adjustable || level === "auto" || level === "high" }
        function effortHint(level) { return root.t(!effortEnabled(level) ? "reasoningUnsupported" : level === "high" ? "carefulReasoningHint" : "reasoningLevelHint_" + level) }
        // Compact: icon menu inside a composer row; attachments render as chips.
        property bool compact: false
        property bool glassChat: false
        Kit.GlassButton {
            id: attachmentButton
            glassMaterial: !imageControls.glassChat
            text: t("attachImage"); icon.source: root.session.feature === "translate" ? "icons/image.svg" : "icons/new.svg"
            display: parent.compact ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon
            flat: parent.compact
            implicitWidth: parent.compact ? metrics.control : implicitContentWidth + leftPadding + rightPadding
            Accessible.name: text; ToolTip.visible: hovered && !toolsPanel.visible && !attachmentMenu.visible; ToolTip.text: text
            implicitHeight: metrics.control
            Kit.ControlLens { control: attachmentButton; active: imageControls.glassChat; selectionMarker: false }
            popupOpen: toolsPanel.visible || attachmentMenu.visible || instructionsPanel.visible
            objectName: imageControls.glassChat ? "chat-tools-trigger" : "attachment-menu-trigger"
            // This opens a menu, it does not toggle chat configuration. Keep
            // configuration indicated by the icon; focus belongs to visualFocus.
            readonly property bool configured: (root.session.chatMode || "text") !== "text" || !!root.session.systemPrompt
            Binding { target: attachmentButton; property: "icon.color"; when: imageControls.glassChat; value: attachmentButton.configured ? root.colors.action : root.colors.text }
            onClicked: {
                if (imageControls.glassChat) {
                    toolsPanel.keyboardInvocation = visualFocus
                    root.showComposerPanel(toolsPanel, attachmentButton)
                } else root.showComposerPanel(attachmentMenu, attachmentButton)
            }
            Menu {
                id: attachmentMenu
                objectName: "attachment-menu"
                onClosed: root.restoreOverlayFocus()
                popupType: Popup.Item
                property string ownerID: ""
                onAboutToShow: ownerID = root.session.id
                Connections { target: root; function onSessionChanged() { if (attachmentMenu.visible && attachmentMenu.ownerID !== root.session.id) attachmentMenu.close() } }
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
                MenuSeparator { visible: root.session.feature === "chat"; height: visible ? implicitHeight : 0 }
                Repeater {
                    model: root.session.feature === "chat" ? imageControls.efforts : []
                    delegate: MenuItem {
                        required property string modelData
                        objectName: "menu-reasoning-" + modelData
                        text: root.t("reasoningLevel_" + modelData)
                        autoExclusive: true
                        enabled: imageControls.effortEnabled(modelData)
                        checkable: true; checked: imageControls.effort === modelData
                        Accessible.description: imageControls.effortHint(modelData)
                        onTriggered: root.command("chatReasoning", {sessionID: attachmentMenu.ownerID, value: modelData})
                    }
                }
                MenuItem { visible: root.session.feature === "chat"; height: visible ? implicitHeight : 0; text: t(workbench.audio.speaking ? "stopSpeaking" : "listen"); enabled: workbench.audio.speaking || !!root.speechText().trim(); onTriggered: workbench.audio.speaking ? workbench.audio.silence() : workbench.audio.speak(root.speechText(), session.target) }
            }
        }
        Label { text: t(workbench.ocrError); visible: !!workbench.ocrError && !parent.compact; wrapMode: Text.Wrap; Layout.maximumWidth: metrics.sidebar }
        Popup {
            id: toolsPanel
            objectName: "chat-tools-panel"
            parent: Overlay.overlay
            property string ownerID: ""
            property bool keyboardInvocation: false
            property real openerTop: 0
            property real openerLeft: 0
            property real openerBottom: 0
            // Above the "+" button by default; below it when the menu does not fit
            // above and there is more room underneath (the centred empty-chat composer).
            readonly property real needed: toolsBody.implicitHeight + topPadding + bottomPadding
            readonly property real above: openerTop - metrics.small - metrics.inset
            readonly property real below: root.height - openerBottom - metrics.small - metrics.inset
            readonly property bool placeBelow: above < needed && below > above
            width: Math.min(metrics.sidebar + metrics.editor, root.width - metrics.inset * 2)
            height: Math.min(needed, Math.max(metrics.control, placeBelow ? below : above))
            x: Math.max(metrics.inset, Math.min(openerLeft, root.width - width - metrics.inset))
            y: placeBelow ? openerBottom + metrics.small : openerTop - height - metrics.small
            padding: metrics.small
            focus: true; modal: false
            closePolicy: Popup.CloseOnPressOutside | (root.composing() ? 0 : Popup.CloseOnEscape)
            background: Kit.ReadingPanelSurface {}
            onAboutToShow: { ownerID = root.session.id; positionFromOpener(); Qt.callLater(positionFromOpener) }
            onOpened: {
                toolsScroll.contentItem.contentY = 0
                const reason = keyboardInvocation ? Qt.TabFocusReason : Qt.MouseFocusReason
                attachRow.forceActiveFocus(reason)
                // Reopening can restore the already-focused row before this
                // handler. Preserve the invocation reason even without a focus change.
                attachRow.focusReason = reason
            }
            onClosed: {
                root.restoreOverlayFocus()
                if (!root.replacingOverlay && root.composerPopup === toolsPanel && root.overlayOpener === attachmentButton)
                    attachmentButton.focusReason = keyboardInvocation ? Qt.TabFocusReason : Qt.MouseFocusReason
            }
            Connections { target: root; function onSessionChanged() { if (toolsPanel.visible && toolsPanel.ownerID !== root.session.id) toolsPanel.close() } function onActiveFocusItemChanged() { toolsPanel.revealFocus() } function onWidthChanged() { if (toolsPanel.visible) Qt.callLater(toolsPanel.positionFromOpener) } function onHeightChanged() { if (toolsPanel.visible) Qt.callLater(toolsPanel.positionFromOpener) } }
            function positionFromOpener() { const point = attachmentButton.mapToItem(parent, 0, 0); openerTop = point.y; openerLeft = point.x; openerBottom = point.y + attachmentButton.height }
            function pickImage(ocr) { const owner = ownerID; close(); imagePicker.ocr = ocr; imagePicker.ownerID = owner; imagePicker.open() }
            function revealFocus() {
                const item = root.activeFocusItem
                if (!visible || !item) return
                let ancestor = item.parent
                while (ancestor && ancestor !== toolsBody) ancestor = ancestor.parent
                if (!ancestor) return
                const top = item.mapToItem(toolsBody, 0, 0).y
                const flick = toolsScroll.contentItem
                if (top < flick.contentY) flick.contentY = top
                else if (top + item.height > flick.contentY + toolsScroll.availableHeight)
                    flick.contentY = top + item.height - toolsScroll.availableHeight
            }
            NamedScrollView {
                scrollName: t("attachImage")
                id: toolsScroll
                objectName: "chat-tools-scroll"
                anchors.fill: parent; contentWidth: availableWidth
                contentHeight: toolsBody.implicitHeight
                ScrollBar.horizontal.policy: ScrollBar.AlwaysOff
                ScrollBar.vertical: ScrollBar {
                    objectName: "chat-tools-scrollbar"
                    parent: toolsScroll
                    x: toolsScroll.width - width; y: toolsScroll.topPadding
                    height: toolsScroll.availableHeight
                    policy: toolsScroll.contentHeight > toolsScroll.availableHeight ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff
                    palette.mid: root.colors["text-muted"]; palette.dark: root.colors.text
                }
                ColumnLayout {
                    id: toolsBody
                    width: toolsScroll.availableWidth - toolsScroll.effectiveScrollBarWidth
                    spacing: 0
                    Kit.PanelRow { id: attachRow; objectName: "chat-tools-attach"; text: root.t("attachImage"); iconName: "image"; detail: (root.session.images || []).length + "/4"; Layout.fillWidth: true; enabled: (root.session.images || []).length < 4; onClicked: toolsPanel.pickImage(false) }
                    Kit.PanelRow { text: root.t("captureImage"); iconName: "capture"; Layout.fillWidth: true; enabled: (root.session.images || []).length < 4; onClicked: { const owner = toolsPanel.ownerID; toolsPanel.close(); workbench.captureImage(owner) } }
                    Kit.PanelRow { text: root.t("extractImageText"); iconName: "ocr"; Layout.fillWidth: true; enabled: !workbench.ocrBusy; onClicked: toolsPanel.pickImage(true) }
                    Rectangle { Layout.fillWidth: true; Layout.topMargin: metrics.tight; Layout.bottomMargin: metrics.tight; implicitHeight: metrics.hairline; color: root.colors.border }
                    Repeater {
                        model: ["text", "web", "research", "image"]
                        delegate: Kit.PanelRow {
                            required property string modelData
                            Layout.fillWidth: true
                            text: root.t("chatMode_" + modelData)
                            iconName: ({text: "chat", web: "search", research: "dictionary", image: "image"})[modelData]
                            detail: root.t("chatModeHint_" + modelData)
                            selected: (root.session.chatMode || "text") === modelData
                            onClicked: { root.command("chatMode", {sessionID: toolsPanel.ownerID, value: modelData}); toolsPanel.close() }
                        }
                    }
                    Rectangle { Layout.fillWidth: true; Layout.topMargin: metrics.tight; Layout.bottomMargin: metrics.tight; implicitHeight: metrics.hairline; color: root.colors.border }
                    Repeater {
                        model: imageControls.efforts
                        delegate: Kit.PanelRow {
                            required property string modelData
                            objectName: "chat-tools-reasoning-" + modelData
                            Layout.fillWidth: true
                            text: root.t("reasoningLevel_" + modelData)
                            detail: imageControls.effortHint(modelData)
                            Accessible.description: detail
                            enabled: imageControls.effortEnabled(modelData)
                            selected: imageControls.effort === modelData
                            onClicked: { root.command("chatReasoning", {sessionID: toolsPanel.ownerID, value: modelData}); toolsPanel.close() }
                        }
                    }
                    Kit.PanelRow { objectName: "chat-instructions-trigger"; text: root.t("systemPrompt"); iconName: "instructions"; disclosure: true; detail: (root.workspace.prompts || []).find(item => item.text === root.session.systemPrompt)?.name || (root.session.systemPrompt ? root.t("customInstruction") : root.t("noInstruction")); Layout.fillWidth: true; onClicked: root.showComposerPanel(instructionsPanel, attachmentButton) }
                    Rectangle { Layout.fillWidth: true; Layout.topMargin: metrics.tight; Layout.bottomMargin: metrics.tight; implicitHeight: metrics.hairline; color: root.colors.border }
                    Kit.PanelRow { visible: root.width < metrics.reading; text: root.t(workbench.audio.recording ? "stopRecording" : "record"); iconName: "interpret"; Layout.fillWidth: true; enabled: !workbench.audio.busy; onClicked: { toolsPanel.close(); workbench.audio.recording ? workbench.audio.stop(workspace.speechProvider || "auto") : workbench.startRecording() } }
                    Kit.PanelRow { text: root.t("listen"); iconName: "listen"; Layout.fillWidth: true; enabled: !!root.speechText().trim(); onClicked: { toolsPanel.close(); workbench.audio.speak(root.speechText(), workbench.speechLanguage(root.speechText(), workbench.locale)) } }
                    Kit.PanelRow { objectName: "chat-tools-stop"; text: root.t("stopSpeaking"); iconName: "close"; Layout.fillWidth: true; enabled: workbench.audio.speaking; onClicked: { toolsPanel.close(); workbench.audio.silence() } }
                }
            }
        }
        Repeater {
            model: parent.compact ? [] : root.session.images || []
            delegate: RowLayout {
                required property var modelData
                Label { textFormat: Text.PlainText; text: modelData.name; elide: Text.ElideMiddle; Layout.maximumWidth: metrics.sidebar; ToolTip.visible: attachmentHover.hovered; ToolTip.text: text; HoverHandler { id: attachmentHover } }
                Kit.GlassButton { text: t("removeAttachment"); icon.source: "icons/close.svg"; display: AbstractButton.IconOnly; Accessible.name: text; ToolTip.visible: hovered; ToolTip.text: text; implicitWidth: metrics.compactControl; implicitHeight: metrics.compactControl; onClicked: workbench.command("removeImage", {sessionID: root.session.id, imageID: modelData.id}) }
            }
        }
    }
    Popup {
        id: instructionsPanel
        objectName: "chat-instructions-panel"
        parent: Overlay.overlay
        property string ownerID: ""
        property bool naming: false
        readonly property var owner: root.workspace.sessions.find(item => item.id === ownerID)
        width: Math.min(metrics.sidebar + metrics.editor, root.width - metrics.inset * 2)
        height: Math.min(metrics.editor * 3, root.height - metrics.inset * 2)
        x: Math.max(metrics.inset, Math.min(root.overlayOpener ? root.overlayOpener.mapToItem(parent, 0, 0).x : metrics.inset, root.width - width - metrics.inset))
        y: Math.max(metrics.inset, (root.overlayOpener ? root.overlayOpener.mapToItem(parent, 0, 0).y : root.height) - height - metrics.small)
        padding: metrics.inset; focus: true; modal: false
        closePolicy: Popup.CloseOnPressOutside | (root.composing() ? 0 : Popup.CloseOnEscape)
        background: Kit.ReadingPanelSurface {}
        onAboutToShow: { ownerID = root.session.id; naming = false; promptNameInput.text = "" }
        onOpened: instructionEditor.forceActiveFocus()
        onClosed: root.restoreOverlayFocus()
        Connections { target: root; function onSessionChanged() { if (instructionsPanel.visible && instructionsPanel.ownerID !== root.session.id) instructionsPanel.close() } }
        ColumnLayout {
            anchors.fill: parent
            Label { text: root.t("systemPrompt"); font.weight: Font.DemiBold }
            NamedScrollView {
                scrollName: t("systemPrompt")
                Layout.fillWidth: true; Layout.preferredHeight: metrics.editor
                TextArea {
                    id: instructionEditor
                    objectName: "chat-instructions-editor"
                    text: instructionsPanel.owner?.systemPrompt || ""
                    placeholderText: root.t("instructionsHint"); Accessible.name: root.t("systemPrompt")
                    selectByMouse: true; wrapMode: TextEdit.Wrap
                    onTextChanged: if (instructionsPanel.visible && instructionsPanel.ownerID === root.session.id && text !== (instructionsPanel.owner?.systemPrompt || "")) root.command("systemPrompt", {sessionID: instructionsPanel.ownerID, value: text})
                }
            }
            Kit.Eyebrow { text: root.t("promptLibrary") }
            NamedScrollView {
                scrollName: t("promptLibrary")
                Layout.fillWidth: true; Layout.fillHeight: true; contentWidth: availableWidth
                ColumnLayout {
                    width: parent.width
                    Repeater {
                        model: root.workspace.prompts || []
                        delegate: RowLayout {
                            required property var modelData
                            Layout.fillWidth: true
                            Kit.PanelRow { text: modelData.name; selected: modelData.text === instructionsPanel.owner?.systemPrompt; Layout.fillWidth: true; onClicked: root.command("systemPrompt", {sessionID: instructionsPanel.ownerID, value: modelData.text}) }
                            Kit.IconButton {
                                iconName: "close"; text: root.t("deletePrompt")
                                onClicked: {
                                    const prompt = modelData
                                    root.command("deletePrompt", {id: prompt.id})
                                    if (!(root.workspace.prompts || []).some(item => item.id === prompt.id) && !workbench.storageError) root.notify(root.t("promptDeleted"), function() { if (!(root.workspace.prompts || []).some(item => item.name === prompt.name)) root.command("savePrompt", {name: prompt.name, text: prompt.text}) })
                                }
                            }
                        }
                    }
                }
            }
            Kit.QuietButton { visible: !instructionsPanel.naming; text: root.t("savePromptAs"); onClicked: { instructionsPanel.naming = true; promptNameInput.forceActiveFocus() } }
            RowLayout {
                visible: instructionsPanel.naming; Layout.fillWidth: true
                TextField { id: promptNameInput; placeholderText: root.t("promptName"); Accessible.name: placeholderText; Layout.fillWidth: true; maximumLength: 100 }
                Kit.QuietButton { text: root.t("save"); enabled: !!promptNameInput.text.trim(); onClicked: { root.command("savePrompt", {name: promptNameInput.text, text: instructionEditor.text}); if (!workbench.storageError) root.notify(root.t("promptSaved")); instructionsPanel.naming = false } }
            }
        }
    }
    component AudioControls: ColumnLayout {
        id: audioControls
        // Compact: record icon only; speech output moves to the options menu.
        property bool compact: false
        property bool glassChat: false
        RowLayout {
            spacing: metrics.small
            Kit.IconButton {
                id: recordButton
                glassMaterial: !audioControls.glassChat
                objectName: audioControls.glassChat ? "chat-record" : ""
                visible: parent.parent.compact
                iconName: "interpret"
                text: t(workbench.audio.recording ? "stopRecording" : "record")
                checked: workbench.audio.recording
                enabled: !workbench.audio.busy
                onClicked: workbench.audio.recording ? workbench.audio.stop(workspace.speechProvider || "auto") : workbench.startRecording()
                Kit.ControlLens { control: recordButton; active: audioControls.glassChat; destructive: workbench.audio.recording; quiet: true }
                Binding { target: recordButton.contentItem; property: "visible"; value: false; when: audioControls.glassChat }
                Kit.VoiceGlyph { anchors.centerIn: parent; visible: audioControls.glassChat && !workbench.audio.recording; color: recordButton.enabled ? root.palette.buttonText : root.colors["text-disabled"] }
                Rectangle { anchors.centerIn: parent; visible: audioControls.glassChat && workbench.audio.recording; width: metrics.icon - metrics.small; height: width; radius: metrics.hairline; color: root.colors.danger; Accessible.ignored: true }
            }
            Kit.GlassButton { visible: !parent.parent.compact; text: t(workbench.audio.recording ? "stopRecording" : "record"); implicitHeight: metrics.control; enabled: !workbench.audio.busy; onClicked: workbench.audio.recording ? workbench.audio.stop(workspace.speechProvider || "auto") : workbench.startRecording() }
            Kit.GlassButton {
                visible: !parent.parent.compact
                text: t(workbench.audio.speaking ? "stopSpeaking" : "listen"); implicitHeight: metrics.control
                enabled: workbench.audio.speaking || !!root.speechText().trim()
                onClicked: workbench.audio.speaking ? workbench.audio.silence() : workbench.audio.speak(root.speechText(), session.target)
            }
            Kit.GlassButton {
                visible: !parent.parent.compact
                text: t("speechProvider"); icon.source: "icons/settings.svg"; display: AbstractButton.IconOnly
                implicitWidth: metrics.control; implicitHeight: metrics.control; Accessible.name: text; ToolTip.visible: hovered; ToolTip.text: text
                popupOpen: speechMenu.visible
                onClicked: speechMenu.open()
                Menu {
                    id: speechMenu
                    Repeater {
                        model: ["auto", "openai", "gemini", "groq"]
                        delegate: MenuItem { required property string modelData; text: modelData === "auto" ? t("reasoning_auto") : modelData; checkable: true; checked: (workspace.speechProvider || "auto") === modelData; onTriggered: root.command("speechProvider", {value: modelData}) }
                    }
                    MenuSeparator {}
                    MenuItem { text: t("speechAutoHint"); enabled: false; implicitWidth: metrics.sidebar; contentItem: Label { text: t("speechAutoHint"); wrapMode: Text.Wrap; color: palette.text } }
                }
            }
            BusyIndicator { Accessible.name: t("transcribing"); visible: running; running: workbench.audio.busy; implicitWidth: metrics.control; implicitHeight: metrics.control }
            Kit.GlassButton { text: t("stop"); visible: workbench.audio.busy; onClicked: workbench.audio.cancel() }
        }
        Label { Accessible.role: Accessible.AlertMessage; text: workbench.audio.error ? t(workbench.audio.error) : ""; visible: !!text; wrapMode: Text.Wrap; Layout.maximumWidth: metrics.sidebar }
        Kit.GlassButton { text: t("insertTranscript"); visible: !!workbench.pendingTranscript; onClicked: workbench.insertTranscript() }
    }
    component AttachmentChips: Flow {
        visible: (root.session.images || []).length > 0
        spacing: metrics.small
        Repeater {
            model: root.session.images || []
            delegate: Item {
                required property var modelData
                width: metrics.hero + metrics.small
                height: metrics.hero + metrics.small
                Image { anchors.fill: parent; source: "image://attachments/" + modelData.id; sourceSize.width: parent.width; sourceSize.height: parent.height; fillMode: Image.PreserveAspectFit; Accessible.name: modelData.name }
                Kit.IconButton { anchors.top: parent.top; anchors.right: parent.right; iconName: "close"; text: t("removeAttachment") + " " + modelData.name; implicitWidth: metrics.icon; implicitHeight: implicitWidth; onClicked: workbench.command("removeImage", {sessionID: root.session.id, imageID: modelData.id}) }
            }
        }
    }
    component RetryNotice: RowLayout {
        readonly property var lastTask: root.workspace.tasks.find(task => task.request.sessionID === session.id)
        visible: !!lastTask && ["failed", "interrupted", "cancelled"].includes(lastTask.status)
        ColumnLayout {
            Layout.fillWidth: true; spacing: metrics.tight
            Label { text: lastTask ? t(lastTask.status === "failed" ? (lastTask.errorCode || "providerError") : lastTask.status) : ""; Layout.fillWidth: true; wrapMode: Text.Wrap }
            // The provider's own explanation, when it gave one.
            Label { objectName: "task-error-detail"; visible: !!lastTask && lastTask.status === "failed" && !!lastTask.errorDetail; text: lastTask?.errorDetail || ""; textFormat: Text.PlainText; color: root.palette.placeholderText; font.pointSize: Qt.application.font.pointSize * metrics.captionScale; wrapMode: Text.Wrap; maximumLineCount: 3; elide: Text.ElideRight; Layout.fillWidth: true }
        }
        Kit.GlassButton { text: t("retry"); enabled: !activeTask && !!lastTask && (session.feature === "chat" || lastTask.request.revision === session.revision); onClicked: command("retry", {taskID: lastTask.id}) }
    }
    Component {
        id: chatView
        ColumnLayout {
            id: chatWorkspace
            readonly property alias modelControl: chatPicker.modelControl
            readonly property alias toolsControl: chatImages.toolsControl
            readonly property bool groupedEmpty: !(root.session.messages || []).length && !root.activeTask
            spacing: metrics.gap
            Item { visible: chatWorkspace.groupedEmpty; Layout.fillHeight: true; Layout.preferredHeight: 0; Layout.verticalStretchFactor: 2 }
            ChatTranscript {
                snapshot: root.workspace
                id: transcript
                bridge: workbench
                session: root.session
                readingPointSize: root.readingPointSize
                onNotification: (text, error) => root.notify(text, null, error)
                onImageExportRequested: (url, image) => root.announceExport(url, function() { workbench.exportImage(url, image) })
                Layout.leftMargin: metrics.gap
                Layout.rightMargin: Layout.leftMargin
                Layout.fillWidth: true
                Layout.fillHeight: !chatWorkspace.groupedEmpty
                Layout.preferredHeight: chatWorkspace.groupedEmpty ? emptyHeight : -1
            }
            // Same column as the composer it warns about; never a frame around it.
            RowLayout {
                id: chatNotice
                objectName: "chat-provider-notice"
                readonly property string availability: (workbench.localModels, workbench.providersChecked, workbench.availability(root.session.model))
                readonly property bool unavailable: availability !== "available" && availability !== "unknown"
                readonly property bool imageMissing: root.session.chatMode === "image" && !(workbench.localModels, workbench.imageProvider(root.session.model))
                readonly property bool reset: workbench.resetNotice.feature === root.session.feature
                readonly property string kind: workbench.providersEmpty ? "empty" : unavailable ? "unavailable" : imageMissing ? "image" : reset ? "reset" : ""
                visible: !!kind
                Layout.fillWidth: true; Layout.maximumWidth: metrics.reading; Layout.alignment: Qt.AlignHCenter
                Layout.leftMargin: metrics.gap; Layout.rightMargin: metrics.gap
                Kit.StatusDot { tone: chatNotice.kind === "empty" ? "failed" : "idle"; failedColor: root.colors.danger; color: chatNotice.kind === "empty" ? root.colors.danger : chatNotice.kind === "reset" ? root.colors["text-muted"] : root.colors.warning }
                Label {
                    text: root.t(chatNotice.kind === "empty" ? "noProviderNotice" : chatNotice.kind === "image" ? "imageKeyNotice" : chatNotice.kind === "reset" ? "resetNotice" : chatNotice.availability === "offline" ? "modelOfflineReason" : chatNotice.availability === "missingKey" ? "modelMissingKeyReason" : chatNotice.availability === "notInstalled" ? "modelNotInstalledReason" : "modelUnsupportedReason")
                    font.pointSize: Qt.application.font.pointSize * metrics.smallScale
                    color: root.colors["text-muted"]; wrapMode: Text.Wrap; Layout.fillWidth: true
                }
                Kit.QuietButton { text: root.t(chatNotice.kind === "reset" ? "reopenPrevious" : chatNotice.kind === "image" || chatNotice.availability === "missingKey" ? "openProviders" : "openLocalModels"); onClicked: chatNotice.kind === "reset" ? workbench.reopenPrevious() : root.openSettingsSection(chatNotice.kind === "image" || chatNotice.availability === "missingKey" ? "providers" : "localModels") }
                Kit.IconButton { visible: chatNotice.kind === "reset"; iconName: "close"; text: root.t("close"); onClicked: workbench.dismissResetNotice() }
            }
            Frame {
                id: composer
                objectName: "chat-composer"
                readonly property real oneRowMinimum: metrics.editor + (root.width < metrics.reading ? metrics.control : metrics.compactSidebar) + metrics.control * 3 + metrics.small * 6
                readonly property real inlineEditorWidth: availableWidth - composerTools.implicitWidth - metrics.control * 2 - metrics.small * 3
                // Measure the unwrapped draft, so widening the editor after a wrap
                // cannot oscillate between one and two rows. The TextArea stays put.
                readonly property bool singleRow: width >= oneRowMinimum && !(session.images || []).length && !chatDraft.text.includes("\n") && draftMeasure.advanceWidth <= inlineEditorWidth - metrics.small * 2
                function editorHeight() {
                    // Cursor rectangles come from the shaped text layout, including
                    // CJK fallback and wrapped lines. FontMetrics alone can clip it.
                    const contentHeight = chatDraft.contentHeight
                    const layoutWidth = chatDraft.width
                    const padding = chatDraft.topPadding + chatDraft.bottomPadding
                    if (chatDraft.lineCount <= metrics.composerMaxLines)
                        return Math.max(metrics.control, contentHeight + padding)
                    let position = 0
                    const top = chatDraft.positionToRectangle(0).y
                    for (let line = 0; line < metrics.composerMaxLines; line++) {
                        const y = chatDraft.positionToRectangle(position).y
                        let lower = position + 1, upper = chatDraft.length + 1
                        while (lower < upper) {
                            const middle = Math.floor((lower + upper) / 2)
                            if (chatDraft.positionToRectangle(middle).y > y) upper = middle
                            else lower = middle + 1
                        }
                        position = lower
                        if (position > chatDraft.length) return Math.max(metrics.control, contentHeight + padding)
                    }
                    return Math.max(metrics.control, chatDraft.positionToRectangle(position).y - top + padding)
                }
                padding: metrics.small
                // FluentWinUI3 sets its own vertical padding on Frame; `padding` alone leaves it at 16.
                topPadding: padding
                bottomPadding: padding
                background: Item {
                    Kit.ChromeSurface {
                        anchors.fill: parent
                        radius: composer.singleRow ? (metrics.control + metrics.inset) / 2 : metrics.chromeSurfaceRadius
                        fillColor: root.darkMode ? root.colors["surface-raised"] : Qt.alpha(root.colors["material-highlight"], 0.92)
                        illuminatedFill: false
                        fillHighlight: fillColor
                        edgeColor: root.colors["material-border"]
                        edgeHighlight: root.colors["material-highlight"]
                    }
                    Rectangle { anchors.fill: parent; visible: chatDraft.activeFocus; color: "transparent"; radius: composer.singleRow ? (metrics.control + metrics.inset) / 2 : metrics.chromeSurfaceRadius; border.width: metrics.hairline; border.color: root.colors["border-strong"]; Accessible.ignored: true }
                }
                Layout.fillWidth: true
                Layout.maximumWidth: metrics.reading
                Layout.leftMargin: metrics.gap
                Layout.rightMargin: Layout.leftMargin
                Layout.alignment: Qt.AlignHCenter
                TextMetrics { id: draftMeasure; font: chatDraft.font; text: chatDraft.text }
                GridLayout {
                    anchors.fill: parent
                    columns: 6
                    columnSpacing: metrics.small
                    rowSpacing: metrics.small
                    AttachmentChips { Layout.row: 0; Layout.column: 0; Layout.columnSpan: 6; Layout.fillWidth: true }
                    NamedScrollView {
                        scrollName: t("draft")
                        id: draftScroll
                        objectName: "chat-draft-scroll"
                        contentWidth: availableWidth
                        Layout.row: 1
                        Layout.column: composer.singleRow ? 1 : 0
                        Layout.columnSpan: composer.singleRow ? 1 : 6
                        Layout.fillWidth: true
                        Layout.preferredHeight: (composer.singleRow ? metrics.control : composer.editorHeight())
                        TextArea {
                            id: chatDraft
                            objectName: "chat-draft"
                            Connections { target: root; function onComposerFocusEpochChanged() { chatDraft.forceActiveFocus() } }
                            Component.onCompleted: if (root.composerFocusEpoch > 0) forceActiveFocus()
                            text: session.draft
                            font.pointSize: root.readingPointSize
                            placeholderText: t((session.chatMode || "text") !== "text" ? "promptMode_" + session.chatMode : "prompt")
                            wrapMode: TextEdit.Wrap
                            selectByMouse: true
                            background: null
                            Accessible.name: t("draft")
                            onTextChanged: if (text !== session.draft) command("draft", {value: text})
                            function sendOnEnter(event) {
                                if (inputMethodComposing) {
                                    // A confirming Enter that reaches the TextArea must not also insert a newline.
                                    event.accepted = true
                                    Qt.inputMethod.commit()
                                    return
                                }
                                const modifiers = event.modifiers & ~Qt.KeypadModifier
                                event.accepted = modifiers === Qt.NoModifier || modifiers === Qt.ControlModifier
                                if (event.accepted && !activeTask && sendButton.enabled)
                                    sendButton.clicked()
                            }
                            Keys.onReturnPressed: event => sendOnEnter(event)
                            Keys.onEnterPressed: event => sendOnEnter(event)
                        }
                    }
                    ImageControls { id: chatImages; compact: true; glassChat: true; Layout.row: composer.singleRow ? 1 : 2; Layout.column: 0; Layout.alignment: Qt.AlignBottom }
                    Pane {
                        id: composerTools
                        padding: 0
                        Layout.row: composer.singleRow ? 1 : 2
                        Layout.column: composer.singleRow ? 2 : 1
                        Layout.columnSpan: 2
                        Layout.alignment: Qt.AlignBottom
                        background: Kit.ControlGlassSurface {
                            radius: metrics.control / 2
                        }
                        RowLayout {
                            spacing: metrics.small
                            SessionModelPicker {
                                id: chatPicker
                                shell: root; bridge: workbench
                                onDeletePromptRequested: promptID => { deleteSavedPrompt.promptID = promptID; deleteSavedPrompt.open() }
                            }
                            Rectangle { visible: root.width >= metrics.reading; implicitWidth: metrics.hairline; implicitHeight: metrics.inset + metrics.hairline * 2; color: root.colors.border }
                            AudioControls { visible: root.width >= metrics.reading; compact: true; glassChat: true }
                        }
                    }
                    // Image mode names who will draw, regardless of the chat model.
                    Item { visible: !composer.singleRow; Layout.row: 2; Layout.column: 4; Layout.fillWidth: true }
                    Kit.GlassButton {
                        id: sendButton
                        glassMaterial: false
                        objectName: "chat-send"
                        Layout.row: composer.singleRow ? 1 : 2
                        Layout.column: 5
                        Layout.alignment: Qt.AlignBottom
                        implicitHeight: metrics.control
                        implicitWidth: metrics.control
                        leftPadding: 0
                        rightPadding: leftPadding
                        text: t(activeTask ? "stop" : "send")
                        enabled: !!activeTask || (!chatDraft.inputMethodComposing
                            && (!!session.draft.trim() || (session.images || []).length > 0)
                            && !(root.workspace.disabledModules || []).includes("chat")
                            && !(session.model.startsWith("ollama:") && workbench.localPerformance.busy)
                            && (session.chatMode === "image" ? !chatNotice.imageMissing : !workbench.providersEmpty && !chatNotice.unavailable))
                        Accessible.name: text
                        Accessible.description: activeTask ? "" : ToolTip.text
                        ToolTip.visible: hovered
                        ToolTip.text: activeTask ? text : text + " (Enter) · " + t("ai_chat_popup_new_line") + " (Shift+Enter)"
                        contentItem: Item {
                            readonly property color foreground: !sendButton.enabled ? root.colors["text-disabled"] : activeTask ? root.colors.danger : root.colors["action-fg"]
                            // Existing chevron becomes an upward send arrow; Stop is
                            // a solid square. Both retain the named native button.
                            Item {
                                anchors.centerIn: parent
                                width: metrics.icon; height: width
                                // The stem hangs below the chevron; lift both so the arrow sits on the button's centre.
                                readonly property real arrowLift: metrics.tight - metrics.hairline
                                IconImage { anchors.centerIn: parent; anchors.verticalCenterOffset: -parent.arrowLift; visible: !activeTask; source: "icons/back.svg"; rotation: 90; sourceSize.width: metrics.icon; sourceSize.height: metrics.icon; color: parent.parent.foreground; Accessible.ignored: true }
                                Rectangle { visible: !activeTask; width: metrics.hairline * 2; height: metrics.gap; x: (parent.width - width) / 2; y: metrics.small - parent.arrowLift; radius: metrics.hairline; color: parent.parent.foreground; Accessible.ignored: true }
                                Rectangle { anchors.centerIn: parent; visible: !!activeTask; width: metrics.icon - metrics.small; height: width; radius: metrics.hairline; color: parent.parent.foreground; Accessible.ignored: true }
                            }
                        }
                        background: Rectangle {
                            radius: height / 2
                            color: !sendButton.enabled ? root.colors["surface-muted"] : activeTask ? root.colors["surface-raised"] : root.colors.action
                            gradient: sendButton.enabled && !activeTask ? sendGradient : null
                            Gradient { id: sendGradient; GradientStop { position: 0; color: root.colors["action-fill-top"] } GradientStop { position: 1; color: root.colors["action-fill-bottom"] } }
                            border.width: sendButton.visualFocus ? metrics.focusRingWidth : !!activeTask ? metrics.hairline : 0
                            border.color: activeTask ? Qt.alpha(root.colors.danger, 0.35) : root.colors["border-strong"]
                        }
                        onClicked: root.submit()
                    }
                }
            }
            ColumnLayout {
                visible: chatWorkspace.groupedEmpty && root.recentSessions.length > 0
                Layout.fillWidth: true; Layout.maximumWidth: metrics.reading; Layout.alignment: Qt.AlignHCenter
                Layout.leftMargin: metrics.gap; Layout.rightMargin: metrics.gap; Layout.topMargin: metrics.inset
                spacing: metrics.tight
                Kit.Eyebrow { text: root.t("continueRecent") }
                Repeater {
                    model: root.recentSessions
                    delegate: Kit.PanelRow { required property var modelData; objectName: "continue-" + modelData.id; text: root.titleFor(modelData); detail: root.relativeTime(modelData.updated); iconName: modelData.feature; Layout.fillWidth: true; onClicked: root.choose(modelData.id) }
                }
            }
            HabitChips {
                Layout.maximumWidth: metrics.reading; Layout.alignment: Qt.AlignHCenter
                Layout.leftMargin: metrics.gap; Layout.rightMargin: metrics.gap
                bridge: workbench
                sessionID: !(root.session.messages || []).length && !root.activeTask ? root.session.id : ""
                onActivated: action => root.activateHabit(action)
            }
            Item { visible: chatWorkspace.groupedEmpty; Layout.fillHeight: true; Layout.preferredHeight: 0; Layout.verticalStretchFactor: 3 }
        }
    }
    Component {
        id: translateView
        ColumnLayout {
            id: translationWorkspace
            readonly property alias modelControl: featurePicker.modelControl
            readonly property alias toolsControl: sourceImages.toolsControl
            readonly property int sourceLength: workbench.graphemeCount(root.session.draft)
            readonly property bool sourceTooLong: sourceLength > 5000
            readonly property var task: workspace.tasks.find(value => value.request.sessionID === session.id)
            property bool contextOpen: false
            readonly property string contextOwner: session.id
            onContextOwnerChanged: contextOpen = false
            readonly property bool hasContext: contextOpen || !!session.dictionaryContext
            readonly property int contextLength: workbench.graphemeCount(session.dictionaryContext || "")
            readonly property bool canLookup: !!session.draft.trim() && sourceLength <= 120 && contextLength <= 500
            readonly property bool dictionaryEmpty: session.feature === "dictionary" && !session.output && !activeTask
            function lookupEntry(output) {
                try { const entry = JSON.parse(output); return entry && typeof entry.headword === "string" && typeof entry.meaning === "string" && Array.isArray(entry.translations) ? entry : null } catch (_) { return null }
            }
            function lookupRows(saved) {
                return workspace.sessions.map((item,index) => ({item:item,index:index})).filter(record => {
                    const item = record.item
                    return item.feature === "dictionary" && !item.archived && (saved ? item.favorite : item.id !== session.id) && lookupEntry(item.output)
                }).sort((a,b) => (b.item.updated || 0) - (a.item.updated || 0) || a.index - b.index).slice(0,5).map(record => record.item)
            }
            spacing: metrics.gap
            // Review 18 language row: input ⇄ output, session model at the trailing edge.
            // Compact Glass keeps the pair and icon-only model on one row.
            GridLayout {
                objectName: "translation-language-bar"
                Layout.fillWidth: true
                columns: 2
                columnSpacing: metrics.small
                rowSpacing: metrics.tight
                RowLayout {
                    spacing: metrics.small
                    Layout.fillWidth: true
                    enabled: session.feature !== "translate" || !root.activeTask
                    LanguageButton { objectName: "translate-source-language"; shell: root; compact: translationWorkspace.width < metrics.reading; Layout.minimumWidth: 0; Layout.maximumWidth: translationWorkspace.width / 3; allowAuto: true; language: session.source; label: t("inputLanguage"); onChosen: code => command("pair", {source:code, target:session.target}) }
                    Kit.IconButton { iconName: "swap"; text: t("swap"); implicitWidth: metrics.compactControl; implicitHeight: implicitWidth; enabled: session.source !== "auto"; onClicked: command("pair", {source: session.target, target: session.source}) }
                    LanguageButton { objectName: "translate-target-language"; shell: root; compact: translationWorkspace.width < metrics.reading; Layout.minimumWidth: 0; Layout.maximumWidth: translationWorkspace.width / 3; language: session.target; label: t("outputLanguage"); onChosen: code => command("pair", {source:session.source, target:code}) }
                    Item { Layout.fillWidth: true }
                }
                SessionModelPicker {
                    id: featurePicker
                    shell: root; bridge: workbench
                    glassFeature: true
                    featureIconOnly: translationWorkspace.width < metrics.reading
                    onDeletePromptRequested: promptID => { deleteSavedPrompt.promptID = promptID; deleteSavedPrompt.open() }
                }
            }
            Kit.ProviderNotice { model: session.model; dangerColor: root.colors.danger; Layout.fillWidth: true; onOpenRequested: section => root.openSettingsSection(section); onUseRequested: model => command("model", {value: model}) }
            Kit.AnchoredPanel {
                id: comparePanel; shell: root; objectName: "compare-panel"
                desiredWidth: root.width - metrics.inset * 2
                contentItem: NamedScrollView { scrollName: t("compare"); id: compareScroll; contentWidth: availableWidth; implicitHeight: metrics.editor * 3; ScrollBar.vertical: ScrollBar { policy: compareScroll.contentHeight > compareScroll.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff; contentItem: Rectangle { implicitWidth: metrics.small; radius: width / 2; color: root.colors["text-muted"] } } ComparisonPane { width: compareScroll.availableWidth; bridge: workbench; session: root.session; shell: root } }
            }
            Kit.AnchoredPanel {
                id: stylePanel; shell: root; objectName: "translation-style-panel"
                contentItem: NamedScrollView { scrollName: t("translationOptions"); id: styleScroll; contentWidth: availableWidth; implicitHeight: styleOptions.implicitHeight; ScrollBar.vertical: ScrollBar { policy: styleScroll.contentHeight > styleScroll.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff; contentItem: Rectangle { implicitWidth: metrics.small; radius: width / 2; color: root.colors["text-muted"] } } TranslationOptions { id: styleOptions; width: styleScroll.availableWidth; bridge: workbench; session: root.session } }
            }
            // Review 18 dictionary: one search field with its lookup action, then the entry.
            Label {
                visible: translationWorkspace.dictionaryEmpty
                Accessible.role: Accessible.Heading; text: t("dictionaryAsk"); font.pointSize: Qt.application.font.pointSize * metrics.headingScale; font.weight: Font.DemiBold
                color: root.colors["text-strong"]; horizontalAlignment: Text.AlignHCenter
                Layout.fillWidth: true; Layout.topMargin: metrics.large; Layout.bottomMargin: metrics.tight
            }
            Frame {
                visible: session.feature === "dictionary"
                Layout.fillWidth: true
                Layout.maximumWidth: metrics.reading
                Layout.alignment: Qt.AlignHCenter
                implicitHeight: (translationWorkspace.dictionaryEmpty ? metrics.hero : metrics.navControl) + metrics.tight
                padding: metrics.small
                // FluentWinUI3 sets its own vertical padding on Frame; `padding` alone leaves it at 16.
                // The shorter field above a result keeps its 36 pt buttons centred.
                topPadding: Math.max(0, Math.min(metrics.small, (height - metrics.control) / 2))
                bottomPadding: topPadding
                leftPadding: metrics.gap
                rightPadding: topPadding // concentric with the capsule end
                background: Rectangle { radius: height / 2; color: root.colors["surface-subtle"]; border.width: metrics.hairline; border.color: root.colors[termDraft.activeFocus ? "border-strong" : "border"] }
                RowLayout {
                    anchors.fill: parent
                    spacing: metrics.small
                    IconImage { source: "icons/search.svg"; color: root.colors["text-muted"]; sourceSize.width: metrics.icon; sourceSize.height: metrics.icon; Accessible.ignored: true }
                    TextField {
                        id: termDraft
                        maximumLength: 2147483647
                        objectName: session.feature === "dictionary" ? "source-draft" : "dictionary-term"
                        Layout.fillWidth: true
                        text: session.draft
                        font.pointSize: Qt.application.font.pointSize * metrics.sectionScale
                        placeholderText: t("dictionaryPlaceholder")
                        Accessible.name: t("source")
                        background: null
                        selectByMouse: true
                        onTextEdited: if (text !== session.draft) command("draft", {value: text})
                        function lookupOnEnter(event) {
                            event.accepted = !inputMethodComposing && (event.modifiers & ~Qt.KeypadModifier) === Qt.NoModifier
                            if (event.accepted && !activeTask && !entryResult.chooseFirstSuggestion() && translationWorkspace.canLookup)
                                root.submit()
                        }
                        Keys.onReturnPressed: event => lookupOnEnter(event)
                        Keys.onEnterPressed: event => lookupOnEnter(event)
                        Connections { target: root; function onComposerFocusEpochChanged() { if (root.session.feature === "dictionary") termDraft.forceActiveFocus() } }
                    }
                    Label { objectName: "dictionary-term-count"; visible: translationWorkspace.sourceLength > 0; text: translationWorkspace.sourceLength + " / 120"; color: translationWorkspace.sourceLength > 120 ? root.colors.danger : root.colors["text-muted"] }
                    Kit.IconButton {
                        id: contextToggle
                        objectName: "dictionary-context-toggle"
                        iconName: "instructions"
                        text: t("dictionaryAddContext")
                        checked: translationWorkspace.hasContext
                        Accessible.selected: checked
                        ToolTip.text: t("dictionaryContextLabel") + " (" + contextShortcut.nativeText + ")"
                        onClicked: {
                            translationWorkspace.contextOpen = !translationWorkspace.contextOpen
                            if (translationWorkspace.contextOpen) contextDraft.forceActiveFocus()
                            else termDraft.forceActiveFocus()
                        }
                        Shortcut {
                            id: contextShortcut
                            sequence: "Ctrl+Shift+C"
                            enabled: contextToggle.visible && contextToggle.enabled && !root.Overlay.overlay.visible
                                     && !root.composing() && !root.activeFocusItem?.selectedText
                            onActivated: contextToggle.clicked()
                        }
                    }
                    Kit.GlassButton { visible: !!activeTask; text: t("stop"); implicitHeight: lookupButton.implicitHeight; onClicked: root.submit() }
                    Kit.PrimaryButton { id: lookupButton; objectName: "dictionary-lookup"; visible: !activeTask; text: t("lookup"); enabled: translationWorkspace.canLookup; onClicked: root.submit() }
                }
            }
            Label { visible: translationWorkspace.dictionaryEmpty && translationWorkspace.sourceLength <= 120; text: "↩ " + t("lookup") + " · " + t("dictionaryTermLimit"); color: root.colors["text-muted"]; font.pointSize: Qt.application.font.pointSize * metrics.smallScale; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.Wrap; Layout.fillWidth: true }
            RowLayout {
                visible: session.feature === "dictionary" && translationWorkspace.hasContext
                Layout.fillWidth: true
                spacing: metrics.small
                TextField {
                    id: contextDraft
                    objectName: "dictionary-context"
                    Layout.fillWidth: true
                    background: null
                    placeholderText: t("dictionaryContext")
                    Accessible.name: t("dictionaryContextLabel")
                    maximumLength: 2147483647 // The validator limits graphemes, TextField limits UTF-16 units.
                    validator: workbench.dictionaryContextValidator
                    text: session.dictionaryContext || ""
                    onTextEdited: command("dictionaryContext", {value: text})
                }
                Label { objectName: "dictionary-context-count"; text: translationWorkspace.contextLength + " / 500"; color: translationWorkspace.contextLength > 500 ? root.colors.danger : root.colors["text-muted"] }
                Kit.IconButton {
                    objectName: "dictionary-remove-context"
                    iconName: "close"
                    text: t("dictionaryRemoveContext")
                    onClicked: {
                        command("dictionaryContext", {value: ""})
                        translationWorkspace.contextOpen = false
                        termDraft.forceActiveFocus()
                    }
                }
            }
            Label { visible: session.feature === "dictionary" && translationWorkspace.sourceLength > 120; text: t("dictionaryTermLimit"); wrapMode: Text.Wrap; Layout.fillWidth: true }
            NamedScrollView {
                scrollName: t("dictionary")
                visible: session.feature === "dictionary"
                Layout.fillWidth: true
                Layout.fillHeight: true
                contentWidth: availableWidth
                ColumnLayout {
                    width: Math.min(parent.width, metrics.reading)
                    x: (parent.width - width) / 2
                    spacing: metrics.inset
                    // Centered like the other empty states (matches macOS).
                    Label { visible: !session.output && (!!activeTask); text: t(activeTask ? "lookingUp" : "dictionaryEmpty"); color: root.palette.placeholderText; wrapMode: Text.Wrap; horizontalAlignment: Text.AlignHCenter; Layout.fillWidth: true; Layout.topMargin: metrics.large }
                    GridLayout {
                        visible: translationWorkspace.dictionaryEmpty
                        Layout.fillWidth: true; Layout.topMargin: metrics.large - metrics.small
                        columns: width >= (metrics.sidebar + metrics.large * 2) * 2 + metrics.gutter ? 2 : 1
                        columnSpacing: metrics.gutter; rowSpacing: metrics.gap
                        Repeater {
                            model: [false,true]
                            ColumnLayout {
                                id: lookupGroup
                                required property bool modelData
                                readonly property var rows: translationWorkspace.lookupRows(modelData)
                                visible: rows.length > 0
                                Layout.fillWidth: true; Layout.preferredWidth: 0; Layout.alignment: Qt.AlignTop
                                spacing: 0
                                RowLayout {
                                    Layout.fillWidth: true
                                    Kit.Eyebrow { text: t(lookupGroup.modelData ? "savedWords" : "recentLookups"); Layout.fillWidth: true }
                                    Kit.QuietButton { text: t(lookupGroup.modelData ? "openLibrary" : "allHistory"); onClicked: { root.favoritesOnly = lookupGroup.modelData; root.library = true } }
                                }
                                Repeater {
                                    model: lookupGroup.rows
                                    Kit.PanelRow {
                                        id: lookupRow
                                        required property var modelData
                                        readonly property var entry: translationWorkspace.lookupEntry(modelData.output)
                                        objectName: (lookupGroup.modelData ? "dictionary-saved-" : "dictionary-recent-") + modelData.id
                                        Layout.fillWidth: true; implicitHeight: metrics.hero
                                        text: entry?.headword || root.titleFor(modelData)
                                        detail: (entry?.translations || []).map(sense => sense.text).filter(Boolean).join("; ") || entry?.meaning || ""
                                        contentItem: RowLayout {
                                            spacing: metrics.small
                                            IconImage { visible: lookupGroup.modelData; source: "icons/star.svg"; color: root.colors.warning; sourceSize.width: metrics.icon; sourceSize.height: metrics.icon; Accessible.ignored: true }
                                            ColumnLayout {
                                                Layout.fillWidth: true; Layout.minimumWidth: 0; spacing: metrics.hairline * 2
                                                Label { text: lookupRow.text; textFormat: Text.PlainText; font.weight: Font.DemiBold; elide: Text.ElideRight; Layout.fillWidth: true }
                                                Label { text: lookupRow.detail; textFormat: Text.PlainText; color: root.colors["text-muted"]; font.pointSize: Qt.application.font.pointSize * metrics.smallScale; elide: Text.ElideRight; Layout.fillWidth: true }
                                            }
                                            Label { visible: !lookupGroup.modelData; text: root.relativeTime(lookupRow.modelData.updated); color: root.colors["text-soft"]; font.pointSize: Qt.application.font.pointSize * metrics.captionScale }
                                            Kit.IconButton { visible: lookupGroup.modelData; iconName: "listen"; text: t("speak") + " " + lookupRow.text; onClicked: workbench.audio.speak(lookupRow.text, workbench.speechLanguage(lookupRow.text,lookupRow.entry.detectedSourceLang || lookupRow.modelData.source),lookupRow.modelData.id + ":headword") }
                                        }
                                        onClicked: root.choose(modelData.id)
                                    }
                                }
                            }
                        }
                    }
                    DictionaryResult { id: entryResult; snapshot: root.workspace; visible: !!session.output; Layout.fillWidth: true; output: session.output; bridge: workbench; shell: root }
                }
            }
            Kit.Card {
                Accessible.name: t("translate")
                id: translationCard
                visible: session.feature !== "dictionary"
                padding: 0
                clip: true
                Binding { target: translationCard.background; property: "visible"; value: false }
                Layout.fillWidth: true
                Layout.fillHeight: true
            GridLayout {
                id: panes
                objectName: "translation-panes"
                uniformCellWidths: true
                anchors.fill: parent
                // Review 18 stacks the editors below the reading width (its 820 px preview).
                columns: session.feature === "dictionary" ? 1 : width >= metrics.reading ? 2 : 1
                columnSpacing: metrics.inset
                rowSpacing: metrics.inset
                Frame {
                    objectName: "translation-source-pane"
                    Accessible.role: Accessible.Grouping
                    Accessible.name: t("source")
                    padding: metrics.inset
                    background: Item { Kit.FlatCard { objectName: "translation-source-surface"; anchors.fill: parent } }
                    Layout.fillWidth: true
                    Layout.fillHeight: session.feature !== "dictionary"
                    Layout.preferredWidth: 0
                    Layout.minimumWidth: 0
                    ColumnLayout {
                        anchors.fill: parent
                        RowLayout {
                            Layout.minimumHeight: metrics.control
                            Label { Accessible.role: Accessible.Heading; text: t(session.feature === "dictionary" ? "lookup" : "source"); font.bold: true; Layout.fillWidth: true }
                            Label { text: lang(session.source); color: root.palette.placeholderText }
                        }
                        NamedScrollView {
                            scrollName: t("source")
                            contentWidth: availableWidth
                            Layout.fillWidth: true; Layout.fillHeight: session.feature !== "dictionary"
                            Layout.preferredHeight: session.feature === "dictionary" ? metrics.control * 2 : metrics.editor
                            TextArea {
                                id: sourceDraft
                                objectName: session.feature === "dictionary" ? "panel-source-draft" : "source-draft"
                                Connections { target: root; function onComposerFocusEpochChanged() { sourceDraft.forceActiveFocus() } }
                                Component.onCompleted: if (root.composerFocusEpoch > 0) forceActiveFocus()
                                text: session.draft; font.pointSize: root.readingPointSize; placeholderText: t("sourcePlaceholder"); wrapMode: TextEdit.Wrap; selectByMouse: true; background: null; Accessible.name: t("source")
                                verticalAlignment: TextEdit.AlignTop
                                onTextChanged: if (text !== session.draft) command("draft", {value: text})
                                Keys.onReturnPressed: event => root.submitKey(event, inputMethodComposing)
                                Keys.onEnterPressed: event => root.submitKey(event, inputMethodComposing)
                            }
                        }
                        Rectangle { Layout.fillWidth: true; implicitHeight: metrics.hairline; color: root.colors.border }
                        AttachmentChips { Layout.fillWidth: true }
                        RowLayout {
                            id: sourceActions
                            Layout.minimumHeight: metrics.control
                            spacing: metrics.small
                            ImageControls { id: sourceImages; compact: true; visible: session.feature === "translate" }
                            AudioControls { compact: true }
                            ListenButton { visible: !!session.draft.trim(); shell: root; display: AbstractButton.IconOnly; sources: [{id:session.id + ":source", title:t("source"), text:session.draft, language:workbench.speechLanguage(session.draft,session.source)}] }
                            Label { objectName: "translate-count"; text: Number(translationWorkspace.sourceLength).toLocaleString(Qt.locale(workspace.locale), "f", 0) + " / 5 000"; color: translationWorkspace.sourceTooLong ? root.colors.danger : root.palette.placeholderText; elide: Text.ElideRight; Layout.fillWidth: true }
                            Kit.QuietButton {
                                objectName: "translation-clear"; text: t("clearSource"); icon.source: "icons/close.svg"
                                visible: session.feature === "translate" && !!session.draft && !activeTask
                                display: sourceActions.width >= metrics.sidebar + metrics.editor ? AbstractButton.TextBesideIcon : AbstractButton.IconOnly
                                ToolTip.visible: hovered; ToolTip.text: text
                                onClicked: { command("draft", {sessionID: session.id, value: ""}); sourceDraft.forceActiveFocus() }
                            }
                            Kit.GlassButton { visible: !!activeTask; text: t("stop"); onClicked: root.submit() }
                            Kit.PrimaryButton { objectName: "translate-submit"; shortcutText: "Ctrl+Enter"; visible: !activeTask; text: t(session.feature === "dictionary" ? "lookup" : "translateText"); display: sourceActions.width < metrics.sidebar + metrics.editor ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; icon.source: "icons/" + (session.feature === "dictionary" ? "search" : "translate") + ".svg"; enabled: !translationWorkspace.sourceTooLong && (!!session.draft.trim() || (session.feature === "translate" && (session.images || []).length > 0)); onClicked: root.submit() }
                        }
                        Label { visible: translationWorkspace.sourceTooLong; text: t("sourceTooLong"); color: root.colors.danger; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    }
                }
                Frame {
                    objectName: "translation-result-pane"
                    Accessible.role: Accessible.Grouping
                    Accessible.name: t("result")
                    padding: metrics.inset
                    background: Rectangle {
                        objectName: "translation-result-surface"
                        color: root.solidChrome ? surfaceAppearance.reading : root.colors["surface-subtle"]
                        border.width: metrics.hairline
                        border.color: root.solidChrome ? surfaceAppearance.edge : root.colors.border
                        topLeftRadius: metrics.chromeCardRadius
                        topRightRadius: metrics.chromeCardRadius
                        bottomRightRadius: metrics.chromeCardRadius
                        bottomLeftRadius: metrics.chromeCardRadius
                    }
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.preferredWidth: 0
                    Layout.minimumWidth: 0
                    ColumnLayout {
                        anchors.fill: parent
                        RowLayout {
                            Layout.minimumHeight: metrics.control
                            Label { Accessible.role: Accessible.Heading; text: t("result"); font.bold: true; Layout.fillWidth: true }
                            Kit.GlassButton { id: styleTrigger; visible: session.feature === "translate"; flat: true; text: t("style_" + (session.translationStyle || "general")); contentItem: RowLayout { spacing: metrics.tight; Label { text: styleTrigger.text; color: styleTrigger.palette.buttonText; Accessible.ignored: true } Kit.Chevron {} } Accessible.name: t("translationOptions") + ", " + text; ToolTip.visible: hovered && !stylePanel.visible; ToolTip.text: t("translationOptions"); popupOpen: stylePanel.visible; onClicked: stylePanel.openAt(styleTrigger) }
                        }
                        NamedScrollView {
                            scrollName: t("result")
                            visible: session.feature !== "dictionary" && !(session.images || []).length
                            contentWidth: availableWidth
                            Layout.fillWidth: true; Layout.fillHeight: true
                            TextArea { Accessible.ignored: !!activeTask; objectName: "translation-result-text"; visible: session.feature !== "dictionary"; text: session.output; font.pointSize: root.readingPointSize; placeholderText: t(activeTask ? "translating" : "emptyResult"); readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; Accessible.name: t("result")
                                verticalAlignment: TextEdit.AlignTop
                            }
                        }
                        ImageTranslationView {
                            visible: session.feature === "translate" && (session.images || []).length > 0
                            Layout.fillWidth: true; Layout.fillHeight: true
                            bridge: workbench; session: root.session
                        }
                        Rectangle { objectName: "translation-result-rule"; Layout.fillWidth: true; implicitHeight: metrics.hairline; color: root.solidChrome ? surfaceAppearance.edge : root.colors.border }
                        RowLayout {
                            id: translationActions
                            objectName: "translation-actions"
                            Layout.minimumHeight: metrics.control
                            Label { text: lang(session.target); color: root.palette.placeholderText; Layout.fillWidth: true }
                            Kit.GlassButton { visible: session.feature === "dictionary"; text: t(session.favorite ? "savedWord" : "saveWord"); checkable: true; checked: !!session.favorite; onClicked: command("favorite") }
                            Kit.QuietButton {
                                objectName: "translation-use-as-source"; text: t("useAsSource"); icon.source: "icons/back.svg"
                                visible: session.feature === "translate" && !!session.output && !activeTask && !(session.images || []).length
                                display: translationActions.width >= metrics.sidebar + metrics.editor ? AbstractButton.TextBesideIcon : AbstractButton.IconOnly
                                ToolTip.visible: hovered; ToolTip.text: text
                                onClicked: {
                                    root.useResultAsSource()
                                    sourceDraft.forceActiveFocus()
                                }
                            }
                            Kit.QuietButton { objectName: "translate-compare"; enabled: !activeTask; onEnabledChanged: if (!enabled && comparePanel.visible) comparePanel.close(); visible: session.feature === "translate" && !(session.images || []).length; text: t("compare"); icon.source: "icons/compare.svg"; icon.color: root.colors.text; display: translationActions.width < metrics.sidebar + metrics.editor ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; ToolTip.visible: hovered && !comparePanel.visible; ToolTip.text: text; popupOpen: comparePanel.visible; onClicked: comparePanel.openAt(this) }
                            ListenButton { objectName: "translate-listen"; shell: root; display: translationActions.width < metrics.sidebar + metrics.editor ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; sources: [{id:session.id + ":translation", title:t("result"), text:root.speechText(), language:session.target}, {id:session.id + ":source", title:t("source"), text:session.draft, language:workbench.speechLanguage(session.draft, session.source)}] }
                            Kit.QuietButton { text: t("copy"); icon.source: "icons/copy.svg"; icon.color: root.colors.text; display: translationActions.width < metrics.sidebar + metrics.editor ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; enabled: !!session.output; onClicked: { workbench.copy((session.images || []).length ? workbench.imageTranslationText(session.output) : session.output); root.notify(t("copied")) } }
                        }
                    }
                }
            }
                // Outline drawn above both panes so their fills never hide it.
            }
            RetryNotice { Layout.fillWidth: true }
        }
    }
    Component {
        id: homeView
        HomeWorkspace {
            snapshot: root.workspace
            bridge: workbench
            dangerColor: root.colors.danger
            onStart: feature => { root.selectRoute(feature); if (feature !== "interpret") { root.command("new"); root.composerFocusEpoch++ } }
            onHabitActivated: action => root.activateHabit(action)
            onResume: sessionID => root.choose(sessionID)
            onSettings: root.selectRoute("settings")
        }
    }
    Component {
        id: applicationsView
        ApplicationsWorkspace { bridge: workbench; onNotification: (message, error, level, key) => root.notify(message, null, error, level, key) }
    }
    Component {
        id: interpretationView
        InterpretationWorkspace { snapshot: root.workspace; bridge: workbench; shell: root; dangerColor: root.colors.danger; onOpenSettings: section => root.openSettingsSection(section); onNotification: (message, error, level, key) => root.notify(message, null, error, level, key) }
    }
    Component {
        id: thermalView
        ThermalWorkspace { bridge: workbench; dangerColor: root.colors.danger }
    }
    Component {
        id: desktopView
        DesktopWorkspace { snapshot: root.workspace; bridge: workbench; route: root.systemRoute; onRouteRequested: value => root.selectRoute(value); onNewTranslation: { root.selectRoute("translate"); root.command("new"); root.composerFocusEpoch++ } }
    }

    Component {
        id: settingsView
        SettingsWorkspace { workspace: root.workspace; bridge: workbench; searchAnchor: settingsHeaderSearch; onFeedback: (message, error) => root.notify(message, null, error); dangerColor: root.colors.danger; query: root.settingsQuery; requestedSection: root.settingsSection; onQueryEdited: value => root.settingsQuery = value; onSectionOpened: root.settingsSection = ""; onRouteRequested: route => root.selectRoute(route) }
    }
    component HistoryList: ListView {
        id: historyList
        Accessible.role: Accessible.List
        Accessible.name: t("history")
        property bool preview: false
        clip: true
        model: root.historyRecords
        currentIndex: root.historyRecords.findIndex(item => item.id === (preview ? previewID : quickID))
        spacing: 0
        section.property: preview ? "bucket" : ""
        section.delegate: Kit.Eyebrow {
            required property string section
            width: historyList.width
            height: metrics.compactControl
            leftPadding: metrics.gap
            verticalAlignment: Text.AlignVCenter
            text: root.t((root.archivedHistory ? "archivedGroup_" : "group_") + section).toUpperCase()
        }
        Keys.onDownPressed: event => { if (!root.composing()) { root.moveHistory(historyList, 1); event.accepted = true } }
        Keys.onUpPressed: event => { if (!root.composing()) { root.moveHistory(historyList, -1); event.accepted = true } }
        Keys.onReturnPressed: event => { if (!root.composing()) { const id = preview ? previewID : quickID; if (id) root.choose(id); event.accepted = true } }
        Keys.onDeletePressed: event => { if (preview && !root.composing() && previewID) { root.removeHistory(previewID); event.accepted = true } }
        Keys.onPressed: event => { if (event.key === Qt.Key_Backspace && preview && !root.composing() && previewID) { root.removeHistory(previewID); event.accepted = true } }
        delegate: ItemDelegate {
            id: historyRow
            required property var modelData
            width: historyList.width
            text: titleFor(modelData)
            implicitHeight: metrics.control + metrics.inset
            ToolTip.visible: hovered && rowTitle.truncated
            ToolTip.text: text
            highlighted: modelData.id === (historyList.preview ? previewID : quickID)
            padding: metrics.small
            background: Item {
                Kit.GlassLens { anchors.fill: parent; visible: historyRow.highlighted || historyRow.hovered; hover: !historyRow.highlighted; radius: metrics.radius }
                Rectangle { anchors.fill: parent; color: "transparent"; radius: metrics.radius; border.width: historyRow.visualFocus ? metrics.focusRingWidth : 0; border.color: root.colors.action }
            }
            Accessible.name: text + (modelData.id === session.id ? ", " + t("currentSession") : "")
            Accessible.role: historyList.preview ? Accessible.ListItem : Accessible.Button
            Accessible.selected: highlighted
            contentItem: ColumnLayout {
                spacing: metrics.hairline * 2
                RowLayout {
                    Label { visible: !historyList.preview && historyRow.modelData.id === session.id; text: "✓"; color: root.colors["action-text"]; Accessible.ignored: true }
                    IconImage { visible: root.library && !root.historyFeature; source: "icons/" + (historyRow.modelData.feature === "translate" ? "translate" : historyRow.modelData.feature === "dictionary" ? "dictionary" : "chat") + ".svg"; sourceSize.width: metrics.icon; sourceSize.height: metrics.icon; color: root.colors["action-text"]; Accessible.ignored: true }
                    Label { id: rowTitle; text: titleFor(historyRow.modelData); color: root.colors.text; font.weight: historyRow.modelData.id === session.id || historyRow.highlighted ? Font.DemiBold : Font.Normal; elide: Text.ElideRight; Layout.fillWidth: true }
                }
                RowLayout {
                    Label { objectName: "history-snippet"; text: (root.historySnippet(historyRow.modelData)).replace(/\s+/g, " "); maximumLineCount: 1; color: root.colors["text-muted"]; font.pointSize: Qt.application.font.pointSize * metrics.smallScale; elide: Text.ElideRight; Layout.fillWidth: true }
                    Label { text: root.archivedHistory && root.library ? (historyRow.modelData.feature === "chat" ? root.tpl("turnsCount", {n: historyRow.modelData.messages.filter(message => message.role === "user").length}) : "") : root.relativeTime(historyRow.modelData.updated); color: root.colors["text-soft"]; font.pointSize: Qt.application.font.pointSize * metrics.captionScale }
                }
            }
            onClicked: { if (historyList.preview) { previewID = modelData.id; historyList.forceActiveFocus() } else choose(modelData.id) }
        }
        ColumnLayout {
            anchors.centerIn: parent; width: Math.max(0, parent.width - metrics.inset * 2)
            visible: historyList.count === 0
            IconImage { visible: !!root.historyQuery.trim(); source: "icons/search.svg"; sourceSize.width: metrics.icon; sourceSize.height: metrics.icon; color: root.colors["text-muted"]; Layout.alignment: Qt.AlignHCenter; Accessible.ignored: true }
            Label { objectName: "history-empty-message"; text: !root.historyQuery.trim() ? t(root.archivedHistory ? "historyArchivedEmpty" : "historyEmpty") : t("noHistory"); wrapMode: Text.Wrap; horizontalAlignment: Text.AlignHCenter; Layout.fillWidth: true }
            Label { visible: !!root.historyQuery; text: t("historyNoMatchesHint"); wrapMode: Text.Wrap; color: root.colors["text-muted"]; horizontalAlignment: Text.AlignHCenter; Layout.fillWidth: true }
        }
        ScrollBar.vertical: ScrollBar { Accessible.name: t("history") }
    }
    component SearchHistory: Kit.SearchField {
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
            if (root.historyRecords.some(item => item.id === (targetList.preview ? previewID : quickID))) root.choose(targetList.preview ? previewID : quickID)
            event.accepted = true
        }
        Keys.onReturnPressed: event => acceptResult(event)
        Keys.onEnterPressed: event => acceptResult(event)
    }
    Component {
        id: glassLibraryView
        GridLayout {
            id: glassLibrary
            objectName: "history-library"
            readonly property bool wide: width >= metrics.reading
            columns: wide ? 2 : 1
            columnSpacing: metrics.gutter
            rowSpacing: metrics.gap
            Keys.onEscapePressed: event => { event.accepted = !root.composing(); if (event.accepted) root.library = false }
            ColumnLayout {
                Layout.fillWidth: true; Layout.fillHeight: true
                Layout.preferredWidth: glassLibrary.wide ? metrics.sidebar + metrics.editor : -1
                Layout.maximumWidth: glassLibrary.wide ? metrics.sidebar + metrics.editor : Infinity
                Layout.minimumWidth: glassLibrary.wide ? metrics.sidebar + metrics.editor : 0
                Layout.maximumHeight: glassLibrary.wide ? Infinity : glassLibrary.height * metrics.skeletonShort
                spacing: metrics.small
                Kit.FilterGroup {
                    objectName: "history-feature-filter"
                    Layout.fillWidth: true
                    currentIndex: ["", "chat", "translate", "dictionary"].indexOf(root.historyFeature)
                    onSelectionChanged: index => { root.historyFeature = ["", "chat", "translate", "dictionary"][index]; root.favoritesOnly = false }
                    Kit.FilterButton { text: root.t("historyAll") }
                    Kit.FilterButton { text: root.t("chat"); enabled: workbench.moduleEnabled("chat") }
                    Kit.FilterButton { text: root.t("translate"); enabled: workbench.moduleEnabled("translate") }
                    Kit.FilterButton { text: root.t("dictionary"); enabled: workbench.moduleEnabled("dictionary") }
                }
                Kit.FilterGroup {
                    visible: root.historyFeature === "dictionary"
                    currentIndex: root.favoritesOnly ? 1 : 0
                    onSelectionChanged: index => root.favoritesOnly = index === 1
                    Kit.FilterButton { text: root.t("recentLookups") }
                    Kit.FilterButton { text: root.t("savedWords") }
                }
                RowLayout {
                    Layout.fillWidth: true
                    SearchHistory { id: glassLibrarySearch; targetList: glassHistory; compact: true; Layout.fillWidth: true; Component.onCompleted: forceActiveFocus() }
                    Kit.QuietButton { objectName: "history-archive-filter"; glassMaterial: false; text: root.t("archiveSession"); icon.source: "icons/archive.svg"; icon.color: palette.buttonText; implicitHeight: metrics.compactControl; checkable: true; checked: root.archivedHistory; Accessible.name: root.t("archivedSessions"); onToggled: root.archivedHistory = checked; palette.buttonText: checked ? root.colors.action : root.colors.text; palette.base: root.colors["chrome-item-active"] }
                }
                HistoryList { id: glassHistory; objectName: "history-records"; preview: true; Layout.fillWidth: true; Layout.fillHeight: true }
            }
            Item {
                id: glassPreview
                objectName: "history-preview"
                readonly property var selected: root.historyRecords.find(item => item.id === previewID)
                readonly property bool selectedBusy: !!selected && root.workspace.tasks.some(task => task.request.sessionID === selected.id && task.status === "running")
                Layout.fillWidth: true; Layout.fillHeight: true
                Rectangle { objectName: "history-preview-divider"; visible: glassLibrary.wide; x: -glassLibrary.columnSpacing / 2; width: metrics.hairline; height: parent.height; color: root.colors.border }
                Label { objectName: "history-preview-empty"; visible: !glassPreview.selected; anchors.centerIn: parent; width: Math.max(0, parent.width - metrics.inset * 2); text: root.t("chooseHistory"); color: root.colors["text-muted"]; horizontalAlignment: Text.AlignHCenter; elide: Text.ElideRight }
                ColumnLayout {
                anchors.fill: parent
                spacing: metrics.gap
                Label { Accessible.role: Accessible.Heading; visible: !!glassPreview.selected; text: glassPreview.selected ? root.titleFor(glassPreview.selected) : ""; font.pointSize: Qt.application.font.pointSize * metrics.titleScale; font.weight: Font.DemiBold; elide: Text.ElideRight; Layout.fillWidth: true }
                Label {
                    visible: !!glassPreview.selected
                    Layout.fillWidth: true; wrapMode: Text.Wrap
                    color: root.colors["text-muted"]; font.pointSize: Qt.application.font.pointSize * metrics.smallScale
                    text: !glassPreview.selected ? "" : [root.archivedHistory ? root.t("archivedSessions") : "", root.modelLabel(glassPreview.selected.model), glassPreview.selected.feature === "chat" ? root.tpl("turnsCount", {n: glassPreview.selected.messages.filter(message => message.role === "user").length}) : root.lang(glassPreview.selected.source) + " → " + root.lang(glassPreview.selected.target), root.archivedHistory ? root.tpl("archivedAgo", {time: root.relativeTime(glassPreview.selected.archivedAt || glassPreview.selected.updated)}) : root.relativeTime(glassPreview.selected.updated)].filter(Boolean).join(" · ")
                }
                RowLayout {
                    id: historyActions
                    objectName: "history-preview-actions"
                    visible: !!glassPreview.selected
                    Layout.fillWidth: true
                    Layout.minimumWidth: 0
                    spacing: metrics.tight
                    readonly property bool compact: root.compact || glassPreview.width < renameAction.expandedWidth + exportAction.expandedWidth + archiveAction.expandedWidth + deleteAction.expandedWidth + openAction.expandedWidth + spacing * 5
                    Kit.QuietButton { id: renameAction; objectName: "history-rename"; glassMaterial: false; display: historyActions.compact ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; icon.source: "icons/edit.svg"; text: root.t("rename"); ToolTip.visible: hovered; ToolTip.text: text; enabled: !!glassPreview.selected; popupOpen: renameDialog.visible; onClicked: { renameDialog.ownerID = previewID; renameInput.text = glassPreview.selected.title; renameDialog.open() } }
                    Kit.QuietButton { id: exportAction; objectName: "history-export"; glassMaterial: false; display: historyActions.compact ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; icon.source: "icons/export.svg"; text: root.t("exportSession"); ToolTip.visible: hovered; ToolTip.text: text; enabled: !!glassPreview.selected; popupOpen: sessionExport.visible; onClicked: { sessionExport.ownerID = previewID; sessionExport.open() } }
                    Kit.QuietButton { id: archiveAction; objectName: "history-archive"; glassMaterial: false; display: historyActions.compact ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; icon.source: root.archivedHistory ? "icons/restore.svg" : "icons/archive.svg"; text: root.t(root.archivedHistory ? "restoreSession" : "archiveSession"); ToolTip.visible: hovered; ToolTip.text: text; enabled: !!glassPreview.selected; onClicked: root.archiveHistory(previewID, !root.archivedHistory) }
                    Kit.QuietButton { id: deleteAction; objectName: "history-delete"; glassMaterial: false; display: historyActions.compact ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; icon.source: "icons/delete.svg"; icon.color: enabled ? root.colors.danger : palette.placeholderText; text: root.t(root.archivedHistory ? "deletePermanently" : "deleteSession"); palette.buttonText: root.colors.danger; ToolTip.visible: hovered; ToolTip.text: text; enabled: !!glassPreview.selected && !glassPreview.selectedBusy; onClicked: root.removeHistory(previewID) }
                    Item { Layout.fillWidth: true }
                    Kit.PrimaryButton { id: openAction; objectName: "history-open"; display: historyActions.compact ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; icon.source: "icons/open.svg"; text: root.t("open"); ToolTip.visible: hovered; ToolTip.text: text; enabled: !!glassPreview.selected && !root.archivedHistory; onClicked: root.choose(previewID) }
                }
                Rectangle { visible: !!glassPreview.selected; Layout.fillWidth: true; implicitHeight: metrics.hairline; color: root.colors.border }
                ChatTranscript {
                    snapshot: root.workspace
                    visible: glassPreview.selected?.feature === "chat"
                    bridge: workbench; session: glassPreview.selected || {id: "", messages: []}
                    readingPointSize: root.readingPointSize
                    preview: true
                    Layout.fillWidth: true; Layout.fillHeight: true
                }
                NamedScrollView {
                    scrollName: t("history")
                    id: detailScroll
                    visible: !!glassPreview.selected && glassPreview.selected.feature !== "chat"
                    Layout.fillWidth: true; Layout.fillHeight: true
                    contentWidth: availableWidth
                    ColumnLayout {
                        width: detailScroll.availableWidth
                        spacing: metrics.inset
                        Pane {
                            visible: glassPreview.selected?.feature === "translate"
                            Layout.fillWidth: true
                            padding: metrics.inset
                            background: Kit.FlatCard {}
                            contentItem: ColumnLayout {
                                Kit.Eyebrow { text: root.t("source") + " · " + root.lang(glassPreview.selected?.source || "auto"); Layout.fillWidth: true }
                                TextArea { text: glassPreview.selected?.draft || ""; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; Layout.fillWidth: true; Accessible.name: root.t("source") }
                            }
                        }
                        TextArea {
                            visible: glassPreview.selected?.feature === "translate"
                            text: glassPreview.selected?.output || root.t("emptyResult"); readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; Layout.fillWidth: true; Accessible.name: root.t("result")
                        }
                        DictionaryResult { snapshot: root.workspace; visible: glassPreview.selected?.feature === "dictionary"; session: glassPreview.selected; output: glassPreview.selected?.output || ""; bridge: workbench; shell: root; Layout.fillWidth: true; Layout.preferredHeight: metrics.editor * 2 }
                        RowLayout {
                            visible: glassPreview.selected?.feature === "translate"
                            Kit.QuietButton { text: root.t("copy"); enabled: !!glassPreview.selected?.output; onClicked: { workbench.copy(glassPreview.selected.output); root.notify(root.t("copied")) } }
                            Kit.QuietButton { text: root.t("listen"); enabled: !!glassPreview.selected?.output; onClicked: workbench.audio.speak(glassPreview.selected.output, glassPreview.selected.target) }
                        }
                    }
                }
                Item { visible: !glassPreview.selected; Layout.fillHeight: true }
                }
            }
        }
    }
    GlassDialog {
        id: deleteHistory
        objectName: "history-delete-dialog"
        parent: Overlay.overlay
        anchors.centerIn: parent
        width: Math.min(metrics.notificationInline, root.width - metrics.inset * 2)
        property string ownerID: ""
        Label { text: root.titleFor(root.workspace.sessions.find(item => item.id === deleteHistory.ownerID) || {}); wrapMode: Text.Wrap; width: parent.width }
        title: root.t("deletePermanentlyConfirm")
        modal: true
        closePolicy: root.composing() ? 0 : Popup.CloseOnEscape
        standardButtons: Dialog.Ok | Dialog.Cancel
        onOpened: {
            const accept = standardButton(Dialog.Ok)
            if (accept) { accept.text = root.t("deletePermanently"); accept.glassMaterial = false; accept.highlighted = true; accept.palette.highlight = root.colors.danger; accept.palette.button = root.colors.danger; accept.palette.highlightedText = root.colors["action-fg"]; accept.palette.buttonText = root.colors["action-fg"] }
        }
        onAccepted: { root.command("deleteArchived", {sessionID: ownerID}); if (!root.workspace.sessions.some(item => item.id === ownerID) && !workbench.storageError) root.notify(root.t("sessionDeleted")) }
    }
    Popup {
        id: history
        padding: metrics.inset
        background: Kit.ReadingPanelSurface {}
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
                Label { Accessible.role: Accessible.Heading; text: t("history"); font.bold: true; Layout.fillWidth: true }
                ShellButton { objectName: "history-close"; iconName: "close"; text: t("close"); onClicked: history.close() }
            }
            SearchHistory { id: historySearch; targetList: quickHistory; Layout.fillWidth: true }
            HistoryList { id: quickHistory; Layout.fillWidth: true; Layout.fillHeight: true }
            Rectangle { Layout.fillWidth: true; implicitHeight: metrics.hairline; color: root.colors.border }
            // Review 18: a quiet link row, not a second bordered button.
            Kit.GlassButton {
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
        background: Kit.ReadingPanelSurface {}
        objectName: "activity-panel"
        onOpened: activityClose.forceActiveFocus()
        parent: Overlay.overlay
        x: Math.max(metrics.inset, root.width - width - metrics.inset)
        y: shellHeader.height
        width: Math.min(metrics.sidebar + metrics.editor, root.width - metrics.inset * 2)
        height: Math.min(activityHeading.implicitHeight + metrics.small + activityItems.implicitHeight + padding * 2, root.height - y - metrics.inset)
        modal: false
        focus: true
        closePolicy: Popup.CloseOnPressOutside | (root.composing() ? 0 : Popup.CloseOnEscape)
        onClosed: root.restoreOverlayFocus()
        ColumnLayout {
            anchors.fill: parent
            spacing: metrics.small
            RowLayout {
                id: activityHeading
                Layout.fillWidth: true
                Label { Accessible.role: Accessible.Heading; objectName: "activity-title"; text: root.activityRows.length + (workbench.interpretation.busy ? 1 : 0) > 0 ? root.tpl("activityCount", {count: root.activityRows.length + (workbench.interpretation.busy ? 1 : 0)}) : t("activity"); font.bold: true; Layout.fillWidth: true }
                ShellButton { id: activityClose; objectName: "activity-close"; iconName: "close"; text: t("close"); onClicked: activity.close() }
            }
            NamedScrollView {
                scrollName: t("activity")
                id: activityScroll
                objectName: "activity-scroll"
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.preferredHeight: activityItems.implicitHeight
                contentWidth: availableWidth
                contentHeight: activityItems.implicitHeight
                ColumnLayout {
                    id: activityItems
                    width: activityScroll.availableWidth
                    Label { visible: root.activityRows.length === 0 && !workbench.interpretation.busy; text: t("noTasks") }
                    Frame {
                        visible: workbench.interpretation.busy
                        Layout.fillWidth: true
                        background: Kit.FlatCard {}
                        ColumnLayout {
                            anchors.fill: parent
                            Label { text: root.t("interpret") + " · " + root.t(workbench.interpretation.listening ? "listening" : "running"); Layout.fillWidth: true; wrapMode: Text.Wrap }
                            RowLayout {
                                Kit.QuietButton { text: root.t("open"); onClicked: root.selectRoute("interpret") }
                                Kit.QuietButton { text: root.t("stop"); palette.buttonText: root.colors.danger; onClicked: workbench.interpretation.listening ? workbench.interpretation.stop() : workbench.interpretation.cancel() }
                            }
                        }
                    }
                    Repeater {
                        // One row per task: build them only while the panel is open.
                        model: activity.visible ? root.activityRows : []
                        delegate: Frame {
                            required property var modelData
                            readonly property var task: modelData.tasks[0]
                            readonly property var target: root.workspace.sessions.find(item => item.id === modelData.id)
                            readonly property bool running: modelData.tasks.some(item => item.status === "running")
                            readonly property bool failed: modelData.tasks.some(item => item.status === "failed")
                            objectName: "activity-row-" + modelData.id
                            Layout.fillWidth: true
                            background: Kit.FlatCard {}
                            ColumnLayout {
                                anchors.fill: parent
                                RowLayout {
                                    Kit.StatusDot { tone: running ? "ready" : failed ? "failed" : "idle"; failedColor: root.colors.danger }
                                    Label { text: target ? root.titleFor(target) : root.t("noContent"); elide: Text.ElideRight; Layout.fillWidth: true }
                                    Label { text: modelData.comparison ? root.tpl("activityCompare", {count: modelData.tasks.length, done: modelData.tasks.filter(item => item.status === "succeeded").length, total: modelData.tasks.length}) : root.t(task.status); color: failed ? root.colors.danger : root.colors["text-muted"]; font.pointSize: Qt.application.font.pointSize * metrics.smallScale; Layout.maximumWidth: activity.width * metrics.skeletonShort; elide: Text.ElideRight }
                                }
                                RowLayout {
                                    Kit.QuietButton { text: root.t("open"); enabled: !!target && !target.archived; onClicked: root.choose(modelData.id) }
                                    Kit.QuietButton {
                                        visible: running || (!modelData.comparison && task.status !== "succeeded")
                                        text: root.t(running ? "stop" : "retry")
                                        palette.buttonText: running ? root.colors.danger : root.colors["action-text"]
                                        enabled: !!target && (running || (!target.archived && !root.workspace.tasks.some(item => item.request.sessionID === target.id && item.status === "running") && (target.feature === "chat" || target.revision === task.request.revision)))
                                        onClicked: { if (running) { for (const item of modelData.tasks) if (item.status === "running") root.command("cancel", {taskID: item.id}) } else root.command("retry", {taskID: task.id}) }
                                    }
                                }
                            }
                            ToolTip.visible: taskHover.hovered
                            ToolTip.text: modelData.tasks.map(item => item.request.model).join("\n")
                            HoverHandler { id: taskHover }
                        }
                    }
                }
            }
        }
    }
    Popup {
        id: navigationOverlay
        Binding { target: navigationOverlay.background; property: "visible"; value: false }
        dim: true
        Overlay.modeless: Rectangle { color: Qt.alpha(root.colors["text-strong"], root.metrics.selectionOpacity) }
        objectName: "navigation-overlay"
        parent: Overlay.overlay
        y: shellHeader.height
        width: metrics.sidebar + metrics.small * 2
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
            commandsOpen: commands.visible
            onCommands: opener => root.execute("commands", opener)
            onDismissed: navigationOverlay.close()
        }
    }
    Popup {
        id: commands
        padding: metrics.inset
        background: Kit.ReadingPanelSurface {}
        objectName: "command-palette"
        parent: Overlay.overlay
        width: Math.min(metrics.dialog, root.width - metrics.inset * 2)
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
        function run(id) { root.runPaletteEntry(id) }
        ColumnLayout {
            Accessible.name: t("commands")
            Accessible.role: Accessible.Dialog
            anchors.fill: parent
            Kit.SearchField {
                id: commandSearch
                objectName: "command-search"
                Layout.fillWidth: true
                placeholderText: t("commandSearch")
                rightPadding: commandEscape.implicitWidth + metrics.small * 2
                Kit.KeyCap { id: commandEscape; text: "Esc"; anchors.right: parent.right; anchors.rightMargin: metrics.small; anchors.verticalCenter: parent.verticalCenter; Accessible.ignored: true }
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
                objectName: "command-list"
                Accessible.role: Accessible.List
                Accessible.name: t("commands")
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                model: root.commandEntries
                section.property: "group"
                section.delegate: Kit.Eyebrow { required property string section; text: root.t(section).toUpperCase(); height: section ? metrics.compactControl : 0; visible: !!section; verticalAlignment: Text.AlignVCenter; leftPadding: metrics.gap }
                delegate: ItemDelegate {
                    id: commandItem
                    required property var modelData
                    required property int index
                    width: commandList.width - (commandScrollBar.visible ? commandScrollBar.width : 0)
                    implicitHeight: metrics.navControl
                    text: modelData.label || t(modelData.title)
                    Accessible.role: Accessible.Button
                    Accessible.name: text
                    highlighted: index === root.commandIndex
                    Accessible.selected: highlighted
                    // Label, not the default content item: titles such as "Nhiệt độ & quạt"
                    // must not turn "&" into a mnemonic. Selection matches settings navigation.
                    contentItem: RowLayout {
                        spacing: metrics.small
                        IconImage { source: "icons/" + commandItem.modelData.icon + ".svg"; color: commandItem.highlighted ? palette.link : palette.text; sourceSize.width: metrics.icon; sourceSize.height: metrics.icon; Layout.preferredWidth: metrics.icon; Layout.preferredHeight: metrics.icon; Accessible.ignored: true }
                        Label { text: commandItem.text; color: root.colors.text; font.bold: commandItem.highlighted; elide: Text.ElideRight; Layout.fillWidth: true; Accessible.ignored: true }
                        Kit.KeyCap { visible: !!commandItem.modelData.shortcut && !(commandItem.modelData.id === "settings" && Qt.platform.os !== "osx"); text: (Qt.platform.os === "osx" ? "⌘" : "Ctrl+") + commandItem.modelData.shortcut; Accessible.ignored: true }
                    }
                    background: Item {
                        Kit.GlassLens { anchors.fill: parent; visible: commandItem.highlighted || commandItem.hovered; hover: !commandItem.highlighted; radius: metrics.radius }
                        Rectangle { anchors.fill: parent; color: "transparent"; radius: metrics.radius; border.width: commandItem.visualFocus ? metrics.focusRingWidth : 0; border.color: root.colors.action }
                    }
                    onClicked: commands.run(modelData.id)
                }
                Label { anchors.centerIn: parent; visible: !commandList.count; text: t("noCommands") }
                ScrollBar.vertical: ScrollBar {
                    Accessible.name: t("commands")
                    id: commandScrollBar
                    objectName: "command-scrollbar"
                    policy: commandList.contentHeight > commandList.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff
                    palette.mid: root.colors["text-muted"]
                    palette.dark: root.colors.text
                }
            }
        }
    }

    Column {
        id: toastStack
        z: 100
        anchors.right: parent.right
        anchors.rightMargin: metrics.inset
        y: shellHeader.mapToItem(parent, 0, shellHeader.height).y + metrics.small
        width: Math.min(metrics.notificationInline, root.width - primaryNavigation.width - metrics.inset * 2)
        spacing: metrics.small
        readonly property bool paused: {
            if (toastHover.hovered) return true
            for (let item = root.activeFocusItem; item; item = item.parent)
                if (item === toastStack) return true
            return false
        }
        HoverHandler { id: toastHover; blocking: false }
        Keys.onEscapePressed: event => {
            const newest = root.toasts[root.toasts.length - 1]
            event.accepted = !!newest
            if (newest) root.dismissToast(newest.id)
        }
        // Keep surviving delegates (and their focus and timers) when the JS array changes.
        ListModel {
            id: toastRows
            function sync() {
                for (let i = count - 1; i >= 0; --i) {
                    const id = get(i).toastId
                    if (!root.toasts.some(item => item.id === id)) remove(i)
                }
                for (const item of root.toasts.slice(count))
                    insert(0, {toastId: item.id, message: item.text, level: item.level, hasUndo: !!item.undo})
            }
            Component.onCompleted: sync()
        }
        Connections { target: root; function onToastsChanged() { toastRows.sync() } }
        Repeater {
            model: toastRows
            delegate: Pane {
                id: toast
                required property int toastId
                required property string message
                required property string level
                required property bool hasUndo
                objectName: "shell-toast-" + toastId
                width: parent.width
                padding: metrics.gap
                background: Kit.ReadingPanelSurface {
                    Rectangle {
                        anchors.fill: parent
                        radius: parent.radius
                        color: "transparent"
                        visible: toast.level === "danger"
                        border.width: metrics.hairline
                        border.color: Qt.alpha(root.colors.danger, metrics.selectionOpacity)
                        Accessible.ignored: true
                    }
                }
                NumberAnimation on opacity { from: 0; to: 1; duration: metrics.durationFast * 1000 }
                transform: Translate { y: surfaceAppearance.reduceMotion ? 0 : (toast.opacity - 1) * metrics.small }
                Accessible.role: level === "danger" || level === "warning" ? Accessible.AlertMessage : Accessible.StatusBar
                Accessible.name: message
                contentItem: RowLayout {
                    IconImage {
                        source: "icons/" + (toast.level === "info" ? "about" : toast.level) + ".svg"
                        color: root.colors[toast.level === "info" ? "action-text" : toast.level]
                        sourceSize.width: metrics.icon; sourceSize.height: metrics.icon
                        Accessible.ignored: true
                    }
                    Label { text: toast.message; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Kit.QuietButton {
                        objectName: toast.hasUndo ? "toast-undo" : ""; visible: toast.hasUndo
                        text: root.t("undo"); activeFocusOnTab: true
                        onClicked: {
                            const action = root.toasts.find(item => item.id === toast.toastId)?.undo
                            root.dismissToast(toast.toastId)
                            if (action) action()
                        }
                    }
                    Kit.IconButton { iconName: "close"; text: root.t("close"); activeFocusOnTab: true; onClicked: root.dismissToast(toast.toastId) }
                }
                Timer {
                    objectName: "toast-timer"
                    interval: 1000 * (toast.hasUndo ? metrics.toastActionSeconds
                                      : toast.level === "warning" ? metrics.toastWarningSeconds : metrics.toastBriefSeconds)
                    running: toast.level !== "danger" && !toastStack.paused
                    onTriggered: root.dismissToast(toast.toastId)
                }
            }
        }
    }

    // W5b update sheet
    property alias updatePresentation: updateSheet
    UpdateSheet { id: updateSheet; bridge: workbench }
    Binding { target: launcher; property: "quickSessionID"; value: panels.chatID }
    Connections {
        target: launcher
        function onOpenRouteRequested(route) { root.selectRoute(route); root.show(); root.raise(); root.requestActivate() }
        function onOpenSettingsRequested(sectionID) { root.openSettingsSection(sectionID); root.show(); root.raise(); root.requestActivate() }
    }
    Connections { target: panels; function onOpenRouteRequested(route) { if (route === "settings") root.openSettingsSection("providers"); else root.selectRoute(route); root.show(); root.raise(); root.requestActivate() } }
}

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
    readonly property var metrics: workbench.resources.metrics
    readonly property bool darkMode: workspace.appearance?.preset === "midnight" || workspace.appearance?.mode === "dark" || (workspace.appearance?.mode !== "light" && workspace.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
    readonly property var colors: workbench.resources.themePalettes[(workspace.appearance?.preset || "graphite") + ":" + (workspace.appearance?.accent || "auto")][darkMode ? "dark" : "light"]
    readonly property bool glassChrome: workspace.appearance?.preset === "glass"
    readonly property bool lightGlass: glassChrome && !darkMode
    readonly property bool nativeWindowHeader: Qt.platform.os !== "osx" && glassChrome
    readonly property real workspaceGutter: compact ? metrics.gap : metrics.inset
    palette.window: colors["sidebar-bg"]
    // Keep light Glass reading, composer and popup surfaces opaque.
    palette.base: lightGlass ? Qt.tint(colors["sidebar-bg"], colors.surface) : colors.surface
    palette.alternateBase: lightGlass ? Qt.tint(colors["sidebar-bg"], colors.canvas) : colors.canvas
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
    property var composerPopup: null
    property int composerFocusEpoch: 0
    property string commandQuery: ""
    property int commandIndex: 0
    readonly property var commandEntries: {
        const entries = workbench.resources.commands.filter(item =>
        (!workbench.loadBlocked || ["settings", "activity"].includes(item.id)) &&
        (item.id !== "history" || (!home && !settings && !library)) &&
        (["new", "history", "activity", "navigation", "settings"].includes(item.id) || workbench.moduleEnabled(item.id)) && normalize(t(item.title)).includes(normalize(commandQuery.trim())))
        .map(item => Object.assign({}, item, {group: ["new", "history", "activity", "navigation"].includes(item.id) ? "paletteGroupActions" : "paletteGroupPages"}))
        // QV4 sort is not stable for equal group keys. Preserve catalog order
        // within each group, including the ten real page commands.
        return root.glassChrome ? entries.filter(item => item.group === "paletteGroupPages").concat(entries.filter(item => item.group === "paletteGroupActions")) : entries
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
        const previous = overlayOpener
        const switching = history.visible || activity.visible || navigationOverlay.visible || commands.visible || (composerPopup && composerPopup.visible)
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
    readonly property int runningCount: activityRows.filter(row => row.tasks.some(task => task.status === "running")).length + (workbench.interpretation.busy ? 1 : 0)
    readonly property bool workspacePage: home || ["everywhere", "apps", "thermal", "utilities"].includes(systemRoute)
    property bool favoritesOnly: false
    property bool archivedHistory: false
    property string historyQuery: ""
    property string previewID: ""
    property string quickID: ""
    property string historyFeature: workspace.feature
    onLibraryChanged: if (library) historyFeature = workspace.feature
    readonly property var historyRecords: glassChrome
        ? (workspace, workbench.history(historyQuery, library && archivedHistory, library ? (historyFeature ? [historyFeature] : []) : [workspace.feature]))
            .filter(item => !library || !favoritesOnly || item.feature !== "dictionary" || !!item.favorite)
            .map(item => Object.assign({}, item, {bucket: historyBucket(library && archivedHistory ? (item.archivedAt || item.updated) : item.updated)}))
        : root.workspace.sessions.filter(matches)
    readonly property var recentSessions: (workspace, workbench.history("", false, [])).filter(item => item.id !== session.id).slice(0, 3)
    readonly property var activityRows: {
        let result = [], groups = {}
        for (const task of workspace.tasks) {
            const target = workspace.sessions.find(item => item.id === task.request.sessionID)
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
    Connections { target: workbench; function onChanged() { if (root.exportingFile && workbench.storageError === "exportError") root.exportFailed = true } }
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
    function notify(text, undo, error) {
        toasts = toasts.concat([{id: ++toastSequence, text: text, undo: undo || null, error: !!error}]).slice(-3)
    }
    function dismissToast(id) { toasts = toasts.filter(item => item.id !== id) }
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
        if (!historyRecords.some(item => item.id === quickID)) quickID = historyRecords[0]?.id || ""
        if (!historyRecords.some(item => item.id === previewID)) previewID = historyRecords[0]?.id || ""
    }
    width: metrics.sidebar + metrics.reading + metrics.gutter * 2
    height: metrics.reading
    minimumWidth: metrics.minWindowWidth
    minimumHeight: metrics.minWindowHeight
    // System pages (Interpretation, Apps, Thermal…) share the settings shell but keep their own name.
    title: (Qt.platform.os === "osx" ? "Viezan Native — " : "") + t(home ? "home" : settings ? (systemRoute || "settings") : root.workspace.feature)
    color: glassChrome ? colors["app-bg"] : palette.base
    // Liquid Glass 2.0: the lit scene behind every layer, light and dark.
    background: Kit.AppBackdrop { visible: root.glassChrome }
    function t(key) { return workbench.resources.locales[root.workspace.locale][key] || key }
    function command(name, payload) { workbench.command(name, payload || {}) }
    function titleFor(item) { return item.title || t(item.feature === "chat" ? "newChat" : item.feature === "dictionary" ? "newLookup" : "newTranslation") }
    function lang(code) { return t("lang_" + code) }
    // Delegates to Kit.ModelLabel so every view formats model IDs the same way.
    Kit.ModelLabel { id: modelFormatter; visible: false }
    function modelLabel(id) { return glassChrome ? workbench.shortModelName(id) : modelFormatter.format(id) }
    function speechText() {
        if (session.feature === "chat") return session.messages.filter(message => message.role === "assistant").slice(-1)[0]?.text || ""
        if (session.feature === "dictionary") { try { const entry = JSON.parse(session.output); return entry.headword + ". " + entry.meaning } catch (_) { return "" } }
        return (session.images || []).length ? workbench.imageTranslationText(session.output) : session.output
    }
    function matches(item) {
        const normalize = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d")
        return (!root.library || !root.favoritesOnly || item.feature !== "dictionary" || !!item.favorite) && !item.comparisonParent && item.feature === root.workspace.feature && !!item.archived === (root.library && root.archivedHistory) && normalize(titleFor(item) + " " + item.draft + " " + item.output + " " + item.messages.map(message => message.text).join(" ")).includes(normalize(historyQuery.trim()))
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
    // macOS keeps the system menu. Other platforms register window shortcuts
    // independently of the hidden menu, with the same action enabled rules.
    component ShellAction: Action {
        id: shellAction
        property var keySequence
        shortcut: Qt.platform.os === "osx" ? keySequence : ""
        property Shortcut windowShortcut: Shortcut {
            sequence: shellAction.keySequence
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
        // `.btn.glass` pill 32; "new" (`.tint`) keeps clear glass and reads accent text.
        font.weight: root.glassChrome ? (primary ? Font.DemiBold : Font.Medium) : Font.Normal
        background: Rectangle {
            radius: root.glassChrome ? height / 2 : metrics.surfaceRadius
            color: root.glassChrome ? (shellButton.enabled ? "transparent" : root.colors["surface-subtle"]) : shellButton.primary ? Qt.tint(shellButton.palette.base, Qt.alpha(shellButton.palette.highlight, metrics.selectionOpacity)) : shellButton.hovered ? shellButton.palette.alternateBase : "transparent"
            Kit.ControlGlassSurface {
                anchors.fill: parent
                visible: root.glassChrome && shellButton.enabled
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
                border.width: metrics.hairline
                border.color: shellButton.palette.highlight
            }
            border.width: (!root.glassChrome && shellButton.visualFocus) || (root.glassChrome && !shellButton.enabled) ? metrics.hairline : 0
            border.color: shellButton.visualFocus ? shellButton.palette.highlight : root.glassChrome ? root.colors.border : shellButton.palette.midlight
        }
        implicitWidth: showsLabel ? implicitContentWidth + leftPadding + rightPadding : root.glassChrome ? metrics.compactControl : metrics.control
        implicitHeight: root.glassChrome ? metrics.compactControl : metrics.control
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
            opacity: root.glassChrome && navigationOverlay.visible ? 0 : 1
            enabled: !navigationOverlay.visible
            expanded: !root.compact && !root.navigationCollapsed
            // Glass reserves the `small` window margin to the left of the pane.
            Layout.preferredWidth: (expanded ? metrics.sidebar : metrics.rail) + (root.glassChrome ? metrics.small : 0)
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
                objectName: "shell-header"
                // With an OS title bar, Glass owns one full-width header row.
                Layout.leftMargin: root.nativeWindowHeader ? -primaryNavigation.width : 0
                Layout.fillWidth: true
                implicitHeight: metrics.navControl + metrics.small
                Binding { target: shellHeader; property: "leftPadding"; value: 0; when: root.nativeWindowHeader; restoreMode: Binding.RestoreBindingOrValue }
                Binding { target: shellHeader; property: "rightPadding"; value: 0; when: root.nativeWindowHeader; restoreMode: Binding.RestoreBindingOrValue }
                background: Item {
                    Rectangle { anchors.fill: parent; color: root.glassChrome ? "transparent" : root.palette.base }
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
                    anchors.leftMargin: root.nativeWindowHeader ? metrics.inset : root.glassChrome ? metrics.gap + metrics.inset : metrics.gutter
                    anchors.rightMargin: root.glassChrome ? metrics.gap : metrics.inset
                    Binding { target: headerRow; property: "spacing"; value: metrics.gap; when: root.nativeWindowHeader; restoreMode: Binding.RestoreBindingOrValue }
                    // macOS retains the sidebar toggle; the OS-frame header starts at inset.
                    ShellButton { id: navigationTrigger; visible: root.nativeWindowHeader || root.compact || root.navigationCollapsed; objectName: "navigation-toggle"; iconName: primaryNavigation.expanded ? "collapse" : "expand"; text: t(primaryNavigation.expanded ? "collapseNavigation" : "expandNavigation"); onClicked: execute("navigation", this) }
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
                        Label { text: t("workspace"); color: root.glassChrome ? root.colors["chrome-fg-muted"] : root.palette.placeholderText; Accessible.ignored: true }
                        Label { text: "/"; color: root.glassChrome ? root.colors["chrome-fg-muted"] : root.palette.placeholderText; Accessible.ignored: true }
                        Label { text: t(root.home ? "home" : root.systemRoute); font.bold: true; elide: Text.ElideRight; Layout.fillWidth: true; Accessible.ignored: true }
                    }
                    // Glass splits feature titles too: muted feature, strong session.
                    RowLayout {
                        visible: !root.workspacePage && root.glassChrome && !settings && !library
                        spacing: metrics.small
                        Layout.fillWidth: true
                        Accessible.role: Accessible.Heading
                        Accessible.name: t(root.workspace.feature) + " / " + titleFor(session)
                        Label { text: t(root.workspace.feature); color: root.colors["chrome-fg-muted"]; Accessible.ignored: true }
                        Label { text: "/"; visible: root.width >= metrics.reading; color: root.colors["chrome-fg-muted"]; Accessible.ignored: true }
                        Label { text: titleFor(session); visible: root.width >= metrics.reading; font.bold: true; elide: Text.ElideRight; Layout.fillWidth: true; Accessible.ignored: true }
                    }
                    Label { visible: !root.workspacePage && !(root.glassChrome && !settings && !library); text: settings ? t(root.systemRoute || "settings") : library ? t("history") : t(root.workspace.feature) + " / " + titleFor(session); elide: Text.ElideRight; Layout.fillWidth: true; font.bold: true; Accessible.role: Accessible.Heading }
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
                    ShellButton { id: interpretHistoryTrigger; visible: root.systemRoute === "interpret"; showsLabel: !root.compact; iconName: "history"; text: t("history"); ToolTip.visible: hovered && !root.composerPopup?.visible; enabled: !workbench.interpretation.busy; onClicked: contentLoader.item?.openHistory?.(interpretHistoryTrigger) }
                    ShellButton { visible: root.systemRoute === "interpret"; showsLabel: !root.compact; primary: true; iconName: "new"; text: t("newInterpretation"); enabled: !workbench.interpretation.busy; onClicked: workbench.interpretation.clearSelection() }
                    Rectangle { visible: root.systemRoute === "interpret"; color: root.glassChrome ? root.colors["border-strong"] : root.palette.midlight; implicitWidth: metrics.hairline; implicitHeight: root.glassChrome ? metrics.inset + metrics.hairline * 2 : metrics.compactControl }
                    ShellButton { visible: !home && !settings && !library && root.workspace.feature === "translate"; showsLabel: !root.compact; iconName: "image"; text: t("addImage"); enabled: !workbench.loadBlocked && !(root.session.images || []).length; onClicked: { imagePicker.ocr = false; imagePicker.ownerID = root.session.id; imagePicker.open() } }
                    ShellButton { visible: !home && !settings && !library && root.workspace.feature === "dictionary"; showsLabel: !root.compact; iconName: "dictionary"; text: t("savedWords"); enabled: !workbench.loadBlocked; onClicked: { root.favoritesOnly = true; root.library = true } }
                    ShellButton { id: historyTrigger; showsLabel: !root.compact; visible: !home && !settings && !library; iconName: "history"; text: t("history"); enabled: !workbench.loadBlocked; onClicked: execute("history", this) }
                    ShellButton { showsLabel: !root.compact; primary: true; visible: !home && !settings && !library; iconName: "new"; text: t(root.workspace.feature === "chat" ? "newChat" : root.workspace.feature === "dictionary" ? "newLookup" : "newTranslation"); enabled: !workbench.loadBlocked; onClicked: execute("new", this) }
                    Rectangle { visible: (!home && !settings && !library) || (root.glassChrome && root.workspacePage && workbench.moduleEnabled("utilities")); color: root.glassChrome ? root.colors["border-strong"] : root.palette.midlight; implicitWidth: metrics.hairline; implicitHeight: root.glassChrome ? metrics.inset + metrics.hairline * 2 : metrics.compactControl }
                    ShellButton { id: activityTrigger; showsLabel: !root.compact; iconName: "activity"; text: t("activity") + (root.runningCount ? " · " + root.runningCount : ""); onClicked: execute("activity", this) }
                }
            }
            Rectangle { visible: !root.glassChrome; color: root.palette.midlight; implicitHeight: metrics.hairline; Layout.fillWidth: true }
        Pane {
            objectName: "reading-pane"
            Layout.fillWidth: true
            Layout.fillHeight: true
            // `.content` (Glass): the one warm reading pane, gap from the navigation pane and
            // the window edge, small from the header and the bottom.
            Layout.leftMargin: root.glassChrome ? metrics.gap : metrics.gutter
            Layout.rightMargin: Layout.leftMargin
            Layout.topMargin: root.glassChrome ? metrics.small : metrics.gutter
            Layout.bottomMargin: root.glassChrome ? metrics.small : metrics.gutter
            padding: root.glassChrome ? metrics.gutter - metrics.gap : 0
            background: Kit.GlassPane {
                visible: root.glassChrome
                startRole: "canvas"; endRole: "canvas"
                shadowRole: "shadow-sm-color"
                borderRole: root.darkMode ? "border" : "material-border"
            }
            contentItem: ColumnLayout {
            spacing: root.glassChrome ? 0 : metrics.gap
            Pane {
                visible: workbench.storageError.length > 0
                Layout.fillWidth: true
                padding: root.glassChrome ? metrics.tight : 0
                background: Rectangle { color: root.glassChrome ? Qt.alpha(root.colors.danger, metrics.selectionOpacity) : "transparent" }
                contentItem: RowLayout {
                    Label { text: t(workbench.storageError); wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Kit.GlassButton { flat: root.glassChrome; glassMaterial: !root.glassChrome; text: t(workbench.loadBlocked ? "retryLoad" : "retrySave"); onClicked: workbench.loadBlocked ? workbench.reload() : workbench.save() }
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
                padding: root.glassChrome ? metrics.tight : 0
                background: Rectangle { color: root.glassChrome ? Qt.alpha(root.colors["tone-green"], metrics.selectionOpacity) : "transparent" }
                contentItem: RowLayout {
                    Label { text: t("interpret") + " · " + t(workbench.interpretation.listening ? "listening" : "running"); Layout.fillWidth: true; wrapMode: Text.Wrap }
                    Kit.QuietButton { text: t("open"); onClicked: root.selectRoute("interpret") }
                    Kit.QuietButton { text: t("stop"); palette.buttonText: root.colors.danger; onClicked: workbench.interpretation.listening ? workbench.interpretation.stop() : workbench.interpretation.cancel() }
                }
            }
            RowLayout {
                objectName: "shell-reset-notice"
                visible: root.glassChrome && !root.home && !root.settings && !root.library && root.workspace.feature !== "chat" && workbench.resetNotice.feature === root.workspace.feature
                Layout.fillWidth: true
                Label { text: root.t("resetNotice"); font.pointSize: Qt.application.font.pointSize * metrics.smallScale; color: root.colors["text-muted"]; Layout.fillWidth: true; wrapMode: Text.Wrap }
                Kit.QuietButton { objectName: "reset-reopen"; text: root.t("reopenPrevious"); onClicked: workbench.reopenPrevious() }
                Kit.IconButton { iconName: "close"; text: root.t("close"); onClicked: workbench.dismissResetNotice() }
            }
            Loader {
                id: contentLoader
                Layout.topMargin: root.glassChrome ? metrics.gap : 0
                Layout.fillWidth: true
                Layout.fillHeight: true
                enabled: settings || !workbench.loadBlocked
                sourceComponent: home ? homeView : settings ? (systemRoute === "apps" ? applicationsView : systemRoute === "interpret" ? interpretationView : systemRoute === "thermal" ? thermalView : systemRoute === "utilities" || systemRoute === "everywhere" ? desktopView : settingsView) : library ? (root.glassChrome ? glassLibraryView : libraryView) : root.workspace.feature === "chat" ? chatView : translateView
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
            Label { visible: root.glassChrome; text: t("historyRenameHint"); wrapMode: Text.Wrap; Layout.fillWidth: true }
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
            objectName: imageControls.glassChat ? "chat-tools-trigger" : ""
            // This opens a menu, it does not toggle chat configuration. Keep
            // configuration indicated by the icon; focus belongs to visualFocus.
            readonly property bool configured: (root.session.chatMode || "text") !== "text" || !!root.session.systemPrompt
            Binding { target: attachmentButton; property: "icon.color"; when: imageControls.glassChat; value: attachmentButton.configured ? root.colors.action : root.colors.text }
            onClicked: {
                if (imageControls.glassChat) {
                    toolsPanel.keyboardInvocation = visualFocus
                    root.showComposerPanel(toolsPanel, attachmentButton)
                } else attachmentMenu.open()
            }
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
        Popup {
            id: toolsPanel
            objectName: "chat-tools-panel"
            parent: Overlay.overlay
            property string ownerID: ""
            property bool keyboardInvocation: false
            property real openerTop: 0
            property real openerLeft: 0
            width: Math.min(metrics.sidebar + metrics.editor, root.width - metrics.inset * 2)
            height: Math.min(toolsBody.implicitHeight + topPadding + bottomPadding, Math.max(metrics.control, openerTop - metrics.small - metrics.inset))
            x: Math.max(metrics.inset, Math.min(openerLeft, root.width - width - metrics.inset))
            y: openerTop - height - metrics.small
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
            Connections { target: root; function onSessionChanged() { if (toolsPanel.visible && toolsPanel.ownerID !== root.session.id) toolsPanel.close() } function onGlassChromeChanged() { toolsPanel.close() } function onActiveFocusItemChanged() { toolsPanel.revealFocus() } function onWidthChanged() { if (toolsPanel.visible) Qt.callLater(toolsPanel.positionFromOpener) } function onHeightChanged() { if (toolsPanel.visible) Qt.callLater(toolsPanel.positionFromOpener) } }
            function positionFromOpener() { const point = attachmentButton.mapToItem(parent, 0, 0); openerTop = point.y; openerLeft = point.x }
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
            ScrollView {
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
                    RowLayout {
                        Layout.fillWidth: true; spacing: metrics.small
                        IconImage { Layout.leftMargin: metrics.gap; source: "icons/reasoning.svg"; sourceSize.width: metrics.icon; sourceSize.height: metrics.icon; color: root.colors.action; Accessible.ignored: true }
                        Label { text: root.t("carefulReasoning"); Layout.fillWidth: true; elide: Text.ElideRight; Accessible.ignored: true }
                        Switch { objectName: "chat-tools-reasoning"; Layout.rightMargin: metrics.gap; implicitHeight: metrics.navControl; checked: !!root.session.carefulReasoning; Accessible.name: root.t("carefulReasoning"); onToggled: root.command("carefulReasoning", {sessionID: toolsPanel.ownerID, value: checked}) }
                    }
                    Kit.PanelRow { objectName: "chat-instructions-trigger"; text: root.t("systemPrompt"); iconName: "instructions"; disclosure: true; detail: (root.workspace.prompts || []).find(item => item.text === root.session.systemPrompt)?.name || (root.session.systemPrompt ? root.t("customInstruction") : root.t("noInstruction")); Layout.fillWidth: true; onClicked: root.showComposerPanel(instructionsPanel, attachmentButton) }
                    Rectangle { Layout.fillWidth: true; Layout.topMargin: metrics.tight; Layout.bottomMargin: metrics.tight; implicitHeight: metrics.hairline; color: root.colors.border }
                    Kit.PanelRow { text: root.t("listen"); iconName: "listen"; Layout.fillWidth: true; enabled: !!root.speechText().trim(); onClicked: { toolsPanel.close(); workbench.audio.speak(root.speechText(), workbench.speechLanguage(root.speechText(), root.workspace.locale)) } }
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
            ScrollView {
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
            ScrollView {
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
            BusyIndicator { visible: running; running: workbench.audio.busy; implicitWidth: metrics.control; implicitHeight: metrics.control }
            Kit.GlassButton { text: t("stop"); visible: workbench.audio.busy; onClicked: workbench.audio.cancel() }
        }
        Label { text: workbench.audio.error ? t(workbench.audio.error) : ""; visible: !!text; wrapMode: Text.Wrap; Layout.maximumWidth: metrics.sidebar }
        Kit.GlassButton { text: t("insertTranscript"); visible: !!workbench.pendingTranscript; onClicked: workbench.insertTranscript() }
    }
    component LanguagePicker: Kit.GlassComboBox {
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
            model: root.glassChrome ? root.session.images || [] : []
            delegate: Item {
                required property var modelData
                width: root.glassChrome ? metrics.hero + metrics.small : metrics.editor
                height: root.glassChrome ? metrics.hero + metrics.small : metrics.control
                Image { visible: root.glassChrome; anchors.fill: parent; source: "image://attachments/" + modelData.id; sourceSize.width: parent.width; sourceSize.height: parent.height; fillMode: Image.PreserveAspectFit; Accessible.name: modelData.name }
                Label { visible: !root.glassChrome; anchors.fill: parent; text: modelData.name; elide: Text.ElideRight }
                Kit.IconButton { anchors.top: parent.top; anchors.right: parent.right; iconName: "close"; text: t("removeAttachment") + " " + modelData.name; implicitWidth: root.glassChrome ? metrics.icon : metrics.compactControl; implicitHeight: implicitWidth; onClicked: workbench.command("removeImage", {sessionID: root.session.id, imageID: modelData.id}) }
            }
        }
        Repeater {
            model: !root.glassChrome ? root.session.images || [] : []
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
            readonly property bool groupedEmpty: root.glassChrome && !(root.session.messages || []).length && !root.activeTask
            spacing: metrics.gap
            Item { visible: chatWorkspace.groupedEmpty; Layout.fillHeight: true; Layout.preferredHeight: 0; Layout.verticalStretchFactor: 2 }
            ChatTranscript {
                id: transcript
                bridge: workbench
                session: root.session
                readingPointSize: root.readingPointSize
                onNotification: (text, error) => root.notify(text, null, error)
                onImageExportRequested: (url, image) => root.announceExport(url, function() { workbench.exportImage(url, image) })
                Layout.leftMargin: root.glassChrome ? metrics.gap : 0
                Layout.rightMargin: Layout.leftMargin
                Layout.fillWidth: true
                Layout.fillHeight: !chatWorkspace.groupedEmpty
                Layout.preferredHeight: chatWorkspace.groupedEmpty ? emptyHeight : -1
            }
            RetryNotice { visible: !root.glassChrome && !!lastTask && ["failed", "interrupted", "cancelled"].includes(lastTask.status); Layout.fillWidth: true }
            // Same column as the composer it warns about; never a frame around it.
            Kit.ProviderNotice { visible: !root.glassChrome && (workbench.providersEmpty || unavailable); model: session.model; dangerColor: root.colors.danger; Layout.fillWidth: true; Layout.maximumWidth: metrics.reading; Layout.alignment: Qt.AlignHCenter; onOpenRequested: section => root.openSettingsSection(section); onUseRequested: model => command("model", {value: model}) }
            RowLayout {
                id: chatNotice
                objectName: "chat-provider-notice"
                readonly property string availability: (workbench.localModels, workbench.providersChecked, workbench.availability(root.session.model))
                readonly property bool unavailable: availability !== "available" && availability !== "unknown"
                readonly property bool imageMissing: root.session.chatMode === "image" && !(workbench.localModels, workbench.imageProvider(root.session.model))
                readonly property bool reset: workbench.resetNotice.feature === root.session.feature
                readonly property string kind: workbench.providersEmpty ? "empty" : unavailable ? "unavailable" : imageMissing ? "image" : reset ? "reset" : ""
                visible: root.glassChrome && !!kind
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
                readonly property bool singleRow: root.glassChrome && width >= oneRowMinimum && !(session.images || []).length && !chatDraft.text.includes("\n") && draftMeasure.advanceWidth <= inlineEditorWidth - metrics.small * 2
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
                padding: root.glassChrome ? metrics.small : metrics.inset
                background: Item {
                    Rectangle { anchors.fill: parent; visible: !root.glassChrome; color: root.palette.base; radius: metrics.surfaceRadius; border.width: metrics.hairline; border.color: chatDraft.activeFocus ? root.palette.mid : root.palette.midlight }
                    Kit.ChromeSurface {
                        anchors.fill: parent
                        visible: root.glassChrome
                        radius: composer.singleRow ? (metrics.control + metrics.inset) / 2 : metrics.chromeSurfaceRadius
                        fillColor: root.darkMode ? root.colors["surface-raised"] : Qt.alpha(root.colors["material-highlight"], 0.92)
                        illuminatedFill: false
                        fillHighlight: fillColor
                        edgeColor: root.colors["material-border"]
                        edgeHighlight: root.colors["material-highlight"]
                    }
                    Rectangle { anchors.fill: parent; visible: root.glassChrome && chatDraft.activeFocus; color: "transparent"; radius: composer.singleRow ? (metrics.control + metrics.inset) / 2 : metrics.chromeSurfaceRadius; border.width: metrics.hairline; border.color: root.colors["border-strong"]; Accessible.ignored: true }
                }
                Layout.fillWidth: true
                Layout.maximumWidth: metrics.reading
                Layout.leftMargin: root.glassChrome ? metrics.gap : 0
                Layout.rightMargin: Layout.leftMargin
                Layout.alignment: Qt.AlignHCenter
                TextMetrics { id: draftMeasure; font: chatDraft.font; text: chatDraft.text }
                GridLayout {
                    id: composerGrid
                    anchors.fill: parent
                    columns: 6
                    columnSpacing: metrics.small
                    Binding { target: composerGrid; property: "rowSpacing"; value: metrics.small; when: root.glassChrome }
                    AttachmentChips { Layout.row: 0; Layout.column: 0; Layout.columnSpan: 6; Layout.fillWidth: true }
                    ScrollView {
                        id: draftScroll
                        objectName: "chat-draft-scroll"
                        contentWidth: availableWidth
                        Layout.row: 1
                        Layout.column: composer.singleRow ? 1 : 0
                        Layout.columnSpan: composer.singleRow ? 1 : 6
                        Layout.fillWidth: true
                        Layout.preferredHeight: root.glassChrome ? (composer.singleRow ? metrics.control : composer.editorHeight()) : Math.min(metrics.editor, Math.max(metrics.composerMinimum - metrics.control - metrics.inset, chatDraft.contentHeight + metrics.small))
                        TextArea {
                            id: chatDraft
                            objectName: "chat-draft"
                            Connections { target: root; function onComposerFocusEpochChanged() { chatDraft.forceActiveFocus() } }
                            Component.onCompleted: if (root.composerFocusEpoch > 0) forceActiveFocus()
                            text: session.draft
                            font.pointSize: root.readingPointSize
                            placeholderText: t(root.glassChrome && (session.chatMode || "text") !== "text" ? "promptMode_" + session.chatMode : "prompt")
                            wrapMode: TextEdit.Wrap
                            selectByMouse: true
                            background: null
                            Accessible.name: t("draft")
                            onTextChanged: if (text !== session.draft) command("draft", {value: text})
                            Keys.onReturnPressed: event => root.submitKey(event, inputMethodComposing)
                            Keys.onEnterPressed: event => root.submitKey(event, inputMethodComposing)
                        }
                    }
                    ImageControls { compact: true; glassChat: root.glassChrome; Layout.row: composer.singleRow ? 1 : 2; Layout.column: 0; Layout.alignment: Qt.AlignBottom }
                    Pane {
                        id: composerTools
                        padding: 0
                        Layout.row: composer.singleRow ? 1 : 2
                        Layout.column: composer.singleRow ? 2 : 1
                        Layout.columnSpan: 2
                        Layout.alignment: Qt.AlignBottom
                        background: Kit.ControlGlassSurface {
                            visible: root.glassChrome
                            radius: metrics.control / 2
                        }
                        RowLayout {
                            spacing: metrics.small
                            SessionModelPicker {
                                shell: root; bridge: workbench
                                compact: true; glassChat: root.glassChrome
                                onDeletePromptRequested: promptID => { deleteSavedPrompt.promptID = promptID; deleteSavedPrompt.open() }
                            }
                            Rectangle { visible: root.glassChrome; implicitWidth: metrics.hairline; implicitHeight: metrics.inset + metrics.hairline * 2; color: root.colors.border }
                            AudioControls { compact: true; glassChat: root.glassChrome }
                        }
                    }
                    // Image mode names who will draw, regardless of the chat model.
                    Label {
                        visible: !root.glassChrome && (session.chatMode || "text") !== "text"
                        Layout.row: root.glassChrome ? 3 : 2
                        Layout.column: root.glassChrome ? 0 : 3
                        Layout.columnSpan: root.glassChrome ? 6 : 1
                        Layout.fillWidth: root.glassChrome
                        wrapMode: Text.Wrap
                        text: t("chatMode_" + (session.chatMode || "text")) + (session.chatMode === "image" ? " · " + ((workbench.localModels, workbench.imageProvider(session.model)) === "openai" ? "OpenAI" : workbench.imageProvider(session.model) === "gemini" ? "Gemini" : t("imageProviderNone")) : "")
                        color: root.palette.link
                    }
                    Item { visible: !composer.singleRow; Layout.row: 2; Layout.column: 4; Layout.fillWidth: true }
                    Kit.GlassButton {
                        id: sendButton
                        glassMaterial: false
                        objectName: "chat-send"
                        Layout.row: composer.singleRow ? 1 : 2
                        Layout.column: 5
                        Layout.alignment: Qt.AlignBottom
                        implicitHeight: metrics.control
                        implicitWidth: root.glassChrome ? metrics.control : implicitContentWidth + leftPadding + rightPadding
                        leftPadding: root.glassChrome ? 0 : metrics.inset
                        rightPadding: leftPadding
                        text: t(activeTask ? "stop" : "send")
                        enabled: !!activeTask || !!session.draft.trim() || (["chat", "translate"].includes(session.feature) && (session.images || []).length > 0)
                        Accessible.name: text
                        ToolTip.visible: hovered
                        ToolTip.text: text
                        contentItem: Item {
                            implicitWidth: sendLabel.implicitWidth
                            implicitHeight: sendLabel.implicitHeight
                            readonly property color foreground: !sendButton.enabled ? root.colors["text-disabled"] : activeTask ? root.colors.danger : root.colors["action-fg"]
                            Label { id: sendLabel; anchors.fill: parent; visible: !root.glassChrome; text: sendButton.text; Accessible.ignored: true; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter; color: parent.foreground }
                            // Existing chevron becomes an upward send arrow; Stop is
                            // a solid square. Both retain the named native button.
                            Item {
                                visible: root.glassChrome
                                anchors.centerIn: parent
                                width: metrics.icon; height: width
                                IconImage { anchors.centerIn: parent; visible: !activeTask; source: "icons/back.svg"; rotation: 90; sourceSize.width: metrics.icon; sourceSize.height: metrics.icon; color: parent.parent.foreground; Accessible.ignored: true }
                                Rectangle { visible: !activeTask; width: metrics.hairline * 2; height: metrics.gap; x: (parent.width - width) / 2; y: metrics.small; radius: metrics.hairline; color: parent.parent.foreground; Accessible.ignored: true }
                                Rectangle { anchors.centerIn: parent; visible: !!activeTask; width: metrics.icon - metrics.small; height: width; radius: metrics.hairline; color: parent.parent.foreground; Accessible.ignored: true }
                            }
                        }
                        background: Rectangle {
                            radius: root.glassChrome ? height / 2 : metrics.controlRadius
                            color: !sendButton.enabled ? root.colors["surface-subtle"] : activeTask ? root.colors["surface-raised"] : root.colors.action
                            gradient: root.glassChrome && sendButton.enabled && !activeTask ? sendGradient : null
                            Gradient { id: sendGradient; GradientStop { position: 0; color: root.colors["action-fill-top"] } GradientStop { position: 1; color: root.colors["action-fill-bottom"] } }
                            border.width: sendButton.visualFocus || (root.glassChrome && !!activeTask) ? metrics.hairline : 0
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
            Item { visible: chatWorkspace.groupedEmpty; Layout.fillHeight: true; Layout.preferredHeight: 0; Layout.verticalStretchFactor: 3 }
        }
    }
    Component {
        id: translateView
        ColumnLayout {
            id: translationWorkspace
            readonly property int sourceLength: Array.from(root.session.draft).length
            readonly property bool sourceTooLong: sourceLength > 5000
            readonly property var task: workspace.tasks.find(value => value.request.sessionID === session.id)
            property bool showContext: !!session.dictionaryContext
            readonly property bool dictionaryEmpty: root.glassChrome && session.feature === "dictionary" && !session.output && !activeTask
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
                    Label { visible: !root.glassChrome; text: t("inputLanguage"); color: root.palette.placeholderText }
                    LanguagePicker { visible: !root.glassChrome; source: true; flat: true }
                    LanguageButton { objectName: "translate-source-language"; visible: root.glassChrome; shell: root; allowAuto: true; language: session.source; label: t("inputLanguage"); onChosen: code => command("pair", {source:code, target:session.target}) }
                    Kit.IconButton { iconName: "swap"; text: t("swap"); enabled: session.source !== "auto"; onClicked: command("pair", {source: session.target, target: session.source}) }
                    Label { visible: !root.glassChrome; text: t("outputLanguage"); color: root.palette.placeholderText }
                    LanguagePicker { visible: !root.glassChrome; source: false; flat: true }
                    LanguageButton { visible: root.glassChrome; shell: root; language: session.target; label: t("outputLanguage"); onChosen: code => command("pair", {source:session.source, target:code}) }
                    Item { Layout.fillWidth: true }
                }
                SessionModelPicker {
                    shell: root; bridge: workbench
                    compact: true; glassFeature: root.glassChrome
                    onDeletePromptRequested: promptID => { deleteSavedPrompt.promptID = promptID; deleteSavedPrompt.open() }
                }
            }
            Rectangle { visible: !root.glassChrome; color: root.palette.midlight; implicitHeight: metrics.hairline; Layout.fillWidth: true }
            Kit.ProviderNotice { model: session.model; dangerColor: root.colors.danger; Layout.fillWidth: true; onOpenRequested: section => root.openSettingsSection(section); onUseRequested: model => command("model", {value: model}) }
            Kit.AnchoredPanel {
                id: comparePanel; shell: root; objectName: "compare-panel"
                desiredWidth: root.width - metrics.inset * 2
                contentItem: ScrollView { id: compareScroll; contentWidth: availableWidth; implicitHeight: metrics.editor * 3; ScrollBar.vertical: ScrollBar { policy: compareScroll.contentHeight > compareScroll.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff; contentItem: Rectangle { implicitWidth: metrics.small; radius: width / 2; color: root.colors["text-muted"] } } ComparisonPane { width: compareScroll.availableWidth; bridge: workbench; session: root.session; shell: root } }
            }
            Kit.AnchoredPanel {
                id: stylePanel; shell: root; objectName: "translation-style-panel"
                contentItem: ScrollView { id: styleScroll; contentWidth: availableWidth; implicitHeight: styleOptions.implicitHeight; ScrollBar.vertical: ScrollBar { policy: styleScroll.contentHeight > styleScroll.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff; contentItem: Rectangle { implicitWidth: metrics.small; radius: width / 2; color: root.colors["text-muted"] } } TranslationOptions { id: styleOptions; width: styleScroll.availableWidth; bridge: workbench; session: root.session; showComparison: false } }
            }
            GlassDialog {
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
            Label {
                visible: translationWorkspace.dictionaryEmpty
                text: t("dictionaryAsk"); font.pointSize: Qt.application.font.pointSize * metrics.headingScale; font.weight: Font.DemiBold
                color: root.colors["text-strong"]; horizontalAlignment: Text.AlignHCenter
                Layout.fillWidth: true; Layout.topMargin: metrics.large; Layout.bottomMargin: metrics.tight
            }
            Frame {
                visible: session.feature === "dictionary"
                Layout.fillWidth: true
                Layout.maximumWidth: root.glassChrome ? metrics.reading : Infinity
                Layout.alignment: Qt.AlignHCenter
                implicitHeight: root.glassChrome ? (translationWorkspace.dictionaryEmpty ? metrics.hero : metrics.navControl) + metrics.tight : implicitContentHeight + padding * 2
                padding: metrics.small
                leftPadding: metrics.gap
                rightPadding: metrics.small
                background: Rectangle { radius: root.glassChrome ? height / 2 : metrics.largeRadius; color: root.glassChrome ? root.colors["surface-subtle"] : "transparent"; border.width: metrics.hairline; border.color: root.glassChrome ? root.colors[termDraft.activeFocus ? "border-strong" : "border"] : termDraft.activeFocus ? root.palette.mid : root.palette.midlight }
                RowLayout {
                    anchors.fill: parent
                    spacing: metrics.small
                    IconImage { source: "icons/search.svg"; color: root.colors["text-muted"]; sourceSize.width: metrics.icon; sourceSize.height: metrics.icon; Accessible.ignored: true }
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
                    Kit.IconButton { visible: root.glassChrome; iconName: "instructions"; text: t("dictionaryAddContext"); checked: translationWorkspace.showContext; onClicked: translationWorkspace.showContext = !translationWorkspace.showContext }
                    Kit.GlassButton { visible: !!activeTask; text: t("stop"); onClicked: root.submit() }
                    Kit.PrimaryButton { visible: !activeTask; text: t("lookup"); enabled: !!session.draft.trim() && Array.from(session.draft).length <= 120; onClicked: root.submit() }
                }
            }
            Label { visible: translationWorkspace.dictionaryEmpty && translationWorkspace.sourceLength <= 120; text: "↩ " + t("lookup") + " · " + t("dictionaryTermLimit"); color: root.colors["text-muted"]; font.pointSize: Qt.application.font.pointSize * metrics.smallScale; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.Wrap; Layout.fillWidth: true }
            TextField {
                visible: session.feature === "dictionary" && (!root.glassChrome || translationWorkspace.showContext)
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
                    Label { visible: !session.output && (!root.glassChrome || !!activeTask); text: t(activeTask ? "lookingUp" : "dictionaryEmpty"); color: root.palette.placeholderText; wrapMode: Text.Wrap; horizontalAlignment: Text.AlignHCenter; Layout.fillWidth: true; Layout.topMargin: metrics.large }
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
                    RowLayout {
                        visible: !!session.output && !root.glassChrome
                        Layout.fillWidth: true
                        Item { Layout.fillWidth: true }
                        Kit.GlassButton { flat: true; text: t(session.favorite ? "savedWord" : "saveWord"); checkable: true; checked: !!session.favorite; onClicked: { const saved = !session.favorite; command("favorite"); root.notify(tpl(saved ? "wordSavedToast" : "wordUnsavedToast", {word:session.draft})) } }
                    }
                    DictionaryResult { visible: !!session.output; Layout.fillWidth: true; output: session.output; bridge: workbench; shell: root }
                }
            }
            Kit.Card {
                id: translationCard
                visible: session.feature !== "dictionary"
                padding: 0
                clip: true
                Binding { target: translationCard.background; property: "visible"; value: false; when: root.glassChrome }
                Layout.fillWidth: true
                Layout.fillHeight: true
            GridLayout {
                id: panes
                objectName: "translation-panes"
                uniformCellWidths: root.glassChrome
                anchors.fill: parent
                // Review 18 stacks the editors below the reading width (its 820 px preview).
                columns: session.feature === "dictionary" ? 1 : width >= metrics.reading ? 2 : 1
                columnSpacing: root.glassChrome ? metrics.inset : 0
                rowSpacing: root.glassChrome ? metrics.inset : 0
                Frame {
                    objectName: "translation-source-pane"
                    padding: metrics.inset
                    background: Item { Kit.FlatCard { objectName: "translation-source-surface"; anchors.fill: parent; visible: root.glassChrome } Rectangle { visible: !root.glassChrome && panes.columns > 1; anchors.right: parent.right; width: metrics.hairline; height: parent.height; color: root.colors.border } }
                    Layout.fillWidth: true
                    Layout.fillHeight: session.feature !== "dictionary"
                    Layout.preferredWidth: root.glassChrome ? 0 : metrics.sidebar
                    Layout.minimumWidth: 0
                    ColumnLayout {
                        anchors.fill: parent
                        RowLayout {
                            Layout.minimumHeight: metrics.control
                            Label { text: t(session.feature === "dictionary" ? "lookup" : "source"); font.bold: true; Layout.fillWidth: true }
                            Label { text: lang(session.source); color: root.palette.placeholderText }
                        }
                        Rectangle { visible: !root.glassChrome; Layout.fillWidth: true; implicitHeight: metrics.hairline; color: root.colors.border }
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
                                Binding { target: sourceDraft; property: "verticalAlignment"; value: TextEdit.AlignTop; when: root.glassChrome }
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
                            ImageControls { compact: true; visible: session.feature === "translate" }
                            AudioControls { compact: true }
                            ListenButton { visible: root.glassChrome && !!session.draft.trim(); shell: root; display: AbstractButton.IconOnly; sources: [{id:session.id + ":source", title:t("source"), text:session.draft, language:workbench.speechLanguage(session.draft,session.source)}] }
                            Label { objectName: "translate-count"; text: root.glassChrome ? translationWorkspace.sourceLength.toLocaleString(workspace.locale) + " / 5 000" : t("draft"); color: translationWorkspace.sourceTooLong ? root.colors.danger : root.palette.placeholderText; elide: Text.ElideRight; Layout.fillWidth: true }
                            Kit.GlassButton { visible: !!activeTask; text: t("stop"); onClicked: root.submit() }
                            Kit.PrimaryButton { objectName: "translate-submit"; shortcutText: root.glassChrome ? "Ctrl+Enter" : ""; visible: !activeTask; text: t(session.feature === "dictionary" ? "lookup" : "translateText"); display: root.glassChrome && sourceActions.width < metrics.sidebar + metrics.editor ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; icon.source: "icons/" + (session.feature === "dictionary" ? "search" : "translate") + ".svg"; enabled: !translationWorkspace.sourceTooLong && (!!session.draft.trim() || (session.feature === "translate" && (session.images || []).length > 0)); onClicked: root.submit() }
                        }
                        Label { visible: translationWorkspace.sourceTooLong; text: t("sourceTooLong"); color: root.colors.danger; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    }
                }
                Frame {
                    objectName: "translation-result-pane"
                    padding: metrics.inset
                    // Rounded only on the corners it shares with the card outline.
                    background: Rectangle {
                        readonly property real r: metrics.radius
                        color: root.glassChrome ? "transparent" : root.colors["surface-subtle"]
                        topRightRadius: panes.columns > 1 ? r : 0; bottomRightRadius: r; bottomLeftRadius: panes.columns > 1 ? 0 : r
                        Rectangle { visible: !root.glassChrome && panes.columns === 1; width: parent.width; height: metrics.hairline; color: root.colors.border }
                    }
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.preferredWidth: root.glassChrome ? 0 : metrics.sidebar
                    Layout.minimumWidth: 0
                    ColumnLayout {
                        anchors.fill: parent
                        RowLayout {
                            Layout.minimumHeight: metrics.control
                            Label { text: t("result"); font.bold: true; Layout.fillWidth: true }
                            Kit.GlassButton { id: styleTrigger; visible: session.feature === "translate"; flat: true; text: t("style_" + (session.translationStyle || "general")) + " ▾"; Accessible.name: t("translationOptions"); ToolTip.visible: hovered && !translationOptionsDialog.visible && !stylePanel.visible; ToolTip.text: t("translationOptions"); onClicked: root.glassChrome ? stylePanel.openAt(styleTrigger) : translationOptionsDialog.open() }
                        }
                        Rectangle { visible: !root.glassChrome; Layout.fillWidth: true; implicitHeight: metrics.hairline; color: root.colors.border }
                        ScrollView {
                            visible: session.feature !== "dictionary" && !(session.images || []).length
                            contentWidth: availableWidth
                            Layout.fillWidth: true; Layout.fillHeight: true
                            TextArea { id: translatedText; objectName: "translation-result-text"; visible: session.feature !== "dictionary"; text: session.output; font.pointSize: root.readingPointSize; placeholderText: t(activeTask ? "translating" : "emptyResult"); readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; Accessible.name: t("result")
                                Binding { target: translatedText; property: "verticalAlignment"; value: TextEdit.AlignTop; when: root.glassChrome }
                            }
                        }
                        ImageTranslationView {
                            visible: session.feature === "translate" && (session.images || []).length > 0
                            Layout.fillWidth: true; Layout.fillHeight: true
                            bridge: workbench; session: root.session
                        }
                        Rectangle { objectName: "translation-result-rule"; visible: !root.glassChrome || !!session.output; Layout.fillWidth: true; implicitHeight: metrics.hairline; color: root.colors.border }
                        RowLayout {
                            id: translationActions
                            objectName: "translation-actions"
                            visible: !root.glassChrome || !!session.output
                            Layout.minimumHeight: metrics.control
                            Label { text: lang(session.target); color: root.palette.placeholderText; Layout.fillWidth: true }
                            Kit.GlassButton { visible: session.feature === "dictionary"; text: t(session.favorite ? "savedWord" : "saveWord"); checkable: true; checked: !!session.favorite; onClicked: command("favorite") }
                            Kit.QuietButton { objectName: "translate-compare"; visible: session.feature === "translate" && !(session.images || []).length; text: t("compare"); icon.source: "icons/compare.svg"; icon.color: root.colors.text; display: root.glassChrome && translationActions.width < metrics.sidebar + metrics.editor ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; ToolTip.visible: hovered && !comparePanel.visible; ToolTip.text: text; onClicked: root.glassChrome ? comparePanel.openAt(this) : translationOptionsDialog.open() }
                            ListenButton { objectName: "translate-listen"; shell: root; display: translationActions.width < metrics.sidebar + metrics.editor ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; sources: [{id:session.id + ":translation", title:t("result"), text:root.speechText(), language:session.target}, {id:session.id + ":source", title:t("source"), text:session.draft, language:workbench.speechLanguage(session.draft, session.source)}] }
                            Kit.QuietButton { text: t("copy"); icon.source: "icons/copy.svg"; icon.color: root.colors.text; display: root.glassChrome && translationActions.width < metrics.sidebar + metrics.editor ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; enabled: !!session.output; onClicked: { workbench.copy((session.images || []).length ? workbench.imageTranslationText(session.output) : session.output); root.notify(t("copied")) } }
                        }
                    }
                }
            }
                // Outline drawn above both panes so their fills never hide it.
                Rectangle { visible: !root.glassChrome; anchors.fill: parent; color: "transparent"; radius: metrics.radius; border.width: metrics.hairline; border.color: root.colors.border }
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
        InterpretationWorkspace { bridge: workbench; shell: root; dangerColor: root.colors.danger; onOpenSettings: section => root.openSettingsSection(section) }
    }
    Component {
        id: thermalView
        ThermalWorkspace { bridge: workbench; dangerColor: root.colors.danger }
    }
    Component {
        id: desktopView
        DesktopWorkspace { bridge: workbench; route: root.systemRoute; onRouteRequested: value => root.selectRoute(value); onNewTranslation: { root.selectRoute("translate"); root.command("new"); root.composerFocusEpoch++ } }
    }

    Component {
        id: settingsView
        SettingsWorkspace { bridge: workbench; searchAnchor: settingsHeaderSearch; onFeedback: (message, error) => root.notify(message, null, error); dangerColor: root.colors.danger; query: root.settingsQuery; requestedSection: root.settingsSection; onQueryEdited: value => root.settingsQuery = value; onSectionOpened: root.settingsSection = ""; onRouteRequested: route => root.selectRoute(route) }
    }
    component HistoryList: ListView {
        id: historyList
        property bool preview: false
        clip: true
        model: root.historyRecords
        currentIndex: root.historyRecords.findIndex(item => item.id === (preview ? previewID : quickID))
        spacing: root.glassChrome ? 0 : metrics.small
        section.property: root.glassChrome && preview ? "bucket" : ""
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
            implicitHeight: root.glassChrome ? metrics.control + metrics.inset : implicitContentHeight + padding * 2
            ToolTip.visible: hovered && rowTitle.truncated
            ToolTip.text: text
            highlighted: modelData.id === (historyList.preview ? previewID : quickID)
            padding: root.glassChrome ? metrics.small : metrics.gap
            background: Item {
                Rectangle { anchors.fill: parent; visible: !root.glassChrome; radius: metrics.controlRadius; color: historyRow.highlighted ? Qt.tint(root.colors.surface, Qt.alpha(root.colors.action, metrics.selectionOpacity)) : historyRow.hovered ? root.colors["surface-hover"] : "transparent" }
                Kit.GlassLens { anchors.fill: parent; visible: root.glassChrome && (historyRow.highlighted || historyRow.hovered); hover: !historyRow.highlighted; radius: metrics.radius }
                Rectangle { anchors.fill: parent; color: "transparent"; radius: metrics.radius; border.width: historyRow.visualFocus ? metrics.hairline : 0; border.color: root.colors.action }
            }
            Accessible.name: text + (modelData.id === session.id ? ", " + t("currentSession") : "")
            Accessible.role: historyList.preview ? Accessible.ListItem : Accessible.Button
            Accessible.selected: highlighted
            contentItem: ColumnLayout {
                spacing: root.glassChrome ? metrics.hairline * 2 : metrics.small
                RowLayout {
                    Label { visible: root.glassChrome && !historyList.preview && historyRow.modelData.id === session.id; text: "✓"; color: root.colors["action-text"]; Accessible.ignored: true }
                    IconImage { visible: root.glassChrome && root.library && !root.historyFeature; source: "icons/" + (historyRow.modelData.feature === "translate" ? "translate" : historyRow.modelData.feature === "dictionary" ? "dictionary" : "chat") + ".svg"; sourceSize.width: metrics.icon; sourceSize.height: metrics.icon; color: root.colors["action-text"]; Accessible.ignored: true }
                    Label { id: rowTitle; text: titleFor(historyRow.modelData); color: root.colors.text; font.weight: !root.glassChrome || historyRow.modelData.id === session.id || historyRow.highlighted ? Font.DemiBold : Font.Normal; elide: Text.ElideRight; Layout.fillWidth: true }
                }
                RowLayout {
                    Label { objectName: "history-snippet"; text: (root.glassChrome ? root.historySnippet(historyRow.modelData) : historyRow.modelData.draft || historyRow.modelData.messages.slice(-1)[0]?.text || historyRow.modelData.output || "").replace(/\s+/g, " "); maximumLineCount: 1; color: root.glassChrome ? root.colors["text-muted"] : root.colors.text; font.pointSize: Qt.application.font.pointSize * (root.glassChrome ? metrics.smallScale : 1); elide: Text.ElideRight; Layout.fillWidth: true }
                    Label { visible: root.glassChrome; text: root.archivedHistory && root.library ? (historyRow.modelData.feature === "chat" ? root.tpl("turnsCount", {n: historyRow.modelData.messages.filter(message => message.role === "user").length}) : "") : root.relativeTime(historyRow.modelData.updated); color: root.colors["text-soft"]; font.pointSize: Qt.application.font.pointSize * metrics.captionScale }
                }
                RowLayout {
                    visible: !root.glassChrome
                    Label { text: root.modelLabel(historyRow.modelData.model); color: root.colors["text-muted"]; elide: Text.ElideRight; Layout.fillWidth: true }
                    Label { text: t("currentSession"); color: root.colors.text; visible: historyRow.modelData.id === session.id }
                }
            }
            onClicked: { if (historyList.preview) { previewID = modelData.id; historyList.forceActiveFocus() } else choose(modelData.id) }
        }
        ColumnLayout {
            anchors.centerIn: parent; width: Math.max(0, parent.width - metrics.inset * 2)
            visible: historyList.count === 0
            IconImage { visible: root.glassChrome && !!root.historyQuery.trim(); source: "icons/search.svg"; sourceSize.width: metrics.icon; sourceSize.height: metrics.icon; color: root.colors["text-muted"]; Layout.alignment: Qt.AlignHCenter; Accessible.ignored: true }
            Label { objectName: "history-empty-message"; text: root.glassChrome && !root.historyQuery.trim() ? t(root.archivedHistory ? "historyArchivedEmpty" : "historyEmpty") : t("noHistory"); wrapMode: Text.Wrap; horizontalAlignment: Text.AlignHCenter; Layout.fillWidth: true }
            Label { visible: root.glassChrome && !!root.historyQuery; text: t("historyNoMatchesHint"); wrapMode: Text.Wrap; color: root.colors["text-muted"]; horizontalAlignment: Text.AlignHCenter; Layout.fillWidth: true }
        }
        ScrollBar.vertical: ScrollBar {}
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
                        Kit.GlassButton { text: t("exportSession"); enabled: !!previewCard.selected; onClicked: { sessionExport.ownerID = previewID; sessionExport.open() } }
                        Kit.GlassButton { text: t("rename"); enabled: !!previewCard.selected; onClicked: { renameDialog.ownerID = previewID; renameInput.text = previewCard.selected.title; renameDialog.open() } }
                        Kit.GlassButton { text: t(root.archivedHistory ? "restoreSession" : "archiveSession"); enabled: !!previewCard.selected; onClicked: command("archive", {sessionID: previewID, value: !root.archivedHistory}) }
                        Kit.GlassButton { text: t("deletePermanently"); visible: root.archivedHistory; enabled: !!previewCard.selected; onClicked: { deleteHistory.ownerID = previewID; deleteHistory.open() } }
                        Label { text: t("currentSession"); visible: previewCard.selected?.id === session.id }
                        Item { Layout.fillWidth: true }
                        Kit.GlassButton { objectName: "history-open"; text: t("open"); highlighted: true; enabled: !!previewCard.selected && !root.archivedHistory; onClicked: choose(previewID) }
                    }
                }
            }
        }
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
                Label { visible: !!glassPreview.selected; text: glassPreview.selected ? root.titleFor(glassPreview.selected) : ""; font.pointSize: Qt.application.font.pointSize * metrics.titleScale; font.weight: Font.DemiBold; elide: Text.ElideRight; Layout.fillWidth: true }
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
                    Kit.QuietButton { id: renameAction; objectName: "history-rename"; glassMaterial: false; display: historyActions.compact ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; icon.source: "icons/edit.svg"; text: root.t("rename"); ToolTip.visible: hovered; ToolTip.text: text; enabled: !!glassPreview.selected; onClicked: { renameDialog.ownerID = previewID; renameInput.text = glassPreview.selected.title; renameDialog.open() } }
                    Kit.QuietButton { id: exportAction; objectName: "history-export"; glassMaterial: false; display: historyActions.compact ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; icon.source: "icons/export.svg"; text: root.t("exportSession"); ToolTip.visible: hovered; ToolTip.text: text; enabled: !!glassPreview.selected; onClicked: { sessionExport.ownerID = previewID; sessionExport.open() } }
                    Kit.QuietButton { id: archiveAction; objectName: "history-archive"; glassMaterial: false; display: historyActions.compact ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; icon.source: root.archivedHistory ? "icons/restore.svg" : "icons/archive.svg"; text: root.t(root.archivedHistory ? "restoreSession" : "archiveSession"); ToolTip.visible: hovered; ToolTip.text: text; enabled: !!glassPreview.selected; onClicked: root.archiveHistory(previewID, !root.archivedHistory) }
                    Kit.QuietButton { id: deleteAction; objectName: "history-delete"; glassMaterial: false; display: historyActions.compact ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; icon.source: "icons/delete.svg"; icon.color: enabled ? root.colors.danger : palette.placeholderText; text: root.t(root.archivedHistory ? "deletePermanently" : "deleteSession"); palette.buttonText: root.colors.danger; ToolTip.visible: hovered; ToolTip.text: text; enabled: !!glassPreview.selected && !glassPreview.selectedBusy; onClicked: root.removeHistory(previewID) }
                    Item { Layout.fillWidth: true }
                    Kit.PrimaryButton { id: openAction; objectName: "history-open"; display: historyActions.compact ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; icon.source: "icons/open.svg"; text: root.t("open"); ToolTip.visible: hovered; ToolTip.text: text; enabled: !!glassPreview.selected && !root.archivedHistory; onClicked: root.choose(previewID) }
                }
                Rectangle { visible: !!glassPreview.selected; Layout.fillWidth: true; implicitHeight: metrics.hairline; color: root.colors.border }
                ChatTranscript {
                    visible: glassPreview.selected?.feature === "chat"
                    bridge: workbench; session: glassPreview.selected || {id: "", messages: []}
                    readingPointSize: root.readingPointSize
                    preview: true
                    Layout.fillWidth: true; Layout.fillHeight: true
                }
                ScrollView {
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
                        DictionaryResult { visible: glassPreview.selected?.feature === "dictionary"; session: glassPreview.selected; output: glassPreview.selected?.output || ""; bridge: workbench; shell: root; Layout.fillWidth: true; Layout.preferredHeight: metrics.editor * 2 }
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
                Label { text: t("history"); font.bold: true; Layout.fillWidth: true }
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
        height: root.glassChrome ? Math.min(activityHeading.implicitHeight + metrics.small + activityItems.implicitHeight + padding * 2, root.height - y - metrics.inset) : Math.min(metrics.editor * 3, root.height - y - metrics.inset)
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
                Label { objectName: "activity-title"; text: root.glassChrome && root.activityRows.length + (workbench.interpretation.busy ? 1 : 0) > 0 ? root.tpl("activityCount", {count: root.activityRows.length + (workbench.interpretation.busy ? 1 : 0)}) : t("activity"); font.bold: true; Layout.fillWidth: true }
                ShellButton { id: activityClose; objectName: "activity-close"; iconName: "close"; text: t("close"); onClicked: activity.close() }
            }
            ScrollView {
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
                        model: root.activityRows
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
        Binding { target: navigationOverlay.background; property: "visible"; value: false; when: root.glassChrome }
        dim: root.glassChrome
        Overlay.modeless: Rectangle { color: Qt.alpha(root.colors["text-strong"], root.metrics.selectionOpacity) }
        objectName: "navigation-overlay"
        parent: Overlay.overlay
        y: shellHeader.height
        width: root.glassChrome ? metrics.sidebar + metrics.small * 2 : metrics.sidebar
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
        background: Kit.ReadingPanelSurface {}
        objectName: "command-palette"
        parent: Overlay.overlay
        width: Math.min(root.glassChrome ? metrics.dialog : metrics.sidebar + metrics.editor, root.width - metrics.inset * 2)
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
            Accessible.name: t("commands")
            Accessible.role: Accessible.Dialog
            anchors.fill: parent
            RowLayout {
                visible: !root.glassChrome
                Label { text: t("commands"); font.bold: true; Layout.fillWidth: true }
                ShellButton { iconName: "close"; text: t("close"); onClicked: commands.close() }
            }
            Kit.SearchField {
                id: commandSearch
                objectName: "command-search"
                Layout.fillWidth: true
                placeholderText: t("commandSearch")
                rightPadding: root.glassChrome ? commandEscape.implicitWidth + metrics.small * 2 : metrics.gap
                Kit.KeyCap { id: commandEscape; visible: root.glassChrome; text: "Esc"; anchors.right: parent.right; anchors.rightMargin: metrics.small; anchors.verticalCenter: parent.verticalCenter; Accessible.ignored: true }
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
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                model: root.commandEntries
                section.property: root.glassChrome ? "group" : ""
                section.delegate: Kit.Eyebrow { required property string section; text: root.t(section).toUpperCase(); height: metrics.compactControl; verticalAlignment: Text.AlignVCenter; leftPadding: metrics.gap }
                delegate: ItemDelegate {
                    id: commandItem
                    required property var modelData
                    required property int index
                    width: commandList.width - (root.glassChrome && commandScrollBar.visible ? commandScrollBar.width : 0)
                    implicitHeight: root.glassChrome ? metrics.navControl : implicitContentHeight + topPadding + bottomPadding
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
                        Label { text: commandItem.text; color: root.glassChrome ? root.colors.text : commandItem.highlighted ? palette.link : palette.text; font.bold: commandItem.highlighted; elide: Text.ElideRight; Layout.fillWidth: true; Accessible.ignored: true }
                        Kit.KeyCap { visible: root.glassChrome && !!commandItem.modelData.shortcut && !(commandItem.modelData.id === "settings" && Qt.platform.os !== "osx"); text: (Qt.platform.os === "osx" ? "⌘" : "Ctrl+") + commandItem.modelData.shortcut; Accessible.ignored: true }
                    }
                    background: Item {
                        Rectangle { anchors.fill: parent; visible: !root.glassChrome; radius: metrics.radius; color: commandItem.highlighted ? Qt.tint(palette.base, Qt.alpha(palette.highlight, metrics.selectionOpacity)) : commandItem.hovered ? palette.alternateBase : "transparent" }
                        Kit.GlassLens { anchors.fill: parent; visible: root.glassChrome && (commandItem.highlighted || commandItem.hovered); hover: !commandItem.highlighted; radius: metrics.radius }
                        Rectangle { anchors.fill: parent; color: "transparent"; radius: metrics.radius; border.width: commandItem.visualFocus ? metrics.hairline : 0; border.color: root.colors.action }
                    }
                    onClicked: commands.run(modelData.id)
                }
                Label { anchors.centerIn: parent; visible: !commandList.count; text: t("noCommands") }
                ScrollBar.vertical: ScrollBar {
                    id: commandScrollBar
                    objectName: "command-scrollbar"
                    policy: root.glassChrome ? (commandList.contentHeight > commandList.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff) : ScrollBar.AsNeeded
                    palette.mid: root.glassChrome ? root.colors["text-muted"] : root.palette.mid
                    palette.dark: root.glassChrome ? root.colors.text : root.palette.dark
                }
            }
        }
    }

    Column {
        z: 100
        anchors.right: parent.right; anchors.bottom: parent.bottom
        anchors.margins: metrics.inset
        width: Math.min(metrics.notificationInline, root.width - metrics.inset * 2)
        spacing: metrics.small
        Repeater {
            model: root.toasts
            delegate: Pane {
                id: toast
                required property var modelData
                objectName: "shell-toast-" + modelData.id
                width: parent.width
                padding: metrics.gap
                background: Kit.ReadingPanelSurface { radius: metrics.largeRadius - metrics.tight / 2 }
                Accessible.role: Accessible.AlertMessage
                Accessible.name: modelData.text
                contentItem: RowLayout {
                    Label { text: toast.modelData.error ? "●" : "✓"; color: toast.modelData.error ? root.colors.danger : root.colors.success; Accessible.ignored: true }
                    Label { text: toast.modelData.text; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Kit.QuietButton { objectName: toast.modelData.undo ? "toast-undo" : ""; visible: !!toast.modelData.undo; text: root.t("undo"); onClicked: { const action = toast.modelData.undo; root.dismissToast(toast.modelData.id); if (action) action() } }
                    Kit.IconButton { iconName: "close"; text: root.t("close"); onClicked: root.dismissToast(toast.modelData.id) }
                }
                Timer { interval: metrics.toastSeconds * 1000; running: true; onTriggered: root.dismissToast(toast.modelData.id) }
            }
        }
    }

}

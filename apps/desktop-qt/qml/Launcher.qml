import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Controls.impl
// The launcher: a floating search window for apps, files, quick calculations and sending
// text to Viezan (Review 18; mirrors Launcher.swift). It sits 22% below the top of the
// screen, is driven from the keyboard, and hides when it loses focus.
AuxiliaryWindow {
    id: launcher
    signal openMainRequested(string sessionID)
    signal askRequested(string text)
    signal openRouteRequested(string route)
    property string quickSessionID: ""
    readonly property var desktop: bridge.desktopIntegration
    property int homeEpoch: 0
    readonly property var home: { bridge.state; homeEpoch; return bridge.launcherHome(quickSessionID) }
    onVisibleChanged: if (visible) homeEpoch++
    property string query: ""
    property string resultsQuery: ""
    // By id, not position: file and currency results arrive later and must not move the choice.
    property string selectedID: ""
    property bool failed: false
    flags: Qt.Tool | Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint
    color: "transparent"
    width: metrics.reading - metrics.navControl
    height: Math.min(metrics.reading * metrics.launcherHeight, frame.implicitHeight)
    title: t("launcher")
    function section(key, value) { return tpl(key, {query: value || ""}).toLocaleUpperCase() }
    readonly property string trimmed: query.trim()
    onQueryChanged: { selectedID = ""; failed = false; resultsQuery = ""; fileDelay.restart() }
    Timer { id: fileDelay; interval: 250; onTriggered: { launcher.desktop.searchFiles(launcher.trimmed); launcher.resultsQuery = launcher.trimmed } }
    onActiveChanged: if (!active && visible) hide()

    function toggle() {
        if (visible) { hide(); return }
        query = ""; selectedID = ""; failed = false
        desktop.refreshApplications()
        const screen = launcher.screen
        x = screen.virtualX + (screen.width - width) / 2
        y = screen.virtualY + screen.desktopAvailableHeight * metrics.launcherTop
        show(); raise(); requestActivate(); field.forceActiveFocus()
    }
    function openFeature(feature, text) {
        const id = bridge.createDetachedSession(feature, text === undefined ? trimmed : text)
        bridge.command("submit", {sessionID: id}); hide(); openMainRequested(id)
    }
    readonly property var items: {
        const q = trimmed, rows = []
        const suggestions = section("launcher_section_suggestions"), recent = section("launcher_section_recent")
        const continuation = home.continue
        const continueRow = continuation ? {id: "continue", kind: "continue", section: continuation.fresh ? suggestions : recent, title: t("launcher_continue"), detail: continuation.title || t("newChat"), icon: "chat"} : null
        if (!q) {
            rows.push({id: "ai", kind: "ai", section: suggestions, title: t("launcher_ai"), detail: "Tab", icon: "reasoning"})
            if (continueRow && continuation.fresh) rows.push(continueRow)
            for (const page of home.pages) rows.push({id: "route-" + page.route, route: page.route, kind: "route", section: suggestions, title: t(page.title), detail: "", icon: page.route})
            if (continueRow && !continuation.fresh) rows.push(continueRow)
        }
        const value = q ? desktop.calculate(q.startsWith("=") ? q.slice(1).trim() : q) : ""
        const prefix = q ? desktop.paletteQuery(q) : ({})
        if (prefix.kind && prefix.kind !== "calculation") {
            const kind = ({ask:"ai",translate:"translate",lookup:"dictionary"})[prefix.kind]
            if (kind === "ai" || bridge.moduleEnabled(kind)) rows.push({id:"prefix",kind:kind,query:prefix.value,section:section("launcher_section_suggestions"),title:tpl(({ask:"paletteAsk",translate:"paletteTranslate",lookup:"paletteLookup"})[prefix.kind], {text:prefix.value, query:prefix.value}),detail:"",icon:kind === "ai" ? "reasoning" : kind})
        }
        if (value) rows.push({id: "calc", kind: "copy", section: section("launcher_calculator"), title: (q.startsWith("=") ? q.slice(1).trim() : q) + " = " + value, detail: t("launcher_calculator"), copy: value})
        if (q && resultsQuery === q && desktop.currency) rows.push({id: "currency", kind: "copy", section: section("launcher_currency"), title: desktop.currency, detail: t("launcher_currency"), copy: desktop.currency})
        for (const app of (desktop.applications, desktop.rankApplications(q)))
            rows.push({id: app.id, kind: "app", section: section(q ? "launcher_section_apps" : "launcher_section_recent"), title: app.name, detail: t("launcher_app")})
        if (q && resultsQuery === q) for (const file of desktop.files.slice(0, 5))
            rows.push({id: file.id, kind: "file", section: section("launcher_section_files"), title: file.name, detail: t("launcher_file")})
        if (q) {
            const useWith = section("launcher_section_use_with", q.length > 40 ? q.slice(0, 40) + "…" : q)
            rows.push({id: "ai", kind: "ai", section: useWith, title: t("launcher_ai"), detail: t("launcher_command")})
            if (bridge.moduleEnabled("translate")) rows.push({id: "translate", kind: "translate", section: useWith, title: t("launcher_translate"), detail: t("launcher_command")})
            if (bridge.moduleEnabled("dictionary")) rows.push({id: "dictionary", kind: "dictionary", section: useWith, title: t("launcher_dictionary"), detail: t("launcher_command")})
            rows.push({id: "web", kind: "web", section: useWith, title: t("launcher_web"), detail: t("launcher_command")})
        }
        return rows
    }
    readonly property int currentIndex: Math.max(0, items.findIndex(item => item.id === selectedID))
    readonly property var current: items.length ? items[currentIndex] : null
    function move(step) { if (items.length) selectedID = items[(currentIndex + step + items.length) % items.length].id }
    // ↵ runs the row; Shift+↵ reveals a file; Ctrl/⌘+↵ asks AI about what was typed.
    function activate(item, modifiers) {
        if ((modifiers & (Qt.ControlModifier | Qt.MetaModifier)) && trimmed) { hide(); askRequested(trimmed); return }
        if (!item) return
        if (item.kind === "copy") { bridge.copy(item.copy); hide() }
        else if (item.kind === "app") { desktop.launch(item.id); if (desktop.error === "launchError") failed = true; else hide() }
        else if (item.kind === "file") { if (modifiers & Qt.ShiftModifier) desktop.revealFile(item.id); else desktop.openFile(item.id); if (desktop.error === "launchError") failed = true; else hide() }
        else if (item.kind === "ai") { hide(); askRequested(item.query === undefined ? trimmed : item.query) }
        else if (item.kind === "continue") { hide(); askRequested("") }
        else if (item.kind === "route") { hide(); openRouteRequested(item.route) }
        else if (item.kind === "translate" || item.kind === "dictionary") openFeature(item.kind, item.query)
        else if (item.kind === "web") { desktop.searchWeb(trimmed); hide() }
    }

    Item {
        id: frame
        anchors.fill: parent
        implicitHeight: content.implicitHeight
        clip: true
        ColumnLayout {
            id: content
            anchors.fill: parent; spacing: 0
            RowLayout {
                spacing: launcher.metrics.gap
                Layout.fillWidth: true; Layout.preferredHeight: launcher.metrics.navControl + launcher.metrics.inset + launcher.metrics.tight
                Layout.leftMargin: launcher.metrics.inset; Layout.rightMargin: launcher.metrics.inset
                Kit.SearchField {
                    id: field
                    objectName: "launcher-query"
                    embedded: true
                    text: launcher.query; onTextEdited: launcher.query = text
                    placeholderText: launcher.t("launcher_placeholder"); Accessible.name: placeholderText
                    font.pointSize: Qt.application.font.pointSize * launcher.metrics.titleScale
                    background: null; maximumLength: 500; Layout.fillWidth: true
                    Keys.onPressed: event => {
                        if (field.inputMethodComposing) { event.accepted = false; return }
                        if (event.key === Qt.Key_Down) { launcher.move(1); event.accepted = true }
                        else if (event.key === Qt.Key_Up) { launcher.move(-1); event.accepted = true }
                        else if (event.key === Qt.Key_Tab && !(event.modifiers & Qt.ShiftModifier)) { launcher.hide(); launcher.askRequested(launcher.trimmed); event.accepted = true }
                        else if (event.key === Qt.Key_Escape) { if (launcher.query) launcher.query = ""; else launcher.hide(); event.accepted = true }
                        else if ((event.key === Qt.Key_Return || event.key === Qt.Key_Enter) && !field.inputMethodComposing) { launcher.activate(launcher.current, event.modifiers); event.accepted = true }
                    }
                }
                Label { text: launcher.t("launcher_ai_hint"); color: palette.placeholderText }
                Kit.KeyCap { text: "Tab" }
            }
            Rectangle { visible: launcher.items.length > 0; color: palette.mid; implicitHeight: launcher.metrics.hairline; Layout.fillWidth: true }
            ListView {
                id: results
                visible: launcher.items.length > 0
                model: launcher.items
                currentIndex: launcher.currentIndex
                onCurrentIndexChanged: positionViewAtIndex(currentIndex, ListView.Contain)
                clip: true; boundsBehavior: Flickable.StopAtBounds
                ScrollBar.vertical: ScrollBar { policy: results.contentHeight > results.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff }
                Layout.fillWidth: true
                Layout.preferredHeight: Math.min(contentHeight, launcher.metrics.reading * launcher.metrics.launcherResults)
                Layout.margins: launcher.metrics.small
                Accessible.role: Accessible.List; Accessible.name: launcher.t("launcher_placeholder")
                delegate: ColumnLayout {
                    required property var modelData
                    required property int index
                    width: ListView.view.width; spacing: 0
                    Label {
                        visible: index === 0 || launcher.items[index - 1].section !== modelData.section
                        text: modelData.section; font.bold: true; color: palette.placeholderText
                        font.pointSize: Qt.application.font.pointSize * launcher.metrics.captionScale
                        Layout.leftMargin: launcher.metrics.small; Layout.topMargin: launcher.metrics.small; Layout.bottomMargin: launcher.metrics.tight
                    }
                    ItemDelegate {
                        Layout.fillWidth: true; implicitHeight: launcher.metrics.navControl + launcher.metrics.tight
                        highlighted: index === launcher.currentIndex
                        onClicked: { launcher.selectedID = modelData.id; launcher.activate(modelData, 0) }
                        Accessible.name: modelData.title + ", " + modelData.detail
                        // A soft accent like the macOS launcher; the text keeps its own color.
                        background: Item {
                            Kit.GlassLens { anchors.fill: parent; visible: parent.parent.highlighted }
                            Rectangle { anchors.fill: parent; radius: launcher.metrics.controlRadius; color: "transparent"; border.width: parent.parent.visualFocus ? launcher.metrics.hairline * 2 : 0; border.color: launcher.colors.action }
                        }
                        contentItem: RowLayout {
                            spacing: launcher.metrics.gap
                            IconImage { source: "icons/" + (modelData.icon || ({app:"apps",file:"data",copy:"utilities",ai:"reasoning",translate:"translate",dictionary:"dictionary",web:"search"})[modelData.kind] || "open") + ".svg"; sourceSize.width: launcher.metrics.icon; sourceSize.height: launcher.metrics.icon; color: launcher.colors["text-muted"]; Accessible.ignored: true }
                            Label { text: modelData.title; color: palette.text; elide: Text.ElideMiddle; Layout.fillWidth: true }
                            Label { text: modelData.detail; color: palette.placeholderText; elide: Text.ElideLeft; Layout.maximumWidth: launcher.width * 0.45 }
                        }
                    }
                }
            }
            Kit.StatusBadge { visible: launcher.desktop.applicationsBusy; text: launcher.t("launcher_loading"); Layout.leftMargin: launcher.metrics.inset; Layout.bottomMargin: launcher.metrics.small }
            Pane {
                visible: launcher.failed; Layout.fillWidth: true; Layout.margins: launcher.metrics.small
                padding: launcher.metrics.small
                background: Rectangle { radius: launcher.metrics.controlRadius; color: Qt.alpha(launcher.colors.danger, launcher.metrics.selectionOpacity); border.width: launcher.metrics.hairline; border.color: Qt.alpha(launcher.colors.danger, launcher.metrics.selectionOpacity * 2) }
                contentItem: RowLayout {
                    Label { text: launcher.t("launcher_open_failed"); wrapMode: Text.Wrap; Layout.fillWidth: true; Accessible.role: Accessible.AlertMessage }
                    Kit.GlassButton { text: launcher.t("retry"); onClicked: launcher.activate(launcher.current, 0) }
                }
            }
            Rectangle {
                visible: !!launcher.current
                color: palette.alternateBase; Layout.fillWidth: true; implicitHeight: footer.implicitHeight + launcher.metrics.small * 2
                bottomLeftRadius: launcher.metrics.largeRadius; bottomRightRadius: launcher.metrics.largeRadius
                RowLayout {
                    id: footer
                    anchors.fill: parent; anchors.leftMargin: launcher.metrics.inset; anchors.rightMargin: launcher.metrics.inset
                    spacing: launcher.metrics.gap
                    Label { text: !launcher.trimmed ? launcher.t("launcher_prefix_hint") : launcher.current?.title || ""; elide: Text.ElideMiddle; color: palette.placeholderText; Layout.fillWidth: true }
                    Label { visible: launcher.current?.kind === "file"; text: launcher.t("launcher_reveal") + "  Shift ↵"; color: palette.placeholderText }
                    Label { text: launcher.t(launcher.current?.kind === "copy" ? "launcher_copy" : "launcher_open") + "  ↵"; color: palette.placeholderText }
                    Label { visible: launcher.current?.kind !== "ai"; text: launcher.t("launcher_ai") + (Qt.platform.os === "osx" ? "  ⌘ ↵" : "  Ctrl ↵"); color: palette.placeholderText }
                }
            }
        }
    }
}

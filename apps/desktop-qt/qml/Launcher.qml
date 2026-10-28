import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
// The launcher: a floating search window for apps, files, quick calculations and sending
// text to Viezan (Review 18; mirrors Launcher.swift). It sits 22% below the top of the
// screen, is driven from the keyboard, and hides when it loses focus.
Window {
    id: launcher
    required property var bridge
    signal openMainRequested(string sessionID)
    signal askRequested(string text)
    readonly property var desktop: bridge.desktopIntegration
    readonly property var metrics: bridge.resources.metrics
    property string query: ""
    // By id, not position: file and currency results arrive later and must not move the choice.
    property string selectedID: ""
    property bool failed: false
    flags: Qt.Tool | Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint
    color: "transparent"
    width: metrics.reading
    height: Math.min(metrics.reading * 0.71, frame.implicitHeight)
    title: t("launcher")
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    function section(key, value) { return t(key).toLocaleUpperCase().replace("{QUERY}", value || "") }
    readonly property string trimmed: query.trim()
    onQueryChanged: { selectedID = ""; failed = false; fileDelay.restart() }
    Timer { id: fileDelay; interval: 250; onTriggered: launcher.desktop.searchFiles(launcher.trimmed) }
    onActiveChanged: if (!active && visible) hide()

    function toggle() {
        if (visible) { hide(); return }
        query = ""; selectedID = ""; failed = false
        desktop.refreshApplications()
        const screen = launcher.screen
        x = screen.virtualX + (screen.width - width) / 2
        y = screen.virtualY + screen.desktopAvailableHeight * 0.22
        show(); raise(); requestActivate(); field.forceActiveFocus()
    }
    function openFeature(feature) {
        const id = bridge.createDetachedSession(feature, trimmed)
        bridge.command("submit", {sessionID: id}); hide(); openMainRequested(id)
    }
    readonly property var items: {
        const q = trimmed, rows = []
        const value = q ? desktop.calculate(q) : ""
        if (value) rows.push({id: "calc", kind: "copy", section: section("launcher_calculator"), title: q + " = " + value, detail: t("launcher_calculator"), copy: value})
        if (q && desktop.currency) rows.push({id: "currency", kind: "copy", section: section("launcher_currency"), title: desktop.currency, detail: t("launcher_currency"), copy: desktop.currency})
        for (const app of (desktop.applications, desktop.rankApplications(q)))
            rows.push({id: app.id, kind: "app", section: section(q ? "launcher_section_apps" : "launcher_section_recent"), title: app.name, detail: t("launcher_app")})
        if (q) for (const file of desktop.files.slice(0, 5))
            rows.push({id: file.id, kind: "file", section: section("launcher_section_files"), title: file.name, detail: file.id})
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
        else if (item.kind === "file") { if (modifiers & Qt.ShiftModifier) desktop.revealFile(item.id); else desktop.openFile(item.id); hide() }
        else if (item.kind === "ai") { hide(); askRequested(trimmed) }
        else if (item.kind === "translate" || item.kind === "dictionary") openFeature(item.kind)
        else if (item.kind === "web") { desktop.searchWeb(trimmed); hide() }
    }

    Rectangle {
        id: frame
        anchors.fill: parent
        implicitHeight: content.implicitHeight
        radius: launcher.metrics.largeRadius; color: palette.base; border.color: palette.mid; border.width: launcher.metrics.hairline
        clip: true
        ColumnLayout {
            id: content
            anchors.fill: parent; spacing: 0
            RowLayout {
                spacing: launcher.metrics.gap
                Layout.fillWidth: true; Layout.preferredHeight: launcher.metrics.navControl + launcher.metrics.small
                Layout.leftMargin: launcher.metrics.inset; Layout.rightMargin: launcher.metrics.inset
                Image { source: "icons/search.svg"; sourceSize.width: launcher.metrics.icon; sourceSize.height: launcher.metrics.icon; Accessible.ignored: true }
                TextField {
                    id: field
                    text: launcher.query; onTextEdited: launcher.query = text
                    placeholderText: launcher.t("launcher_placeholder"); Accessible.name: placeholderText
                    font.pointSize: Qt.application.font.pointSize * launcher.metrics.titleScale
                    background: null; maximumLength: 500; Layout.fillWidth: true
                    Keys.onPressed: event => {
                        if (event.key === Qt.Key_Down) { launcher.move(1); event.accepted = true }
                        else if (event.key === Qt.Key_Up) { launcher.move(-1); event.accepted = true }
                        else if (event.key === Qt.Key_Tab) { launcher.hide(); launcher.askRequested(launcher.trimmed); event.accepted = true }
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
                Layout.fillWidth: true
                Layout.preferredHeight: Math.min(contentHeight, launcher.metrics.reading * 0.5)
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
                        Layout.fillWidth: true; implicitHeight: launcher.metrics.navControl
                        highlighted: index === launcher.currentIndex
                        onClicked: { launcher.selectedID = modelData.id; launcher.activate(modelData, 0) }
                        Accessible.name: modelData.title + ", " + modelData.detail
                        // A soft accent like the macOS launcher; the text keeps its own color.
                        background: Rectangle { radius: launcher.metrics.controlRadius; color: parent.highlighted ? Qt.tint(palette.base, Qt.alpha(palette.highlight, launcher.metrics.selectionOpacity * 2)) : parent.hovered ? palette.alternateBase : "transparent" }
                        contentItem: RowLayout {
                            spacing: launcher.metrics.gap
                            Label { text: modelData.title; color: palette.text; elide: Text.ElideMiddle; Layout.fillWidth: true }
                            Label { text: modelData.detail; color: palette.placeholderText; elide: Text.ElideLeft; Layout.maximumWidth: launcher.width * 0.45 }
                        }
                    }
                }
            }
            Label {
                visible: launcher.failed || launcher.desktop.applicationsBusy
                text: launcher.t(launcher.failed ? "launcher_open_failed" : "launcher_loading"); color: palette.placeholderText
                Layout.leftMargin: launcher.metrics.inset; Layout.bottomMargin: launcher.metrics.small
            }
            Rectangle {
                visible: !!launcher.current
                color: palette.alternateBase; Layout.fillWidth: true; implicitHeight: footer.implicitHeight + launcher.metrics.small * 2
                bottomLeftRadius: launcher.metrics.largeRadius; bottomRightRadius: launcher.metrics.largeRadius
                RowLayout {
                    id: footer
                    anchors.fill: parent; anchors.leftMargin: launcher.metrics.inset; anchors.rightMargin: launcher.metrics.inset
                    spacing: launcher.metrics.gap
                    Label { text: launcher.current?.title || ""; elide: Text.ElideMiddle; color: palette.placeholderText; Layout.fillWidth: true }
                    Label { visible: launcher.current?.kind === "file"; text: launcher.t("launcher_reveal") + "  Shift ↵"; color: palette.placeholderText }
                    Label { text: launcher.t(launcher.current?.kind === "copy" ? "launcher_copy" : "launcher_open") + "  ↵"; color: palette.placeholderText }
                    Label { visible: launcher.current?.kind !== "ai"; text: launcher.t("launcher_ai") + (Qt.platform.os === "osx" ? "  ⌘ ↵" : "  Ctrl ↵"); color: palette.placeholderText }
                }
            }
        }
    }
}

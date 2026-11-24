import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Controls.impl
import "SettingsSearch.js" as SettingsSearch
// The launcher: a floating search window for apps, files, quick calculations and sending
// text to Viezan (Review 18; mirrors Launcher.swift). It sits 22% below the top of the
// screen, is driven from the keyboard, and hides when it loses focus.
AuxiliaryWindow {
    id: launcher
    component ShortcutHint: RowLayout {
        property string action
        property string keys
        spacing: launcher.metrics.tight
        Accessible.role: Accessible.StaticText; Accessible.name: action + " " + keys
        Label { text: parent.action; color: palette.placeholderText; Accessible.ignored: true }
        Kit.KeyCap { text: parent.keys; Accessible.ignored: true }
    }
    signal openMainRequested(string sessionID)
    signal askRequested(string text)
    signal openRouteRequested(string route)
    signal openSettingsRequested(string sectionID)
    property string quickSessionID: ""
    readonly property var desktop: bridge.desktopIntegration
    property int homeEpoch: 0
    // Hidden, the launcher follows module changes only; showing it refreshes everything (homeEpoch).
    readonly property var home: { if (visible) bridge.state; else bridge.disabledModules; homeEpoch; return bridge.launcherHome(quickSessionID) }
    onVisibleChanged: {
        if (visible) {
            homeEpoch++
            if (trimmed && trimmed !== resultsQuery) fileDelay.restart()
        } else {
            fileDelay.stop()
            targetMenu.close()
        }
    }
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
    function modifiedTime(seconds) {
        if (typeof seconds !== "number" || !isFinite(seconds)) return ""
        const date = new Date(seconds * 1000), now = new Date()
        const locale = Qt.locale(bridge.locale)
        // Compare local calendar dates across day boundaries and daylight-saving changes.
        const day = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000
        const days = day(now) - day(date)
        if (date > now) {
            if (days === -1) return t("launcherFutureTomorrow")
            if (days < -1) return tpl("launcherFutureDays", {n: (-days).toLocaleString(locale, 'f', 0)})
            const minutesAhead = Math.floor((date - now) / 60000)
            if (minutesAhead < 1) return t("launcherFutureSoon")
            return minutesAhead < 60 ? tpl("launcherFutureMinutes", {n: minutesAhead})
                                     : tpl("launcherFutureHours", {n: Math.floor(minutesAhead / 60)})
        }
        if (days === 1) return t("group_yesterday").toLowerCase()
        if (days > 1) return tpl("historyDaysAgo", {n: days.toLocaleString(locale, 'f', 0)})
        const minutes = Math.floor((now - date) / 60000)
        if (minutes < 1) return t("historyJustNow")
        if (minutes < 60) return tpl("historyMinutesAgo", {n: minutes})
        return tpl("historyHoursAgo", {n: Math.floor(minutes / 60)})
    }
    readonly property string trimmed: query.trim()
    readonly property var money: (desktop.currencyStatus, desktop.currencyTarget, desktop.currencyQuote(trimmed, bridge.locale))
    readonly property string currencySource: money.from || ""
    readonly property bool needsRates: !!currencySource
    // Let bindings finish reading the query before the service publishes its loading state.
    onNeedsRatesChanged: if (needsRates) Qt.callLater(requestRates)
    function requestRates() { if (needsRates) desktop.loadCurrencyRates(false) }
    onQueryChanged: { targetMenu.close(); selectedID = ""; failed = false; resultsQuery = ""; if (visible) fileDelay.restart() }
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
        const prefixKind = ({ask: "ai", translate: "translate", lookup: "dictionary"})[prefix.kind]
        const hasPrefixRow = prefixKind && (prefixKind === "ai" || bridge.moduleEnabled(prefixKind))
        if (hasPrefixRow) {
            rows.push({id: "prefix", kind: prefixKind, query: prefix.value, section: suggestions,
                       title: tpl(({ask: "paletteAsk", translate: "paletteTranslate", lookup: "paletteLookup"})[prefix.kind], {text: prefix.value, query: prefix.value}),
                       detail: "", icon: prefixKind === "ai" ? "reasoning" : prefixKind})
        }
        if (value) rows.push({id: "calc", kind: "copy", section: section("launcher_calculator"), title: (q.startsWith("=") ? q.slice(1).trim() : q) + " = " + value, detail: t("launcher_calculator"), copy: value})
        else if (needsRates) {
            const ready = desktop.currencyStatus === "ready" && money.value !== undefined
            const unavailable = !ready && ["unavailable", "ready"].includes(desktop.currencyStatus)
            rows.push({id: "currency", kind: "currency", section: section("launcher_currency"), icon: "utilities",
                title: money.amount + " " + money.from + (ready ? " = " + money.value + " " : " → ") + money.to,
                detail: ready ? tpl("launcher_currency_rate", money) : t(unavailable ? "launcher_currency_unavailable" : "launcher_currency_loading"),
                copy: ready ? money.value : "", retry: unavailable})
        }
        for (const app of (desktop.applications, desktop.rankApplications(q)))
            rows.push({id: app.id, kind: "app", section: section(q ? "launcher_section_apps" : "launcher_section_recent"), title: app.name, detail: t("launcher_app")})
        if (q && resultsQuery === q) for (const file of desktop.files.slice(0, 5))
            rows.push({id: file.id, kind: "file", section: section("launcher_section_files"), title: file.name,
                       detail: t(file.isDirectory ? "launcher_folder" : "launcher_file"),
                       subtitle: [file.parent, modifiedTime(file.modified)].filter(Boolean).join(" · ")})
        if (q) {
            for (const match of bridge.settingsJump(q, bridge.locale, SettingsSearch.searchableSections(bridge))) {
                rows.push({id: "settings-" + match.id, kind: "settings", sectionID: match.id,
                           section: section("launcher_section_viezan"), title: t(match.title), detail: t("settings"), icon: "settings"})
            }
        }
        if (q && !hasPrefixRow) {
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
    readonly property string currentID: current?.id || ""
    onCurrentIDChanged: failed = false
    function move(step) { if (items.length) selectedID = items[(currentIndex + step + items.length) % items.length].id }
    // ↵ runs the row; Shift+↵ reveals a file; Ctrl/⌘+↵ asks AI about what was typed.
    function activate(item, modifiers) {
        if ((modifiers & (Qt.ControlModifier | Qt.MetaModifier)) && trimmed) { hide(); askRequested(trimmed); return }
        if (!item) return
        if (item.kind === "copy") { bridge.copy(item.copy); hide() }
        else if (item.kind === "currency") {
            if (item.copy) { bridge.copy(item.copy); hide() }
            else if (item.retry) desktop.loadCurrencyRates(true)
        }
        else if (item.kind === "app") { desktop.launch(item.id); if (desktop.error === "launchError") failed = true; else hide() }
        else if (item.kind === "file") { if (modifiers & Qt.ShiftModifier) desktop.revealFile(item.id); else desktop.openFile(item.id); if (desktop.error === "launchError") failed = true; else hide() }
        else if (item.kind === "ai") { hide(); askRequested(item.query === undefined ? trimmed : item.query) }
        else if (item.kind === "continue") { hide(); askRequested("") }
        else if (item.kind === "settings") { hide(); openSettingsRequested(item.sectionID) }
        else if (item.kind === "route") { hide(); openRouteRequested(item.route) }
        else if (item.kind === "translate" || item.kind === "dictionary") openFeature(item.kind, item.query)
        else if (item.kind === "web") { desktop.searchWeb(trimmed); hide() }
    }

    Menu {
        id: targetMenu
        objectName: "launcher-currency-menu"
        parent: launcher.contentItem
        popupType: Popup.Item
        margins: launcher.metrics.small
        height: Math.min(implicitHeight, launcher.height - 2 * margins)
        property Item opener: null
        onClosed: {
            if (launcher.visible) (opener?.visible && opener.enabled ? opener : field).forceActiveFocus(Qt.PopupFocusReason)
            opener = null
        }
        Repeater {
            model: launcher.needsRates ? launcher.desktop.currencyCodes.filter(code => code !== launcher.currencySource) : []
            MenuItem {
                required property string modelData
                text: modelData + " · " + launcher.t("currencyName_" + modelData)
                checkable: true
                checked: modelData === launcher.money.to
                onTriggered: {
                    if (launcher.money.explicitTarget || modelData === launcher.money.from) return
                    targetMenu.opener = null
                    launcher.desktop.currencyTarget = modelData
                    launcher.selectedID = ""
                }
            }
        }
    }

    Item {
        id: frame
        Keys.onEscapePressed: event => {
            event.accepted = !field.inputMethodComposing
            if (event.accepted) launcher.hide()
        }
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
                    readonly property string resultAnnouncement: {
                        if (!launcher.visible) return ""
                        const result = launcher.items.find(row => row.id === "calc" || row.id === "currency")
                        return result ? (result.copy ? result.title : result.detail) : ""
                    }
                    onResultAnnouncementChanged: if (resultAnnouncement) Accessible.announce(resultAnnouncement)
                    text: launcher.query; onTextEdited: launcher.query = text
                    placeholderText: launcher.t("launcher_placeholder"); Accessible.name: placeholderText
                    font.pointSize: Qt.application.font.pointSize * launcher.metrics.titleScale
                    background: null; maximumLength: 2147483647; Layout.fillWidth: true // Keep the full draft when handing off to Quick AI or Translate.
                    Keys.onPressed: event => {
                        if (field.inputMethodComposing) { event.accepted = false; return }
                        if (event.key === Qt.Key_Down) { launcher.move(1); event.accepted = true }
                        else if (event.key === Qt.Key_Up) { launcher.move(-1); event.accepted = true }
                        else if (event.key === Qt.Key_Backtab && launcher.current?.kind === "currency" && results.currentItem?.targetButton.enabled) {
                            results.currentItem.targetButton.forceActiveFocus(Qt.BacktabFocusReason); event.accepted = true
                        }
                        else if (event.key === Qt.Key_Tab && !(event.modifiers & Qt.ShiftModifier)) {
                            if (retryButton.visible) retryButton.forceActiveFocus(Qt.TabFocusReason)
                            else { launcher.hide(); launcher.askRequested(launcher.trimmed) }
                            event.accepted = true
                        }
                        else if (event.key === Qt.Key_Escape) { if (launcher.query) launcher.query = ""; else launcher.hide(); event.accepted = true }
                        else if ((event.key === Qt.Key_Return || event.key === Qt.Key_Enter) && !field.inputMethodComposing) { launcher.activate(launcher.current, event.modifiers); event.accepted = true }
                    }
                }
                Label { visible: !launcher.failed; text: launcher.t("launcher_ai_hint"); color: palette.placeholderText }
                Kit.KeyCap { visible: !launcher.failed; text: "Tab" }
            }
            Rectangle { visible: launcher.items.length > 0; color: palette.mid; implicitHeight: launcher.metrics.hairline; Layout.fillWidth: true }
            ListView {
                id: results
                visible: launcher.items.length > 0
                model: launcher.items
                currentIndex: launcher.currentIndex
                onCurrentIndexChanged: positionViewAtIndex(currentIndex, ListView.Contain)
                clip: true; boundsBehavior: Flickable.StopAtBounds
                ScrollBar.vertical: ScrollBar { Accessible.name: launcher.t("launcher_placeholder"); policy: results.contentHeight > results.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff }
                Layout.fillWidth: true
                Layout.preferredHeight: Math.min(contentHeight, launcher.metrics.reading * launcher.metrics.launcherResults)
                Layout.margins: launcher.metrics.small
                Accessible.role: Accessible.List; Accessible.name: launcher.t("launcher_placeholder")
                delegate: ColumnLayout {
                    required property var modelData
                    required property int index
                    readonly property alias targetButton: currencyButton
                    width: ListView.view.width; spacing: 0
                    Label {
                        visible: index === 0 || launcher.items[index - 1]?.section !== modelData.section
                        Accessible.role: Accessible.Heading; text: modelData.section; font.bold: true; color: palette.placeholderText
                        font.pointSize: Qt.application.font.pointSize * launcher.metrics.captionScale
                        Layout.leftMargin: launcher.metrics.small; Layout.topMargin: launcher.metrics.small; Layout.bottomMargin: launcher.metrics.tight
                    }
                    ItemDelegate {
                        objectName: "launcher-result-" + modelData.id
                        Layout.fillWidth: true
                        implicitHeight: Math.max(launcher.metrics.navControl + launcher.metrics.tight, implicitContentHeight + topPadding + bottomPadding)
                        highlighted: index === launcher.currentIndex
                        onClicked: { launcher.selectedID = modelData.id; launcher.activate(modelData, 0) }
                        Accessible.role: Accessible.ListItem
                        Accessible.name: modelData.kind === "file" ? [modelData.title, modelData.detail, modelData.subtitle].filter(Boolean).join(", ") : modelData.title
                        Accessible.description: modelData.kind === "file" ? "" : modelData.detail
                        Accessible.selectable: true
                        Accessible.selected: highlighted
                        // A soft accent like the macOS launcher; the text keeps its own color.
                        background: Item {
                            Kit.GlassLens { anchors.fill: parent; visible: parent.parent.highlighted }
                            Rectangle { anchors.fill: parent; radius: launcher.metrics.controlRadius; color: "transparent"; border.width: parent.parent.visualFocus ? launcher.metrics.focusRingWidth : 0; border.color: launcher.colors.action }
                        }
                        contentItem: RowLayout {
                            spacing: launcher.metrics.gap
                            IconImage { source: "icons/" + (modelData.icon || ({app:"apps",file:"data",copy:"utilities",ai:"reasoning",translate:"translate",dictionary:"dictionary",web:"search"})[modelData.kind] || "open") + ".svg"; sourceSize.width: launcher.metrics.icon; sourceSize.height: launcher.metrics.icon; color: launcher.colors["text-muted"]; Accessible.ignored: true }
                            ColumnLayout {
                                Layout.fillWidth: true; spacing: 0
                                Label { Accessible.ignored: true; text: modelData.title; textFormat: Text.PlainText; color: modelData.kind === "file" ? (launcher.colors["text-strong"] || palette.text) : palette.text; elide: Text.ElideMiddle; Layout.fillWidth: true }
                                Label {
                                    visible: modelData.kind === "file" && !!modelData.subtitle
                                    text: modelData.subtitle || ""; textFormat: Text.PlainText; elide: Text.ElideMiddle
                                    color: palette.placeholderText; font.pointSize: Qt.application.font.pointSize * launcher.metrics.captionScale
                                    Layout.fillWidth: true; Accessible.ignored: true
                                }
                                Label { Accessible.ignored: true; visible: modelData.kind === "currency"; font.pointSize: Qt.application.font.pointSize * launcher.metrics.captionScale; text: modelData.detail; color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                            }
                            Kit.QuietButton {
                                id: currencyButton
                                objectName: "launcher-currency-target"
                                visible: modelData.kind === "currency"
                                enabled: visible && !launcher.money.explicitTarget
                                text: visible ? launcher.t("launcher_currency_target_named").replace("{code}", launcher.money.to) : ""
                                popupOpen: targetMenu.visible
                                Accessible.name: text
                                contentItem: RowLayout {
                                    spacing: launcher.metrics.tight
                                    Label { text: currencyButton.text; color: currencyButton.enabled ? palette.buttonText : palette.disabled.buttonText; Accessible.ignored: true }
                                    Kit.Chevron {
                                        objectName: "launcher-currency-chevron"
                                        color: currencyButton.enabled ? palette.placeholderText : palette.disabled.buttonText
                                    }
                                }
                                onClicked: {
                                    const at = mapToItem(launcher.contentItem, 0, height)
                                    targetMenu.opener = currencyButton
                                    targetMenu.popup(at.x, at.y)
                                }
                            }
                            Label { Accessible.ignored: true; visible: modelData.kind !== "currency"; text: modelData.detail; color: modelData.kind === "file" ? (launcher.colors["text-soft"] || palette.placeholderText) : palette.placeholderText; elide: Text.ElideLeft; Layout.maximumWidth: launcher.width * 0.45 }
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
                    Kit.GlassButton { id: retryButton; objectName: "launcher-retry"; text: launcher.t("retry"); onClicked: if (launcher.failed) launcher.activate(launcher.current, 0) }
                }
            }
            Rectangle {
                visible: !!launcher.current
                color: palette.alternateBase; Layout.fillWidth: true; implicitHeight: footer.implicitHeight + launcher.metrics.small * 2
                bottomLeftRadius: launcher.metrics.surfaceRadius; bottomRightRadius: launcher.metrics.surfaceRadius
                Rectangle { anchors.top: parent.top; width: parent.width; height: launcher.metrics.hairline; color: launcher.colors.divider; Accessible.ignored: true }
                RowLayout {
                    id: footer
                    anchors.fill: parent; anchors.leftMargin: launcher.metrics.inset; anchors.rightMargin: launcher.metrics.inset
                    spacing: launcher.metrics.gap
                    Label { text: !launcher.trimmed ? launcher.t("launcher_prefix_hint") : launcher.current?.title || ""; elide: Text.ElideMiddle; color: palette.placeholderText; Layout.fillWidth: true }
                    ShortcutHint { visible: launcher.current?.kind === "file"; action: launcher.t("launcher_reveal"); keys: "Shift ↵" }
                    ShortcutHint {
                        readonly property bool currency: launcher.current?.kind === "currency"
                        visible: !currency || !!launcher.current.copy || launcher.current.retry
                        action: launcher.t(currency && launcher.current.retry ? "retry" : currency || launcher.current?.kind === "copy" ? "launcher_copy" : "launcher_open")
                        keys: "↵"
                    }
                    ShortcutHint { visible: launcher.current?.kind !== "ai"; action: launcher.t("launcher_ai"); keys: Qt.platform.os === "osx" ? "⌘ ↵" : "Ctrl ↵" }
                }
            }
        }
    }
}

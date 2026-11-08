import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Popup {
    id: sheet
    objectName: "update-sheet"
    required property var bridge
    readonly property var updates: bridge.updates
    readonly property var prompt: bridge.updatePrompt
    readonly property var metrics: bridge.resources.metrics
    readonly property bool dark: bridge.state.appearance?.preset === "midnight" || bridge.state.appearance?.mode === "dark" || (bridge.state.appearance?.mode !== "light" && Qt.styleHints.colorScheme === Qt.Dark)
    readonly property var colors: bridge.resources.themePalettes[(bridge.state.appearance?.preset || "graphite") + ":" + (bridge.state.appearance?.accent || "auto")][dark ? "dark" : "light"]
    readonly property string phase: updates.busy ? "downloading" : updates.ready ? "ready" : "available"
    property Item previousFocus: null
    property bool presentAfterCheck: false
    readonly property bool updateBusy: updates.busy
    function checkForUpdates() { presentAfterCheck = true; updates.check() }
    onUpdateBusyChanged: if (!updateBusy && presentAfterCheck) { presentAfterCheck = false; bridge.presentUpdateIfAvailable() }
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    function tpl(key, values) { let text = t(key); for (const name in values) text = text.split("{" + name + "}").join(values[name]); return text }
    function syncPrompt() { if (prompt.version) { if (!visible) open() } else if (visible) close() }
    onPromptChanged: syncPrompt()
    Component.onCompleted: syncPrompt()
    onAboutToShow: previousFocus = parent ? parent.Window.window.activeFocusItem : null
    onOpened: later.forceActiveFocus(Qt.PopupFocusReason)
    onAboutToHide: if (prompt.version) bridge.dismissUpdatePrompt()
    onClosed: if (previousFocus) previousFocus.forceActiveFocus(Qt.PopupFocusReason)
    parent: Overlay.overlay
    popupType: Popup.Item
    modal: true; focus: true; closePolicy: Popup.CloseOnEscape
    width: Math.min(metrics.dialog - metrics.navControl, parent ? parent.width - metrics.large : metrics.dialog)
    height: Math.min(implicitHeight, parent ? parent.height - metrics.large : metrics.dialog)
    x: parent ? (parent.width - width) / 2 : 0
    y: parent ? (parent.height - height) / 2 : 0
    padding: metrics.inset + metrics.tight
    leftInset: 0; rightInset: 0; topInset: 0; bottomInset: 0
    background: Kit.ReadingPanelSurface { radius: sheet.metrics.chromeCardRadius + sheet.metrics.hairline * 2 }
    Overlay.modal: Rectangle { color: Qt.alpha(sheet.colors["shadow-lg-color"], sheet.metrics.overlayShadowOpacity) }
    contentItem: ColumnLayout {
        Accessible.role: Accessible.Dialog
        Accessible.name: sheet.t("updateTitle")
        spacing: sheet.metrics.gap
        RowLayout {
            Layout.fillWidth: true; spacing: sheet.metrics.inset
            Image { source: "brand.png"; sourceSize.width: sheet.metrics.navControl + sheet.metrics.inset; sourceSize.height: sheet.metrics.navControl + sheet.metrics.inset; Layout.preferredWidth: sheet.metrics.navControl + sheet.metrics.inset; Layout.preferredHeight: sheet.metrics.navControl + sheet.metrics.inset; Accessible.ignored: true }
            ColumnLayout {
                Layout.fillWidth: true
                Label { text: sheet.t("updateTitle"); font.bold: true; font.pointSize: Qt.application.font.pointSize * sheet.metrics.subtitleScale; wrapMode: Text.Wrap; Layout.fillWidth: true; Accessible.role: Accessible.Heading }
                Label {
                    objectName: "update-sheet-status"; Layout.fillWidth: true; wrapMode: Text.Wrap; color: sheet.colors["text-muted"]
                    text: sheet.phase === "ready" ? sheet.tpl("updateReadyVersion", {version: sheet.prompt.version || ""}) : sheet.phase === "downloading" ? sheet.tpl("updateDownloading", {percent: Math.round(sheet.updates.progress * 100)}) : sheet.tpl(sheet.updates.packageSize > 0 ? "updateSheetSummary" : "updateSheetSummaryNoSize", {version: sheet.prompt.version || "", size: (sheet.updates.packageSize / 1000000).toLocaleString(Qt.locale(sheet.bridge.state.locale), 'f', 1) + " MB", current: Qt.application.version})
                }
                Label { visible: sheet.phase !== "available" && sheet.updates.packageSize > 0; text: (sheet.updates.packageSize / 1000000).toLocaleString(Qt.locale(sheet.bridge.state.locale), 'f', 1) + " MB"; color: sheet.colors["text-muted"] }
            }
            Kit.IconButton { objectName: "update-sheet-close"; iconName: "close"; text: sheet.t("close"); onClicked: sheet.bridge.dismissUpdatePrompt() }
        }
        ScrollView {
            id: notesScroll; visible: sheet.phase === "available" && !!sheet.prompt.notes
            Layout.fillWidth: true; Layout.fillHeight: true
            Layout.preferredHeight: Math.min(notes.implicitHeight, sheet.metrics.editor)
            contentWidth: availableWidth
            ScrollBar.vertical.policy: notes.implicitHeight > availableHeight ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff
            TextArea { id: notes; text: sheet.prompt.notes || ""; textFormat: TextEdit.PlainText; wrapMode: TextEdit.Wrap; readOnly: true; selectByMouse: true; background: null; padding: 0 }
        }
        ProgressBar { objectName: "update-sheet-progress"; visible: sheet.phase === "downloading"; value: sheet.updates.progress; Layout.fillWidth: true; Accessible.name: sheet.t("updateStatus") }
        Label { visible: sheet.phase === "downloading" && sheet.updates.remainingSeconds >= 0; text: sheet.tpl(sheet.updates.remainingSeconds < 60 ? "updateRemainingSeconds" : "updateRemainingMinutes", {n: Math.ceil(sheet.updates.remainingSeconds < 60 ? sheet.updates.remainingSeconds : sheet.updates.remainingSeconds / 60)}); wrapMode: Text.Wrap; Layout.fillWidth: true }
        Label { visible: sheet.phase !== "available"; text: sheet.t(sheet.phase === "ready" ? "updateReady" : "updatesHint"); wrapMode: Text.Wrap; Layout.fillWidth: true; color: sheet.colors["text-muted"] }
        PanelNotice { bridge: sheet.bridge; visible: sheet.updates.status === "updateError" || sheet.updates.status === "updateSignatureError"; text: sheet.t(sheet.updates.status); danger: true; Layout.fillWidth: true }
        Flow {
            Layout.fillWidth: true; spacing: sheet.metrics.small
            Kit.QuietButton { text: sheet.t("viewChanges"); onClicked: Qt.openUrlExternally("https://github.com/trunghieupham59/viezan/releases") }
            Kit.GlassButton { id: later; objectName: "update-sheet-snooze"; text: sheet.t("remindLater"); onClicked: sheet.bridge.snoozeUpdate() }
            Kit.PrimaryButton { objectName: "update-sheet-download"; visible: sheet.phase === "available"; text: sheet.t("downloadUpdate"); onClicked: sheet.updates.download() }
            SettingsDangerButton { objectName: "update-sheet-cancel"; visible: sheet.phase === "downloading"; text: sheet.t("cancel"); onClicked: sheet.updates.cancel() }
            Kit.PrimaryButton { objectName: "update-sheet-install"; visible: sheet.phase === "ready"; text: sheet.t("openUpdate"); onClicked: sheet.updates.openInstaller() }
        }
    }
}

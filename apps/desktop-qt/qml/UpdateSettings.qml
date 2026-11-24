import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
ColumnLayout {
    id: panel
    required property var bridge
    readonly property var updates: bridge.updates
    readonly property var metrics: bridge.metrics
    property bool presentAfterCheck: false
    readonly property bool updateBusy: updates.busy
    onUpdateBusyChanged: if (!updateBusy && presentAfterCheck) { presentAfterCheck = false; bridge.presentUpdateIfAvailable() }
    property double now: Date.now() / 1000
    readonly property var localeStrings: bridge.strings
    function t(key) { return localeStrings[key] || key }
    function checkedText() {
        if (!(updates.checkedAt > 0)) return ""
        const minutes = Math.max(0, Math.floor((now - updates.checkedAt) / 60))
        const ago = minutes < 1 ? t("historyJustNow") : minutes < 60 ? t("historyMinutesAgo").replace("{n}", minutes) : minutes < 1440 ? t("historyHoursAgo").replace("{n}", Math.floor(minutes / 60)) : t("historyDaysAgo").replace("{n}", Math.floor(minutes / 1440))
        return t("updateCheckedAgo").replace("{time}", ago)
    }
    function remainingText() { const n = updates.remainingSeconds; return n < 0 ? "" : t(n < 60 ? "updateRemainingSeconds" : "updateRemainingMinutes").replace("{n}", Math.ceil(n < 60 ? n : n / 60)) }
    function statusText() {
        if (updates.busy) return updates.version ? t("updateDownloading").replace("{percent}", Math.round(updates.progress * 100)) : t("updateChecking")
        if (updates.status === "updateReady" || updates.status === "updateInstallError") return t(install.automaticInstall ? "updateReadyInstall" : "updateReady")
        return updates.status ? t(updates.status) : ""
    }
    component ReadyButton: Kit.PrimaryButton {
        required property var bridge
        readonly property bool automaticInstall: bridge.updates.canInstall && bridge.updates.status !== "updateInstallError"
        signal saveFailed()
        text: bridge.strings[automaticInstall ? "installUpdate" : "openUpdate"]
        enabled: bridge.updates.status !== "updateInstalling"
        onClicked: {
            if (!automaticInstall) { bridge.updates.openInstaller(); return }
            // Save without shutting services down: if the installer cannot start, the app keeps working.
            bridge.save()
            if (bridge.storageError && !bridge.loadBlocked) { saveFailed(); return }
            if (bridge.updates.install()) Qt.quit()
        }
    }
    Timer { interval: 60000; repeat: true; running: panel.visible; onTriggered: panel.now = Date.now() / 1000 }
    spacing: metrics.inset
    Kit.CardBox {
        title: panel.t("updatesTitle"); Layout.fillWidth: true
        ColumnLayout {
            width: parent.width; spacing: 0
            Kit.CardRow { title: panel.t("currentVersion"); detail: "Viezan " + Qt.application.version }
            Kit.CardRow {
                title: panel.t("autoCheckUpdates"); detail: panel.t("autoCheckUpdatesDescription")
                Kit.GlassSwitch { objectName: "settings-auto-updates"; checked: panel.bridge.autoCheckUpdates; enabled: !panel.bridge.loadBlocked; Accessible.name: panel.t("autoCheckUpdates"); onToggled: panel.bridge.autoCheckUpdates = checked }
            }
            Kit.CardRow {
                objectName: "settings-update-status"; title: panel.t("updateStatus"); detail: [panel.statusText(), panel.checkedText()].filter(Boolean).join(" · "); divider: false
                Kit.GlassButton { objectName: "settings-check-updates"; text: panel.t("checkUpdates"); enabled: !panel.updates.busy; onClicked: { if (panel.Window.window?.updatePresentation) panel.Window.window.updatePresentation.checkForUpdates(); else { panel.presentAfterCheck = true; panel.updates.check() } } }
            }
        }
    }
    Kit.CardBox {
        visible: !!panel.updates.version; title: "Viezan " + panel.updates.version; Layout.fillWidth: true
        ColumnLayout {
            width: parent.width; spacing: panel.metrics.small
            TextArea { objectName: "update-notes"; Accessible.name: panel.t("releaseNotes"); text: panel.updates.notes; visible: !!text; textFormat: TextEdit.PlainText; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; Layout.fillWidth: true; background: Item {} }
            Label { objectName: "settings-update-size"; visible: panel.updates.packageSize > 0; text: (panel.updates.packageSize / 1000000).toLocaleString(Qt.locale(panel.bridge.locale), 'f', 1) + " MB"; color: palette.placeholderText }
            ProgressBar { objectName: "update-progress"; Accessible.name: panel.t("updateStatus"); visible: panel.updates.busy; value: panel.updates.progress; Layout.fillWidth: true }
            Label { objectName: "settings-update-remaining"; visible: panel.updates.busy && panel.updates.remainingSeconds >= 0; text: panel.remainingText(); color: palette.placeholderText }
            PanelNotice { bridge: panel.bridge; visible: panel.updates.status === "updateInstallError"; text: panel.t("updateInstallError"); danger: true; Layout.fillWidth: true }
            Flow {
                Layout.fillWidth: true; spacing: panel.metrics.small
                Kit.PrimaryButton { text: panel.t("downloadUpdate"); visible: !panel.updates.ready; enabled: !!panel.updates.version && !panel.updates.busy; onClicked: panel.updates.download() }
                SettingsDangerButton { text: panel.t("cancel"); visible: panel.updates.busy; onClicked: panel.updates.cancel() }
                ReadyButton { id: install; objectName: "settings-update-install"; bridge: panel.bridge; visible: panel.updates.ready }
            }
        }
    }
    SettingsDangerButton { text: panel.t("cancel"); visible: panel.updates.busy && !panel.updates.version; onClicked: panel.updates.cancel() }
    Kit.GlassButton { text: panel.t("releaseNotes"); onClicked: Qt.openUrlExternally("https://github.com/trunghieupham59/viezan/releases") }
}

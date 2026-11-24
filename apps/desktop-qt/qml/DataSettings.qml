import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs
ColumnLayout {
    id: data
    required property var bridge
    // One conversion of the bridge state per change, shared by every binding below.
    // A host that already holds one passes it in.
    property var snapshot: bridge.state
    signal feedback(string message, bool error)
    readonly property var metrics: bridge.metrics
    readonly property bool blocked: bridge.loadBlocked || bridge.backupBusy || bridge.interpretation.busy || snapshot.tasks.some(task => task.status === "running")
    readonly property int historyCount: (snapshot, bridge.interpretation.sessions, bridge.clearableHistoryCount())
    readonly property var localeStrings: bridge.strings
    function t(key) { return localeStrings[key] || key }
    function runHistory(command) {
        if (blocked) return
        bridge.command(command, command === "trimHistory" ? {keep: Number(keep.currentText)} : {})
        feedback(t(bridge.storageError || "succeeded"), !!bridge.storageError)
    }
    spacing: metrics.inset
    Kit.CardBox {
        title: data.t("history"); Layout.fillWidth: true
        ColumnLayout {
            width: parent.width; spacing: 0
            Kit.CardRow {
                title: data.t("historyKeep")
                SettingsPicker { id: keep; objectName: "settings-history-keep"; model: [20, 100, 500, 1000]; currentIndex: 1; Accessible.name: data.t("historyKeep") }
            }
            Kit.CardRow {
                title: data.t("trimHistory"); detail: data.t("trimHistoryConfirm")
                SettingsDangerButton { objectName: "settings-trim-history"; text: data.t("trimHistory"); enabled: !data.blocked; popupOpen: trim.visible; onClicked: trim.openFrom(this) }
            }
            Kit.CardRow {
                title: data.t("clearHistory"); detail: data.t("clearHistoryDetail"); divider: false
                SettingsDangerButton { objectName: "settings-clear-history"; text: data.t("clearHistoryAction"); enabled: !data.blocked && data.historyCount > 0; popupOpen: clearAll.visible; onClicked: clearAll.openFrom(this) }
            }
        }
    }
    SettingsConfirm {
        id: trim; fallbackFocusItem: keep; objectName: "settings-trim-dialog"; bridge: data.bridge
        title: data.t("trimHistory"); message: data.t("trimHistoryConfirm"); actionText: data.t("trimHistory")
        actionEnabled: !data.blocked
        onAccepted: data.runHistory("trimHistory")
    }
    SettingsConfirm {
        id: clearAll; fallbackFocusItem: keep; objectName: "settings-clear-dialog"; bridge: data.bridge
        title: data.t("clearHistory"); message: data.t("clearHistoryConfirm").replace("{count}", data.historyCount)
        actionText: data.t("clearHistoryAction"); actionEnabled: !data.blocked && data.historyCount > 0
        onAccepted: data.runHistory("clearHistory")
    }
    Kit.CardBox {
        title: data.t("usageTitle"); Layout.fillWidth: true
        UsageSettings { snapshot: data.snapshot; bridge: data.bridge; width: parent.width; onFeedback: (message, error) => data.feedback(message, error) }
    }
    Kit.CardBox {
        title: data.t("backupTitle"); Layout.fillWidth: true
        ColumnLayout {
            width: parent.width; spacing: data.metrics.small
            Kit.CardRow {
                title: data.t("exportBackup")
                Kit.GlassButton { text: data.t("exportBackup"); enabled: !data.bridge.backupBusy && !data.bridge.loadBlocked; popupOpen: exportPicker.visible; onClicked: exportPicker.open() }
            }
            Kit.CardRow {
                title: data.t("importBackup"); divider: data.bridge.backupPreview.newSessions !== undefined
                Kit.GlassButton { text: data.t("importBackup"); enabled: !data.bridge.backupBusy && !data.bridge.loadBlocked; popupOpen: importPicker.visible; onClicked: importPicker.open() }
            }
            BusyIndicator { objectName: "backup-busy"; Accessible.name: data.t("backupTitle"); running: data.bridge.backupBusy; visible: running }
            ColumnLayout {
                visible: data.bridge.backupPreview.newSessions !== undefined
                Layout.fillWidth: true
                Label { text: data.t("newSessions") + ": " + (data.bridge.backupPreview.newSessions || 0); wrapMode: Text.Wrap; Layout.fillWidth: true }
                Label { text: data.t("interpret") + ": " + (data.bridge.backupPreview.interpretation || 0) }
                Label { text: data.t("existingSessions") + ": " + (data.bridge.backupPreview.existingSessions || 0); wrapMode: Text.Wrap; Layout.fillWidth: true }
                Kit.GlassSwitch { id: restorePreferences; Accessible.name: text; text: data.t("restorePreferences"); Layout.fillWidth: true; contentItem: Label { text: restorePreferences.text; leftPadding: restorePreferences.indicator.width + restorePreferences.spacing; wrapMode: Text.Wrap; verticalAlignment: Text.AlignVCenter } }
                Label { visible: restorePreferences.checked && !!data.bridge.backupPreview.migratedAppearance; text: data.t("backupGlassAppearance"); wrapMode: Text.Wrap; Layout.fillWidth: true }
                Flow {
                    Layout.fillWidth: true; spacing: data.metrics.small
                    Kit.GlassButton { text: data.t("close"); enabled: !data.bridge.backupBusy; onClicked: data.bridge.dismissBackup() }
                    Kit.PrimaryButton { text: data.t("confirmImport"); enabled: !data.blocked; onClicked: data.bridge.confirmBackup(restorePreferences.checked) }
                }
            }
            Label { text: data.t(data.bridge.backupStatus); visible: !!data.bridge.backupStatus; wrapMode: Text.Wrap; Layout.fillWidth: true }
        }
    }
    Connections { target: data.bridge; function onChanged() { if (data.lastBackupStatus !== data.bridge.backupStatus) { data.lastBackupStatus = data.bridge.backupStatus; if (data.lastBackupStatus && !data.bridge.backupBusy) data.feedback(data.t(data.lastBackupStatus), data.lastBackupStatus === "backupError") } } }
    property string lastBackupStatus: ""
    FileDialog { id: exportPicker; fileMode: FileDialog.SaveFile; defaultSuffix: "json"; nameFilters: ["JSON (*.json)"]; onAccepted: data.bridge.exportBackup(selectedFile) }
    FileDialog { id: importPicker; fileMode: FileDialog.OpenFile; nameFilters: ["JSON (*.json)"]; onAccepted: { restorePreferences.checked = false; data.bridge.inspectBackup(selectedFile) } }
}

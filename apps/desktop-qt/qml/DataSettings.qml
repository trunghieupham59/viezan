import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs
ColumnLayout {
    id: data
    required property var bridge
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    UsageSettings { bridge: data.bridge; Layout.fillWidth: true }
    RowLayout {
        Label { text: data.t("historyKeep") }
        ComboBox { id: keep; model: [20, 100, 500, 1000]; currentIndex: 1; Accessible.name: data.t("historyKeep") }
        Button { text: data.t("trimHistory"); enabled: !data.bridge.loadBlocked && !data.bridge.state.tasks.some(t => t.status === "running"); onClicked: trim.open() }
    }
    Dialog { id: trim; title: data.t("trimHistory"); modal: true; standardButtons: Dialog.Ok | Dialog.Cancel; Label { text: data.t("trimHistoryConfirm"); wrapMode: Text.Wrap; width: data.bridge.resources.metrics.reading } onAccepted: data.bridge.command("trimHistory", {keep: Number(keep.currentText)}) }
    Label { text: data.t("backupDescription"); wrapMode: Text.Wrap; Layout.fillWidth: true }
    RowLayout {
        Button { text: data.t("exportBackup"); enabled: !data.bridge.backupBusy && !data.bridge.loadBlocked; onClicked: exportPicker.open() }
        Button { text: data.t("importBackup"); enabled: !data.bridge.backupBusy && !data.bridge.loadBlocked; onClicked: importPicker.open() }
    }
    BusyIndicator { running: data.bridge.backupBusy; visible: running }
    ColumnLayout {
        visible: data.bridge.backupPreview.newSessions !== undefined
        Label { text: data.t("interpretation") + ": " + (data.bridge.backupPreview.interpretation || 0) }
        Label { text: data.t("newSessions") + ": " + (data.bridge.backupPreview.newSessions || 0) }
        Label { text: data.t("existingSessions") + ": " + (data.bridge.backupPreview.existingSessions || 0) }
        CheckBox { id: restorePreferences; text: data.t("restorePreferences") }
        Button { text: data.t("confirmImport"); enabled: !data.bridge.backupBusy; onClicked: data.bridge.confirmBackup(restorePreferences.checked) }
        Button { text: data.t("close"); enabled: !data.bridge.backupBusy; onClicked: data.bridge.dismissBackup() }
    }
    Label { text: data.t(data.bridge.backupStatus); visible: !!data.bridge.backupStatus; wrapMode: Text.Wrap; Layout.fillWidth: true }
    FileDialog { id: exportPicker; fileMode: FileDialog.SaveFile; defaultSuffix: "json"; nameFilters: ["JSON (*.json)"]; onAccepted: data.bridge.exportBackup(selectedFile) }
    FileDialog { id: importPicker; fileMode: FileDialog.OpenFile; nameFilters: ["JSON (*.json)"]; onAccepted: data.bridge.inspectBackup(selectedFile) }
}

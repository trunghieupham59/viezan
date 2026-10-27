import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
ColumnLayout {
    id: panel
    required property var bridge
    readonly property var updates: bridge.updates
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    Label { text: panel.t("updatesTitle"); font.bold: true }
    Label { text: panel.t("updatesHint"); wrapMode: Text.Wrap; Layout.fillWidth: true }
    Flow {
        Layout.fillWidth: true; Layout.preferredHeight: implicitHeight; spacing: panel.bridge.resources.metrics.small
        Button { text: panel.t("checkUpdates"); enabled: !panel.updates.busy; onClicked: panel.updates.check() }
        Button { text: panel.t("downloadUpdate"); enabled: !!panel.updates.version && !panel.updates.busy; onClicked: panel.updates.download() }
        Button { text: panel.t("cancel"); visible: panel.updates.busy; onClicked: panel.updates.cancel() }
        Button { text: panel.t("openUpdate"); visible: panel.updates.ready; onClicked: panel.updates.openInstaller() }
    }
    ProgressBar { visible: panel.updates.busy; value: panel.updates.progress; Layout.fillWidth: true }
    Label { text: panel.t(panel.updates.status); visible: !!panel.updates.status; wrapMode: Text.Wrap; Layout.fillWidth: true }
    Label { text: panel.updates.version; visible: !!text }
    TextArea { text: panel.updates.notes; visible: !!text; textFormat: TextEdit.PlainText; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; Layout.fillWidth: true }
    Button { text: panel.t("releaseNotes"); onClicked: Qt.openUrlExternally("https://github.com/trunghieupham59/viezan/releases") }
}

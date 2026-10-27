import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
Item {
    id: root
    required property var bridge
    readonly property var desktop: bridge.desktopIntegration
    readonly property var metrics: bridge.resources.metrics
    property string selectedID: ""
    readonly property var selected: desktop.applications.find(value => value.id === selectedID)
    readonly property var filtered: desktop.applications.filter(value => !search.text || value.name.toLocaleLowerCase().includes(search.text.toLocaleLowerCase()))
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    Component.onCompleted: desktop.refreshApplications()
    ColumnLayout {
        anchors.fill: parent; anchors.margins: root.metrics.inset; spacing: root.metrics.inset
        RowLayout {
            TextField { id: search; placeholderText: root.t("searchLabel"); Accessible.name: placeholderText; Layout.fillWidth: true; selectByMouse: true }
            Button { text: root.t("refresh"); enabled: !root.desktop.applicationsBusy; onClicked: root.desktop.refreshApplications() }
        }
        Label { text: root.t("appNativePlatformHint"); wrapMode: Text.Wrap; Layout.fillWidth: true; color: palette.placeholderText }
        BusyIndicator { visible: running; running: root.desktop.applicationsBusy; implicitHeight: root.metrics.control; implicitWidth: root.metrics.control }
        GridLayout {
            Layout.fillWidth: true; Layout.fillHeight: true
            columns: width >= root.metrics.reading ? 2 : 1
            rowSpacing: root.metrics.inset; columnSpacing: root.metrics.inset
            ListView {
                id: inventory
                Layout.fillWidth: true; Layout.fillHeight: true; Layout.preferredWidth: root.metrics.sidebar
                clip: true
                model: root.filtered
                currentIndex: root.filtered.findIndex(value => value.id === root.selectedID)
                ScrollBar.vertical: ScrollBar {}
                delegate: ItemDelegate {
                    required property var modelData
                    text: modelData.name; width: ListView.view.width
                    highlighted: root.selectedID === modelData.id
                    Accessible.name: text; Accessible.selected: highlighted
                    onClicked: root.selectedID = modelData.id
                    Keys.onReturnPressed: root.selectedID = modelData.id
                    ToolTip.visible: hovered; ToolTip.text: text
                }
                EmptyState { anchors.fill: parent; visible: !root.filtered.length && !root.desktop.applicationsBusy; heading: root.t("appsEmpty"); detail: root.t("appsEmptyHint"); metrics: root.metrics }
            }
            Frame {
                visible: !!root.selected
                Layout.fillWidth: true; Layout.fillHeight: parent.columns === 2
                Layout.preferredWidth: root.metrics.reading
                padding: root.metrics.inset
                ColumnLayout {
                    anchors.fill: parent; spacing: root.metrics.small
                    Label { text: root.selected?.name || ""; font.bold: true; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Label { text: root.selected?.id || ""; wrapMode: Text.WrapAnywhere; Layout.fillWidth: true; color: palette.placeholderText }
                    Flow {
                        Layout.fillWidth: true; spacing: root.metrics.small
                        Button { text: root.t("open"); enabled: !!root.selected; onClicked: root.desktop.launch(root.selected.id) }
                        Button { text: root.t("reveal"); enabled: !!root.selected; onClicked: root.desktop.revealFile(root.selected.id) }
                        Button { visible: Qt.platform.os === "windows"; text: root.t("openSystemSettings"); onClicked: root.desktop.openApplicationSettings() }
                    }
                    Item { Layout.fillHeight: true }
                }
            }
        }
        Label { text: root.desktop.error ? root.t(root.desktop.error) : ""; visible: !!text; wrapMode: Text.Wrap; Layout.fillWidth: true }
    }
}

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
Item {
    id: root
    required property var bridge
    readonly property var desktop: bridge.desktopIntegration
    readonly property var metrics: bridge.resources.metrics
    property string selectedID: ""
    readonly property bool linux: Qt.platform.os === "linux"
    readonly property var selected: desktop.applications.find(value => value.id === selectedID)
    readonly property var filtered: desktop.applications.filter(value => !search.text || value.name.toLocaleLowerCase().includes(search.text.toLocaleLowerCase()))
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    Component.onCompleted: desktop.refreshApplications()
    onFilteredChanged: if (!selectedID && filtered.length) selectedID = filtered[0].id
    ColumnLayout {
        anchors.fill: parent; anchors.leftMargin: root.metrics.large; anchors.rightMargin: root.metrics.large; anchors.topMargin: root.metrics.gutter; anchors.bottomMargin: root.metrics.inset
        spacing: root.metrics.inset
        Kit.PageIntro { title: root.t("qtAppsTitle"); subtitle: root.t("qtAppsSubtitle").replace("{platform}", root.linux ? "Linux" : "Windows"); Layout.fillWidth: true }
        // Platform rule from Review 18: never apply macOS bundle removal elsewhere.
        Pane {
            Layout.fillWidth: true
            padding: root.metrics.inset
            background: Rectangle { radius: root.metrics.radius; color: Qt.tint(palette.base, Qt.alpha(palette.highlight, root.metrics.selectionOpacity)) }
            Label { width: parent.width; text: root.t(root.linux ? "appsNoticeLinux" : "appsNoticeWindows"); wrapMode: Text.Wrap }
        }
        RowLayout {
            spacing: root.metrics.small
            TextField { id: search; placeholderText: root.t("searchLabel"); Accessible.name: placeholderText; Layout.preferredWidth: root.metrics.sidebar + root.metrics.large; selectByMouse: true }
            Kit.IconButton { iconName: "refresh"; text: root.t("refresh"); enabled: !root.desktop.applicationsBusy; onClicked: root.desktop.refreshApplications() }
            BusyIndicator { visible: running; running: root.desktop.applicationsBusy; implicitHeight: root.metrics.control; implicitWidth: root.metrics.control }
            Item { Layout.fillWidth: true }
        }
        GridLayout {
            id: split
            Layout.fillWidth: true; Layout.fillHeight: true
            columns: width >= root.metrics.reading ? 2 : 1
            rowSpacing: root.metrics.inset; columnSpacing: root.metrics.inset
            Kit.Card {
                padding: root.metrics.small
                Layout.fillWidth: true; Layout.fillHeight: true; Layout.preferredWidth: root.metrics.sidebar
                visible: split.columns === 2 || !root.selected
                ListView {
                    id: inventory
                    anchors.fill: parent
                    clip: true
                    spacing: root.metrics.tight
                    model: root.filtered
                    currentIndex: root.filtered.findIndex(value => value.id === root.selectedID)
                    ScrollBar.vertical: ScrollBar {}
                    delegate: ItemDelegate {
                        required property var modelData
                        text: modelData.name; width: ListView.view.width
                        highlighted: root.selectedID === modelData.id
                        Accessible.name: text; Accessible.selected: highlighted
                        background: Rectangle { radius: root.metrics.radius; color: parent.highlighted ? Qt.tint(palette.base, Qt.alpha(palette.highlight, root.metrics.selectionOpacity)) : parent.hovered ? palette.alternateBase : "transparent" }
                        contentItem: ColumnLayout {
                            spacing: root.metrics.tight
                            Label { text: modelData.name; font.bold: true; elide: Text.ElideRight; Layout.fillWidth: true }
                            Label { text: modelData.id; color: palette.placeholderText; elide: Text.ElideMiddle; Layout.fillWidth: true }
                        }
                        onClicked: root.selectedID = modelData.id
                        Keys.onReturnPressed: root.selectedID = modelData.id
                        ToolTip.visible: hovered; ToolTip.text: modelData.id
                    }
                    EmptyState { anchors.fill: parent; visible: !root.filtered.length && !root.desktop.applicationsBusy; heading: root.t("appsEmpty"); detail: root.t("appsEmptyHint"); metrics: root.metrics }
                }
            }
            Kit.Card {
                Layout.fillWidth: true; Layout.fillHeight: true
                Layout.preferredWidth: root.metrics.reading
                visible: split.columns === 2 || !!root.selected
                EmptyState { anchors.fill: parent; visible: !root.selected; heading: root.t("apps"); detail: root.t("appsEmptyHint"); metrics: root.metrics }
                ColumnLayout {
                    visible: !!root.selected
                    anchors.fill: parent; spacing: root.metrics.small
                    Label { text: root.t("actionScope"); font.bold: true; font.pointSize: Qt.application.font.pointSize * root.metrics.subtitleScale; Layout.fillWidth: true }
                    Kit.CardRow { title: root.selected?.name || ""; detail: root.selected?.id || "" }
                    Kit.CardRow { title: root.t("installSource"); detail: root.t(root.linux ? "installSourceLinux" : "installSourceWindows") }
                    Kit.CardRow { title: root.t("sharedData"); detail: root.t("sharedDataHint"); divider: false }
                    Flow {
                        Layout.fillWidth: true; spacing: root.metrics.small
                        Kit.PrimaryButton { text: root.t("open"); enabled: !!root.selected; onClicked: root.desktop.launch(root.selected.id) }
                        Button { text: root.t("reveal"); enabled: !!root.selected; onClicked: root.desktop.revealFile(root.selected.id) }
                        Button { visible: Qt.platform.os === "windows"; text: root.t("openSystemSettings"); onClicked: root.desktop.openApplicationSettings() }
                        Button { visible: split.columns === 1; text: root.t("close"); onClicked: root.selectedID = "" }
                    }
                    Item { Layout.fillHeight: true }
                }
            }
        }
        Label { text: root.desktop.error ? root.t(root.desktop.error) : ""; visible: !!text; wrapMode: Text.Wrap; Layout.fillWidth: true }
    }
}

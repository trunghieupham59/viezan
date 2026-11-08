import QtQuick
import QtQuick.Controls

Pane {
    id: notice
    required property var bridge
    property string text: ""
    property bool danger: false
    readonly property var metrics: bridge.resources.metrics
    readonly property bool dark: bridge.state.appearance?.mode === "dark" || bridge.state.appearance?.preset === "midnight" || (bridge.state.appearance?.mode !== "light" && Qt.styleHints.colorScheme === Qt.Dark)
    readonly property var colors: bridge.resources.themePalettes[(bridge.state.appearance?.preset || "graphite") + ":" + (bridge.state.appearance?.accent || "auto")][dark ? "dark" : "light"]
    padding: metrics.small
    background: Rectangle { radius: notice.metrics.controlRadius; color: Qt.alpha(notice.danger ? notice.colors.danger : notice.colors.action, notice.metrics.selectionOpacity); border.width: notice.metrics.hairline; border.color: Qt.alpha(notice.danger ? notice.colors.danger : notice.colors.action, notice.metrics.selectionOpacity * 2) }
    contentItem: Label { text: notice.text; wrapMode: Text.Wrap; textFormat: Text.PlainText }
    Accessible.role: danger ? Accessible.AlertMessage : Accessible.StaticText
    Accessible.name: text
}

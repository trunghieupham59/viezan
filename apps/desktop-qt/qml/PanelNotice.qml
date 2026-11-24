import QtQuick
import QtQuick.Controls

Pane {
    id: notice
    required property var bridge
    property string text: ""
    property bool danger: false
    readonly property var metrics: bridge.metrics
    readonly property bool dark: bridge.appearance?.mode === "dark" || (bridge.appearance?.mode !== "light" && Qt.styleHints.colorScheme === Qt.Dark)
    readonly property var colors: bridge.palettes[dark ? "dark" : "light"]
    padding: metrics.small
    background: Rectangle { radius: notice.metrics.controlRadius; color: notice.danger ? Qt.alpha(notice.colors["text-strong"], notice.metrics.selectionOpacity / 2) : Qt.alpha(notice.colors.action, notice.metrics.selectionOpacity); border.width: notice.metrics.hairline; border.color: Qt.alpha(notice.danger ? notice.colors.danger : notice.colors.action, notice.metrics.selectionOpacity * 2) }
    contentItem: Label { text: notice.text; wrapMode: Text.Wrap; textFormat: Text.PlainText }
    Accessible.role: danger ? Accessible.AlertMessage : Accessible.StaticText
    Accessible.name: text
}

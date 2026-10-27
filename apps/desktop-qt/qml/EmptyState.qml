import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: state
    required property string heading
    required property string detail
    required property var metrics
    implicitHeight: content.implicitHeight + metrics.gutter * 2
    ColumnLayout {
        id: content
        anchors.centerIn: parent
        width: Math.max(0, Math.min(state.metrics.reading, state.width - state.metrics.inset * 2))
        spacing: state.metrics.small
        Label { text: state.heading; font.bold: true; wrapMode: Text.Wrap; horizontalAlignment: Text.AlignHCenter; Layout.fillWidth: true }
        Label { text: state.detail; wrapMode: Text.Wrap; horizontalAlignment: Text.AlignHCenter; color: palette.placeholderText; Layout.fillWidth: true }
    }
}

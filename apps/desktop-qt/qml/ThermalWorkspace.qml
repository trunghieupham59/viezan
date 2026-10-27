import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
ScrollView {
    id: page
    required property var bridge
    readonly property var monitor: bridge.thermalMonitor
    readonly property var metrics: bridge.resources.metrics
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    contentWidth: availableWidth
    ColumnLayout {
        width: Math.min(page.availableWidth, page.metrics.reading); x: (page.availableWidth-width)/2; spacing: page.metrics.inset
        Label { text: page.t("thermal"); font.bold: true }
        Label { text: page.t("thermalPlatformHint"); wrapMode: Text.Wrap; Layout.fillWidth: true }
        Button { text: page.t(page.monitor.monitoring ? "stop" : "startMonitoring"); onClicked: page.monitor.monitoring ? page.monitor.stop() : page.monitor.start() }
        EmptyState { visible: !page.monitor.sensors.length && !page.monitor.fans.length; Layout.fillWidth: true; heading: page.t("sensorsEmpty"); detail: page.t("sensorsEmptyHint"); metrics: page.metrics }
        GroupBox {
            visible: !!page.monitor.sensors.length || !!page.monitor.fans.length
            title: page.t("thermal"); Layout.fillWidth: true
            ColumnLayout {
                width: parent.width; spacing: page.metrics.inset
        Repeater {
            model: page.monitor.sensors
            delegate: RowLayout {
                required property var modelData
                Label { textFormat: Text.PlainText; text: modelData.name; Layout.fillWidth: true; elide: Text.ElideRight }
                Label { text: modelData.value.toFixed(1) + " °C" }
            }
        }
        Repeater {
            model: page.monitor.fans
            delegate: RowLayout {
                required property var modelData
                Label { textFormat: Text.PlainText; text: modelData.name; Layout.fillWidth: true; elide: Text.ElideRight }
                Label { text: modelData.value.toFixed(0) + " RPM" }
            }
        }
            }
        }
        Label { text: page.monitor.error ? page.t(page.monitor.error) : ""; visible: !!text; wrapMode: Text.Wrap; Layout.fillWidth: true }
    }
}

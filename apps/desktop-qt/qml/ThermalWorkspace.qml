import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
// Real readings only: Linux hwmon is read-only and Windows has no verified backend.
ScrollView {
    id: page
    required property var bridge
    readonly property var monitor: bridge.thermalMonitor
    readonly property var metrics: bridge.resources.metrics
    readonly property var hottest: monitor.sensors.length ? monitor.sensors.reduce((a, b) => b.value > a.value ? b : a) : null
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    // Readings start with the page (Review 18 shows live tiles); stop only what this page started.
    property bool startedHere: false
    Component.onCompleted: if (!monitor.monitoring) { monitor.start(); startedHere = true }
    Component.onDestruction: if (startedHere) monitor.stop()
    contentWidth: availableWidth
    component MetricTile: Kit.Card {
        id: tile
        property string title
        property string value
        property string detail
        Layout.fillWidth: true
        ColumnLayout {
            anchors.fill: parent; spacing: page.metrics.small
            Kit.Eyebrow { text: tile.title }
            Label { text: tile.value; font.bold: true; font.pointSize: Qt.application.font.pointSize * page.metrics.displayScale }
            Label { text: tile.detail; color: palette.placeholderText; elide: Text.ElideRight; Layout.fillWidth: true }
        }
    }
    ColumnLayout {
        width: Math.min(page.availableWidth - page.metrics.large * 2, page.metrics.reading + page.metrics.sidebar); x: (page.availableWidth - width) / 2; spacing: page.metrics.gutter
        Kit.PageIntro {
            title: page.t("qtThermalTitle")
            subtitle: page.t("qtThermalSubtitle").replace("{platform}", Qt.platform.os === "linux" ? "Linux" : "Windows")
            Layout.fillWidth: true; Layout.topMargin: page.metrics.gutter
        }
        GridLayout {
            visible: !!page.monitor.sensors.length || !!page.monitor.fans.length
            columns: Math.max(1, Math.floor(width / page.metrics.sidebar))
            columnSpacing: page.metrics.inset; rowSpacing: page.metrics.inset
            Layout.fillWidth: true
            MetricTile { visible: !!page.hottest; title: page.t("hottestSensor"); value: page.hottest ? page.hottest.value.toFixed(0) + " °C" : ""; detail: page.hottest?.name || "" }
            Repeater {
                model: page.monitor.fans
                delegate: MetricTile { required property var modelData; title: modelData.name; value: modelData.value.toFixed(0); detail: page.t("rpm") }
            }
        }
        // Windows/Linux (Review 18): verified readings only; fan control stays with the OS.
        Kit.Columns {
            Kit.Card {
                Layout.fillWidth: true; Layout.preferredWidth: 1; Layout.alignment: Qt.AlignTop
                ColumnLayout {
                    anchors.fill: parent; spacing: page.metrics.small
                    Label { text: page.t("sensorStatus"); font.bold: true; font.pointSize: Qt.application.font.pointSize * page.metrics.subtitleScale }
                    Label { visible: !page.monitor.sensors.length; text: "—"; font.bold: true; font.pointSize: Qt.application.font.pointSize * page.metrics.displayScale }
                    Label { visible: !page.monitor.sensors.length; text: page.t("noVerifiedBackend"); wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Label { visible: !page.monitor.sensors.length; text: page.t("noFakeReadings"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Repeater {
                        model: page.monitor.sensors.slice().sort((a, b) => b.value - a.value)
                        delegate: Kit.CardRow {
                            required property var modelData
                            required property int index
                            title: modelData.name
                            divider: index < page.monitor.sensors.length - 1
                            Label { text: modelData.value.toFixed(0) + " °C" }
                        }
                    }
                    Kit.PrimaryButton { text: page.t(page.monitor.monitoring ? "stop" : "checkCapability"); Layout.topMargin: page.metrics.small; onClicked: page.monitor.monitoring ? page.monitor.stop() : page.monitor.start() }
                }
            }
            Kit.Card {
                Layout.fillWidth: true; Layout.preferredWidth: 1; Layout.alignment: Qt.AlignTop
                ColumnLayout {
                    anchors.fill: parent; spacing: page.metrics.gap
                    Label { text: page.t("fanControl"); font.bold: true; font.pointSize: Qt.application.font.pointSize * page.metrics.subtitleScale }
                    Kit.StatusBadge { text: page.t("notSupported") }
                    Label { text: page.t("fanUnsupportedHint"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Button { text: page.t("manualMode"); enabled: false }
                    Button { text: page.t("viewReason"); ToolTip.visible: hovered; ToolTip.text: page.t("thermalPlatformHint"); onClicked: reason.open() }
                }
            }
        }
        Label { text: page.monitor.error && page.monitor.error !== "thermalPlatformHint" ? page.t(page.monitor.error) : ""; visible: !!text; wrapMode: Text.Wrap; Layout.fillWidth: true }
    }
    Dialog {
        id: reason
        parent: Overlay.overlay
        title: page.t("viewReason")
        modal: true
        standardButtons: Dialog.Close
        width: Math.min(parent.width - page.metrics.inset * 2, page.metrics.reading)
        height: Math.min(parent.height - page.metrics.inset * 2, page.metrics.editor * 2)
        x: (parent.width - width) / 2; y: (parent.height - height) / 2
        contentItem: Label { text: page.t("thermalPlatformHint"); wrapMode: Text.Wrap }
    }
}

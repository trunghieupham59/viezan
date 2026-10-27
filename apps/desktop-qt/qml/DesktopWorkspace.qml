import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ScrollView {
    id: page
    required property var bridge
    required property string route
    readonly property var metrics: bridge.resources.metrics
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    contentWidth: availableWidth
    ColumnLayout {
        width: Math.min(page.availableWidth, page.metrics.reading)
        x: (page.availableWidth - width) / 2
        spacing: page.metrics.gutter
        Label { text: page.t(page.route === "everywhere" ? "everywhereSubtitle" : "utilitiesSubtitle"); wrapMode: Text.Wrap; Layout.fillWidth: true; color: palette.placeholderText }
        GroupBox {
            title: page.t("allShortcuts"); Layout.fillWidth: true
            DesktopSettings { width: parent.width; bridge: page.bridge; route: page.route }
        }
        GroupBox {
            visible: page.route === "everywhere"; title: page.t("connections"); Layout.fillWidth: true
            BridgeSettings { width: parent.width; bridge: page.bridge }
        }
    }
}

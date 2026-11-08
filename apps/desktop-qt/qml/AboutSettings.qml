import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
ColumnLayout {
    id: about
    required property var bridge
    readonly property var metrics: bridge.resources.metrics
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    spacing: metrics.inset
    Kit.CardBox {
        title: "Viezan"; Layout.fillWidth: true
        ColumnLayout {
            width: parent.width; spacing: 0
            RowLayout {
                Layout.fillWidth: true; spacing: about.metrics.inset; Layout.bottomMargin: about.metrics.inset
                Image { source: "brand.png"; Layout.preferredWidth: about.metrics.hero; Layout.preferredHeight: about.metrics.hero; Accessible.ignored: true }
                ColumnLayout {
                    Layout.fillWidth: true
                    Label { text: "Viezan"; font.bold: true; font.pointSize: Qt.application.font.pointSize * about.metrics.titleScale }
                    Label { text: about.t("currentVersion") + " " + Qt.application.version; color: palette.placeholderText }
                }
            }
            Kit.CardRow { title: about.t("sourceCode"); Kit.GlassButton { text: "GitHub"; onClicked: Qt.openUrlExternally("https://github.com/trunghieupham59/viezan") } }
            Kit.CardRow { title: about.t("license"); divider: false; Kit.GlassButton { text: "MIT"; Accessible.name: about.t("license") + " MIT"; onClicked: Qt.openUrlExternally("https://github.com/trunghieupham59/viezan/blob/develop/LICENSE") } }
        }
    }
    Kit.CardBox { title: about.t("previewScopeTitle"); Layout.fillWidth: true; Label { width: parent.width; text: about.t("previewScopeDescription"); color: palette.placeholderText; wrapMode: Text.Wrap } }
    Kit.CardBox { title: about.t("localDataTitle"); Layout.fillWidth: true; Label { width: parent.width; text: about.t("settingsInfo"); color: palette.placeholderText; wrapMode: Text.Wrap } }
}

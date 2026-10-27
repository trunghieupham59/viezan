import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ScrollView {
    id: home
    required property var bridge
    signal start(string feature)
    signal resume(string sessionID)
    signal settings()
    Component.onCompleted: bridge.localRuntime.refresh()
    readonly property var metrics: bridge.resources.metrics
    readonly property var recent: bridge.state.sessions.filter(item => !(home.bridge.state.disabledModules || []).includes(item.feature) && !item.comparisonParent && !item.archived && (item.draft.length || item.messages.length || item.output.length)).sort((a,b) => (b.updated || 0) - (a.updated || 0)).slice(0, 6)
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    contentWidth: availableWidth
    ColumnLayout {
        width: home.availableWidth
        spacing: home.metrics.gutter
        Label { text: home.t("homeSubtitle"); wrapMode: Text.Wrap; Layout.fillWidth: true; color: palette.placeholderText }
        Label { textFormat: Text.PlainText; text: home.t("quickStart"); font.bold: true; Layout.fillWidth: true }
        Flow {
            Layout.fillWidth: true
            spacing: home.metrics.inset
            Repeater {
                model: ["chat", "translate", "interpret", "dictionary"].filter(feature => !(home.bridge.state.disabledModules || []).includes(feature))
                delegate: Button {
                    required property string modelData
                    text: home.t(modelData)
                    icon.source: "icons/" + modelData + ".svg"
                    width: Math.min(home.metrics.sidebar, home.availableWidth)
                    implicitHeight: home.metrics.navControl
                    enabled: !home.bridge.loadBlocked
                    onClicked: home.start(modelData)
                }
            }
        }
        GroupBox {
            title: home.t("continueWork")
            Layout.fillWidth: true
            ColumnLayout {
                width: parent.width
                Label { textFormat: Text.PlainText; text: home.t("noRecentWork"); visible: home.recent.length === 0; wrapMode: Text.Wrap; Layout.fillWidth: true }
                Repeater {
                    model: home.recent
                    delegate: ItemDelegate {
                        required property var modelData
                        Layout.fillWidth: true
                        text: modelData.title || home.t(modelData.feature === "chat" ? "newChat" : modelData.feature === "dictionary" ? "dictionary" : "newTranslation")
                        Accessible.name: text
                        ToolTip.visible: hovered
                        ToolTip.text: text
                        enabled: !home.bridge.loadBlocked
                        contentItem: ColumnLayout {
                            Label { textFormat: Text.PlainText; text: modelData.title || home.t(modelData.feature === "chat" ? "newChat" : modelData.feature === "dictionary" ? "dictionary" : "newTranslation"); elide: Text.ElideRight; Layout.fillWidth: true }
                            Label { textFormat: Text.PlainText; text: home.t(modelData.feature) + " · " + modelData.model; color: palette.placeholderText; elide: Text.ElideRight; Layout.fillWidth: true }
                        }
                        onClicked: home.resume(modelData.id)
                    }
                }
            }
        }
        ColumnLayout {
            Layout.fillWidth: true
            ToolButton { id: systemDetails; text: home.t("systemStatus"); checkable: true; checked: false; Accessible.name: text; Accessible.checkable: true; Accessible.checked: checked }
            ColumnLayout {
                visible: systemDetails.checked
                Layout.fillWidth: true
                Label { text: "CPU: " + home.bridge.localRuntime.processors }
                Label { text: "Ollama · " + home.t(home.bridge.localRuntime.available ? "available" : "unavailable") + " " + home.bridge.localRuntime.version }
                Repeater { model: home.bridge.desktopIntegration.shortcuts; delegate: Label { required property var modelData; text: home.t(modelData.id) + " · " + modelData.key + " · " + home.t(modelData.enabled ? "enabled" : "disabled") } }
                Button { text: home.t("settings"); onClicked: home.settings() }
            }
        }
        GroupBox {
            title: home.t("model")
            Layout.fillWidth: true
            ColumnLayout {
                Label { textFormat: Text.PlainText; text: home.bridge.state.sessions.find(item => item.id === home.bridge.state.active[home.bridge.state.feature])?.model || "" }
                Button { text: home.t("settings"); onClicked: home.settings() }
            }
        }
    }
}

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
ColumnLayout {
    id: settings
    required property var bridge
    property string route: ""
    property string diagnosticsText: ""
    readonly property var desktop: bridge.desktopIntegration
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    Label { visible: !settings.route; text: settings.t("modulesTitle"); font.bold: true }
    Repeater {
        model: settings.route ? [] : ["chat", "translate", "dictionary", "interpret", "thermal", "apps", "utilities", "bridge"]
        delegate: CheckBox { required property string modelData; text: settings.t(modelData === "bridge" ? "browserBridge" : modelData); checked: !(settings.bridge.state.disabledModules || []).includes(modelData); onClicked: settings.bridge.command("module", {id: modelData, enabled: checked}) }
    }
    CheckBox { visible: !settings.route; text: settings.t("launchAtLogin"); checked: settings.desktop.launchAtLogin; onClicked: settings.desktop.setLaunchAtLogin(checked) }
    Button { visible: settings.route !== "utilities"; text: settings.t("microphonePermission"); onClicked: settings.desktop.openPrivacySettings() }
    Button { visible: !settings.route; text: settings.t("diagnostics"); onClicked: settings.diagnosticsText = settings.desktop.diagnostics() }
    TextArea { visible: !!settings.diagnosticsText; text: settings.diagnosticsText; readOnly: true; selectByMouse: true; Layout.fillWidth: true; Accessible.name: settings.t("diagnostics") }
    Label { text: settings.t("shortcutPlatformHint"); wrapMode: Text.Wrap; Layout.fillWidth: true }
    Repeater {
        model: settings.desktop.shortcuts.filter(item => settings.route !== "everywhere" || item.id === "translateSelection")
        delegate: ColumnLayout {
            required property var modelData
            CheckBox { text: settings.t(modelData.id); checked: modelData.enabled; enabled: !settings.desktop.busy; onToggled: settings.desktop.configure(modelData.id, keyInput.text, checked) }
            RowLayout {
                TextField { id: keyInput; text: modelData.key; Accessible.name: settings.t("shortcut"); Layout.fillWidth: true }
                Button { text: settings.t("apply"); enabled: !settings.desktop.busy; onClicked: settings.desktop.configure(modelData.id, keyInput.text, modelData.enabled) }
            }
        }
    }
    Flow {
        visible: settings.route !== "everywhere"
        Layout.fillWidth: true; spacing: settings.bridge.resources.metrics.small
        Button { text: settings.t("launcher"); onClicked: settings.desktop.trigger("launcher") }
        Button { text: settings.t("quickChat"); onClicked: settings.desktop.trigger("quickChat") }
    }
    Label { text: settings.desktop.error ? settings.t(settings.desktop.error) : ""; visible: !!text; wrapMode: Text.Wrap; Layout.fillWidth: true }
}

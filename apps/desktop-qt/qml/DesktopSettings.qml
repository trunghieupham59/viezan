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
    Button { visible: !settings.route; text: settings.t("microphonePermission"); onClicked: settings.desktop.openPrivacySettings() }
    Button { visible: !settings.route; text: settings.t("diagnostics"); onClicked: settings.diagnosticsText = settings.desktop.diagnostics() }
    TextArea { visible: !!settings.diagnosticsText; text: settings.diagnosticsText; readOnly: true; selectByMouse: true; Layout.fillWidth: true; Accessible.name: settings.t("diagnostics") }
    Label { visible: !settings.route; text: settings.t("shortcutPlatformHint"); wrapMode: Text.Wrap; Layout.fillWidth: true }
    // Workspace pages: one label row per shortcut with its key, apply and switch.
    Repeater {
        // Launcher leads (Review 18); Everywhere shows only selection translation.
        model: settings.route ? settings.desktop.shortcuts.filter(item => settings.route !== "everywhere" || item.id === "translateSelection").sort((a, b) => ["launcher", "translateSelection", "quickChat"].indexOf(a.id) - ["launcher", "translateSelection", "quickChat"].indexOf(b.id)) : []
        delegate: Kit.CardRow {
            required property var modelData
            title: settings.route === "everywhere" ? settings.t("allShortcuts") : settings.t(modelData.id)
            detail: settings.t(settings.route === "everywhere" ? "shortcutCustomizable" : "shortcutDetail_" + modelData.id)
            TextField { id: rowKey; text: modelData.key; Accessible.name: settings.t("shortcut") + " " + settings.t(modelData.id); Layout.preferredWidth: settings.bridge.resources.metrics.sidebar * 2 / 3; onAccepted: settings.desktop.configure(modelData.id, text, modelData.enabled) }
            Button { text: settings.t("apply"); enabled: !settings.desktop.busy; onClicked: settings.desktop.configure(modelData.id, rowKey.text, modelData.enabled) }
            Switch { checked: modelData.enabled; enabled: !settings.desktop.busy; Accessible.name: settings.t(modelData.id); onToggled: settings.desktop.configure(modelData.id, rowKey.text, checked) }
        }
    }
    Label { visible: !!settings.route; text: settings.t("shortcutPlatformHint"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true; Layout.topMargin: settings.bridge.resources.metrics.small }
    Repeater {
        model: settings.route ? [] : settings.desktop.shortcuts
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
        visible: !settings.route
        Layout.fillWidth: true; spacing: settings.bridge.resources.metrics.small
        Button { text: settings.t("launcher"); onClicked: settings.desktop.trigger("launcher") }
        Button { text: settings.t("quickChat"); onClicked: settings.desktop.trigger("quickChat") }
    }
    Label { text: settings.desktop.error ? settings.t(settings.desktop.error) : ""; visible: !!text; wrapMode: Text.Wrap; Layout.fillWidth: true }
}

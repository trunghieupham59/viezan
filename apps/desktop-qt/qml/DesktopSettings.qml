import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
ColumnLayout {
    id: settings
    required property var bridge
    property string route: ""
    property string diagnosticsText: ""
    property var desktop: bridge.desktopIntegration
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    function tpl(key, values) { let text = t(key); for (const name in values) text = text.split("{" + name + "}").join(values[name]); return text }
    Label { visible: !settings.route; text: settings.t("modulesTitle"); font.bold: true }
    Repeater {
        model: settings.route ? ["launcher", "translateSelection", "quickChat"].map(id => settings.desktop.shortcuts.find(row => row.id === id)).filter(row => row && (settings.route !== "everywhere" || row.id === "translateSelection")) : []
        delegate: Kit.CardRow {
            required property var modelData
            title: settings.t(modelData.id)
            detail: settings.t("shortcutDetail_" + modelData.id)
            Kit.GlassButton { visible: settings.route !== "everywhere" && modelData.id !== "translateSelection"; text: settings.t("shortcutTry"); enabled: !settings.desktop.busy; onClicked: settings.desktop.trigger(modelData.id) }
            ShortcutKeyButton {
                id: keyButton
                objectName: "shortcut-edit-" + modelData.id
                sequence: modelData.key
                Accessible.name: settings.tpl("shortcutFor", {name: settings.t(modelData.id)}) + ": " + text
                enabled: !settings.desktop.busy
                onClicked: recorder.begin(modelData, keyButton)
            }
            Switch { checked: modelData.enabled; enabled: !settings.desktop.busy; Accessible.name: settings.t(modelData.id); onToggled: settings.desktop.configure(modelData.id, modelData.key, checked) }
        }
    }
    ShortcutRecorder { id: recorder; bridge: settings.bridge; desktop: settings.desktop }
    Label { visible: settings.route === "utilities"; text: settings.t("shortcutPlatformHint"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true; Layout.topMargin: settings.bridge.resources.metrics.small }
    Repeater {
        model: settings.route ? [] : settings.desktop.shortcuts
        delegate: ColumnLayout {
            required property var modelData
            CheckBox { text: settings.t(modelData.id); checked: modelData.enabled; enabled: !settings.desktop.busy; onToggled: settings.desktop.configure(modelData.id, keyInput.text, checked) }
            RowLayout {
                TextField { id: keyInput; text: modelData.key; Accessible.name: settings.t("shortcut"); Layout.fillWidth: true }
                Kit.GlassButton { text: settings.t("apply"); enabled: !settings.desktop.busy; onClicked: settings.desktop.configure(modelData.id, keyInput.text, modelData.enabled) }
            }
        }
    }
    Flow {
        visible: !settings.route
        Layout.fillWidth: true; spacing: settings.bridge.resources.metrics.small
        Kit.GlassButton { text: settings.t("launcher"); onClicked: settings.desktop.trigger("launcher") }
        Kit.GlassButton { text: settings.t("quickChat"); onClicked: settings.desktop.trigger("quickChat") }
    }
    Label { text: settings.desktop.error ? settings.t(settings.desktop.error) : ""; visible: !!text; wrapMode: Text.Wrap; Layout.fillWidth: true }
}

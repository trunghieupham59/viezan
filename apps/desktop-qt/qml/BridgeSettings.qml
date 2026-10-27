import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
ColumnLayout {
    id: panel
    required property var bridge
    readonly property var server: bridge.extensionBridge
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    Label { text: panel.t("bridgeDescription"); wrapMode: Text.Wrap; Layout.fillWidth: true }
    Label { text: "127.0.0.1:39875" }
    CheckBox { id: automatic; text: panel.t("bridgeAutomatic"); checked: !!(panel.bridge.state.bridge || {}).automatic }
    Label { text: panel.t("bridgeOrigins") }
    TextArea { id: origins; text: ((panel.bridge.state.bridge || {}).origins || []).join("\n"); Accessible.name: panel.t("bridgeOrigins"); wrapMode: TextEdit.Wrap; Layout.fillWidth: true }
    Label { text: panel.t("bridgeOriginsHint"); wrapMode: Text.Wrap; Layout.fillWidth: true }
    Button { text: panel.t("apply"); onClicked: {
        var values = origins.text.split(/\r?\n/).map(function(s) { return s.trim() }).filter(function(s) { return !!s })
        invalid.visible = values.length > 32 || values.some(function(s) { return !/^https:\/\/[^\s/@?#]+\/?$/i.test(s) })
        if (!invalid.visible) panel.bridge.command("bridgePreferences", {automatic: automatic.checked, origins: values})
    } }
    Label { id: invalid; visible: false; text: panel.t("bridgeOriginsInvalid"); wrapMode: Text.Wrap; Layout.fillWidth: true }
    Button { text: panel.t(panel.server.listening ? "stop" : "startBridge"); onClicked: panel.server.listening ? panel.server.stop() : panel.server.start() }
    TextField { id: tokenName; text: "Chrome"; placeholderText: panel.t("tokenName"); Accessible.name: placeholderText; maximumLength: 80; Layout.fillWidth: true }
    RowLayout { Label { text: panel.t("tokenDays") } SpinBox { id: days; from: 1; to: 365; value: 30; editable: true; Accessible.name: panel.t("tokenDays") } }
    Button { text: panel.t("createToken"); enabled: !!tokenName.text.trim(); onClicked: panel.server.createToken(tokenName.text, days.value) }
    ColumnLayout {
        visible: !!panel.server.revealedToken
        Label { text: panel.t("tokenOnce"); wrapMode: Text.Wrap; Layout.fillWidth: true }
        TextArea { text: panel.server.revealedToken; readOnly: true; selectByMouse: true; wrapMode: TextEdit.WrapAnywhere; Layout.fillWidth: true; Accessible.name: panel.t("createToken") }
        RowLayout {
            Button { text: panel.t("copy"); onClicked: panel.bridge.copy(panel.server.revealedToken) }
            Button { text: panel.t("close"); onClicked: panel.server.dismissToken() }
        }
    }
    Repeater {
        model: panel.server.tokens
        delegate: RowLayout {
            required property var modelData
            Label { textFormat: Text.PlainText; text: modelData.name + " · " + new Date(modelData.expiresAt * 1000).toLocaleDateString(); wrapMode: Text.Wrap; Layout.fillWidth: true }
            Button { text: panel.t("revokeToken"); onClicked: { revoke.tokenID = modelData.id; revoke.open() } }
        }
    }
    Label { text: panel.server.error ? panel.t(panel.server.error) : ""; visible: !!text; wrapMode: Text.Wrap; Layout.fillWidth: true }
    Dialog { id: revoke; property string tokenID; title: panel.t("revokeTokenConfirm"); modal: true; standardButtons: Dialog.Yes | Dialog.Cancel; onAccepted: panel.server.revoke(tokenID) }
    Component.onDestruction: panel.server.dismissToken()
}

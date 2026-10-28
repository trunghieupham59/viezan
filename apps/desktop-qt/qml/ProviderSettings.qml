import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Kit.CardBox {
    id: providers
    required property var bridge
    readonly property var metrics: bridge.resources.metrics
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    title: t("providerSettings")
    ColumnLayout {
        width: parent.width
        spacing: providers.metrics.inset
        ComboBox { id: provider; enabled: !providers.bridge.credentialBusy; model: ["openai", "claude", "gemini", "groq", "tavily", "brave", "jina", "elevenlabs"]; Accessible.name: providers.t("provider"); onActivated: key.clear() }
        TextField { id: key; echoMode: TextInput.Password; placeholderText: providers.t("apiKey"); Accessible.name: placeholderText; maximumLength: 4096; Layout.fillWidth: true }
        RowLayout {
            Button { text: providers.t("saveKey"); enabled: !providers.bridge.credentialBusy && key.text.length > 0; onClicked: { providers.bridge.saveCredential(provider.currentText, key.text); key.clear() } }
            Button { text: providers.t("deleteKey"); enabled: !providers.bridge.credentialBusy; onClicked: confirmation.open() }
            BusyIndicator { visible: running; running: providers.bridge.credentialBusy; implicitWidth: providers.metrics.control; implicitHeight: providers.metrics.control }
        }
        Label { text: providers.t("keyStorageHint"); wrapMode: Text.Wrap; Layout.fillWidth: true }
        Label { text: providers.bridge.credentialStatus ? providers.t(providers.bridge.credentialStatus) : ""; visible: !!text; wrapMode: Text.Wrap; Layout.fillWidth: true }
    }
    Dialog {
        id: confirmation
        title: providers.t("deleteKeyConfirm")
        modal: true
        standardButtons: Dialog.Ok | Dialog.Cancel
        onAccepted: providers.bridge.saveCredential(provider.currentText, "", true)
    }
    Component.onDestruction: key.clear()
}

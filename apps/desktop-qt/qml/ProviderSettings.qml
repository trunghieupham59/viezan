import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Kit.CardBox {
    id: providers
    required property var bridge
    readonly property var metrics: bridge.resources.metrics
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    title: t("providerSettings")
    readonly property var names: ({openai: "OpenAI", claude: "Claude", gemini: "Gemini", groq: "Groq", tavily: "Tavily", brave: "Brave Search", jina: "Jina", elevenlabs: "ElevenLabs"})
    function purpose(id) { return ["openai", "claude", "gemini"].includes(id) ? "purposeChat" : id === "groq" ? "purposeSpeech" : id === "elevenlabs" ? "purposeVoice" : "purposeSearch" }
    // Presence never unlocks the credential store; chat providers are verified by the
    // discovery listing their models (free), so a rejected key shows its error here.
    function status(id) {
        const state = (providers.bridge.localModels, providers.bridge.discovering, providers.bridge.providerState(id))
        if (!state.keyed) return [t("keyAbsent"), "idle"]
        if (!["openai", "claude", "gemini"].includes(id)) return [t("keyPresent"), "ready"]
        if (state.models >= 0) return [t("keyPresent") + " · " + state.models + " " + t("modelsAvailable"), "ready"]
        if (state.failure) return [t(state.failure), "failed"]
        return [t("keyPresent") + " · " + t("keyUnverified"), "idle"]
    }
    property color dangerColor: palette.placeholderText
    ColumnLayout {
        width: parent.width
        spacing: providers.metrics.inset
        ColumnLayout {
            spacing: 0
            Layout.fillWidth: true
            Repeater {
                model: ["openai", "claude", "gemini", "groq", "tavily", "brave", "jina", "elevenlabs"]
                delegate: Kit.CardRow {
                    required property string modelData
                    required property int index
                    readonly property var rowState: providers.status(modelData)
                    title: providers.names[modelData]; detail: providers.t(providers.purpose(modelData)); divider: index < 7
                    objectName: "provider-status-" + modelData
                    Kit.StatusDot { tone: rowState[1]; failedColor: providers.dangerColor }
                    Label { text: rowState[0]; color: rowState[1] === "failed" ? providers.dangerColor : palette.placeholderText; Accessible.name: providers.names[modelData] + ": " + text }
                }
            }
        }
        Button { text: providers.t("checkAgain"); enabled: !providers.bridge.discovering; onClicked: providers.bridge.discoverProviders() }
        ComboBox { id: provider; enabled: !providers.bridge.credentialBusy; textRole: "name"; valueRole: "id"; model: ["openai", "claude", "gemini", "groq", "tavily", "brave", "jina", "elevenlabs"].map(id => ({id: id, name: providers.names[id]})); Accessible.name: providers.t("provider"); onActivated: key.clear() }
        TextField { id: key; echoMode: TextInput.Password; placeholderText: providers.t("apiKey"); Accessible.name: placeholderText; maximumLength: 4096; Layout.fillWidth: true }
        RowLayout {
            Button { text: providers.t("saveKey"); enabled: !providers.bridge.credentialBusy && key.text.length > 0; onClicked: { providers.bridge.saveCredential(provider.currentValue, key.text); key.clear() } }
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
        onAccepted: providers.bridge.saveCredential(provider.currentValue, "", true)
    }
    Component.onDestruction: key.clear()
}

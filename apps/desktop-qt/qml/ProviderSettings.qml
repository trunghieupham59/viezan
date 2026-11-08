import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
ColumnLayout {
    id: providers
    required property var bridge
    signal feedback(string message, bool error)
    readonly property var metrics: bridge.resources.metrics
    property color dangerColor: palette.placeholderText
    property string editing: ""
    property bool saving: false
    readonly property var names: ({openai: "OpenAI", claude: "Claude", gemini: "Gemini", groq: "Groq", tavily: "Tavily", brave: "Brave Search", jina: "Jina", elevenlabs: "ElevenLabs"})
    readonly property var links: ({openai: "https://platform.openai.com/api-keys", claude: "https://console.anthropic.com/settings/keys", gemini: "https://aistudio.google.com/apikey", groq: "https://console.groq.com/keys", tavily: "https://app.tavily.com", brave: "https://api.search.brave.com", jina: "https://jina.ai", elevenlabs: "https://elevenlabs.io"})
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    function status(id) {
        const state = (bridge.localModels, bridge.discovering, bridge.credentialStatus, bridge.providerState(id))
        if (!state.keyed) return [t("keyAbsent"), "idle"]
        if (!["openai", "claude", "gemini"].includes(id)) return [t("keyPresent"), "ready"]
        if (state.models >= 0) return [t("keyPresent") + " · " + state.models + " " + t("modelsAvailable"), "ready"]
        if (state.failure) return [t(state.failure), "failed"]
        return [t("keyPresent") + " · " + t("keyUnverified"), "idle"]
    }
    spacing: metrics.inset
    Kit.GlassButton { text: providers.t("checkAgain"); icon.source: "icons/refresh.svg"; enabled: !providers.bridge.discovering; onClicked: providers.bridge.discoverProviders() }
    Repeater {
        model: [{title: "providerGroupCloud", ids: ["claude", "openai", "gemini"]}, {title: "providerGroupSearchVoice", ids: ["groq", "tavily", "brave", "jina", "elevenlabs"]}]
        delegate: Kit.CardBox {
            required property var modelData
            title: providers.t(modelData.title); Layout.fillWidth: true
            ColumnLayout {
                width: parent.width; spacing: 0
                Repeater {
                    model: modelData.ids
                    delegate: ColumnLayout {
                        id: providerRow
                        required property string modelData
                        required property int index
                        Layout.fillWidth: true; spacing: providers.metrics.small
                        readonly property var rowState: providers.status(modelData)
                        readonly property bool keyed: (providers.bridge.credentialStatus, providers.bridge.localModels, providers.bridge.providerState(modelData).keyed)
                        Kit.CardRow {
                            objectName: "provider-status-" + providerRow.modelData
                            title: providers.names[providerRow.modelData]; detail: providerRow.rowState[0]; divider: false
                            Kit.StatusDot { tone: providerRow.rowState[1]; failedColor: providers.dangerColor }
                            Kit.GlassButton { text: providers.t(providerRow.keyed ? "replaceKey" : "addKey"); enabled: !providers.bridge.credentialBusy; onClicked: { providers.editing = providers.editing === providerRow.modelData ? "" : providerRow.modelData; key.clear(); if (providers.editing) key.forceActiveFocus() } }
                            SettingsDangerButton { text: providers.t("deleteKey"); visible: providerRow.keyed; enabled: !providers.bridge.credentialBusy; onClicked: { confirmation.providerID = providerRow.modelData; confirmation.open() } }
                        }
                        Kit.QuietButton { text: providers.t("getKey") + " ↗"; onClicked: Qt.openUrlExternally(providers.links[providerRow.modelData]) }
                        ColumnLayout {
                            visible: providers.editing === providerRow.modelData; Layout.fillWidth: true
                            TextField { id: key; echoMode: TextInput.Password; placeholderText: providers.t("apiKey"); Accessible.name: providers.names[providerRow.modelData] + " · " + placeholderText; maximumLength: 4096; Layout.fillWidth: true; enabled: !providers.bridge.credentialBusy; onAccepted: if (!inputMethodComposing && save.enabled) save.clicked() }
                            Flow {
                                Layout.fillWidth: true; spacing: providers.metrics.small
                                Kit.PrimaryButton { id: save; text: providers.t("saveKey"); enabled: !providers.bridge.credentialBusy && !!key.text.trim(); onClicked: { providers.saving = true; providers.bridge.saveCredential(providerRow.modelData, key.text); key.clear() } }
                                Kit.QuietButton { text: providers.t("close"); enabled: !providers.bridge.credentialBusy; onClicked: { key.clear(); providers.editing = "" } }
                            }
                        }
                        Rectangle { Layout.fillWidth: true; implicitHeight: providers.metrics.hairline; color: palette.midlight }
                        Connections { target: providers; function onEditingChanged() { if (providers.editing !== providerRow.modelData) key.clear() } }
                        Component.onDestruction: key.clear()
                    }
                }
            }
        }
    }
    BusyIndicator { visible: running; running: providers.bridge.credentialBusy; implicitWidth: providers.metrics.control; implicitHeight: providers.metrics.control }
    Label { text: providers.bridge.credentialStatus ? providers.t(providers.bridge.credentialStatus) : ""; visible: !!text; wrapMode: Text.Wrap; Layout.fillWidth: true }
    SettingsConfirm {
        id: confirmation; objectName: "settings-delete-key-dialog"; bridge: providers.bridge
        property string providerID: ""
        title: providers.t("deleteKey")
        message: providers.t("deleteNamedKeyConfirm").replace("{name}", providers.names[providerID] || "")
        actionText: providers.t("deleteKey"); actionEnabled: !providers.bridge.credentialBusy
        onAccepted: if (!providers.bridge.credentialBusy) { providers.saving = true; providers.bridge.saveCredential(providerID, "", true) }
    }
    Connections {
        target: providers.bridge
        function onChanged() {
            if (providers.saving && !providers.bridge.credentialBusy && providers.bridge.credentialStatus) {
                providers.saving = false
                providers.feedback(providers.t(providers.bridge.credentialStatus), providers.bridge.credentialStatus !== "keySaved")
            }
        }
    }
}

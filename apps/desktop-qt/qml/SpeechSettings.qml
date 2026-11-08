import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
ColumnLayout {
    id: speech
    required property var bridge
    signal manageKeys()
    readonly property var metrics: bridge.resources.metrics
    readonly property var voice: bridge.state.voice || {provider: "system", voice: "", rate: 1}
    readonly property string provider: voice.provider || "system"
    readonly property var voiceOptions: {
        let items = []
        if (provider === "system") {
            items = bridge.audio.voiceList.map((item, index) => ({id:item.name, label:item.name, detail:item.language, group:languageName(item.language), order:index}))
            items.sort((a,b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label) || a.order - b.order)
        } else if (provider === "openai" || provider === "gemini") {
            items = (provider === "openai" ? ["alloy","echo","fable","onyx","nova","shimmer"] : ["Aoede","Kore","Puck","Charon","Fenrir","Zephyr"]).map(id => ({id:id, label:id.charAt(0).toUpperCase() + id.slice(1)}))
        }
        return [{id:"", label:t("voiceAutomatic")}].concat(items)
    }
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    function languageName(code) { const base = code.replace("_", "-").split("-")[0]; return bridge.resources.nativeLanguages.includes(base) ? t("lang_" + base) : Qt.locale(code).nativeLanguageName || code }
    function setVoice(patch) { bridge.command("voice", {provider:patch.provider || provider, voice:patch.provider && patch.provider !== provider ? "" : (patch.voice !== undefined ? patch.voice : voice.voice || ""), rate:patch.rate || voice.rate || 1}) }
    enabled: !bridge.loadBlocked
    spacing: metrics.inset
    Kit.CardBox {
        title: speech.t("speechProvider"); Layout.fillWidth: true
        Kit.CardRow {
            width: parent.width; title: speech.t("provider"); detail: speech.t("speechAutoHint"); divider: false
            SettingsPicker {
                objectName: "settings-speech-provider"
                readonly property var ids: ["auto", "openai", "groq", "gemini"]
                model: ids.map(id => ({label:id === "auto" ? speech.t("reasoning_auto") : ({openai:"OpenAI",groq:"Groq",gemini:"Gemini"})[id], detail:id === "auto" ? "" : (speech.bridge.discovering, speech.bridge.localModels, speech.t(speech.bridge.providerState(id).keyed ? "keyPresent" : "keyAbsent"))}))
                textRole: "label"
                currentIndex: ids.indexOf(speech.bridge.state.speechProvider || "auto")
                Accessible.name: speech.t("speechProvider")
                onActivated: speech.bridge.command("speechProvider", {value:ids[currentIndex]})
            }
        }
    }
    Kit.CardBox {
        title: speech.t("voiceProvider"); Layout.fillWidth: true
        ColumnLayout {
            width: parent.width; spacing: 0
            Kit.CardRow {
                title: speech.t("provider")
                SettingsPicker {
                    objectName: "settings-voice-provider"
                    readonly property var ids: ["system","edge","openai","gemini","elevenlabs"]
                    model: [speech.t("voiceSystem"),"Microsoft Edge","OpenAI","Gemini","ElevenLabs"]
                    currentIndex: ids.indexOf(speech.provider); Accessible.name: speech.t("voiceProvider")
                    onActivated: speech.setVoice({provider:ids[currentIndex]})
                }
            }
            Kit.CardRow {
                title: speech.t("voiceID"); detail: speech.t("voiceHint")
                SettingsPicker {
                    objectName: "settings-voice-id"; visible: !["elevenlabs", "edge"].includes(speech.provider)
                    model: speech.voiceOptions; textRole: "label"; valueRole: "id"
                    currentIndex: Math.max(0, speech.voiceOptions.findIndex(item => item.id === (speech.voice.voice || "")))
                    Accessible.name: speech.t("voiceID")
                    onActivated: speech.setVoice({voice:currentValue})
                }
                TextField {
                    visible: ["elevenlabs", "edge"].includes(speech.provider)
                    Layout.fillWidth: true; Layout.maximumWidth: speech.metrics.sidebar
                    text: speech.voice.voice || ""; placeholderText: speech.t("voiceAutomatic"); Accessible.name: speech.t("voiceID"); maximumLength: 256
                    onEditingFinished: if (!inputMethodComposing) speech.setVoice({voice:text.trim()})
                }
            }
            Kit.CardRow {
                title: speech.t("voiceRate")
                SettingsPicker {
                    objectName: "settings-voice-rate"
                    readonly property var rates: [0.75,1,1.25,1.5,2]
                    model: rates.map(rate => rate.toLocaleString(Qt.locale(speech.bridge.state.locale), 'g', 3) + "×")
                    currentIndex: rates.indexOf(speech.voice.rate || 1); enabled: speech.bridge.rateSupported(speech.provider)
                    Accessible.name: speech.t("voiceRate")
                    onActivated: speech.setVoice({rate:rates[currentIndex]})
                }
            }
            Kit.CardRow {
                title: speech.t("voicePreview"); detail: speech.bridge.audio.preparing && speech.bridge.audio.speakingSource === "settings-preview" ? speech.t("preparingVoice") : speech.t("voicePreviewText"); divider: false
                Kit.GlassButton {
                    objectName: "settings-voice-preview"; icon.source: "icons/listen.svg"
                    text: speech.t(speech.bridge.audio.speaking && speech.bridge.audio.speakingSource === "settings-preview" ? "stopSpeaking" : "voicePreview")
                    onClicked: { if (speech.bridge.audio.speaking && speech.bridge.audio.speakingSource === "settings-preview") speech.bridge.audio.stopSpeaking(); else speech.bridge.audio.speak(speech.t("voicePreviewText"), speech.bridge.state.locale, "settings-preview", speech.provider) }
                }
            }
            Label { text: speech.t(speech.bridge.audio.error); visible: !!speech.bridge.audio.error; wrapMode: Text.Wrap; Layout.fillWidth: true }
        }
    }
    Label { text: speech.t("voiceKeysHint"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
    Kit.GlassButton { text: speech.t("manageKeys"); onClicked: speech.manageKeys() }
}

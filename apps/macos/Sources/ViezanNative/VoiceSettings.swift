import SwiftUI
import ViezanDomain

// Speech-to-text and reading voice in one card. Every change applies at once; the
// preview reads a sentence in the app language with the current choice.
struct VoiceSettings: View {
    @Bindable var store: WorkbenchStore
    private static let sttNames = ["openai": "OpenAI", "gemini": "Gemini", "groq": "Groq"]
    private static let openAIVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
    private static let geminiVoices = ["Aoede", "Kore", "Puck", "Charon", "Fenrir", "Zephyr"]
    private var voice: VoicePreferences { store.workspace.voice ?? VoicePreferences() }
    private func set(provider: String? = nil, voice id: String? = nil, rate: Double? = nil) {
        let current = voice
        store.setVoice(provider: provider ?? current.provider, voice: provider != nil && provider != current.provider ? "" : (id ?? current.voice), rate: rate ?? current.rate)
    }
    private var speechStatus: (String, StatusTone) {
        let provider = store.speechProvider
        guard store.providers.checked else { return (store.text("keyUnverified"), .idle) }
        if store.providers.speechReady(provider) { return (store.text("speechReady"), .ready) }
        return (provider == "auto" ? store.text("speechProviderMissing") : store.text("speechNeedsKey").replacingOccurrences(of: "{name}", with: Self.sttNames[provider] ?? provider), .failed)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            CardSection(flush: true, title: store.text("voiceTitle")) {
                CardRow(title: store.text("speechProvider"), detail: store.text("speechAutoHint")) {
                    let (text, tone) = speechStatus
                    StatusBadge(text: text, tone: tone)
                    Picker(store.text("speechProvider"), selection: $store.speechProvider) {
                        Text(store.text("reasoning_auto")).tag("auto"); Text("OpenAI").tag("openai"); Text("Groq").tag("groq"); Text("Gemini").tag("gemini")
                    }.labelsHidden().fixedSize()
                }
                CardRow(title: store.text("voiceProvider")) {
                    Picker(store.text("voiceProvider"), selection: Binding(get: { voice.provider }, set: { set(provider: $0) })) {
                        Text(store.text("voiceSystem")).tag("system"); Text("Microsoft Edge").tag("edge"); Text("OpenAI").tag("openai"); Text("Gemini").tag("gemini"); Text("ElevenLabs").tag("elevenlabs")
                    }.labelsHidden().fixedSize().accessibilityIdentifier("settings-voice-provider")
                }
                CardRow(title: store.text("voiceID"), detail: store.text("voiceHint")) { voicePicker }
                CardRow(title: store.text("voiceRate")) {
                    Picker(store.text("voiceRate"), selection: Binding(get: { voice.rate ?? 1 }, set: { set(rate: $0) })) {
                        ForEach(VoicePreferences.rates, id: \.self) { Text($0.formatted(.number.precision(.fractionLength(0...2))) + "×").tag($0) }
                    }.labelsHidden().fixedSize().disabled(["gemini", "elevenlabs"].contains(voice.provider))
                }
                CardRow(title: store.text("voicePreview"), detail: store.text("voicePreviewText"), divider: false) {
                    if store.audio.speaking { Button(store.text("stopSpeaking"), role: .destructive) { store.audio.stopSpeaking() }.buttonStyle(.vznOutline) }
                    else { Button(store.text("voicePreview"), systemImage: "speaker.wave.2") { store.audio.speak(store.text("voicePreviewText"), language: store.workspace.locale) }.buttonStyle(.vznOutline).accessibilityIdentifier("settings-voice-preview") }
                    if let error = store.audio.error { Text(store.text(error)).font(.vzn("smallScale")).foregroundStyle(.secondary) }
                }
            }
            HStack(spacing: metric("inset")) {
                Button(store.text("manageKeys")) { NotificationCenter.default.post(name: .viezanOpenSettings, object: "providers") }.buttonStyle(.vznOutline)
                Text(store.text("voiceKeysHint")).font(.vzn("captionScale")).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
    // Each provider lists its real voice IDs; only ElevenLabs takes a free voice ID.
    @ViewBuilder private var voicePicker: some View {
        let selection = Binding(get: { voice.voice }, set: { set(voice: $0) })
        switch voice.provider {
        case "system":
            Picker(store.text("voiceID"), selection: selection) {
                Text(store.text("voiceAutomatic")).tag("")
                ForEach(store.audio.voices) { Text($0.name + " · " + $0.language).tag($0.id) }
            }.labelsHidden().frame(maxWidth: metric("sidebar"))
        case "edge":
            Picker(store.text("voiceID"), selection: selection) {
                Text(store.text("voiceAutomatic")).tag("")
                ForEach(EdgeSpeech.voices.sorted { $0.value < $1.value }, id: \.value) { Text($0.value).tag($0.value) }
            }.labelsHidden().frame(maxWidth: metric("sidebar"))
        case "openai", "gemini":
            Picker(store.text("voiceID"), selection: selection) {
                Text(store.text("voiceAutomatic")).tag("")
                ForEach(voice.provider == "openai" ? Self.openAIVoices : Self.geminiVoices, id: \.self) { Text($0.capitalized).tag($0) }
            }.labelsHidden().fixedSize()
        default:
            TextField(store.text("voiceID"), text: selection).textFieldStyle(.roundedBorder).frame(maxWidth: metric("sidebar"))
        }
    }
}

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
                    SettingsPicker(id: "speech-provider", label: store.text("speechProvider"),
                                   options: [("auto", store.text("reasoning_auto")), ("openai", "OpenAI"), ("groq", "Groq"), ("gemini", "Gemini")].map { SettingsPickerOption(id: $0.0, title: $0.1) },
                                   selection: store.speechProvider) { store.speechProvider = $0 }
                }
                CardRow(title: store.text("voiceProvider")) {
                    SettingsPicker(id: "voice-provider", label: store.text("voiceProvider"),
                                   options: [("system", store.text("voiceSystem")), ("edge", "Microsoft Edge"), ("openai", "OpenAI"), ("gemini", "Gemini"), ("elevenlabs", "ElevenLabs")].map { SettingsPickerOption(id: $0.0, title: $0.1) },
                                   selection: voice.provider) { set(provider: $0) }.accessibilityIdentifier("settings-voice-provider")
                }
                CardRow(title: store.text("voiceID"), detail: store.text("voiceHint")) { voicePicker }
                CardRow(title: store.text("voiceRate")) {
                    SettingsPicker(id: "voice-rate", label: store.text("voiceRate"),
                                   options: VoicePreferences.rates.map { SettingsPickerOption(id: String($0), title: $0.formatted(.number.precision(.fractionLength(0...2))) + "×") },
                                   selection: String(voice.rate ?? 1)) { set(rate: Double($0) ?? 1) }.disabled(!VoicePreferences.rateSupported(voice.provider))
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
            // Overlays-Settings board: system voices grouped by language with their locale.
            SettingsPicker(id: "voice-id", label: store.text("voiceID"),
                           options: [SettingsPickerOption(id: "", title: store.text("voiceAutomatic"))] + store.audio.voices.sorted { ($0.language, $0.name) < ($1.language, $1.name) }
                               .map { SettingsPickerOption(id: $0.id, title: $0.name, detail: $0.language, group: Locale.current.localizedString(forIdentifier: $0.language) ?? $0.language) },
                           selection: voice.voice) { set(voice: $0) }.frame(maxWidth: metric("sidebar"))
        case "edge":
            SettingsPicker(id: "voice-id", label: store.text("voiceID"),
                           options: [SettingsPickerOption(id: "", title: store.text("voiceAutomatic"))] + EdgeSpeech.voices.sorted { $0.value < $1.value }.map { SettingsPickerOption(id: $0.value, title: $0.value) },
                           selection: voice.voice) { set(voice: $0) }.frame(maxWidth: metric("sidebar"))
        case "openai", "gemini":
            SettingsPicker(id: "voice-id", label: store.text("voiceID"),
                           options: [SettingsPickerOption(id: "", title: store.text("voiceAutomatic"))] + (voice.provider == "openai" ? Self.openAIVoices : Self.geminiVoices).map { SettingsPickerOption(id: $0, title: $0.capitalized) },
                           selection: voice.voice) { set(voice: $0) }
        default:
            TextField(store.text("voiceID"), text: selection).textFieldStyle(.roundedBorder).frame(maxWidth: metric("sidebar"))
        }
    }
}

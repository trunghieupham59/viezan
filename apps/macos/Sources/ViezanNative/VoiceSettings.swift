import SwiftUI
import ViezanDomain
struct VoiceSettings: View {
    let store: WorkbenchStore
    @State private var provider = "system"
    @State private var voice = ""
    var body: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            Picker(store.text("voiceProvider"), selection: Binding(get: { provider }, set: { provider = $0; voice = "" })) {
                Text(store.text("voiceSystem")).tag("system"); Text("Microsoft Edge").tag("edge"); Text("OpenAI").tag("openai"); Text("Gemini").tag("gemini"); Text("ElevenLabs").tag("elevenlabs")
            }
            if provider == "system" {
                Picker(store.text("voiceID"), selection: $voice) {
                    Text(store.text("voiceAutomatic")).tag("")
                    ForEach(store.audio.voices) { Text($0.name + " · " + $0.language).tag($0.id) }
                }
            } else { TextField(store.text("voiceID"), text: $voice).textFieldStyle(.roundedBorder) }
            Text(store.text("voiceHint")).font(.caption).foregroundStyle(.secondary)
            Button(store.text("apply")) { store.setVoice(provider: provider, voice: voice) }
        }.onAppear { provider = store.workspace.voice?.provider ?? "system"; voice = store.workspace.voice?.voice ?? "" }
    }
}

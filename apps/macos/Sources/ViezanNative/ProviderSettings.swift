import SwiftUI
import ViezanDomain

struct ProviderSettings: View {
    let store: WorkbenchStore
    @State private var provider = "openai"
    @State private var key = ""
    @State private var busy = false
    @State private var status = ""
    @State private var confirmDelete = false
    var body: some View {
        GroupBox(store.text("providerSettings")) {
            VStack(alignment: .leading, spacing: metric("inset")) {
                Picker(store.text("provider"), selection: $provider) {
                    Text("OpenAI").tag("openai"); Text("Claude").tag("claude"); Text("Gemini").tag("gemini"); Text("Groq").tag("groq"); Text("Tavily").tag("tavily"); Text("Brave Search").tag("brave"); Text("Jina").tag("jina"); Text("ElevenLabs").tag("elevenlabs")
                }.disabled(busy).onChange(of: provider) { _, _ in key = ""; status = "" }
                SecureField(store.text("apiKey"), text: $key).textFieldStyle(.roundedBorder)
                HStack {
                    Button(store.text("saveKey")) { perform(delete: false) }.disabled(key.isEmpty || busy)
                    Button(store.text("deleteKey"), role: .destructive) { confirmDelete = true }.disabled(busy)
                    if busy { ProgressView().controlSize(.small) }
                }
                Text(store.text("keyStorageHint")).font(.caption).foregroundStyle(.secondary)
                if !status.isEmpty { Text(store.text(status)).font(.callout) }
            }.padding(metric("small"))
        }.confirmationDialog(store.text("deleteKeyConfirm"), isPresented: $confirmDelete) {
            Button(store.text("deleteKey"), role: .destructive) { perform(delete: true) }
        }.onDisappear { key = "" }
    }
    private func perform(delete: Bool) {
        let selected = provider, secret = key
        key = ""; busy = true; status = ""
        Task {
            let success = await Task.detached {
                do {
                    if delete { try CredentialStore.remove(selected) }
                    else { try CredentialStore.save(secret, provider: selected) }
                    return true
                } catch { return false }
            }.value
            busy = false; if provider == selected { status = success ? "keySaved" : "keyStorageError" }
        }
    }
}

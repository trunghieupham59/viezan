import SwiftUI
import ViezanDomain

struct ProviderSettings: View {
    let store: WorkbenchStore
    @State private var provider = "openai"
    @State private var key = ""
    @State private var busy = false
    @State private var status = ""
    @State private var confirmDelete = false
    @State private var keyed: Set<String> = []
    private static let names = ["openai": "OpenAI", "claude": "Claude", "gemini": "Gemini", "groq": "Groq", "tavily": "Tavily", "brave": "Brave Search", "jina": "Jina", "elevenlabs": "ElevenLabs"]
    private static func purpose(_ id: String) -> String {
        ProviderDiscovery.cloudProviders.contains(id) ? "purposeChat" : id == "groq" ? "purposeSpeech" : id == "elevenlabs" ? "purposeVoice" : "purposeSearch"
    }
    // Presence comes from the keychain without unlocking it; chat providers are verified
    // by discovery listing their models (free), so a rejected key shows its error here.
    private func status(_ id: String) -> (String, StatusTone) {
        guard keyed.contains(id) else { return (store.text("keyAbsent"), .idle) }
        guard ProviderDiscovery.cloudProviders.contains(id) else { return (store.text("keyPresent"), .ready) }
        if let models = store.providers.models[id] { return (store.text("keyPresent") + " · \(models.count) " + store.text("modelsAvailable"), .ready) }
        if let failure = store.providers.failures[id] { return (store.text(failure), .failed) }
        return (store.text("keyPresent") + " · " + store.text("keyUnverified"), store.discovering ? .busy : .idle)
    }
    var body: some View {
        GroupBox(store.text("providerSettings")) {
            VStack(alignment: .leading, spacing: metric("inset")) {
                VStack(spacing: 0) {
                    ForEach(CredentialStore.providers, id: \.self) { id in
                        CardRow(title: Self.names[id] ?? id, detail: store.text(Self.purpose(id)), divider: id != CredentialStore.providers.last) {
                            let (text, tone) = status(id)
                            StatusBadge(text: text, tone: tone)
                        }
                    }
                }
                Button(store.text("checkAgain")) { refreshKeys(); store.discoverProviders() }.disabled(store.discovering)
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
        }.onAppear(perform: refreshKeys).onDisappear { key = "" }
    }
    private func refreshKeys() { keyed = Set(CredentialStore.providers.filter(CredentialStore.has)) }
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
            // A saved or removed key changes which AI this device can use.
            if success { refreshKeys(); store.discoverProviders() }
        }
    }
}

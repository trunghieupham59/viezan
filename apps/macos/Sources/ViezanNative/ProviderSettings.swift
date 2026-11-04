import SwiftUI
import ViezanDomain

extension Notification.Name {
    /// Settings › AI providers: "Check again" in the section intro (Glass) re-reads keys and rediscovers models.
    static let viezanProviderRecheck = Notification.Name("viezan.providerRecheck")
}

// One row per provider: purpose, live status, and the key actions for that row.
// Keys never leave the keychain: the view only learns whether one is present, and
// chat providers are verified by discovery listing their models.
struct ProviderSettings: View {
    let store: WorkbenchStore
    @State private var editing: String?
    @State private var key = ""
    @State private var busy: String?
    @State private var confirmDelete: String?
    @Environment(\.settingsConfirm) private var confirm
    @State private var keyed: Set<String> = []
    private static let names = ["openai": "OpenAI", "claude": "Claude", "gemini": "Gemini", "groq": "Groq", "tavily": "Tavily", "brave": "Brave Search", "jina": "Jina", "elevenlabs": "ElevenLabs"]
    // Where each provider issues keys; opened in the browser, never fetched by the app.
    private static let keyPages = ["openai": "https://platform.openai.com/api-keys", "claude": "https://console.anthropic.com/settings/keys", "gemini": "https://aistudio.google.com/app/apikey",
                                   "groq": "https://console.groq.com/keys", "tavily": "https://app.tavily.com/home", "brave": "https://api.search.brave.com/app/keys", "jina": "https://jina.ai/api-dashboard/", "elevenlabs": "https://elevenlabs.io/app/settings/api-keys"]
    private static func purpose(_ id: String) -> String {
        ProviderDiscovery.cloudProviders.contains(id) ? "purposeChat" : id == "groq" ? "purposeSpeech" : id == "elevenlabs" ? "purposeVoice" : "purposeSearch"
    }
    private func status(_ id: String) -> (String, StatusTone) {
        guard keyed.contains(id) else { return (store.text("keyAbsent"), .idle) }
        guard ProviderDiscovery.cloudProviders.contains(id) else { return (store.text("keyPresent"), .ready) }
        if let models = store.providers.models[id] { return (store.text("keyPresent") + " · \(models.count) " + store.text("modelsAvailable"), .ready) }
        if let failure = store.providers.failures[id] { return (store.text(failure), .failed) }
        return (store.text("keyPresent") + " · " + store.text("keyUnverified"), store.discovering ? .busy : .idle)
    }
    @Environment(\.colorScheme) private var scheme
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    var body: some View {
        if glass { glassBody } else { classicBody }
    }
    // Settings-Models board: one card in two groups (Cloud; Search and voice). Each row is a
    // 28 pt mark, the name with its status chip, "Get API key ↗" under it, and the key actions
    // on the right; adding or replacing a key opens a field inside the row, not a popover.
    // Groq only transcribes speech, so it sits with search and voice (BACKEND-GAPS #82).
    private static let cloudGroup = ["claude", "openai", "gemini"]
    private var glassBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            groupHead(store.text("providerGroupCloud"), trailing: store.text("providerInUse").replacingOccurrences(of: "{model}", with: inUseLabel))
            ForEach(Self.cloudGroup.filter(CredentialStore.providers.contains), id: \.self) { id in CardDivider(); glassRow(id) }
            CardDivider()
            groupHead(store.text("providerGroupSearchVoice"), trailing: nil)
            ForEach(CredentialStore.providers.filter { !Self.cloudGroup.contains($0) }, id: \.self) { id in CardDivider(); glassRow(id) }
        }
        .cardSurface(padded: false)
        .onAppear(perform: refreshKeys).onDisappear { key = "" }
        .onReceive(NotificationCenter.default.publisher(for: .viezanProviderRecheck)) { _ in refreshKeys(); store.discoverProviders() }
    }
    /// "Claude · Haiku 5.5": the provider, then the same short model name as the composer chip.
    private var inUseLabel: String {
        let model = store.session.model, full = nativeModelLabel(model, store: store)
        let provider = full.components(separatedBy: " · ").first ?? full
        return provider == full ? ModelLineup.shortName(model) : provider + " · " + ModelLineup.shortName(model)
    }
    private func groupHead(_ title: String, trailing: String?) -> some View {
        HStack(spacing: metric("small")) {
            Text(title).font(.vzn("subtitleScale", .semibold)).foregroundStyle(contentColor("text-strong", scheme)).accessibilityAddTraits(.isHeader)
            Spacer(minLength: metric("small"))
            if let trailing { Text(trailing).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).lineLimit(1).help(store.session.model) }
        }.padding(.horizontal, metric("inset")).frame(minHeight: metric("navControl") + metric("small"))
    }
    private func glassRow(_ id: String) -> some View {
        let name = Self.names[id] ?? id, (text, tone) = status(id)
        return VStack(alignment: .leading, spacing: metric("gap")) {
            HStack(spacing: metric("gap")) {
                Text(String(name.prefix(1))).font(.system(size: NSFont.systemFontSize, weight: .semibold)).foregroundStyle(contentColor("text-muted", scheme))
                    .frame(width: metric("gutter") + metric("tight"), height: metric("gutter") + metric("tight"))
                    .background(contentColor("surface-muted", scheme), in: RoundedRectangle(cornerRadius: metric("small") - metric("hairline"), style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: metric("hairline") * 2) {
                    HStack(spacing: metric("small")) {
                        Text(name).font(.vzn("labelScale", .medium)).foregroundStyle(contentColor("text-strong", scheme))
                        StatusBadge(text: text, tone: tone)
                        if busy == id { ProgressView().controlSize(.small) }
                    }
                    if let page = Self.keyPages[id].flatMap(URL.init) {
                        Link(destination: page) {
                            HStack(spacing: metric("hairline") * 2) { Text(store.text("getKey")); Image(systemName: "arrow.up.right").imageScale(.small) }
                                .font(.vzn("smallScale", .medium)).foregroundStyle(contentColor("action-text", scheme))
                        }.buttonStyle(.plain).help(page.absoluteString).accessibilityLabel(store.text("getKey") + " · " + name)
                    }
                }
                Spacer(minLength: metric("small"))
                Button(store.text(keyed.contains(id) ? "replaceKey" : "addKey")) { key = ""; editing = editing == id ? nil : id }
                    .buttonStyle(.vznOutline).fixedSize().disabled(busy != nil).accessibilityIdentifier("provider-key-" + id)
                if keyed.contains(id) {
                    Button(store.text("deleteKey"), role: .destructive) {
                        if let confirm { confirm(SettingsConfirm(title: store.text("deleteKeyConfirm"), message: name, confirm: store.text("deleteKey")) { perform(id, delete: true) }) }
                        else { confirmDelete = id }
                    }.buttonStyle(.vznQuiet).foregroundStyle(contentColor("danger", scheme)).fixedSize().disabled(busy != nil)
                }
            }
            if editing == id { inlineEditor(id).padding(.leading, metric("gutter") + metric("tight") + metric("gap")) }
        }
        .padding(.horizontal, metric("inset")).padding(.vertical, metric("gap"))
        .help(store.text(Self.purpose(id)))
        .accessibilityElement(children: .contain).accessibilityLabel(name + ", " + store.text(Self.purpose(id)))
    }
    // The key field inside the row: lock glyph, secure entry, Save as the only primary, Close, and the hint.
    private func inlineEditor(_ id: String) -> some View {
        VStack(alignment: .leading, spacing: metric("gap")) {
            HStack(spacing: metric("small")) {
                Image(systemName: "lock").foregroundStyle(contentColor("text-muted", scheme)).accessibilityHidden(true)
                SecureField(store.text("apiKey"), text: $key).textFieldStyle(.plain).onSubmit { if !key.isEmpty { perform(id, delete: false) } }
                    .accessibilityIdentifier("provider-key-field")
            }.padding(.horizontal, metric("gap")).frame(height: metric("control"))
                .background { InsetInputSurface(radius: metric("controlRadius"), focused: true) }
            HStack(spacing: metric("small")) {
                Button(store.text("saveKey")) { perform(id, delete: false) }.buttonStyle(.vznPrimary).disabled(key.isEmpty).keyboardShortcut(.defaultAction)
                Button(store.text("close")) { editing = nil; key = "" }.buttonStyle(.vznQuiet).keyboardShortcut(.cancelAction)
                if keyed.contains(id) { Text(store.text("keyReplaceHint")).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).fixedSize(horizontal: false, vertical: true) }
            }
        }
    }
    private var classicBody: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            CardSection(flush: true, title: store.text("providerSettings")) {
                ForEach(CredentialStore.providers, id: \.self) { id in
                    CardRow(title: Self.names[id] ?? id, detail: store.text(Self.purpose(id)), divider: id != CredentialStore.providers.last) {
                        let (text, tone) = status(id)
                        StatusBadge(text: text, tone: tone)
                        if busy == id { ProgressView().controlSize(.small) }
                        if let page = Self.keyPages[id].flatMap(URL.init) {
                            Link(destination: page) { Label(store.text("getKey"), systemImage: "arrow.up.right.square") }
                                .buttonStyle(.vznQuiet).help(page.absoluteString).accessibilityLabel(store.text("getKey") + " · " + (Self.names[id] ?? id))
                        }
                        Button(store.text(keyed.contains(id) ? "replaceKey" : "addKey")) { key = ""; editing = id }
                            .buttonStyle(.vznOutline).disabled(busy != nil).accessibilityIdentifier("provider-key-" + id)
                            .popover(isPresented: Binding(get: { editing == id }, set: { if !$0 { editing = nil; key = "" } })) { keyEditor(id) }
                        if keyed.contains(id) {
                            Button(store.text("deleteKey"), role: .destructive) {
                                // Glass: removing a key cannot be undone, so it asks in the page's centred dialog.
                                if let confirm { confirm(SettingsConfirm(title: store.text("deleteKeyConfirm"), message: Self.names[id] ?? id, confirm: store.text("deleteKey")) { perform(id, delete: true) }) }
                                else { confirmDelete = id }
                            }.buttonStyle(.vznQuiet).disabled(busy != nil)
                        }
                    }
                }
            }
            HStack(spacing: metric("inset")) {
                Button(store.text("checkAgain")) { refreshKeys(); store.discoverProviders() }.buttonStyle(.vznOutline).disabled(store.discovering)
                Text(store.text("keyStorageHint")).font(.vzn("captionScale")).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .confirmationDialog(store.text("deleteKeyConfirm"), isPresented: Binding(get: { confirmDelete != nil }, set: { if !$0 { confirmDelete = nil } })) {
            Button(store.text("deleteKey"), role: .destructive) { if let id = confirmDelete { perform(id, delete: true) }; confirmDelete = nil }
        }
        .onAppear(perform: refreshKeys).onDisappear { key = "" }
    }
    // A bounded sheet-like popover: one secret field, Save as the only primary action.
    private func keyEditor(_ id: String) -> some View {
        VStack(alignment: .leading, spacing: metric("gap")) {
            Text(Self.names[id] ?? id).font(.vzn("labelScale", .semibold))
            SecureField(store.text("apiKey"), text: $key).textFieldStyle(.roundedBorder).onSubmit { if !key.isEmpty { perform(id, delete: false) } }
                .accessibilityIdentifier("provider-key-field")
            HStack {
                Spacer()
                Button(store.text("close")) { editing = nil; key = "" }.buttonStyle(.vznOutline).keyboardShortcut(.cancelAction)
                Button(store.text("saveKey")) { perform(id, delete: false) }.buttonStyle(.vznPrimary).disabled(key.isEmpty).keyboardShortcut(.defaultAction)
            }
        }.padding(metric("inset")).frame(width: metric("sidebar") + metric("editor"))
    }
    private func refreshKeys() { keyed = Set(CredentialStore.providers.filter(CredentialStore.has)) }
    private func perform(_ id: String, delete: Bool) {
        let secret = key
        key = ""; editing = nil; busy = id
        Task {
            let success = await Task.detached {
                do {
                    if delete { try CredentialStore.remove(id) } else { try CredentialStore.save(secret, provider: id) }
                    return true
                } catch { return false }
            }.value
            busy = nil
            ToastCenter.shared.show(store.text(success ? "keySaved" : "keyStorageError"), key: "provider-key", error: !success)
            // A saved or removed key changes which AI this device can use; discovery verifies chat keys.
            if success { refreshKeys(); store.discoverProviders() }
        }
    }
}

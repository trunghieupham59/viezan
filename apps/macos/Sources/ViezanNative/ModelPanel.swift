import SwiftUI
import ViezanDomain

// The model picker as a shell layer (like Quick History and ⌘K), not a system menu: a search
// field first, then purpose, recent, one group per provider at one model per size, and local
// models. Typing filters every provider at once; ↑↓ move, Return chooses, Escape closes and
// focus returns to the opener. A typed "provider:model" the listing lacks is still selectable.
struct ModelPanel: View {
    @Bindable var store: WorkbenchStore
    var dismiss: () -> Void
    var availableHeight: CGFloat
    @Environment(\.colorScheme) private var scheme
    @State private var query = ""
    @State private var highlighted: String?
    static let providerNames = ["claude": "Claude", "openai": "OpenAI", "gemini": "Gemini", "ollama": "Ollama", "lmstudio": "LM Studio", "llamacpp": "llama.cpp"]
    private var sections: [ModelLineup.Section] {
        ModelLineup.sections(query: query, tiers: store.modelTiers(store.session.id), recent: store.recentPicks, listings: store.providers.models,
                             cloud: ProviderDiscovery.cloudProviders, local: ProviderDiscovery.localProviders)
    }
    private var rows: [ModelLineup.Row] { sections.flatMap(\.rows) }
    private func title(_ key: String) -> String {
        switch key {
        case "purpose": return store.text("purposeSection")
        case "recent": return store.text("recentModels")
        case "local": return store.text("localSection")
        case "typed": return store.text("model")
        default: return Self.providerNames[key] ?? key
        }
    }
    private func selected(_ row: ModelLineup.Row) -> Bool {
        switch row {
        case .tier(let tier, let id): return store.session.model == id && (store.session.carefulReasoning ?? false) == (tier == .careful)
        case .model(let id), .typed(let id): return store.session.model == id
        case .setup: return false
        }
    }
    private func label(_ row: ModelLineup.Row) -> (title: String, detail: String) {
        switch row {
        case .tier(let tier, let id):
            return (store.text("tier" + tier.rawValue.prefix(1).uppercased() + tier.rawValue.dropFirst()) + " · " + ModelLineup.shortName(id), "")
        case .model(let id):
            let short = ModelLineup.shortName(id), raw = ModelLineup.model(id)
            return (short, short == raw ? (Self.providerNames[ModelLineup.provider(id)] ?? "") : raw)
        case .setup(let provider):
            return (provider == "local" ? store.text("setupLocal") : store.text("setupProvider").replacingOccurrences(of: "{provider}", with: Self.providerNames[provider] ?? provider), "")
        case .typed(let id):
            return (store.text("useModelID").replacingOccurrences(of: "{id}", with: id), "")
        }
    }
    private func choose(_ row: ModelLineup.Row) {
        switch row {
        case .tier(let tier, _): store.applyModelTier(store.session.id, tier)
        case .model(let id), .typed(let id): store.setModel(store.session.id, id)
        case .setup(let provider):
            dismiss()
            NotificationCenter.default.post(name: .viezanOpenSettings, object: provider == "local" ? "localModels" : "providers")
            return
        }
        dismiss()
    }
    private func move(_ offset: Int) {
        let list = rows
        guard !list.isEmpty else { return }
        let index = highlighted.flatMap { id in list.firstIndex { $0.id == id } } ?? (offset > 0 ? -1 : list.count)
        highlighted = list[min(max(index + offset, 0), list.count - 1)].id
    }
    private func chooseHighlighted() {
        if let row = rows.first(where: { $0.id == highlighted }) ?? rows.first { choose(row) }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            SearchBox(query: $query, label: store.text("searchModels"), move: move, submit: chooseHighlighted, cancel: dismiss)
                .onChange(of: query) { _, _ in highlighted = rows.first?.id }
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        if sections.isEmpty { Text(store.text("noModelMatch")).foregroundStyle(.secondary).padding(metric("inset")) }
                        ForEach(sections, id: \.key) { section in
                            Eyebrow(text: title(section.key)).padding(.horizontal, metric("small")).padding(.top, metric("gap")).padding(.bottom, metric("tight"))
                            ForEach(section.rows) { row in
                                rowView(row).id(row.id)
                            }
                        }
                    }
                }
                .onChange(of: highlighted) { _, id in if let id { proxy.scrollTo(id) } }
            }.frame(maxHeight: .infinity)
            CardDivider()
            HStack(spacing: metric("small")) {
                // One refresh for every provider; no submenu.
                Button(store.text("refreshModels"), systemImage: "arrow.clockwise") { store.discoverProviders() }.buttonStyle(.vznQuiet).disabled(store.loadingModels || store.discovering)
                if store.loadingModels { ProgressView().controlSize(.small) }
                Spacer(minLength: metric("small"))
            }.font(.vzn("smallScale"))
        }
        .padding(metric("inset")).frame(maxHeight: availableHeight).fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .contain).accessibilityLabel(store.text("model"))
        .accessibilityIdentifier("model-panel")
    }
    private func rowView(_ row: ModelLineup.Row) -> some View {
        let text = label(row)
        let setup: Bool = { if case .setup = row { return true } else { return false } }()
        return PanelRow(title: text.title, detail: text.detail, selected: selected(row), highlighted: highlighted == row.id, muted: setup, identifier: "model-row-" + row.id) { choose(row) }
    }
}

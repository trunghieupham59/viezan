import SwiftUI
import ViezanDomain

// The model picker as a shell layer (like Quick History and ⌘K), not a system menu: a search
// field first, then purpose, pinned, recent, one group per provider at one model per size, and
// local models. Typing filters every provider at once; ↑↓ move, Return chooses, Escape closes and
// focus returns to the opener. A typed "provider:model" the listing lacks is still selectable.
// A model row carries a pin control (also ⌘P on the highlighted row, the context menu and an
// accessibility action); pinned models stay in their own group at the top.
struct ModelPanel: View {
    @Bindable var store: WorkbenchStore
    var dismiss: () -> Void
    var availableHeight: CGFloat
    @Environment(\.colorScheme) private var scheme
    @State private var query = ""
    // "section/row": a model listed in two groups (pinned or recent, and its provider) is two rows.
    @State private var highlighted: String?
    @State private var hovered: String?
    static let providerNames = ["claude": "Claude", "openai": "OpenAI", "gemini": "Gemini", "ollama": "Ollama", "lmstudio": "LM Studio", "llamacpp": "llama.cpp"]
    private var sections: [ModelLineup.Section] {
        ModelLineup.sections(query: query, tiers: store.modelTiers(store.session.id), pinned: store.pinnedModels, recent: store.recentPicks, listings: store.providers.models,
                             cloud: ProviderDiscovery.cloudProviders, local: ProviderDiscovery.localProviders)
    }
    private var rows: [(key: String, row: ModelLineup.Row)] { sections.flatMap { section in section.rows.map { (section.key + "/" + $0.id, $0) } } }
    private func title(_ key: String) -> String {
        switch key {
        case "purpose": return store.text("purposeSection")
        case "pinned": return store.text("pinnedModels")
        case "recent": return store.text("recentModels")
        case "local": return store.text("localSection")
        case "typed": return store.text("model")
        default: return Self.providerNames[key] ?? key
        }
    }
    private func selected(_ row: ModelLineup.Row) -> Bool {
        switch row {
        case .tier(let tier, let id): return store.session.model == id && (store.session.reasoningEffort == "high" || (store.session.reasoningEffort == nil && store.session.carefulReasoning == true)) == (tier == .careful)
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
        let index = highlighted.flatMap { key in list.firstIndex { $0.key == key } } ?? (offset > 0 ? -1 : list.count)
        highlighted = list[min(max(index + offset, 0), list.count - 1)].key
    }
    private func chooseHighlighted() {
        if let row = (rows.first { $0.key == highlighted } ?? rows.first)?.row { choose(row) }
    }
    /// The model a row can pin: named models only, never a purpose or a setup row.
    private func pinnable(_ row: ModelLineup.Row) -> String? {
        switch row { case .model(let id), .typed(let id): return id; case .tier, .setup: return nil }
    }
    /// ⌘P: the row the arrow keys are on, or the model in use when none is. Unpinning removes the
    /// row from the Pinned group, so the position moves to the row that takes its place.
    private func pinHighlighted() {
        let before = rows, index = before.firstIndex { $0.key == highlighted }
        guard let id = index.flatMap({ pinnable(before[$0].row) }) ?? (highlighted == nil ? store.session.model : nil) else { return }
        store.togglePinnedModel(id)
        let after = rows
        if let index, !after.contains(where: { $0.key == highlighted }) { highlighted = after.isEmpty ? nil : after[min(index, after.count - 1)].key }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            SearchBox(query: $query, label: store.text("searchModels"), move: move, submit: chooseHighlighted, cancel: dismiss)
                .onChange(of: query) { _, _ in highlighted = rows.first?.key }
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        if sections.isEmpty { Text(store.text("noModelMatch")).foregroundStyle(.secondary).padding(metric("inset")) }
                        ForEach(sections, id: \.key) { section in
                            Eyebrow(text: title(section.key)).padding(.horizontal, metric("small")).padding(.top, metric("gap")).padding(.bottom, metric("tight"))
                            ForEach(section.rows) { row in
                                rowView(row, key: section.key + "/" + row.id).id(section.key + "/" + row.id)
                            }
                        }
                    }
                }
                .onChange(of: highlighted) { _, key in if let key { proxy.scrollTo(key) } }
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
        // ⌘P pins the row the arrow keys are on; the search field keeps focus.
        .background { Button(store.text("pinModel"), action: pinHighlighted).keyboardShortcut("p").opacity(0).allowsHitTesting(false).accessibilityHidden(true) }
        .accessibilityElement(children: .contain).accessibilityLabel(store.text("model"))
        .accessibilityIdentifier("model-panel")
    }
    @ViewBuilder private func rowView(_ row: ModelLineup.Row, key: String) -> some View {
        let text = label(row)
        let setup: Bool = { if case .setup = row { return true } else { return false } }()
        if let id = pinnable(row) {
            let pinned = store.pinnedModels.contains(id), action = store.text(pinned ? "unpinModel" : "pinModel")
            let shown = pinned || hovered == key || highlighted == key
            PanelRow(title: text.title, detail: text.detail, selected: selected(row), highlighted: highlighted == key, trailingRoom: metric("compactControl"), hovering: hovered == key, identifier: "model-row-" + key) { choose(row) }
                .accessibilityValue(pinned ? store.text("pinnedModels") : "")
                .accessibilityAction(named: Text(action)) { store.togglePinnedModel(id) }
                .overlay(alignment: .trailing) {
                    // Quiet until the row is pointed at or reached by the arrow keys; a pinned row keeps its mark.
                    Button { store.togglePinnedModel(id) } label: {
                        Image(systemName: pinned ? "pin.fill" : "pin").imageScale(.small)
                            .foregroundStyle(contentColor("text-muted", scheme))
                            .frame(width: metric("compactControl"), height: metric("compactControl")).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain).disabled(!store.canPinModel(id))
                    // Hidden means absent: the row under it takes the click, and assistive
                    // technology uses the row's own Pin action.
                    .opacity(shown ? 1 : 0).allowsHitTesting(shown).accessibilityHidden(!shown)
                    .help(action).accessibilityLabel(store.text(pinned ? "unpinModelNamed" : "pinModelNamed").replacingOccurrences(of: "{name}", with: text.title)).accessibilityIdentifier("model-pin-" + key)
                    .padding(.trailing, metric("tight"))
                }
                .onHover { inside in if inside { hovered = key } else if hovered == key { hovered = nil } }
                .contextMenu { Button(action) { store.togglePinnedModel(id) }.disabled(!store.canPinModel(id)) }
        } else {
            PanelRow(title: text.title, detail: text.detail, selected: selected(row), highlighted: highlighted == key, muted: setup, identifier: "model-row-" + key) { choose(row) }
        }
    }
}

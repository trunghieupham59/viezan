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
    var ownerID: String?
    var modelOverride: String?
    var openSettings: ((String) -> Void)?
    private var owner: Session? { ownerID.flatMap(store.session) }
    private var selection: String { modelOverride ?? owner.map(store.workspace.modelForNextRequest) ?? store.appModel }
    private var careful: Bool {
        owner?.reasoningEffort == "high" || (owner?.reasoningEffort == nil && owner?.carefulReasoning == true)
    }
    @Environment(\.colorScheme) private var scheme
    @State private var query = ""
    // "section/row": a model listed in two groups (pinned or recent, and its provider) is two rows.
    @State private var highlighted: String?
    @State private var hovered: String?
    static let providerNames = ["claude": "Claude", "openai": "OpenAI", "gemini": "Gemini", "ollama": "Ollama", "lmstudio": "LM Studio", "llamacpp": "llama.cpp"]
    private var sections: [ModelLineup.Section] {
        ModelLineup.sections(query: query, tiers: ModelLineup.tiers(for: selection, listing: store.providers.models[ModelLineup.provider(selection)] ?? []), pinned: store.pinnedModels, recent: store.recentPicks, listings: store.providers.models,
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
        case .tier(let tier, let id): return selection == id && careful == (tier == .careful)
        case .model(let id), .typed(let id): return selection == id
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
        case .tier(let tier, let model):
            store.setModel(ownerID, model)
            if let ownerID { store.setChatReasoning(ownerID, effort: tier == .careful ? "high" : "auto") }
        case .model(let id), .typed(let id): store.setModel(ownerID, id)
        case .setup(let provider):
            dismiss()
            let section = provider == "local" ? "localModels" : "providers"
            if let openSettings { openSettings(section) }
            else { NotificationCenter.default.post(name: .viezanOpenSettings, object: section) }
            return
        }
        dismiss()
    }
    private func move(_ offset: Int) {
        highlighted = ModelPanelSelection.move(in: rows, from: highlighted, by: offset)
    }
    private func chooseHighlighted() {
        if let row = (rows.first { $0.key == highlighted } ?? rows.first)?.row { choose(row) }
    }
    private func pinHighlighted() {
        guard (NSApp.keyWindow?.firstResponder as? NSTextView)?.hasMarkedText() != true else { return }
        highlighted = ModelPanelSelection.togglePin(at: highlighted, rows: { rows }, store: store, selectedModel: selection)
    }
    private var pinCount: String {
        store.text("pinnedModelsCount")
            .replacingOccurrences(of: "{count}", with: String(store.pinnedModels.count))
            .replacingOccurrences(of: "{max}", with: String(WorkbenchStore.pinnedModelLimit))
    }
    var body: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            Text(store.text("appDefaultAI")).font(.vzn("labelScale", .semibold)).accessibilityAddTraits(.isHeader)
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
                KeyCap(text: "⌘P").accessibilityLabel(store.text("pinModel") + " (⌘P)")
                Text(pinCount).monospacedDigit().foregroundStyle(contentColor("text-muted", scheme))
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
        if let id = ModelPanelSelection.pinnable(row) {
            let pinned = store.pinnedModels.contains(id), action = store.text(pinned ? "unpinModel" : "pinModel")
            let shown = pinned || hovered == key || highlighted == key
            PanelRow(title: text.title, detail: text.detail, selected: selected(row), highlighted: highlighted == key, trailingRoom: metric("compactControl"), hovering: hovered == key, identifier: "model-row-" + key) { choose(row) }
                .accessibilityValue(pinned ? store.text("pinnedModels") : "")
                .accessibilityActions {
                    if store.canPinModel(id) { Button(action) { store.togglePinnedModel(id) } }
                }
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
                    .padding(.trailing, metric("small") * 2 + metric("icon"))
                }
                .onHover { inside in if inside { hovered = key } else if hovered == key { hovered = nil } }
                .contextMenu { Button(action) { store.togglePinnedModel(id) }.disabled(!store.canPinModel(id)) }
        } else {
            PanelRow(title: text.title, detail: text.detail, selected: selected(row), highlighted: highlighted == key, muted: setup, identifier: "model-row-" + key) { choose(row) }
        }
    }
}

enum ModelPanelSelection {
    typealias Entry = (key: String, row: ModelLineup.Row)

    static func move(in rows: [Entry], from key: String?, by offset: Int) -> String? {
        guard !rows.isEmpty else { return nil }
        let index = rows.firstIndex { $0.key == key } ?? (offset > 0 ? -1 : rows.count)
        return rows[min(max(index + offset, 0), rows.count - 1)].key
    }
    static func pinnable(_ row: ModelLineup.Row) -> String? {
        switch row { case .model(let id), .typed(let id): return id; case .tier, .setup: return nil }
    }
    @MainActor static func togglePin(at key: String?, rows: () -> [Entry], store: WorkbenchStore, selectedModel: String? = nil) -> String? {
        let before = rows()
        guard !before.isEmpty else { return nil }
        let index = before.firstIndex { $0.key == key }
        let id = index.flatMap { pinnable(before[$0].row) } ?? (key == nil ? (selectedModel ?? store.workspace.modelForNextRequest(store.session)) : nil)
        guard let id, store.canPinModel(id) else { return key }
        store.togglePinnedModel(id)
        let after = rows()
        guard let index, !after.contains(where: { $0.key == key }) else { return key }
        return after.isEmpty ? nil : after[min(index, after.count - 1)].key
    }
}

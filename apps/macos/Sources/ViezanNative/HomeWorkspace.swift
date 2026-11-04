import SwiftUI
import ViezanDomain

// Home reads work and native status; the runtime probe never starts Ollama.
struct HomeWorkspace: View {
    @Bindable var store: WorkbenchStore
    var start: (Feature) -> Void
    var resume: (String) -> Void
    var settings: () -> Void
    var interpret: () -> Void
    @State private var filter: String?
    @Environment(\.colorScheme) private var scheme
    // Recent work spans text sessions and recorded interpretation sessions, newest first.
    private enum RecentEntry: Identifiable {
        case work(Session), interpretation(InterpretationSession)
        var id: String { switch self { case .work(let item): "s-" + item.id; case .interpretation(let item): "i-" + item.id } }
        var updated: Double { switch self { case .work(let item): item.updated ?? 0; case .interpretation(let item): item.segments.last.map { item.created + $0.end } ?? item.created } }
        var route: String { switch self { case .work(let item): item.feature.rawValue; case .interpretation: "interpret" } }
    }
    private var recent: [Session] {
        store.workspace.sessions.filter { store.moduleEnabled($0.feature.rawValue) && $0.comparisonParent == nil && $0.archived != true && (!$0.draft.isEmpty || !$0.messages.isEmpty || !$0.output.isEmpty) }.sorted { ($0.updated ?? 0) > ($1.updated ?? 0) }
    }
    private var entries: [RecentEntry] {
        let interpretations = store.moduleEnabled("interpret") ? store.interpretation.sessions.filter { !$0.segments.isEmpty || !$0.summary.isEmpty }.map(RecentEntry.interpretation) : []
        return (recent.map(RecentEntry.work) + interpretations).sorted { $0.updated > $1.updated }
    }
    private var active: [Session] {
        let ids = Set(store.workspace.tasks.filter { $0.status == .running }.map(\.request.sessionID))
        return recent.filter { ids.contains($0.id) }
    }
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    var body: some View {
        WorkspacePage {
            if glass {
                // Home board: intro, the model status strip and the one primary action share a row;
                // narrower panes drop the state words first, then stack the controls under the intro.
                ViewThatFits(in: .horizontal) {
                    glassIntro(detailed: true, stacked: false)
                    glassIntro(detailed: false, stacked: false)
                    // Home-Compact: the strip folds into a "● Haiku 5.5 ⌄" pill beside the primary action.
                    glassIntro(detailed: false, stacked: false, pill: true)
                    glassIntro(detailed: false, stacked: true, pill: true)
                }
            } else {
                PageIntro(title: store.text("workspace"), subtitle: store.text("workspaceSubtitle")) { newWorkButton }
            }
            if glass {
                runningSection
                glassQuickStart
                recentSection
            } else {
                runningSection
                recentSection
                quickStartSection
                providerSection
            }
        }.task { store.discoverIfNeeded() }
    }
    @ViewBuilder private func glassIntro(detailed: Bool, stacked: Bool, pill: Bool = false) -> some View {
        let controls = HStack(spacing: metric(pill ? "small" : "gap")) {
            if pill { modelPill } else { modelStrip(detailed: detailed) }
            newWorkButton
        }
        if stacked {
            VStack(alignment: .leading, spacing: metric("inset")) {
                PageIntro(title: store.text("workspace"), subtitle: store.text("workspaceSubtitle"))
                controls
            }
        } else {
            HStack(alignment: .top, spacing: metric("gutter")) {
                PageIntro(title: store.text("workspace"), subtitle: store.text("workspaceSubtitle")).fixedSize()
                Spacer(minLength: 0)
                controls
            }
        }
    }
    private var newWorkButton: some View {
        Button(store.text("newWork"), systemImage: "plus") { start(.chat) }
            .buttonStyle(.vznPrimary).fixedSize()
            .disabled(store.loadBlocked || !store.moduleEnabled("chat")).help(store.text("newChat") + " (⌘N)")
    }
    // One glass strip: readiness dot, provider · model, its state, and a quiet Manage.
    private func modelStrip(detailed: Bool) -> some View {
        let model = store.session.model, state = store.providers.availability(model)
        let local = ProviderDiscovery.localProviders.contains(where: { model.hasPrefix($0 + ":") })
        let full = nativeModelLabel(model, store: store)
        let name = model.contains(":") ? (full.components(separatedBy: " · ").first ?? full) + " · " + ModelLineup.shortName(model) : full
        let status = (state == .unknown ? "" : store.text(state == .available ? "runtimeReady" : "unavailable").lowercased() + " · ") + store.text(local ? "onDevice" : "viaCloud")
        return HStack(spacing: metric("small") + metric("hairline") * 2) {
            StatusDot(tone: state == .available ? .ready : state == .unknown ? .idle : .failed)
            Text(name).fontWeight(.medium).foregroundStyle(contentColor("text-strong", scheme)).help(model)
            if detailed { Text(status).foregroundStyle(contentColor("text-muted", scheme)) }
            // Manage opens the section that owns the active model.
            Button(store.text("manage")) {
                NotificationCenter.default.post(name: .viezanOpenSettings, object: local ? "localModels" : "providers")
            }.buttonStyle(.plain).font(.vzn("smallScale", .medium)).foregroundStyle(contentColor("action-text", scheme))
                .padding(.horizontal, metric("small") + metric("hairline") * 2).frame(height: metric("compactControl") - metric("tight"))
                .contentShape(Capsule())
        }.lineLimit(1).fixedSize()
            .padding(.leading, metric("gap") + metric("hairline") * 2).padding(.trailing, metric("tight") + metric("hairline") * 2)
            .frame(height: metric("control"))
            .modifier(ControlGlass(radius: metric("control") / 2, enabled: false))
            .accessibilityElement(children: .contain).accessibilityLabel(name + (detailed ? ", " + status : ""))
    }
    // Compact model control: readiness dot, short model name and a chevron; it opens
    // the section that owns the model, like Manage in the full strip.
    private var modelPill: some View {
        let model = store.session.model, state = store.providers.availability(model)
        let local = ProviderDiscovery.localProviders.contains(where: { model.hasPrefix($0 + ":") })
        let status = (state == .unknown ? "" : store.text(state == .available ? "runtimeReady" : "unavailable").lowercased() + " · ") + store.text(local ? "onDevice" : "viaCloud")
        return Button {
            NotificationCenter.default.post(name: .viezanOpenSettings, object: local ? "localModels" : "providers")
        } label: {
            HStack(spacing: metric("small")) {
                StatusDot(tone: state == .available ? .ready : state == .unknown ? .idle : .failed)
                Text(ModelLineup.shortName(model)).fontWeight(.medium).foregroundStyle(contentColor("text-strong", scheme))
                Image(systemName: "chevron.down").imageScale(.small).foregroundStyle(contentColor("text-soft", scheme))
            }.lineLimit(1).padding(.horizontal, metric("gap")).frame(height: metric("compactControl")).contentShape(Capsule())
        }.buttonStyle(.plain).fixedSize()
            .modifier(ControlGlass(radius: metric("compactControl") / 2, enabled: false))
            .help(nativeModelLabel(model, store: store) + " · " + status)
            .accessibilityLabel(store.text("model") + ": " + nativeModelLabel(model, store: store) + ", " + status + ". " + store.text("manage"))
    }
    // Quick start (`.tile.glass`): four 56 pt glass tiles with a toned icon tile.
    private var glassQuickStart: some View {
        VStack(alignment: .leading, spacing: metric("gap")) {
            Eyebrow(text: store.text("quickStart"))
            HomeTileGrid(spacing: metric("gap"), minimum: metric("compactSidebar") - metric("gutter")) {
                if store.moduleEnabled("chat") { tile("newChat", symbol: "plus", tone: "tone-blue") { start(.chat) } }
                if store.moduleEnabled("translate") { tile("translateText", symbol: Feature.translate.symbol, tone: "tone-violet") { start(.translate) } }
                if store.moduleEnabled("interpret") { tile("interpret", symbol: "waveform", tone: "tone-green", action: interpret) }
                if store.moduleEnabled("dictionary") { tile("lookup", symbol: Feature.dictionary.symbol, tone: "tone-orange") { start(.dictionary) } }
            }.disabled(store.loadBlocked)
        }
    }
    private func tile(_ title: String, symbol: String, tone: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: metric("gap")) {
                Image(systemName: symbol).font(.vzn("subtitleScale"))
                    .foregroundStyle(contentColor(store.loadBlocked ? "text-disabled" : tone, scheme))
                    .frame(width: metric("control"), height: metric("control"))
                    .background(contentColor(store.loadBlocked ? "surface-subtle" : tone, scheme).opacity(store.loadBlocked ? 1 : metric("selectionOpacity") * 1.5), in: RoundedRectangle(cornerRadius: metric("controlRadius"), style: .continuous))
                    .accessibilityHidden(true)
                Text(store.text(title)).font(.vzn("labelScale", .medium)).foregroundStyle(contentColor("text-strong", scheme)).lineLimit(1)
                Spacer(minLength: 0)
                Image(systemName: "arrow.right").foregroundStyle(contentColor("text-muted", scheme)).accessibilityHidden(true)
            }.padding(.leading, metric("small") + metric("hairline") * 2).padding(.trailing, metric("gap"))
                .frame(maxWidth: .infinity, alignment: .leading).frame(height: metric("navControl") + metric("inset"))
                .contentShape(Rectangle())
        }.buttonStyle(HomeTileStyle())
    }
    @ViewBuilder private var runningSection: some View {
        if !active.isEmpty {
            VStack(alignment: .leading, spacing: metric("small")) {
                Eyebrow(text: store.text("inProgress"))
                UniformGrid(maxColumns: 2, minimum: metric("sidebar") + metric("large")) {
                    ForEach(active.prefix(4)) { item in
                        Button { resume(item.id) } label: {
                            HStack(spacing: metric("gap")) {
                                Image(systemName: item.feature.symbol).foregroundStyle(contentColor("action-text", scheme)).frame(width: metric("icon"))
                                VStack(alignment: .leading, spacing: metric("tight")) {
                                    Text(store.title(item)).fontWeight(.semibold).lineLimit(1)
                                    Text(store.text("running")).font(.vzn("smallScale")).foregroundStyle(.secondary)
                                }
                                Spacer(minLength: metric("small"))
                                Label(store.text("open"), systemImage: "arrow.right").labelStyle(.titleAndIcon).font(.vzn("smallScale")).foregroundStyle(.secondary)
                            }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle()).cardSurface()
                        }.buttonStyle(.plain).disabled(store.loadBlocked).help(store.title(item))
                    }
                }
            }
        }
    }
    private var recentSection: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            HomeRecentHeaderLayout(spacing: metric("small")) {
                if glass { Eyebrow(text: store.text("recentWork")) }
                else { Text(store.text("recentWork")).font(.vzn("sectionScale", .bold)).accessibilityAddTraits(.isHeader) }
                FilterTabs(label: store.text("recentWork"), items: [(String?.none, store.text("filterAll"))] + ["chat", "translate", "dictionary", "interpret"].filter { store.moduleEnabled($0) }.map { (String?.some($0), store.text($0)) }, selection: $filter)
            }
            let rows = entries.filter { filter == nil || $0.route == filter }
            if glass {
                // `.row`: a flat list on the pane; hover lifts the row into a lens, hairlines sit inset.
                VStack(spacing: 0) {
                    if rows.isEmpty {
                        Text(store.text("noRecentWork")).foregroundStyle(contentColor("text-muted", scheme))
                            .padding(.vertical, metric("inset")).padding(.horizontal, metric("gap")).frame(maxWidth: .infinity, alignment: .leading)
                    }
                    ForEach(Array(rows.prefix(6).enumerated()), id: \.element.id) { offset, entry in
                        if offset > 0 { CardDivider().padding(.horizontal, metric("gap")) }
                        Button { open(entry) } label: { entryRow(entry) }
                            .buttonStyle(HomeRowStyle()).disabled(store.loadBlocked).help(entryTitle(entry))
                    }
                }
            } else {
                VStack(spacing: 0) {
                    Divider()
                    if rows.isEmpty {
                        Text(store.text("noRecentWork")).foregroundStyle(.secondary)
                            .padding(.vertical, metric("inset"))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    ForEach(rows.prefix(6)) { entry in
                        Button { open(entry) } label: { entryRow(entry) }
                            .buttonStyle(.plain).disabled(store.loadBlocked).help(entryTitle(entry))
                        Divider()
                    }
                }
            }
        }
    }
    private var quickStartSection: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            Text(store.text("quickStart")).font(.vzn("sectionScale", .bold)).accessibilityAddTraits(.isHeader)
            NativeFlow(spacing: metric("small")) {
                if store.moduleEnabled("chat") { quickStartButton("newChat", symbol: "plus") { start(.chat) } }
                if store.moduleEnabled("translate") { quickStartButton("translateText", symbol: Feature.translate.symbol) { start(.translate) } }
                if store.moduleEnabled("interpret") { quickStartButton("interpret", symbol: "waveform", action: interpret) }
                if store.moduleEnabled("dictionary") { quickStartButton("lookup", symbol: Feature.dictionary.symbol) { start(.dictionary) } }
            }.disabled(store.loadBlocked)
        }
    }
    private func quickStartButton(_ title: String, symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { Label(store.text(title), systemImage: symbol) }.buttonStyle(.vznOutline)
    }
    private var providerSection: some View {
        // The active model's real readiness, local or cloud (not only Ollama).
        let model = store.session.model, state = store.providers.availability(model)
        let local = ProviderDiscovery.localProviders.contains(where: { model.hasPrefix($0 + ":") })
        return HStack(spacing: metric("small")) {
            HStack(alignment: .center, spacing: metric("small")) {
                StatusDot(tone: state == .available ? .ready : state == .unknown ? .idle : .failed)
                HStack(spacing: metric("small")) {
                    Text(nativeModelLabel(model, store: store) + (state == .unknown ? "" : " · " + store.text(state == .available ? "runtimeReady" : "unavailable").lowercased()))
                        .fontWeight(.medium).lineLimit(1)
                    Text(store.text(local ? "onDevice" : "viaCloud")).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            Spacer(minLength: metric("small"))
            // Manage opens the section that owns the active model.
            Button(store.text("manage")) {
                NotificationCenter.default.post(name: .viezanOpenSettings, object: local ? "localModels" : "providers")
            }.buttonStyle(.vznOutline).fixedSize()
        }.font(.vzn("smallScale")).accessibilityElement(children: .contain)
    }
    private func open(_ entry: RecentEntry) {
        switch entry {
        case .work(let item): resume(item.id)
        case .interpretation(let item): store.interpretation.select(item.id); interpret()
        }
    }
    private func entryTitle(_ entry: RecentEntry) -> String {
        switch entry {
        case .work(let item): store.title(item)
        case .interpretation(let item): Date(timeIntervalSince1970: item.created).formatted(date: .abbreviated, time: .shortened)
        }
    }
    @ViewBuilder private func entryRow(_ entry: RecentEntry) -> some View {
        switch entry {
        case .work(let item): recentRow(item)
        case .interpretation(let item): interpretationRow(item)
        }
    }
    private func interpretationRow(_ item: InterpretationSession) -> some View {
        let title = Date(timeIntervalSince1970: item.created).formatted(date: .abbreviated, time: .shortened)
        let detail = store.text("interpret") + " · " + store.text("lang_" + item.source) + " → " + store.text("lang_" + item.target)
        let live = store.interpretation.busy && store.interpretation.current?.id == item.id
        // Home board: "Phiên dịch · 2 người nói · 38 câu" — who spoke and how much, from the transcript.
        let speakers = Set(item.segments.compactMap(\.speaker)).count
        let glassDetail = ([store.text("interpret")] + (speakers > 1 ? [store.text("speakersCount").replacingOccurrences(of: "{n}", with: speakers.formatted())] : [])
                           + [item.segments.isEmpty ? store.text("lang_" + item.source) + " → " + store.text("lang_" + item.target) : store.text("sentencesCount").replacingOccurrences(of: "{n}", with: item.segments.count.formatted())]).joined(separator: " · ")
        if glass { return AnyView(glassRow(symbol: "waveform", title: title, detail: glassDetail, note: live ? store.text("listening") : nil, time: relativeTime(RecentEntry.interpretation(item).updated, store: store))) }
        return AnyView(HStack(spacing: metric("gap")) {
            Image(systemName: "waveform").imageScale(.large).foregroundStyle(.secondary).frame(width: metric("icon") + metric("tight"))
            VStack(alignment: .leading, spacing: metric("tight")) {
                Text(title).font(.vzn("labelScale", .semibold)).foregroundStyle(.primary).lineLimit(1)
                Text(detail).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: metric("small"))
            if live { Text(store.text("listening")).font(.vzn("smallScale")).foregroundStyle(contentColor("action-text", scheme)) }
            Text(relativeTime(RecentEntry.interpretation(item).updated, store: store)).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(1).fixedSize()
            Image(systemName: "arrow.right").fontWeight(.semibold).foregroundStyle(.primary).accessibilityHidden(true)
        }.padding(.vertical, metric("gap")).padding(.horizontal, metric("small"))
            .frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle()))
    }
    private func recentRow(_ item: Session) -> some View {
        let detail = item.feature == .chat ? store.text("chat") : store.text(item.feature.rawValue) + " · " + store.text("lang_" + item.source) + " → " + store.text("lang_" + item.target)
        if glass {
            // Chat rows also name the model that answered (`AI Chat · Haiku 5.5`).
            let note = store.running(item.id) != nil ? store.text("running") : item.favorite == true ? store.text("favorite") : nil
            return AnyView(glassRow(symbol: item.feature.symbol, title: store.title(item), detail: item.feature == .chat ? detail + " · " + ModelLineup.shortName(item.model) : detail,
                                    note: note, time: relativeTime(item.updated, store: store)))
        }
        return AnyView(HStack(spacing: metric("gap")) {
            Image(systemName: item.feature.symbol).imageScale(.large).foregroundStyle(.secondary).frame(width: metric("icon") + metric("tight"))
            VStack(alignment: .leading, spacing: metric("tight")) {
                Text(store.title(item)).font(.vzn("labelScale", .semibold)).foregroundStyle(.primary).lineLimit(1)
                Text(detail).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: metric("small"))
            if store.running(item.id) != nil { Text(store.text("running")).font(.vzn("smallScale")).foregroundStyle(contentColor("action-text", scheme)) }
            else if item.favorite == true { Text(store.text("favorite")).font(.vzn("smallScale")).foregroundStyle(.secondary) }
            Text(relativeTime(item.updated, store: store)).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(1).fixedSize()
            Image(systemName: "arrow.right").fontWeight(.semibold).foregroundStyle(.primary).accessibilityHidden(true)
        }.padding(.vertical, metric("gap")).padding(.horizontal, metric("small"))
            .frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle()))
    }
    // `.row` (Home board): accent icon, title 14 medium over a 12 pt detail, time and arrow trailing.
    private func glassRow(symbol: String, title: String, detail: String, note: String?, time: String) -> some View {
        HStack(spacing: metric("gap")) {
            Image(systemName: symbol).foregroundStyle(contentColor("action-text", scheme)).frame(width: metric("icon")).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: metric("hairline") * 2) {
                Text(title).font(.vzn("labelScale", .medium)).foregroundStyle(contentColor("text-strong", scheme)).lineLimit(1)
                Text(detail).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).lineLimit(1)
            }
            Spacer(minLength: metric("small"))
            if let note { Text(note).font(.vzn("smallScale")).foregroundStyle(contentColor("action-text", scheme)).lineLimit(1) }
            Text(time).font(.vzn("smallScale")).foregroundStyle(contentColor("text-soft", scheme)).lineLimit(1).fixedSize()
            Image(systemName: "arrow.right").foregroundStyle(contentColor("text-muted", scheme)).accessibilityHidden(true)
        }.padding(.horizontal, metric("gap")).frame(minHeight: metric("navControl") + metric("gap"))
            .frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
    }
}

// Glass quick-start tile: the shared control glass with a lens on hover/press.
private struct HomeTileStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { HomeTileBody(configuration: configuration) }
}
private struct HomeTileBody: View {
    var configuration: ButtonStyleConfiguration
    @Environment(\.isEnabled) private var enabled
    @Environment(\.isFocused) private var focused
    @State private var hovered = false
    var body: some View {
        configuration.label.opacity(enabled ? 1 : 0.5)
            .modifier(ControlGlass(radius: metric("gap") + metric("hairline") * 2, selected: hovered || configuration.isPressed,
                                   focused: focused, pressed: configuration.isPressed, enabled: enabled))
            .onHover { hovered = $0 }
    }
}

// Recent row: flat at rest, a lens while hovered or pressed.
private struct HomeRowStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { HomeRowBody(configuration: configuration) }
}
private struct HomeRowBody: View {
    var configuration: ButtonStyleConfiguration
    @Environment(\.isEnabled) private var enabled
    @State private var hovered = false
    var body: some View {
        configuration.label.opacity(enabled ? 1 : 0.5)
            .background { if enabled && (hovered || configuration.isPressed) { GlassLens(radius: metric("radius")) } }
            .onHover { hovered = $0 }
    }
}

// Four equal tiles in a row while each keeps `minimum`, then two, then one.
private struct HomeTileGrid: Layout {
    var spacing: CGFloat
    var minimum: CGFloat
    private func columns(_ width: CGFloat, _ count: Int) -> Int {
        for candidate in [count, 2, 1] where candidate <= count && candidate > 0 {
            if width + spacing >= CGFloat(candidate) * (minimum + spacing) { return candidate }
        }
        return 1
    }
    private func frames(_ width: CGFloat, _ subviews: Subviews) -> (CGFloat, Int, [CGFloat]) {
        let perRow = columns(width, subviews.count)
        let column = (width - spacing * CGFloat(perRow - 1)) / CGFloat(perRow)
        let heights = stride(from: 0, to: subviews.count, by: perRow).map { start in
            subviews[start..<min(start + perRow, subviews.count)].map { $0.sizeThatFits(ProposedViewSize(width: column, height: nil)).height }.max() ?? 0
        }
        return (column, perRow, heights)
    }
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? metric("reading")
        let (_, _, heights) = frames(width, subviews)
        return CGSize(width: width, height: heights.reduce(0, +) + spacing * CGFloat(max(0, heights.count - 1)))
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let (column, perRow, heights) = frames(bounds.width, subviews)
        var y = bounds.minY
        for (row, height) in heights.enumerated() {
            for slot in 0..<perRow where row * perRow + slot < subviews.count {
                subviews[row * perRow + slot].place(at: CGPoint(x: bounds.minX + CGFloat(slot) * (column + spacing), y: y), anchor: .topLeading,
                                                    proposal: ProposedViewSize(width: column, height: height))
            }
            y += height + spacing
        }
    }
}

// One title and one FilterTabs instance: wrapping never substitutes another
// control tree, so the focused tab survives a compact-window resize.
private struct HomeRecentHeaderLayout: Layout {
    var spacing: CGFloat
    private func measurements(_ subviews: Subviews, width: CGFloat) -> (title: CGSize, tabs: CGSize, horizontal: Bool) {
        let title = subviews[0].sizeThatFits(ProposedViewSize(width: width, height: nil))
        let tabs = subviews[1].sizeThatFits(.unspecified)
        return (title, tabs, title.width + spacing + tabs.width <= width)
    }
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? max(0, $0) : nil }
            ?? subviews.reduce(spacing) { $0 + $1.sizeThatFits(.unspecified).width }
        let sizes = measurements(subviews, width: width)
        return CGSize(width: width, height: sizes.horizontal ? max(sizes.title.height, sizes.tabs.height) : sizes.title.height + spacing + sizes.tabs.height)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let sizes = measurements(subviews, width: bounds.width)
        if sizes.horizontal {
            subviews[0].place(at: CGPoint(x: bounds.minX, y: bounds.midY), anchor: .leading, proposal: ProposedViewSize(sizes.title))
            subviews[1].place(at: CGPoint(x: bounds.maxX, y: bounds.midY), anchor: .trailing, proposal: ProposedViewSize(sizes.tabs))
        } else {
            subviews[0].place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(sizes.title))
            subviews[1].place(at: CGPoint(x: bounds.minX, y: bounds.minY + sizes.title.height + spacing), anchor: .topLeading, proposal: ProposedViewSize(sizes.tabs))
        }
    }
}

struct DictionaryResultView: View {
    let entry: DictionaryEntry
    @Bindable var store: WorkbenchStore
    @Environment(\.colorScheme) private var scheme
    @State private var selectedTab = "meaning"
    private var examples: [String] { exampleRows.map(\.text) }
    /// Every example with the sense it belongs to (1-based; nil for the entry-wide ones) and its register.
    private var exampleRows: [(text: String, sense: Int?, register: String?)] {
        (entry.examples ?? []).map { ($0, nil, nil) } + entry.translations.enumerated().flatMap { index, item in
            (item.examples ?? []).enumerated().map { ($0.element, index + 1, item.register($0.offset)) }
        }
    }
    /// "nghĩa 01 · đời thường": which sense an example illustrates and how it sounds.
    private func exampleCaption(_ sense: Int?, _ register: String?) -> String? {
        let parts = [sense.map { store.text("dictionaryExampleSense").replacingOccurrences(of: "{n}", with: String(format: "%02d", $0)) }, register].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    var body: some View {
        if glass { glassBody } else { classicBody }
    }
    private func speak(_ text: String, _ language: String) { store.audio.speak(text, language: language) }
    private var sourceLanguage: String { store.session.source == "auto" ? store.session.target : store.session.source }
    private var lookupContext: String { (store.session.dictionaryContext ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }
    /// With a context this is "Translate the sentence" and sends the context; otherwise the headword.
    private func openTranslate() { let id = store.createDetachedSession(feature: .translate, draft: lookupContext.isEmpty ? entry.headword : lookupContext); store.select(id); NotificationCenter.default.post(name: .viezanOpenRoute, object: "translate") }
    private func openChat() { let id = store.createDetachedSession(feature: .chat, draft: entry.headword + "\n" + entry.meaning); store.select(id); NotificationCenter.default.post(name: .viezanOpenRoute, object: "chat") }
    private var targetLanguage: String { store.session.target }
    private func toggleSaved() {
        let saved = store.session.favorite == true
        store.toggleFavorite(store.session.id)
        ToastCenter.shared.show(store.text(saved ? "wordUnsavedToast" : "wordSavedToast").replacingOccurrences(of: "{word}", with: entry.headword), key: "dictionary-save")
    }
    private func pill(_ text: String) -> some View {
        Text(text).font(.vzn("smallScale", .medium)).foregroundStyle(contentColor("text-muted", scheme)).lineLimit(1)
            .padding(.horizontal, metric("small") + metric("hairline") * 2).frame(height: metric("gutter") - metric("hairline") * 2)
            .background(contentColor("surface-muted", scheme), in: Capsule())
    }
    private var mono: Font { .system(size: NSFont.systemFontSize * metric("labelScale"), design: .monospaced) }
    // Dictionary-Entry: headword 30 with its speaker and the actions on the right; phonetics, word
    // class and pair as chips; the context line; a counted seg; numbered senses with an example
    // and their nuance; a quiet foot with the model, Copy and Look up again.
    private var glassBody: some View {
        let favorite = store.session.favorite == true
        let context = (store.session.dictionaryContext ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let sourceName = store.text("lang_" + (entry.detectedSourceLang.flatMap { nativeResources.nativeLanguages.contains($0) ? $0 : nil } ?? sourceLanguage))
        return VStack(alignment: .leading, spacing: metric("gap")) {
            HStack(alignment: .center, spacing: metric("gap")) {
                Text(entry.headword).font(.system(size: NSFont.systemFontSize * metric("displayScale") + metric("tight") / 2, weight: .semibold))
                    .foregroundStyle(contentColor("text-strong", scheme)).lineLimit(2).accessibilityAddTraits(.isHeader)
                ListenSpeakerButton(store: store, label: store.text("speak") + " " + entry.headword,
                                    sources: [ListenSource(id: "headword", title: store.text("dictionaryHeadword"), text: entry.headword, language: sourceLanguage)]
                                        + entry.translations.prefix(3).enumerated().map { index, item in ListenSource(id: "sense-\(index)", title: store.text("dictionaryMeaningN").replacingOccurrences(of: "{n}", with: String(format: "%02d", index + 1)), text: item.text, language: targetLanguage) })
                Spacer(minLength: metric("small"))
                Button(action: toggleSaved) { Label(store.text(favorite ? "savedWord" : "saveWord"), systemImage: favorite ? "star.fill" : "star") }
                    .buttonStyle(.vznOutline).foregroundStyle(favorite ? contentColor("warning", scheme) : contentColor("text-strong", scheme))
                    .accessibilityAddTraits(favorite ? .isSelected : []).accessibilityIdentifier("dictionary-save")
                Button(store.text(lookupContext.isEmpty ? "translate" : "dictionaryTranslateSentence"), systemImage: Feature.translate.symbol, action: openTranslate).buttonStyle(.vznOutline)
                Button(store.text("launcher_ai"), systemImage: "bubble.left", action: openChat).buttonStyle(.vznOutline)
            }
            HStack(spacing: metric("small") + metric("hairline") * 2) {
                if !entry.pronunciation.isEmpty { Text(entry.pronunciation).font(mono).foregroundStyle(contentColor("text-muted", scheme)).lineLimit(1) }
                if let classes = entry.partOfSpeech, !classes.isEmpty { pill(classes.joined(separator: " · ")) }
                pill(sourceName + " → " + store.text("lang_" + targetLanguage))
            }
            if !context.isEmpty {
                HStack(spacing: metric("small")) {
                    Image(systemName: "text.quote").foregroundStyle(contentColor("action-text", scheme)).accessibilityHidden(true)
                    // The model says which sense fits the context; older entries only quote the context.
                    Text(entry.contextSense.map { store.text("dictionaryContextSenseLine").replacingOccurrences(of: "{context}", with: context).replacingOccurrences(of: "{n}", with: String(format: "%02d", $0)) }
                         ?? store.text("dictionaryContextLine").replacingOccurrences(of: "{context}", with: context)).lineLimit(2)
                        .foregroundStyle(contentColor("text-strong", scheme))
                }.font(.vzn("smallScale")).padding(.horizontal, metric("gap")).padding(.vertical, metric("small"))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(contentColor("action", scheme).opacity(metric("selectionOpacity") * 0.6), in: RoundedRectangle(cornerRadius: metric("controlRadius"), style: .continuous))
            }
            // Related words join the seg when the entry carries them (older entries and models omit them).
            FilterTabs(label: store.text("dictionary"), items: [("meaning", store.text("dictionaryMeaning") + " · \(entry.translations.count)"), ("examples", store.text("dictionaryExamples") + " · \(examples.count)")]
                       + (entry.related.map { [("related", store.text("dictionaryRelated") + " · \($0.count)")] } ?? []), selection: $selectedTab)
                .padding(.top, metric("tight"))
            if selectedTab == "meaning" {
                VStack(alignment: .leading, spacing: 0) {
                    if entry.translations.isEmpty, !entry.meaning.isEmpty { Text(entry.meaning).font(readingFont(store)).foregroundStyle(contentColor("text-strong", scheme)).padding(.vertical, metric("gap")) }
                    ForEach(Array(entry.translations.enumerated()), id: \.offset) { index, translation in
                        CardDivider()
                        sense(index, translation)
                    }
                    if let notes = entry.notes, !notes.isEmpty {
                        CardDivider()
                        VStack(alignment: .leading, spacing: metric("tight")) {
                            ForEach(Array(notes.enumerated()), id: \.offset) { _, value in Text(value).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)) }
                        }.padding(.vertical, metric("gap"))
                    }
                }
            } else if selectedTab == "related", let related = entry.related {
                relatedWords(related)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    if examples.isEmpty { Text(store.text("dictionaryNoExamples")).foregroundStyle(contentColor("text-muted", scheme)).padding(.vertical, metric("gap")) }
                    ForEach(Array(exampleRows.enumerated()), id: \.offset) { index, row in
                        let value = row.text
                        CardDivider()
                        HStack(alignment: .firstTextBaseline, spacing: metric("inset") - metric("hairline") * 2) {
                            number(index)
                            VStack(alignment: .leading, spacing: metric("tight")) {
                                exampleText(value)
                                if let caption = exampleCaption(row.sense, row.register) { Text(caption).font(.vzn("captionScale")).foregroundStyle(contentColor("text-soft", scheme)) }
                            }.frame(maxWidth: .infinity, alignment: .leading)
                            Button { speak(value.components(separatedBy: " → ").first ?? value, sourceLanguage) } label: { Image(systemName: "speaker.wave.2").imageScale(.small) }
                                .buttonStyle(.plain).foregroundStyle(contentColor("text-muted", scheme)).help(store.text("speak")).accessibilityLabel(store.text("speak"))
                            Button { copyText(value, store: store) } label: { Image(systemName: "doc.on.doc").imageScale(.small) }
                                .buttonStyle(.plain).foregroundStyle(contentColor("text-muted", scheme)).help(store.text("copy")).accessibilityLabel(store.text("copy"))
                        }.padding(.vertical, metric("gap"))
                    }
                }
            }
            CardDivider().padding(.top, metric("small"))
            HStack(spacing: metric("small")) {
                let seconds = store.workspace.tasks.first(where: { $0.request.sessionID == store.session.id })?.duration
                Text(ModelLineup.shortName(store.session.model) + (seconds.map { " · " + durationText($0, store: store) } ?? "")).font(.vzn("smallScale")).foregroundStyle(contentColor("text-soft", scheme)).help(store.session.model)
                Spacer(minLength: metric("small"))
                Button(store.text("copy"), systemImage: "doc.on.doc") {
                    copyText(([entry.headword, entry.pronunciation] + entry.translations.map { $0.text + ($0.meaning.map { " — " + $0 } ?? "") }).filter { !$0.isEmpty }.joined(separator: "\n"), store: store)
                }.buttonStyle(.vznQuiet).controlSize(.small)
                Button(store.text("lookupAgain"), systemImage: "arrow.clockwise") { store.submit(store.session.id) }.buttonStyle(.vznQuiet).controlSize(.small)
                    .disabled(store.running(store.session.id) != nil).accessibilityIdentifier("dictionary-lookup-again")
            }
        }.textSelection(.enabled)
            .onChange(of: store.session.id) { _, _ in selectedTab = "meaning" }
            .onChange(of: entry.headword) { _, _ in selectedTab = "meaning" }
    }
    /// Examples arrive as "sentence → translation": the sentence reads at 14, its translation muted at 13 under it.
    private func exampleText(_ value: String) -> some View {
        let parts = value.components(separatedBy: " → ")
        return VStack(alignment: .leading, spacing: metric("hairline") * 2) {
            Text(parts[0]).font(readingFont(store)).foregroundStyle(contentColor("text-strong", scheme))
            if parts.count > 1 { Text(parts.dropFirst().joined(separator: " → ")).font(.system(size: NSFont.systemFontSize)).foregroundStyle(contentColor("text-muted", scheme)) }
        }
    }
    // Dictionary-Redesign-States: same root, near and opposite words as glass pills; a click looks the
    // word up at once in this session, keeping the context.
    private func relatedWords(_ related: DictionaryEntry.Related) -> some View {
        VStack(alignment: .leading, spacing: metric("gap")) {
            ForEach([("relatedDerived", related.derived ?? []), ("relatedSynonyms", related.synonyms ?? []), ("relatedAntonyms", related.antonyms ?? [])], id: \.0) { key, words in
                if !words.isEmpty {
                    VStack(alignment: .leading, spacing: metric("small")) {
                        Eyebrow(text: store.text(key))
                        NativeFlow(spacing: metric("small")) {
                            ForEach(words, id: \.self) { word in
                                Button(word) { store.setDraft(store.session.id, word); store.submit(store.session.id) }
                                    .buttonStyle(.vznOutline).controlSize(.small).disabled(store.running(store.session.id) != nil)
                                    .help(store.text("lookup") + " " + word).accessibilityIdentifier("dictionary-related-" + word)
                            }
                        }
                    }
                }
            }
            Text(store.text("relatedHint")).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).padding(.top, metric("tight"))
        }.padding(.top, metric("gap"))
    }
    private func number(_ index: Int) -> some View {
        Text(String(format: "%02d", index + 1)).font(.system(size: NSFont.systemFontSize * metric("smallScale"), weight: .semibold, design: .monospaced))
            .foregroundStyle(contentColor("text-soft", scheme)).frame(width: metric("gutter"), alignment: .leading).accessibilityHidden(true)
    }
    // One sense: the word (16 semibold), its phonetics, class chip and speaker; the gloss, one example and the nuance.
    private func sense(_ index: Int, _ translation: DictionaryEntry.Translation) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: metric("inset") - metric("hairline") * 2) {
            number(index)
            VStack(alignment: .leading, spacing: metric("small") - metric("hairline") * 2) {
                HStack(alignment: .center, spacing: metric("small")) {
                    Text(translation.text).font(.vzn("sectionScale", .semibold)).foregroundStyle(contentColor("text-strong", scheme))
                    if !translation.pronunciation.isEmpty { Text(translation.pronunciation).font(.system(size: NSFont.systemFontSize * metric("smallScale"), design: .monospaced)).foregroundStyle(contentColor("text-muted", scheme)) }
                    if let kind = translation.partOfSpeech, !kind.isEmpty { pill(kind) }
                    Button { speak(translation.text, targetLanguage) } label: { Image(systemName: "speaker.wave.2").imageScale(.small) }
                        .buttonStyle(.plain).foregroundStyle(contentColor("text-muted", scheme)).help(store.text("speak")).accessibilityLabel(store.text("speak") + " " + translation.text)
                }
                if let meaning = translation.meaning, !meaning.isEmpty { Text(meaning).font(.system(size: NSFont.systemFontSize)).foregroundStyle(contentColor("text-muted", scheme)) }
                if let example = translation.examples?.first { exampleText(example).padding(.top, metric("hairline") * 2) }
                if let nuance = translation.nuance ?? translation.usage, !nuance.isEmpty {
                    HStack(alignment: .firstTextBaseline, spacing: metric("small") - metric("hairline") * 2) {
                        Text(store.text("dictionaryNuance").uppercased(with: Locale(identifier: store.workspace.locale)))
                            .font(.system(size: NSFont.systemFontSize * metric("captionScale") * 0.9, weight: .semibold)).foregroundStyle(contentColor("text-muted", scheme))
                        Text(nuance).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme))
                    }
                }
                if let collocations = translation.collocations, !collocations.isEmpty {
                    Text(collocations.joined(separator: " · ")).font(.vzn("smallScale")).foregroundStyle(contentColor("text-soft", scheme))
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
        }.padding(.vertical, metric("gap") + metric("hairline") * 2)
    }
    private var classicBody: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            HStack(alignment: .firstTextBaseline, spacing: metric("inset")) {
                Text(entry.headword).font(.vzn("heroScale", .bold)).accessibilityAddTraits(.isHeader)
                Spacer(minLength: metric("small"))
                Button { store.toggleFavorite(store.session.id) } label: {
                    Label(store.text(store.session.favorite == true ? "savedWord" : "saveWord"), systemImage: store.session.favorite == true ? "star.fill" : "star")
                }.buttonStyle(.vznQuiet).accessibilityAddTraits(store.session.favorite == true ? .isSelected : [])
            }
            HStack(spacing: metric("small")) {
                if !entry.pronunciation.isEmpty { Text(entry.pronunciation).foregroundStyle(.secondary) }
                if let language = entry.detectedSourceLang, nativeResources.nativeLanguages.contains(language) {
                    Text(store.text("lang_" + language)).font(.vzn("smallScale")).padding(.horizontal, metric("small")).padding(.vertical, metric("tight"))
                        .background(contentColor("surface-muted", scheme), in: RoundedRectangle(cornerRadius: metric("controlRadius")))
                }
                Button { store.audio.speak(entry.headword, language: store.session.source == "auto" ? store.session.target : store.session.source) } label: { Image(systemName: "speaker.wave.2") }
                    .buttonStyle(.vznQuiet).help(store.text("speak")).accessibilityLabel(store.text("speak"))
                Spacer(minLength: 0)
                Button(store.text("translate")) { let id = store.createDetachedSession(feature: .translate, draft: entry.headword); store.select(id); NotificationCenter.default.post(name: .viezanOpenRoute, object: "translate") }.buttonStyle(.vznOutline)
                Button(store.text("chat")) { let id = store.createDetachedSession(feature: .chat, draft: entry.headword + "\n" + entry.meaning); store.select(id); NotificationCenter.default.post(name: .viezanOpenRoute, object: "chat") }.buttonStyle(.vznOutline)
            }
            FilterTabs(label: store.text("dictionary"), items: [("meaning", store.text("dictionaryMeaning")), ("examples", store.text("dictionaryExamples"))], selection: $selectedTab)
            Divider()
            if selectedTab == "meaning" {
                if !entry.meaning.isEmpty { Text(entry.meaning) }
                ForEach(Array(entry.translations.enumerated()), id: \.offset) { index, translation in
                    HStack(alignment: .firstTextBaseline, spacing: metric("inset")) {
                        Text(String(format: "%02d", index + 1)).font(.vzn("smallScale")).monospacedDigit().foregroundStyle(.secondary)
                        VStack(alignment: .leading, spacing: metric("small")) {
                            HStack(alignment: .firstTextBaseline, spacing: metric("small")) {
                                Text(translation.text).font(.vzn("titleScale", .bold))
                                if !translation.pronunciation.isEmpty { Text(translation.pronunciation).foregroundStyle(.secondary) }
                                Button { store.audio.speak(translation.text, language: store.session.target) } label: { Image(systemName: "speaker.wave.2") }
                                    .buttonStyle(.vznQuiet).help(store.text("speak")).accessibilityLabel(store.text("speak") + " " + translation.text)
                            }
                            ForEach(Array([translation.partOfSpeech, translation.meaning].compactMap { $0 }.enumerated()), id: \.offset) { _, value in Text(value).foregroundStyle(.secondary) }
                            if translation.usage != nil || translation.nuance != nil || !((translation.examples ?? []) + (translation.collocations ?? []) + (translation.notes ?? [])).isEmpty {
                                DisclosureGroup(store.text("dictionaryDetails")) {
                                    VStack(alignment: .leading, spacing: metric("small")) {
                                        ForEach(Array([translation.usage, translation.nuance].compactMap { $0 }.enumerated()), id: \.offset) { _, value in Text(value) }
                                        ForEach(Array(((translation.examples ?? []) + (translation.collocations ?? []) + (translation.notes ?? [])).enumerated()), id: \.offset) { _, value in Text(value) }
                                    }.frame(maxWidth: .infinity, alignment: .leading).padding(.top, metric("small"))
                                }
                            }
                        }
                    }
                }
                if let notes = entry.notes, !notes.isEmpty {
                    ForEach(Array(notes.enumerated()), id: \.offset) { _, value in Text(value).foregroundStyle(.secondary) }
                }
            }
            if selectedTab == "examples" && examples.isEmpty {
                Text(store.text("dictionaryNoExamples")).foregroundStyle(.secondary)
            }
            if !examples.isEmpty {
                VStack(alignment: .leading, spacing: metric("small")) {
                    Eyebrow(text: store.text("dictionaryExamples"))
                    ForEach(Array((selectedTab == "meaning" ? Array(examples.prefix(1)) : examples).enumerated()), id: \.offset) { _, value in Text(value) }
                }.padding(metric("inset")).frame(maxWidth: .infinity, alignment: .leading)
                    .background(contentColor("surface-muted", scheme), in: RoundedRectangle(cornerRadius: metric("radius")))
            }
        }.font(readingFont(store)).textSelection(.enabled)
            .onChange(of: store.session.id) { _, _ in selectedTab = "meaning" }
            .onChange(of: entry.headword) { _, _ in selectedTab = "meaning" }
    }
}

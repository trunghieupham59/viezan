import SwiftUI
import ViezanDomain

enum HistoryPanelLayout {
    // Fixed header/search/footer, four gaps and two outer insets remain visible.
    static var chromeHeight: CGFloat { metric("control") * 2 + metric("compactControl") + metric("inset") * 6 + metric("hairline") }
    static func listHeight(content: CGFloat, available: CGFloat) -> CGFloat {
        min(max(metric("control"), content), max(metric("control"), available - chromeHeight))
    }
}

struct QuickHistory: View {
    @Environment(\.colorScheme) private var scheme
    @Bindable var store: WorkbenchStore
    var select: (String) -> Void
    var all: () -> Void
    var dismiss: () -> Void
    var availableHeight: CGFloat
    @State private var contentHeight: CGFloat = 0
    @State private var query = ""
    @State private var highlighted: String?
    private var records: [Session] { store.history(query: query) }
    private func move(_ offset: Int) {
        guard !records.isEmpty else { return }
        let index = highlighted.flatMap { id in records.firstIndex { $0.id == id } } ?? (offset > 0 ? -1 : records.count)
        highlighted = records[min(max(index + offset, 0), records.count - 1)].id
    }
    private func openHighlighted() {
        if let id = highlighted, records.contains(where: { $0.id == id }) { select(id) }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            HStack { Text(store.text("history")).font(.vzn("labelScale", .semibold)); Spacer(); ShellCloseButton(label: store.text("close"), action: dismiss) }
                .frame(height: metric("control"))
            SearchBox(query: $query, label: store.text("historySearch"), move: move, submit: openHighlighted, cancel: dismiss)
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: metric("small")) {
                        if records.isEmpty { Text(store.text("noHistory")).foregroundStyle(.secondary).padding(metric("inset")) }
                        ForEach(records) { session in
                            // Same row language as the other layers: a quiet highlight, a check for the current one.
                            Button { select(session.id) } label: { SessionRow(store: store, session: session) }
                                .buttonStyle(.plain).padding(.horizontal, metric("small")).padding(.vertical, metric("tight"))
                                .background(session.id == highlighted ? contentColor("surface-hover", scheme) : Color.clear, in: RoundedRectangle(cornerRadius: metric("radius")))
                                .accessibilityAddTraits(session.id == highlighted ? .isSelected : [])
                                .id(session.id)
                        }
                    }.onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
                }.onChange(of: highlighted) { _, id in if let id { proxy.scrollTo(id) } }
            }.frame(height: HistoryPanelLayout.listHeight(content: contentHeight, available: availableHeight))
            Divider()
            // The panel's foot reads like the model panel's: a quiet control, not a link.
            Button(store.text("allHistory"), systemImage: "arrow.right") { all() }.buttonStyle(.vznQuiet).font(.vzn("smallScale"))
                .labelStyle(TrailingIconLabelStyle()).frame(maxWidth: .infinity, alignment: .leading)
        }.padding(metric("inset")).frame(maxWidth: .infinity)
            .accessibilityElement(children: .contain).accessibilityLabel(store.text("history"))
            .onAppear { highlighted = store.session.id }
            .onChange(of: query) { _, _ in highlighted = records.first?.id }
    }
}

// Two fixed lines per session: the title alone on the first (so it is cut as late as possible),
// then a muted line with the latest exchange, the draft or the model, and the time at the trailing
// edge. The current session carries a leading check; mixed-feature lists show the feature's icon.
struct SessionRow: View {
    @Environment(\.colorScheme) private var scheme
    var store: WorkbenchStore
    var session: Session
    var showsIcon = false
    /// The muted second line. Chat: the latest text (draft first). Translate and Dictionary: the
    /// result, never the source again (the title already is the source); the language pair while
    /// there is no result yet. A running session says so.
    enum Summary: Equatable { case running, text(String), pair(String, String), model }
    static func summary(for session: Session, running: Bool) -> Summary {
        if running { return .running }
        if session.feature == .chat {
            let text = session.draft.isEmpty ? session.messages.last?.text ?? "" : session.draft
            return text.isEmpty ? .model : .text(text)
        }
        if !session.output.isEmpty { return .text(session.feature == .dictionary ? (DictionaryEntry.parse(session.output)?.meaning ?? session.output) : (session.images ?? []).isEmpty ? session.output : ImageTranslation.text(session.output)) }
        return .pair(session.source, session.target)
    }
    var body: some View {
        let current = session.id == store.session.id
        let second: String = {
            switch Self.summary(for: session, running: store.running(session.id) != nil) {
            case .running: return store.text("running")
            case .text(let text): return text
            case .pair(let source, let target): return store.text("lang_" + source) + " → " + store.text("lang_" + target)
            case .model: return ModelLineup.shortName(session.model)
            }
        }()
        HStack(alignment: .firstTextBaseline, spacing: metric("small")) {
            Image(systemName: current ? "checkmark" : session.feature.symbol).imageScale(.small)
                .foregroundStyle(current ? contentColor("text", scheme) : contentColor("text-muted", scheme)).frame(width: metric("icon") - metric("tight"))
                .opacity(current || showsIcon ? 1 : 0)
                .accessibilityLabel(current ? store.text("currentSession") : showsIcon ? store.text(session.feature.rawValue) : "")
            VStack(alignment: .leading, spacing: metric("tight")) {
                Text(store.title(session)).font(.vzn("labelScale", current ? .semibold : .regular)).lineLimit(1).help(store.title(session))
                HStack(alignment: .firstTextBaseline, spacing: metric("small")) {
                    Text(second).font(.vzn("captionScale")).foregroundStyle(.secondary).lineLimit(1)
                    Spacer(minLength: metric("small"))
                    Text(relativeTime(session.updated, store: store)).font(.vzn("captionScale")).foregroundStyle(.secondary).lineLimit(1).fixedSize()
                }
            }
        }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
    }
}

/// Label with its icon after the text, for "next" controls such as "All history →".
struct TrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: metric("small")) { configuration.title; configuration.icon.imageScale(.small) }
    }
}

struct HistoryLibrary: View {
    @Bindable var store: WorkbenchStore
    var initialFavorites = false
    var close: () -> Void
    @State private var query = ""
    @State private var selected: String?
    @State private var archived = false
    @State private var favoritesOnly = false
    @State private var renameID: String?
    @State private var newTitle = ""
    /// nil = every enabled feature; starts on the feature the library was opened from.
    @State private var featureFilter: Feature?
    private var features: [Feature] { [Feature.chat, .translate, .dictionary].filter { store.moduleEnabled($0.rawValue) } }
    private var records: [Session] {
        store.history(query: query, archived: archived, features: featureFilter.map { [$0] } ?? [])
            .filter { !favoritesOnly || $0.feature != .dictionary || $0.favorite == true }
    }
    private func open(_ id: String) {
        guard let item = store.session(id), item.archived != true else { return }
        store.select(id); close()
        NotificationCenter.default.post(name: .viezanOpenRoute, object: item.feature.rawValue)
    }
    // Delete is reversible for a few seconds through the toast, so it needs no dialog.
    private func delete(_ id: String) {
        guard let item = store.session(id) else { return }
        let next = records.first { $0.id != id }?.id
        do {
            let removed = try store.removeSession(id)
            selected = next
            ToastCenter.shared.show(store.text("sessionDeleted") + ": " + store.title(item), key: "delete-" + id, actionLabel: store.text("undo")) {
                store.restoreSession(removed.session, at: removed.index); selected = id
            }
        } catch { ToastCenter.shared.show(store.text("dataOperationError"), key: "history-delete", error: true) }
    }
    private func move(_ offset: Int) {
        guard !records.isEmpty else { return }
        let index = selected.flatMap { id in records.firstIndex { $0.id == id } } ?? (offset > 0 ? -1 : records.count)
        selected = records[min(max(index + offset, 0), records.count - 1)].id
    }
    var body: some View {
        libraryBody.onAppear { favoritesOnly = initialFavorites; featureFilter = store.workspace.feature }
            .onKeyPress(.return) { if let id = selected, !archived { open(id); return .handled }; return .ignored }
            .onKeyPress(.delete) { if let id = selected { delete(id); return .handled }; return .ignored }
            .onExitCommand(perform: close)
    }
    private var libraryBody: some View {
        GeometryReader { geometry in
            let wide = geometry.size.width >= metric("reading")
            let layout = wide ? AnyLayout(HStackLayout(spacing: 0)) : AnyLayout(VStackLayout(spacing: 0))
            layout {
                VStack(alignment: .leading, spacing: metric("small")) {
                    // Review 18: small exclusive tabs, not switches, for what the list shows.
                    if features.count > 1 {
                        FilterTabs(label: store.text("recentWork"), items: [(Feature?.none, store.text("filterAll"))] + features.map { (Feature?.some($0), store.text($0.rawValue)) }, selection: $featureFilter).padding(.horizontal, metric("inset"))
                    }
                    if featureFilter == .dictionary {
                        FilterTabs(label: store.text("dictionary"), items: [(false, store.text("recentLookups")), (true, store.text("savedWords"))], selection: $favoritesOnly).padding(.horizontal, metric("inset"))
                    }
                    FilterTabs(label: store.text("history"), items: [(false, store.text("history")), (true, store.text("archivedSessions"))], selection: $archived).padding(.horizontal, metric("inset"))
                    SearchBox(query: $query, label: store.text("historySearch"), move: move)
                        .frame(width: wide ? metric("sidebar") + metric("gutter") - metric("inset") * 2 : nil).padding(metric("inset"))
                    if records.isEmpty {
                        VStack(spacing: metric("small")) {
                            Image(systemName: "magnifyingglass").font(.vzn("headingScale", .semibold)).accessibilityHidden(true)
                            Text(store.text("noHistory")).multilineTextAlignment(.center)
                        }.foregroundStyle(.secondary).padding(metric("inset"))
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        // Grouped by when they changed, so a run of "5 days ago" rows still scans.
                        List(selection: $selected) {
                            ForEach(HistoryBucket.allCases, id: \.self) { bucket in
                                let rows = records.filter { HistoryBucket.of($0.updated) == bucket }
                                if !rows.isEmpty {
                                    Section { ForEach(rows) { SessionRow(store: store, session: $0, showsIcon: featureFilter == nil).tag($0.id) } }
                                    header: { Eyebrow(text: store.text("group_" + bucket.rawValue)) }
                                }
                            }
                        }.listStyle(.plain)
                    }
                }.frame(width: wide && !records.isEmpty ? metric("sidebar") + metric("editor") : nil,
                        height: !wide && !records.isEmpty ? min(metric("editor") * 2, geometry.size.height / 2) : nil)
                if !records.isEmpty {
                    Divider()
                    if let id = selected, let session = records.first(where: { $0.id == id }) {
                        // The preview is the exchange itself in a reading column; title, meta and the
                        // actions sit at its head where the eye starts, Open as the one primary control.
                        VStack(alignment: .leading, spacing: metric("inset")) {
                            VStack(alignment: .leading, spacing: metric("small")) {
                                HStack(alignment: .firstTextBaseline, spacing: metric("inset")) {
                                    // A translation's title is its source, repeated just below: one line is enough there.
                                    Text(store.title(session)).font(.vzn(wide ? "headingScale" : "sectionScale", .semibold)).lineLimit(session.feature == .chat ? 2 : 1).help(store.title(session))
                                    Spacer(minLength: metric("small"))
                                    NativePanelButton(label: store.text("open"), symbol: "arrow.right", identifier: "history-open", role: .primary) { open(id) }.disabled(archived)
                                }
                                Text([ModelLineup.shortName(session.model),
                                      session.feature == .chat ? nil : store.text("lang_" + session.source) + " → " + store.text("lang_" + session.target),
                                      relativeTime(session.updated, store: store),
                                      session.feature == .chat ? store.text("turnsCount").replacingOccurrences(of: "{n}", with: String(session.messages.count)) : nil].compactMap { $0 }.joined(separator: " · "))
                                    .font(.vzn("captionScale")).foregroundStyle(.secondary).help(session.model)
                                HStack(spacing: metric("tight")) {
                                    Button(store.text("rename"), systemImage: "pencil") { renameID = id; newTitle = session.title }
                                    Button(store.text("exportSession"), systemImage: "square.and.arrow.up") { export(id) }
                                    Button(store.text(archived ? "restoreSession" : "archiveSession"), systemImage: archived ? "tray.and.arrow.up" : "archivebox") {
                                        let wasArchived = archived
                                        store.archiveSession(id, archived: !wasArchived); selected = records.first?.id
                                        ToastCenter.shared.show(store.text(wasArchived ? "sessionRestored" : "sessionArchived") + ": " + store.title(session), key: "archive-" + id, actionLabel: store.text("undo")) {
                                            store.archiveSession(id, archived: wasArchived)
                                        }
                                    }
                                    Button(store.text("deleteSession"), systemImage: "trash", role: .destructive) { delete(id) }.help(store.text("deleteUndoHint"))
                                }.buttonStyle(.vznQuiet).font(.vzn("smallScale"))
                            }.frame(maxWidth: metric("reading"))
                            Divider()
                            ScrollView { SessionPreview(store: store, session: session).frame(maxWidth: metric("reading")).padding(.vertical, metric("small")) }
                                .id(session.id).frame(maxHeight: .infinity)
                        }.padding(wide ? metric("gutter") : metric("inset")).frame(maxWidth: .infinity, alignment: .leading)
                    } else { ContentUnavailableView(store.text("chooseHistory"), systemImage: "clock").frame(maxWidth: .infinity, maxHeight: .infinity) }
                }
            }
        }.onAppear { selected = records.contains { $0.id == store.session.id } ? store.session.id : records.first?.id }
            .onChange(of: archived) { _, _ in selected = records.first?.id }
            .onChange(of: featureFilter) { _, _ in if !records.contains(where: { $0.id == selected }) { selected = records.first?.id } }
            .alert(store.text("rename"), isPresented: Binding(get: { renameID != nil }, set: { if !$0 { renameID = nil } })) {
                TextField(store.text("sessionTitle"), text: $newTitle)
                Button(store.text("apply")) { if let id = renameID { store.renameSession(id, title: newTitle) }; renameID = nil }
                Button(store.text("close"), role: .cancel) { renameID = nil }
            }
            .onChange(of: query) { _, _ in if !records.contains(where: { $0.id == selected }) { selected = records.first?.id } }
    }
    private func export(_ id: String) {
        let panel = NSSavePanel(); panel.nameFieldStringValue = "viezan-session.json"
        panel.begin { response in
            guard response == .OK, let url = panel.url else { return }
            do { try store.exportSession(id).write(to: url, options: .atomic) }
            catch { ToastCenter.shared.show(store.text("exportError"), key: "history-export", error: true) }
        }
    }

}

struct SessionPreview: View {
    var store: WorkbenchStore
    var session: Session
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        VStack(alignment: .leading, spacing: metric("gutter")) {
            if session.feature == .chat {
                ForEach(session.messages) { message in
                    let text = message.text.isEmpty ? store.text(store.workspace.tasks.first(where: { $0.id == message.id })?.status.rawValue ?? "noContent") : message.text
                    if message.role == "user" {
                        // Same shape as the live transcript: the person's turn on a muted surface, inset.
                        Text(text).font(readingFont(store)).fixedSize(horizontal: false, vertical: true)
                            .padding(.vertical, metric("gap")).padding(.horizontal, metric("inset"))
                            .background(contentColor("surface-muted", scheme), in: RoundedRectangle(cornerRadius: metric("largeRadius")))
                            .frame(maxWidth: metric("reading") * metric("bubbleFraction"), alignment: .trailing)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    } else { section("Viezan", text) }
                }
                if !session.draft.isEmpty { section(store.text("unsentDraft"), session.draft) }
                if session.messages.isEmpty && session.draft.isEmpty { Text(store.text("noContent")).foregroundStyle(.secondary) }
            } else {
                section(store.text("source"), session.draft.isEmpty ? store.text("noContent") : session.draft)
                section(store.text("result"), session.output.isEmpty ? store.text("emptyResult") : session.output)
            }
        }.frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled)
    }
    private func section(_ title: String, _ content: String) -> some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            Text(title).font(.vzn("captionScale")).fontWeight(.semibold).foregroundStyle(.secondary)
            Text(content).font(readingFont(store)).frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct ActivityView: View {
    @Bindable var store: WorkbenchStore
    var open: (String) -> Void
    var openRoute: (String) -> Void
    var dismiss: () -> Void
    var availableHeight: CGFloat
    @State private var contentHeight: CGFloat = 0
    @State private var focusedControl = "close"
    @State private var focusEpoch = 1
    private var controls: [String] {
        var ids = ["close"]
        if store.interpretation.busy { ids += ["open-interpretation", "stop-interpretation"] }
        for task in store.workspace.tasks {
            ids.append("open-" + task.id)
            if task.status == .running { ids.append("stop-" + task.id) }
            else if store.canRetry(task) { ids.append("retry-" + task.id) }
        }
        return ids
    }

    private func moveFocus(from id: String, backwards: Bool) {
        let ids = controls
        let index = ids.firstIndex(of: id) ?? 0
        focusedControl = ids[(index + (backwards ? ids.count - 1 : 1)) % ids.count]
        focusEpoch += 1
    }
    private func epoch(_ id: String) -> Int { focusedControl == id ? focusEpoch : 0 }
    var body: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            HStack { Text(store.text("activity")).font(.vzn("labelScale", .semibold)); Spacer(); ShellToolbarButton(label: store.text("close"), symbol: "xmark", identifier: "activity-close", focusEpoch: epoch("close"), onTab: { moveFocus(from: "close", backwards: $0) }, action: dismiss) }
                .frame(height: metric("control"))
            if store.workspace.tasks.isEmpty && !store.interpretation.busy {
                Text(store.text("noTasks")).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: metric("control"), alignment: .leading)
            } else {
                ScrollView {
                    VStack(spacing: metric("inset")) {
                        // Live interpretation is a background job too: it keeps capturing after navigation.
                        if store.interpretation.busy, let session = store.interpretation.current {
                            VStack(alignment: .leading, spacing: metric("small")) {
                                Text(store.text("interpret") + " · " + Date(timeIntervalSince1970: session.created).formatted(date: .abbreviated, time: .shortened)).font(.vzn("labelScale", .semibold)).lineLimit(2)
                                Text(store.text(store.interpretation.listening ? "listening" : "running")).font(.vzn("captionScale")).foregroundStyle(.secondary)
                                Text(nativeModelLabel(session.model, store: store)).font(.vzn("captionScale")).foregroundStyle(.secondary)
                                HStack {
                                    NativePanelButton(label: store.text("open"), identifier: "activity-open-interpretation", focusEpoch: epoch("open-interpretation"), onTab: { moveFocus(from: "open-interpretation", backwards: $0) }) { openRoute("interpret") }
                                    Spacer()
                                    NativePanelButton(label: store.text("stop"), identifier: "activity-stop-interpretation", role: .destructive, focusEpoch: epoch("stop-interpretation"), onTab: { moveFocus(from: "stop-interpretation", backwards: $0) }) { focusedControl = "close"; store.interpretation.stop() }
                                }
                            }.frame(maxWidth: .infinity, alignment: .leading).cardSurface()
                        }
                        ForEach(store.workspace.tasks) { task in
                            VStack(alignment: .leading, spacing: metric("small")) {
                                Text(store.session(task.request.sessionID).map(store.title) ?? store.text("noContent")).font(.vzn("labelScale", .semibold)).lineLimit(2)
                                Text(store.text(task.status.rawValue)).font(.vzn("captionScale")).foregroundStyle(.secondary)
                                Text(nativeModelLabel(task.request.model, store: store)).font(.vzn("captionScale")).foregroundStyle(.secondary)
                                HStack {
                                    NativePanelButton(label: store.text("open"), identifier: "activity-open-" + task.id, focusEpoch: epoch("open-" + task.id), onTab: { moveFocus(from: "open-" + task.id, backwards: $0) }) { open(task.request.sessionID) }
                                    Spacer()
                                    if task.status == .running {
                                        NativePanelButton(label: store.text("stop"), identifier: "activity-stop-" + task.id, role: .destructive, focusEpoch: epoch("stop-" + task.id), onTab: { moveFocus(from: "stop-" + task.id, backwards: $0) }) { focusedControl = "stop-" + task.id; store.cancel(task.id) }
                                    } else if store.canRetry(task) { NativePanelButton(label: store.text("retry"), identifier: "activity-retry-" + task.id, role: .primary, focusEpoch: epoch("retry-" + task.id), onTab: { moveFocus(from: "retry-" + task.id, backwards: $0) }) { focusedControl = "retry-" + task.id; store.retry(task.id) } }
                                }
                            // Bordered card: the panel is now an opaque surface of the same tone.
                            }.frame(maxWidth: .infinity, alignment: .leading).cardSurface()
                        }
                    }.onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
                }.frame(height: min(max(metric("control"), contentHeight), max(metric("control"), availableHeight - metric("control") - metric("inset") * 3)))

            }
        }.padding(metric("inset")).frame(maxWidth: .infinity)
            .accessibilityElement(children: .contain).accessibilityLabel(store.text("activity"))
            .onChange(of: controls) { _, ids in
                guard !ids.contains(focusedControl) else { return }
                let taskID = focusedControl.split(separator: "-", maxSplits: 1).last.map(String.init) ?? ""
                focusedControl = ["retry-", "stop-", "open-"].map { $0 + taskID }.first(where: ids.contains) ?? "close"
                focusEpoch += 1
            }
    }
}

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
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
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
                                .background {
                                    if session.id == highlighted {
                                        if glass { GlassLens(radius: metric("radius")) }
                                        else { RoundedRectangle(cornerRadius: metric("radius")).fill(contentColor("surface-hover", scheme)) }
                                    }
                                }
                                .accessibilityAddTraits(session.id == highlighted ? .isSelected : [])
                                .id(session.id)
                        }
                    }.onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
                }.onChange(of: highlighted) { _, id in if let id { proxy.scrollTo(id) } }
            }.frame(height: HistoryPanelLayout.listHeight(content: contentHeight, available: availableHeight))
            CardDivider()
            // The panel's foot reads like the model panel's: a quiet control, not a link.
            if glass {
                Button { all() } label: { Label(store.text("allHistory"), systemImage: "arrow.right").labelStyle(TrailingIconLabelStyle()) }
                    .buttonStyle(.plain).font(.vzn("smallScale", .medium)).foregroundStyle(contentColor("action-text", scheme))
                    .padding(.horizontal, metric("small")).frame(height: metric("compactControl")).contentShape(Rectangle())
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Button(store.text("allHistory"), systemImage: "arrow.right") { all() }.buttonStyle(.vznQuiet).font(.vzn("smallScale"))
                    .labelStyle(TrailingIconLabelStyle()).frame(maxWidth: .infinity, alignment: .leading)
            }
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
    /// In the archive the time is when the row was archived ("lưu trữ 5 ngày trước").
    var archivedList = false
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
            case .pair(let source, let target): return sourceLanguageName(source, draft: session.draft, store: store) + " → " + store.text("lang_" + target)
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
                    Text(archivedList ? store.text("archivedAgo").replacingOccurrences(of: "{time}", with: relativeTime(session.archivedAt ?? session.updated, store: store)) : relativeTime(session.updated, store: store))
                        .font(.vzn("captionScale")).foregroundStyle(.secondary).lineLimit(1).fixedSize()
                }
            }
        }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
    }
}

/// "Tự động" names the language the draft turned out to be in, when it can be told.
@MainActor func sourceLanguageName(_ source: String, draft: String, store: WorkbenchStore) -> String {
    guard source == "auto" else { return store.text("lang_" + source) }
    return TextLanguage.detect(draft).map { store.text("lang_" + $0) } ?? store.text("lang_auto")
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
    @Environment(\.colorScheme) private var scheme
    /// An archived session awaiting "Delete permanently" confirmation (cannot be undone).
    @State private var confirmDelete: String?
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
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
    // Glass: an archived session is deleted permanently, so it asks first.
    private func delete(_ id: String) {
        guard let item = store.session(id) else { return }
        if glass && item.archived == true { confirmDelete = id; return }
        let next = records.first { $0.id != id }?.id
        do {
            let removed = try store.removeSession(id)
            selected = next
            ToastCenter.shared.show(store.text("sessionDeleted") + ": " + store.title(item), key: "delete-" + id, actionLabel: store.text("undo")) {
                store.restoreSession(removed.session, at: removed.index); selected = id
            }
        } catch { ToastCenter.shared.show(store.text("dataOperationError"), key: "history-delete", error: true) }
    }
    private func deletePermanently(_ id: String) {
        guard let item = store.session(id) else { return }
        let next = records.first { $0.id != id }?.id
        confirmDelete = nil
        do {
            try store.deleteArchivedSession(id); selected = next
            ToastCenter.shared.show(store.text("sessionDeleted") + ": " + store.title(item), key: "delete-" + id)
        } catch { ToastCenter.shared.show(store.text("dataOperationError"), key: "history-delete", error: true) }
    }
    private func move(_ offset: Int) {
        guard !records.isEmpty else { return }
        let index = selected.flatMap { id in records.firstIndex { $0.id == id } } ?? (offset > 0 ? -1 : records.count)
        selected = records[min(max(index + offset, 0), records.count - 1)].id
    }
    var body: some View {
        libraryBody.onAppear { favoritesOnly = initialFavorites; featureFilter = store.workspace.feature }
            .onKeyPress(.return) { if confirmDelete == nil, let id = selected, !archived { open(id); return .handled }; return .ignored }
            .onKeyPress(.delete) { if confirmDelete == nil, let id = selected { delete(id); return .handled }; return .ignored }
            .onKeyPress(.upArrow) { if glass && confirmDelete == nil { move(-1); return .handled }; return .ignored }
            .onKeyPress(.downArrow) { if glass && confirmDelete == nil { move(1); return .handled }; return .ignored }
            .onExitCommand { if confirmDelete != nil { confirmDelete = nil } else { close() } }
            .overlay {
                if let id = confirmDelete, let item = store.session(id) {
                    ConfirmDialog(title: store.title(item), message: store.text("deletePermanentlyConfirm"), cancel: store.text("cancel"),
                                  confirm: store.text("deletePermanently"), onCancel: { confirmDelete = nil }, onConfirm: { deletePermanently(id) })
                }
            }
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
                    if glass {
                        // History board: archived sessions are a toggle beside search, filtered in place.
                        HStack(spacing: metric("small")) {
                            SearchBox(query: $query, label: store.text("historySearch"), move: move)
                            ShellToolbarButton(label: store.text("archiveSession"), symbol: "archivebox", identifier: "history-archived-toggle", showsLabel: true, glass: true, soft: archived,
                                               hint: store.text("archivedSessions")) { archived.toggle() }
                                .fixedSize().accessibilityAddTraits(archived ? .isSelected : [])
                        }.padding(.horizontal, metric("inset")).padding(.bottom, metric("tight"))
                    } else {
                        FilterTabs(label: store.text("history"), items: [(false, store.text("history")), (true, store.text("archivedSessions"))], selection: $archived).padding(.horizontal, metric("inset"))
                        SearchBox(query: $query, label: store.text("historySearch"), move: move)
                            .frame(width: wide ? metric("sidebar") + metric("gutter") - metric("inset") * 2 : nil).padding(metric("inset"))
                    }
                    if records.isEmpty {
                        VStack(spacing: metric("small")) {
                            if glass {
                                // History-States: a quiet empty state where the rows would be.
                                GlassEmptyState(symbol: "magnifyingglass", tone: "text-muted", title: store.text("noHistory"))
                            } else {
                                Image(systemName: "magnifyingglass").font(.vzn("headingScale", .semibold)).accessibilityHidden(true)
                                Text(store.text("noHistory")).multilineTextAlignment(.center)
                            }
                        }.foregroundStyle(.secondary).padding(metric("inset"))
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if glass {
                        glassList
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
                }.padding(.top, glass ? metric("inset") : 0)
                .frame(width: wide && !records.isEmpty ? metric("sidebar") + metric("editor") : nil,
                        height: !wide && !records.isEmpty ? min(metric("editor") * 2, geometry.size.height / 2) : nil)
                if !records.isEmpty {
                    if glass { Rectangle().fill(contentColor("divider", scheme)).frame(width: wide ? metric("hairline") : nil, height: wide ? nil : metric("hairline")).accessibilityHidden(true) } else { Divider() }
                    if glass, let id = selected, let session = records.first(where: { $0.id == id }) {
                        glassPreview(id, session, wide: wide)
                    } else if let id = selected, let session = records.first(where: { $0.id == id }) {
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
                                      session.feature == .chat ? nil : sourceLanguageName(session.source, draft: session.draft, store: store) + " → " + store.text("lang_" + session.target),
                                      relativeTime(session.updated, store: store),
                                      session.feature == .chat ? store.text("turnsCount").replacingOccurrences(of: "{n}", with: String(session.messages.filter { $0.role == "user" }.count)) : nil].compactMap { $0 }.joined(separator: " · "))
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
            // History-States: Glass renames in a dialog centred over the library; others keep the alert.
            .overlay {
                if glass && renameID != nil {
                    BlockingDialog(title: store.text("rename"), onCancel: { renameID = nil }) {
                        Text(store.text("rename")).font(.vzn("subtitleScale", .semibold)).foregroundStyle(contentColor("text-strong", scheme)).accessibilityAddTraits(.isHeader)
                        TextField(store.text("sessionTitle"), text: $newTitle).textFieldStyle(.plain).font(.vzn("labelScale"))
                            .padding(.horizontal, metric("gap")).frame(height: metric("control"))
                            .background { InsetInputSurface(radius: metric("controlRadius"), focused: true) }
                            .onSubmit { if let id = renameID { store.renameSession(id, title: newTitle) }; renameID = nil }
                            .accessibilityIdentifier("rename-field")
                        HStack(spacing: metric("small")) {
                            Spacer(minLength: 0)
                            Button(store.text("close")) { renameID = nil }.buttonStyle(.vznOutline).keyboardShortcut(.cancelAction)
                            Button(store.text("apply")) { if let id = renameID { store.renameSession(id, title: newTitle) }; renameID = nil }.buttonStyle(.vznPrimary)
                        }.padding(.top, metric("tight"))
                    }
                }
            }
            .alert(store.text("rename"), isPresented: Binding(get: { !glass && renameID != nil }, set: { if !$0 { renameID = nil } })) {
                TextField(store.text("sessionTitle"), text: $newTitle)
                Button(store.text("apply")) { if let id = renameID { store.renameSession(id, title: newTitle) }; renameID = nil }
                Button(store.text("close"), role: .cancel) { renameID = nil }
            }
            .onChange(of: query) { _, _ in if !records.contains(where: { $0.id == selected }) { selected = records.first?.id } }
    }
    // Grouped rows with the selected one as a lens (History board).
    private var glassList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(HistoryBucket.allCases, id: \.self) { bucket in
                        // History-Archived: the archive groups by when each session was archived.
                        let rows = records.filter { HistoryBucket.of(WorkbenchStore.historyTime($0, archived: archived)) == bucket }
                        if !rows.isEmpty {
                            Eyebrow(text: store.text((archived ? "archivedGroup_" : "group_") + bucket.rawValue)).padding(.horizontal, metric("gap")).padding(.top, metric("gap")).padding(.bottom, metric("tight"))
                            ForEach(rows) { item in
                                Button { selected = item.id } label: {
                                    SessionRow(store: store, session: item, showsIcon: featureFilter == nil, archivedList: archived)
                                        .padding(.horizontal, metric("gap") - metric("tight")).padding(.vertical, metric("small"))
                                        .frame(minHeight: metric("navControl") + metric("gap"))
                                }.buttonStyle(HistoryRowStyle(selected: item.id == selected))
                                    .accessibilityAddTraits(item.id == selected ? .isSelected : []).id(item.id)
                            }
                        }
                    }
                }.padding(.horizontal, metric("small")).padding(.bottom, metric("small"))
            }.scrollIndicators(.hidden)
            .onChange(of: selected) { _, id in if let id { proxy.scrollTo(id) } }
        }
    }
    // Preview head: title 18, meta (with an Archived chip), quiet actions and Open as the primary.
    private func glassPreview(_ id: String, _ session: Session, wide: Bool) -> some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            VStack(alignment: .leading, spacing: metric("small")) {
                Text(store.title(session)).font(.vzn("titleScale", .semibold)).lineLimit(session.feature == .chat ? 2 : 1).help(store.title(session))
                HStack(spacing: metric("small")) {
                    if archived { StatusBadge(text: store.text("archivedSessions"), tone: .idle) }
                    Text([ModelLineup.shortName(session.model),
                          session.feature == .chat ? nil : sourceLanguageName(session.source, draft: session.draft, store: store) + " → " + store.text("lang_" + session.target),
                          archived ? store.text("archivedAgo").replacingOccurrences(of: "{time}", with: relativeTime(session.archivedAt ?? session.updated, store: store)) : relativeTime(session.updated, store: store),
                          session.feature == .chat ? store.text("turnsCount").replacingOccurrences(of: "{n}", with: String(session.messages.filter { $0.role == "user" }.count)) : nil].compactMap { $0 }.joined(separator: " · "))
                        .font(.vzn("smallScale")).foregroundStyle(.secondary).help(session.model)
                }
                HStack(spacing: metric("tight")) {
                    Button(store.text("rename"), systemImage: "pencil") { renameID = id; newTitle = session.title }
                    Button(store.text("exportSession"), systemImage: "square.and.arrow.up") { export(id) }
                    Button(store.text(archived ? "restoreSession" : "archiveSession"), systemImage: archived ? "arrow.uturn.backward" : "archivebox") {
                        let wasArchived = archived
                        store.archiveSession(id, archived: !wasArchived); selected = records.first?.id
                        ToastCenter.shared.show(store.text(wasArchived ? "sessionRestored" : "sessionArchived") + ": " + store.title(session), key: "archive-" + id, actionLabel: store.text("undo")) {
                            store.archiveSession(id, archived: wasArchived)
                        }
                    }
                    Button(store.text(archived ? "deletePermanently" : "deleteSession"), systemImage: "trash", role: .destructive) { delete(id) }
                        .help(archived ? store.text("deletePermanentlyConfirm") : store.text("deleteUndoHint"))
                    Spacer(minLength: metric("small"))
                    NativePanelButton(label: store.text("open"), symbol: "arrow.right", identifier: "history-open", role: .primary) { open(id) }.disabled(archived)
                }.buttonStyle(.vznQuiet).padding(.top, metric("tight"))
            }.frame(maxWidth: metric("reading"))
            CardDivider().frame(maxWidth: metric("reading"))
            ScrollView { SessionPreview(store: store, session: session).frame(maxWidth: metric("reading")).padding(.vertical, metric("small")) }
                .id(session.id).frame(maxHeight: .infinity)
        }.padding(wide ? metric("large") : metric("inset"))
            .frame(maxWidth: .infinity, alignment: .leading)
    }
    private func export(_ id: String) {
        let panel = NSSavePanel(); panel.nameFieldStringValue = "viezan-session.json"
        panel.begin { response in
            guard response == .OK, let url = panel.url else { return }
            do { try store.exportSession(id).write(to: url, options: .atomic); announceSaved(url, store: store) }
            catch { ToastCenter.shared.show(store.text("exportError"), key: "history-export", error: true) }
        }
    }

}

struct SessionPreview: View {
    var store: WorkbenchStore
    var session: Session
    @Environment(\.colorScheme) private var scheme
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    var body: some View {
        VStack(alignment: .leading, spacing: metric("gutter")) {
            if session.feature == .chat {
                ForEach(session.messages) { message in
                    let text = message.text.isEmpty ? store.text(store.workspace.tasks.first(where: { $0.id == message.id })?.status.rawValue ?? "noContent") : message.text
                    if message.role == "user" {
                        // Same shape as the live transcript: the person's turn on a muted surface, inset.
                        Text(text).font(readingFont(store)).fixedSize(horizontal: false, vertical: true)
                            .padding(.vertical, metric(glass ? "small" : "gap") + (glass ? metric("hairline") * 2 : 0))
                            .padding(.horizontal, metric(glass ? "gap" : "inset") + (glass ? metric("hairline") * 2 : 0))
                            .background(contentColor("surface-muted", scheme), in: glass ? AnyShape(UserBubbleShape()) : AnyShape(RoundedRectangle(cornerRadius: metric("largeRadius"))))
                            .frame(maxWidth: metric("reading") * metric("bubbleFraction"), alignment: .trailing)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    } else if glass {
                        VStack(alignment: .leading, spacing: metric("small")) {
                            HStack(spacing: metric("small") - metric("hairline") * 2) {
                                Image(systemName: "sparkles").imageScale(.small).foregroundStyle(contentColor("action", scheme))
                                Text("Viezan").fontWeight(.semibold).foregroundStyle(contentColor("text-muted", scheme))
                            }.font(.vzn("smallScale")).accessibilityElement(children: .combine)
                            Text(text).font(readingFont(store)).frame(maxWidth: .infinity, alignment: .leading)
                        }
                    } else { section("Viezan", text) }
                }
                if !session.draft.isEmpty { section(store.text("unsentDraft"), session.draft) }
                if session.messages.isEmpty && session.draft.isEmpty { Text(store.text("noContent")).foregroundStyle(.secondary) }
            } else if glass, session.feature == .dictionary, let entry = DictionaryEntry.parse(session.output) {
                // History-States: a lookup previews as its entry, as it reads in Dictionary.
                DictionaryResultView(entry: entry, store: store)
            } else if glass {
                // History-States: the source in a flat card, the translation plain under it with Copy.
                VStack(alignment: .leading, spacing: metric("small")) {
                    Eyebrow(text: store.text("source") + " · " + store.text("lang_" + session.source))
                    Text(session.draft.isEmpty ? store.text("noContent") : session.draft).font(readingFont(store)).foregroundStyle(contentColor("text-strong", scheme)).frame(maxWidth: .infinity, alignment: .leading)
                }.cardSurface()
                VStack(alignment: .leading, spacing: metric("small")) {
                    Eyebrow(text: store.text("result") + " · " + store.text("lang_" + session.target))
                    Text(session.output.isEmpty ? store.text("emptyResult") : session.output).font(readingFont(store)).foregroundStyle(contentColor(session.output.isEmpty ? "text-soft" : "text-strong", scheme)).frame(maxWidth: .infinity, alignment: .leading)
                    if !session.output.isEmpty {
                        CopyResponseButton(text: session.output, label: store.text("copy"), copiedLabel: store.text("copied")).padding(.leading, -metric("small"))
                    }
                }.padding(.horizontal, metric("inset"))
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
    /// One row per task, except a model comparison: its tasks share one row ("So sánh 3 model · 2/3 xong").
    private enum Row: Identifiable {
        case task(WorkTask)
        case comparison(parent: String, tasks: [WorkTask])
        var id: String { switch self { case .task(let task): task.id; case .comparison(let parent, _): "compare-" + parent } }
    }
    private var rows: [Row] {
        var result: [Row] = [], grouped: [String: [WorkTask]] = [:], order: [String] = []
        for task in store.workspace.tasks {
            if let parent = store.session(task.request.sessionID)?.comparisonParent {
                if grouped[parent] == nil { order.append(parent); result.append(.comparison(parent: parent, tasks: [])) }
                grouped[parent, default: []].append(task)
            } else { result.append(.task(task)) }
        }
        return result.map { row in if case .comparison(let parent, _) = row { return .comparison(parent: parent, tasks: grouped[parent] ?? []) }; return row }
    }
    private var controls: [String] {
        var ids = ["close"]
        if store.interpretation.busy { ids += ["open-interpretation", "stop-interpretation"] }
        for row in rows {
            switch row {
            case .task(let task):
                ids.append("open-" + task.id)
                if task.status == .running { ids.append("stop-" + task.id) }
                else if store.canRetry(task) { ids.append("retry-" + task.id) }
            case .comparison(_, let tasks):
                ids.append("open-" + row.id)
                if tasks.contains(where: { $0.status == .running }) { ids.append("stop-" + row.id) }
            }
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
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    @Environment(\.colorScheme) private var scheme
    // Glass (Overlays board): state dot, title and the state on one line; the model moves to help.
    @ViewBuilder private func jobHead(title: String, status: String, model: String, tone: StatusTone) -> some View {
        if glass {
            HStack(alignment: .firstTextBaseline, spacing: metric("small")) {
                StatusDot(tone: tone)
                Text(title).font(.vzn("labelScale", .medium)).foregroundStyle(contentColor("text-strong", scheme)).lineLimit(1)
                Spacer(minLength: metric("small"))
                Text(status).font(.vzn("smallScale")).foregroundStyle(contentColor(tone == .failed ? "danger" : "text-muted", scheme)).lineLimit(1).fixedSize()
            }.help(model).accessibilityElement(children: .combine)
        } else {
            Text(title).font(.vzn("labelScale", .semibold)).lineLimit(2)
            Text(status).font(.vzn("captionScale")).foregroundStyle(.secondary)
            Text(model).font(.vzn("captionScale")).foregroundStyle(.secondary)
        }
    }
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
                                jobHead(title: store.text("interpret") + " · " + Date(timeIntervalSince1970: session.created).formatted(date: .abbreviated, time: .shortened),
                                        status: store.text(store.interpretation.listening ? "listening" : "running"), model: nativeModelLabel(session.model, store: store), tone: .busy)
                                HStack {
                                    NativePanelButton(label: store.text("open"), identifier: "activity-open-interpretation", focusEpoch: epoch("open-interpretation"), onTab: { moveFocus(from: "open-interpretation", backwards: $0) }) { openRoute("interpret") }
                                    Spacer()
                                    NativePanelButton(label: store.text("stop"), identifier: "activity-stop-interpretation", role: .destructive, focusEpoch: epoch("stop-interpretation"), onTab: { moveFocus(from: "stop-interpretation", backwards: $0) }) { focusedControl = "close"; store.interpretation.stop() }
                                }
                            }.frame(maxWidth: .infinity, alignment: .leading).cardSurface()
                        }
                        ForEach(rows) { row in
                            switch row {
                            case .task(let task): taskCard(task)
                            case .comparison(let parent, let tasks): comparisonCard(row.id, parent: parent, tasks: tasks)
                            }
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
    private func comparisonCard(_ id: String, parent: String, tasks: [WorkTask]) -> some View {
        let done = tasks.filter { $0.status == .succeeded }.count
        let running = tasks.contains { $0.status == .running }, failed = tasks.contains { $0.status == .failed }
        return VStack(alignment: .leading, spacing: metric("small")) {
            jobHead(title: store.session(parent).map(store.title) ?? store.text("compare"),
                    status: store.text("activityCompare").replacingOccurrences(of: "{count}", with: tasks.count.formatted()).replacingOccurrences(of: "{done}", with: done.formatted()).replacingOccurrences(of: "{total}", with: tasks.count.formatted()),
                    model: tasks.map { nativeModelLabel($0.request.model, store: store) }.joined(separator: ", "), tone: running ? .busy : failed ? .failed : .idle)
            HStack {
                NativePanelButton(label: store.text("open"), identifier: "activity-open-" + id, focusEpoch: epoch("open-" + id), onTab: { moveFocus(from: "open-" + id, backwards: $0) }) { open(parent) }
                Spacer()
                if running {
                    NativePanelButton(label: store.text("stop"), identifier: "activity-stop-" + id, role: .destructive, focusEpoch: epoch("stop-" + id), onTab: { moveFocus(from: "stop-" + id, backwards: $0) }) {
                        focusedControl = "stop-" + id; for task in tasks where task.status == .running { store.cancel(task.id) }
                    }
                }
            }
        }.frame(maxWidth: .infinity, alignment: .leading).cardSurface()
    }
    private func taskCard(_ task: WorkTask) -> some View {
                            VStack(alignment: .leading, spacing: metric("small")) {
                                jobHead(title: store.session(task.request.sessionID).map(store.title) ?? store.text("noContent"), status: store.text(task.status.rawValue),
                                        model: nativeModelLabel(task.request.model, store: store), tone: task.status == .running ? .busy : task.status == .failed ? .failed : .idle)
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
}

// Library row: flat at rest, a lens when selected, the softer lens on hover.
private struct HistoryRowStyle: ButtonStyle {
    var selected: Bool
    func makeBody(configuration: Configuration) -> some View { HistoryRowBody(configuration: configuration, selected: selected) }
}
private struct HistoryRowBody: View {
    var configuration: ButtonStyleConfiguration
    var selected: Bool
    @State private var hovered = false
    var body: some View {
        configuration.label
            .background { if selected || hovered || configuration.isPressed { GlassLens(radius: metric("radius"), hover: !selected) } }
            .contentShape(Rectangle()).onHover { hovered = $0 }
    }
}

// Blocking dialog centred over its owner (Liquid Glass 2.0): a 22 % scrim that
// cancels on click, and an 18 pt floating card. Confirmations and the shortcut
// recorder share it; the content brings its own title, body and actions.
struct BlockingDialog<Content: View>: View {
    var title: String
    var width: CGFloat = metric("sidebar") + metric("editor") + metric("gutter") * 2
    var onCancel: () -> Void
    @ViewBuilder var content: Content
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: metric("inset") + metric("hairline") * 2, style: .continuous)
        let solid = reduceTransparency || contrast == .increased
        ZStack {
            Button(action: onCancel) { chromeColor("shadow-lg-color", scheme).contentShape(Rectangle()) }
                .buttonStyle(.plain).focusable(false).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: metric("gap")) { content }
                .padding(metric("inset") + metric("tight"))
                .frame(width: width)
                .background {
                    if solid { shape.fill(chromeColor("titlebar-bg", scheme)).overlay { shape.strokeBorder(chromeColor("border-strong", scheme), lineWidth: metric("hairline")) } }
                    else {
                        shape.fill(.regularMaterial).overlay { shape.fill(chromeColor("surface-raised", scheme)) }.overlay { GlassRim(shape: shape) }
                            .shadow(color: chromeColor("shadow-lg-color", scheme), radius: metric("shadowLgBlur") / 2, y: metric("shadowLgY"))
                    }
                }
                .onExitCommand(perform: onCancel)
                .accessibilityElement(children: .contain).accessibilityAddTraits(.isModal).accessibilityLabel(title)
        }
    }
}

// A confirmation for what cannot be undone: one templated sentence, Cancel and a solid danger action.
struct ConfirmDialog: View {
    var title: String
    var message: String
    var cancel: String
    var confirm: String
    var onCancel: () -> Void
    var onConfirm: () -> Void
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        BlockingDialog(title: title, onCancel: onCancel) {
            Text(title).font(.vzn("subtitleScale", .semibold)).foregroundStyle(contentColor("text-strong", scheme)).lineLimit(2).accessibilityAddTraits(.isHeader)
            Text(message).font(.system(size: NSFont.systemFontSize)).foregroundStyle(contentColor("text-muted", scheme)).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: metric("small")) {
                Spacer(minLength: 0)
                Button(cancel, action: onCancel).buttonStyle(.vznOutline).keyboardShortcut(.cancelAction).accessibilityIdentifier("confirm-cancel")
                Button(confirm, role: .destructive, action: onConfirm).buttonStyle(DangerSolidStyle()).accessibilityIdentifier("confirm-destructive")
            }.padding(.top, metric("tight"))
        }
    }
}

// The one solid danger control, used only inside a blocking confirmation.
struct DangerSolidStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { DangerSolidBody(configuration: configuration) }
}
private struct DangerSolidBody: View {
    var configuration: ButtonStyleConfiguration
    @Environment(\.colorScheme) private var scheme
    @Environment(\.isFocused) private var focused
    @State private var hovered = false
    var body: some View {
        configuration.label.font(.system(size: NSFont.systemFontSize, weight: .semibold)).lineLimit(1)
            .foregroundStyle(contentColor("action-fg", scheme))
            .padding(.horizontal, metric("gap")).frame(minHeight: metric("compactControl"))
            .background(Capsule().fill(contentColor("danger", scheme)))
            .overlay { if hovered || configuration.isPressed { Capsule().fill(contentColor("text-strong", scheme).opacity(metric("selectionOpacity"))) } }
            .overlay { if focused { Capsule().inset(by: -metric("hairline") * 2).strokeBorder(contentColor("action-text", scheme), lineWidth: metric("hairline") * 2) } }
            .contentShape(Capsule()).onHover { hovered = $0 }
    }
}

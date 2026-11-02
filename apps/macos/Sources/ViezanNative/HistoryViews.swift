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
            HistorySearch(query: $query, label: store.text("historySearch"), move: move, submit: openHighlighted, cancel: dismiss)
                .frame(height: metric("control"))
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: metric("small")) {
                        if records.isEmpty { Text(store.text("noHistory")).foregroundStyle(.secondary).padding(metric("inset")) }
                        ForEach(records) { session in
                            Button { select(session.id) } label: { SessionRow(store: store, session: session, highlighted: session.id == highlighted) }
                                .buttonStyle(.plain).padding(metric("small"))
                                .background(session.id == highlighted ? contentColor("action-soft", scheme) : Color.clear, in: RoundedRectangle(cornerRadius: metric("radius")))
                                .overlay(RoundedRectangle(cornerRadius: metric("radius")).stroke(session.id == highlighted ? contentColor("action-soft", scheme) : Color.clear))
                                .accessibilityAddTraits(session.id == highlighted ? .isSelected : [])
                                .id(session.id)
                        }
                    }.onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
                }.onChange(of: highlighted) { _, id in if let id { proxy.scrollTo(id) } }
            }.frame(height: HistoryPanelLayout.listHeight(content: contentHeight, available: availableHeight))
            Divider()
            Button(action: all) {
                HStack { Text(store.text("allHistory")); Spacer(); Image(systemName: "arrow.right") }
                    .frame(maxWidth: .infinity).frame(minHeight: metric("compactControl"))
                    .contentShape(Rectangle())
            }.buttonStyle(.plain).foregroundStyle(contentColor("action-text", scheme))
        }.padding(metric("inset")).frame(maxWidth: .infinity)
            .accessibilityElement(children: .contain).accessibilityLabel(store.text("history"))
            .onAppear { highlighted = store.session.id }
            .onChange(of: query) { _, _ in highlighted = records.first?.id }
    }
}

struct SessionRow: View {
    @Environment(\.colorScheme) private var scheme
    var store: WorkbenchStore
    var session: Session
    var highlighted = false
    var body: some View {
        HStack(alignment: .top, spacing: metric("small")) {
            Image(systemName: session.feature == .chat ? "bubble.left.and.bubble.right" : "character.bubble").foregroundStyle(highlighted ? contentColor("action-text", scheme) : Color.primary)
            VStack(alignment: .leading, spacing: metric("small")) {
                Text(store.title(session)).font(.body).fontWeight(.semibold).lineLimit(1).foregroundStyle(highlighted ? contentColor("action-text", scheme) : Color.primary).help(store.title(session))
                let snippet = session.draft.isEmpty ? session.messages.last?.text ?? session.output : session.draft
                if !snippet.isEmpty {
                    Text(snippet).font(.vzn("captionScale")).foregroundStyle(.secondary).lineLimit(1)
                }
                HStack {
                    Text(nativeModelLabel(session.model, store: store)).lineLimit(1)
                    if store.running(session.id) != nil { Text(store.text("running")) }
                }.font(.vzn("captionScale")).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            if session.id == store.session.id {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.secondary)
                    .accessibilityLabel(store.text("currentSession")).help(store.text("currentSession"))
            }
        }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
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
    @State private var deleteID: String?
    @State private var renameID: String?
    @State private var newTitle = ""
    private var records: [Session] { store.history(query: query, archived: archived).filter { !favoritesOnly || $0.feature != .dictionary || $0.favorite == true } }
    private func move(_ offset: Int) {
        guard !records.isEmpty else { return }
        let index = selected.flatMap { id in records.firstIndex { $0.id == id } } ?? (offset > 0 ? -1 : records.count)
        selected = records[min(max(index + offset, 0), records.count - 1)].id
    }
    var body: some View {
        libraryBody.onAppear { favoritesOnly = initialFavorites }
    }
    private var libraryBody: some View {
        GeometryReader { geometry in
            let wide = geometry.size.width >= metric("reading")
            let layout = wide ? AnyLayout(HStackLayout(spacing: 0)) : AnyLayout(VStackLayout(spacing: 0))
            layout {
                VStack(alignment: .leading, spacing: metric("small")) {
                    // Review 18: small exclusive tabs, not switches, for what the list shows.
                    if store.workspace.feature == .dictionary {
                        FilterTabs(label: store.text("dictionary"), items: [(false, store.text("recentLookups")), (true, store.text("savedWords"))], selection: $favoritesOnly).padding(.horizontal, metric("inset"))
                    }
                    FilterTabs(label: store.text("history"), items: [(false, store.text("history")), (true, store.text("archivedSessions"))], selection: $archived).padding(.horizontal, metric("inset"))
                    HistorySearch(query: $query, label: store.text("historySearch"), move: move)
                        .frame(width: wide ? metric("sidebar") + metric("gutter") - metric("inset") * 2 : nil, height: metric("control")).padding(metric("inset"))
                    if records.isEmpty {
                        VStack(spacing: metric("small")) {
                            Image(systemName: "magnifyingglass").font(.vzn("headingScale", .semibold)).accessibilityHidden(true)
                            Text(store.text("noHistory")).multilineTextAlignment(.center)
                        }.foregroundStyle(.secondary).padding(metric("inset"))
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        List(selection: $selected) { ForEach(records) { SessionRow(store: store, session: $0).tag($0.id) } }.listStyle(.plain)
                    }
                }.frame(width: wide && !records.isEmpty ? metric("sidebar") + metric("gutter") : nil,
                        height: !wide && !records.isEmpty ? min(metric("editor") * 2, geometry.size.height / 2) : nil)
                if !records.isEmpty {
                    Divider()
                    if let id = selected, let session = records.first(where: { $0.id == id }) {
                        VStack(alignment: .leading, spacing: metric("small")) {
                            ScrollView {
                                VStack(alignment: .leading, spacing: metric("small")) {
                                    Text(store.text("historyPreview")).font(.vzn("captionScale")).foregroundStyle(.secondary)
                                    Text(store.title(session)).font(wide ? .title2 : .headline).fontWeight(.semibold)
                                        .lineLimit(wide ? 2 : 1).help(store.title(session))
                                    Text(nativeModelLabel(session.model, store: store)).font(.vzn("captionScale")).foregroundStyle(.secondary)
                                    SessionPreview(store: store, session: session)
                                }.frame(maxWidth: .infinity, alignment: .leading)
                            }.id(session.id).frame(maxHeight: .infinity)
                            Divider()
                            HStack {
                                Button(store.text("rename")) { renameID = id; newTitle = session.title }
                                Button(store.text("exportSession")) { export(id) }
                                Button(store.text(archived ? "restoreSession" : "archiveSession")) {
                                    let wasArchived = archived
                                    store.archiveSession(id, archived: !wasArchived); selected = records.first?.id
                                    ToastCenter.shared.show(store.text(wasArchived ? "sessionRestored" : "sessionArchived") + ": " + store.title(session), key: "archive-" + id, actionLabel: store.text("undo")) {
                                        store.archiveSession(id, archived: wasArchived)
                                    }
                                }
                                if archived { Button(store.text("deletePermanently"), role: .destructive) { deleteID = id } }
                                Spacer(); NativePanelButton(label: store.text("open"), symbol: "arrow.right", identifier: "history-open", role: .primary) { store.select(id); close() }.disabled(archived) }
                        }.padding(wide ? metric("gutter") : metric("inset")).frame(maxWidth: .infinity)
                    } else { ContentUnavailableView(store.text("chooseHistory"), systemImage: "clock").frame(maxWidth: .infinity, maxHeight: .infinity) }
                }
            }
        }.onAppear { selected = store.session.id }
            .confirmationDialog(store.text("deletePermanentlyConfirm"), isPresented: Binding(get: { deleteID != nil }, set: { if !$0 { deleteID = nil } })) {
                Button(store.text("deletePermanently"), role: .destructive) { if let id = deleteID { do { try store.deleteArchivedSession(id); selected = records.first?.id } catch { ToastCenter.shared.show(store.text("dataOperationError"), key: "history-delete", error: true) } }; deleteID = nil }
            }
            .onChange(of: archived) { _, _ in selected = records.first?.id }
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
    var body: some View {
        VStack(alignment: .leading, spacing: metric("gutter")) {
            if session.feature == .chat {
                ForEach(session.messages) { message in
                    section(message.role == "assistant" ? "Viezan" : store.text("you"),
                            message.text.isEmpty ? store.text(store.workspace.tasks.first(where: { $0.id == message.id })?.status.rawValue ?? "noContent") : message.text)
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

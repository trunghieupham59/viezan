import QuickLook
import SwiftUI
import ViezanDomain

struct ApplicationsWorkspace: View {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.shellLayer) private var shellLayer
    let store: WorkbenchStore
    @State private var query = ""
    @State private var selected = Set<String>()
    @State private var reset = false
    @State private var quit = false
    @State private var confirmation = false
    @State private var issueToTrash: ApplicationScanIssue?
    @State private var previewURL: URL?
    @State private var dropTargeted = false
    @FocusState private var issueCancelFocused: Bool
    @FocusState private var planCancelFocused: Bool
    private var apps: Applications { store.applications }
    private var filtered: [InstalledApplication] { apps.applications.filter { query.isEmpty || $0.name.localizedStandardContains(query) || $0.bundleID.localizedStandardContains(query) } }
    @State private var focused: String?
    @State private var journalOpen = false
    private var confirming: Bool { issueToTrash != nil || (confirmation && apps.plan != nil) }
    private var acceptsShortcuts: Bool { !apps.busy && !confirming && store.updatePrompt == nil && shellLayer == nil && previewURL == nil && !journalOpen }
    private var acceptsDrop: Bool { acceptsShortcuts }
    var body: some View {
        Group {
            glassBody
        }
        .quickLookPreview($previewURL)
        .onChange(of: apps.scanIssues) { _, issues in
            if let issue = issueToTrash, !issues.contains(issue) { issueToTrash = nil }
        }
    }
    /// Errors that hold until the screen reloads keep their band in the page; the rest are toasts.
    static func persistentError(_ key: String) -> Bool { key == "appJournalError" || key == "appIncomplete" }
    /// After every action: its failure as a toast that stays until closed (it outlives this
    /// screen, so it carries no button into it); a clean run clears the earlier failure.
    private func reportError() {
        guard let error = apps.error, !Self.persistentError(error) else { ToastCenter.shared.dismiss(key: "apps-error"); return }
        ToastCenter.shared.show(store.text(error), key: "apps-error", level: .danger)
    }
    private func apply(_ plan: ApplicationPlan) {
        Task {
            let previous = apps.journals.first?.id
            await apps.apply(planID: plan.id, itemIDs: selected, reset: reset, quit: quit)
            if let id = apps.journals.first?.id, id != previous { announce(id) }
            reportError()
        }
    }
    private func undo(_ id: String) {
        Task { await apps.undo(id); reportError(); if apps.error == nil { announce(id, undone: true) } }
    }
    /// The action's result as a toast; Undo stays available afterwards in the journal.
    private func announce(_ id: String, undone: Bool = false) {
        guard let journal = apps.journals.first(where: { $0.id == id }) else { return }
        let count = journal.items.filter { undone ? $0.status == "restored" : ["trashed", "preferencesRemoved"].contains($0.status) }.count
        guard count > 0 else { return }
        let key = undone ? "appRestoredCount" : journal.action == "reset" ? "appResetCount" : "appTrashedCount"
        let text = store.text(key).replacingOccurrences(of: "{count}", with: String(count))
        if undone { ToastCenter.shared.show(text, key: "apps-result"); return }
        ToastCenter.shared.show(text, key: "apps-result", actionLabel: store.text("appUndo")) { undo(id) }
    }
    // Apps board: intro with the journal, a flat searchable list (selection is a lens), the
    // app's head with its two actions, then the plan card ending in the solid danger action.
    private var glassBody: some View {
        GeometryReader { geometry in
            let wide = geometry.size.width >= metric("reading") + metric("large") * 2
            let verticalInset = geometry.size.height <= metric("minWindowHeight") ? metric("small") : metric("gutter")
            VStack(alignment: .leading, spacing: verticalInset) {
                PageIntro(title: store.text("appsTitle"), subtitle: store.text("appsSubtitle")) {
                    Button(store.text("journalUndo"), systemImage: "clock.arrow.circlepath") { journalOpen.toggle() }
                        .buttonStyle(.vznOutline).fixedSize()
                        .help(apps.journals.first(where: \.canUndo).map {
                            store.text("appUndoLatestHint").replacingOccurrences(of: "{name}", with: $0.appName)
                        } ?? "")
                        .popover(isPresented: $journalOpen) { journal }
                }
                if let error = apps.error, Self.persistentError(error) {
                    NoticeBand(role: "danger", edge: false) {
                        Image(systemName: "exclamationmark.triangle").foregroundStyle(contentColor("danger", scheme)).accessibilityHidden(true)
                        Text(store.text(error)).foregroundStyle(contentColor("text-strong", scheme)).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                    }
                }
                if !apps.scanIssues.isEmpty { scanWarning }
                HStack(alignment: .top, spacing: metric("gutter")) {
                    if wide || (apps.plan == nil && focused == nil) {
                        VStack(alignment: .leading, spacing: metric("small")) {
                            HStack(spacing: metric("small")) {
                                SearchBox(query: $query, label: store.text("searchLabel"), autofocus: false)
                                Button { Task { await apps.refresh() } } label: { Image(systemName: "arrow.clockwise") }
                                    .buttonStyle(.vznOutline).controlSize(.large).disabled(apps.busy).help(store.text("refresh")).accessibilityLabel(store.text("refresh"))
                                if apps.busy { ProgressView().controlSize(.small).accessibilityLabel(store.text("running")) }
                            }
                            inventory
                        }.frame(width: wide ? metric("sidebar") : nil)
                    }
                    if wide || apps.plan != nil || focused != nil {
                        glassDetail(wide: wide).frame(maxWidth: .infinity, alignment: .topLeading)
                    }
                }
                // On the whole board, so a narrow window showing only the detail still takes a dropped app.
                .contentShape(Rectangle())
                .dropDestination(for: URL.self, action: dropApplications) { dropTargeted = $0 }
                .overlay {
                    if dropTargeted && acceptsDrop {
                        RoundedRectangle(cornerRadius: metric("chromeCardRadius"), style: .continuous)
                            .strokeBorder(contentColor("action-text", scheme), lineWidth: metric("hairline") * 2)
                            .allowsHitTesting(false).accessibilityHidden(true)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
            .padding(.horizontal, wide ? metric("large") : metric("inset"))
            .padding(.vertical, verticalInset)
        }
        .task { if apps.applications.isEmpty { await apps.refresh() }; if focused == nil { focused = filtered.first?.id } }
        .onChange(of: query) { _, _ in if apps.plan == nil, !filtered.contains(where: { $0.id == focused }) { focused = filtered.first?.id } }
        .background {
            ApplicationUndoShortcut {
                guard acceptsShortcuts, let id = apps.latestUndoableJournalID else { return false }
                undo(id)
                return true
            }
        }
        .disabled(confirming)
        .accessibilityHidden(confirming)
        .overlay {
            if let issue = issueToTrash {
                BlockingDialog(title: issueTitle(issue), onCancel: { issueToTrash = nil }) {
                    Text(issueTitle(issue)).font(.vzn("subtitleScale", .semibold)).foregroundStyle(contentColor("text-strong", scheme)).fixedSize(horizontal: false, vertical: true).accessibilityAddTraits(.isHeader)
                    issuePath(issue)
                    Text(issueScope(issue)).font(.system(size: NSFont.systemFontSize)).foregroundStyle(contentColor("text-muted", scheme)).fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: metric("small")) {
                        Spacer(minLength: 0)
                        Button(store.text("cancel")) { issueToTrash = nil }
                            .buttonStyle(.vznOutline).focused($issueCancelFocused).keyboardShortcut(.cancelAction)
                        Button(store.text("appTrashIssue"), role: .destructive) { issueToTrash = nil; trash(issue) }
                            .buttonStyle(DangerSolidStyle()).disabled(apps.busy)
                    }.padding(.top, metric("tight"))
                }.onAppear { issueCancelFocused = true }
            } else if confirmation, let plan = apps.plan {
                // Apps-States: the dialog lists the chosen paths in mono before the solid danger action.
                BlockingDialog(title: store.text("appConfirm"), onCancel: { confirmation = false }) {
                    Text(store.text("appConfirm")).font(.vzn("subtitleScale", .semibold)).foregroundStyle(contentColor("text-strong", scheme)).lineLimit(2).accessibilityAddTraits(.isHeader)
                    Text(store.text("appScopeHint")).font(.system(size: NSFont.systemFontSize)).foregroundStyle(contentColor("text-muted", scheme)).fixedSize(horizontal: false, vertical: true)
                    let personalDataCount = plan.personalDataCount(selected: selected)
                    if personalDataCount > 0 {
                        NoticeBand(role: "warning", edge: false) {
                            Image(systemName: "exclamationmark.triangle").foregroundStyle(contentColor("warning", scheme)).accessibilityHidden(true)
                            Text(counted("appConfirmPersonalData", personalDataCount))
                                .foregroundStyle(contentColor("text-strong", scheme)).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    if plan.items.contains(where: { $0.requiresFinder && selected.contains($0.id) }) {
                        NoticeBand(role: "text-muted", edge: false) {
                            Image(systemName: "key.horizontal").foregroundStyle(contentColor("text-muted", scheme)).accessibilityHidden(true)
                            Text(store.text("appConfirmAuthentication"))
                                .foregroundStyle(contentColor("text-strong", scheme)).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    let paths = plan.items.filter { selected.contains($0.id) }.map { shortPath($0.path) }
                    let selectedPaths = VStack(alignment: .leading, spacing: metric("tight")) {
                        ForEach(paths, id: \.self) { path in
                            Text(verbatim: path).font(.system(size: NSFont.systemFontSize * metric("smallScale"), design: .monospaced)).foregroundStyle(contentColor("text-muted", scheme)).fixedSize(horizontal: false, vertical: true)
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                    ViewThatFits(in: .vertical) {
                        selectedPaths.fixedSize(horizontal: false, vertical: true)
                        ScrollView { selectedPaths }
                    }.frame(maxHeight: metric("editor"), alignment: .topLeading)
                        .padding(.top, metric("tight"))
                    HStack(spacing: metric("small")) {
                        Spacer(minLength: 0)
                        Button(store.text("cancel")) { confirmation = false }
                            .buttonStyle(.vznOutline).focused($planCancelFocused).keyboardShortcut(.cancelAction).accessibilityIdentifier("confirm-cancel")
                        Button(store.text(reset ? "appReset" : "appUninstall"), role: .destructive) { confirmation = false; apply(plan) }.buttonStyle(DangerSolidStyle()).fixedSize().accessibilityIdentifier("confirm-destructive")
                    }.padding(.top, metric("tight"))
                }.onAppear { planCancelFocused = true }
            }
        }
    }
    @ViewBuilder private func glassDetail(wide: Bool) -> some View {
        if let app = apps.plan?.app ?? apps.applications.first(where: { $0.id == focused }) {
            VStack(alignment: .leading, spacing: metric("inset")) {
                adaptiveRow {
                    HStack(spacing: metric("gap")) {
                        Image(nsImage: NSWorkspace.shared.icon(forFile: app.path)).resizable().frame(width: metric("navControl") + metric("small"), height: metric("navControl") + metric("small")).accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: metric("tight")) {
                            Text(app.name).font(.vzn("titleScale", .semibold))
                            Text(verbatim: shortPath(app.path) + " · " + app.version).font(.system(size: NSFont.systemFontSize * metric("smallScale"), design: .monospaced))
                                .foregroundStyle(contentColor("text-muted", scheme)).textSelection(.enabled).help(app.bundleID)
                        }.fixedSize(horizontal: false, vertical: true)
                        if let blocked = app.blocked { Image(systemName: "lock").foregroundStyle(contentColor("text-muted", scheme)).help(blockedReason(blocked)).accessibilityHidden(true) }
                    }
                } actions: {
                    HStack(spacing: metric("gap")) {
                        Button(store.text("previewChanges")) { inspect(app) }
                            .buttonStyle(.vznOutline).disabled(apps.busy || app.blocked != nil)
                        Button(store.text("resetData"), role: .destructive) { Task { await apps.inspect(app.id); reset = true; selected = Set(apps.plan?.items.filter { $0.selected && $0.kind != "bundle" }.map(\.id) ?? []); quit = false } }
                            .buttonStyle(.vznOutline).disabled(apps.busy || app.blocked != nil)
                        if !wide { Button { focused = nil; apps.dismissPlan() } label: { Image(systemName: "xmark") }.buttonStyle(.vznQuiet).accessibilityLabel(store.text("close")) }
                    }.fixedSize()
                }
                if let blocked = app.blocked {
                    // Apps-States: a locked app explains why in a warm card where the plan would be.
                    HStack(alignment: .firstTextBaseline, spacing: metric("small") + metric("hairline") * 2) {
                        Image(systemName: "lock").foregroundStyle(contentColor("warning", scheme)).accessibilityHidden(true)
                        Text(blockedReason(blocked)).font(.system(size: NSFont.systemFontSize)).foregroundStyle(contentColor("text-strong", scheme)).fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }.padding(metric("inset") + metric("tight")).frame(maxWidth: .infinity, alignment: .leading)
                        .cardSurface(padded: false)
                        .overlay(RoundedRectangle(cornerRadius: metric("chromeCardRadius"), style: .continuous).strokeBorder(contentColor("warning", scheme).opacity(metric("selectionOpacity") * 3), lineWidth: metric("hairline")))
                }
                if let plan = apps.plan { planCard(plan) } else { Spacer(minLength: 0) }
            }
        } else {
            GlassEmptyState(symbol: "macwindow", tone: "text-muted", title: store.text("apps"), hint: store.text("appsSubtitle")).frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
    // The reviewable plan: grouped checkbox rows (path mono, evidence, size, Reveal), then the summary foot.
    private func planCard(_ plan: ApplicationPlan) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: metric("small")) {
                Text(store.text("appPlanTitle").replacingOccurrences(of: "{name}", with: plan.app.name)).font(.system(size: NSFont.systemFontSize, weight: .semibold)).lineLimit(1)
                Spacer(minLength: metric("small"))
                Toggle(store.text("appReset"), isOn: $reset).toggleStyle(.switch).controlSize(.small).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme))
                    .disabled(apps.busy).onChange(of: reset) { _, value in if value { for item in plan.items where item.uninstallOnly { selected.remove(item.id) } } }
                Button { apps.dismissPlan() } label: { Image(systemName: "xmark") }.buttonStyle(.vznQuiet).disabled(apps.busy).help(store.text("close")).accessibilityLabel(store.text("close"))
            }.padding(.horizontal, metric("inset")).frame(minHeight: metric("navControl") + metric("small"))
            if plan.incomplete {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline, spacing: metric("small")) { incompleteNotice(plan) }
                    VStack(alignment: .leading, spacing: metric("tight")) { incompleteNotice(plan) }
                }.padding(.horizontal, metric("inset")).padding(.bottom, metric("small"))
            }
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(["bundle", "preferences", "data"], id: \.self) { kind in
                        let items = plan.items.filter { $0.kind == kind }
                        if !items.isEmpty {
                            CardDivider()
                            Eyebrow(text: store.text("appKind_" + kind)).padding(.horizontal, metric("inset")).frame(height: metric("gutter") + metric("tight"), alignment: .center)
                            ForEach(items) { item in
                                CardDivider()
                                planItemRow(item, selection: $selected)
                            }
                        }
                    }
                }
            }
            CardDivider()
            planFooter(plan)
        }.cardSurface(padded: false)
    }

    func planItemRow(_ item: ApplicationDataItem, selection: Binding<Set<String>>) -> some View {
        let note = item.uninstallOnly && item.kind != "bundle"
            ? store.text(reset ? "appSystemUninstallOnly" : "appNote_authentication")
            : item.note.map { store.text("appNote_" + $0) }
        let detail = item.blocked.map { store.text($0) }
            ?? [store.text("appEvidence_" + item.evidence), note].compactMap { $0 }.joined(separator: " · ")
        return adaptiveRow {
            Toggle(isOn: Binding(get: { selection.wrappedValue.contains(item.id) }, set: { checked in
                if checked { selection.wrappedValue.insert(item.id) } else { selection.wrappedValue.remove(item.id) }
            })) {
                VStack(alignment: .leading, spacing: metric("hairline") * 2) {
                    Text(verbatim: shortPath(item.path))
                        .font(.system(size: NSFont.systemFontSize, design: .monospaced))
                        .fixedSize(horizontal: false, vertical: true).textSelection(.enabled).help(item.path)
                    Text(detail)
                        .font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme))
                }
            }.toggleStyle(.checkbox)
                .accessibilityLabel(Text(verbatim: shortPath(item.path) + ", " + detail))
                .disabled(apps.busy || item.blocked != nil || (reset && item.uninstallOnly))
                .frame(idealWidth: metric("sidebar"), maxWidth: .infinity, alignment: .leading)
        } actions: {
            HStack(spacing: metric("gap")) {
                Text(item.bytes.map { ByteCountFormatter.string(fromByteCount: $0, countStyle: .file) } ?? store.text("notMeasured"))
                    .font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).monospacedDigit()
                let quickLook = store.text("appQuickLookPath").replacingOccurrences(of: "{path}", with: shortPath(item.path))
                Button { previewURL = URL(fileURLWithPath: item.path) } label: { Image(systemName: "eye") }
                    .buttonStyle(.vznQuiet).controlSize(.small).disabled(item.bytes == nil).help(quickLook).accessibilityLabel(quickLook)
                Button(store.text("reveal")) { apps.reveal(item.id) }
                    .buttonStyle(.plain).font(.vzn("smallScale", .medium)).foregroundStyle(contentColor("action-text", scheme))
            }.fixedSize().disabled(apps.busy)
        }
        .padding(.horizontal, metric("inset")).padding(.vertical, metric("tight"))
        .frame(minHeight: metric("navControl") + metric("tight"))
    }

    func planFooter(_ plan: ApplicationPlan) -> some View {
        let bytes = plan.items.filter { selected.contains($0.id) }.compactMap(\.bytes).reduce(0, +)
        return adaptiveRow {
            HStack(spacing: metric("gap")) {
                Text(store.text("appSelectedSummary").replacingOccurrences(of: "{count}", with: String(selected.count)).replacingOccurrences(of: "{size}", with: ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)))
                    .font(.vzn("smallScale", .semibold)).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: metric("small"))
                Toggle(isOn: $quit) {
                    Text(store.text("appQuit")).lineLimit(nil).fixedSize(horizontal: false, vertical: true)
                }.toggleStyle(.switch).controlSize(.small).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).disabled(apps.busy)
            }
        } actions: {
            Button(store.text(reset ? "appReset" : "appUninstall"), role: .destructive) { confirmation = true }
                .buttonStyle(DangerSolidStyle()).fixedSize()
                .disabled(apps.busy || selected.isEmpty || plan.app.blocked != nil)
        }.padding(.horizontal, metric("inset")).padding(.vertical, metric("gap"))
    }
    private func counted(_ key: String, _ count: Int) -> String { store.text(key).replacingOccurrences(of: "{count}", with: String(count)) }
    private func blockedReason(_ code: String) -> String { code == "appIncomplete" ? counted("appBlockedInventory", apps.blockingIssueCount) : store.text(code) }
    private func issueScope(_ issue: ApplicationScanIssue) -> String {
        store.text(issue.reason == .brokenLink ? "appTrashLinkScope" : "appTrashIssueScope")
    }
    private func issueTitle(_ issue: ApplicationScanIssue) -> String {
        store.text("appTrashIssueConfirm").replacingOccurrences(of: "{name}", with: URL(fileURLWithPath: issue.path).lastPathComponent)
    }
    private func issuePath(_ issue: ApplicationScanIssue) -> some View {
        Text(verbatim: issue.path).font(.system(size: NSFont.systemFontSize, design: .monospaced))
            .fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
    }
    private func trash(_ issue: ApplicationScanIssue) {
        Task {
            let previous = apps.journals.first?.id
            await apps.trashIssue(issue.id)
            if apps.error == nil, let journal = apps.journals.first, journal.id != previous,
               journal.items.first?.path == issue.path, journal.items.first?.status == "trashed" {
                announce(journal.id)
            }
            reportError()
        }
    }
    private var scanWarning: some View {
        let issues = apps.scanIssues
        let blockingCount = apps.blockingIssueCount
        return VStack(alignment: .leading, spacing: 0) {
            scanWarningHeader(blocking: blockingCount > 0, count: blockingCount > 0 ? blockingCount : issues.count)
                .padding(.horizontal, metric("inset")).padding(.vertical, metric("small"))
            CardDivider()
            VStack(alignment: .leading, spacing: metric("small")) {
                ForEach(issues.prefix(3)) { issue in scanIssueRow(issue) }
                if issues.count > 3 { Text(counted("appScanMore", max(issues.count, blockingCount) - 3)).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)) }
            }.padding(.horizontal, metric("inset")).padding(.vertical, metric("small"))
        }.cardSurface(padded: false).overlay {
            if blockingCount > 0 { RoundedRectangle(cornerRadius: metric("chromeCardRadius"), style: .continuous).strokeBorder(contentColor("warning", scheme).opacity(metric("selectionOpacity") * 3), lineWidth: metric("hairline")) }
        }
    }
    func scanWarningHeader(blocking: Bool, count: Int) -> some View {
        adaptiveRow(alignment: .top) {
            VStack(alignment: .leading, spacing: metric("tight")) {
                Label {
                    Text(counted(blocking ? "appScanIncompleteTitle" : "appScanLeftoverTitle", count))
                        .foregroundStyle(contentColor("text-strong", scheme))
                } icon: { Image(systemName: blocking ? "exclamationmark.triangle" : "info.circle").foregroundStyle(contentColor(blocking ? "warning" : "text-muted", scheme)).accessibilityHidden(true) }
                .font(.vzn("subtitleScale", .semibold)).accessibilityAddTraits(.isHeader)
                if blocking {
                    Text(store.text("appScanIncompleteReason"))
                    Text(store.text("appScanIncompleteNext"))
                } else { Text(store.text("appScanLeftoverHint")) }
            }.font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).fixedSize(horizontal: false, vertical: true)
        } actions: {
            let buttons = Group {
                if apps.scanIssues.contains(where: { $0.reason == .unreadable }) {
                    fullDiskAccessButton.fixedSize()
                }
                Button(store.text("appRescan")) { Task { await apps.refresh() } }.fixedSize().disabled(apps.busy)
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: metric("gap")) { buttons }
                VStack(alignment: .trailing, spacing: metric("tight")) { buttons }
            }.buttonStyle(.vznOutline)
        }
    }
    @ViewBuilder private func incompleteNotice(_ plan: ApplicationPlan) -> some View {
        Text(store.text("appIncomplete")).font(.vzn("smallScale")).foregroundStyle(contentColor("warning", scheme)).fixedSize(horizontal: false, vertical: true)
        if !plan.unreadable.isEmpty {
            Spacer(minLength: 0)
            fullDiskAccessButton.buttonStyle(.vznOutline).controlSize(.small).fixedSize()
                .help(plan.unreadable.map(shortPath).joined(separator: "\n"))
        }
    }
    /// Opens the system pane only; Viezan never requests the permission itself.
    private var fullDiskAccessButton: some View {
        Button(store.text("appOpenFullDiskAccess"), systemImage: "lock.shield") {
            if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles") {
                NSWorkspace.shared.open(url)
            }
        }
    }
    func scanIssueRow(_ issue: ApplicationScanIssue) -> some View {
        let reveal = store.text("reveal")
        let move = store.text("appTrashIssue")
        let canTrash = issue.canTrash
        return adaptiveRow {
            VStack(alignment: .leading, spacing: metric("hairline") * 2) {
                Text(shortPath(issue.path)).font(.system(size: NSFont.systemFontSize, design: .monospaced))
                    .lineLimit(1).truncationMode(.middle).textSelection(.enabled).help(issue.path)
                    // Measure a readable path column for fit, then use all the space the row offers.
                    .frame(idealWidth: metric("sidebar"), alignment: .leading)
                Text(store.text("appScanIssue_" + issue.reason.rawValue)).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).fixedSize(horizontal: false, vertical: true)
            }
        } actions: {
            HStack(spacing: metric("gap")) {
                Button { apps.revealIssue(issue.id) } label: {
                    ZStack {
                        if canTrash { Text(move).hidden() }
                        Text(reveal)
                    }
                }
                .accessibilityLabel(store.text("appRevealPath").replacingOccurrences(of: "{path}", with: issue.path))
                if canTrash {
                    Button(role: .destructive) { issueToTrash = issue } label: {
                        ZStack {
                            Text(reveal).hidden()
                            Text(move)
                        }
                    }
                    .disabled(apps.busy)
                    .accessibilityLabel(store.text("appTrashIssuePath").replacingOccurrences(of: "{path}", with: issue.path))
                }
            }.buttonStyle(.vznQuiet).fixedSize()
        }
    }
    private func adaptiveRow<Details: View, Actions: View>(
        alignment: VerticalAlignment = .center, @ViewBuilder details: () -> Details, @ViewBuilder actions: () -> Actions
    ) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: alignment, spacing: metric("gap")) {
                details().layoutPriority(1)
                Spacer(minLength: 0)
                actions()
            }
            VStack(alignment: .leading, spacing: metric("tight")) {
                details()
                actions().frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
    }
    /// Paths under the home folder read as ~/…
    private func shortPath(_ path: String) -> String {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return path.hasPrefix(home + "/") ? "~" + path.dropFirst(home.count) : path
    }
    private var journal: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: metric("small")) {
                Text(store.text("appActionHistory")).font(.vzn("labelScale", .semibold))
                if apps.journals.isEmpty { Text(store.text("noHistory")).foregroundStyle(.secondary) }
                ForEach(apps.journals) { journal in
                    HStack {
                        // Apps journal: the app, when, and how much was moved.
                        VStack(alignment: .leading, spacing: metric("hairline")) {
                            Text(journal.appName).fontWeight(.medium)
                            Text(([relativeTime(journal.created, store: store)] + (journal.movedBytes > 0 ? [ByteCountFormatter.string(fromByteCount: journal.movedBytes, countStyle: .file)] : [])).joined(separator: " · "))
                                .font(.vzn("captionScale")).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text("\(journal.items.filter { ["trashed", "preferencesRemoved"].contains($0.status) }.count) / \(journal.items.count)").monospacedDigit()
                        Button(store.text("appRestore")) { undo(journal.id) }.disabled(apps.busy || !journal.canUndo)
                    }
                    ForEach(journal.items) { item in
                        Text([shortPath(item.path), store.text("app_" + item.status), ByteCountFormatter.string(fromByteCount: item.bytes, countStyle: .file)].joined(separator: " · "))
                            .font(.vzn("captionScale")).foregroundStyle(.secondary).textSelection(.enabled)
                        if item.issue == "appRestoreInFinder" || item.issue == "appPutBackItem" || item.status == "restoring" {
                            if let issue = item.issue, ["appRestoreInFinder", "appPutBackItem"].contains(issue) {
                                Text(store.text(issue)).font(.vzn("captionScale"))
                            }
                            Button(store.text("reveal")) {
                                Task { await apps.revealRestoreItem(item.id); reportError() }
                            }.disabled(apps.busy)
                        }
                    }
                    Divider()
                }
            }.padding(metric("inset"))
        }.frame(width: metric("sidebar") + metric("editor"), height: metric("editor") * 2)
    }
    private func inspect(_ app: InstalledApplication) {
        Task {
            await apps.inspect(app.id)
            guard let plan = apps.plan, plan.app.id == app.id else { return }
            selected = Set(plan.items.filter(\.selected).map(\.id))
            reset = false
            quit = false
        }
    }
    private func select(_ app: InstalledApplication) {
        // Clicking the row whose plan is already open keeps the person's ticks.
        guard !(focused == app.id && apps.plan?.app.id == app.id) else { return }
        focused = app.id
        if let plan = apps.plan, plan.app.id != app.id { apps.dismissPlan() }
        if app.blocked == nil { inspect(app) }
    }
    private func dropApplications(_ urls: [URL], at _: CGPoint) -> Bool {
        guard acceptsDrop, let url = urls.first(where: { $0.isFileURL && $0.pathExtension.lowercased() == "app" }) else { return false }
        guard let app = apps.application(forDroppedPath: url.path) else {
            let message = store.text("appDropNotInInventory").replacingOccurrences(of: "{name}", with: url.lastPathComponent)
            ToastCenter.shared.show(message, key: "apps-drop", level: .warning)
            return false
        }
        if !filtered.contains(where: { $0.id == app.id }) { query = "" }
        select(app)
        return true
    }
    private var inventory: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: metric("tight")) {
                ForEach(filtered) { app in
                    Button { select(app) } label: {
                        HStack(spacing: metric("gap")) {
                            Image(nsImage: NSWorkspace.shared.icon(forFile: app.path)).resizable().frame(width: metric("gutter") + metric("small"), height: metric("gutter") + metric("small")).accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: metric("tight")) {
                                Text(app.name).fontWeight(.medium).lineLimit(1)
                                Text(app.version).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(1)
                            }
                            Spacer(minLength: 0)
                            if let blocked = app.blocked { Image(systemName: "lock").foregroundStyle(.secondary).help(blockedReason(blocked)).accessibilityLabel(blockedReason(blocked)) }
                        }.padding(metric("small")).frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
                            .background {
                                if focused == app.id {
                                    GlassLens(radius: metric("radius"))
                                }
                            }
                    }.buttonStyle(.plain).disabled(apps.busy).accessibilityAddTraits(focused == app.id ? .isSelected : []).help(app.path)
                }
            }.padding(0)
        }.scrollIndicators(.hidden).overlay(alignment: .top) {
            if filtered.isEmpty && !apps.busy {
                GlassEmptyState(symbol: "square.grid.2x2", tone: "text-muted", title: store.text("appsEmpty"), hint: store.text("appsEmptyHint"))
                    .padding(.top, metric("large") * 2)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(store.text("appsTitle"))
        .accessibilityHint(store.text("appDropHint"))
    }
}

/// Returning the original event leaves the Edit menu and the native field editor in charge of text undo.
private struct ApplicationUndoShortcut: NSViewRepresentable {
    let perform: () -> Bool

    final class ShortcutView: NSView {
        var perform: (() -> Bool)?
        var monitor: Any?
    }

    func makeNSView(context: Context) -> ShortcutView {
        let view = ShortcutView()
        view.monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak view] event in
            guard let view, !view.isHiddenOrHasHiddenAncestor, let window = view.window, event.window === window, window.isKeyWindow,
                  window.attachedSheet == nil, !(window.firstResponder is NSText),
                  !event.isARepeat, event.charactersIgnoringModifiers?.lowercased() == "z",
                  event.modifierFlags.intersection([.command, .shift, .option, .control]) == .command,
                  view.perform?() == true else { return event }
            return nil
        }
        return view
    }

    func updateNSView(_ view: ShortcutView, context: Context) {
        view.perform = context.environment.isEnabled ? perform : nil
    }

    static func dismantleNSView(_ view: ShortcutView, coordinator: ()) {
        if let monitor = view.monitor { NSEvent.removeMonitor(monitor) }
    }
}

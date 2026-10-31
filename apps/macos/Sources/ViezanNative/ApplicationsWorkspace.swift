import SwiftUI
import ViezanDomain

struct ApplicationsWorkspace: View {
    let store: WorkbenchStore
    @State private var query = ""
    @State private var selected = Set<String>()
    @State private var reset = false
    @State private var quit = false
    @State private var confirmation = false
    private var apps: Applications { store.applications }
    private var filtered: [InstalledApplication] { apps.applications.filter { query.isEmpty || $0.name.localizedStandardContains(query) || $0.bundleID.localizedStandardContains(query) } }
    @State private var focused: String?
    @State private var journalOpen = false
    @State private var wideLayout = true
    /// The last action's journal, shown with its result and an Undo right where it happened.
    @State private var outcome: (journal: String, undone: Bool)?
    var body: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            PageIntro(title: store.text("appsTitle"), subtitle: store.text("appsSubtitle"))
            HStack(spacing: metric("small")) {
                HStack(spacing: metric("small")) {
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary).accessibilityHidden(true)
                    TextField(store.text("searchLabel"), text: $query).textFieldStyle(.plain)
                }.padding(.horizontal, metric("gap")).frame(maxWidth: metric("sidebar") + metric("large"), minHeight: metric("control"))
                    .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: metric("controlRadius")))
                    .overlay(RoundedRectangle(cornerRadius: metric("controlRadius")).strokeBorder(Color(nsColor: .separatorColor), lineWidth: metric("hairline")))
                Button { Task { await apps.refresh() } } label: { Image(systemName: "arrow.clockwise") }
                    .buttonStyle(.vznQuiet).disabled(apps.busy).help(store.text("refresh")).accessibilityLabel(store.text("refresh"))
                if apps.busy { ProgressView().controlSize(.small).accessibilityLabel(store.text("running")) }
                Spacer(minLength: metric("small"))
                Button(store.text("journalUndo"), systemImage: "clock.arrow.circlepath") { journalOpen.toggle() }
                    .buttonStyle(.vznQuiet).tint(.primary)
                    .popover(isPresented: $journalOpen) { journal }
            }
            if let error = apps.error { Label(store.text(error), systemImage: "exclamationmark.triangle").foregroundStyle(Color(nsColor: .systemRed)).textSelection(.enabled) }
            if let outcome, let journal = apps.journals.first(where: { $0.id == outcome.journal }) { result(journal, undone: outcome.undone) }
            GeometryReader { geometry in
                let wide = geometry.size.width >= metric("reading")
                let _ = DispatchQueue.main.async { if wideLayout != wide { wideLayout = wide } }
                HStack(alignment: .top, spacing: metric("inset")) {
                    if wide || (apps.plan == nil && focused == nil) {
                        inventory.frame(maxWidth: wide ? geometry.size.width * 0.45 : .infinity).cardSurface(padded: false)
                    }
                    if wide || apps.plan != nil || focused != nil {
                        detail.frame(maxWidth: .infinity, alignment: .topLeading).cardSurface()
                    }
                }
            }
        }.padding(.horizontal, metric("large") + metric("gap")).padding(.vertical, metric("gutter"))
        .task { if apps.applications.isEmpty { await apps.refresh() }; if focused == nil { focused = filtered.first?.id } }
        // The details follow the search: an app filtered out of the list is not left open beside it.
        .onChange(of: query) { _, _ in if apps.plan == nil, !filtered.contains(where: { $0.id == focused }) { focused = filtered.first?.id } }
        .confirmationDialog(store.text("appConfirm"), isPresented: $confirmation) {
            if let plan = apps.plan {
                Button(store.text(reset ? "appReset" : "appUninstall"), role: .destructive) {
                    Task { await apps.apply(planID: plan.id, itemIDs: selected, reset: reset, quit: quit); if let id = apps.journals.first?.id, apps.plan == nil { outcome = (id, false) } }
                }
            }
            Button(store.text("cancel"), role: .cancel) {}
        } message: { Text(store.text("appScopeHint")) }
    }
    private func result(_ journal: ApplicationJournal, undone: Bool) -> some View {
        let done = journal.items.filter { ["trashed", "preferencesRemoved"].contains($0.status) }.count
        let restored = journal.items.filter { $0.status == "restored" }.count
        let key = undone ? "appRestoredCount" : journal.action == "reset" ? "appResetCount" : "appTrashedCount"
        return HStack(spacing: metric("gap")) {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(Color(nsColor: .systemGreen)).accessibilityHidden(true)
            Text(store.text(key).replacingOccurrences(of: "{count}", with: String(undone ? restored : done)))
            Spacer()
            if !undone && done > 0 {
                Button(store.text("appUndo")) { Task { await apps.undo(journal.id); if apps.error == nil { outcome = (journal.id, true) } } }
                    .buttonStyle(.vznOutline).disabled(apps.busy)
            }
            Button { outcome = nil } label: { Image(systemName: "xmark") }.buttonStyle(.vznQuiet)
                .help(store.text("close")).accessibilityLabel(store.text("close"))
        }
        .padding(.horizontal, metric("inset")).padding(.vertical, metric("small"))
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: metric("radius")))
        .accessibilityElement(children: .contain)
    }
    /// Paths under the home folder read as ~/…
    private func shortPath(_ path: String) -> String {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return path.hasPrefix(home + "/") ? "~" + path.dropFirst(home.count) : path
    }
    private var journal: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: metric("small")) {
                Text(store.text("appActionHistory")).font(.headline)
                if apps.journals.isEmpty { Text(store.text("noHistory")).foregroundStyle(.secondary) }
                ForEach(apps.journals) { journal in
                    HStack {
                        Text(journal.appName).fontWeight(.medium)
                        Spacer()
                        Text("\(journal.items.filter { ["trashed", "preferencesRemoved"].contains($0.status) }.count) / \(journal.items.count)").monospacedDigit()
                        Button(store.text("appRestore")) { Task { await apps.undo(journal.id) } }.disabled(apps.busy || !journal.items.contains { ["trashed", "preferencesRemoved", "preferencesBackedUp"].contains($0.status) || ($0.status == "failed" && $0.preferenceBackup != nil) })
                    }
                    ForEach(journal.items) { item in Text(shortPath(item.path) + " · " + store.text("app_" + item.status)).font(.caption).foregroundStyle(.secondary).textSelection(.enabled) }
                    Divider()
                }
            }.padding(metric("inset"))
        }.frame(width: metric("sidebar") + metric("editor"), height: metric("editor") * 2)
    }
    private var inventory: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: metric("tight")) {
                ForEach(filtered) { app in
                    Button { focused = app.id; if apps.plan?.app.id != app.id && apps.plan != nil { apps.dismissPlan() } } label: {
                        HStack(spacing: metric("gap")) {
                            Image(nsImage: NSWorkspace.shared.icon(forFile: app.path)).resizable().frame(width: metric("gutter") + metric("small"), height: metric("gutter") + metric("small")).accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: metric("tight")) {
                                Text(app.name).fontWeight(.medium).lineLimit(1)
                                Text(app.version).font(.callout).foregroundStyle(.secondary).lineLimit(1)
                            }
                            Spacer(minLength: 0)
                            if app.blocked != nil { Image(systemName: "lock").foregroundStyle(.secondary).help(store.text(app.blocked ?? "")) }
                        }.padding(metric("small")).frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
                            .background(focused == app.id ? Color.accentColor.opacity(metric("selectionOpacity")) : Color.clear, in: RoundedRectangle(cornerRadius: metric("radius")))
                    }.buttonStyle(.plain).accessibilityAddTraits(focused == app.id ? .isSelected : []).help(app.path)
                }
            }.padding(metric("small"))
        }.overlay {
            if filtered.isEmpty && !apps.busy { ContentUnavailableView(store.text("appsEmpty"), systemImage: "magnifyingglass", description: Text(store.text("appsEmptyHint"))) }
        }
    }
    // Selected application summary; inspection builds the reviewable change plan.
    @ViewBuilder private var detail: some View {
        if apps.plan != nil { planDetails }
        else if let app = apps.applications.first(where: { $0.id == focused }) {
            VStack(alignment: .leading, spacing: metric("inset")) {
                Image(nsImage: NSWorkspace.shared.icon(forFile: app.path)).resizable().frame(width: metric("large") + metric("small"), height: metric("large") + metric("small")).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: metric("tight")) {
                    Text(app.name).font(.title2).fontWeight(.semibold)
                    Text(app.bundleID).foregroundStyle(.secondary).textSelection(.enabled)
                }
                CardRow(title: store.text("apps"), detail: shortPath(app.path)) { Text(app.version).foregroundStyle(.secondary) }
                if let blocked = app.blocked { CardRow(title: store.text(blocked), divider: false) { Image(systemName: "lock").accessibilityHidden(true) } }
                HStack(spacing: metric("small")) {
                    Button(store.text("previewChanges")) { Task { await apps.inspect(app.id); selected = Set(apps.plan?.items.filter(\.selected).map(\.id) ?? []); reset = false; quit = false } }
                        .buttonStyle(.vznPrimary).disabled(apps.busy || app.blocked != nil)
                    Button(store.text("resetData"), role: .destructive) { Task { await apps.inspect(app.id); reset = true; selected = Set(apps.plan?.items.filter { $0.selected && $0.kind != "bundle" }.map(\.id) ?? []); quit = false } }
                        .buttonStyle(.vznOutline).disabled(apps.busy || app.blocked != nil)
                    if !wideLayout { Button(store.text("close")) { focused = nil } }

                }
                Spacer(minLength: 0)
            }
        } else {
            ContentUnavailableView(store.text("apps"), systemImage: "macwindow", description: Text(store.text("appsSubtitle"))).frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
    @ViewBuilder private var planDetails: some View {
        if let plan = apps.plan {
            VStack(alignment: .leading, spacing: metric("inset")) {
                HStack { Text(plan.app.name).font(.headline); Spacer(); Button(store.text("close")) { apps.dismissPlan() }.disabled(apps.busy) }
                if plan.incomplete { Text(store.text("appIncomplete")) }
                Toggle(store.text("appReset"), isOn: $reset).disabled(apps.busy).onChange(of: reset) { _, value in if value { for item in plan.items where item.kind == "bundle" { selected.remove(item.id) } } }
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: metric("small")) {
                        ForEach(plan.items) { item in
                            HStack {
                                Toggle(isOn: Binding(get: { selected.contains(item.id) }, set: { if $0 { selected.insert(item.id) } else { selected.remove(item.id) } })) {
                                    VStack(alignment: .leading) {
                                        Text(shortPath(item.path)).textSelection(.enabled).help(item.path)
                                        if let blocked = item.blocked { Text(store.text(blocked)).foregroundStyle(.secondary) }
                                        else if let bytes = item.bytes { Text(ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)).foregroundStyle(.secondary) }
                                    }
                                }.disabled(apps.busy || item.blocked != nil || (reset && item.kind == "bundle"))
                                Button(store.text("reveal")) { apps.reveal(item.id) }
                            }
                        }
                    }
                }
                let bytes = plan.items.filter { selected.contains($0.id) }.compactMap(\.bytes).reduce(0, +)
                Text(store.text("appSelectedSummary").replacingOccurrences(of: "{count}", with: String(selected.count)).replacingOccurrences(of: "{size}", with: ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)))
                    .font(.vzn("smallScale")).foregroundStyle(.secondary)
                Toggle(store.text("appQuit"), isOn: $quit).disabled(apps.busy)
                Button(store.text(reset ? "appReset" : "appUninstall"), role: .destructive) { confirmation = true }.disabled(apps.busy || selected.isEmpty || plan.app.blocked != nil)
            }
        }
    }

}

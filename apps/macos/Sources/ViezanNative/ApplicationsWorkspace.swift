import SwiftUI
import ViezanDomain

struct ApplicationsWorkspace: View {
    @Environment(\.colorScheme) private var scheme
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
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    var body: some View {
        if glass { glassBody } else { classicBody }
    }
    private func apply(_ plan: ApplicationPlan) {
        Task { await apps.apply(planID: plan.id, itemIDs: selected, reset: reset, quit: quit); if let id = apps.journals.first?.id, apps.plan == nil { outcome = (id, false) } }
    }
    // Apps board: intro with the journal, a flat searchable list (selection is a lens), the
    // app's head with its two actions, then the plan card ending in the solid danger action.
    private var glassBody: some View {
        VStack(alignment: .leading, spacing: metric("gutter")) {
            PageIntro(title: store.text("appsTitle"), subtitle: store.text("appsSubtitle")) {
                Button(store.text("journalUndo"), systemImage: "clock.arrow.circlepath") { journalOpen.toggle() }
                    .buttonStyle(.vznOutline).fixedSize()
                    .popover(isPresented: $journalOpen) { journal }
            }
            if let error = apps.error {
                NoticeBand(role: "danger", edge: false) {
                    Image(systemName: "exclamationmark.triangle").foregroundStyle(contentColor("danger", scheme)).accessibilityHidden(true)
                    Text(store.text(error)).foregroundStyle(contentColor("text-strong", scheme)).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                }
            }
            if let outcome, let journal = apps.journals.first(where: { $0.id == outcome.journal }) { result(journal, undone: outcome.undone) }
            GeometryReader { geometry in
                let wide = geometry.size.width >= metric("reading")
                let _ = DispatchQueue.main.async { if wideLayout != wide { wideLayout = wide } }
                HStack(alignment: .top, spacing: metric("gutter")) {
                    if wide || (apps.plan == nil && focused == nil) {
                        VStack(alignment: .leading, spacing: metric("small")) {
                            HStack(spacing: metric("small")) {
                                SearchBox(query: $query, label: store.text("searchLabel"), autofocus: false)
                                Button { Task { await apps.refresh() } } label: { Image(systemName: "arrow.clockwise") }
                                    .buttonStyle(.vznOutline).controlSize(.large).disabled(apps.busy).help(store.text("refresh")).accessibilityLabel(store.text("refresh"))
                                if apps.busy { ProgressView().controlSize(.small).accessibilityLabel(store.text("running")) }
                            }
                            if filtered.isEmpty && !apps.busy {
                                // Apps-States: nothing matches — a quiet empty state inside the list column.
                                GlassEmptyState(symbol: "square.grid.2x2", tone: "text-muted", title: store.text("appsEmpty"), hint: store.text("appsEmptyHint"))
                                    .padding(.top, metric("large") * 2)
                                Spacer(minLength: 0)
                            } else { inventory }
                        }.frame(maxWidth: wide ? geometry.size.width * metric("inventorySplit") : .infinity)
                    }
                    if wide || apps.plan != nil || focused != nil {
                        glassDetail.frame(maxWidth: .infinity, alignment: .topLeading)
                    }
                }
            }
        }.padding(.horizontal, metric("large")).padding(.vertical, metric("gutter"))
        .task { if apps.applications.isEmpty { await apps.refresh() }; if focused == nil { focused = filtered.first?.id } }
        .onChange(of: query) { _, _ in if apps.plan == nil, !filtered.contains(where: { $0.id == focused }) { focused = filtered.first?.id } }
        .overlay {
            if confirmation, let plan = apps.plan {
                // Apps-States: the dialog lists the chosen paths in mono before the solid danger action.
                BlockingDialog(title: store.text("appConfirm"), onCancel: { confirmation = false }) {
                    Text(store.text("appConfirm")).font(.vzn("subtitleScale", .semibold)).foregroundStyle(contentColor("text-strong", scheme)).lineLimit(2).accessibilityAddTraits(.isHeader)
                    Text(store.text("appScopeHint")).font(.system(size: NSFont.systemFontSize)).foregroundStyle(contentColor("text-muted", scheme)).fixedSize(horizontal: false, vertical: true)
                    let paths = plan.items.filter { selected.contains($0.id) }.map { shortPath($0.path) }
                    VStack(alignment: .leading, spacing: metric("tight")) {
                        ForEach(Array(paths.prefix(6).enumerated()), id: \.offset) { _, path in
                            Text(path).font(.system(size: NSFont.systemFontSize * metric("smallScale"), design: .monospaced)).foregroundStyle(contentColor("text-muted", scheme)).lineLimit(1).truncationMode(.middle)
                        }
                        if paths.count > 6 { Text("+\(paths.count - 6)").font(.vzn("smallScale")).foregroundStyle(contentColor("text-soft", scheme)) }
                    }.padding(.top, metric("tight")).accessibilityElement(children: .combine)
                    HStack(spacing: metric("small")) {
                        Spacer(minLength: 0)
                        Button(store.text("cancel")) { confirmation = false }.buttonStyle(.vznOutline).keyboardShortcut(.cancelAction).accessibilityIdentifier("confirm-cancel")
                        Button(store.text(reset ? "appReset" : "appUninstall"), role: .destructive) { confirmation = false; apply(plan) }.buttonStyle(DangerSolidStyle()).accessibilityIdentifier("confirm-destructive")
                    }.padding(.top, metric("tight"))
                }
            }
        }
    }
    @ViewBuilder private var glassDetail: some View {
        if let app = apps.plan?.app ?? apps.applications.first(where: { $0.id == focused }) {
            VStack(alignment: .leading, spacing: metric("inset")) {
                HStack(alignment: .center, spacing: metric("gap")) {
                    Image(nsImage: NSWorkspace.shared.icon(forFile: app.path)).resizable().frame(width: metric("navControl") + metric("small"), height: metric("navControl") + metric("small")).accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: metric("tight")) {
                        Text(app.name).font(.vzn("titleScale", .semibold)).lineLimit(1)
                        Text(shortPath(app.path) + " · " + app.version).font(.system(size: NSFont.systemFontSize * metric("smallScale"), design: .monospaced))
                            .foregroundStyle(contentColor("text-muted", scheme)).lineLimit(1).truncationMode(.middle).textSelection(.enabled).help(app.bundleID)
                    }
                    Spacer(minLength: metric("small"))
                    if app.blocked != nil { Image(systemName: "lock").foregroundStyle(contentColor("text-muted", scheme)).help(store.text(app.blocked ?? "")) }
                    Button(store.text("previewChanges")) { Task { await apps.inspect(app.id); selected = Set(apps.plan?.items.filter(\.selected).map(\.id) ?? []); reset = false; quit = false } }
                        .buttonStyle(.vznOutline).fixedSize().disabled(apps.busy || app.blocked != nil)
                    Button(store.text("resetData"), role: .destructive) { Task { await apps.inspect(app.id); reset = true; selected = Set(apps.plan?.items.filter { $0.selected && $0.kind != "bundle" }.map(\.id) ?? []); quit = false } }
                        .buttonStyle(.vznOutline).fixedSize().disabled(apps.busy || app.blocked != nil)
                    if !wideLayout { Button { focused = nil; apps.dismissPlan() } label: { Image(systemName: "xmark") }.buttonStyle(.vznQuiet).accessibilityLabel(store.text("close")) }
                }
                if let blocked = app.blocked {
                    // Apps-States: a locked app explains why in a warm card where the plan would be.
                    HStack(alignment: .firstTextBaseline, spacing: metric("small") + metric("hairline") * 2) {
                        Image(systemName: "lock").foregroundStyle(contentColor("warning", scheme)).accessibilityHidden(true)
                        Text(store.text(blocked)).font(.system(size: NSFont.systemFontSize)).foregroundStyle(contentColor("text-strong", scheme)).fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }.padding(metric("inset") + metric("tight")).frame(maxWidth: .infinity, alignment: .leading)
                        .cardSurface(padded: false)
                        .overlay(RoundedRectangle(cornerRadius: metric("chromeCardRadius"), style: .continuous).strokeBorder(contentColor("warning", scheme).opacity(metric("selectionOpacity") * 3), lineWidth: metric("hairline")))
                }
                if let plan = apps.plan { planCard(plan) }
                Spacer(minLength: 0)
            }
        } else {
            GlassEmptyState(symbol: "macwindow", tone: "text-muted", title: store.text("apps"), hint: store.text("appsSubtitle")).frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
    // The reviewable plan: grouped checkbox rows (path mono, evidence, size, Reveal), then the summary foot.
    private func planCard(_ plan: ApplicationPlan) -> some View {
        let bytes = plan.items.filter { selected.contains($0.id) }.compactMap(\.bytes).reduce(0, +)
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: metric("small")) {
                Text(store.text("appPlanTitle").replacingOccurrences(of: "{name}", with: plan.app.name)).font(.system(size: NSFont.systemFontSize, weight: .semibold)).lineLimit(1)
                Spacer(minLength: metric("small"))
                Toggle(store.text("appReset"), isOn: $reset).toggleStyle(.switch).controlSize(.small).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme))
                    .disabled(apps.busy).onChange(of: reset) { _, value in if value { for item in plan.items where item.kind == "bundle" { selected.remove(item.id) } } }
                Button { apps.dismissPlan() } label: { Image(systemName: "xmark") }.buttonStyle(.vznQuiet).disabled(apps.busy).help(store.text("close")).accessibilityLabel(store.text("close"))
            }.padding(.horizontal, metric("inset")).frame(minHeight: metric("navControl") + metric("small"))
            if plan.incomplete { Text(store.text("appIncomplete")).font(.vzn("smallScale")).foregroundStyle(contentColor("warning", scheme)).padding(.horizontal, metric("inset")).padding(.bottom, metric("small")) }
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(["bundle", "preferences", "data"], id: \.self) { kind in
                        let items = plan.items.filter { $0.kind == kind }
                        if !items.isEmpty {
                            CardDivider()
                            Eyebrow(text: store.text("appKind_" + kind)).padding(.horizontal, metric("inset")).frame(height: metric("gutter") + metric("tight"), alignment: .center)
                            ForEach(items) { item in
                                CardDivider()
                                HStack(spacing: metric("gap")) {
                                    Toggle(isOn: Binding(get: { selected.contains(item.id) }, set: { if $0 { selected.insert(item.id) } else { selected.remove(item.id) } })) {
                                        VStack(alignment: .leading, spacing: metric("hairline") * 2) {
                                            Text(shortPath(item.path)).font(.system(size: NSFont.systemFontSize, design: .monospaced)).lineLimit(1).truncationMode(.middle).textSelection(.enabled).help(item.path)
                                            // Apps board: an unticked personal-data item says why ("dữ liệu cá nhân, giữ mặc định").
                                            Text(item.blocked.map { store.text($0) } ?? ([store.text("appEvidence_" + item.evidence)] + [item.note.map { store.text("appNote_" + $0) }].compactMap { $0 }).joined(separator: " · "))
                                                .font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme))
                                        }
                                    }.toggleStyle(.checkbox).disabled(apps.busy || item.blocked != nil || (reset && item.kind == "bundle"))
                                    Spacer(minLength: metric("small"))
                                    Text(item.bytes.map { ByteCountFormatter.string(fromByteCount: $0, countStyle: .file) } ?? store.text("notMeasured")).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).monospacedDigit()
                                    Button(store.text("reveal")) { apps.reveal(item.id) }.buttonStyle(.plain).font(.vzn("smallScale", .medium)).foregroundStyle(contentColor("action-text", scheme))
                                }.padding(.horizontal, metric("inset")).frame(minHeight: metric("navControl") + metric("tight"))
                            }
                        }
                    }
                }
            }
            CardDivider()
            HStack(spacing: metric("gap")) {
                Text(store.text("appSelectedSummary").replacingOccurrences(of: "{count}", with: String(selected.count)).replacingOccurrences(of: "{size}", with: ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)))
                    .font(.vzn("smallScale", .semibold)).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: metric("small"))
                Toggle(store.text("appQuit"), isOn: $quit).toggleStyle(.switch).controlSize(.small).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).disabled(apps.busy)
                Button(store.text(reset ? "appReset" : "appUninstall"), role: .destructive) { confirmation = true }
                    .buttonStyle(DangerSolidStyle()).disabled(apps.busy || selected.isEmpty || plan.app.blocked != nil)
            }.padding(.horizontal, metric("inset")).padding(.vertical, metric("gap"))
        }.cardSurface(padded: false)
    }
    private var classicBody: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            PageIntro(title: store.text("appsTitle"), subtitle: store.text("appsSubtitle"))
            HStack(spacing: metric("small")) {
                HStack(spacing: metric("small")) {
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary).accessibilityHidden(true)
                    TextField(store.text("searchLabel"), text: $query).textFieldStyle(.plain)
                }.padding(.horizontal, metric("gap")).frame(maxWidth: metric("sidebar") + metric("large"), minHeight: metric("control"))
                    .background(contentColor("surface", scheme), in: RoundedRectangle(cornerRadius: metric("controlRadius")))
                    .overlay(RoundedRectangle(cornerRadius: metric("controlRadius")).strokeBorder(Color(nsColor: .separatorColor), lineWidth: metric("hairline")))
                Button { Task { await apps.refresh() } } label: { Image(systemName: "arrow.clockwise") }
                    .buttonStyle(.vznQuiet).disabled(apps.busy).help(store.text("refresh")).accessibilityLabel(store.text("refresh"))
                if apps.busy { ProgressView().controlSize(.small).accessibilityLabel(store.text("running")) }
                Spacer(minLength: metric("small"))
                Button(store.text("journalUndo"), systemImage: "clock.arrow.circlepath") { journalOpen.toggle() }
                    .buttonStyle(.vznQuiet).tint(.primary)
                    .popover(isPresented: $journalOpen) { journal }
            }
            if let error = apps.error { Label(store.text(error), systemImage: "exclamationmark.triangle").foregroundStyle(contentColor("danger", scheme)).textSelection(.enabled) }
            if let outcome, let journal = apps.journals.first(where: { $0.id == outcome.journal }) { result(journal, undone: outcome.undone) }
            GeometryReader { geometry in
                let wide = geometry.size.width >= metric("reading")
                let _ = DispatchQueue.main.async { if wideLayout != wide { wideLayout = wide } }
                HStack(alignment: .top, spacing: metric("inset")) {
                    if wide || (apps.plan == nil && focused == nil) {
                        inventory.frame(maxWidth: wide ? geometry.size.width * metric("inventorySplit") : .infinity).cardSurface(padded: false)
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
    @ViewBuilder private func result(_ journal: ApplicationJournal, undone: Bool) -> some View {
        let done = journal.items.filter { ["trashed", "preferencesRemoved"].contains($0.status) }.count
        let restored = journal.items.filter { $0.status == "restored" }.count
        let key = undone ? "appRestoredCount" : journal.action == "reset" ? "appResetCount" : "appTrashedCount"
        if glass {
            // Apps-States: a soft success band with Undo and close.
            NoticeBand(role: "success", edge: false) {
                Image(systemName: "checkmark.circle").foregroundStyle(contentColor("success", scheme)).accessibilityHidden(true)
                Text(store.text(key).replacingOccurrences(of: "{count}", with: String(undone ? restored : done))).foregroundStyle(contentColor("text-strong", scheme))
                Spacer(minLength: metric("small"))
                if !undone && done > 0 {
                    Button(store.text("appUndo")) { Task { await apps.undo(journal.id); if apps.error == nil { outcome = (journal.id, true) } } }
                        .buttonStyle(.vznOutline).controlSize(.small).disabled(apps.busy)
                }
                Button { outcome = nil } label: { Image(systemName: "xmark").imageScale(.small) }.buttonStyle(.vznQuiet)
                    .help(store.text("close")).accessibilityLabel(store.text("close"))
            }
        } else {
        HStack(spacing: metric("gap")) {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(contentColor("success", scheme)).accessibilityHidden(true)
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
        .background(contentColor("surface-muted", scheme), in: RoundedRectangle(cornerRadius: metric("radius")))
        .accessibilityElement(children: .contain)
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
                        Button(store.text("appRestore")) { Task { await apps.undo(journal.id) } }.disabled(apps.busy || !journal.items.contains { ["trashed", "preferencesRemoved", "preferencesBackedUp"].contains($0.status) || ($0.status == "failed" && $0.preferenceBackup != nil) })
                    }
                    ForEach(journal.items) { item in Text([shortPath(item.path), store.text("app_" + item.status), ByteCountFormatter.string(fromByteCount: item.bytes, countStyle: .file)].joined(separator: " · ")).font(.vzn("captionScale")).foregroundStyle(.secondary).textSelection(.enabled) }
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
                                Text(app.version).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(1)
                            }
                            Spacer(minLength: 0)
                            if app.blocked != nil { Image(systemName: "lock").foregroundStyle(.secondary).help(store.text(app.blocked ?? "")) }
                        }.padding(metric("small")).frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
                            .background {
                                if focused == app.id {
                                    if glass { GlassLens(radius: metric("radius")) }
                                    else { RoundedRectangle(cornerRadius: metric("radius")).fill(contentColor("action-soft", scheme)) }
                                }
                            }
                    }.buttonStyle(.plain).accessibilityAddTraits(focused == app.id ? .isSelected : []).help(app.path)
                }
            }.padding(glass ? 0 : metric("small"))
        }.scrollIndicators(glass ? .hidden : .automatic).overlay {
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
                    Text(app.name).font(.vzn("headingScale", .semibold)).fontWeight(.semibold)
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
                HStack { Text(plan.app.name).font(.vzn("labelScale", .semibold)); Spacer(); Button(store.text("close")) { apps.dismissPlan() }.disabled(apps.busy) }
                if plan.incomplete { Text(store.text("appIncomplete")) }
                Toggle(store.text("appReset"), isOn: $reset).disabled(apps.busy).onChange(of: reset) { _, value in if value { for item in plan.items where item.kind == "bundle" { selected.remove(item.id) } } }
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: metric("small")) {
                        // Grouped the way the spec reads them: the bundle, its preferences, then related data.
                        ForEach(["bundle", "preferences", "data"], id: \.self) { kind in
                            let items = plan.items.filter { $0.kind == kind }
                            if !items.isEmpty {
                                let total = items.compactMap(\.bytes).reduce(0, +)
                                HStack {
                                    Eyebrow(text: store.text("appKind_" + kind))
                                    Spacer()
                                    Text(String(items.count) + " · " + ByteCountFormatter.string(fromByteCount: total, countStyle: .file)).font(.vzn("captionScale")).foregroundStyle(.secondary).monospacedDigit()
                                }.padding(.top, metric("small"))
                                ForEach(items) { item in
                                    HStack {
                                        Toggle(isOn: Binding(get: { selected.contains(item.id) }, set: { if $0 { selected.insert(item.id) } else { selected.remove(item.id) } })) {
                                            VStack(alignment: .leading, spacing: metric("tight")) {
                                                Text(shortPath(item.path)).textSelection(.enabled).help(item.path)
                                                HStack(spacing: metric("small")) {
                                                    if let blocked = item.blocked { Text(store.text(blocked)) }
                                                    else { Text(item.bytes.map { ByteCountFormatter.string(fromByteCount: $0, countStyle: .file) } ?? store.text("notMeasured")) }
                                                    Text("·"); Text(store.text("appEvidence_" + item.evidence))
                                                }.font(.vzn("smallScale")).foregroundStyle(.secondary)
                                            }
                                        }.disabled(apps.busy || item.blocked != nil || (reset && item.kind == "bundle"))
                                        Button(store.text("reveal")) { apps.reveal(item.id) }.buttonStyle(.vznQuiet)
                                    }
                                }
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

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
    var body: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            HStack {
                TextField(store.text("searchLabel"), text: $query)
                Button(store.text("refresh")) { Task { await apps.refresh() } }.disabled(apps.busy)
            }
            if apps.busy { ProgressView() }
            if let error = apps.error { Text(store.text(error)).foregroundStyle(.red).textSelection(.enabled) }
            GeometryReader { geometry in
                HStack(alignment: .top, spacing: metric("inset")) {
                    if apps.plan == nil || geometry.size.width >= metric("reading") {
                        inventory.frame(maxWidth: apps.plan == nil ? .infinity : metric("sidebar"))
                    }
                    if apps.plan != nil {
                        if geometry.size.width >= metric("reading") { Divider() }
                        planDetails.frame(maxWidth: .infinity)
                    }
                }
            }
            DisclosureGroup(store.text("appActionHistory")) {
                ScrollView {
                    LazyVStack(alignment: .leading) {
                        ForEach(apps.journals) { journal in
                            HStack {
                                Text(journal.appName)
                                Spacer()
                                Text("\(journal.items.filter { ["trashed", "preferencesRemoved"].contains($0.status) }.count) / \(journal.items.count)")
                                Button(store.text("appRestore")) { Task { await apps.undo(journal.id) } }.disabled(apps.busy || !journal.items.contains { ["trashed", "preferencesRemoved", "preferencesBackedUp"].contains($0.status) || ($0.status == "failed" && $0.preferenceBackup != nil) })
                            }
                            ForEach(journal.items) { item in Text(item.path + " · " + store.text("app_" + item.status)).font(.caption).textSelection(.enabled) }
                        }
                    }
                }.frame(maxHeight: metric("editor"))
            }
        }.padding(metric("inset"))
        .task { if apps.applications.isEmpty { await apps.refresh() } }
        .confirmationDialog(store.text("appConfirm"), isPresented: $confirmation) {
            if let plan = apps.plan { Button(store.text(reset ? "appReset" : "appUninstall"), role: .destructive) { Task { await apps.apply(planID: plan.id, itemIDs: selected, reset: reset, quit: quit) } } }
        } message: { Text(store.text("appScopeHint")) }
    }
    private var inventory: some View {
                List(filtered) { app in
                    HStack {
                        VStack(alignment: .leading) { Text(app.name); Text(app.version + " · " + app.path).font(.caption).foregroundStyle(.secondary).lineLimit(1).help(app.path); if let blocked = app.blocked { Text(store.text(blocked)).font(.caption) } }
                        Spacer()
                        Button(store.text("appInspect")) { Task { await apps.inspect(app.id); selected = Set(apps.plan?.items.filter(\.selected).map(\.id) ?? []); reset = false; quit = false } }.disabled(apps.busy)
                    }
                }.overlay {
                    if filtered.isEmpty && !apps.busy { ContentUnavailableView(store.text("appsEmpty"), systemImage: "magnifyingglass", description: Text(store.text("appsEmptyHint"))) }
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
                                        Text(item.path).textSelection(.enabled)
                                        if let blocked = item.blocked { Text(store.text(blocked)).foregroundStyle(.secondary) }
                                        else if let bytes = item.bytes { Text(ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)).foregroundStyle(.secondary) }
                                    }
                                }.disabled(apps.busy || item.blocked != nil || (reset && item.kind == "bundle"))
                                Button(store.text("reveal")) { apps.reveal(item.id) }
                            }
                        }
                    }
                }
                Toggle(store.text("appQuit"), isOn: $quit).disabled(apps.busy)
                Button(store.text(reset ? "appReset" : "appUninstall"), role: .destructive) { confirmation = true }.disabled(apps.busy || selected.isEmpty || plan.app.blocked != nil)
            }
        }
    }

}

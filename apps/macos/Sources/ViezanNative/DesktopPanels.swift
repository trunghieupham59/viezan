import SwiftUI
import AppKit
import ViezanDomain

@MainActor final class DesktopPanels {
    private let store: WorkbenchStore
    private var panel: NSPanel?
    private var chatID: String?
    private let openMain: (String) -> Void
    init(store: WorkbenchStore, openMain: @escaping (String) -> Void) {
        self.store = store; self.openMain = openMain
        store.desktopIntegration.onAction = { [weak self] action in self?.present(action) }
        store.desktopIntegration.activate()
    }
    func present(_ action: String) {
        guard !store.loadBlocked, store.moduleEnabled(action == "launcher" ? "utilities" : action == "quickChat" ? "chat" : "translate") else { return }
        var selected: SelectedTextTarget?
        if action == "translateSelection" { selected = try? SelectedTextTarget.capture() }
        let window = panel ?? NSPanel(contentRect: NSRect(x: 0, y: 0, width: metric("reading"), height: metric("reading")), styleMask: [.titled, .closable, .resizable, .utilityWindow], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false; window.level = .floating; window.hidesOnDeactivate = false
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.minSize = NSSize(width: metric("sidebar") + metric("editor"), height: metric("editor") * 3)
        window.title = store.text(action)
        if action == "launcher" {
            window.contentView = NSHostingView(rootView: NativeLauncher(store: store, dismiss: { window.orderOut(nil) }, quickChat: { [weak self] in self?.present("quickChat") }, openFeature: { [weak self] feature in guard let self, let id = self.store.workspace.active[feature.rawValue] else { return }; self.openMain(id); window.orderOut(nil) }))
        } else {
            let id: String
            if action == "translateSelection" { id = store.createDetachedSession(feature: .translate, draft: selected?.text ?? "") }
            else {
                if chatID == nil || store.session(chatID!)?.archived == true { chatID = store.createDetachedSession(feature: .chat) }
                id = chatID!
            }
            window.contentView = NSHostingView(rootView: QuickSessionPanel(store: store, sessionID: id, target: selected, selectionRequested: action == "translateSelection", openMain: { [weak self] in self?.openMain(id); window.orderOut(nil) }))
        }
        if panel == nil { window.center() }; panel = window
        NSApp.activate(ignoringOtherApps: true); window.makeKeyAndOrderFront(nil)
    }
}
private struct QuickSessionPanel: View {
    @Bindable var store: WorkbenchStore
    let sessionID: String
    let target: SelectedTextTarget?
    let selectionRequested: Bool
    var openMain: () -> Void
    @State private var error: String?
    @State private var modelDraft = ""
    private var session: Session? { store.session(sessionID) }
    var body: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            if let session {
                HStack {
                    Text(store.title(session)).font(.headline).lineLimit(1)
                    Spacer(); Button(store.text("open"), action: openMain)
                }
                if selectionRequested && target == nil { Text(store.text("selectionUnavailable")).foregroundStyle(.secondary) }
                if let target { Text(target.applicationName).font(.caption).foregroundStyle(.secondary) }
                ScrollView {
                    VStack(alignment: .leading, spacing: metric("inset")) {
                        if session.feature == .chat { ForEach(session.messages) { message in Text(message.text).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) } }
                        else { Text(session.output.isEmpty ? store.text("emptyResult") : session.output).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }
                    }
                }
                ComposerEditor(text: Binding(get: { self.session?.draft ?? "" }, set: { store.setDraft(sessionID, $0) }), identity: sessionID, label: store.text("prompt"), font: readingNSFont(store), growsWithContent: true) { store.submit(sessionID) }
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(metric("inset"))
                    .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: metric("radius")))
                    .overlay(RoundedRectangle(cornerRadius: metric("radius")).stroke(Color(nsColor: .separatorColor)))
                if session.feature == .translate {
                    Picker(store.text("outputLanguage"), selection: Binding(get: { self.session?.target ?? "vi" }, set: { store.setPair(sessionID, source: "auto", target: $0) })) {
                        ForEach(nativeResources.nativeLanguages, id: \.self) { Text(store.text("lang_" + $0)).tag($0) }
                    }
                }
                DisclosureGroup(store.text("configureModel")) {
                    TextField(store.text("modelID"), text: $modelDraft).textFieldStyle(.roundedBorder)
                    Button(store.text("apply")) { store.setModel(sessionID, modelDraft.trimmingCharacters(in: .whitespacesAndNewlines)) }
                        .disabled(!NativeModel.valid(modelDraft.trimmingCharacters(in: .whitespacesAndNewlines)))
                }.onAppear { modelDraft = session.model }
                HStack {
                    if let task = store.running(sessionID) { Button(store.text("stop"), role: .destructive) { store.cancel(task.id) } }
                    else { Button(store.text(session.feature == .chat ? "send" : "translate")) { store.submit(sessionID) }.buttonStyle(.vznPrimary).disabled(session.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty).keyboardShortcut(.return, modifiers: .command) }
                    if let target, !session.output.isEmpty {
                        Button(store.text("replaceSelection")) { do { try target.replace(with: session.output); error = nil } catch { self.error = "selectionChanged" } }.disabled(store.running(sessionID) != nil)
                    }
                    Spacer()
                    Button(store.text("copy")) { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(session.feature == .chat ? session.messages.last?.text ?? "" : session.output, forType: .string) }
                }
                if let task = store.workspace.tasks.first(where: { $0.request.sessionID == sessionID }), task.status == .failed { TaskStatusText(store: store, task: task) }
                if let error { Text(store.text(error)).foregroundStyle(.secondary) }
            }
        }.padding(metric("inset"))
    }
}
private struct NativeLauncher: View {
    let store: WorkbenchStore
    var dismiss: () -> Void
    var quickChat: () -> Void
    var openFeature: (Feature) -> Void
    @State private var query = ""
    @State private var apps: [LauncherApplication] = []
    @State private var files: [LauncherFile] = []
    @State private var currency: String?
    @State private var error = false
    @FocusState private var focused: Bool
    private var matches: [LauncherApplication] {
        let recent = UserDefaults.standard.stringArray(forKey: "launcher.recent") ?? []
        return apps.filter { query.isEmpty || $0.name.localizedStandardContains(query) }.sorted { (recent.firstIndex(of: $0.id) ?? Int.max) < (recent.firstIndex(of: $1.id) ?? Int.max) }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            TextField(store.text("searchLabel"), text: $query).textFieldStyle(.roundedBorder).focused($focused).onSubmit { if let app = matches.first { launch(app) } }
            HStack {
                Button(store.text("quickChat"), action: quickChat)
                Button(store.text("searchWeb")) {
                    var components = URLComponents(string: "https://www.google.com/search")!; components.queryItems = [URLQueryItem(name: "q", value: query)]
                    if let url = components.url { NSWorkspace.shared.open(url) }
                }.disabled(query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Menu(store.text("open")) { ForEach(Feature.allCases, id: \.self) { feature in Button(store.text(feature.rawValue)) { openFeature(feature) } } }
            }
            if let calculation = LauncherCalculator.evaluate(query) {
                Button(calculation) { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(calculation, forType: .string) }.help(store.text("copyResponse"))
            }
            if let currency { Button(currency) { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(currency, forType: .string) }.help(store.text("copyResponse")) }
            if !files.isEmpty {
                List(files) { file in Button { if NSWorkspace.shared.open(URL(fileURLWithPath: file.id)) { dismiss() } else { error = true } } label: { VStack(alignment: .leading) { Text(file.name); Text(file.id).font(.caption).foregroundStyle(.secondary).lineLimit(1) } }.buttonStyle(.plain).contextMenu { Button(store.text("revealFile")) { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: file.id)]) } } }
            }
            List(matches) { app in Button { launch(app) } label: { HStack { Image(nsImage: NSWorkspace.shared.icon(forFile: app.id)).resizable().frame(width: metric("icon"), height: metric("icon")); Text(app.name).frame(maxWidth: .infinity, alignment: .leading) } }.buttonStyle(.plain) }
            if error { Text(store.text("launchError")).foregroundStyle(.secondary) }
        }.padding(metric("inset")).task { apps = await Task.detached { LauncherCatalog.applications() }.value; focused = true }
            .task(id: query) {
                files = []; let input = query
                do { try await Task.sleep(for: .milliseconds(250)); try Task.checkCancellation() } catch { return }
                let worker = Task.detached { LauncherFiles.search(input) }
                let result = await withTaskCancellationHandler(operation: { await worker.value }, onCancel: { worker.cancel() })
                if !Task.isCancelled && query == input { files = result }
            }
            .task(id: query) {
                currency = nil; let input = query
                do { try await Task.sleep(for: .milliseconds(250)); try Task.checkCancellation() } catch { return }
                let value = await CurrencyRates.shared.convert(input)
                if !Task.isCancelled && query == input { currency = value }
            }
            .onExitCommand(perform: dismiss)
    }
    private func launch(_ app: LauncherApplication) {
        guard apps.contains(where: { $0.id == app.id }) else { return }
        var recent = UserDefaults.standard.stringArray(forKey: "launcher.recent") ?? []; recent.removeAll { $0 == app.id }; recent.insert(app.id, at: 0); UserDefaults.standard.set(Array(recent.prefix(50)), forKey: "launcher.recent")
        NSWorkspace.shared.openApplication(at: URL(fileURLWithPath: app.id), configuration: .init()) { _, failure in
            Task { @MainActor in if failure == nil { dismiss() } else { error = true } }
        }
    }
}
struct DesktopSettings: View {
    @Bindable var store: WorkbenchStore
    var route: String? = nil
    // Launcher leads, as in Review 18; Everywhere shows only selection translation.
    private var shortcuts: [NativeShortcut] {
        let order = ["launcher", "translateSelection", "quickChat"]
        return store.desktopIntegration.shortcuts.filter { route != "everywhere" || $0.id == "translateSelection" }
            .sorted { (order.firstIndex(of: $0.id) ?? order.count) < (order.firstIndex(of: $1.id) ?? order.count) }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(shortcuts) { shortcut in NativeShortcutRow(store: store, shortcut: shortcut, everywhere: route == "everywhere") }
            if route != "utilities" {
                CardRow(title: store.text("accessibilityPermission"), detail: store.text(route == "everywhere" ? "accessibilityHint" : "selectionPermissionHint"), divider: route != nil) {
                    Button(store.text(route == "everywhere" ? "setUp" : "requestAccessibility")) { store.desktopIntegration.requestAccessibility() }
                        .help(store.text("selectionPermissionHint"))
                }
            }
            if route == nil {
                HStack {
                    Button(store.text("launcher")) { store.desktopIntegration.onAction?("launcher") }
                    Button(store.text("quickChat")) { store.desktopIntegration.onAction?("quickChat") }
                }.padding(.vertical, metric("small"))
            }
            if let error = store.desktopIntegration.error { Label(store.text(error), systemImage: "exclamationmark.triangle").foregroundStyle(.secondary).padding(.top, metric("small")) }
        }
    }
}
// Shortcut row: label, enable switch, and the key cap that opens its editor.
private struct NativeShortcutRow: View {
    let store: WorkbenchStore
    let shortcut: NativeShortcut
    var everywhere = false
    @State private var key = ""
    @State private var editing = false
    private var display: String {
        shortcut.key.split(separator: "+").map { part -> String in
            switch part { case "Control": "⌃"; case "Option": "⌥"; case "Shift": "⇧"; case "Command": "⌘"; default: String(part) }
        }.joined(separator: " ")
    }
    var body: some View {
        CardRow(title: everywhere ? store.text("allShortcuts") : store.text(shortcut.id), detail: store.text(everywhere ? "shortcutCustomizable" : "shortcutDetail_" + shortcut.id)) {
            HStack(spacing: metric("small")) {
                Button { editing.toggle() } label: { KeyCap(text: display) }.buttonStyle(.plain)
                    .help(store.text("shortcut")).accessibilityLabel(store.text("shortcut") + ": " + shortcut.key)
                    .popover(isPresented: $editing) {
                        VStack(alignment: .leading, spacing: metric("small")) {
                            Text(store.text(shortcut.id)).font(.headline)
                            TextField(store.text("shortcut"), text: $key).textFieldStyle(.roundedBorder)
                                .onSubmit { store.desktopIntegration.configure(shortcut.id, key: key, enabled: shortcut.enabled); editing = false }
                            HStack { Spacer(); Button(store.text("apply")) { store.desktopIntegration.configure(shortcut.id, key: key, enabled: shortcut.enabled); editing = false }.buttonStyle(.vznPrimary) }
                        }.padding(metric("inset")).frame(width: metric("sidebar") + metric("large"))
                    }
                Toggle(store.text(shortcut.id), isOn: Binding(get: { shortcut.enabled }, set: { store.desktopIntegration.configure(shortcut.id, key: key, enabled: $0) }))
                    .toggleStyle(.switch).labelsHidden().controlSize(.small)
            }
        }.onAppear { key = shortcut.key }.onChange(of: shortcut.key) { _, value in key = value }
    }
}

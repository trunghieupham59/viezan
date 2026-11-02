import SwiftUI
import AppKit
import ViezanDomain

@MainActor final class DesktopPanels {
    private let store: WorkbenchStore
    private var panel: NSPanel?
    private var chatID: String?
    private let openMain: (String) -> Void
    private let openRoute: (String) -> Void
    private let quickTranslate: QuickTranslate
    private var launcher: Launcher!
    /// `openMain` shows a session in the main window; `openRoute` shows a page there ("settings", "interpret", a feature).
    init(store: WorkbenchStore, openMain: @escaping (String) -> Void, openRoute: @escaping (String) -> Void) {
        self.store = store; self.openMain = openMain; self.openRoute = openRoute
        quickTranslate = QuickTranslate(store: store, openMain: openMain)
        launcher = Launcher(store: store, actions: .init(
            openFeature: { feature, text in
                let id = store.createDetachedSession(feature: feature, draft: text); store.submit(id); openMain(id)
            },
            openRoute: openRoute,
            openChat: { id in if let id { openMain(id) } else { openRoute("chat") } },
            openSettings: { section in openRoute("settings"); NotificationCenter.default.post(name: .viezanOpenSettings, object: section) }))
        store.desktopIntegration.onAction = { [weak self] action in self?.present(action) }
        store.desktopIntegration.activate()
    }
    func present(_ action: String) {
        guard !store.loadBlocked, store.moduleEnabled(action == "launcher" ? "utilities" : action == "quickChat" ? "chat" : "translate") else { return }
        if action == "translateSelection" { quickTranslate.start(); return }
        if action == "launcher" { launcher.toggle(); return }
        let window = panel ?? NSPanel(contentRect: NSRect(x: 0, y: 0, width: metric("reading"), height: metric("reading")), styleMask: [.titled, .closable, .resizable, .utilityWindow], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false; window.level = .floating; window.hidesOnDeactivate = false
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.minSize = NSSize(width: metric("sidebar") + metric("editor"), height: metric("editor") * 3)
        window.title = store.text(action)
        if chatID == nil || store.session(chatID!)?.archived == true { chatID = store.createDetachedSession(feature: .chat) }
        let id = chatID!
        window.contentView = NSHostingView(rootView: QuickSessionPanel(store: store, sessionID: id, openMain: { [weak self] in self?.openMain(id); window.orderOut(nil) }))
        if panel == nil { window.center() }; panel = window
        NSApp.activate(ignoringOtherApps: true); window.makeKeyAndOrderFront(nil)
    }
}
private struct QuickSessionPanel: View {
    @Bindable var store: WorkbenchStore
    let sessionID: String
    var openMain: () -> Void
    @State private var modelDraft = ""
    private var session: Session? { store.session(sessionID) }
    var body: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            if let session {
                HStack {
                    Text(store.title(session)).font(.headline).lineLimit(1)
                    Spacer(); Button(store.text("open"), action: openMain)
                }
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
                    Spacer()
                    Button(store.text("copy")) { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(session.feature == .chat ? session.messages.last?.text ?? "" : session.output, forType: .string) }
                }
                if let task = store.workspace.tasks.first(where: { $0.request.sessionID == sessionID }), task.status == .failed { TaskStatusText(store: store, task: task) }
            }
        }.padding(metric("inset"))
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
            if route == "everywhere" { QuickTranslatePairRows(store: store) }
            if route != "utilities" {
                let granted = store.desktopIntegration.accessibilityGranted
                CardRow(title: store.text("accessibilityPermission"), detail: store.text(route == "everywhere" ? "accessibilityHint" : "selectionPermissionHint"), divider: route != nil) {
                    HStack(spacing: metric("gap")) {
                        StatusBadge(text: store.text(granted ? "permissionGranted" : "permissionMissing"), tone: granted ? .ready : .idle)
                        if !granted {
                            Button(store.text("openSystemSettings")) { store.desktopIntegration.requestAccessibility() }
                                .buttonStyle(.vznPrimary).help(store.text("selectionPermissionHint"))
                        }
                    }
                }
                // Granted in System Settings while Viezan was in the background.
                .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in store.desktopIntegration.refreshAccessibility() }
                .onAppear { store.desktopIntegration.refreshAccessibility() }
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
// Quick translate's own language pair and the model it uses (the app's current choice).
private struct QuickTranslatePairRows: View {
    @Bindable var store: WorkbenchStore
    var body: some View {
        let pair = store.quickTranslate, languages = nativeResources.nativeLanguages
        CardRow(title: store.text("quickPrimary"), detail: store.text(pair.secondary == nil ? "quickPairOff" : "quickPairOn")) {
            Picker(store.text("quickPrimary"), selection: Binding(get: { pair.primary }, set: { store.quickTranslate = store.quickTranslate.choosing(primary: $0) })) {
                ForEach(languages, id: \.self) { Text(store.text("lang_" + $0)).tag($0) }
            }.labelsHidden().fixedSize()
        }
        CardRow(title: store.text("quickSecondary"), detail: store.text("quickSecondaryHint")) {
            Picker(store.text("quickSecondary"), selection: Binding(get: { pair.secondary ?? "" }, set: { var next = store.quickTranslate; next.secondary = $0.isEmpty ? nil : $0; store.quickTranslate = next })) {
                Text(store.text("quickSecondaryOff")).tag("")
                ForEach(languages.filter { $0 != pair.primary }, id: \.self) { Text(store.text("lang_" + $0)).tag($0) }
            }.labelsHidden().fixedSize()
        }
        CardRow(title: store.text("quickModel"), detail: store.text("quickModelHint")) {
            Text(nativeModelLabel(store.session.model, store: store)).foregroundStyle(.secondary).lineLimit(1)
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

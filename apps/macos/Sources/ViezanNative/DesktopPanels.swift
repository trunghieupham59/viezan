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
    @Environment(\.colorScheme) private var scheme
    @Bindable var store: WorkbenchStore
    let sessionID: String
    var openMain: () -> Void
    @State private var modelDraft = ""
    private var session: Session? { store.session(sessionID) }
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    var body: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            if let session {
                if glass {
                    // Launcher-States (Chat nhanh): title, the feature as a chip, Open as a glass pill.
                    HStack(spacing: metric("small")) {
                        Text(store.title(session)).font(.system(size: NSFont.systemFontSize, weight: .semibold)).foregroundStyle(contentColor("text-strong", scheme)).lineLimit(1)
                        Spacer(minLength: metric("small"))
                        StatusBadge(text: store.text(session.feature.rawValue), tone: .idle)
                        Button(store.text("open"), systemImage: "arrow.up.forward.square", action: openMain).buttonStyle(.vznOutline).controlSize(.small).fixedSize()
                    }
                } else {
                HStack {
                    Text(store.title(session)).font(.vzn("labelScale", .semibold)).lineLimit(1)
                    Spacer(); Button(store.text("open"), action: openMain)
                }
                }
                ScrollView {
                    VStack(alignment: .leading, spacing: metric("inset")) {
                        if glass && session.feature == .chat {
                            // Same turn shapes as AI Chat: the person's bubble trailing, "✦ Viezan" answers leading.
                            ForEach(session.messages) { message in
                                if message.role == "user" {
                                    Text(message.text).textSelection(.enabled).foregroundStyle(contentColor("text-strong", scheme))
                                        .padding(.vertical, metric("small") + metric("hairline") * 2).padding(.horizontal, metric("gap") + metric("hairline") * 2)
                                        .background(contentColor("surface-muted", scheme), in: UserBubbleShape())
                                        .frame(maxWidth: .infinity, alignment: .trailing)
                                } else {
                                    VStack(alignment: .leading, spacing: metric("small") - metric("hairline") * 2) {
                                        HStack(spacing: metric("small") - metric("hairline") * 2) {
                                            Image(systemName: "sparkles").imageScale(.small).foregroundStyle(contentColor("action", scheme))
                                            Text("Viezan").fontWeight(.semibold).foregroundStyle(contentColor("text-muted", scheme))
                                        }.font(.vzn("smallScale")).accessibilityElement(children: .combine)
                                        Text(message.text).textSelection(.enabled).foregroundStyle(contentColor("text-strong", scheme)).frame(maxWidth: .infinity, alignment: .leading)
                                    }.padding(.trailing, metric("large"))
                                }
                            }
                        } else if session.feature == .chat { ForEach(session.messages) { message in Text(message.text).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) } }
                        else { Text(session.output.isEmpty ? store.text("emptyResult") : session.output).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }
                    }
                }
                ComposerEditor(text: Binding(get: { self.session?.draft ?? "" }, set: { store.setDraft(sessionID, $0) }), identity: sessionID, label: store.text("prompt"), font: readingNSFont(store), growsWithContent: true) { store.submit(sessionID) }
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(metric("inset"))
                    .background {
                        // Glass: the same raised composer surface as AI Chat.
                        if (NativeTheme.shared.preferences.preset ?? "glass") == "glass" { ComposerSurface(radius: metric("chromeCardRadius")) }
                        else {
                            RoundedRectangle(cornerRadius: metric("radius")).fill(contentColor("surface", scheme))
                                .overlay(RoundedRectangle(cornerRadius: metric("radius")).stroke(Color(nsColor: .separatorColor)))
                        }
                    }
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
                    Button(store.text("copy")) { copyText(session.feature == .chat ? session.messages.last?.text ?? "" : session.output, store: store) }
                }
                if let task = store.workspace.tasks.first(where: { $0.request.sessionID == sessionID }), task.status == .failed { TaskStatusText(store: store, task: task) }
            }
        }.padding(metric("inset")).buttonStyle(.vznOutline)
    }
}
struct DesktopSettings: View {
    @Bindable var store: WorkbenchStore
    var route: String? = nil
    /// Glass system pages open the recorder as the page's centred blocking dialog.
    var recording: Binding<String?>? = nil
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    // Launcher leads, as in Review 18; Everywhere shows only selection translation.
    private var shortcuts: [NativeShortcut] {
        let order = ["launcher", "translateSelection", "quickChat"]
        return store.desktopIntegration.shortcuts.filter { route != "everywhere" || $0.id == "translateSelection" }
            .sorted { (order.firstIndex(of: $0.id) ?? order.count) < (order.firstIndex(of: $1.id) ?? order.count) }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Glass boards (Everywhere, Shortcuts) lead with the permission the rows depend on.
            if glass && route != nil { accessibilityRow(divider: true) }
            ForEach(shortcuts) { shortcut in NativeShortcutRow(store: store, shortcut: shortcut, everywhere: route == "everywhere", recording: recording) }
            if route == "everywhere" { QuickTranslatePairRows(store: store) }
            if route != "utilities" && !(glass && route != nil) { accessibilityRow(divider: route != nil) }
            if route == nil {
                HStack {
                    Button(store.text("launcher")) { store.desktopIntegration.onAction?("launcher") }
                    Button(store.text("quickChat")) { store.desktopIntegration.onAction?("quickChat") }
                }.padding(.vertical, metric("small"))
            }
            if let error = store.desktopIntegration.error { Label(store.text(error), systemImage: "exclamationmark.triangle").foregroundStyle(.secondary).padding(.top, metric("small")).padding(.horizontal, glass && route != nil ? metric("inset") : 0) }
        }
    }
    private func accessibilityRow(divider: Bool) -> some View {
                let granted = store.desktopIntegration.accessibilityGranted
                return CardRow(title: store.text("accessibilityPermission"), detail: store.text(route == "everywhere" ? "accessibilityHint" : "selectionPermissionHint"), divider: divider) {
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
func shortcutDisplay(_ key: String) -> String {
    key.split(separator: "+").map { part -> String in
        switch part { case "Control": "⌃"; case "Option": "⌥"; case "Shift": "⇧"; case "Command": "⌘"; default: String(part) }
    }.joined(separator: " ")
}

// Shortcut row: label, enable switch, and the key cap that opens its recorder.
private struct NativeShortcutRow: View {
    let store: WorkbenchStore
    let shortcut: NativeShortcut
    var everywhere = false
    var recording: Binding<String?>? = nil
    @State private var editing = false
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    var body: some View {
        CardRow(title: everywhere ? store.text("allShortcuts") : store.text(shortcut.id), detail: store.text(everywhere ? "shortcutCustomizable" : "shortcutDetail_" + shortcut.id)) {
            HStack(spacing: metric("small")) {
                // Shortcuts board: "Try" runs the action now (Launcher, Quick Chat).
                if glass, !everywhere, ["launcher", "quickChat"].contains(shortcut.id) {
                    Button(store.text("shortcutTry")) { store.desktopIntegration.onAction?(shortcut.id) }.buttonStyle(.vznQuiet).fixedSize()
                }
                Button { if let recording { recording.wrappedValue = shortcut.id } else { editing.toggle() } } label: {
                    if glass { KeyCaps(key: shortcut.key) } else { Text(shortcutDisplay(shortcut.key)).monospaced() }
                }.buttonStyle(.vznOutline)
                    .help(store.text("shortcut")).accessibilityLabel(store.text("shortcut") + ": " + shortcut.key).accessibilityIdentifier("shortcut-" + shortcut.id)
                    .popover(isPresented: $editing) { ShortcutRecorderPanel(store: store, shortcut: shortcut) { editing = false }.padding(metric("inset")).frame(width: metric("sidebar") + metric("editor")) }
                // The switch keeps the saved key; only the recorder changes it.
                Toggle(store.text(shortcut.id), isOn: Binding(get: { shortcut.enabled }, set: { store.desktopIntegration.configure(shortcut.id, key: shortcut.key, enabled: $0) }))
                    .toggleStyle(.switch).labelsHidden().controlSize(.small)
            }
        }
    }
}

// Press the combination; Esc cancels. A key another Viezan shortcut uses, or one without
// ⌘/⌃/⌥, is shown as the reason the Apply button stays off.
// One key cap per part of a shortcut ("⌥" "Space"), as the Shortcuts board draws them.
struct KeyCaps: View {
    var key: String
    var body: some View {
        HStack(spacing: metric("tight")) { ForEach(Array(shortcutDisplay(key).split(separator: " ").enumerated()), id: \.offset) { KeyCap(text: String($0.element)) } }
            .accessibilityElement(children: .ignore).accessibilityLabel(shortcutDisplay(key))
    }
}

/// The recorder as the system page's blocking dialog (Shortcuts-Recorder board).
struct ShortcutRecorderDialog: View {
    let store: WorkbenchStore
    let shortcutID: String
    var close: () -> Void
    var body: some View {
        if let shortcut = store.desktopIntegration.shortcuts.first(where: { $0.id == shortcutID }) {
            BlockingDialog(title: store.text("shortcutFor").replacingOccurrences(of: "{name}", with: store.text(shortcut.id)), width: metric("sidebar") + metric("editor") + metric("large") * 2 + metric("gap"), onCancel: close) {
                ShortcutRecorderPanel(store: store, shortcut: shortcut, close: close)
            }
        }
    }
}

struct ShortcutRecorderPanel: View {
    let store: WorkbenchStore
    let shortcut: NativeShortcut
    var close: () -> Void
    @State private var captured: String?
    @State private var recording = true
    @Environment(\.colorScheme) private var scheme
    private var conflict: NativeShortcut? {
        guard let captured else { return nil }
        return store.desktopIntegration.shortcuts.first { $0.id != shortcut.id && $0.key == captured }
    }
    private var problem: String? {
        guard let captured else { return nil }
        if let conflict { return store.text("shortcutConflict").replacingOccurrences(of: "{name}", with: store.text(conflict.id)) }
        return DesktopIntegration.isValid(captured) ? nil : store.text("shortcutNeedsModifier")
    }
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    var body: some View {
        if glass { glassBody } else { classicBody }
    }
    // Title, the press-keys hint, a recording field with centred key caps and an accent edge,
    // the reason Apply is off, then Default · Close · Apply.
    private var glassBody: some View {
        VStack(alignment: .leading, spacing: metric("gap")) {
            VStack(alignment: .leading, spacing: metric("tight")) {
                Text(store.text("shortcutFor").replacingOccurrences(of: "{name}", with: store.text(shortcut.id))).font(.vzn("subtitleScale", .semibold)).accessibilityAddTraits(.isHeader)
                Text(store.text("pressKeys") + " " + store.text("shortcutNeedsModifier")).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).fixedSize(horizontal: false, vertical: true)
            }
            ZStack {
                ShortcutRecorder(recording: $recording) { captured = $0; recording = false } cancel: { close() }
                HStack(spacing: metric("small")) {
                    Spacer(minLength: 0)
                    if recording && captured == nil { Text(store.text("pressKeys")).foregroundStyle(contentColor("text-muted", scheme)) }
                    else { KeyCaps(key: captured ?? shortcut.key) }
                    Spacer(minLength: 0)
                }.allowsHitTesting(false)
                if !recording {
                    HStack { Spacer(); Button(store.text("shortcut")) { captured = nil; recording = true }.buttonStyle(.vznQuiet).padding(.trailing, metric("tight")) }
                }
            }
            .frame(height: metric("navControl") + metric("tight"))
            .background { InsetInputSurface(radius: metric("controlRadius"), focused: true, baseRole: "surface") }
            .overlay { if recording { RoundedRectangle(cornerRadius: metric("controlRadius"), style: .continuous).strokeBorder(contentColor("action-text", scheme).opacity(metric("selectionOpacity") * 4), lineWidth: metric("hairline") * 2).allowsHitTesting(false) } }
            .accessibilityElement(children: .contain).accessibilityLabel(store.text("shortcut"))
            if let problem {
                HStack(alignment: .firstTextBaseline, spacing: metric("small")) { StatusDot(tone: .failed); Text(problem).fixedSize(horizontal: false, vertical: true) }
                    .font(.vzn("smallScale")).foregroundStyle(contentColor("danger", scheme))
            }
            HStack(spacing: metric("small")) {
                Button(store.text("shortcutDefault") + (DesktopIntegration.defaults[shortcut.id].map { " · " + shortcutDisplay($0) } ?? "")) { captured = DesktopIntegration.defaults[shortcut.id]; recording = false }
                    .buttonStyle(.vznQuiet).disabled(shortcut.key == DesktopIntegration.defaults[shortcut.id] && captured == nil)
                Spacer()
                Button(store.text("close"), action: close).buttonStyle(.vznOutline)
                Button(store.text("apply")) { if let captured { store.desktopIntegration.configure(shortcut.id, key: captured, enabled: shortcut.enabled) }; close() }
                    .buttonStyle(.vznPrimary).disabled(captured == nil || problem != nil || captured == shortcut.key).accessibilityIdentifier("shortcut-apply")
            }
        }
    }
    private var classicBody: some View {
        VStack(alignment: .leading, spacing: metric("gap")) {
            Text(store.text(shortcut.id)).font(.vzn("labelScale", .semibold))
            ZStack {
                ShortcutRecorder(recording: $recording) { captured = $0; recording = false } cancel: { close() }
                HStack(spacing: metric("small")) {
                    if recording { Text(store.text("pressKeys")).foregroundStyle(.secondary) }
                    else { KeyCap(text: shortcutDisplay(captured ?? shortcut.key)) }
                    Spacer(minLength: 0)
                    if !recording { Button(store.text("shortcut")) { captured = nil; recording = true }.buttonStyle(.vznQuiet) }
                }.padding(.horizontal, metric("gap")).allowsHitTesting(!recording)
            }
            .frame(height: metric("control"))
            .background(contentColor("surface", scheme), in: RoundedRectangle(cornerRadius: metric("controlRadius")))
            .overlay(RoundedRectangle(cornerRadius: metric("controlRadius")).strokeBorder(contentColor(recording ? "border-strong" : "border", scheme), lineWidth: metric("hairline")))
            .accessibilityElement(children: .contain).accessibilityLabel(store.text("shortcut"))
            if let problem { Text(problem).font(.vzn("smallScale")).foregroundStyle(contentColor("danger", scheme)) }
            HStack {
                Button(store.text("shortcutDefault")) { captured = DesktopIntegration.defaults[shortcut.id]; recording = false }
                    .buttonStyle(.vznQuiet).disabled(shortcut.key == DesktopIntegration.defaults[shortcut.id] && captured == nil)
                Spacer()
                Button(store.text("close"), action: close).buttonStyle(.vznOutline)
                Button(store.text("apply")) { if let captured { store.desktopIntegration.configure(shortcut.id, key: captured, enabled: shortcut.enabled) }; close() }
                    .buttonStyle(.vznPrimary).disabled(captured == nil || problem != nil || captured == shortcut.key).accessibilityIdentifier("shortcut-apply")
            }
        }
    }
}

// A focusable AppKit view that turns the next key press into "Modifier+Key".
private struct ShortcutRecorder: NSViewRepresentable {
    @Binding var recording: Bool
    var capture: (String) -> Void
    var cancel: () -> Void
    func makeNSView(context: Context) -> RecorderView { let view = RecorderView(); view.capture = capture; view.cancel = cancel; return view }
    func updateNSView(_ view: RecorderView, context: Context) {
        view.capture = capture; view.cancel = cancel
        if recording { DispatchQueue.main.async { view.window?.makeFirstResponder(view) } }
    }
    final class RecorderView: NSView {
        var capture: ((String) -> Void)?
        var cancel: (() -> Void)?
        override var acceptsFirstResponder: Bool { true }
        override func keyDown(with event: NSEvent) {
            if event.keyCode == 53 { cancel?(); return }
            guard let name = DesktopIntegration.keyName(code: event.keyCode) else { NSSound.beep(); return }
            let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
            var parts: [String] = []
            if flags.contains(.control) { parts.append("Control") }
            if flags.contains(.option) { parts.append("Option") }
            if flags.contains(.shift) { parts.append("Shift") }
            if flags.contains(.command) { parts.append("Command") }
            capture?((parts + [name]).joined(separator: "+"))
        }
    }
}

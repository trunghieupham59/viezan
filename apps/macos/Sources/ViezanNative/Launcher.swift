import SwiftUI
import AppKit
import ViezanDomain

/// The launcher: a floating search window (Spotlight-like) for apps, files, quick
/// calculations and sending text to Viezan. It takes keyboard focus without activating the
/// main window, sits 22% below the top of the pointer's screen, and hides when it loses focus.
@MainActor final class Launcher {
    struct Actions {
        var askAI: (String) -> Void
        var openFeature: (Feature, String) -> Void
    }
    private final class KeyPanel: NSPanel {
        override var canBecomeKey: Bool { true }
        override func cancelOperation(_ sender: Any?) { orderOut(nil) }
    }
    /// Keys the search field would otherwise swallow (arrows move its caret), relayed to the list.
    @MainActor @Observable final class Keys {
        enum Key { case up, down, tab, escape }
        private(set) var last: (key: Key, serial: Int)?
        func send(_ key: Key) { last = (key, (last?.serial ?? 0) + 1) }
    }
    private let store: WorkbenchStore
    private let actions: Actions
    private let keys = Keys()
    private var panel: KeyPanel?
    private var resign: NSObjectProtocol?
    private var monitor: Any?
    private var generation = 0
    init(store: WorkbenchStore, actions: Actions) { self.store = store; self.actions = actions }

    /// The launcher shortcut shows it, and hides it when it is already in front.
    func toggle() {
        if let panel, panel.isVisible { dismiss(); return }
        let window = panel ?? makePanel()
        panel = window; generation += 1
        window.contentView = NSHostingView(rootView: LauncherView(store: store, keys: keys, generation: generation, dismiss: { [weak self] in self?.dismiss() },
            resize: { [weak self] height in self?.resize(height) }, askAI: { [weak self] text in self?.dismiss(); self?.actions.askAI(text) },
            openFeature: { [weak self] feature, text in self?.dismiss(); self?.actions.openFeature(feature, text) }))
        resize(metric("navControl") + metric("gutter"))
        place(window)
        window.makeKeyAndOrderFront(nil)
        if monitor == nil {
            monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
                guard let self, let panel = self.panel, event.window === panel, panel.isVisible else { return event }
                let plain = event.modifierFlags.intersection([.command, .option, .control, .shift]).isEmpty
                switch (event.keyCode, plain) {
                case (125, _): self.keys.send(.down); return nil
                case (126, _): self.keys.send(.up); return nil
                case (48, true): self.keys.send(.tab); return nil
                case (53, _): self.keys.send(.escape); return nil
                default: return event
                }
            }
        }
    }
    func dismiss() { panel?.orderOut(nil) }

    private func makePanel() -> KeyPanel {
        let window = KeyPanel(contentRect: NSRect(x: 0, y: 0, width: metric("reading"), height: metric("large") * 2), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false; window.level = .floating; window.hidesOnDeactivate = false
        window.isOpaque = false; window.backgroundColor = .clear; window.hasShadow = true; window.isMovableByWindowBackground = true
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        // Clicking elsewhere hides it, like the system's search.
        resign = NotificationCenter.default.addObserver(forName: NSWindow.didResignKeyNotification, object: window, queue: .main) { [weak window] _ in
            MainActor.assumeIsolated { window?.orderOut(nil) }
        }
        return window
    }
    private func place(_ window: NSWindow) {
        let pointer = NSEvent.mouseLocation
        guard let screen = NSScreen.screens.first(where: { $0.frame.contains(pointer) }) ?? NSScreen.main else { return }
        let bounds = screen.visibleFrame
        window.setFrameTopLeftPoint(NSPoint(x: bounds.midX - window.frame.width / 2, y: bounds.maxY - bounds.height * 0.22))
    }
    /// The view reports its height; grow or shrink downward from a fixed top edge.
    private func resize(_ height: CGFloat) {
        guard let panel else { return }
        let top = panel.frame.maxY, value = min(max(height, metric("navControl") + metric("gutter")), metric("reading") * 0.71)
        guard abs(panel.frame.height - value) > 0.5 else { return }
        panel.setFrame(NSRect(x: panel.frame.minX, y: top - value, width: metric("reading"), height: value), display: true)
    }
}

private struct LauncherItem: Identifiable {
    enum Kind { case calculator, currency, app, file, command }
    let id: String
    let kind: Kind
    let section: String
    let title: String
    var detail = ""
    var symbol = ""
    var path: String?
    let run: (_ alternate: Bool) -> Void
}

private struct LauncherView: View {
    let store: WorkbenchStore
    let keys: Launcher.Keys
    let generation: Int
    var dismiss: () -> Void
    var resize: (CGFloat) -> Void
    var askAI: (String) -> Void
    var openFeature: (Feature, String) -> Void
    @State private var query = ""
    @State private var apps: [LauncherApplication] = []
    @State private var appsLoaded = false
    @State private var files: [LauncherFile] = []
    @State private var currency: String?
    // By id, not position: results that arrive later (files, rates) must not move the choice.
    @State private var selectedID: String?
    @State private var failed = false
    @FocusState private var focused: Bool
    @Environment(\.colorScheme) private var scheme
    private func t(_ key: String) -> String { store.text(key) }
    /// Section titles are set in capitals; the typed query inside one keeps its own case.
    private func section(_ key: String, query: String = "") -> String {
        t(key).uppercased(with: Locale(identifier: store.workspace.locale)).replacingOccurrences(of: "{QUERY}", with: query)
    }
    private var trimmed: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var items: [LauncherItem] {
        var result: [LauncherItem] = []
        if let value = LauncherCalculator.evaluate(trimmed) {
            result.append(.init(id: "calc", kind: .calculator, section: section("launcher_calculator"), title: trimmed + " = " + value, detail: t("launcher_calculator"), symbol: "function") { _ in copy(value) })
        }
        if let currency { result.append(.init(id: "currency", kind: .currency, section: section("launcher_currency"), title: currency, detail: t("launcher_currency"), symbol: "dollarsign.circle") { _ in copy(currency) }) }
        let recent = UserDefaults.standard.stringArray(forKey: "launcher.recent") ?? []
        for app in LauncherRanking.applications(apps, query: trimmed, recent: recent, limit: trimmed.isEmpty ? 6 : 8) {
            result.append(.init(id: app.id, kind: .app, section: section(trimmed.isEmpty ? "launcher_section_recent" : "launcher_section_apps"), title: app.name, detail: t("launcher_app"), path: app.id) { _ in launch(app) })
        }
        for file in files.prefix(5) {
            let folder = (file.id as NSString).deletingLastPathComponent.replacingOccurrences(of: FileManager.default.homeDirectoryForCurrentUser.path, with: "~")
            result.append(.init(id: file.id, kind: .file, section: section("launcher_section_files"), title: file.name, detail: folder, path: file.id) { reveal in
                let url = URL(fileURLWithPath: file.id)
                if reveal { NSWorkspace.shared.activateFileViewerSelecting([url]); dismiss() } else if NSWorkspace.shared.open(url) { dismiss() } else { failed = true }
            })
        }
        if !trimmed.isEmpty {
            let useWith = section("launcher_section_use_with", query: trimmed.count > 40 ? String(trimmed.prefix(40)) + "…" : trimmed)
            result.append(.init(id: "ai", kind: .command, section: useWith, title: t("launcher_ai"), detail: t("launcher_command"), symbol: "sparkles") { _ in askAI(trimmed) })
            if store.moduleEnabled("translate") { result.append(.init(id: "translate", kind: .command, section: useWith, title: t("launcher_translate"), detail: t("launcher_command"), symbol: "character.bubble") { _ in openFeature(.translate, trimmed) }) }
            if store.moduleEnabled("dictionary") { result.append(.init(id: "dictionary", kind: .command, section: useWith, title: t("launcher_dictionary"), detail: t("launcher_command"), symbol: "book") { _ in openFeature(.dictionary, trimmed) }) }
            result.append(.init(id: "web", kind: .command, section: useWith, title: t("launcher_web"), detail: t("launcher_command"), symbol: "magnifyingglass") { _ in
                var components = URLComponents(string: "https://www.google.com/search")!; components.queryItems = [URLQueryItem(name: "q", value: trimmed)]
                if let url = components.url { NSWorkspace.shared.open(url) }; dismiss()
            })
        }
        return result
    }

    var body: some View {
        let rows = items, chosen = rows.first { $0.id == selectedID } ?? rows.first
        VStack(spacing: 0) {
            HStack(spacing: metric("gap")) {
                Image(systemName: "magnifyingglass").font(.vzn("titleScale")).foregroundStyle(.secondary)
                TextField(t("launcher_placeholder"), text: $query).textFieldStyle(.plain).font(.vzn("titleScale")).focused($focused)
                    .onSubmit { activate(current()) }
                    .onChange(of: keys.last?.serial) { _, _ in
                        switch keys.last?.key {
                        case .down: move(1)
                        case .up: move(-1)
                        case .tab: askAI(trimmed)
                        case .escape: if query.isEmpty { dismiss() } else { query = "" }
                        case nil: break
                        }
                    }
                    .accessibilityLabel(t("launcher_placeholder"))
                HStack(spacing: metric("tight")) { Text(t("launcher_ai_hint")).font(.vzn("smallScale")).foregroundStyle(.secondary); KeyCap(text: "⇥") }
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, metric("inset")).frame(height: metric("navControl") + metric("small"))
            if !rows.isEmpty {
                Divider()
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(Array(rows.enumerated()), id: \.element.id) { index, item in
                                if index == 0 || rows[index - 1].section != item.section {
                                    Text(item.section).font(.vzn("captionScale", .semibold)).foregroundStyle(.secondary)
                                        .padding(.horizontal, metric("small")).padding(.top, metric("small")).padding(.bottom, metric("tight"))
                                }
                                row(item, selected: item.id == chosen?.id).id(item.id)
                                    .onTapGesture { selectedID = item.id; activate(item) }
                            }
                        }.padding(metric("small"))
                    }
                    .frame(maxHeight: metric("reading") * 0.5)
                    .onChange(of: selectedID) { _, value in if let value { proxy.scrollTo(value) } }
                }
            }
            if !appsLoaded || failed {
                Text(t(failed ? "launcher_open_failed" : "launcher_loading")).font(.vzn("smallScale")).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, metric("inset")).padding(.vertical, metric("small"))
            }
            if let chosen {
                Divider()
                HStack(spacing: metric("gap")) {
                    Text(chosen.title).lineLimit(1).truncationMode(.middle)
                    Spacer()
                    if chosen.kind == .file { hint(t("launcher_reveal"), "⇧ ↵") }
                    hint(t(chosen.kind == .calculator || chosen.kind == .currency ? "launcher_copy" : "launcher_open"), "↵")
                    if chosen.kind != .command || chosen.id != "ai" { hint(t("launcher_ai"), "⌘ ↵") }
                }
                .font(.vzn("smallScale")).foregroundStyle(.secondary)
                .padding(.horizontal, metric("inset")).padding(.vertical, metric("small"))
                .background(contentColor("surface-muted", scheme))
            }
        }
        .background(GeometryReader { geometry in Color.clear.onChange(of: geometry.size.height, initial: true) { _, value in resize(value) } })
        .background(contentColor("surface", scheme), in: RoundedRectangle(cornerRadius: metric("largeRadius")))
        .clipShape(RoundedRectangle(cornerRadius: metric("largeRadius")))
        .overlay(RoundedRectangle(cornerRadius: metric("largeRadius")).strokeBorder(contentColor("border-strong", scheme), lineWidth: metric("hairline")))
        .frame(width: metric("reading"))
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxHeight: .infinity, alignment: .top)
        .onChange(of: query) { _, _ in selectedID = nil; failed = false }
        .task { focused = true; apps = await Task.detached { LauncherCatalog.applications() }.value; appsLoaded = true }
        .task(id: query) {
            files = []; currency = nil; let input = trimmed
            do { try await Task.sleep(for: .milliseconds(250)) } catch { return }
            async let found = Task.detached { LauncherFiles.search(input) }.value
            async let converted = CurrencyRates.shared.convert(input)
            let (fileResult, currencyResult) = await (found, converted)
            if !Task.isCancelled && trimmed == input { files = fileResult; currency = currencyResult }
        }
    }

    private func row(_ item: LauncherItem, selected: Bool) -> some View {
        HStack(spacing: metric("gap")) {
            Group {
                if let path = item.path { Image(nsImage: NSWorkspace.shared.icon(forFile: path)).resizable() }
                else { Image(systemName: item.symbol).foregroundStyle(contentColor("action-text", scheme)) }
            }.frame(width: metric("icon"), height: metric("icon"))
            Text(item.title).lineLimit(1).truncationMode(.middle)
            Spacer(minLength: metric("gap"))
            Text(item.detail).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(1).truncationMode(.head)
        }
        .padding(.horizontal, metric("small")).frame(height: metric("navControl"))
        .background(selected ? contentColor("action-soft", scheme) : .clear, in: RoundedRectangle(cornerRadius: metric("controlRadius")))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine).accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
    private func hint(_ label: String, _ key: String) -> some View {
        HStack(spacing: metric("tight")) { Text(label); KeyCap(text: key) }
    }
    /// Read at key time: the field editor keeps the closures it was first given.
    private func current() -> LauncherItem? { let rows = items; return rows.first { $0.id == selectedID } ?? rows.first }
    private func move(_ step: Int) {
        let rows = items
        guard !rows.isEmpty else { return }
        let index = rows.firstIndex { $0.id == current()?.id } ?? 0
        selectedID = rows[(index + step + rows.count) % rows.count].id
    }
    /// ↵ runs the selected row; ⇧↵ reveals a file; ⌘↵ asks AI about what was typed.
    private func activate(_ item: LauncherItem?) {
        let flags = NSApp.currentEvent?.modifierFlags ?? []
        if flags.contains(.command), !trimmed.isEmpty { askAI(trimmed); return }
        item?.run(flags.contains(.shift))
    }
    private func copy(_ value: String) { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(value, forType: .string); dismiss() }
    private func launch(_ app: LauncherApplication) {
        var recent = UserDefaults.standard.stringArray(forKey: "launcher.recent") ?? []; recent.removeAll { $0 == app.id }; recent.insert(app.id, at: 0)
        UserDefaults.standard.set(Array(recent.prefix(50)), forKey: "launcher.recent")
        NSWorkspace.shared.openApplication(at: URL(fileURLWithPath: app.id), configuration: .init()) { _, failure in
            Task { @MainActor in if failure == nil { dismiss() } else { failed = true } }
        }
    }
}

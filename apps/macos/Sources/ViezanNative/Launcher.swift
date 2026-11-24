import SwiftUI
import AppKit
import ViezanDomain

/// The launcher: a floating search window (Spotlight-like) for apps, files, quick
/// calculations and sending text to Viezan. It takes keyboard focus without activating the
/// main window, sits 22% below the top of the pointer's screen, and hides when it loses focus.
/// Tab or ⌘↵ turns the same window into a quick AI conversation (`LauncherChatView`).
@MainActor final class Launcher {
    struct Actions {
        var openFeature: (Feature, String) -> Void
        /// A main-window route: a feature page, "interpret" or "settings".
        var openRoute: (String) -> Void
        /// A chat session to continue in AI Chat, or nil for the AI Chat page.
        var openChat: (String?) -> Void
        /// A Settings section, e.g. "providers".
        var openSettings: (String) -> Void
    }
    private final class KeyPanel: NSPanel {
        var onHide: (() -> Void)?
        override var canBecomeKey: Bool { true }
        override func orderOut(_ sender: Any?) { onHide?(); super.orderOut(sender) }
        override func cancelOperation(_ sender: Any?) { orderOut(nil) }
    }
    /// Keys the search field would otherwise swallow (arrows move its caret), relayed to the list.
    @MainActor @Observable final class Keys {
        enum Key { case up, down, tab, escape, openInChat, newChat }
        private(set) var last: (key: Key, serial: Int)?
        /// The quick AI conversation edits text: arrows and Tab keep their usual meaning there.
        var chat = false
        var changingAppearance = false
        @ObservationIgnored var fileSearch: Task<Void, Never>?
        func cancelFileSearch() { fileSearch?.cancel(); fileSearch = nil }
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
        keys.chat = false
        window.contentView = NSHostingView(rootView: LauncherView(store: store, keys: keys, generation: generation, dismiss: { [weak self] in self?.dismiss() },
            resize: { [weak self] height in self?.resize(height) },
            openFeature: { [weak self] feature, text in self?.dismiss(); self?.actions.openFeature(feature, text) },
            openRoute: { [weak self] route in self?.dismiss(); self?.actions.openRoute(route) },
            openChat: { [weak self] id in self?.dismiss(); self?.actions.openChat(id) },
            openSettings: { [weak self] section in self?.dismiss(); self?.actions.openSettings(section) }))
        resize(metric("navControl") + metric("gutter"))
        place(window)
        window.makeKeyAndOrderFront(nil)
        if monitor == nil {
            monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
                guard let self, let panel = self.panel, event.window === panel, panel.isVisible else { return event }
                if (panel.firstResponder as? NSTextView)?.hasMarkedText() == true { return event }
                let modifiers = event.modifierFlags.intersection([.command, .option, .control, .shift]), plain = modifiers.isEmpty
                if self.keys.chat {
                    switch (event.keyCode, modifiers) {
                    case (53, _): self.keys.send(.escape); return nil
                    case (36, .command), (76, .command): self.keys.send(.openInChat); return nil
                    case (45, .command): self.keys.send(.newChat); return nil
                    default: return event
                    }
                }
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
        window.onHide = { [keys] in keys.cancelFileSearch() }
        window.isOpaque = false; window.backgroundColor = .clear; window.hasShadow = true; window.isMovableByWindowBackground = true
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        // Clicking elsewhere hides it, like the system's search.
        resign = NotificationCenter.default.addObserver(forName: NSWindow.didResignKeyNotification, object: window, queue: .main) { [weak window, keys] _ in
            MainActor.assumeIsolated {
                // The Automation prompt can temporarily take keyboard focus.
                if !keys.changingAppearance { window?.orderOut(nil) }
            }
        }
        return window
    }
    private func place(_ window: NSWindow) {
        let pointer = NSEvent.mouseLocation
        guard let screen = NSScreen.screens.first(where: { $0.frame.contains(pointer) }) ?? NSScreen.main else { return }
        let bounds = screen.visibleFrame
        window.setFrameTopLeftPoint(NSPoint(x: bounds.midX - window.frame.width / 2, y: bounds.maxY - bounds.height * metric("launcherTop")))
    }
    /// The view reports its height; grow or shrink downward from a fixed top edge.
    private func resize(_ height: CGFloat) {
        guard let panel else { return }
        let top = panel.frame.maxY, value = min(max(height, metric("navControl") + metric("gutter")), metric("reading") * metric("launcherHeight"))
        guard abs(panel.frame.height - value) > 0.5 else { return }
        panel.setFrame(NSRect(x: panel.frame.minX, y: top - value, width: metric("reading"), height: value), display: true)
    }
}

private struct LauncherItem: Identifiable {
    enum Kind { case calculator, currency, app, file, command, control }
    let id: String
    let kind: Kind
    var section: String
    let title: String
    var detail = ""
    /// A second line under the title (exchange rate and date).
    var subtitle = ""
    var symbol = ""
    var controlOn: Bool?
    var busy = false
    var unavailable: Bool { busy || (kind == .control && controlOn == nil) }
    var path: String?
    /// Replaces the type label (the currency row's target picker).
    var accessory: AnyView?
    let run: (_ alternate: Bool) -> Void
    func with(section: String) -> LauncherItem { var copy = self; copy.section = section; return copy }
}

private struct LauncherView: View {
    let store: WorkbenchStore
    let keys: Launcher.Keys
    let generation: Int
    var dismiss: () -> Void
    var resize: (CGFloat) -> Void
    var openFeature: (Feature, String) -> Void
    var openRoute: (String) -> Void
    var openChat: (String?) -> Void
    var openSettings: (String) -> Void
    private enum RatesState: Equatable { case idle, loading, ready(CurrencySnapshot), unavailable }
    @State private var chatting = false
    @State private var chatID: String?
    @State private var question = ""
    @State private var sendOnOpen = false
    @State private var query = ""
    @State private var apps: [LauncherApplication] = []
    @State private var appsLoaded = false
    @State private var appsUnavailable = false
    @State private var catalogAttempt = 0
    @State private var files: [LauncherFile] = []
    private enum AIFileState {
        case idle, thinking(String), searching, results(FileSearchPlan, [LauncherFile]), failure(key: String, model: String)
    }
    @State private var aiFiles = AIFileState.idle
    @State private var rates = RatesState.idle
    @AppStorage("launcher.currencyTarget") private var currencyTarget = ""
    // By id, not position: results that arrive later (files, rates) must not move the choice.
    @State private var selectedID: String?
    @State private var failedID: String?
    @State private var controlFailureKey = "launcher_control_failed"
    @State private var muteRevision = 0
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
        // "= 2+2" is the calculator's own prefix (the footer teaches it); the sign is not part of the sum.
        let sum = trimmed.hasPrefix("=") ? trimmed.dropFirst().trimmingCharacters(in: .whitespaces) : trimmed
        if let value = LauncherCalculator.evaluate(sum) {
            result.append(.init(id: "calc", kind: .calculator, section: section("launcher_calculator"), title: sum + " = " + value, detail: t("launcher_calculator"), symbol: "function") { _ in copy(value) })
        } else if let currency = currencyItem { result.append(currency) }
        // "t …", "d …" and "? …" go straight to Translate, Dictionary or Quick AI, as in the command palette.
        if let prefixed = LauncherPrefix.row(trimmed, enabled: store.moduleEnabled) {
            let title = t(prefixed.title).replacingOccurrences(of: "{text}", with: prefixed.text).replacingOccurrences(of: "{query}", with: prefixed.text)
            result.append(.init(id: "prefix", kind: .command, section: section("launcher_section_suggestions"), title: title, detail: t("launcher_command"), symbol: prefixed.symbol) { _ in
                switch prefixed.query {
                case .ask(let text): askAI(text)
                case .translate(let text): openFeature(.translate, text)
                case .lookup(let text): openFeature(.dictionary, text)
                case .calculation: break
                }
            })
        }
        let quick = QuickAISession.current(store), fresh = QuickAISession.fresh(store)
        let continueQuick = quick.map { session in
            LauncherItem(id: "continue", kind: .command, section: "", title: t("launcher_continue"), detail: store.title(session), symbol: "sparkles") { _ in resume(session.id) }
        }
        let recent = UserDefaults.standard.stringArray(forKey: "launcher.recent") ?? []
        for app in LauncherRanking.applications(apps, query: trimmed, recent: recent, limit: trimmed.isEmpty ? 6 : 8) {
            result.append(.init(id: app.id, kind: .app, section: section(trimmed.isEmpty ? "launcher_section_recent" : "launcher_section_apps"), title: app.name, detail: t("launcher_app"), path: app.id) { _ in launch(app) })
        }
        if trimmed.isEmpty, !fresh, let continueQuick { result.append(continueQuick.with(section: section("launcher_section_recent"))) }
        let displayed: ArraySlice<LauncherFile>
        if case let .results(_, found) = aiFiles { displayed = found.prefix(8) } else { displayed = files.prefix(5) }
        for file in displayed {
            let folder = (file.id as NSString).deletingLastPathComponent.replacingOccurrences(of: FileManager.default.homeDirectoryForCurrentUser.path, with: "~")
            let meta = file.modified.map { folder + " · " + relativeTime($0, store: store) } ?? folder
            let subtitle = file.contentMatch ? t("launcher_file_content_match").replacingOccurrences(of: "{meta}", with: meta) : meta
            result.append(.init(id: file.id, kind: .file, section: section("launcher_section_files"), title: file.name, detail: t(file.isDirectory ? "launcher_folder" : "launcher_file"), subtitle: subtitle, path: file.id) { reveal in
                let url = URL(fileURLWithPath: file.id)
                if reveal { NSWorkspace.shared.activateFileViewerSelecting([url]); dismiss() } else if NSWorkspace.shared.open(url) { dismiss() } else { failedID = file.id }
            })
        }
        // Viezan's own pages: all of them on an empty query, the matching ones while typing.
        var viezan: [LauncherItem] = []
        if trimmed.isEmpty, fresh, let continueQuick { viezan.append(continueQuick) }
        for page in LauncherHome.pages(enabled: store.moduleEnabled) {
            viezan.append(.init(id: "page-" + page.route, kind: .command, section: "", title: t(page.title), detail: t("launcher_command"), symbol: page.symbol) { _ in openRoute(page.route) })
        }
        let options: String.CompareOptions = [.caseInsensitive, .diacriticInsensitive]
        // While typing, the Settings sections the query names (title or search terms), each opening
        // Settings on that section.
        for found in nativeResources.settingsJump(query: trimmed, locale: store.workspace.locale) {
            viezan.append(.init(id: "settings-" + found.id, kind: .command, section: "", title: t(found.title), detail: t("settings"), symbol: "gearshape") { _ in openSettings(found.id) })
        }
        result += viezan.filter { trimmed.isEmpty || $0.id.hasPrefix("settings-") || $0.title.range(of: trimmed, options: options) != nil }.map { $0.with(section: section("launcher_section_viezan")) }
        result += LauncherControls.rows(trimmed, text: t).map(controlItem)
        // A prefixed query already says what to do with the text; "Use with" would offer it again, prefix included.
        if !trimmed.isEmpty, LauncherPrefix.row(trimmed, enabled: store.moduleEnabled) == nil {
            let useWith = section("launcher_section_use_with", query: trimmed.count > 40 ? String(trimmed.prefix(40)) + "…" : trimmed)
            result.append(.init(id: "ai", kind: .command, section: useWith, title: t(fresh ? "launcher_ai_followup" : "launcher_ai"), detail: t("launcher_command"), symbol: "sparkles") { _ in askAI(trimmed) })
            if LauncherAIFileRow.visible(trimmed, locale: store.workspace.locale, utilities: store.moduleEnabled("utilities")) {
                let model = store.workspace.defaultModel ?? (fresh ? quick?.model : nil) ?? store.appModel
                result.append(aiFileItem(section: useWith, model: model))
            }
            if store.moduleEnabled("translate") { result.append(.init(id: "translate", kind: .command, section: useWith, title: t("launcher_translate"), detail: t("launcher_command"), symbol: "character.bubble") { _ in openFeature(.translate, trimmed) }) }
            if store.moduleEnabled("dictionary") { result.append(.init(id: "dictionary", kind: .command, section: useWith, title: t("launcher_dictionary"), detail: t("launcher_command"), symbol: "book") { _ in openFeature(.dictionary, trimmed) }) }
            result.append(.init(id: "web", kind: .command, section: useWith, title: t("launcher_web"), detail: t("launcher_command"), symbol: "magnifyingglass") { _ in
                var components = URLComponents(string: "https://www.google.com/search")!; components.queryItems = [URLQueryItem(name: "q", value: trimmed)]
                if let url = components.url { NSWorkspace.shared.open(url) }; dismiss()
            })
        }
        return result
    }

    private func aiFileItem(section: String, model: String) -> LauncherItem {
        let ready = store.providers.availability(model) == .available
        let local = ProviderDiscovery.localProviders.contains { model.hasPrefix($0 + ":") }
        let note = ready ? (local ? "launcher_ai_files_local_note" : "launcher_ai_files_cloud_note") : "launcher_ai_files_no_model"
        return .init(id: LauncherAIFileRow.id, kind: .command, section: section, title: t("launcher_ai_files"), detail: t("launcher_command"),
                     subtitle: t(note).replacingOccurrences(of: "{model}", with: ModelLineup.shortName(model)),
                     symbol: "doc.text.magnifyingglass", busy: keys.fileSearch != nil) { _ in
            if ready { findFiles(trimmed, model: model) } else { openSettings("providers") }
        }
    }

    private func announceFiles(_ message: String, priority: NSAccessibilityPriorityLevel = .medium) {
        NSAccessibility.post(element: NSApplication.shared, notification: .announcementRequested,
                             userInfo: [.announcement: message, .priority: priority.rawValue])
    }

    private func cancelFileSearch() {
        keys.cancelFileSearch()
        aiFiles = .idle
        if failedID == LauncherAIFileRow.id { failedID = nil }
    }

    private func findFiles(_ input: String, model: String) {
        guard keys.fileSearch == nil else { return }
        selectedID = LauncherAIFileRow.id
        focused = true
        failedID = nil
        let thinking = t("launcher_ai_files_thinking").replacingOccurrences(of: "{model}", with: ModelLineup.shortName(model))
        aiFiles = .thinking(thinking)
        announceFiles(thinking)
        keys.fileSearch = Task { @MainActor in
            defer { if !Task.isCancelled { keys.fileSearch = nil } }
            do {
                let plan = try await store.planFileSearch(input, model: model)
                try Task.checkCancellation()
                aiFiles = .searching
                // A structured child runs mdfind off the main actor and inherits cancellation.
                let found = try await withThrowingTaskGroup(of: [LauncherFile].self) { group in
                    group.addTask { try Array(FileSearchPlan.search(plan).prefix(8)) }
                    return try await group.next() ?? []
                }
                try Task.checkCancellation()
                aiFiles = .results(plan, found)
                if let first = found.first { selectedID = first.id }
                let message = found.isEmpty ? emptyFileMessage(plan) : t("launcher_ai_files_announced_done").replacingOccurrences(of: "{count}", with: String(found.count))
                announceFiles(message)
            } catch {
                guard !Task.isCancelled else { return }
                let key: String
                switch error as? FileSearchPlanningError {
                case .noModel: key = "launcher_ai_files_no_model"
                case .badResponse: key = "launcher_ai_files_bad_response"
                case .provider(let code): key = code
                case nil: key = "launcher_ai_files_spotlight_unavailable"
                }
                guard selectedID == LauncherAIFileRow.id else { aiFiles = .idle; return }
                aiFiles = .failure(key: key, model: model)
                failedID = LauncherAIFileRow.id
                announceFiles(t(key), priority: .high)
            }
        }
    }

    private func emptyFileMessage(_ plan: FileSearchPlan) -> String {
        t("launcher_ai_files_empty").replacingOccurrences(of: "{summary}", with: plan.summary(text: t))
    }

    private func controlState(_ control: LauncherControls) -> Bool? {
        switch control {
        case .awake: return store.systemControls.keepAwake
        case .mute:
            // Core Audio owns this value. Invalidate the row after a write and read it from the device.
            _ = muteRevision
            return store.systemControls.outputMuted()
        case .dark:
            // Read the system preference again when the Apple Event finishes.
            _ = keys.changingAppearance
            return store.systemControls.darkMode()
        }
    }

    private func controlItem(_ control: LauncherControls) -> LauncherItem {
        let on = controlState(control), subtitle: String, symbol: String
        switch control {
        case .awake:
            subtitle = t("launcher_control_awake_detail")
            symbol = on == true ? "cup.and.saucer.fill" : "cup.and.saucer"
        case .mute:
            subtitle = on == nil ? t("launcher_control_mute_unsupported") : ""
            symbol = on.map { $0 ? "speaker.slash.fill" : "speaker.wave.2" } ?? "speaker.slash"
        case .dark:
            subtitle = ""
            symbol = on == true ? "moon.fill" : "moon"
        }
        return .init(id: control.id, kind: .control, section: section("groupSystem"), title: t(control.nameKey),
                     detail: on.map { t($0 ? "launcher_control_on" : "launcher_control_off") } ?? t("unavailable"),
                     subtitle: subtitle, symbol: symbol, controlOn: on) { _ in toggleControl(control) }
    }

    private func toggleControl(_ control: LauncherControls) {
        if control == .dark && keys.changingAppearance { return }
        selectedID = control.id
        focused = true
        failedID = nil
        let changed: Bool
        switch control {
        case .awake: changed = store.systemControls.setKeepAwake(!store.systemControls.keepAwake)
        case .mute:
            muteRevision += 1
            guard let muted = store.systemControls.outputMuted() else { return }
            changed = store.systemControls.setOutputMuted(!muted)
        case .dark:
            keys.changingAppearance = true
            Task { @MainActor in
                let controls = store.systemControls
                let result = await controls.setDarkMode(!controls.darkMode())
                keys.changingAppearance = false
                guard selectedID == control.id, !chatting else { return }
                finishControl(control, changed: result == .changed,
                              failureKey: result == .denied ? "launcher_control_dark_denied" : "launcher_control_failed")
            }
            return
        }
        finishControl(control, changed: changed)
    }

    private func finishControl(_ control: LauncherControls, changed: Bool, failureKey: String = "launcher_control_failed") {
        let message: String
        if changed {
            guard let on = controlState(control) else { return }
            message = t(on ? "launcher_control_announced_on" : "launcher_control_announced_off").replacingOccurrences(of: "{name}", with: t(control.nameKey))
        } else {
            failedID = control.id
            controlFailureKey = failureKey
            message = t(failureKey)
        }
        NSAccessibility.post(element: NSApplication.shared, notification: .announcementRequested,
                             userInfo: [.announcement: message, .priority: (changed ? NSAccessibilityPriorityLevel.medium : .high).rawValue])
    }

    var body: some View {
        Group {
            if chatting {
                LauncherChatView(store: store, keys: keys, sessionID: $chatID, question: $question, sendOnOpen: $sendOnOpen,
                                 back: { chatting = false; keys.chat = false; focused = true },
                                 dismiss: dismiss, openInChat: openChat, openSettings: openSettings)
                    .frame(height: metric("reading") * metric("launcherHeight"))
            } else { search }
        }
        .background(GeometryReader { geometry in Color.clear.onChange(of: geometry.size.height, initial: true) { _, value in resize(value) } })
        // Launcher board: the `.float` glass layer (raised white over a heavy blur, bo 20).
        .background { ReadingPanelSurface() }
        .clipShape(RoundedRectangle(cornerRadius: metric("surfaceRadius"), style: .continuous))
        .frame(width: metric("reading"))
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxHeight: .infinity, alignment: .top)
    }

    private var search: some View {
        let rows = items, chosen = rows.first { $0.id == selectedID } ?? rows.first
        let failed = failedID != nil && failedID == chosen?.id
        return VStack(spacing: 0) {
            HStack(spacing: metric("gap")) {
                Image(systemName: "magnifyingglass").font(.vzn("titleScale")).foregroundStyle(.secondary)
                TextField(t("launcher_placeholder"), text: Binding(get: { query }, set: { changeQuery($0) })).textFieldStyle(.plain).font(.vzn("titleScale")).focused($focused)
                    .onSubmit {
                        guard (NSApp.keyWindow?.firstResponder as? NSTextView)?.hasMarkedText() != true else { return }
                        activate(current())
                    }
                    .onChange(of: keys.last?.serial) { _, _ in
                        switch keys.last?.key {
                        case .down: move(1)
                        case .up: move(-1)
                        case .tab: askAI(trimmed)
                        case .openInChat, .newChat: break
                        case .escape:
                            if keys.fileSearch != nil { cancelFileSearch() }
                            else if query.isEmpty { dismiss() }
                            else { changeQuery("") }
                        case nil: break
                        }
                    }
                    .accessibilityLabel(t("launcher_placeholder"))
                HStack(spacing: metric("tight")) { Text(t("launcher_ai_hint")).font(.vzn("labelScale")).foregroundStyle(.secondary); KeyCap(text: "⇥") }
                    .accessibilityHidden(true)
            }
            // Glass: a 60 pt search head with 18 pt text.
            .padding(.horizontal, metric("gutter") - metric("tight")).frame(height: metric("navControl") + metric("small") + metric("gap"))
            if !rows.isEmpty {
                CardDivider()
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(Array(rows.enumerated()), id: \.element.id) { index, item in
                                if index == 0 || rows[index - 1].section != item.section {
                                    Eyebrow(text: item.section).padding(.horizontal, metric("small") + metric("hairline") * 2).padding(.top, metric("gap")).padding(.bottom, metric("tight"))
                                    if item.kind == .file, case .results(let plan, _) = aiFiles {
                                        Text(t("launcher_ai_files_understood").replacingOccurrences(of: "{summary}", with: plan.summary(text: t)))
                                            .font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(1).padding(.horizontal, metric("small"))
                                    }
                                }
                                row(item, selected: item.id == chosen?.id).id(item.id)
                                    .onTapGesture { selectedID = item.id; activate(item) }
                                    .disabled(item.unavailable)
                            }
                        }.padding(metric("small"))
                    }
                    .frame(maxHeight: metric("reading") * metric("launcherResults"))
                    // A failure belongs to the row that failed: moving on clears it, so Retry never runs another row.
                    .onChange(of: selectedID) { _, value in
                        if failedID != value { failedID = nil }
                        if let value { proxy.scrollTo(value) }
                    }
                }
            }
            notice(chosen: chosen, failed: failed)
                .padding(.horizontal, metric("gap") + metric("hairline") * 2).padding(.bottom, metric("small")).padding(.top, rows.isEmpty ? metric("small") : 0)
            if let chosen {
                CardDivider()
                HStack(spacing: metric("gap")) {
                    // Before anything is typed the footer teaches the prefixes (Launcher board).
                    Text(trimmed.isEmpty ? t("launcher_prefix_hint") : chosen.title).lineLimit(1).truncationMode(.middle)
                    Spacer()
                    if chosen.kind == .file { hint(t("launcher_reveal"), "⇧ ↵") }
                    if chosen.kind == .control {
                        if let on = chosen.controlOn { hint(t(on ? "launcher_control_turn_off" : "launcher_control_turn_on"), "↵") }
                    } else {
                        hint(chosen.id == "ai" ? chosen.title : t(chosen.kind == .calculator || chosen.kind == .currency ? "launcher_copy" : "launcher_open"), "↵")
                    }
                    if chosen.kind != .command || chosen.id != "ai" { hint(t("launcher_ai"), "⌘ ↵") }
                }
                .font(.vzn("smallScale")).foregroundStyle(.secondary)
                .padding(.horizontal, metric("inset")).padding(.vertical, 0)
                .frame(minHeight: metric("control"))
                .background(contentColor("surface-muted", scheme))
            }
        }
        .task { focused = true }
        .task(id: catalogAttempt) {
            appsLoaded = false; appsUnavailable = false
            let result = await Task.detached(priority: .utility) { Result { try LauncherCatalog.catalog() } }.value
            guard !Task.isCancelled else { return }
            switch result {
            case .success(let found): apps = found
            case .failure: appsUnavailable = true
            }
            appsLoaded = true
        }
        .task(id: query) {
            files = []; let input = trimmed
            do { try await Task.sleep(for: .milliseconds(150)) } catch { return }
            let found = await Task.detached { LauncherFiles.search(input) }.value
            if !Task.isCancelled && trimmed == input { files = found }
        }
        // Rates are fetched only once a query reads as money, never on every open.
        .task(id: currencyQuery != nil) { if currencyQuery != nil, rates == .idle { await loadRates(retry: false) } }
    }

    private func changeQuery(_ value: String) {
        guard value != query else { return }
        cancelFileSearch()
        selectedID = nil
        failedID = nil
        query = value
    }

    @ViewBuilder private func notice(chosen: LauncherItem?, failed: Bool) -> some View {
        if failed, let chosen {
            if chosen.id == LauncherAIFileRow.id, case .failure(let key, let model) = aiFiles {
                HStack(spacing: metric("small")) {
                    InlineFailure(title: t(key))
                    if key == "launcher_ai_files_no_model" {
                        Button(t("quickOpenSettings")) { openSettings("providers") }.buttonStyle(.vznOutline).fixedSize()
                    } else if key != "launcher_ai_files_spotlight_unavailable" {
                        retryButton {
                            guard failedID == chosen.id else { return }
                            findFiles(trimmed, model: model)
                        }
                    }
                }
            } else {
                HStack(spacing: metric("small")) {
                    InlineFailure(title: t(chosen.kind == .control ? controlFailureKey : "launcher_open_failed"))
                    retryButton {
                        guard chosen.id == failedID else { return }
                        failedID = nil
                        chosen.run(false)
                    }
                }
            }
        } else if case .thinking(let message) = aiFiles {
            noticeChip(message, tone: .busy)
        } else if case .searching = aiFiles {
            noticeChip(t("launcher_ai_files_searching"), tone: .busy)
        } else if case .results(let plan, let found) = aiFiles, found.isEmpty {
            noticeChip(emptyFileMessage(plan), tone: .idle)
        } else if !appsLoaded {
            noticeChip(t("launcher_loading"), tone: .busy)
        } else if appsUnavailable {
            HStack(spacing: metric("small")) {
                InlineFailure(title: t("launcher_apps_unavailable"))
                retryButton { catalogAttempt += 1 }
            }
        }
    }

    private func noticeChip(_ message: String, tone: StatusTone) -> some View {
        StatusBadge(text: message, tone: tone).frame(maxWidth: .infinity, alignment: .leading).clipped().help(message)
    }

    private func retryButton(_ action: @escaping () -> Void) -> some View {
        Button(t("launcher_retry"), action: action).buttonStyle(.vznOutline).fixedSize().accessibilityIdentifier("launcher-retry")
    }

    private func row(_ item: LauncherItem, selected: Bool) -> some View {
        HStack(spacing: metric("gap")) {
            Group {
                if let path = item.path { Image(nsImage: NSWorkspace.shared.icon(forFile: path)).resizable() }
                else {
                    // Launcher board: commands sit on a 28 pt toned tile.
                    Image(systemName: item.symbol).foregroundStyle(contentColor(tone(item), scheme))
                        .frame(width: metric("compactControl") - metric("tight"), height: metric("compactControl") - metric("tight"))
                        .background(contentColor(tone(item), scheme).opacity(metric("selectionOpacity") * 1.5), in: RoundedRectangle(cornerRadius: metric("chromeShortcutRadius"), style: .continuous))
                }
            }.frame(width: metric("compactControl") - metric("tight"), height: metric("compactControl") - metric("tight"))
            VStack(alignment: .leading, spacing: 0) {
                Text(item.title).font(.vzn("labelScale", .medium)).lineLimit(1).truncationMode(.middle)
                if !item.subtitle.isEmpty { Text(item.subtitle).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(1) }
            }
            Spacer(minLength: metric("gap"))
            if let accessory = item.accessory { accessory }
            else { Text(item.detail).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(1).truncationMode(.head) }
        }
        .padding(.horizontal, metric("small")).padding(.vertical, item.subtitle.isEmpty ? 0 : metric("tight")).frame(minHeight: metric("navControl") + metric("tight"))
        .background {
            if selected {
                GlassLens(radius: metric("radius"))
            }
        }
        .contentShape(Rectangle())
        // A row with its own control (the currency picker) keeps it reachable instead of merging it into the row.
        .accessibilityElement(children: item.accessory == nil ? .combine : .contain).accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityLabel(item.title, isEnabled: item.kind == .control)
        .accessibilityLabel(item.title + ", " + item.subtitle, isEnabled: item.kind == .file || item.id == LauncherAIFileRow.id)
        .accessibilityValue(item.detail, isEnabled: item.kind == .control || item.kind == .file)
        .accessibilityHint(item.subtitle, isEnabled: item.kind == .control && !item.subtitle.isEmpty)
    }
    /// Command tone for its icon tile: AI accent, Translate violet, Dictionary orange, the rest green/blue.
    private func tone(_ item: LauncherItem) -> String {
        if item.kind == .control {
            guard item.controlOn == true else { return "text-muted" }
            if item.id == LauncherControls.dark.id { return "tone-violet" }
            return item.id == LauncherControls.awake.id ? "tone-green" : "tone-orange"
        }
        if item.symbol == "character.bubble" { return "tone-violet" }
        if item.symbol == "book" { return "tone-orange" }
        if item.symbol == "waveform" || item.symbol == "dollarsign.circle" { return "tone-green" }
        // Launcher-States: the calculator tile is neutral.
        if item.symbol == "function" { return "text-muted" }
        return "tone-blue"
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
    /// Tab, ⌘↵ and "Ask AI" turn the window into the quick AI conversation and send what was
    /// typed; within 30 minutes of the last answer the question continues that conversation.
    private func askAI(_ text: String) {
        chatID = QuickAISession.fresh(store) ? QuickAISession.current(store)?.id : nil
        question = text; sendOnOpen = !text.isEmpty; open()
    }
    /// "Continue quick AI" reopens the saved conversation at any age without sending anything.
    private func resume(_ id: String) { chatID = id; question = ""; sendOnOpen = false; open() }
    private func open() { cancelFileSearch(); keys.chat = true; chatting = true }
    // MARK: Currency
    private var currencyQuery: CurrencyQuery? { LauncherCalculator.evaluate(trimmed) == nil ? LauncherCurrency.parse(trimmed, locale: store.workspace.locale) : nil }
    private var numberLocale: Locale { Locale(identifier: ["vi": "vi_VN", "ja": "ja_JP"][store.workspace.locale] ?? "en_US") }
    private var currencyItem: LauncherItem? {
        guard let parsed = currencyQuery else { return nil }
        let target = parsed.to ?? LauncherCurrency.defaultTarget(locale: store.workspace.locale, preferred: currencyTarget, from: parsed.from)
        let typed = parsed.amount.formatted(.number.precision(.fractionLength(0...6)).locale(numberLocale)) + " " + parsed.from
        let picker = AnyView(currencyPicker(target, from: parsed.from, typedTarget: parsed.to != nil))
        if case .ready(let snapshot) = rates, let result = snapshot.convert(parsed.amount, from: parsed.from, to: target) {
            let value = converted(result.value, target)
            let date = Date(timeIntervalSince1970: snapshot.updated).formatted(.dateTime.day().month().year().locale(numberLocale))
            let rate = t("launcher_currency_rate").replacingOccurrences(of: "{from}", with: parsed.from).replacingOccurrences(of: "{to}", with: target)
                .replacingOccurrences(of: "{rate}", with: result.rate.formatted(.number.precision(.significantDigits(1...6)).locale(numberLocale))).replacingOccurrences(of: "{date}", with: date)
            return .init(id: "currency", kind: .currency, section: section("launcher_currency"), title: typed + " = " + value + " " + target, detail: t("launcher_currency"), subtitle: rate, symbol: "dollarsign.circle", accessory: picker) { _ in copy(value) }
        }
        let unavailable = rates == .unavailable
        return .init(id: "currency", kind: .currency, section: section("launcher_currency"), title: typed + " → " + target, detail: t("launcher_currency"),
                     subtitle: t(unavailable ? "launcher_currency_unavailable" : "launcher_currency_loading"), symbol: "dollarsign.circle", accessory: picker) { _ in
            // Loading: ↵ does nothing. No rates: ↵ tries the download again.
            if unavailable { Task { await loadRates(retry: true) } }
        }
    }
    /// The converted amount in the target's own minor units (`50.900` VND, `2,15` EUR).
    private func converted(_ value: Double, _ code: String) -> String {
        let formatter = NumberFormatter(); formatter.numberStyle = .currency; formatter.locale = numberLocale; formatter.currencyCode = code
        formatter.currencySymbol = ""; formatter.internationalCurrencySymbol = ""
        return (formatter.string(from: NSNumber(value: value)) ?? String(value)).trimmingCharacters(in: .whitespaces.union(CharacterSet(charactersIn: "\u{00A0}\u{202F}")))
    }
    /// The target picker; a menu, not a popover, so the launcher keeps keyboard focus and stays open.
    private func currencyPicker(_ target: String, from: String, typedTarget: Bool) -> some View {
        Menu {
            ForEach(LauncherCurrency.codes.filter { $0 != from }, id: \.self) { code in
                Button(code + " · " + (numberLocale.localizedString(forCurrencyCode: code) ?? code)) { currencyTarget = code; selectedID = nil; focused = true }
            }
        } label: { Text(t("launcher_currency_target_named").replacingOccurrences(of: "{code}", with: target)) }
            // Launcher-States: on Glass the target picker is a small glass pill with its chevron.
            .menuStyle(.button).buttonStyle(.vznOutline).menuIndicator(.visible).controlSize(.small).fixedSize().font(.vzn("smallScale"))
            .disabled(typedTarget).help(t("launcher_currency_target"))
    }
    private func loadRates(retry: Bool) async {
        rates = .loading
        rates = await CurrencyRates.shared.rates(retry: retry).map(RatesState.ready) ?? .unavailable
    }

    /// ↵ runs the selected row; ⇧↵ reveals a file; ⌘↵ asks AI about what was typed.
    private func activate(_ item: LauncherItem?) {
        let flags = NSApp.currentEvent?.modifierFlags ?? []
        if flags.contains(.command), !trimmed.isEmpty { askAI(trimmed); return }
        guard let item, !item.unavailable else { return }
        item.run(flags.contains(.shift))
    }
    private func copy(_ value: String) { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(value, forType: .string); dismiss() }
    private func launch(_ app: LauncherApplication) {
        var recent = UserDefaults.standard.stringArray(forKey: "launcher.recent") ?? []; recent.removeAll { $0 == app.id }; recent.insert(app.id, at: 0)
        UserDefaults.standard.set(Array(recent.prefix(50)), forKey: "launcher.recent")
        NSWorkspace.shared.openApplication(at: URL(fileURLWithPath: app.id), configuration: .init()) { _, failure in
            Task { @MainActor in if failure == nil { dismiss() } else if current()?.id == app.id { failedID = app.id } }
        }
    }
}

/// The launcher row for a prefixed query; nil for plain text, a calculation, or a module that is off.
enum LauncherPrefix {
    struct Row: Equatable { var query: PaletteQuery; var title: String; var text: String; var symbol: String }
    static func row(_ input: String, enabled: (String) -> Bool) -> Row? {
        switch PaletteQuery.parse(input) {
        case .ask(let text): return Row(query: .ask(text), title: "paletteAsk", text: text, symbol: "sparkles")
        case .translate(let text): return enabled("translate") ? Row(query: .translate(text), title: "paletteTranslate", text: text, symbol: "character.bubble") : nil
        case .lookup(let text): return enabled("dictionary") ? Row(query: .lookup(text), title: "paletteLookup", text: text, symbol: "book") : nil
        case .calculation, .none: return nil
        }
    }
}

enum LauncherAIFileRow {
    static let id = "ai-files"
    static func visible(_ input: String, locale: String, utilities: Bool) -> Bool {
        let query = input.trimmingCharacters(in: .whitespacesAndNewlines)
        return utilities && query.count >= 4 && !query.hasPrefix("?") && !query.hasPrefix("=")
            && PaletteQuery.parse(query) == nil && LauncherCurrency.parse(query, locale: locale) == nil
    }
}

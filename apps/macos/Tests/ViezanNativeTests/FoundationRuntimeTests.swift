import AppKit
import SwiftUI
import Testing
import ViezanDomain
@testable import ViezanNative

@MainActor private final class FaultStorage: WorkspacePersistence {
    var snapshot: Workspace?
    var failLoad = false
    var failSave = false
    var writes = 0
    func load() throws -> Workspace? {
        if failLoad { throw StorageFailure.invalidData }
        return snapshot
    }
    func save(_ workspace: Workspace) throws {
        if failSave { throw StorageFailure.invalidData }
        snapshot = workspace
        writes += 1
    }
}

// Render the real SwiftUI workspace in an isolated, in-process host. These are
// not screenshots of the user's app and do not replace CUA/VoiceOver acceptance.
@MainActor private struct FoundationFixture: View {
    var store: WorkbenchStore
    var shell: ShellPresentation
    @State var route: String
    var body: some View {
        WorkbenchView(store: store, screen: $route, shell: shell)
            .environment(\.colorScheme, store.workspace.preferences.mode == .dark ? .dark : .light)
    }
}

@Suite(.serialized) @MainActor struct FoundationRuntimeTests {
    @Test(arguments: [AppearanceMode.light, .dark])
    func titledWindowKeepsTrafficLightsAlignedWithToggleAtNarrowWidths(mode: AppearanceMode) async throws {
        _ = NSApplication.shared
        let store = WorkbenchStore(persistence: FaultStorage(), automaticProvider: false)
        store.setLocale("ja")
        store.setAppearance(mode: mode, textSize: .large)
        let shell = ShellPresentation()
        let host = NSHostingView(rootView: FoundationFixture(store: store, shell: shell, route: "chat"))
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 640, height: 480), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isReleasedWhenClosed = false
        window.contentView = host
        window.appearance = NSAppearance(named: mode == .dark ? .darkAqua : .aqua)
        defer { window.contentView = nil; window.close() }
        func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
        // Wait for the production WindowReference to attach and establish frame minimums.
        try await Task.sleep(for: .milliseconds(50))
        for (width, height) in [(640.0, 480.0), (640, 600), (640, 480), (820, 480), (1200, 760), (640, 480)] {
            window.setFrame(NSRect(x: 0, y: 0, width: width, height: height), display: true)
            try await Task.sleep(for: .milliseconds(50))
            host.layoutSubtreeIfNeeded()
            let toggle = try #require(descendants(host).compactMap { $0 as? NSButton }.first { $0.accessibilityIdentifier() == "navigation-toggle" })
            let toggleFrame = toggle.convert(toggle.bounds, to: nil)
            for kind in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] {
                let button = try #require(window.standardWindowButton(kind))
                let frame = button.convert(button.bounds, to: nil)
                #expect(abs(frame.midY - toggleFrame.midY) < 1)
                #expect(frame.maxX < toggleFrame.minX)
            }
            #expect(abs(host.bounds.width - width) < 1)
            #expect(abs(host.bounds.height - height) < 1)
            #expect(!store.workspace.navigationCollapsed)
            if let folder = ProcessInfo.processInfo.environment["VIEZAN_NATIVE_WINDOW_EVIDENCE"],
               let frameView = host.superview {
                let directory = URL(fileURLWithPath: folder)
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let bitmap = try #require(frameView.bitmapImageRepForCachingDisplay(in: frameView.bounds))
                frameView.cacheDisplay(in: frameView.bounds, to: bitmap)
                let data = try #require(bitmap.representation(using: .png, properties: [:]))
                try data.write(to: directory.appendingPathComponent("titled-window-ja-\(mode.rawValue)-\(Int(width))-\(Int(height)).png"))
            }
        }
    }

    @Test(arguments: ["vi", "ja"], [AppearanceMode.light, .dark])
    func compactNavigationCoversRailAndDismissesAtDesktopWidth(locale: String, mode: AppearanceMode) async throws {
        _ = NSApplication.shared
        let store = WorkbenchStore(persistence: FaultStorage(), automaticProvider: false)
        store.setLocale(locale)
        store.setAppearance(mode: mode, textSize: .large)
        let shell = ShellPresentation()
        let host = NSHostingView(rootView: FoundationFixture(store: store, shell: shell, route: "chat"))
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 640, height: 480), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = host
        window.appearance = NSAppearance(named: mode == .dark ? .darkAqua : .aqua)
        defer { window.contentView = nil; window.close() }
        func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
        try await Task.sleep(for: .milliseconds(50))
        for width in [640.0, 820] {
            window.setContentSize(NSSize(width: width, height: 480))
            shell.show(.navigation)
            try await Task.sleep(for: .milliseconds(50))
            host.layoutSubtreeIfNeeded()
            let layout = ShellLayout(width: width, height: 480, collapsed: false)
            #expect(layout.navigationOverlayWidth == metric("compactSidebar"))
            let close = try #require(descendants(host).compactMap { $0 as? NSButton }.first { $0.accessibilityIdentifier() == "panel-close" })
            let frame = close.convert(close.bounds, to: nil)
            // The close control sits inside the panel, directly below titlebar;
            // the former floating card introduced an extra 16pt inset here.
            #expect(frame.maxX <= layout.navigationOverlayWidth)
            #expect(480 - frame.maxY < ShellLayout.titlebarHeight + metric("inset"))
            #expect(!store.workspace.navigationCollapsed)
            if let folder = ProcessInfo.processInfo.environment["VIEZAN_NATIVE_WINDOW_EVIDENCE"] {
                let bitmap = try #require(host.bitmapImageRepForCachingDisplay(in: host.bounds))
                host.cacheDisplay(in: host.bounds, to: bitmap)
                let data = try #require(bitmap.representation(using: .png, properties: [:]))
                let directory = URL(fileURLWithPath: folder)
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                try data.write(to: directory.appendingPathComponent("navigation-overlay-\(locale)-\(mode.rawValue)-\(Int(width)).png"))
            }
            shell.dismiss(returnFocus: false)
            try await Task.sleep(for: .milliseconds(30))
            host.layoutSubtreeIfNeeded()
            if let folder = ProcessInfo.processInfo.environment["VIEZAN_NATIVE_WINDOW_EVIDENCE"] {
                let bitmap = try #require(host.bitmapImageRepForCachingDisplay(in: host.bounds))
                host.cacheDisplay(in: host.bounds, to: bitmap)
                let data = try #require(bitmap.representation(using: .png, properties: [:]))
                try data.write(to: URL(fileURLWithPath: folder).appendingPathComponent("rail-\(locale)-\(mode.rawValue)-\(Int(width)).png"))
            }
        }
        shell.show(.navigation)
        window.setContentSize(NSSize(width: 1200, height: 480))
        try await Task.sleep(for: .milliseconds(50))
        #expect(shell.overlay == nil)
        #expect(!store.workspace.navigationCollapsed)
    }

    @Test func japaneseDarkCommandsOpenTheRowSelectedByHomeEndAndWrap() async throws {
        _ = NSApplication.shared
        let store = WorkbenchStore(persistence: FaultStorage(), automaticProvider: false)
        store.setLocale("ja")
        var opened: [String] = []
        let host = NSHostingView(rootView: NativeCommands(store: store, availableHeight: 440, execute: { opened.append($0) }, dismiss: {}).environment(\.colorScheme, .dark))
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 376, height: 440), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = host
        window.appearance = NSAppearance(named: .darkAqua)
        defer { window.contentView = nil; window.close() }
        func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
        try await Task.sleep(for: .milliseconds(50))
        let field = try #require(descendants(host).compactMap { $0 as? NSSearchField }.first)
        let delegate = try #require(field.delegate as? HistorySearch.Coordinator)
        let editor = NSTextView()
        for (selector, expected) in [(#selector(NSResponder.scrollToEndOfDocument(_:)), "navigation"), (#selector(NSResponder.moveDown(_:)), "apps"), (#selector(NSResponder.moveUp(_:)), "navigation"), (#selector(NSResponder.scrollToBeginningOfDocument(_:)), "apps")] {
            #expect(delegate.control(field, textView: editor, doCommandBy: selector))
            try await Task.sleep(for: .milliseconds(30))
            #expect(delegate.control(field, textView: editor, doCommandBy: #selector(NSResponder.insertNewline(_:))))
            #expect(opened.last == expected)
        }
        let close = try #require(descendants(host).compactMap { $0 as? ShellToolbarButton.FocusButton }.first)
        for backwards in [false, true] {
            let selector = backwards ? #selector(NSResponder.insertBacktab(_:)) : #selector(NSResponder.insertTab(_:))
            #expect(delegate.control(field, textView: editor, doCommandBy: selector))
            try await Task.sleep(for: .milliseconds(30))
            #expect(window.firstResponder === close)
            close.onTab?(backwards)
            try await Task.sleep(for: .milliseconds(30))
            #expect(field.currentEditor() != nil)
            #expect(window.firstResponder === field.currentEditor())
        }
    }

    @Test func commandSelectionWrapsAndHandlesEmptyResults() {
        #expect(CommandSelection.moved(0, by: -1, count: 7) == 6)
        #expect(CommandSelection.moved(6, by: 1, count: 7) == 0)
        #expect(CommandSelection.moved(2, by: 1, count: 7) == 3)
        #expect(CommandSelection.moved(0, by: -1, count: 0) == 0)
        #expect(CommandSelection.moved(0, by: 1, count: 1) == 0)
    }

    @Test func commandHomeEndWaitForJapaneseCompositionAndStayOptIn() {
        var first = 0
        var last = 0
        var tabs = 0
        let search = HistorySearch(query: .constant(""), label: "検索", first: { first += 1 }, last: { last += 1 }, onTab: { _ in tabs += 1 })
        let coordinator = search.makeCoordinator()
        let field = NSSearchField()
        let editor = NSTextView()
        let selectors = [#selector(NSResponder.moveToBeginningOfDocument(_:)), #selector(NSResponder.scrollToBeginningOfDocument(_:)), #selector(NSResponder.moveToEndOfDocument(_:)), #selector(NSResponder.scrollToEndOfDocument(_:)), #selector(NSResponder.insertTab(_:)), #selector(NSResponder.insertBacktab(_:))]
        editor.setMarkedText("にほん", selectedRange: NSRange(location: 3, length: 0), replacementRange: NSRange(location: NSNotFound, length: 0))
        for selector in selectors { #expect(!coordinator.control(field, textView: editor, doCommandBy: selector)) }
        #expect(first == 0 && last == 0 && tabs == 0)
        editor.unmarkText()
        for selector in selectors { #expect(coordinator.control(field, textView: editor, doCommandBy: selector)) }
        #expect(first == 2 && last == 2 && tabs == 2)
        let ordinarySearch = HistorySearch(query: .constant(""), label: "検索").makeCoordinator()
        for selector in selectors { #expect(!ordinarySearch.control(field, textView: editor, doCommandBy: selector)) }
    }

    @Test func titlebarFocusRingKeepsFullHitTargetAndDrawingInsideChrome() {
        let button = ShellToolbarButton.FocusButton(frame: NSRect(x: 0, y: 0, width: metric("control"), height: metric("control")))
        button.titlebarControl = true
        #expect(button.bounds.width == metric("control"))
        #expect(button.focusRingMaskBounds.minY >= metric("tight"))
        #expect(button.focusRingMaskBounds.maxY <= button.bounds.maxY - metric("tight"))
        #expect(button.acceptsFirstResponder)
        button.isEnabled = false
        #expect(!button.acceptsFirstResponder)
    }

    @Test func historyPanelFitsShortWindowsAndShrinksForShortResults() {
        let layout = ShellLayout(width: 640, height: 480 - ShellLayout.titlebarHeight - ShellLayout.headerHeight, collapsed: false)
        let short = HistoryPanelLayout.listHeight(content: metric("control"), available: layout.panelHeight)
        let long = HistoryPanelLayout.listHeight(content: metric("editor") * 10, available: layout.panelHeight)
        #expect(short < long)
        #expect(long + HistoryPanelLayout.chromeHeight <= layout.panelHeight)
        #expect(HistoryPanelLayout.listHeight(content: 0, available: layout.panelHeight) >= metric("control"))
    }

    @Test func anchoredPanelStaysInsideWindowAcrossWidths() {
        let widths: [CGFloat] = [640, 820, 1200, 1440]
        for width in widths {
            let layout = ShellLayout(width: width, height: 600, collapsed: false)
            for anchor in [-100.0, 0, 280, width - 20, width + 100] {
                let x = layout.panelX(anchor: anchor)
                #expect(x >= metric("inset"))
                #expect(x + layout.panelWidth <= width - metric("inset"))
            }
            let expected: CGFloat = max(metric("inset"), min(280 - layout.panelWidth, width - layout.panelWidth - metric("inset")))
            #expect(layout.panelX(anchor: 280) == expected)
            #expect(layout.panelX(anchor: width - 200) + layout.panelWidth == width - 200)
        }
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["VIEZAN_NATIVE_TEST_EVIDENCE"] != nil)) func renderFoundationLocaleWidthThemeMatrix() async throws {
        _ = NSApplication.shared
        guard let folder = ProcessInfo.processInfo.environment["VIEZAN_NATIVE_TEST_EVIDENCE"] else { return }
        let directory = URL(fileURLWithPath: folder)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        for locale in ["vi", "en", "ja"] {
            for mode in [AppearanceMode.light, .dark] {
                for width in [640.0, 820, 1200, 1440] {
                    let storage = FaultStorage()
                    var snapshot = Workspace()
                    for index in snapshot.sessions.indices {
                        snapshot.sessions[index].title = "Review 18 — Tiêu đề dài để kiểm tra cửa sổ hẹp・狭いウィンドウの長いタイトル"
                        if snapshot.sessions[index].feature == .translate {
                            snapshot.sessions[index].draft = String(repeating: "Foundation QA — Bản nháp dài vẫn đọc được trong thư viện hẹp. 日本語・Tiếng Việt.\n", count: 20)
                        }
                    }
                    storage.snapshot = snapshot
                    let store = WorkbenchStore(persistence: storage, automaticProvider: false)
                    store.setLocale(locale)
                    store.setAppearance(mode: mode, textSize: .large)
                    store.setDraft(store.session.id, "Foundation QA — 日本語・Tiếng Việt. Unsent draft.")
                    let shell = ShellPresentation()
                    let host = NSHostingView(rootView: FoundationFixture(store: store, shell: shell, route: "chat"))
                    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: width, height: 480), styleMask: [.borderless], backing: .buffered, defer: false)
                    window.isReleasedWhenClosed = false
                    window.contentView = host
                    window.appearance = NSAppearance(named: mode == .dark ? .darkAqua : .aqua)
                    window.setContentSize(NSSize(width: width, height: 480))
                    defer { window.contentView = nil; window.close() }
                    for state in ["chat", "commands", "commands-empty", "history", "activity", "settings", "translate", "library", "library-empty", "activity-populated", "activity-retry"] + (width < metric("compact") ? ["navigation"] : []) {
                        shell.dismiss(returnFocus: false)
                        shell.library = state == "library" || state == "library-empty"
                        if state == "commands-empty" { shell.show(.commands) }
                        else if state == "activity-populated" {
                            _ = store.submit(store.session.id)
                            shell.show(.activity)
                        } else if state == "activity-retry" {
                            if let task = store.running(store.session.id) { store.cancel(task.id) }
                            shell.show(.activity)
                        } else if state == "navigation" { shell.show(.navigation) }
                        else if state != "chat" && state != "library" && state != "library-empty" { shell.issue(state) }
                        try await Task.sleep(for: .milliseconds(30))
                        host.layoutSubtreeIfNeeded()
                        if state == "library-empty" || state == "commands-empty" {
                            func searchFields(in view: NSView) -> [NSSearchField] {
                                (view as? NSSearchField).map { [$0] } ?? view.subviews.flatMap { searchFields(in: $0) }
                            }
                            let field = try #require(searchFields(in: host).first)
                            field.stringValue = "no-matching-foundation-session"
                            field.delegate?.controlTextDidChange?(Notification(name: NSControl.textDidChangeNotification, object: field))
                            try await Task.sleep(for: .milliseconds(30))
                            host.layoutSubtreeIfNeeded()
                        }
                        #expect(abs(host.bounds.width - CGFloat(width)) < 0.5)
                        #expect(host.bounds.height == 480)
                        // Check actual mounted controls, not just layout arithmetic:
                        // long JA/VI titles must yield before header actions overflow.
                        func toolbarButtons(in view: NSView) -> [ShellToolbarButton.FocusButton] {
                            (view as? ShellToolbarButton.FocusButton).map { [$0] } ?? view.subviews.flatMap { toolbarButtons(in: $0) }
                        }
                        let buttons = toolbarButtons(in: host)
                        #expect(buttons.count >= 3)
                        for button in buttons {
                            let frame = button.convert(button.bounds, to: host)
                            #expect(abs(frame.height - metric("control")) < 0.5)
                            #expect(frame.minX >= 0 && frame.maxX <= host.bounds.width)
                            #expect(frame.minY >= 0 && frame.maxY <= host.bounds.height)
                            let id = button.accessibilityIdentifier()
                            if id == "navigation-toggle" {
                                #expect(abs(frame.minX - metric("trafficLights") - metric("gap")) < 0.5)
                                // Native traffic lights occupy the leading reserved strip at every width.
                                #expect(frame.maxY <= ShellLayout.titlebarHeight)
                            }
                            if ["commands-toggle", "history-toggle", "activity-toggle"].contains(id) {
                                #expect(frame.minY > ShellLayout.titlebarHeight)
                            }
                            if ["commands-toggle", "history-toggle", "activity-toggle"].contains(id) {
                                #expect(button.isAccessibilityExpanded() == (id == (shell.overlay?.rawValue ?? "") + "-toggle"))
                            }
                        }
                        let bitmap = try #require(host.bitmapImageRepForCachingDisplay(in: host.bounds))
                        host.cacheDisplay(in: host.bounds, to: bitmap)
                        let data = try #require(bitmap.representation(using: .png, properties: [:]))
                        let name = "swift-\(locale)-\(mode.rawValue)-\(Int(width))-\(state).png"
                        try data.write(to: directory.appendingPathComponent(name))
                    }
                }
            }
        }
    }

    @Test func mountedShellPreservesWorkAcrossResizeAndOverlays() async throws {
        _ = NSApplication.shared
        let storage = FaultStorage()
        let store = WorkbenchStore(persistence: storage, automaticProvider: false)
        store.setLocale("ja")
        store.setRoute("chat")
        store.setDraft(store.session.id, "下書き・Bản nháp")
        let task = try #require(store.submit(store.session.id))
        store.setDraft(store.session.id, "Unsent next message")
        store.setNavigationCollapsed(true)
        let sessions = store.workspace.sessions
        let shell = ShellPresentation()
        let host = NSHostingView(rootView: FoundationFixture(store: store, shell: shell, route: "chat"))
        // History is a native anchored panel and needs a real hosting window.
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1200, height: 600), styleMask: [.titled], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = host
        defer { window.contentView = nil; window.close() }
        host.frame = NSRect(x: 0, y: 0, width: 1200, height: 600)
        host.layoutSubtreeIfNeeded()
        await Task.yield()
        for width in [640.0, 820, 1200, 1440] {
            host.frame.size = NSSize(width: width, height: 480)
            host.layoutSubtreeIfNeeded()
            await Task.yield()
            for overlay in [ShellOverlay.commands, .history, .activity] {
                shell.issue(overlay.rawValue)
                await Task.yield()
                host.layoutSubtreeIfNeeded()
                #expect(shell.overlay == overlay)
                #expect(store.workspace.navigationCollapsed)
                #expect(store.workspace.sessions == sessions)
                #expect(store.running(store.session.id)?.id == task.id)
                shell.dismiss(returnFocus: false)
            }
        }
        store.cancel(task.id)
    }

    @Test func blockedLoadAndFailedSaveRemainRecoverableInMountedShell() async throws {
        _ = NSApplication.shared
        let storage = FaultStorage()
        storage.failLoad = true
        let store = WorkbenchStore(persistence: storage, automaticProvider: false)
        let shell = ShellPresentation()
        let host = NSHostingView(rootView: FoundationFixture(store: store, shell: shell, route: "chat"))
        host.frame = NSRect(x: 0, y: 0, width: 640, height: 480)
        host.layoutSubtreeIfNeeded()
        await Task.yield()
        let original = store.workspace
        for command in ["new", "translate", "history"] {
            shell.issue(command)
            await Task.yield()
            host.layoutSubtreeIfNeeded()
        }
        #expect(store.workspace == original)
        #expect(shell.overlay == nil)
        #expect(storage.writes == 0)
        shell.issue("settings")
        await Task.yield()
        host.layoutSubtreeIfNeeded()
        storage.failLoad = false
        store.reload()
        #expect(!store.loadBlocked)
        storage.failSave = true
        store.setDraft(store.session.id, "Keep unsaved text")
        #expect(store.storageError == "storageError")
        host.layoutSubtreeIfNeeded()
        #expect(store.session.draft == "Keep unsaved text")
        storage.failSave = false
        store.save()
        #expect(store.storageError == nil)
        #expect(storage.snapshot?.sessions.first?.draft == "Keep unsaved text")
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["VIEZAN_NATIVE_FAILURE_EVIDENCE"] != nil)) func renderStorageFailureStates() async throws {
        _ = NSApplication.shared
        let directory = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["VIEZAN_NATIVE_FAILURE_EVIDENCE"]))
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        for locale in ["vi", "en", "ja"] {
            for mode in [AppearanceMode.light, .dark] {
                for width in [640.0, 820, 1200, 1440] {
                    let storage = FaultStorage()
                    let store = WorkbenchStore(persistence: storage, automaticProvider: false)
                    store.setLocale(locale)
                    store.setAppearance(mode: mode, textSize: .large)
                    store.setDraft(store.session.id, "Unsent draft 日本語 · Tiếng Việt")
                    let shell = ShellPresentation()
                    let host = NSHostingView(rootView: FoundationFixture(store: store, shell: shell, route: "chat"))
                    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: width, height: 480), styleMask: [.borderless], backing: .buffered, defer: false)
                    window.isReleasedWhenClosed = false
                    window.contentView = host
                    window.appearance = NSAppearance(named: mode == .dark ? .darkAqua : .aqua)
                    window.setContentSize(NSSize(width: width, height: 480))
                    defer { window.contentView = nil; window.close() }
                    for failure in ["load", "save"] {
                        storage.failLoad = failure == "load"
                        store.reload()
                        storage.failSave = failure == "save"
                        if failure == "save" { store.setDraft(store.session.id, "Keep unsaved draft 日本語 · Tiếng Việt") }
                        #expect(store.loadBlocked == (failure == "load"))
                        #expect(store.storageError != nil)
                        try await Task.sleep(for: .milliseconds(30))
                        host.layoutSubtreeIfNeeded()
                        let bitmap = try #require(host.bitmapImageRepForCachingDisplay(in: host.bounds))
                        host.cacheDisplay(in: host.bounds, to: bitmap)
                        let data = try #require(bitmap.representation(using: .png, properties: [:]))
                        try data.write(to: directory.appendingPathComponent("swift-\(locale)-\(mode.rawValue)-\(Int(width))-\(failure)-error.png"))
                    }
                    storage.failSave = false
                    store.save()
                    #expect(store.storageError == nil)
                    #expect(storage.snapshot?.sessions.first?.draft == "Keep unsaved draft 日本語 · Tiếng Việt")
                }
            }
        }
    }


    @Test func searchFocusSurvivesDelayedWindowAttachmentWithoutStealingLaterFocus() async {
        _ = NSApplication.shared
        let field = HistorySearch.FocusSearchField()
        field.requestInitialFocus()
        await Task.yield()
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 640, height: 480), styleMask: [.titled], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        defer { window.close() }
        window.contentView?.addSubview(field)
        await withCheckedContinuation { continuation in DispatchQueue.main.async { continuation.resume() } }
        #expect(field.currentEditor() != nil)
        let other = NSTextField()
        window.contentView?.addSubview(other)
        window.makeFirstResponder(other)
        field.removeFromSuperview(); window.contentView?.addSubview(field)
        await withCheckedContinuation { continuation in DispatchQueue.main.async { continuation.resume() } }
        #expect(other.currentEditor() != nil)
    }

    @Test func disabledPanelActionUsesNativeDisabledState() async throws {
        _ = NSApplication.shared
        var activations = 0
        let host = NSHostingView(rootView: NativePanelButton(label: "Retry", identifier: "disabled-retry", role: .primary) { activations += 1 }.disabled(true))
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 200, height: 100), styleMask: [.titled], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false; window.contentView = host
        defer { window.close() }
        host.layoutSubtreeIfNeeded()
        func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
        let button = try #require(descendants(host).compactMap { $0 as? NSButton }.first)
        #expect(!button.isEnabled)
        #expect(!button.acceptsFirstResponder)
        button.performClick(nil)
        #expect(activations == 0)
    }

    @Test func disabledShellPrimaryIgnoresHoverAndCannotActivate() throws {
        _ = NSApplication.shared
        var activations = 0
        let host = NSHostingView(rootView: ShellToolbarButton(label: "Chat mới", symbol: "plus", identifier: "new-work", showsLabel: true, primary: true, enabled: false) { activations += 1 })
        host.frame = NSRect(x: 0, y: 0, width: 200, height: 36)
        host.layoutSubtreeIfNeeded()
        func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
        let button = try #require(descendants(host).compactMap { $0 as? ShellToolbarButton.FocusButton }.first)
        let background = button.layer?.backgroundColor
        button.hovered = true; button.refreshSurface()
        #expect(button.layer?.backgroundColor == background)
        #expect(!button.acceptsFirstResponder)
        button.performClick(nil)
        #expect(activations == 0)
    }

    @Test func changingHistoryPreviewStartsAtTopWithoutOpeningSession() async throws {
        _ = NSApplication.shared
        var snapshot = Workspace()
        let activeID = snapshot.active["chat"]!
        let firstIndex = snapshot.sessions.firstIndex { $0.id == activeID }!
        snapshot.sessions[firstIndex].title = "First preview"
        snapshot.sessions[firstIndex].draft = String(repeating: "First long draft 日本語 Tiếng Việt\n", count: 60)
        var second = Session(feature: .chat)
        second.title = "Second preview"
        second.draft = String(repeating: "Second long draft 日本語 Tiếng Việt\n", count: 60)
        snapshot.sessions.append(second)
        let storage = FaultStorage(); storage.snapshot = snapshot
        let store = WorkbenchStore(persistence: storage, automaticProvider: false)
        let host = NSHostingView(rootView: HistoryLibrary(store: store, close: {}))
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 580, height: 424), styleMask: [.titled], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false; window.contentView = host
        defer { window.close() }
        func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
        func previewScroll() throws -> NSScrollView {
            try #require(descendants(host).compactMap { $0 as? NSScrollView }
                .first { ($0.documentView?.bounds.height ?? 0) > $0.contentSize.height * 2 })
        }
        host.layoutSubtreeIfNeeded()
        try await Task.sleep(for: .milliseconds(50))
        let scroll = try previewScroll()
        scroll.contentView.scroll(to: NSPoint(x: 0, y: 500))
        scroll.reflectScrolledClipView(scroll.contentView)
        #expect(scroll.contentView.bounds.minY > 0)
        let field = try #require(descendants(host).compactMap { $0 as? NSSearchField }.first)
        field.stringValue = "Second preview"
        field.delegate?.controlTextDidChange?(Notification(name: NSControl.textDidChangeNotification, object: field))
        try await Task.sleep(for: .milliseconds(50))
        host.layoutSubtreeIfNeeded()
        #expect(try previewScroll().contentView.bounds.minY == 0)
        #expect(store.session.id == activeID)
        #expect(store.session.draft == snapshot.sessions[firstIndex].draft)
    }

    @Test func libraryEmptySearchKeepsEditorAndRestoresResultsWithoutSwitchingSession() async throws {
        _ = NSApplication.shared
        let store = WorkbenchStore(persistence: FaultStorage(), automaticProvider: false)
        store.setDraft(store.session.id, "Keep this unsent draft")
        let originalID = store.session.id
        let host = NSHostingView(rootView: HistoryLibrary(store: store, close: {}))
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 580, height: 424), styleMask: [.titled], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = host
        defer { window.close() }
        func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
        host.layoutSubtreeIfNeeded()
        try await Task.sleep(for: .milliseconds(50))
        let field = try #require(descendants(host).compactMap { $0 as? NSSearchField }.first)
        for query in ["no-matching-foundation-session", ""] {
            field.stringValue = query
            field.delegate?.controlTextDidChange?(Notification(name: NSControl.textDidChangeNotification, object: field))
            try await Task.sleep(for: .milliseconds(30))
            host.layoutSubtreeIfNeeded()
            #expect(descendants(host).compactMap { $0 as? NSSearchField }.first === field)
            let open = descendants(host).compactMap { $0 as? NSButton }.first { $0.accessibilityIdentifier() == "history-open" }
            #expect((open != nil) == query.isEmpty)
            #expect(store.session.id == originalID)
            #expect(store.session.draft == "Keep this unsent draft")
        }
    }

    @Test func activityTabCyclesWithinPanelAndActivationOpensSession() async throws {
        _ = NSApplication.shared
        let store = WorkbenchStore(persistence: FaultStorage(), automaticProvider: false)
        store.setDraft(store.session.id, "Keyboard activity fixture")
        store.submit(store.session.id)
        var opened: String?
        let host = NSHostingView(rootView: ActivityView(store: store, open: { opened = $0 }, dismiss: {}, availableHeight: 360))
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 376, height: 360), styleMask: [.titled], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = host
        defer { window.close() }
        host.layoutSubtreeIfNeeded()
        try await Task.sleep(for: .milliseconds(50))
        func key(_ code: UInt16, _ characters: String, shift: Bool = false) throws {
            let event = try #require(NSEvent.keyEvent(with: .keyDown, location: .zero,
                modifierFlags: shift ? [.shift] : [], timestamp: 0, windowNumber: window.windowNumber,
                context: nil, characters: characters, charactersIgnoringModifiers: characters,
                isARepeat: false, keyCode: code))
            window.firstResponder?.keyDown(with: event)
        }
        #expect((window.firstResponder as? NSButton)?.accessibilityIdentifier() == "activity-close")
        try key(48, "\t")
        try await Task.sleep(for: .milliseconds(30))
        #expect((window.firstResponder as? NSButton)?.accessibilityIdentifier().hasPrefix("activity-open-") == true)
        try key(48, "\t", shift: true)
        try await Task.sleep(for: .milliseconds(30))
        #expect((window.firstResponder as? NSButton)?.accessibilityIdentifier() == "activity-close")
        try key(48, "\t", shift: true)
        try await Task.sleep(for: .milliseconds(30))
        #expect((window.firstResponder as? NSButton)?.accessibilityIdentifier().hasPrefix("activity-stop-") == true)
        (window.firstResponder as? NSButton)?.performClick(nil)
        try await Task.sleep(for: .milliseconds(30))
        #expect((window.firstResponder as? NSButton)?.accessibilityIdentifier().hasPrefix("activity-retry-") == true)
        (window.firstResponder as? NSButton)?.performClick(nil)
        try await Task.sleep(for: .milliseconds(30))
        #expect((window.firstResponder as? NSButton)?.accessibilityIdentifier().hasPrefix("activity-stop-") == true)
        try key(48, "\t", shift: true)
        try await Task.sleep(for: .milliseconds(30))
        (window.firstResponder as? NSButton)?.performClick(nil)
        #expect(opened == store.session.id)
        #expect(store.running(store.session.id) != nil)
    }

    @Test func recreatedHeaderControlRestoresFocusAfterAttachment() async {
        _ = NSApplication.shared
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 640, height: 480), styleMask: [.titled], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        defer { window.close() }
        let button = ShellToolbarButton.FocusButton()
        button.requestFocusWhenAttached()
        await Task.yield()
        window.contentView?.addSubview(button)
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async { continuation.resume() }
        }
        #expect(window.firstResponder === button)
        #expect(!window.isKeyWindow)
    }

    @Test func switchingPanelsReturnsFocusToOriginalResponder() async throws {
        _ = NSApplication.shared
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 640, height: 480), styleMask: [.titled], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        defer { window.close() }
        let content = NSView(frame: window.contentLayoutRect)
        window.contentView = content
        let opener = ShellToolbarButton.FocusButton(frame: NSRect(x: 0, y: 0, width: 36, height: 36))
        opener.isBordered = false
        opener.wantsLayer = true
        opener.bounded = true
        opener.refreshSurface()
        let search = NSTextView(frame: NSRect(x: 0, y: 40, width: 200, height: 40))
        content.addSubview(opener); content.addSubview(search)
        #expect(window.makeFirstResponder(opener))
        let shell = ShellPresentation()
        shell.show(.commands, from: opener)
        #expect(window.makeFirstResponder(search))
        shell.show(.history, from: search)
        shell.dismiss()
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async { continuation.resume() }
        }
        #expect(window.firstResponder === opener)
        #expect(opener.isAccessibilityFocused())
        #expect(shell.overlay == nil)
        // Navigation/new-work dismisses must not steal focus from its destination.
        shell.show(.activity, from: opener)
        #expect(window.makeFirstResponder(search))
        shell.dismiss(returnFocus: false)
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async { continuation.resume() }
        }
        #expect(window.firstResponder === search)
        // Dismiss queues restoration. Opening a replacement before that callback
        // runs must cancel it, including when the replacement closes without focus.
        for closeReplacement in [false, true] {
            shell.show(.commands, from: opener)
            #expect(window.makeFirstResponder(search))
            shell.dismiss()
            shell.show(.history, from: search)
            if closeReplacement { shell.dismiss(returnFocus: false) }
            await withCheckedContinuation { continuation in
                DispatchQueue.main.async { continuation.resume() }
            }
            #expect(window.firstResponder === search)
            shell.dismiss(returnFocus: false)
        }
        // A control can disappear during compact/desktop reflow before restore.
        shell.show(.navigation, from: opener)
        shell.dismiss()
        opener.removeFromSuperview()
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async { continuation.resume() }
        }
        #expect(shell.focusEpochs["navigation"] == 1)
    }

    @Test func closeKeepsTaskAndQuitPersistsInterruptionOrCancelsOnSaveFailure() throws {
        let app = NSApplication.shared
        let storage = FaultStorage()
        let store = WorkbenchStore(persistence: storage, automaticProvider: false)
        let delegate = AppDelegate()
        delegate.store = store
        store.setDraft(store.session.id, "In flight")
        let task = try #require(store.submit(store.session.id))
        store.setDraft(store.session.id, "Next draft")
        #expect(!delegate.applicationShouldTerminateAfterLastWindowClosed(app))
        #expect(store.running(store.session.id)?.id == task.id)
        storage.failSave = true
        #expect(delegate.applicationShouldTerminate(app) == .terminateCancel)
        #expect(store.session.draft == "Next draft")
        storage.failSave = false
        #expect(delegate.applicationShouldTerminate(app) == .terminateNow)
        let restored = WorkbenchStore(persistence: storage, automaticProvider: false)
        #expect(restored.running(restored.session.id) == nil)
        #expect(restored.session.draft == "Next draft")
        #expect(restored.workspace.tasks.first?.status == .interrupted)
    }

    @Test func translationUsesNativeCompositionSafeSubmission() async throws {
        _ = NSApplication.shared
        let store = WorkbenchStore(persistence: FaultStorage(), automaticProvider: false)
        store.navigate(.translate)
        store.setDraft(store.session.id, "Translation draft 日本語 · Tiếng Việt")
        let host = NSHostingView(rootView: TranslationWorkspace(store: store, focusEpoch: 1))
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 640, height: 480), styleMask: [.titled], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = host
        defer { window.contentView = nil; window.close() }
        host.layoutSubtreeIfNeeded()
        await Task.yield()
        func findEditor(_ view: NSView) -> ComposerEditor.CommandTextView? {
            if let editor = view as? ComposerEditor.CommandTextView { return editor }
            for child in view.subviews { if let editor = findEditor(child) { return editor } }
            return nil
        }
        let editor = try #require(findEditor(host))
        #expect(editor.string == store.session.draft)
        let original = editor.string
        editor.insertText(" Undo marker", replacementRange: NSRange(location: editor.string.utf16.count, length: 0))
        editor.breakUndoCoalescing()
        #expect(editor.undoManager?.canUndo == true)
        let undoItem = NSMenuItem(title: "Undo", action: #selector(ComposerEditor.CommandTextView.undo(_:)), keyEquivalent: "z")
        #expect(editor.validateMenuItem(undoItem))
        editor.undo(nil)
        #expect(editor.string == original)
        editor.redo(nil)
        #expect(editor.string == original + " Undo marker")
        editor.undoManager?.undo()
        #expect(editor.string == original)
        let event = try #require(NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [.command], timestamp: 0, windowNumber: window.windowNumber, context: nil, characters: "\u{3}", charactersIgnoringModifiers: "\u{3}", isARepeat: false, keyCode: 76))
        editor.setMarkedText("にほん", selectedRange: NSRange(location: 3, length: 0), replacementRange: NSRange(location: NSNotFound, length: 0))
        editor.keyDown(with: event)
        #expect(store.workspace.tasks.isEmpty)
        editor.unmarkText()
        editor.keyDown(with: event)
        #expect(store.running(store.session.id) != nil)
        let taskCount = store.workspace.tasks.count
        editor.keyDown(with: event)
        #expect(store.workspace.tasks.count == taskCount)
        #expect(store.running(store.session.id) != nil)
        let oldID = store.session.id
        let oldDraft = store.session.draft
        store.newSession()
        store.setDraft(store.session.id, "Other session draft")
        try await Task.sleep(for: .milliseconds(30))
        host.layoutSubtreeIfNeeded()
        let nextEditor = try #require(findEditor(host))
        #expect(nextEditor.string == "Other session draft")
        #expect(nextEditor.undoManager?.canUndo == false)
        #expect(!nextEditor.validateMenuItem(undoItem))
        nextEditor.undoManager?.undo()
        #expect(store.session.draft == "Other session draft")
        #expect(store.session(oldID)?.draft == oldDraft)
    }

    @Test func keypadEnterSubmitsOnlyOutsideComposition() throws {
        _ = NSApplication.shared
        let editor = ComposerEditor.CommandTextView()
        var sent = 0
        editor.submit = { sent += 1 }
        let event = try #require(NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [.command], timestamp: 0, windowNumber: 0, context: nil, characters: "\u{3}", charactersIgnoringModifiers: "\u{3}", isARepeat: false, keyCode: 76))
        editor.setMarkedText("にほん", selectedRange: NSRange(location: 3, length: 0), replacementRange: NSRange(location: NSNotFound, length: 0))
        editor.keyDown(with: event)
        #expect(sent == 0)
        editor.unmarkText()
        editor.keyDown(with: event)
        #expect(sent == 1)
    }

    @Test func nativeMarkedTextGuardsComposerAndSearchCommands() throws {
        _ = NSApplication.shared
        let editor = ComposerEditor.CommandTextView()
        var sent = 0
        editor.submit = { sent += 1 }
        editor.setMarkedText("にほん", selectedRange: NSRange(location: 3, length: 0), replacementRange: NSRange(location: NSNotFound, length: 0))
        #expect(editor.hasMarkedText())
        let event = try #require(NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [.command], timestamp: 0, windowNumber: 0, context: nil, characters: "\r", charactersIgnoringModifiers: "\r", isARepeat: false, keyCode: 36))
        editor.keyDown(with: event)
        #expect(sent == 0)
        editor.unmarkText()
        editor.keyDown(with: event)
        #expect(sent == 1)
        var moved = 0
        var opened = 0
        var cancelled = 0
        let search = HistorySearch(query: .constant(""), label: "Search", move: { moved += $0 }, submit: { opened += 1 }, cancel: { cancelled += 1 })
        let coordinator = search.makeCoordinator()
        let field = NSSearchField()
        let fieldEditor = NSTextView()
        fieldEditor.setMarkedText("Tiếng Việt", selectedRange: NSRange(location: 10, length: 0), replacementRange: NSRange(location: NSNotFound, length: 0))
        for selector in [#selector(NSResponder.moveDown(_:)), #selector(NSResponder.insertNewline(_:)), #selector(NSResponder.cancelOperation(_:))] {
            #expect(!coordinator.control(field, textView: fieldEditor, doCommandBy: selector))
        }
        #expect(moved == 0 && opened == 0 && cancelled == 0)
        fieldEditor.unmarkText()
        #expect(coordinator.control(field, textView: fieldEditor, doCommandBy: #selector(NSResponder.moveDown(_:))))
        #expect(coordinator.control(field, textView: fieldEditor, doCommandBy: #selector(NSResponder.insertNewline(_:))))
        #expect(coordinator.control(field, textView: fieldEditor, doCommandBy: #selector(NSResponder.cancelOperation(_:))))
        #expect(moved == 1 && opened == 1 && cancelled == 1)
    }
}

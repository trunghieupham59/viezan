import AppKit
import SwiftUI
import Testing
import ViezanDomain
@testable import ViezanNative

@MainActor private final class ChatLayoutStorage: WorkspacePersistence {
    private var snapshot = Workspace()
    func load() throws -> Workspace? { snapshot }
    func save(_ workspace: Workspace) throws { snapshot = workspace }
}

@MainActor private struct ChatLayoutFixture: View {
    let store: WorkbenchStore
    let shell: ShellPresentation
    @State private var route = "chat"
    var body: some View {
        WorkbenchView(store: store, screen: $route, shell: shell)
            .environment(\.colorScheme, store.workspace.preferences.mode == .dark ? .dark : .light)
    }
}

// The real workspace, with memory-only persistence and inert provider hooks.
// Optional bitmaps contain only synthetic text; they are not live-app or
// wallpaper-material evidence. IME behavior has separate Foundation coverage.
extension AppKitFixtureTests {
    @Suite @MainActor struct ChatGlassLayoutTests {
        private func descendants(_ view: NSView) -> [NSView] {
            [view] + view.subviews.flatMap(descendants)
        }

        private func settle(_ host: NSView) async throws {
            try await Task.sleep(for: .milliseconds(80))
            host.layoutSubtreeIfNeeded()
            // Composer line measurement and available-width updates are asynchronous.
            try await Task.sleep(for: .milliseconds(40))
            host.layoutSubtreeIfNeeded()
        }

        private func capture(_ host: NSView, name: String) throws {
            guard let folder = ProcessInfo.processInfo.environment["VIEZAN_CHAT_EVIDENCE"] else { return }
            let directory = URL(fileURLWithPath: folder)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let bitmap = try #require(host.bitmapImageRepForCachingDisplay(in: host.bounds))
            host.cacheDisplay(in: host.bounds, to: bitmap)
            let data = try #require(bitmap.representation(using: .png, properties: [:]))
            try data.write(to: directory.appendingPathComponent(name + ".png"))
        }

        @Test func emptyComposerReportsFocusBeforeTypingAndResignation() async throws {
            _ = NSApplication.shared
            var focusChanges: [Bool] = []
            let host = NSHostingView(rootView: ComposerEditor(text: .constant(""), identity: "empty-focus-fixture",
                label: "Synthetic empty composer", font: .systemFont(ofSize: NSFont.systemFontSize),
                growsWithContent: true, maxLines: 4, onFocus: { focusChanges.append($0) }) {})
            let window = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: 320, height: 80),
                                  styleMask: [.borderless], backing: .buffered, defer: false)
            window.isReleasedWhenClosed = false
            window.contentView = host
            defer { window.contentView = nil; window.close() }
            try await settle(host)
            let editor = try #require(descendants(host).compactMap { $0 as? ComposerEditor.CommandTextView }.first)
            #expect(window.makeFirstResponder(nil))
            try await Task.sleep(for: .milliseconds(20))
            focusChanges.removeAll()

            // No insertText or textDidBeginEditing: the rim must follow focus itself.
            #expect(window.makeFirstResponder(editor))
            try await Task.sleep(for: .milliseconds(20))
            #expect(window.firstResponder === editor)
            #expect(focusChanges == [true])
            #expect(editor.string.isEmpty && editor.undoManager?.canUndo == false)

            #expect(window.makeFirstResponder(nil))
            try await Task.sleep(for: .milliseconds(20))
            #expect(window.firstResponder !== editor)
            #expect(focusChanges == [true, false])
            #expect(editor.string.isEmpty && editor.undoManager?.canUndo == false)
        }

        @Test(arguments: [AppearanceMode.light, .dark])
        func composerKeepsItsEditorAndUsableControlsAcrossDraftShapesAndResize(mode: AppearanceMode) async throws {
            _ = NSApplication.shared
            let previousPreferences = NativeTheme.shared.preferences
            defer { NativeTheme.shared.preferences = previousPreferences }
            let store = WorkbenchStore(persistence: ChatLayoutStorage(), automaticProvider: false,
                                       listModels: { _ in [] }, hasKey: { _ in false })
            store.setLocale("vi")
            store.setRoute("chat")
            store.setAppearance(mode: mode, textSize: .medium, preset: "glass")
            NativeTheme.shared.preferences = store.workspace.preferences
            let sessionID = store.session.id
            let modelID = "ollama:llama3.2:latest"
            store.setModel(sessionID, modelID)
            let shell = ShellPresentation()
            let host = NSHostingView(rootView: ChatLayoutFixture(store: store, shell: shell))
            let window = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: 1200, height: 760),
                                  styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                                  backing: .buffered, defer: false)
            window.titleVisibility = .hidden
            window.titlebarAppearsTransparent = true
            window.isReleasedWhenClosed = false
            window.appearance = NSAppearance(named: mode == .dark ? .darkAqua : .aqua)
            window.contentView = host
            defer { window.contentView = nil; window.close() }
            try await settle(host)
            let originalEditor = try #require(descendants(host).compactMap { $0 as? ComposerEditor.CommandTextView }
                .first { $0.accessibilityIdentifier() == "chat-draft" })

            for width in [640.0, 820, 1200] {
                window.setContentSize(NSSize(width: width, height: 760))
                try await settle(host)
                #expect(abs(host.bounds.width - width) < 1)
                let hostFrame = host.convert(host.bounds, to: nil)
                let navigationWidth = ShellLayout(width: width, height: hostFrame.height - ShellLayout.headerHeight,
                                                  collapsed: store.workspace.navigationCollapsed).navigationWidth
                let feature = CGRect(x: hostFrame.minX + navigationWidth + metric("hairline"), y: hostFrame.minY,
                                     width: hostFrame.width - navigationWidth - metric("hairline"),
                                     height: hostFrame.height - ShellLayout.headerHeight)
                var singleLineHeight: CGFloat?
                var singleLineWidth: CGFloat?
                var multilineWidth: CGFloat?

                for (state, draft) in [("one-line", "Bản nháp"), ("multiline", "Bản nháp thử nghiệm\nDòng thứ hai\nDòng thứ ba"), ("empty", "")] {
                    store.setDraft(sessionID, draft)
                    try await settle(host)
                    let editors = descendants(host).compactMap { $0 as? ComposerEditor.CommandTextView }
                        .filter { $0.accessibilityIdentifier() == "chat-draft" }
                    #expect(editors.count == 1)
                    let editor = try #require(editors.first)
                    #expect(editor === originalEditor)
                    #expect(editor.string == draft)
                    #expect(store.session.id == sessionID && store.session.draft == draft)
                    #expect(store.session.model == modelID)
                    #expect(store.workspace.tasks.isEmpty && store.session.messages.isEmpty)
                    let scroll = try #require(editor.enclosingScrollView)
                    let editorFrame = scroll.convert(scroll.bounds, to: nil)
                    #expect(editorFrame.width >= metric("editor"))
                    #expect(feature.insetBy(dx: -1, dy: -1).contains(editorFrame))
                    if state == "one-line" { singleLineHeight = editorFrame.height; singleLineWidth = editorFrame.width }
                    if state == "multiline" { multilineWidth = editorFrame.width }
                    if let singleLineHeight {
                        if state == "multiline" { #expect(editorFrame.height >= singleLineHeight + ComposerEditor.lineHeight(of: readingNSFont(store))) }
                        if state == "empty" { #expect(abs(editorFrame.height - singleLineHeight) < 1) }
                    }

                    let nativeButtons = descendants(host).compactMap { $0 as? ShellToolbarButton.FocusButton }
                    var frames: [CGRect] = []
                    for identifier in ["tools-toggle", "model-toggle"] {
                        let matching = nativeButtons.filter { $0.accessibilityIdentifier() == identifier }
                        #expect(matching.count == 1)
                        let button = try #require(matching.first)
                        let frame = button.convert(button.bounds, to: nil)
                        #expect(button.isEnabled && button.acceptsFirstResponder)
                        #expect(frame.width >= metric("compactControl") && frame.height >= metric("compactControl"))
                        #expect(feature.insetBy(dx: -1, dy: -1).contains(frame))
                        #expect(!frame.intersects(editorFrame))
                        frames.append(frame)
                    }
                    #expect(!frames[0].intersects(frames[1]))
                    #expect(abs(frames[0].midY - frames[1].midY) < 1)
                    if state != "one-line" { try capture(host, name: "chat-\(mode.rawValue)-\(Int(width))-\(state)") }
                }

                if width == 1200, let singleLineWidth, let multilineWidth {
                    // This text wraps in the inline editor but fits the wider,
                    // stacked editor. Basing the shape on the current line count
                    // must not make it alternate between those two widths forever.
                    let font = readingNSFont(store)
                    var draft = "Bản nháp"
                    while (draft as NSString).size(withAttributes: [.font: font]).width < singleLineWidth + metric("large") {
                        draft += " kiểm tra"
                    }
                    try #require((draft as NSString).size(withAttributes: [.font: font]).width < multilineWidth - metric("inset"))
                    store.setDraft(sessionID, draft)
                    try await settle(host)
                    var samples: [CGSize] = []
                    for delay in [17, 23, 31, 41, 53, 67, 79, 97] {
                        try await Task.sleep(for: .milliseconds(delay))
                        host.layoutSubtreeIfNeeded()
                        let scroll = try #require(originalEditor.enclosingScrollView)
                        samples.append(scroll.bounds.size)
                        #expect(descendants(host).contains { $0 === originalEditor })
                        #expect(store.session.id == sessionID && store.session.draft == draft)
                    }
                    let settledSize = try #require(samples.first)
                    #expect(samples.allSatisfy { abs($0.width - settledSize.width) < 1 && abs($0.height - settledSize.height) < 1 },
                            "The wrapped draft must settle; observed editor sizes: \(samples)")
                    try capture(host, name: "chat-\(mode.rawValue)-\(Int(width))-long-wrapped")
                    store.setDraft(sessionID, "")
                    try await settle(host)
                }

                // Opening/dismissing the real picker must not replace the composer
                // or silently select a model. No refresh, submit or audio action runs.
                let model = try #require(descendants(host).compactMap { $0 as? ShellToolbarButton.FocusButton }
                    .first { $0.accessibilityIdentifier() == "model-toggle" })
                model.performClick(nil)
                try await settle(host)
                #expect(shell.overlay == .models)
                let search = try #require(descendants(host).compactMap { $0 as? NSSearchField }
                    .first { $0.accessibilityLabel() == store.text("searchModels") })
                let searchFrame = search.convert(search.bounds, to: nil)
                #expect(hostFrame.insetBy(dx: -1, dy: -1).contains(searchFrame))
                try capture(host, name: "chat-\(mode.rawValue)-\(Int(width))-model-panel")
                // The current raw ID is a selectable, checked search result even
                // without a provider listing. This produces selected-row evidence
                // without discovery, credentials, fabricated responses or a request.
                search.stringValue = modelID
                search.delegate?.controlTextDidChange?(Notification(name: NSControl.textDidChangeNotification, object: search))
                try await settle(host)
                #expect(store.session.model == modelID)
                #expect(descendants(host).contains { $0 === search })
                try capture(host, name: "chat-\(mode.rawValue)-\(Int(width))-model-selected")
                shell.dismiss(returnFocus: false)
                try await settle(host)
                #expect(shell.overlay == nil)
                #expect(descendants(host).contains { $0 === originalEditor })
                #expect(store.session.id == sessionID && store.session.draft.isEmpty && store.session.model == modelID)
                #expect(!store.workspace.navigationCollapsed)
                #expect(store.workspace.tasks.isEmpty && !store.loadingModels && !store.discovering)
            }
        }
    }
}

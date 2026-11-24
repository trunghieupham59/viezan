import AppKit
import SwiftUI
import Testing
import ViezanDomain
@testable import ViezanNative

@MainActor private final class AccessibilityStorage: WorkspacePersistence {
    private var snapshot = Workspace()
    func load() throws -> Workspace? { snapshot }
    func save(_ workspace: Workspace) throws { snapshot = workspace }
}

@MainActor private struct AccessibilityShellFixture: View {
    let store: WorkbenchStore
    let shell: ShellPresentation
    @State private var route = "chat"
    var body: some View { WorkbenchView(store: store, screen: $route, shell: shell) }
}

extension AppKitFixtureTests {
    @Suite @MainActor struct AccessibilityTests {
        private func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
        private func store() -> WorkbenchStore {
            WorkbenchStore(persistence: AccessibilityStorage(), automaticProvider: false,
                           listModels: { _ in [] }, hasKey: { _ in false })
        }
        private func settle(_ host: NSView) async throws {
            host.layoutSubtreeIfNeeded()
            try await Task.sleep(for: .milliseconds(120))
            host.layoutSubtreeIfNeeded()
        }

        @Test(arguments: ["vi", "en", "ja"])
        func shellControlsKeepLocalizedNamesWhenIconsReplaceLabels(locale: String) async throws {
            _ = NSApplication.shared
            let previous = NativeTheme.shared.preferences
            defer { NativeTheme.shared.preferences = previous }
            let store = store(); store.setLocale(locale); store.setRoute("chat")
            NativeTheme.shared.preferences = store.workspace.preferences
            let host = NSHostingView(rootView: AccessibilityShellFixture(store: store, shell: ShellPresentation()))
            // Attach offscreen without showing a window, as in LiquidGlassShellTests.
            let window = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: metric("minWindowWidth"), height: metric("minWindowHeight")),
                                  styleMask: [.titled, .closable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
            window.isReleasedWhenClosed = false; window.contentView = host
            defer { window.contentView = nil; window.close() }
            try await settle(host)
            let controls = descendants(host).compactMap { $0 as? NSControl }
            let buttons = controls.compactMap { $0 as? ShellToolbarButton.FocusButton }
            #expect(!buttons.isEmpty)
            for control in controls where control is ShellToolbarButton.FocusButton || !control.accessibilityIdentifier().isEmpty {
                #expect(control.accessibilityLabel()?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false,
                        "Missing name: \(control.accessibilityIdentifier())")
            }
            for (id, key) in [("history-toggle", "history"), ("new-work", "newChat"), ("activity-toggle", "activity"), ("tools-toggle", "composerTools")] {
                let button = try #require(buttons.first { $0.accessibilityIdentifier() == id })
                #expect(button.accessibilityLabel()?.contains(store.text(key)) == true)
                #expect(button.title.isEmpty, "Compact icon title: \(id) = \(button.title)")
            }
        }

        @Test(arguments: [Feature.chat, .translate])
        func compactFeatureSubviewsStayInsideHost(feature: Feature) async throws {
            _ = NSApplication.shared
            let previous = NativeTheme.shared.preferences
            defer { NativeTheme.shared.preferences = previous }
            let store = store(); store.navigate(feature)
            NativeTheme.shared.preferences = store.workspace.preferences
            let width = metric("minWindowWidth") - metric("rail")
            let view = Group {
                if feature == .chat { ChatWorkspace(store: store) }
                else { TranslationWorkspace(store: store) }
            }
            let host = NSHostingView(rootView: view)
            host.frame = NSRect(x: 0, y: 0, width: width, height: metric("minWindowHeight") - ShellLayout.headerHeight)
            try await settle(host)
            #expect(abs(host.bounds.width - width) < metric("hairline"))
            for child in descendants(host) {
                let rect = child.convert(child.bounds, to: host)
                #expect(rect.maxX <= host.bounds.maxX + metric("hairline"),
                        "Overflow: \(type(of: child)) \(rect), host \(host.bounds)")
            }
        }

        @Test func readingSizeScalesContentAndLeavesControlFontUnchanged() {
            let store = store()
            let controlFont = Font.vzn("labelScale")
            for size in [ReadingSize.small, .medium, .large] {
                store.setAppearance(textSize: size)
                let expected = NSFont.systemFontSize * metric("labelScale") * nativeResources.textScales[size.rawValue]!
                #expect(abs(readingNSFont(store).pointSize - expected) < metric("hairline"))
                #expect(Font.vzn("labelScale") == controlFont)
            }
        }

        @Test func solidSurfacesFollowEitherSystemPreference() {
            #expect(!usesSolidSurfaces(reduceTransparency: false, contrast: .standard))
            #expect(usesSolidSurfaces(reduceTransparency: true, contrast: .standard))
            #expect(usesSolidSurfaces(reduceTransparency: false, contrast: .increased))
            #expect(usesSolidSurfaces(reduceTransparency: true, contrast: .increased))
        }
    }
}

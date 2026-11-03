import AppKit
import SwiftUI
import Testing
import ViezanDomain
@testable import ViezanNative

@MainActor private final class GlassStorage: WorkspacePersistence {
    private var snapshot = Workspace()
    func load() throws -> Workspace? { snapshot }
    func save(_ workspace: Workspace) throws { snapshot = workspace }
}

// Uses the production shell with memory-only storage and no provider discovery.
// Bitmap evidence verifies layout, not live wallpaper blending or VoiceOver.
@MainActor private struct GlassShellFixture: View {
    let store: WorkbenchStore
    let shell: ShellPresentation
    @State private var route = "chat"
    var body: some View {
        WorkbenchView(store: store, screen: $route, shell: shell)
            .environment(\.colorScheme, store.workspace.preferences.mode == .dark ? .dark : .light)
    }
}

extension AppKitFixtureTests {
    @Suite @MainActor struct LiquidGlassShellTests {
        private func descendants(_ view: NSView) -> [NSView] {
            [view] + view.subviews.flatMap(descendants)
        }

        private func capture(_ host: NSView, name: String) throws {
            guard let folder = ProcessInfo.processInfo.environment["VIEZAN_GLASS_EVIDENCE"] else { return }
            let directory = URL(fileURLWithPath: folder)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let bitmap = try #require(host.bitmapImageRepForCachingDisplay(in: host.bounds))
            host.cacheDisplay(in: host.bounds, to: bitmap)
            let data = try #require(bitmap.representation(using: .png, properties: [:]))
            try data.write(to: directory.appendingPathComponent(name + ".png"))
        }

        @Test(arguments: [AppearanceMode.light, .dark])
        func glassHeaderKeepsActionsAccessibleAcrossResize(mode: AppearanceMode) async throws {
            _ = NSApplication.shared
            let previousPreferences = NativeTheme.shared.preferences
            defer { NativeTheme.shared.preferences = previousPreferences }
            let store = WorkbenchStore(persistence: GlassStorage(), automaticProvider: false)
            store.setLocale("vi")
            store.setRoute("chat")
            store.setAppearance(mode: mode, textSize: .medium, preset: "glass")
            NativeTheme.shared.preferences = store.workspace.preferences
            let shell = ShellPresentation()
            let host = NSHostingView(rootView: GlassShellFixture(store: store, shell: shell))
            let window = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: 1200, height: 760), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
            window.titleVisibility = .hidden
            window.titlebarAppearsTransparent = true
            window.isReleasedWhenClosed = false
            window.appearance = NSAppearance(named: mode == .dark ? .darkAqua : .aqua)
            window.contentView = host
            defer { window.contentView = nil; window.close() }

            for width in [1200.0, 820] {
                window.setContentSize(NSSize(width: width, height: 760))
                try await Task.sleep(for: .milliseconds(80))
                host.layoutSubtreeIfNeeded()
                #expect(abs(host.bounds.width - width) < 1)
                let buttons = descendants(host).compactMap { $0 as? ShellToolbarButton.FocusButton }
                let identifiers = ["history-toggle", "new-work", "activity-toggle"]
                let header = try identifiers.map { identifier in
                    try #require(buttons.first { $0.accessibilityIdentifier() == identifier })
                }
                let labels = [store.text("history"), store.text("newChat"), store.text("activity")]
                var precedingFrame: CGRect?
                for (button, label) in zip(header, labels) {
                    let frame = button.convert(button.bounds, to: host)
                    #expect(frame.minX >= 0 && frame.maxX <= host.bounds.width)
                    #expect(frame.minY >= 0 && frame.maxY <= host.bounds.height)
                    #expect(frame.width >= metric("compactControl"))
                    #expect(abs(frame.height - header[0].bounds.height) < 1)
                    if let precedingFrame { #expect(frame.minX >= precedingFrame.maxX) }
                    precedingFrame = frame
                    #expect(button.accessibilityLabel() == label)
                    #expect(button.isEnabled && button.acceptsFirstResponder)
                }
                try capture(host, name: "glass-shell-vi-\(mode.rawValue)-\(Int(width))")

                // A styled native button must still open its layer and accept focus
                // back after keyboard dismissal, including in the compact header.
                let history = header[0]
                history.focusGranted = true
                #expect(window.makeFirstResponder(history))
                history.performClick(nil)
                try await Task.sleep(for: .milliseconds(40))
                #expect(shell.overlay == .history)
                #expect(history.isAccessibilityExpanded())
                shell.dismiss()
                try await Task.sleep(for: .milliseconds(40))
                #expect(shell.overlay == nil)
                #expect(window.firstResponder === history)
                #expect(!history.isAccessibilityExpanded())
                #expect(!store.workspace.navigationCollapsed)

                // Translate has the longest toolbar: adding its image action must
                // not push native glass bezels out of the available feature width.
                store.navigate(.translate)
                try await Task.sleep(for: .milliseconds(50))
                host.layoutSubtreeIfNeeded()
                let translationButtons = descendants(host).compactMap { $0 as? ShellToolbarButton.FocusButton }
                let translationIDs = ["translate-add-image", "history-toggle", "new-work", "activity-toggle"]
                var previousMaxX: CGFloat = 0
                for identifier in translationIDs {
                    let button = try #require(translationButtons.first { $0.accessibilityIdentifier() == identifier })
                    let frame = button.convert(button.bounds, to: host)
                    #expect(frame.minX >= previousMaxX && frame.maxX <= host.bounds.width)
                    previousMaxX = frame.maxX
                }
                try capture(host, name: "glass-translate-vi-\(mode.rawValue)-\(Int(width))")
                store.navigate(.chat)
                try await Task.sleep(for: .milliseconds(40))
            }
        }

        @Test(.enabled(if: ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 26), arguments: [AppearanceMode.light, .dark])
        func navigationPaneKeepsControlsAndSavedStateAcrossCollapseAndResize(mode: AppearanceMode) async throws {
            _ = NSApplication.shared
            let previousPreferences = NativeTheme.shared.preferences
            defer { NativeTheme.shared.preferences = previousPreferences }
            let store = WorkbenchStore(persistence: GlassStorage(), automaticProvider: false)
            store.setRoute("chat")
            store.setLocale("vi")
            store.setAppearance(mode: mode, preset: "glass")
            NativeTheme.shared.preferences = store.workspace.preferences
            let sessionID = store.session.id
            store.setDraft(sessionID, "Bản nháp còn nguyên khi đổi chiều rộng・下書き")
            let draft = store.session.draft
            let shell = ShellPresentation()
            let host = NSHostingView(rootView: GlassShellFixture(store: store, shell: shell))
            let window = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: 1200, height: 760), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
            window.titleVisibility = .hidden
            window.titlebarAppearsTransparent = true
            window.isReleasedWhenClosed = false
            window.appearance = NSAppearance(named: mode == .dark ? .darkAqua : .aqua)
            window.contentView = host
            defer { window.contentView = nil; window.close() }
            func settle() async throws {
                try await Task.sleep(for: .milliseconds(240))
                host.layoutSubtreeIfNeeded()
            }
            func toggle() throws -> ShellToolbarButton.FocusButton {
                try #require(descendants(host).compactMap { $0 as? ShellToolbarButton.FocusButton }.first { $0.accessibilityIdentifier() == "navigation-toggle" })
            }
            func paneFrames() throws -> [CGRect] {
                let identifier = mode == .light ? "navigation-frosted-material" : "navigation-glass-material"
                let panes = descendants(host).filter { $0.accessibilityIdentifier() == identifier && !$0.isHidden }
                try #require(!panes.isEmpty)
                let nativeControls = try [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton].map { kind in
                    try #require(window.standardWindowButton(kind))
                }
                let protectedControls = nativeControls + [try toggle()]
                return panes.map { pane in
                    let frame = pane.convert(pane.bounds, to: host)
                    #expect(frame.minX >= 0 && frame.maxX <= host.bounds.width)
                    #expect(frame.minY >= 0 && frame.maxY <= host.bounds.height)
                    #expect(frame.width > 0 && frame.height > 0)
                    #expect(frame.width <= max(metric("sidebar"), metric("compactSidebar")))
                    #expect(!pane.isAccessibilityElement())
                    let top = host.isFlipped ? frame.minY : host.bounds.maxY - frame.maxY
                    if mode == .light {
                        // The cyan material is decorative, not an input surface.
                        #expect(pane is NSVisualEffectView)
                        let point = pane.convert(NSPoint(x: pane.bounds.midX, y: pane.bounds.midY), to: pane.superview)
                        #expect(pane.hitTest(point) == nil)
                    }
                    // Every floating pane must leave window controls and their
                    // hit regions clear, including the narrow rail and overlay.
                    #expect(top >= ShellLayout.headerHeight + metric("small") - 1)
                    for control in protectedControls {
                        let controlFrame = control.convert(control.bounds, to: host)
                        let bottom = host.isFlipped ? controlFrame.maxY : host.bounds.maxY - controlFrame.minY
                        #expect(top >= bottom + metric("small") - 1)
                        #expect(!frame.intersects(controlFrame))
                    }
                    return frame
                }
            }
            try await settle()
            let initialToggle = try toggle()
            let toggleFrame = initialToggle.convert(initialToggle.bounds, to: nil)
            let expandedPane = try #require(paneFrames().max { $0.width < $1.width })
            #expect(expandedPane.maxX <= metric("sidebar"))
            try capture(host, name: "glass-navigation-\(mode.rawValue)-expanded")
            initialToggle.focusGranted = true
            #expect(window.makeFirstResponder(initialToggle))
            initialToggle.performClick(nil)
            try await settle()
            #expect(store.workspace.navigationCollapsed)
            let railPane = try #require(paneFrames().max { $0.width < $1.width })
            #expect(railPane.maxX <= metric("rail") && railPane.width < expandedPane.width)
            try capture(host, name: "glass-navigation-\(mode.rawValue)-rail")

            window.setContentSize(NSSize(width: 820, height: 760))
            try await settle()
            #expect(store.workspace.navigationCollapsed)
            let compactToggle = try toggle()
            compactToggle.focusGranted = true
            #expect(window.makeFirstResponder(compactToggle))
            compactToggle.performClick(nil)
            try await settle()
            #expect(shell.overlay == .navigation)
            #expect(store.workspace.navigationCollapsed)
            let overlayPane = try #require(paneFrames().max { $0.width < $1.width })
            #expect(overlayPane.maxX <= metric("compactSidebar") && overlayPane.width > railPane.width)
            let close = try #require(descendants(host).compactMap { $0 as? ShellToolbarButton.FocusButton }.first { $0.accessibilityIdentifier() == "panel-close" })
            let closeFrame = close.convert(close.bounds, to: host)
            #expect(closeFrame.minX >= overlayPane.minX && closeFrame.maxX <= overlayPane.maxX)
            #expect(closeFrame.minY >= overlayPane.minY)
            #expect(closeFrame.maxY <= overlayPane.maxY)
            try capture(host, name: "glass-navigation-\(mode.rawValue)-compact-overlay")
            shell.dismiss()
            try await settle()
            #expect(window.firstResponder === compactToggle)
            window.setContentSize(NSSize(width: 1200, height: 760))
            try await settle()
            #expect(shell.overlay == nil && store.workspace.navigationCollapsed)
            #expect(try paneFrames().allSatisfy { $0.maxX <= metric("rail") })
            let restoredToggle = try toggle()
            restoredToggle.performClick(nil)
            try await settle()
            #expect(!store.workspace.navigationCollapsed)
            let restoredPane = try #require(paneFrames().max { $0.width < $1.width })
            #expect(abs(restoredPane.width - expandedPane.width) < 1)
            #expect(restoredToggle.convert(restoredToggle.bounds, to: nil) == toggleFrame)
            for kind in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] {
                let button = try #require(window.standardWindowButton(kind))
                let frame = button.convert(button.bounds, to: nil)
                #expect(abs(frame.midY - toggleFrame.midY) < 1 && frame.maxX < toggleFrame.minX)
            }
            #expect(store.session.id == sessionID && store.session.draft == draft)
            #expect(store.workspace.shell?.lastRoute == "chat")
            try capture(host, name: "glass-navigation-\(mode.rawValue)-restored")
        }

        @Test func glassButtonsPreserveNativeDisabledBehavior() async throws {
            _ = NSApplication.shared
            let previousPreferences = NativeTheme.shared.preferences
            defer { NativeTheme.shared.preferences = previousPreferences }
            let store = WorkbenchStore(persistence: GlassStorage(), automaticProvider: false)
            store.setAppearance(preset: "glass")
            NativeTheme.shared.preferences = store.workspace.preferences
            var activations = 0
            let host = NSHostingView(rootView: VStack {
                HStack {
                    // Default actions inherit the preset without an explicit flag.
                    ShellToolbarButton(label: "Open history", symbol: "clock", identifier: "glass-enabled", showsLabel: true) { activations += 1 }
                    ShellToolbarButton(label: "New conversation", symbol: "plus", identifier: "glass-disabled", showsLabel: true, enabled: false) { activations += 10 }
                }
                HStack {
                    NativePanelButton(label: "Open", identifier: "panel-neutral") { activations += 1 }
                    NativePanelButton(label: "Save", identifier: "panel-primary", role: .primary) { activations += 1 }
                    NativePanelButton(label: "Delete", identifier: "panel-destructive", role: .destructive) { activations += 1 }
                }
                HStack {
                    ShellToolbarButton(label: "Grouped model", symbol: "chevron.down", identifier: "glass-borrowed", showsLabel: true, quiet: true) {}
                    ShellToolbarButton(label: "Standalone model", symbol: "chevron.down", identifier: "glass-owned", showsLabel: true, glass: true, quiet: true) {}
                    ShellToolbarButton(label: "Grouped disabled", symbol: "plus", identifier: "glass-borrowed-disabled", showsLabel: true, quiet: true, enabled: false) { activations += 10 }
                }
            })
            let window = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: 520, height: 180), styleMask: [.titled], backing: .buffered, defer: false)
            window.isReleasedWhenClosed = false
            window.contentView = host
            defer { window.contentView = nil; window.close() }
            try await Task.sleep(for: .milliseconds(40))
            host.layoutSubtreeIfNeeded()
            let buttons = descendants(host).compactMap { $0 as? ShellToolbarButton.FocusButton }
            let enabled = try #require(buttons.first { $0.accessibilityIdentifier() == "glass-enabled" })
            let disabled = try #require(buttons.first { $0.accessibilityIdentifier() == "glass-disabled" })
            let panelButtons = try ["panel-neutral", "panel-primary", "panel-destructive"].map { identifier in
                try #require(buttons.first { $0.accessibilityIdentifier() == identifier })
            }
            let borrowed = try #require(buttons.first { $0.accessibilityIdentifier() == "glass-borrowed" })
            let owned = try #require(buttons.first { $0.accessibilityIdentifier() == "glass-owned" })
            let borrowedDisabled = try #require(buttons.first { $0.accessibilityIdentifier() == "glass-borrowed-disabled" })
            #expect(!borrowed.usesGlass)
            #expect(owned.glassShape && owned.bounded)
            #expect(!borrowedDisabled.usesGlass && !borrowedDisabled.bounded)
            #expect(!borrowedDisabled.isEnabled && !borrowedDisabled.acceptsFirstResponder)
            #expect(borrowedDisabled.layer?.backgroundColor?.alpha == 0)
            borrowedDisabled.hovered = true
            borrowedDisabled.refreshSurface()
            #expect(borrowedDisabled.layer?.backgroundColor?.alpha == 0)
            borrowedDisabled.performClick(nil)
            #expect(activations == 0)
            for button in [enabled, disabled, owned] + panelButtons {
                // Hosted runners can enable Reduce Transparency or high contrast.
                // The owned lens still exists, but must use its solid fallback.
                #expect(button.glassShape && button.bounded)
                #expect(button.usesGlass == !button.opaqueSurface)
                let container = try #require(button.superview as? ShellToolbarButton.ButtonHost)
                if #available(macOS 26.0, *), button.usesGlass {
                    let material = try #require(container.subviews.compactMap { $0 as? NSGlassEffectView }.first)
                    #expect(!material.isHidden && !material.isAccessibilityElement())
                    #expect(material.frame == button.frame)
                    #expect(container.subviews.last === button)
                    // A legacy panel fill must not cover the real material.
                    #expect(button.layer?.backgroundColor?.alpha == 0)
                } else {
                    #expect(button.layer?.borderWidth == metric("hairline"))
                    let background = try #require(button.layer?.backgroundColor)
                    #expect(background.alpha > 0)
                    if button.opaqueSurface { #expect(background.alpha == 1) }
                    if #available(macOS 26.0, *) {
                        #expect(!container.subviews.contains { $0 is NSGlassEffectView && !$0.isHidden })
                    }
                }
            }
            for button in panelButtons {
                #expect(button.isEnabled && button.acceptsFirstResponder)
                button.performClick(nil)
            }
            #expect(enabled.accessibilityLabel() == "Open history")
            #expect(disabled.accessibilityLabel() == "New conversation")
            enabled.focusGranted = true
            #expect(window.makeFirstResponder(enabled))
            enabled.performClick(nil)
            #expect(activations == 4)
            #expect(!disabled.isEnabled && !disabled.acceptsFirstResponder)
            disabled.hovered = true
            disabled.refreshSurface()
            disabled.performClick(nil)
            #expect(activations == 4)
            #expect(window.firstResponder === enabled)
        }

        // OS preference propagation remains a manual check. SwiftUI's accessibility
        // environment values are read-only; this exercises the native transition
        // that they request without changing the user's accessibility settings.
        @Test(arguments: ["toolbar", "neutral", "primary", "destructive"])
        func nativeGlassFallbackStaysOpaqueThroughInteraction(role: String) throws {
            _ = NSApplication.shared
            let previousPreferences = NativeTheme.shared.preferences
            defer { NativeTheme.shared.preferences = previousPreferences }
            let store = WorkbenchStore(persistence: GlassStorage(), automaticProvider: false)
            store.setAppearance(preset: "glass")
            NativeTheme.shared.preferences = store.workspace.preferences
            let button = ShellToolbarButton.FocusButton(frame: NSRect(x: 20, y: 20, width: 160, height: 32))
            button.title = "History"
            button.setAccessibilityLabel("History")
            button.wantsLayer = true
            button.bounded = true
            button.usesGlass = true
            button.glassShape = true
            switch role {
            case "neutral": button.panelAction = .neutral
            case "primary": button.panelAction = .primary
            case "destructive": button.panelAction = .destructive
            default: break
            }
            let window = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: 240, height: 100), styleMask: [.titled], backing: .buffered, defer: false)
            window.isReleasedWhenClosed = false
            let container = ShellToolbarButton.ButtonHost(button: button)
            container.frame = NSRect(x: 20, y: 20, width: 160, height: 32)
            window.contentView?.addSubview(container)
            defer { window.close() }
            button.refreshSurface()
            container.updateGlass()
            container.layoutSubtreeIfNeeded()
            if #available(macOS 26.0, *) {
                #expect(container.subviews.contains { $0 is NSGlassEffectView && !$0.isHidden })
            }
            button.focusGranted = true
            #expect(window.makeFirstResponder(button))
            let originalHeight = button.intrinsicContentSize.height
            button.usesGlass = false
            button.opaqueSurface = true
            container.updateGlass()
            if #available(macOS 26.0, *) {
                #expect(!container.subviews.contains { $0 is NSGlassEffectView && !$0.isHidden })
            }
            for state in ["idle", "hovered", "pressed", "selected"] {
                button.hovered = state == "hovered"
                button.pressed = state == "pressed"
                button.emphasized = state == "selected"
                button.refreshSurface()
                let background = try #require(button.layer?.backgroundColor)
                #expect(background.alpha == 1, "Opaque fallback in \(state) state")
                #expect(button.intrinsicContentSize.height == originalHeight)
                #expect(button.accessibilityLabel() == "History")
                #expect(button.superview === container)
                #expect(window.firstResponder === button)
            }
            button.isEnabled = false
            button.hovered = true
            button.pressed = true
            button.refreshSurface()
            #expect(!button.acceptsFirstResponder)
            #expect(button.layer?.backgroundColor?.alpha == 1)
            #expect(button.contentTintColor == NSColor.disabledControlTextColor)
            #expect(button.intrinsicContentSize.height == originalHeight)
            #expect(button.accessibilityLabel() == "History")
            if #available(macOS 26.0, *) {
                #expect(!container.subviews.contains { $0 is NSGlassEffectView && !$0.isHidden })
            }
        }
    }
}

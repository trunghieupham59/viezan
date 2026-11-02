import SwiftUI
import Observation
import ViezanDomain

@MainActor @Observable final class NativeTheme {
    static let shared = NativeTheme()
    var preferences = AppearancePreferences()
}
// Colors are generated from the canonical product tokens.
@MainActor func chromeColor(_ role: String, _ scheme: ColorScheme) -> Color {
    paletteColor(NativeTheme.shared.preferences.preset ?? "glass", role, scheme)
}
// Review 18: Glass owns navigation/chrome materials; content keeps Graphite
// surfaces and text. Other personas own both layers.
@MainActor func contentColor(_ role: String, _ scheme: ColorScheme) -> Color {
    let preset = NativeTheme.shared.preferences.preset ?? "glass"
    return paletteColor(preset == "glass" ? "graphite" : preset, role, scheme)
}
@MainActor private func paletteColor(_ preset: String, _ role: String, _ scheme: ColorScheme) -> Color {
    let preferences = NativeTheme.shared.preferences
    let key = preset + ":" + (preferences.accent ?? "auto")
    let mode = preferences.preset == "midnight" || scheme == .dark ? "dark" : "light"
    let hex = nativeResources.themePalettes[key]?[mode]?[role] ?? nativeResources.chromePalettes[mode]![role]!
    let raw = UInt64(hex.dropFirst(), radix: 16)!
    let alpha = hex.count == 9 ? Double((raw >> 24) & 255) / 255 : 1
    return Color(.sRGB, red: Double((raw >> 16) & 255) / 255,
                 green: Double((raw >> 8) & 255) / 255, blue: Double(raw & 255) / 255, opacity: alpha)
}

// Primary navigation material: real behind-window vibrancy tinted by the
// persona's nav material; Reduce Transparency falls back to the solid role.
struct ChromeSurface: View {
    var titlebar = false
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    var body: some View {
        if reduceTransparency { chromeColor(titlebar ? "titlebar-bg" : "sidebar-bg", scheme) }
        else {
            VisualEffectBackground(material: titlebar ? .titlebar : .sidebar)
                .overlay(chromeColor(titlebar ? "titlebar-material" : "primary-nav-material", scheme))
        }
    }
}

struct VisualEffectBackground: NSViewRepresentable {
    var material: NSVisualEffectView.Material
    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView(); view.blendingMode = .behindWindow; view.state = .followsWindowActiveState; return view
    }
    func updateNSView(_ view: NSVisualEffectView, context: Context) { view.material = material }
}

// Explicit chrome dividers keep fixture and live-window contrast identical.
struct ChromeDivider: View {
    var vertical = false
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        Rectangle().fill(chromeColor("material-border", scheme))
            .frame(width: vertical ? metric("hairline") : nil,
                   height: vertical ? nil : metric("hairline"))
            .accessibilityHidden(true)
    }
}

struct HistoryAnchorPreference: PreferenceKey {
    static var defaultValue: CGFloat? { nil }
    static func reduce(value: inout CGFloat?, nextValue: () -> CGFloat?) { value = nextValue() ?? value }
}

@MainActor func nativeModelLabel(_ id: String, store: WorkbenchStore) -> String {
    switch id {
    case "demo.standard": return store.text("steady")
    case "demo.slow": return store.text("slow")
    case "demo.failure": return store.text("failure")
    default: break
    }
    // "provider:model" reads as "Provider · model"; the raw ID stays in help text.
    guard let split = id.firstIndex(of: ":") else { return id }
    let provider = String(id[..<split])
    // Cloud IDs carry a release date ("claude-haiku-4-5-20251001", "gpt-4.1-mini-2025-04-14"); the label drops it.
    let model = String(id[id.index(after: split)...]).replacingOccurrences(of: #"-(\d{8}|\d{4}-\d{2}-\d{2})$"#, with: "", options: .regularExpression)
    let names = ["ollama": "Ollama", "lmstudio": "LM Studio", "llamacpp": "llama.cpp", "openai": "OpenAI", "claude": "Claude", "gemini": "Gemini", "groq": "Groq"]
    return (names[provider] ?? provider) + " · " + model
}

enum ShellOverlay: String { case navigation, history, activity, commands, models, tools, instructions }

struct ShellLayout {
    var width: CGFloat
    var height: CGFloat
    var collapsed: Bool
    static var titlebarHeight: CGFloat { metric("titlebar") }
    static var headerHeight: CGFloat { metric("navControl") + metric("small") }
    var compact: Bool { width < metric("compact") }
    var navigationWidth: CGFloat { compact || collapsed ? metric("rail") : metric("sidebar") }
    var navigationOverlayWidth: CGFloat { compact ? metric("compactSidebar") : metric("sidebar") }
    var panelWidth: CGFloat { min(metric("sidebar") + metric("editor"), width - metric("inset") * 2) }
    var panelHeight: CGFloat { min(metric("editor") * 3, height - metric("inset") * 2) }
    func panelX(anchor: CGFloat?) -> CGFloat {
        // Review 18 aligns the panel trailing edge with its trigger.
        max(metric("inset"), min((anchor ?? (width - metric("inset"))) - panelWidth, width - panelWidth - metric("inset")))
    }
}

/// Which shell layer is open, so the control that opened it can report `expanded`.
struct ShellLayerKey: EnvironmentKey { static let defaultValue: ShellOverlay? = nil }
extension EnvironmentValues { var shellLayer: ShellOverlay? { get { self[ShellLayerKey.self] } set { self[ShellLayerKey.self] = newValue } } }

@MainActor @Observable final class ShellPresentation {
    struct Request: Equatable { let id = UUID(); let command: String }
    var request: Request?
    var overlay: ShellOverlay?
    var library = false
    var libraryFavorites = false
    var settingsQuery = ""
    // One-shot request for the section Settings should open on (consumed on arrival).
    var settingsSection: String?
    var focusEpochs: [String: Int] = [:]
    func issue(_ command: String) { request = Request(command: command) }
    weak var opener: NSResponder?
    /// Whether the first layer of this run was opened from the keyboard (or assistively, when no
    /// event is current): only then does closing hand focus back, so a mouse user never sees a ring.
    private(set) var openedByKeyboard = true
    private var focusGeneration = 0
    func show(_ next: ShellOverlay, from responder: NSResponder? = nil) {
        focusGeneration += 1
        if overlay == next { dismiss(); return }
        if overlay == nil {
            opener = responder
            openedByKeyboard = NSApp.currentEvent.map { [.keyDown, .keyUp, .flagsChanged].contains($0.type) } ?? true
        }
        overlay = next
    }
    func dismiss(returnFocus: Bool = true) {
        focusGeneration += 1
        let generation = focusGeneration
        guard let old = overlay else { return }
        overlay = nil
        if returnFocus, openedByKeyboard {
            if let view = opener as? NSView, let window = view.window {
                DispatchQueue.main.async { [weak self, weak view, weak window] in
                    guard let self, self.focusGeneration == generation, self.overlay == nil else { return }
                    // Compact reflow may detach or disable the original control.
                    (view as? ShellToolbarButton.FocusButton)?.focusGranted = true
                    if let view, let window, view.window === window,
                       view.acceptsFirstResponder, window.makeFirstResponder(view) { return }
                    self.focusEpochs[old.rawValue, default: 0] += 1
                }
            } else { focusEpochs[old.rawValue, default: 0] += 1 }
        }
        opener = nil
    }
}

// Shared panel dismiss target follows the same control metric as shell tools.
struct ShellCloseButton: View {
    var label: String
    var focusOnAppear = false
    var action: () -> Void
    var body: some View {
        ShellToolbarButton(label: label, symbol: "xmark", identifier: "panel-close",
                           focusEpoch: focusOnAppear ? 1 : 0, action: action)
            .frame(width: metric("control"), height: metric("control"))
    }
}

struct ShellSurface: View {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    var body: some View {
        if reduceTransparency { Color(nsColor: .windowBackgroundColor) }
        else if #available(macOS 26.0, *) {
            Color.clear.glassEffect(.regular, in: RoundedRectangle(cornerRadius: metric("radius")))
        } else { RoundedRectangle(cornerRadius: metric("radius")).fill(.regularMaterial) }
    }
}

// Navigation is a continuous material column, not a floating glass card.
struct SidebarSurface: View {
    var body: some View { ChromeSurface() }
}

// Text-bearing panels keep an opaque reading surface in every system mode.
// Content roles, not chrome: Glass's chrome canvas is translucent with no blur,
// which let page text show through history, activity and the command palette.
struct ReadingPanelSurface: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        RoundedRectangle(cornerRadius: metric("surfaceRadius"))
            .fill(contentColor("surface", scheme))
            .overlay(RoundedRectangle(cornerRadius: metric("surfaceRadius"))
                .strokeBorder(Color(nsColor: .separatorColor), lineWidth: metric("hairline")))
            .shadow(color: Color(nsColor: .shadowColor).opacity(metric("overlayShadowOpacity")), radius: metric("inset"), y: metric("small"))
    }
}

// Panel actions share the shell's native focus and accessibility behavior.
enum NativePanelAction { case neutral, primary, destructive }
struct NativePanelButton: View {
    var label: String
    var symbol = ""
    var identifier: String
    var role: NativePanelAction = .neutral
    @Environment(\.isEnabled) private var isEnabled
    var focusEpoch = 0
    var onTab: ((Bool) -> Void)? = nil
    var action: () -> Void
    var body: some View {
        ShellToolbarButton(label: label, symbol: symbol, identifier: identifier,
                           showsLabel: true, panelAction: role, enabled: isEnabled, focusEpoch: focusEpoch, onTab: onTab, action: action)
    }
}

// Real NSButtons make focus restoration explicit, including when the system's
// keyboard-navigation preference does not focus a SwiftUI toolbar proxy.
struct ShellToolbarButton: NSViewRepresentable {
    var label: String
    var symbol: String
    var identifier: String
    var showsLabel = false
    /// Quiet: a labelled control without the pill surface (the composer's model chip).
    var quiet = false
    var small = false
    var primary = false
    var soft = false
    var panelAction: NativePanelAction? = nil
    var expanded: Bool? = nil
    var hint: String = ""
    var count: Int = 0
    var enabled = true
    var focusEpoch = 0
    var onTab: ((Bool) -> Void)? = nil
    /// Receives the control's frame in window coordinates on activation, for a layer anchored to it.
    var frameAction: ((CGRect) -> Void)? = nil
    var action: () -> Void
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeNSView(context: Context) -> FocusButton {
        let button = FocusButton()
        button.cell = PaddedButtonCell()
        button.bezelStyle = .toolbar
        button.isBordered = false
        button.wantsLayer = true
        button.focusRingType = .exterior
        button.setButtonType(.momentaryPushIn)
        button.controlSize = .regular
        button.target = context.coordinator
        button.action = #selector(Coordinator.activate(_:))
        button.setContentHuggingPriority(.required, for: .horizontal)
        // A label never wraps inside the control; it truncates, and the full text stays in help.
        button.lineBreakMode = .byTruncatingTail
        return button
    }
    func sizeThatFits(_ proposal: ProposedViewSize, nsView: FocusButton, context: Context) -> CGSize? {
        nsView.intrinsicContentSize
    }
    func updateNSView(_ button: FocusButton, context: Context) {
        context.coordinator.parent = self
        // A state glyph swaps with a short cross-fade so the press visibly changes the control.
        if button.image != nil, !symbol.isEmpty, context.coordinator.symbol != symbol, !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion {
            let fade = CATransition(); fade.type = .fade; fade.duration = metric("durationFast")
            button.layer?.add(fade, forKey: "symbol")
        }
        context.coordinator.symbol = symbol
        button.image = symbol.isEmpty ? nil : NSImage(systemSymbolName: symbol, accessibilityDescription: label)
        button.imagePosition = symbol.isEmpty ? .noImage : showsLabel || count > 0 ? .imageLeading : .imageOnly
        button.title = showsLabel ? label + (count > 0 ? " · " + String(count) : "") : count > 0 ? String(count) : ""
        button.font = .systemFont(ofSize: panelAction == nil ? NSFont.systemFontSize * metric(small ? "smallScale" : "labelScale") : NSFont.systemFontSize)
        button.titlebarControl = identifier == "navigation-toggle"
        button.solidPrimary = primary
        button.emphasized = primary || soft || (expanded == true && identifier != "navigation-toggle")
        if let expanded { button.setAccessibilityExpanded(expanded) }
        button.panelAction = panelAction
        button.bounded = showsLabel && !quiet
        (button.cell as? PaddedButtonCell)?.horizontalInset = showsLabel ? metric(quiet ? "small" : "inset") : 0
        button.invalidateIntrinsicContentSize()
        button.onTab = onTab
        if button.isEnabled != enabled {
            // Disabling the key view makes AppKit recompute the key loop, which reads SwiftUI's
            // focus graph re-entrantly during this update and spins (AttributeGraph cycle), e.g.
            // "New session" focused when interpretation starts. Defer it out of the update.
            if !enabled, button.window?.firstResponder === button {
                DispatchQueue.main.async { [weak button] in button?.isEnabled = false; button?.refreshSurface() }
            } else { button.isEnabled = enabled }
        }
        button.refreshSurface()
        button.toolTip = hint.isEmpty ? label : label + " (" + hint + ")"
        button.setAccessibilityLabel(label)
        button.setAccessibilityTitle(label)
        button.setAccessibilityIdentifier(identifier)
        button.setAccessibilityValue(count > 0 ? String(count) : nil)
        if focusEpoch != context.coordinator.focusEpoch {
            context.coordinator.focusEpoch = focusEpoch
            if focusEpoch > 0 { button.requestFocusWhenAttached() }
        }
    }
    // AppKit's borderless image-leading cell otherwise puts the icon against
    // the custom pill edge. Keep native text/image drawing inside shared insets.
    class PaddedButtonCell: NSButtonCell {
        var horizontalInset: CGFloat = 0
        override func drawInterior(withFrame cellFrame: NSRect, in controlView: NSView) {
            super.drawInterior(withFrame: cellFrame.insetBy(dx: horizontalInset, dy: 0), in: controlView)
        }
    }
    class FocusButton: NSButton {
        var titlebarControl = false
        var solidPrimary = false
        var hovered = false
        private var hoverArea: NSTrackingArea?
        override func updateTrackingAreas() {
            super.updateTrackingAreas()
            if let hoverArea { removeTrackingArea(hoverArea) }
            let area = NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect], owner: self)
            addTrackingArea(area); hoverArea = area
        }
        override func mouseEntered(with event: NSEvent) { hovered = true; refreshSurface() }
        override func mouseExited(with event: NSEvent) { hovered = false; refreshSurface() }
        // Pressed state: the surface darkens while the mouse is down, not only the glyph.
        var pressed = false
        override func highlight(_ flag: Bool) {
            super.highlight(flag)
            if pressed != flag { pressed = flag; refreshSurface() }
        }
        var emphasized = false
        var bounded = false
        var panelAction: NativePanelAction?
        private var surfaceRadius: CGFloat { panelAction == nil ? metric("compactControl") / 2 : metric("controlRadius") }
        var onTab: ((Bool) -> Void)?
        override func keyDown(with event: NSEvent) {
            if event.keyCode == 48, let onTab {
                onTab(event.modifierFlags.contains(.shift)); return
            }
            super.keyDown(with: event)
        }
        private var pendingFocus = false
        func requestFocusWhenAttached() {
            pendingFocus = true
            DispatchQueue.main.async { [weak self] in self?.restorePendingFocus() }
        }
        private func restorePendingFocus() {
            guard pendingFocus, let window else { return }
            focusGranted = true
            if window.makeFirstResponder(self) {
                pendingFocus = false
                if panelAction != nil { scrollToVisible(bounds) }
            }
        }
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            if pendingFocus { DispatchQueue.main.async { [weak self] in self?.restorePendingFocus() } }
        }
        override func viewDidChangeEffectiveAppearance() {
            super.viewDidChangeEffectiveAppearance()
            refreshSurface()
        }
        func refreshSurface() {
            effectiveAppearance.performAsCurrentDrawingAppearance {
                layer?.cornerRadius = surfaceRadius
                layer?.borderWidth = bounded ? metric("hairline") : 0
                let danger = panelAction == .destructive && isEnabled
                let solid = panelAction == .primary && isEnabled
                if panelAction == nil {
                    let scheme: ColorScheme = effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .dark : .light
                    let color: (String) -> NSColor = { NSColor(chromeColor($0, scheme)) }
                    layer?.borderColor = color("material-border").cgColor
                    layer?.backgroundColor = (!isEnabled ? NSColor.controlBackgroundColor
                        : solidPrimary ? color(hovered ? "action-hover" : "action")
                        : emphasized ? color("action-soft")
                        : pressed ? color(titlebarControl ? "chrome-item-active" : "surface-hover")
                        : hovered ? color(titlebarControl ? "chrome-item-hover" : "surface-hover")
                        : bounded ? color("surface") : NSColor.clear).cgColor
                    contentTintColor = !isEnabled ? .disabledControlTextColor
                        : solidPrimary ? color("action-fg")
                        : emphasized ? color("action-text")
                        : pressed || hovered ? color(titlebarControl ? "chrome-fg-strong" : "text-strong")
                        : color(titlebarControl ? "chrome-fg-muted" : "text-muted")
                    return
                }
                layer?.borderColor = (danger ? NSColor.systemRed : NSColor.separatorColor).cgColor
                layer?.backgroundColor = (solid ? NSColor.controlAccentColor
                    : danger ? NSColor.systemRed.withAlphaComponent(metric("selectionOpacity"))
                    : emphasized && isEnabled ? NSColor.controlAccentColor.withAlphaComponent(metric("selectionOpacity"))
                    : bounded ? NSColor.controlBackgroundColor : NSColor.clear).cgColor
                contentTintColor = !isEnabled ? .disabledControlTextColor
                    : solid ? .alternateSelectedControlTextColor : danger ? .systemRed
                    : emphasized ? .controlAccentColor : .labelColor
            }
        }
        // Borderless custom chrome has no AppKit bezel alignment insets.
        override var alignmentRectInsets: NSEdgeInsets { NSEdgeInsetsZero }
        override var acceptsFirstResponder: Bool { isEnabled }
        // Focus arrives only from keyboard navigation, an explicit request (focus return, assistive
        // press) or VoiceOver. AppKit otherwise selects the first control in the key loop whenever
        // the window becomes key, which rang the toggle without anyone asking for it.
        var focusGranted = false
        override func becomeFirstResponder() -> Bool {
            let keyboard = NSApp.currentEvent?.type == .keyDown
            guard focusGranted || keyboard || NSWorkspace.shared.isVoiceOverEnabled else { return false }
            focusGranted = false
            return super.becomeFirstResponder()
        }
        override func isAccessibilityFocused() -> Bool { window?.firstResponder === self }
        // A 36pt exterior ring otherwise exceeds the 40pt titlebar and clips.
        // Inset only its drawing mask, preserving the full native hit target.
        override var focusRingMaskBounds: NSRect {
            titlebarControl ? bounds.insetBy(dx: metric("tight"), dy: metric("tight")) : bounds
        }
        override func drawFocusRingMask() {
            NSBezierPath(roundedRect: focusRingMaskBounds, xRadius: surfaceRadius, yRadius: surfaceRadius).fill()
        }
        override var intrinsicContentSize: NSSize {
            // The drawing inset is part of the width, so a labelled quiet control never wraps its title.
            NSSize(width: max(metric("compactControl"), super.intrinsicContentSize.width + ((cell as? PaddedButtonCell)?.horizontalInset ?? 0) * 2), height: metric("compactControl"))
        }
    }
    @MainActor class Coordinator: NSObject {
        var parent: ShellToolbarButton
        var focusEpoch = 0
        var symbol = ""
        init(_ parent: ShellToolbarButton) { self.parent = parent }
        // Keyboard and assistive activation keep focus on the control (the ring is the cue);
        // a mouse click leaves focus where it was, as native toolbar buttons do.
        @objc func activate(_ sender: NSButton) {
            let mouse = NSApp.currentEvent.map { [.leftMouseDown, .leftMouseUp, .rightMouseUp, .otherMouseUp].contains($0.type) } ?? false
            if !mouse { (sender as? FocusButton)?.focusGranted = true; sender.window?.makeFirstResponder(sender) }
            parent.frameAction?(sender.convert(sender.bounds, to: nil))
            parent.action()
        }
    }
}

// Only the empty header surface drags; controls retain their native hit targets.
struct WindowDragRegion: NSViewRepresentable {
    func makeNSView(context: Context) -> DragView { DragView() }
    func updateNSView(_ view: DragView, context: Context) {}
    class DragView: NSView {
        override func mouseDown(with event: NSEvent) { window?.performDrag(with: event) }
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            NotificationCenter.default.removeObserver(self, name: NSWindow.didResizeNotification, object: nil)
            NotificationCenter.default.removeObserver(self, name: NSWindow.didExitFullScreenNotification, object: nil)
            if let window {
                NotificationCenter.default.addObserver(self, selector: #selector(windowGeometryChanged), name: NSWindow.didResizeNotification, object: window)
                NotificationCenter.default.addObserver(self, selector: #selector(windowGeometryChanged), name: NSWindow.didExitFullScreenNotification, object: window)
            }
            windowGeometryChanged()
        }
        override func layout() {
            super.layout()
            // SwiftUI may still reposition ancestors during this layout pass.
            DispatchQueue.main.async { [weak self] in self?.alignWindowControls() }
        }
        @objc private func windowGeometryChanged() {
            // Height-only resize can reset AppKit controls without laying out
            // this fixed-height titlebar view again.
            DispatchQueue.main.async { [weak self] in self?.alignWindowControls() }
        }
        private func alignWindowControls() {
            guard let window, window.styleMask.contains(.titled),
                  !window.styleMask.contains(.fullScreen), bounds.height > 0 else { return }
            // The system titlebar container is shorter than the Review 18 header
            // row; grow it so centered window controls are not clipped.
            if let titlebar = window.standardWindowButton(.closeButton)?.superview,
               let container = titlebar.superview, let frame = container.superview,
               abs(container.frame.height - bounds.height) > metric("hairline") {
                container.frame = NSRect(x: 0, y: frame.bounds.height - bounds.height, width: frame.bounds.width, height: bounds.height)
                titlebar.frame = container.bounds
            }
            for kind in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] {
                guard let button = window.standardWindowButton(kind), let parent = button.superview else { continue }
                let center = convert(NSPoint(x: bounds.midX, y: bounds.midY), to: parent)
                button.setFrameOrigin(NSPoint(x: button.frame.minX, y: center.y - button.frame.height / 2))
            }
        }
    }
}

// This shell draws its own titlebar and includes it in the minimum window size.
// NSHostingView's automatic minimum is a content minimum, which AppKit adds
// its titlebar to even for fullSizeContentView. Own the full-frame minimum here.
@MainActor private protocol ShellHostingSurface: AnyObject {
    func useFullWindowArea()
}
extension NSHostingView: ShellHostingSurface {
    fileprivate func useFullWindowArea() { sizingOptions.remove(.minSize) }
}

struct WindowReference: NSViewRepresentable {
    var ready: (NSWindow) -> Void
    func makeNSView(context: Context) -> ReferenceView { let view = ReferenceView(); view.ready = ready; return view }
    func updateNSView(_ view: ReferenceView, context: Context) { view.ready = ready }
    class ReferenceView: NSView {
        var ready: ((NSWindow) -> Void)?
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            if let window {
                var ancestor = superview
                while let view = ancestor {
                    if let host = view as? any ShellHostingSurface { host.useFullWindowArea(); break }
                    ancestor = view.superview
                }
                window.minSize = NSSize(width: metric("minWindowWidth"), height: metric("minWindowHeight"))
                DispatchQueue.main.async { self.ready?(window) }
            }
        }
    }
}

struct NativeNavigation: View {
    @Bindable var store: WorkbenchStore
    var screen: String
    var expanded: Bool
    var select: (String) -> Void
    var commands: () -> Void
    var close: (() -> Void)?
    @Environment(\.colorScheme) private var scheme
    @State private var hoveredItem: String?
    // Review 18: one workspace list, then a single system group that ends in Settings.
    private let workspaceItems: [(String, String)] = [("chat", "bubble.left.and.bubble.right"), ("translate", "translate"), ("interpret", "waveform"), ("dictionary", "book"), ("everywhere", "text.viewfinder")]
    private let systemItems: [(String, String)] = [("apps", "macwindow"), ("thermal", "thermometer.medium"), ("utilities", "command")]
    var body: some View {
        VStack(spacing: metric("small")) {
            HStack(spacing: metric("gap")) {
                if let url = NativeResources.brandURL, let icon = NSImage(contentsOf: url) {
                    // One size in both states; its centre sits on the icon axis (rail centre), so nothing jumps.
                    Image(nsImage: icon).resizable().scaledToFit()
                        .frame(width: metric("large") - metric("tight"), height: metric("large") - metric("tight")).accessibilityHidden(true)
                }
                if expanded { Text("Viezan").font(.vzn("titleScale", .semibold)).fontWeight(.semibold).transition(.opacity); Spacer(minLength: 0) }
                if let close { ShellCloseButton(label: store.text("close"), focusOnAppear: true, action: close) }
            }.frame(height: metric("navControl")).padding(.horizontal, expanded ? metric("gap") : 0)
            Button(action: commands) {
                HStack {
                    if !expanded { Image(systemName: "magnifyingglass").frame(width: metric("icon")) }
                    if expanded {
                        Text(store.text("searchEverything")).lineLimit(1)
                        Spacer(minLength: metric("tight"))
                        Text("⌘ K").font(.vzn("captionScale")).accessibilityHidden(true)
                    }
                }.padding(.horizontal, expanded ? metric("inset") : 0)
                    .frame(maxWidth: .infinity).frame(height: metric("compactControl"))
                    .font(.system(size: NSFont.systemFontSize * metric("smallScale")))
                    // Expanded it reads as a field; in the rail it is one more quiet icon, like the rows.
                    .background(expanded ? chromeColor("sidebar-search-bg", scheme) : hoveredItem == "search" ? chromeColor("chrome-item-hover", scheme) : .clear, in: RoundedRectangle(cornerRadius: metric("chromeItemRadius")))
                    .overlay(RoundedRectangle(cornerRadius: metric("chromeItemRadius")).strokeBorder(expanded ? chromeColor("material-border", scheme) : .clear, lineWidth: metric("hairline")))
            }.buttonStyle(.plain).foregroundStyle(chromeColor(hoveredItem == "search" ? "chrome-fg" : "chrome-fg-muted", scheme))
                .onHover { hoveredItem = $0 ? "search" : nil }
                .accessibilityIdentifier("navigation-search")
                .accessibilityLabel(store.text("searchEverything") + " · " + store.text("commands")).help(store.text("commands") + " (⌘K)")
            ScrollView {
                VStack(alignment: .leading, spacing: metric("tight")) {
                    Color.clear.frame(height: metric("small")).accessibilityHidden(true)
                    row("home", "house")
                    ForEach(workspaceItems.filter { store.moduleEnabled($0.0) }, id: \.0) { id, symbol in row(id, symbol) }
                    if expanded {
                        Text(store.text("groupSystem").uppercased()).font(.vzn("captionScale")).tracking(metric("hairline"))
                            .foregroundStyle(chromeColor("chrome-fg-soft", scheme))
                            .padding(.horizontal, metric("inset")).padding(.top, metric("gap")).padding(.bottom, metric("tight"))
                            .accessibilityAddTraits(.isHeader).transition(.opacity)
                    } else { ChromeDivider().padding(.vertical, metric("small")) }
                    ForEach(systemItems.filter { store.moduleEnabled($0.0) }, id: \.0) { id, symbol in row(id, symbol) }
                    row("settings", "slider.horizontal.3")
                }
            }.scrollIndicators(.hidden).frame(maxHeight: .infinity)
            backgroundStrip
            if expanded { privacyFooter }
        }.padding(metric("small"))
            .foregroundStyle(chromeColor("chrome-fg", scheme)).background { ChromeSurface() }
            .accessibilityElement(children: .contain).accessibilityLabel(store.text("primaryNavigation"))
    }
    /// What keeps running behind the pages: fan control, global shortcuts, the Chrome bridge.
    private var backgroundRows: [(route: String, text: String)] {
        var rows: [(String, String)] = []
        let monitor = store.thermalMonitor
        if store.moduleEnabled("thermal"), monitor.controlling {
            let profile = monitor.activeProfile.flatMap { id in monitor.profiles.first { $0.id == id } }
            rows.append(("thermal", profile.map { store.text("fansProfile").replacingOccurrences(of: "{profile}", with: UUID(uuidString: $0.id) == nil ? store.text($0.name) : $0.name) } ?? store.text("fansCustom")))
        }
        let shortcuts = store.desktopIntegration.shortcuts.filter(\.enabled).count
        if store.moduleEnabled("utilities"), shortcuts > 0 { rows.append(("utilities", store.text("hotkeys") + " · " + String(shortcuts))) }
        if store.moduleEnabled("bridge"), store.extensionBridge.listening { rows.append(("everywhere", store.text("browserBridge"))) }
        return rows.map { (route: $0.0, text: $0.1) }
    }
    // Expanded only: the rail shows the same state as a dot on the route's own icon.
    @ViewBuilder private var backgroundStrip: some View {
        let rows = backgroundRows
        if !rows.isEmpty, expanded {
            ChromeDivider().padding(.vertical, metric("tight"))
            VStack(alignment: .leading, spacing: 0) {
                    Text(store.text("backgroundRunning").uppercased()).font(.vzn("captionScale")).tracking(metric("hairline"))
                        .foregroundStyle(chromeColor("chrome-fg-soft", scheme)).padding(.horizontal, metric("inset")).padding(.bottom, metric("tight")).accessibilityAddTraits(.isHeader)
                    ForEach(rows, id: \.route) { row in
                        Button { select(row.route) } label: {
                            HStack(spacing: metric("small")) { StatusDot(tone: .ready); Text(row.text).lineLimit(1); Spacer(minLength: 0) }
                                .font(.vzn("smallScale")).padding(.horizontal, metric("inset")).frame(height: metric("compactControl") - metric("tight")).contentShape(Rectangle())
                        }.buttonStyle(.plain).foregroundStyle(chromeColor("chrome-fg-muted", scheme)).accessibilityIdentifier("background-" + row.route)
                    }
            }.accessibilityElement(children: .contain).accessibilityLabel(store.text("backgroundRunning"))
        }
    }
    // Local-first reminder; data never leaves the device unless a provider is chosen.
    private var privacyFooter: some View {
        HStack(alignment: .firstTextBaseline, spacing: metric("small")) {
            StatusDot(tone: .ready)
            VStack(alignment: .leading, spacing: 0) {
                Text(store.text("privacyTitle")); Text(store.text("privacyHint"))
            }.lineLimit(1)
            Spacer(minLength: 0)
        }.font(.vzn("smallScale")).foregroundStyle(chromeColor("chrome-fg-muted", scheme))
            .padding(.horizontal, metric("inset")).padding(.vertical, metric("small"))
            .accessibilityElement(children: .combine)
    }
    private func row(_ id: String, _ symbol: String) -> some View {
        let implemented = ["home", "chat", "translate", "dictionary", "settings", "utilities", "everywhere", "thermal", "interpret", "apps"].contains(id)
        let enabled = implemented && (!store.loadBlocked || id == "settings")
        // Settings carries the one shell-level warning: the chosen cloud provider has no key yet.
        let missingKey = id == "settings" && store.providers.availability(store.session.model) == .missingKey
        let running = backgroundRows.first { $0.route == id }
        let railNote = expanded ? "" : missingKey ? ": " + store.text("keyAbsent") : running.map { ": " + $0.text } ?? ""
        return Button { select(id) } label: {
            HStack(spacing: metric("gap")) {
                Image(systemName: symbol).symbolRenderingMode(.monochrome).imageScale(.medium).frame(width: metric("icon"))
                    .overlay(alignment: .topTrailing) {
                        if !expanded, missingKey || running != nil { StatusDot(tone: missingKey ? .failed : .ready).offset(x: metric("tight"), y: -metric("tight")) }
                    }
                if expanded {
                    Text(store.text(id)).lineLimit(1).transition(.opacity); Spacer(minLength: 0)
                    if missingKey { HStack(spacing: metric("tight")) { StatusDot(tone: .failed); Text(store.text("keyAbsent")).font(.vzn("captionScale")) }.foregroundStyle(chromeColor("chrome-fg-muted", scheme)) }
                }
            }.padding(.horizontal, expanded ? metric("inset") : 0)
                .frame(maxWidth: .infinity, alignment: expanded ? .leading : .center).frame(height: metric("compactControl"))
                .contentShape(Rectangle())
        }.buttonStyle(.plain).foregroundStyle(chromeColor(screen == id ? "chrome-item-active-fg" : "chrome-fg", scheme))
            .font(.system(size: NSFont.systemFontSize * metric("labelScale"), weight: screen == id ? .semibold : .regular))
            .background(screen == id ? chromeColor("chrome-item-active", scheme) : enabled && hoveredItem == id ? chromeColor("chrome-item-hover", scheme) : .clear, in: RoundedRectangle(cornerRadius: metric("chromeItemRadius")))
            .overlay(RoundedRectangle(cornerRadius: metric("chromeItemRadius")).strokeBorder(screen == id ? chromeColor("material-highlight", scheme) : .clear, lineWidth: metric("hairline")))
            .onHover { hoveredItem = $0 && enabled ? id : nil }
            .accessibilityLabel(store.text(id) + (missingKey ? ": " + store.text("keyAbsent") : railNote)).accessibilityIdentifier("nav-" + id)
            .accessibilityAddTraits(screen == id ? .isSelected : []).disabled(!enabled)
            .help(implemented ? store.text(id) + railNote : store.text(id) + " — " + store.text("shellUnavailable"))
    }
}

enum CommandSelection {
    static func moved(_ index: Int, by offset: Int, count: Int) -> Int {
        guard count > 0 else { return 0 }
        return ((index + offset) % count + count) % count
    }
}

/// What a palette query means beyond page names: a sum, a `t `/`d ` prefix, or a `?` question.
enum PaletteQuery: Equatable {
    case calculation(String), translate(String), lookup(String), ask(String)
    static func parse(_ raw: String) -> PaletteQuery? {
        let query = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return nil }
        if let value = LauncherCalculator.evaluate(query) { return .calculation(value) }
        if query.hasPrefix("?") { let text = query.drop(while: { $0 == "?" }).trimmingCharacters(in: .whitespaces); return text.isEmpty ? nil : .ask(text) }
        if raw.lowercased().hasPrefix("t ") { let text = raw.dropFirst(2).trimmingCharacters(in: .whitespacesAndNewlines); return text.isEmpty ? nil : .translate(text) }
        if raw.lowercased().hasPrefix("d ") { let text = raw.dropFirst(2).trimmingCharacters(in: .whitespacesAndNewlines); return text.isEmpty ? nil : .lookup(text) }
        return nil
    }
}

struct NativeCommands: View {
    @Environment(\.colorScheme) private var scheme
    @Bindable var store: WorkbenchStore
    var historyAvailable = true
    var availableHeight: CGFloat
    @State private var contentHeight: CGFloat = 0
    var execute: (String) -> Void
    var dismiss: () -> Void
    @State private var query = ""
    @State private var index = 0
    @State private var searchFocusEpoch = 0
    @State private var closeFocusEpoch = 0
    private struct Entry: Identifiable { let id: String; let title: String; let symbol: String; let shortcut: String; let run: () -> Void }
    private var entries: [Entry] {
        var rows: [Entry] = []
        // Calculator, Ask AI and the t / d prefixes come first; page commands follow.
        let special = PaletteQuery.parse(query)
        if let special, !store.loadBlocked {
            switch special {
            case .calculation(let value):
                rows.append(Entry(id: "calc", title: store.text("paletteCalc").replacingOccurrences(of: "{result}", with: value), symbol: "equal.circle", shortcut: "") {
                    NSPasteboard.general.clearContents(); NSPasteboard.general.setString(value, forType: .string); dismiss()
                })
            case .ask(let text):
                rows.append(Entry(id: "ask", title: store.text("paletteAsk").replacingOccurrences(of: "{query}", with: text), symbol: "sparkles", shortcut: "") { start(.chat, text: text) })
            case .translate(let text):
                if store.moduleEnabled("translate") { rows.append(Entry(id: "translate-text", title: store.text("paletteTranslate").replacingOccurrences(of: "{text}", with: text), symbol: "translate", shortcut: "") { start(.translate, text: text) }) }
            case .lookup(let text):
                if store.moduleEnabled("dictionary") { rows.append(Entry(id: "lookup-text", title: store.text("paletteLookup").replacingOccurrences(of: "{text}", with: text), symbol: "book", shortcut: "") { start(.dictionary, text: text) }) }
            }
        }
        for item in nativeResources.matchingCommands(query: special == nil ? query : "", locale: store.workspace.locale) where store.moduleEnabled(item.id) && (!store.loadBlocked || ["settings", "activity"].contains(item.id)) && (historyAvailable || item.id != "history") {
            rows.append(Entry(id: item.id, title: store.text(item.title), symbol: item.systemImage, shortcut: item.shortcut) { execute(item.id) })
        }
        return rows
    }
    /// A new session of that feature with the text sent at once; the page opens on it.
    private func start(_ feature: Feature, text: String) {
        guard store.moduleEnabled(feature.rawValue) else { return }
        store.navigate(feature); store.newSession(); let id = store.session.id
        store.setDraft(id, text); store.submit(id); execute(feature.rawValue)
    }
    private func move(_ offset: Int) { index = CommandSelection.moved(index, by: offset, count: entries.count) }
    private func open() { if entries.indices.contains(index) { entries[index].run() } }
    var body: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            HStack {
                Text(store.text("commands")).font(.vzn("labelScale", .semibold))
                Spacer()
                ShellToolbarButton(label: store.text("close"), symbol: "xmark", identifier: "panel-close", focusEpoch: closeFocusEpoch, onTab: { _ in searchFocusEpoch += 1 }, action: dismiss)
                    .frame(width: metric("control"), height: metric("control"))
            }.frame(height: metric("control"))
            SearchBox(query: $query, label: store.text("commandSearch"), move: move, submit: open, cancel: dismiss, first: { index = 0 }, last: { index = max(0, entries.count - 1) }, onTab: { _ in closeFocusEpoch += 1 }, focusEpoch: searchFocusEpoch).frame(height: metric("control"))
            if entries.isEmpty { Text(store.text("noCommands")).foregroundStyle(.secondary).frame(maxWidth: .infinity, minHeight: metric("control")) }
            else {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(spacing: metric("tight")) {
                            ForEach(Array(entries.enumerated()), id: \.element.id) { offset, item in
                                Button { item.run() } label: {
                                    HStack {
                                        Label(item.title, systemImage: item.symbol).lineLimit(1)
                                        Spacer()
                                        if !item.shortcut.isEmpty {
                                            Text("⌘" + item.shortcut.replacingOccurrences(of: "Shift+", with: "⇧")).font(.vzn("captionScale")).foregroundStyle(.secondary).fixedSize()
                                        }
                                    }.padding(.horizontal, metric("small")).frame(maxWidth: .infinity, alignment: .leading)
                                        .frame(height: metric("compactControl")).contentShape(Rectangle())
                                }.buttonStyle(.plain).focusable(false)
                                    .foregroundStyle(offset == index ? contentColor("action-text", scheme) : Color.primary)
                                    .onHover { if $0 { index = offset } }
                                    .help(item.title)
                                    .background(offset == index ? contentColor("action-soft", scheme) : Color.clear, in: RoundedRectangle(cornerRadius: metric("radius")))
                                    .accessibilityAddTraits(offset == index ? .isSelected : []).id(item.id)
                            }
                        }.onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
                    }.frame(height: min(max(metric("control"), contentHeight), max(metric("control"), availableHeight - metric("control") * 2 - metric("inset") * 4)))
                    .onChange(of: index) { _, value in if entries.indices.contains(value) { proxy.scrollTo(entries[value].id) } }
                }
            }
        }.padding(metric("inset"))
            .accessibilityElement(children: .contain).accessibilityLabel(store.text("commands"))
            .onChange(of: query) { _, _ in index = 0 }
    }
}

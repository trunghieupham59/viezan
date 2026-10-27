import SwiftUI
import Observation
import ViezanDomain

@MainActor @Observable final class NativeTheme {
    static let shared = NativeTheme()
    var preferences = AppearancePreferences()
}
// Colors are generated from the canonical product tokens.
@MainActor func chromeColor(_ role: String, _ scheme: ColorScheme) -> Color {
    let preferences = NativeTheme.shared.preferences
    let key = (preferences.preset ?? "glass") + ":" + (preferences.accent ?? "auto")
    let mode = preferences.preset == "midnight" || scheme == .dark ? "dark" : "light"
    let hex = nativeResources.themePalettes[key]?[mode]?[role] ?? nativeResources.chromePalettes[mode]![role]!
    let raw = UInt64(hex.dropFirst(), radix: 16)!
    let alpha = hex.count == 9 ? Double((raw >> 24) & 255) / 255 : 1
    return Color(.sRGB, red: Double((raw >> 16) & 255) / 255,
                 green: Double((raw >> 8) & 255) / 255, blue: Double(raw & 255) / 255, opacity: alpha)
}

struct ChromeSurface: View {
    var titlebar = false
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        if titlebar {
            chromeColor("titlebar-bg", scheme).overlay {
                LinearGradient(colors: [chromeColor("action-soft", scheme), .clear], startPoint: .leading, endPoint: .trailing)
            }
        } else { chromeColor("sidebar-bg", scheme) }
    }
}

// Explicit chrome dividers keep fixture and live-window contrast identical.
struct ChromeDivider: View {
    var vertical = false
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        Rectangle().fill(chromeColor("divider", scheme))
            .background(chromeColor("sidebar-bg", scheme))
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
    case "demo.standard": store.text("steady")
    case "demo.slow": store.text("slow")
    case "demo.failure": store.text("failure")
    default: id
    }
}

enum ShellOverlay: String { case navigation, history, activity, commands }

struct ShellLayout {
    var width: CGFloat
    var height: CGFloat
    var collapsed: Bool
    static var titlebarHeight: CGFloat { metric("titlebar") }
    static var headerHeight: CGFloat { metric("navControl") + metric("inset") }
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

@MainActor @Observable final class ShellPresentation {
    struct Request: Equatable { let id = UUID(); let command: String }
    var request: Request?
    var overlay: ShellOverlay?
    var library = false
    var focusEpochs: [String: Int] = [:]
    func issue(_ command: String) { request = Request(command: command) }
    weak var opener: NSResponder?
    private var focusGeneration = 0
    func show(_ next: ShellOverlay, from responder: NSResponder? = nil) {
        focusGeneration += 1
        if overlay == next { dismiss(); return }
        if overlay == nil { opener = responder }
        overlay = next
    }
    func dismiss(returnFocus: Bool = true) {
        focusGeneration += 1
        let generation = focusGeneration
        guard let old = overlay else { return }
        overlay = nil
        if returnFocus {
            if let view = opener as? NSView, let window = view.window {
                DispatchQueue.main.async { [weak self, weak view, weak window] in
                    guard let self, self.focusGeneration == generation, self.overlay == nil else { return }
                    // Compact reflow may detach or disable the original control.
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
struct ReadingPanelSurface: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        RoundedRectangle(cornerRadius: metric("surfaceRadius"))
            .fill(chromeColor("canvas", scheme))
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
    var primary = false
    var panelAction: NativePanelAction? = nil
    var expanded: Bool? = nil
    var hint: String = ""
    var count: Int = 0
    var enabled = true
    var focusEpoch = 0
    var onTab: ((Bool) -> Void)? = nil
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
        return button
    }
    func sizeThatFits(_ proposal: ProposedViewSize, nsView: FocusButton, context: Context) -> CGSize? {
        nsView.intrinsicContentSize
    }
    func updateNSView(_ button: FocusButton, context: Context) {
        context.coordinator.parent = self
        button.image = symbol.isEmpty ? nil : NSImage(systemSymbolName: symbol, accessibilityDescription: label)
        button.imagePosition = symbol.isEmpty ? .noImage : showsLabel || count > 0 ? .imageLeading : .imageOnly
        button.title = showsLabel ? label + (count > 0 ? " · " + String(count) : "") : count > 0 ? String(count) : ""
        button.titlebarControl = identifier == "navigation-toggle"
        button.solidPrimary = primary
        button.emphasized = primary || (expanded == true && identifier != "navigation-toggle")
        if let expanded { button.setAccessibilityExpanded(expanded) }
        button.panelAction = panelAction
        button.bounded = showsLabel
        (button.cell as? PaddedButtonCell)?.horizontalInset = showsLabel ? metric("inset") : 0
        button.invalidateIntrinsicContentSize()
        button.onTab = onTab
        button.isEnabled = enabled
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
        var emphasized = false
        var bounded = false
        var panelAction: NativePanelAction?
        private var surfaceRadius: CGFloat { metric(panelAction == nil ? "surfaceRadius" : "controlRadius") }
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
                    layer?.borderColor = color("border").cgColor
                    layer?.backgroundColor = (!isEnabled ? NSColor.controlBackgroundColor
                        : solidPrimary ? color(hovered ? "action-hover" : "action")
                        : emphasized ? color("action-soft")
                        : hovered ? color(titlebarControl ? "chrome-item-hover" : "surface-hover")
                        : bounded ? color("surface") : NSColor.clear).cgColor
                    contentTintColor = !isEnabled ? .disabledControlTextColor
                        : solidPrimary ? color("action-fg")
                        : emphasized ? color("action-text") : color(titlebarControl ? "chrome-fg-muted" : "text-muted")
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
            NSSize(width: max(metric("control"), super.intrinsicContentSize.width + (bounded ? metric("inset") * 2 : 0)), height: metric("control"))
        }
    }
    @MainActor class Coordinator: NSObject {
        var parent: ShellToolbarButton
        var focusEpoch = 0
        init(_ parent: ShellToolbarButton) { self.parent = parent }
        @objc func activate(_ sender: NSButton) { sender.window?.makeFirstResponder(sender); parent.action() }
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
    private let groups: [(String, [(String, String)])] = [
        ("groupAI", [("chat", "bubble.left.and.bubble.right")]),
        ("groupLanguage", [("translate", "character.bubble"), ("interpret", "mic"), ("dictionary", "book.closed"), ("everywhere", "globe")]),
        ("groupSystem", [("apps", "square.grid.2x2"), ("thermal", "thermometer.medium")]),
        ("groupTools", [("utilities", "keyboard")])
    ]
    var body: some View {
        VStack(spacing: metric("small")) {
            HStack(spacing: metric("gap")) {
                if let url = NativeResources.brandURL, let icon = NSImage(contentsOf: url) {
                    Image(nsImage: icon).resizable().scaledToFit()
                        .frame(width: metric("brand"), height: metric("brand")).accessibilityHidden(true)
                }
                if expanded { Text("Viezan").font(.title2).fontWeight(.semibold); Spacer(minLength: 0) }
                if let close { ShellCloseButton(label: store.text("close"), focusOnAppear: true, action: close) }
            }.frame(height: metric("navControl")).padding(.horizontal, expanded ? metric("small") : 0)
            Button(action: commands) {
                HStack {
                    Image(systemName: "magnifyingglass").frame(width: metric("icon"))
                    if expanded {
                        Text(store.text("searchLabel")).lineLimit(1)
                        Spacer(minLength: metric("tight"))
                        Text("⌘K").font(.system(.caption, design: .monospaced))
                            .padding(.horizontal, metric("tight"))
                            .background(chromeColor("surface-raised", scheme), in: RoundedRectangle(cornerRadius: metric("chromeShortcutRadius")))
                            .overlay(RoundedRectangle(cornerRadius: metric("chromeShortcutRadius"))
                                .strokeBorder(chromeColor("border-strong", scheme), lineWidth: metric("hairline")))
                            .accessibilityHidden(true)
                    }
                }.padding(.horizontal, expanded ? metric("gap") : 0)
                    .frame(maxWidth: .infinity).frame(height: metric("compactControl"))
                    .background(chromeColor("surface", scheme), in: RoundedRectangle(cornerRadius: metric("chromeSearchRadius")))
                    .overlay(RoundedRectangle(cornerRadius: metric("chromeSearchRadius")).strokeBorder(chromeColor("border-strong", scheme), lineWidth: metric("hairline")))
            }.buttonStyle(.plain).foregroundStyle(chromeColor(hoveredItem == "search" ? "chrome-fg-strong" : "chrome-fg-muted", scheme))
                .onHover { hoveredItem = $0 ? "search" : nil }
                .accessibilityIdentifier("navigation-search")
                .accessibilityLabel(store.text("searchLabel")).help(store.text("commands") + " (⌘K)")
            ChromeDivider().padding(.vertical, metric("small"))
            ScrollView {
                VStack(alignment: .leading, spacing: metric("tight")) {
                    row("home", "house")
                    ForEach(groups.indices, id: \.self) { index in
                        if expanded {
                            Text(store.text(groups[index].0).uppercased()).font(.caption).tracking(metric("hairline"))
                                .foregroundStyle(chromeColor("chrome-fg-soft", scheme))
                                .padding(.horizontal, metric("gap")).padding(.top, metric("gap")).padding(.bottom, metric("tight"))
                        } else { ChromeDivider().padding(.vertical, metric("small")) }
                        ForEach(groups[index].1.filter { store.moduleEnabled($0.0) }, id: \.0) { id, symbol in row(id, symbol) }
                    }
                }
            }.frame(maxHeight: .infinity)
            if expanded {
                VStack(spacing: metric("small")) {
                    footer("hotkeys", "keyboard")
                    footer("browserBridge", "globe")
                }.padding(.horizontal, metric("gap"))
            }
            ChromeDivider()
            row("settings", "gearshape")
        }.padding(metric("small"))
            .foregroundStyle(chromeColor("chrome-fg-strong", scheme)).background { ChromeSurface() }
            .accessibilityElement(children: .contain).accessibilityLabel(store.text("primaryNavigation"))
    }
    private func footer(_ key: String, _ symbol: String) -> some View {
        let active = key == "browserBridge" ? store.extensionBridge.listening : store.desktopIntegration.error == nil && store.desktopIntegration.shortcuts.contains { $0.enabled }
        return Button { select(key == "browserBridge" ? "everywhere" : "utilities") } label: {
            HStack(spacing: metric("small")) {
                Image(systemName: symbol).frame(width: metric("icon")); Text(store.text(key)).lineLimit(1)
                Spacer(minLength: 0)
                Image(systemName: active ? "checkmark.circle" : "minus.circle").accessibilityLabel(store.text(active ? "running" : "stopped"))
            }.font(.caption).foregroundStyle(chromeColor("chrome-fg-soft", scheme))
        }.buttonStyle(.plain).disabled(store.loadBlocked)
    }
    private func row(_ id: String, _ symbol: String) -> some View {
        let implemented = ["home", "chat", "translate", "dictionary", "settings", "utilities", "everywhere", "thermal", "interpret", "apps"].contains(id)
        let enabled = implemented && (!store.loadBlocked || id == "settings")
        return Button { select(id) } label: {
            HStack(spacing: metric("gap")) {
                Image(systemName: symbol).symbolRenderingMode(.monochrome).frame(width: metric("icon"))
                    .foregroundStyle(screen == id ? chromeColor("chrome-accent", scheme) : chromeColor("chrome-fg-muted", scheme))
                if expanded { Text(store.text(id)).lineLimit(1); Spacer(minLength: 0) }
            }.padding(.horizontal, expanded ? metric("gap") : 0)
                .frame(maxWidth: .infinity, alignment: expanded ? .leading : .center).frame(height: metric("compactControl"))
                .contentShape(Rectangle())
        }.buttonStyle(.plain).foregroundStyle(chromeColor(screen == id ? "chrome-fg-strong" : "chrome-fg-muted", scheme))
            .fontWeight(screen == id ? .semibold : .regular)
            .background(screen == id ? chromeColor("chrome-item-active", scheme) : enabled && hoveredItem == id ? chromeColor("chrome-item-hover", scheme) : .clear, in: RoundedRectangle(cornerRadius: metric("surfaceRadius")))
            .onHover { hoveredItem = $0 && enabled ? id : nil }
            .accessibilityLabel(store.text(id)).accessibilityIdentifier("nav-" + id)
            .accessibilityAddTraits(screen == id ? .isSelected : []).disabled(!enabled)
            .help(implemented ? store.text(id) : store.text(id) + " — " + store.text("shellUnavailable"))
    }
}

enum CommandSelection {
    static func moved(_ index: Int, by offset: Int, count: Int) -> Int {
        guard count > 0 else { return 0 }
        return ((index + offset) % count + count) % count
    }
}

struct NativeCommands: View {
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
    private var entries: [NativeResources.CommandItem] {
        nativeResources.matchingCommands(query: query, locale: store.workspace.locale).filter { (!store.loadBlocked || ["settings", "activity"].contains($0.id)) && (historyAvailable || $0.id != "history") }
    }
    private func move(_ offset: Int) { index = CommandSelection.moved(index, by: offset, count: entries.count) }
    private func open() { if entries.indices.contains(index) { execute(entries[index].id) } }
    var body: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            HStack {
                Text(store.text("commands")).font(.headline)
                Spacer()
                ShellToolbarButton(label: store.text("close"), symbol: "xmark", identifier: "panel-close", focusEpoch: closeFocusEpoch, onTab: { _ in searchFocusEpoch += 1 }, action: dismiss)
                    .frame(width: metric("control"), height: metric("control"))
            }.frame(height: metric("control"))
            HistorySearch(query: $query, label: store.text("commandSearch"), move: move, submit: open, cancel: dismiss, first: { index = 0 }, last: { index = max(0, entries.count - 1) }, onTab: { _ in closeFocusEpoch += 1 }, focusEpoch: searchFocusEpoch).frame(height: metric("control"))
            if entries.isEmpty { Text(store.text("noCommands")).foregroundStyle(.secondary).frame(maxWidth: .infinity, minHeight: metric("control")) }
            else {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(spacing: metric("tight")) {
                            ForEach(Array(entries.enumerated()), id: \.element.id) { offset, item in
                                Button { execute(item.id) } label: {
                                    HStack {
                                        Label(store.text(item.title), systemImage: item.systemImage).lineLimit(1)
                                        Spacer()
                                        Text("⌘" + item.shortcut.replacingOccurrences(of: "Shift+", with: "⇧")).font(.caption).foregroundStyle(.secondary).fixedSize()
                                    }.padding(.horizontal, metric("small")).frame(maxWidth: .infinity, alignment: .leading)
                                        .frame(height: metric("compactControl")).contentShape(Rectangle())
                                }.buttonStyle(.plain).focusable(false)
                                    .foregroundStyle(offset == index ? Color.accentColor : Color.primary)
                                    .onHover { if $0 { index = offset } }
                                    .help(store.text(item.title))
                                    .background(offset == index ? Color.accentColor.opacity(metric("selectionOpacity")) : Color.clear, in: RoundedRectangle(cornerRadius: metric("radius")))
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

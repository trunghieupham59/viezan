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
// Liquid Glass 2.0 defines its own reading roles in both modes (warm pane,
// lavender actions); every preset reads content roles from its own palette.
@MainActor func contentColor(_ role: String, _ scheme: ColorScheme) -> Color {
    paletteColor(NativeTheme.shared.preferences.preset ?? "glass", role, scheme)
}
@MainActor var glassPreset: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
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
    var identifier: String? = nil
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    var body: some View {
        if reduceTransparency || contrast == .increased { chromeColor(titlebar ? "titlebar-bg" : "sidebar-bg", scheme) }
        else {
            let milkyGlass = scheme == .light && (NativeTheme.shared.preferences.preset ?? "glass") == "glass"
            VisualEffectBackground(material: milkyGlass ? .sidebar : titlebar ? .titlebar : .sidebar, identifier: identifier)
                .overlay {
                    if milkyGlass && !titlebar {
                        LinearGradient(colors: [chromeColor("titlebar-material", scheme), chromeColor("primary-nav-material", scheme)],
                                       startPoint: .top, endPoint: .bottom)
                    } else { chromeColor(titlebar ? "titlebar-material" : "primary-nav-material", scheme) }
                }
        }
    }
}

struct VisualEffectBackground: NSViewRepresentable {
    var material: NSVisualEffectView.Material
    var identifier: String? = nil
    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = PassiveMaterialView()
        view.blendingMode = .behindWindow
        view.state = .followsWindowActiveState
        view.setAccessibilityElement(false)
        return view
    }
    func updateNSView(_ view: NSVisualEffectView, context: Context) {
        view.material = material
        view.setAccessibilityIdentifier(identifier)
    }
    final class PassiveMaterialView: NSVisualEffectView {
        override func hitTest(_ point: NSPoint) -> NSView? { nil }
    }
}

// Explicit chrome dividers keep fixture and live-window contrast identical.
// Glass draws a warm hairline (`.hair`); its header separator is stronger (`.vsep`).
struct ChromeDivider: View {
    var vertical = false
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        Rectangle().fill(chromeColor(glassPreset ? (vertical ? "border-strong" : "divider") : "material-border", scheme))
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
    /// The Settings section on screen, for the breadcrumb ("Settings / AI providers").
    var settingsCurrent: String?
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
            openedByKeyboard = NSApp?.currentEvent.map { [.keyDown, .keyUp, .flagsChanged].contains($0.type) } ?? true
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

// Liquid Glass 2.0 scene, layer 1 (`.win`): a lit 150° champagne → taupe →
// lavender → steel gradient with a cream glow top-leading and a steel glow
// bottom-trailing. Colours and geometry come from `--vzn-app-backdrop`.
struct AppBackdrop: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            // CSS gradient line: through the centre at the token angle, long
            // enough that both corners sit exactly on the first and last stop.
            let angle = metric("backdropAngle") * .pi / 180
            let direction = CGVector(dx: sin(angle), dy: -cos(angle))
            let length = abs(size.width * direction.dx) + abs(size.height * direction.dy)
            let reach = CGVector(dx: direction.dx * length / 2 / max(size.width, 1), dy: direction.dy * length / 2 / max(size.height, 1))
            ZStack(alignment: .topLeading) {
                LinearGradient(stops: [
                    .init(color: chromeColor("backdrop-0", scheme), location: 0),
                    .init(color: chromeColor("backdrop-1", scheme), location: metric("backdropStop1")),
                    .init(color: chromeColor("backdrop-2", scheme), location: metric("backdropStop2")),
                    .init(color: chromeColor("backdrop-3", scheme), location: 1)
                ], startPoint: UnitPoint(x: 0.5 - reach.dx, y: 0.5 - reach.dy), endPoint: UnitPoint(x: 0.5 + reach.dx, y: 0.5 + reach.dy))
                glow("backdrop-glow-lead", "backdropGlowLead", in: size)
                glow("backdrop-glow-trail", "backdropGlowTrail", in: size)
            }
        }
        .allowsHitTesting(false).accessibilityHidden(true)
    }
    // `radial-gradient(W H at X Y, colour 0%, transparent extent)`: W and H are radii.
    private func glow(_ role: String, _ prefix: String, in size: CGSize) -> some View {
        let color = chromeColor(role, scheme)
        let radius = metric(prefix + "Width")
        // A circular gradient that reaches clear inside its frame, squashed to
        // the token's ellipse, so the glow never shows a frame edge.
        return RadialGradient(colors: [color, color.opacity(0)], center: .center, startRadius: 0, endRadius: radius * metric(prefix + "Extent"))
            .frame(width: radius * 2, height: radius * 2)
            .scaleEffect(x: 1, y: metric(prefix + "Height") / radius)
            .position(x: size.width * metric(prefix + "X"), y: size.height * metric(prefix + "Y"))
    }
}

// Scene layer 3 (`.pane`): the navigation is a frosted glass pane over the
// backdrop, inset `small` from the window and starting below the 48 pt row.
// Reduce Transparency / Increase Contrast turn it into a solid, edged surface.
struct SidebarSurface: View {
    /// The temporary navigation pane (Nav-Overlay) floats above the reading pane: large shadow.
    var raised = false
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: metric("chromeSurfaceRadius"), style: .continuous) }
    private var solid: Bool { reduceTransparency || contrast == .increased }
    var body: some View {
        Group {
            if solid {
                shape.fill(chromeColor("titlebar-bg", scheme))
                    .overlay { shape.strokeBorder(chromeColor("border-strong", scheme), lineWidth: metric("hairline")) }
            } else {
                shape.fill(LinearGradient(colors: [chromeColor("primary-nav-material", scheme), chromeColor("sidebar-bg", scheme)],
                                          startPoint: .topLeading, endPoint: .bottomTrailing))
                    .background {
                        // Over the reading pane the temporary pane cannot rely on the backdrop blur
                        // alone: a raised, frosted base keeps the page beneath from reading through.
                        ZStack {
                            if #available(macOS 26.0, *) { NavigationGlassMaterial().clipShape(shape) }
                            else if raised { shape.fill(.regularMaterial) }
                            if raised { shape.fill(chromeColor("surface-raised", scheme)) }
                        }
                    }
                    .overlay { GlassRim(shape: shape) }
                    .background { OuterShadow(shape: shape, role: raised ? "shadow-lg-color" : "shadow-md-color", blur: metric(raised ? "shadowLgBlur" : "shadowMdBlur"), y: metric(raised ? "shadowLgY" : "shadowMdY")) }
            }
        }
        .padding(.leading, metric("small"))
        .padding(.top, ShellLayout.headerHeight + metric("small"))
        .padding(.bottom, metric("small"))
        .allowsHitTesting(false).accessibilityHidden(true)
    }
}

// CSS `box-shadow` for a translucent surface: drawn only outside the shape, so
// it never darkens the glass it belongs to.
struct OuterShadow<S: Shape>: View {
    var shape: S
    var role: String
    var blur: CGFloat
    var y: CGFloat
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        shape.fill(chromeColor(role, scheme)).shadow(color: chromeColor(role, scheme), radius: blur / 2, y: y)
            .mask {
                Rectangle().padding(-(blur + abs(y)))
                    .overlay { shape.blendMode(.destinationOut) }
                    .compositingGroup()
            }
            .allowsHitTesting(false).accessibilityHidden(true)
    }
}

// Light edge of every Glass surface: a 1 pt bright border and a 1 pt inner
// highlight along the top. Decorative only; never takes the pointer.
struct GlassRim<S: InsettableShape>: View {
    var shape: S
    var border = "material-border"
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        ZStack {
            shape.strokeBorder(chromeColor(border, scheme), lineWidth: metric("hairline"))
            shape.inset(by: metric("hairline")).strokeBorder(chromeColor("material-highlight", scheme), lineWidth: metric("hairline"))
                .mask(alignment: .top) {
                    LinearGradient(colors: [.white, .clear], startPoint: .top, endPoint: .bottom).frame(height: metric("radius"))
                }
        }.allowsHitTesting(false).accessibilityHidden(true)
    }
}

// The system glass beneath the painted pane, sampling the in-window backdrop
// (never the desktop) so the pane keeps the scene's colours.
@available(macOS 26.0, *)
struct NavigationGlassMaterial: NSViewRepresentable {
    func makeNSView(context: Context) -> MaterialView { MaterialView() }
    func updateNSView(_ view: MaterialView, context: Context) {}
    class MaterialView: NSView {
        let glass = NSGlassEffectView()
        override init(frame: NSRect) {
            super.init(frame: frame)
            setAccessibilityIdentifier("navigation-glass-material")
            setAccessibilityElement(false)
            glass.style = .clear
            glass.cornerRadius = metric("chromeSurfaceRadius")
            glass.setAccessibilityElement(false)
            addSubview(glass)
        }
        required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
        override func layout() {
            super.layout()
            glass.frame = bounds
        }
        override func hitTest(_ point: NSPoint) -> NSView? { nil }
    }
}

// One raised selection lens over the shared navigation pane. Idle rows stay
// clear; hover borrows a softer lens. The Button and its label never change
// identity when material appears, preserving keyboard and accessibility focus.
struct NavigationButtonStyle: ButtonStyle {
    var glass: Bool
    var selected = false
    var hovered = false
    var resting = false
    /// Glass corner radius; segments default to a capsule, navigation rows pass `radius`.
    var radius: CGFloat? = nil
    func makeBody(configuration: Configuration) -> some View {
        NavigationButtonBody(configuration: configuration, glass: glass,
                             selected: selected, hovered: hovered, resting: resting, glassRadius: radius)
    }
}

// `.lens`: the selected row is a bright raised glass (chrome-item-active, light
// rim, low shadow); hover is the softer flat `chrome-item-hover` without a rim.
struct GlassLens: View {
    var radius: CGFloat
    var hover = false
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        Group {
            if reduceTransparency || contrast == .increased {
                ChatGlassSurface(radius: radius, selected: !hover)
            } else if hover {
                shape.fill(chromeColor("chrome-item-hover", scheme))
            } else {
                shape.fill(chromeColor("chrome-item-active", scheme))
                    .overlay { GlassRim(shape: shape, border: "material-highlight") }
                    .background { OuterShadow(shape: shape, role: "shadow-sm-color", blur: metric("shadowSmBlur") - metric("tight"), y: metric("shadowSmY")) }
            }
        }.allowsHitTesting(false).accessibilityHidden(true)
    }
}

private struct NavigationButtonBody: View {
    var configuration: ButtonStyleConfiguration
    var glass: Bool
    var selected: Bool
    var hovered: Bool
    var resting: Bool
    var glassRadius: CGFloat?
    @Environment(\.isEnabled) private var enabled
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    private var solid: Bool { reduceTransparency || contrast == .increased }
    private var interacting: Bool { enabled && (hovered || configuration.isPressed) }
    private var radius: CGFloat { glass ? glassRadius ?? metric("compactControl") / 2 : metric("chromeItemRadius") }
    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: radius, style: .continuous) }
    var body: some View {
        configuration.label
            .opacity(enabled ? 1 : 0.5)
            .background {
                if glass {
                    if selected || resting || interacting {
                        GlassLens(radius: radius, hover: !(selected || resting))
                    }
                } else {
                    shape.fill(chromeColor(selected ? "chrome-item-active" : interacting ? "chrome-item-hover" : "sidebar-search-bg", scheme)
                        .opacity(selected || interacting || resting ? 1 : 0))
                        .overlay {
                            if selected || resting { shape.strokeBorder(chromeColor("material-border", scheme), lineWidth: metric("hairline")) }
                        }
                }
            }
            .overlay {
                if glass {
                    if configuration.isPressed && enabled && !solid {
                        shape.fill(chromeColor("chrome-fg", scheme).opacity(metric("selectionOpacity")))
                            .allowsHitTesting(false).accessibilityHidden(true)
                    }
                }
            }
            // Keep the native focus halo inside the scroll bounds, including
            // the first row, without shrinking the rectangular pointer target.
            .contentShape(.focusEffect, shape.inset(by: metric("hairline") * 2))
    }
}

// Text-bearing panels keep an opaque reading surface in every system mode.
// Content roles, not chrome: Glass's chrome canvas is translucent with no blur,
// which let page text show through history, activity and the command palette.
struct ReadingPanelSurface: View {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    private var solid: Bool { reduceTransparency || contrast == .increased }
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: metric("surfaceRadius"), style: .continuous)
        Group {
            if glass {
                // `.float`: near-opaque raised white over a heavy in-window
                // blur, so page text behind the layer never reads through.
                if solid {
                    shape.fill(chromeColor("titlebar-bg", scheme))
                        .overlay { shape.strokeBorder(chromeColor("border-strong", scheme), lineWidth: metric("hairline")) }
                } else {
                    shape.fill(.regularMaterial)
                        .overlay { shape.fill(chromeColor("surface-raised", scheme)) }
                        .overlay { GlassRim(shape: shape) }
                        .shadow(color: chromeColor("shadow-lg-color", scheme), radius: metric("shadowLgBlur") / 2, y: metric("shadowLgY"))
                }
            } else {
                RoundedRectangle(cornerRadius: metric("surfaceRadius"))
                    .fill(contentColor("surface", scheme))
                    .overlay(RoundedRectangle(cornerRadius: metric("surfaceRadius"))
                        .strokeBorder(Color(nsColor: .separatorColor), lineWidth: metric("hairline")))
                    .shadow(color: Color(nsColor: .shadowColor).opacity(solid ? 0 : metric("overlayShadowOpacity")),
                            radius: metric("inset"), y: metric("small"))
            }
        }
        .allowsHitTesting(false).accessibilityHidden(true)
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
    /// Explicit opt-in for a quiet control; ordinary actions use the Glass preset automatically.
    var glass = false
    /// Quiet controls borrow their parent's material unless `glass` explicitly opts in.
    var quiet = false
    var small = false
    var primary = false
    var soft = false
    var panelAction: NativePanelAction? = nil
    var expanded: Bool? = nil
    var hint: String = ""
    var count: Int = 0
    /// Glass draws the running count as a badge on the pill (in SwiftUI) instead of in the title.
    var countBadge = false
    /// The symbol follows the title (a disclosure chevron), drawn at small scale.
    var trailingSymbol = false
    /// Room kept before the title for a decorative SwiftUI glyph laid over the control.
    var leadingRoom: CGFloat = 0
    var enabled = true
    var focusEpoch = 0
    var onTab: ((Bool) -> Void)? = nil
    /// Receives the control's frame in window coordinates on activation, for a layer anchored to it.
    var frameAction: ((CGRect) -> Void)? = nil
    var action: () -> Void
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeNSView(context: Context) -> ButtonHost {
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
        return ButtonHost(button: button)
    }
    func sizeThatFits(_ proposal: ProposedViewSize, nsView: ButtonHost, context: Context) -> CGSize? {
        nsView.button.intrinsicContentSize
    }
    func updateNSView(_ host: ButtonHost, context: Context) {
        let button = host.button
        context.coordinator.parent = self
        // A state glyph swaps with a short cross-fade so the press visibly changes the control.
        if button.image != nil, !symbol.isEmpty, context.coordinator.symbol != symbol, !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion {
            let fade = CATransition(); fade.type = .fade; fade.duration = metric("durationFast")
            button.layer?.add(fade, forKey: "symbol")
        }
        context.coordinator.symbol = symbol
        let image = symbol.isEmpty ? nil : NSImage(systemSymbolName: symbol, accessibilityDescription: label)
        button.image = trailingSymbol ? image?.withSymbolConfiguration(NSImage.SymbolConfiguration(scale: .small)) : image
        let inlineCount = countBadge && glassPreset ? 0 : count
        button.imagePosition = symbol.isEmpty ? .noImage : showsLabel || inlineCount > 0 ? (trailingSymbol ? .imageTrailing : .imageLeading) : .imageOnly
        button.title = showsLabel ? label + (inlineCount > 0 ? " · " + String(inlineCount) : "") : inlineCount > 0 ? String(inlineCount) : ""
        // Glass `.btn`: body size, medium; the tinted "new" action is semibold.
        button.font = glassPreset && panelAction == nil
            ? .systemFont(ofSize: NSFont.systemFontSize * (small ? metric("smallScale") : 1), weight: soft ? .semibold : .medium)
            : .systemFont(ofSize: panelAction == nil ? NSFont.systemFontSize * metric(small ? "smallScale" : "labelScale") : NSFont.systemFontSize)
        button.titlebarControl = identifier == "navigation-toggle"
        button.solidPrimary = primary
        button.emphasized = primary || soft || (expanded == true && identifier != "navigation-toggle")
        // `.btn.glass.tint`: accent text on clear glass; only an open layer tints the material.
        button.textTint = soft && glassPreset && expanded != true
        if let expanded { button.setAccessibilityExpanded(expanded) }
        button.panelAction = panelAction
        let glassControl = (glass || !quiet) && glassPreset
        button.bounded = (showsLabel && !quiet) || glassControl
        button.glassShape = glassControl
        button.opaqueSurface = reduceTransparency || contrast == .increased
        button.usesGlass = glassControl && !button.opaqueSurface
        (button.cell as? PaddedButtonCell)?.horizontalInset = showsLabel ? metric(quiet ? "small" : "inset") : 0
        (button.cell as? PaddedButtonCell)?.leadingRoom = leadingRoom
        button.invalidateIntrinsicContentSize()
        button.onTab = onTab
        if button.isEnabled != enabled {
            // Disabling the key view makes AppKit recompute the key loop, which reads SwiftUI's
            // focus graph re-entrantly during this update and spins (AttributeGraph cycle), e.g.
            // "New session" focused when interpretation starts. Defer it out of the update.
            if !enabled, button.window?.firstResponder === button {
                DispatchQueue.main.async { [weak button, weak host] in
                    button?.isEnabled = false
                    button?.refreshSurface()
                    host?.updateGlass()
                }
            } else { button.isEnabled = enabled }
        }
        button.refreshSurface()
        host.updateGlass()
        host.invalidateIntrinsicContentSize()
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
    // Keep the original NSButton mounted above the native material. A custom
    // NSButtonCell does not draw AppKit's glass bezel reliably, while a separate
    // effect view preserves the cell, key loop and exact shared control sizing.
    class ButtonHost: NSView {
        let button: FocusButton
        private var materialView: NSView?
        init(button: FocusButton) {
            self.button = button
            super.init(frame: .zero)
            addSubview(button)
        }
        required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
        override var intrinsicContentSize: NSSize { button.intrinsicContentSize }
        override func layout() {
            super.layout()
            button.frame = bounds
            materialView?.frame = bounds
        }
        override func viewDidChangeEffectiveAppearance() {
            super.viewDidChangeEffectiveAppearance()
            updateGlass()
        }
        func updateGlass() {
            if #available(macOS 26.0, *), button.usesGlass {
                let glass: NSGlassEffectView
                if let existing = materialView as? NSGlassEffectView { glass = existing }
                else {
                    glass = NSGlassEffectView()
                    glass.setAccessibilityElement(false)
                    addSubview(glass, positioned: .below, relativeTo: button)
                    materialView = glass
                }
                glass.cornerRadius = metric("compactControl") / 2
                glass.style = .regular
                let scheme: ColorScheme = effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .dark : .light
                if !button.isEnabled { glass.tintColor = nil }
                else if button.panelAction == .destructive {
                    glass.tintColor = NSColor(contentColor("danger", scheme)).withAlphaComponent(metric("selectionOpacity"))
                } else if button.solidPrimary || button.panelAction == .primary {
                    glass.tintColor = NSColor(contentColor(scheme == .dark || button.pressed ? "action-active" : button.hovered ? "action-hover" : "action", scheme))
                } else {
                    glass.tintColor = button.emphasized && !button.textTint ? NSColor(chromeColor("action-soft", scheme)) : nil
                }
                glass.isHidden = false
                glass.frame = bounds
            } else { materialView?.isHidden = true }
            needsLayout = true
        }
    }
    // AppKit's borderless image-leading cell otherwise puts the icon against
    // the custom pill edge. Keep native text/image drawing inside shared insets.
    class PaddedButtonCell: NSButtonCell {
        var horizontalInset: CGFloat = 0
        var leadingRoom: CGFloat = 0
        override func drawInterior(withFrame cellFrame: NSRect, in controlView: NSView) {
            var frame = cellFrame.insetBy(dx: horizontalInset, dy: 0)
            frame.origin.x += leadingRoom; frame.size.width -= leadingRoom
            super.drawInterior(withFrame: frame, in: controlView)
        }
    }
    class FocusButton: NSButton {
        var usesGlass = false
        var glassShape = false
        var opaqueSurface = false
        var titlebarControl = false
        var solidPrimary = false
        var textTint = false
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
        private var surfaceRadius: CGFloat { panelAction == nil || glassShape ? metric("compactControl") / 2 : metric("controlRadius") }
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
                let scheme: ColorScheme = effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .dark : .light
                // The host owns refraction; the native button keeps input,
                // disabled text and restrained hover/press feedback above it.
                if #available(macOS 26.0, *), usesGlass {
                    isBordered = false
                    layer?.borderWidth = 0
                    layer?.cornerRadius = surfaceRadius
                    layer?.backgroundColor = (isEnabled && (pressed || hovered)
                        ? NSColor(chromeColor(pressed ? "chrome-item-active" : "chrome-item-hover", scheme))
                            .withAlphaComponent(metric("selectionOpacity") * (pressed ? 2 : 1))
                        : NSColor.clear).cgColor
                    contentTintColor = !isEnabled ? .disabledControlTextColor
                        : panelAction == .destructive ? NSColor(contentColor("danger", scheme))
                        : solidPrimary || panelAction == .primary ? NSColor(contentColor("action-fg", scheme))
                        : NSColor(chromeColor(emphasized ? "action-text" : "chrome-fg", scheme))
                    (superview as? ButtonHost)?.updateGlass()
                    return
                }
                if bezelStyle != .toolbar { bezelStyle = .toolbar }
                isBordered = false
                bezelColor = nil
                layer?.cornerRadius = surfaceRadius
                layer?.borderWidth = bounded ? metric("hairline") : 0
                let danger = panelAction == .destructive && isEnabled
                let solid = panelAction == .primary && isEnabled
                if panelAction == nil {
                    let color: (String) -> NSColor = { NSColor(chromeColor($0, scheme)) }
                    layer?.borderColor = color("material-border").cgColor
                    // Unbounded controls borrow the surrounding group's material,
                    // including its disabled surface; never add a solid child plate.
                    let fill = !isEnabled ? (bounded ? NSColor.controlBackgroundColor : NSColor.clear)
                        : solidPrimary ? color(hovered ? "action-hover" : "action")
                        : emphasized ? color("action-soft")
                        : pressed ? color(titlebarControl ? "chrome-item-active" : "surface-hover")
                        : hovered ? color(titlebarControl ? "chrome-item-hover" : "surface-hover")
                        : bounded ? color("surface") : NSColor.clear
                    // Flatten every state, including selection and hover, over
                    // the opaque reading color when transparency is reduced.
                    let base = NSColor(contentColor("surface", scheme)).withAlphaComponent(1)
                    let resolved = opaqueSurface && fill.alphaComponent > 0
                        ? base.blended(withFraction: fill.alphaComponent, of: fill.withAlphaComponent(1)) ?? base
                        : fill
                    layer?.backgroundColor = resolved.cgColor
                    contentTintColor = !isEnabled ? .disabledControlTextColor
                        : solidPrimary ? color("action-fg")
                        : emphasized ? color("action-text")
                        : pressed || hovered ? color(titlebarControl ? "chrome-fg-strong" : "text-strong")
                        : color(titlebarControl ? "chrome-fg-muted" : "text-muted")
                    return
                }
                layer?.borderColor = (danger ? NSColor.systemRed : NSColor.separatorColor).cgColor
                let fill = solid ? NSColor.controlAccentColor
                    : danger ? NSColor.systemRed.withAlphaComponent(metric("selectionOpacity"))
                    : emphasized && isEnabled ? NSColor.controlAccentColor.withAlphaComponent(metric("selectionOpacity"))
                    : bounded ? NSColor.controlBackgroundColor : NSColor.clear
                let base = NSColor(contentColor("surface", scheme)).withAlphaComponent(1)
                let resolved = opaqueSurface && fill.alphaComponent > 0
                    ? base.blended(withFraction: fill.alphaComponent, of: fill.withAlphaComponent(1)) ?? base
                    : fill
                layer?.backgroundColor = resolved.cgColor
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
            let cell = cell as? PaddedButtonCell
            return NSSize(width: max(metric("compactControl"), super.intrinsicContentSize.width + (cell?.horizontalInset ?? 0) * 2 + (cell?.leadingRoom ?? 0)), height: metric("compactControl"))
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
    // Only the sidebar's fixed top row owns traffic-light alignment. Other
    // draggable headers must not race to reposition the same system controls.
    var alignsWindowControls = false
    func makeNSView(context: Context) -> DragView {
        let view = DragView(); view.alignsWindowControls = alignsWindowControls; return view
    }
    func updateNSView(_ view: DragView, context: Context) {
        view.alignsWindowControls = alignsWindowControls
        view.scheduleAlignment()
    }
    class DragView: NSView {
        var alignsWindowControls = false {
            didSet { if oldValue != alignsWindowControls { observeWindowGeometry() } }
        }
        private var alignmentQueued = false
        private var aligning = false
        private var observedGeometry: [ObjectIdentifier] = []
        override func mouseDown(with event: NSEvent) { window?.performDrag(with: event) }
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            observeWindowGeometry()
        }
        private func observeWindowGeometry() {
            NotificationCenter.default.removeObserver(self)
            observedGeometry = []
            guard alignsWindowControls, let window else { return }
            for name in [NSWindow.didResizeNotification, NSWindow.didExitFullScreenNotification,
                         NSWindow.didBecomeKeyNotification, NSWindow.didResignKeyNotification,
                         NSWindow.didBecomeMainNotification, NSWindow.didResignMainNotification,
                         NSWindow.didDeminiaturizeNotification] {
                NotificationCenter.default.addObserver(self, selector: #selector(windowGeometryChanged), name: name, object: window)
            }
            observeControlGeometry(in: window)
            scheduleAlignment()
        }
        private func observeControlGeometry(in window: NSWindow) {
            var views: [NSView] = []
            var seen: Set<ObjectIdentifier> = []
            for kind in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] {
                var ancestor: NSView? = window.standardWindowButton(kind)
                while let view = ancestor {
                    if seen.insert(ObjectIdentifier(view)).inserted { views.append(view) }
                    ancestor = view.superview
                }
            }
            let identities = views.map(ObjectIdentifier.init)
            guard identities != observedGeometry else { return }
            observedGeometry = identities
            let center = NotificationCenter.default
            center.removeObserver(self, name: NSView.frameDidChangeNotification, object: nil)
            center.removeObserver(self, name: NSView.boundsDidChangeNotification, object: nil)
            for view in views {
                // AppKit can reset these frames after SwiftUI has finished its
                // layout, even though the window and our header did not resize.
                view.postsFrameChangedNotifications = true
                view.postsBoundsChangedNotifications = true
                center.addObserver(self, selector: #selector(windowGeometryChanged), name: NSView.frameDidChangeNotification, object: view)
                center.addObserver(self, selector: #selector(windowGeometryChanged), name: NSView.boundsDidChangeNotification, object: view)
            }
        }
        override func layout() {
            super.layout()
            scheduleAlignment()
        }
        @objc private func windowGeometryChanged() { scheduleAlignment() }
        func scheduleAlignment() {
            guard alignsWindowControls, window != nil, !aligning, !alignmentQueued else { return }
            alignmentQueued = true
            // Coalesce native frame notifications and let the current layout
            // finish. Ignore notifications caused by our own correction.
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.alignmentQueued = false
                self.alignWindowControls()
            }
        }
        private func alignWindowControls() {
            guard alignsWindowControls, let window, window.styleMask.contains(.titled),
                  !window.styleMask.contains(.fullScreen), !window.isMiniaturized, bounds.height > 0 else { return }
            aligning = true
            defer { aligning = false }
            observeControlGeometry(in: window)
            // The system titlebar container is shorter than the Review 18 header
            // row. Repair origins too: AppKit can move it without changing its
            // height, which previously left the controls ten points out of line.
            if let titlebar = window.standardWindowButton(.closeButton)?.superview,
               let container = titlebar.superview, let frame = container.superview {
                let top = frame.isFlipped ? frame.bounds.minY : frame.bounds.maxY - bounds.height
                let target = NSRect(x: frame.bounds.minX, y: top, width: frame.bounds.width, height: bounds.height)
                if container.frame != target { container.frame = target }
                if titlebar.frame != container.bounds { titlebar.frame = container.bounds }
            }
            for kind in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] {
                guard let button = window.standardWindowButton(kind), let parent = button.superview else { continue }
                let center = convert(NSPoint(x: bounds.midX, y: bounds.midY), to: parent)
                let origin = NSPoint(x: button.frame.minX, y: center.y - button.frame.height / 2)
                if abs(button.frame.minY - origin.y) > metric("hairline") / 2 { button.setFrameOrigin(origin) }
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
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    // Glass rows sit `gap` inside the pane with a `small` inner inset (Sidebar board).
    private var rowInset: CGFloat { metric(glass ? "small" : "inset") }
    // Review 18: one workspace list, then a single system group that ends in Settings.
    private let workspaceItems: [(String, String)] = [("chat", "bubble.left.and.bubble.right"), ("translate", "translate"), ("interpret", "waveform"), ("dictionary", "book"), ("everywhere", "text.viewfinder")]
    private let systemItems: [(String, String)] = [("apps", "macwindow"), ("thermal", "thermometer.medium"), ("utilities", "command")]
    var body: some View {
        VStack(spacing: metric(glass ? "gap" : "small")) {
            HStack(spacing: metric("gap")) {
                if let url = NativeResources.brandURL, let icon = NSImage(contentsOf: url) {
                    // One size in both states; its centre sits on the icon axis (rail centre), so nothing jumps.
                    Image(nsImage: icon).resizable().scaledToFit()
                        .frame(width: metric("large") - metric("tight"), height: metric("large") - metric("tight")).accessibilityHidden(true)
                }
                if expanded { Text("Viezan").font(.vzn(glass ? "subtitleScale" : "titleScale", .semibold)).fontWeight(.semibold).transition(.opacity); Spacer(minLength: 0) }
                if let close { ShellCloseButton(label: store.text("close"), focusOnAppear: true, action: close) }
            }.frame(minHeight: metric("compactControl")).padding(.horizontal, expanded ? metric(glass ? "tight" : "gap") : 0)
            searchButton
                .frame(maxWidth: .infinity).foregroundStyle(chromeColor(hoveredItem == "search" ? "chrome-fg" : "chrome-fg-muted", scheme))
            ScrollView {
                VStack(alignment: .leading, spacing: metric("tight")) {
                    row("home", "house")
                    ForEach(workspaceItems.filter { store.moduleEnabled($0.0) }, id: \.0) { id, symbol in row(id, symbol) }
                    if expanded {
                        groupLabel("groupSystem")
                            .padding(.horizontal, rowInset).padding(.top, metric("gap")).padding(.bottom, metric("tight"))
                            .accessibilityAddTraits(.isHeader).transition(.opacity)
                    } else { ChromeDivider().padding(.vertical, metric("small")) }
                    ForEach(systemItems.filter { store.moduleEnabled($0.0) }, id: \.0) { id, symbol in row(id, symbol) }
                    row("settings", "slider.horizontal.3")
                }
            }.scrollIndicators(.hidden).frame(maxHeight: .infinity)
            backgroundStrip
            if expanded { privacyFooter }
        }.padding(.vertical, metric("small"))
            // Keep the brand row clear of the window-control row and of the
            // floating pane's rounded shoulder in every presentation.
            .padding(.top, glass ? metric("gap") : 0)
            .padding(.horizontal, metric(glass ? "gap" : "small"))
            .padding(.bottom, glass ? metric("small") : 0)
            .foregroundStyle(chromeColor("chrome-fg", scheme))
            .background { if !glass { ChromeSurface() } }
            .accessibilityElement(children: .contain).accessibilityLabel(store.text("primaryNavigation"))
    }
    /// What keeps running behind the pages: fan control, global shortcuts.
    private var backgroundRows: [(route: String, text: String)] {
        var rows: [(String, String)] = []
        let monitor = store.thermalMonitor
        if store.moduleEnabled("thermal"), monitor.controlling {
            let profile = monitor.activeProfile.flatMap { id in monitor.profiles.first { $0.id == id } }
            rows.append(("thermal", profile.map { store.text("fansProfile").replacingOccurrences(of: "{profile}", with: UUID(uuidString: $0.id) == nil ? store.text($0.name) : $0.name) } ?? store.text("fansCustom")))
        }
        let shortcuts = store.desktopIntegration.shortcuts.filter(\.enabled).count
        if store.moduleEnabled("utilities"), shortcuts > 0 { rows.append(("utilities", store.text("hotkeys") + " · " + String(shortcuts))) }
        return rows.map { (route: $0.0, text: $0.1) }
    }
    // Expanded only: the rail shows the same state as a dot on the route's own icon.
    @ViewBuilder private var backgroundStrip: some View {
        let rows = backgroundRows
        if !rows.isEmpty, expanded {
            // Glass: the running group opens the footer; only storage is set off by a hairline.
            if !glass { ChromeDivider().padding(.vertical, metric("tight")) }
            VStack(alignment: .leading, spacing: 0) {
                    groupLabel("backgroundRunning").padding(.horizontal, rowInset).padding(.bottom, metric("tight"))
                    ForEach(rows, id: \.route) { row in
                        Button { select(row.route) } label: {
                            HStack(spacing: metric("small")) { StatusDot(tone: .ready); Text(row.text).lineLimit(1); Spacer(minLength: 0) }
                                .font(.vzn("smallScale")).padding(.horizontal, rowInset).frame(height: metric("compactControl") - metric("tight")).contentShape(Rectangle())
                        }.buttonStyle(NavigationButtonStyle(glass: glass, hovered: glass && hoveredItem == "background-" + row.route))
                            .onHover { hoveredItem = $0 ? "background-" + row.route : nil }
                            .foregroundStyle(chromeColor("chrome-fg-muted", scheme)).accessibilityIdentifier("background-" + row.route)
                    }
            }.accessibilityElement(children: .contain).accessibilityLabel(store.text("backgroundRunning"))
        }
    }
    // Uppercase group label (`.cap`): Glass reads semibold in the muted chrome role.
    private func groupLabel(_ key: String) -> some View {
        Text(store.text(key).uppercased()).font(.vzn("captionScale", glass ? .semibold : .regular)).tracking(metric("hairline"))
            .foregroundStyle(chromeColor(glass ? "chrome-fg-muted" : "chrome-fg-soft", scheme))
            .accessibilityAddTraits(.isHeader).transition(.opacity)
    }
    // "Search ⌘K" opens the command palette. Glass: an inset capsule field with
    // a key cap when expanded, a round glass control on the rail.
    private var searchButton: some View {
        Button(action: commands) {
            HStack(spacing: metric(glass ? "small" : "gap")) {
                Image(systemName: "magnifyingglass").frame(width: glass ? nil : metric("icon")).accessibilityHidden(true)
                if expanded {
                    Text(store.text("searchEverything")).lineLimit(1)
                    Spacer(minLength: metric("tight"))
                    if glass { KeyCap(text: "⌘K").accessibilityHidden(true) }
                    else { Text("⌘ K").font(.vzn("captionScale")).accessibilityHidden(true) }
                }
            }.padding(.leading, expanded ? metric(glass ? "gap" : "inset") : 0).padding(.trailing, expanded ? metric(glass ? "tight" : "inset") : 0)
                .frame(maxWidth: expanded || !glass ? .infinity : nil)
                .frame(width: glass && !expanded ? metric("compactControl") : nil, height: metric("compactControl"))
                .font(.system(size: NSFont.systemFontSize * (glass ? 1 : metric("smallScale"))))
                .contentShape(Capsule())
        }.buttonStyle(SidebarSearchStyle(glass: glass, expanded: expanded, hovered: hoveredItem == "search"))
            .frame(maxWidth: .infinity).foregroundStyle(chromeColor(hoveredItem == "search" ? "chrome-fg" : "chrome-fg-muted", scheme))
            .onHover { hoveredItem = $0 ? "search" : nil }
            .accessibilityIdentifier("navigation-search")
            .accessibilityLabel(store.text("searchEverything") + " · " + store.text("commands")).help(store.text("commands") + " (⌘K)")
    }
    // Storage is a static fact, separate from live background services and AI processing.
    private var privacyFooter: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            ChromeDivider()
            HStack(alignment: .firstTextBaseline, spacing: metric("small")) {
                Image(systemName: "internaldrive").accessibilityHidden(true)
                Text(store.text("privacyTitle")).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }.font(.vzn("smallScale")).foregroundStyle(chromeColor("chrome-fg-muted", scheme))
                .padding(.horizontal, rowInset).padding(.vertical, metric("tight"))
                .accessibilityElement(children: .combine)
                .accessibilityLabel(store.text("privacyTitle"))
                .accessibilityHint(store.text("privacyHint"))
                .help(store.text("privacyHint"))
        }
    }
    private func row(_ id: String, _ symbol: String) -> some View {
        let implemented = ["home", "chat", "translate", "dictionary", "settings", "utilities", "everywhere", "thermal", "interpret", "apps"].contains(id)
        let enabled = implemented && (!store.loadBlocked || id == "settings")
        // Settings carries the one shell-level warning: the chosen cloud provider has no key yet.
        let missingKey = id == "settings" && store.providers.availability(store.session.model) == .missingKey
        let running = backgroundRows.first { $0.route == id }
        let railNote = expanded ? "" : missingKey ? ": " + store.text("keyAbsent") : running.map { ": " + $0.text } ?? ""
        return Button { select(id) } label: {
            HStack(spacing: metric(glass ? "small" : "gap")) {
                Image(systemName: symbol).symbolRenderingMode(.monochrome).imageScale(.medium).frame(width: metric("icon"))
                    .foregroundStyle(chromeColor(glass && screen == id ? "action-text" : screen == id ? "chrome-item-active-fg" : "chrome-fg", scheme))
                    .overlay(alignment: .topTrailing) {
                        if !expanded, missingKey || running != nil { StatusDot(tone: missingKey ? .failed : .ready).offset(x: metric("tight"), y: -metric("tight")) }
                    }
                if expanded {
                    Text(store.text(id)).lineLimit(1).transition(.opacity); Spacer(minLength: 0)
                    if missingKey { HStack(spacing: metric("tight")) { StatusDot(tone: .failed); Text(store.text("keyAbsent")).font(.vzn("captionScale")) }.foregroundStyle(chromeColor("chrome-fg-muted", scheme)) }
                }
            }.padding(.horizontal, expanded ? rowInset : 0)
                .frame(maxWidth: expanded || !glass ? .infinity : nil, alignment: expanded ? .leading : .center)
                .frame(width: glass && !expanded ? metric("navControl") : nil, height: metric("compactControl"))
                .contentShape(Rectangle())
        }.buttonStyle(NavigationButtonStyle(glass: glass, selected: screen == id, hovered: hoveredItem == id, radius: metric("radius")))
            .frame(maxWidth: .infinity)
            .foregroundStyle(chromeColor(screen == id ? "chrome-item-active-fg" : "chrome-fg", scheme))
            .font(.system(size: NSFont.systemFontSize * metric("labelScale"), weight: screen == id ? .semibold : .regular))
            .onHover { hoveredItem = $0 && enabled ? id : nil }
            .accessibilityLabel(store.text(id) + (missingKey ? ": " + store.text("keyAbsent") : railNote)).accessibilityIdentifier("nav-" + id)
            .accessibilityAddTraits(screen == id ? .isSelected : []).disabled(!enabled)
            .help(implemented ? store.text(id) + railNote : store.text(id) + " — " + store.text("shellUnavailable"))
    }
}

// Sidebar search trigger. Glass expanded: inset capsule field (`.sb-search`);
// rail: round glass control (`.sb-round`). Other presets keep the row style.
private struct SidebarSearchStyle: ButtonStyle {
    var glass: Bool
    var expanded: Bool
    var hovered: Bool
    @ViewBuilder func makeBody(configuration: Configuration) -> some View {
        if glass {
            configuration.label
                .background {
                    if expanded { InsetInputSurface(radius: metric("compactControl") / 2) }
                    else { Color.clear.modifier(ControlGlass(radius: metric("compactControl") / 2, pressed: configuration.isPressed)).allowsHitTesting(false) }
                }
                .opacity(configuration.isPressed ? 0.8 : 1)
                .contentShape(.focusEffect, Capsule())
        } else {
            NavigationButtonStyle(glass: false, hovered: hovered, resting: expanded).makeBody(configuration: configuration)
        }
    }
}

enum CommandSelection {
    static func moved(_ index: Int, by offset: Int, count: Int) -> Int {
        guard count > 0 else { return 0 }
        return ((index + offset) % count + count) % count
    }
}

struct NativeCommands: View {
    @Environment(\.colorScheme) private var scheme
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
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
    /// `group`: 0 query results, 1 pages, 2 actions (the palette's section heads).
    private struct Entry: Identifiable { let id: String; let title: String; let symbol: String; let shortcut: String; var group = 0; let run: () -> Void }
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
            rows.append(Entry(id: item.id, title: store.text(item.title), symbol: item.systemImage, shortcut: item.shortcut,
                              group: nativeResources.navigation.contains { $0.id == item.id } ? 1 : 2) { execute(item.id) })
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
        if glass { paletteBody } else { classicBody }
    }
    private var shortcutText: (String) -> String { { "⌘" + $0.replacingOccurrences(of: "Shift+", with: "⇧") } }
    // Glass palette (Overlays board): a bare search head with Close, one hairline,
    // grouped rows (results · Pages · Actions) with key caps, and a hint foot.
    private var paletteBody: some View {
        let rows = entries
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: metric("small")) {
                SearchBox(query: $query, label: store.text("commandSearch"), move: move, submit: open, cancel: dismiss, first: { index = 0 }, last: { index = max(0, entries.count - 1) }, onTab: { _ in closeFocusEpoch += 1 }, focusEpoch: searchFocusEpoch, bare: true)
                ShellToolbarButton(label: store.text("close"), symbol: "xmark", identifier: "panel-close", quiet: true, focusEpoch: closeFocusEpoch, onTab: { _ in searchFocusEpoch += 1 }, action: dismiss)
                    .frame(width: metric("compactControl"), height: metric("compactControl"))
            }.padding(.horizontal, metric("inset")).frame(height: metric("navControl") + metric("gap"))
            ChromeDivider()
            if rows.isEmpty {
                Text(store.text("noCommands")).foregroundStyle(contentColor("text-muted", scheme)).frame(maxWidth: .infinity, minHeight: metric("navControl"))
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(Array(rows.enumerated()), id: \.element.id) { offset, item in
                                if offset == 0 || rows[offset - 1].group != item.group, let heading = groupTitle(item.group) {
                                    Eyebrow(text: heading).padding(.horizontal, metric("small") + metric("tight")).padding(.top, metric("gap")).padding(.bottom, metric("tight"))
                                }
                                paletteRow(item, selected: offset == index).onHover { if $0 { index = offset } }
                            }
                        }.padding(metric("small"))
                            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
                    }.frame(height: min(max(metric("navControl"), contentHeight), max(metric("navControl"), availableHeight - metric("navControl") * 3 - metric("gap") * 2)))
                    .onChange(of: index) { _, value in if entries.indices.contains(value) { proxy.scrollTo(entries[value].id) } }
                }
            }
            ChromeDivider()
            HStack(spacing: metric("inset")) {
                ForEach([("t", "paletteHintTranslate"), ("d", "paletteHintLookup"), ("?", "paletteHintAsk"), ("=", "paletteHintCalc")], id: \.0) { key, hint in
                    HStack(spacing: metric("tight")) {
                        Text(key).fontWeight(.semibold).foregroundStyle(contentColor("text-strong", scheme))
                        Text(store.text(hint))
                    }
                }
            }.font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme))
                .padding(.horizontal, metric("inset")).frame(height: metric("navControl"))
                .accessibilityElement(children: .combine)
        }
            .accessibilityElement(children: .contain).accessibilityLabel(store.text("commands"))
            .onChange(of: query) { _, _ in index = 0 }
    }
    private func groupTitle(_ group: Int) -> String? { group == 1 ? store.text("paletteGroupPages") : group == 2 ? store.text("paletteGroupActions") : nil }
    private func paletteRow(_ item: Entry, selected: Bool) -> some View {
        Button { item.run() } label: {
            HStack(spacing: metric("gap")) {
                Image(systemName: item.symbol).foregroundStyle(contentColor("text-muted", scheme)).frame(width: metric("icon")).accessibilityHidden(true)
                Text(item.title).lineLimit(1).foregroundStyle(contentColor("text", scheme))
                Spacer(minLength: metric("small"))
                if !item.shortcut.isEmpty { KeyCap(text: shortcutText(item.shortcut)).accessibilityHidden(true) }
            }.font(.vzn("labelScale")).padding(.horizontal, metric("small") + metric("tight"))
                .frame(maxWidth: .infinity, alignment: .leading).frame(height: metric("navControl")).contentShape(Rectangle())
                .background { if selected { GlassLens(radius: metric("radius")) } }
        }.buttonStyle(.plain).focusable(false).help(item.title)
            .accessibilityAddTraits(selected ? .isSelected : []).id(item.id)
    }
    private var classicBody: some View {
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
                                    .fontWeight(glass && offset == index ? .semibold : .regular)
                                    .foregroundStyle(offset == index ? contentColor("action-text", scheme) : Color.primary)
                                    .onHover { if $0 { index = offset } }
                                    .help(item.title)
                                    .background {
                                        if offset == index {
                                            if glass {
                                                Color.clear.modifier(ControlGlass(radius: metric("compactControl") / 2))
                                                    .allowsHitTesting(false).accessibilityHidden(true)
                                            } else {
                                                RoundedRectangle(cornerRadius: metric("radius")).fill(contentColor("action-soft", scheme))
                                            }
                                        }
                                    }
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

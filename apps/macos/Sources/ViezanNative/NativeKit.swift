import SwiftUI
import ViezanDomain

// Type roles scale the system body size by generated token ratios.
extension Font {
    static func vzn(_ scale: String, _ weight: Font.Weight = .regular) -> Font {
        .system(size: NSFont.systemFontSize * metric(scale), weight: weight)
    }
}

// Review 18 page vocabulary: intro, eyebrow, bounded cards and label rows.
// Every value reads generated metrics and palette roles from tokens.css.

struct PageIntro<Trailing: View>: View {
    var title: String
    var subtitle: String
    @ViewBuilder var trailing: Trailing
    var body: some View {
        HStack(alignment: .top, spacing: metric("inset")) {
            VStack(alignment: .leading, spacing: metric("small")) {
                Text(title).font(.vzn("headingScale", .semibold)).fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if !subtitle.isEmpty {
                    Text(subtitle).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
            trailing
        }
    }
}

extension PageIntro where Trailing == EmptyView {
    init(title: String, subtitle: String) { self.init(title: title, subtitle: subtitle) { EmptyView() } }
}

struct Eyebrow: View {
    var text: String
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        Text(text.uppercased()).font(.vzn("captionScale", .semibold)).tracking(metric("hairline"))
            .foregroundStyle(contentColor("text-muted", scheme)).accessibilityAddTraits(.isHeader)
    }
}

// Reference-inspired edge lighting stays decorative. The content beneath it
// remains opaque, so cards and controls retain stable text contrast.
struct QuietSurfaceEdge: View {
    var radius: CGFloat
    var strong = false
    @Environment(\.colorScheme) private var scheme
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        let border = contentColor(strong || contrast == .increased ? "border-strong" : "border", scheme)
        if (NativeTheme.shared.preferences.preset ?? "glass") == "glass", contrast != .increased, !reduceTransparency {
            shape.strokeBorder(LinearGradient(colors: [chromeColor("material-highlight", scheme), border],
                                              startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: metric("hairline"))
                .allowsHitTesting(false).accessibilityHidden(true)
        } else {
            shape.strokeBorder(border, lineWidth: metric("hairline"))
                .allowsHitTesting(false).accessibilityHidden(true)
        }
    }
}

// Opaque reading/input material. Controls use ControlGlass below; painting
// this surface under a button would hide the backdrop and flatten the glass.
struct ChatGlassSurface: View {
    var radius: CGFloat
    var selected = false
    var emphasized = false
    var focused = false
    var pressed = false
    var enabled = true
    var danger = false
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        let strong = contrast == .increased || reduceTransparency
        let base = !enabled ? contentColor("surface-subtle", scheme)
            : emphasized ? contentColor(scheme == .dark || pressed ? "action-active" : "action", scheme)
            : contentColor(selected ? "surface-hover" : "surface", scheme)
        shape.fill(base)
            .overlay {
                if danger && enabled { shape.fill(contentColor("danger", scheme).opacity(metric("selectionOpacity"))) }
                if !strong && enabled {
                    shape.fill(LinearGradient(colors: emphasized
                        ? [.clear, Color.black.opacity(metric("selectionOpacity") * (selected ? 2 : 1))]
                        : [chromeColor("material-highlight", scheme).opacity((selected ? 1 : 0.5) * (scheme == .dark ? metric("selectionOpacity") : 1)), .clear],
                        startPoint: .topLeading, endPoint: .bottomTrailing))
                }
                if pressed && enabled && !emphasized {
                    shape.fill(contentColor("text-strong", scheme).opacity(metric("selectionOpacity")))
                }
            }
            .overlay {
                if focused {
                    shape.strokeBorder(contentColor("action-text", scheme), lineWidth: metric("hairline") * 2)
                } else if strong {
                    shape.strokeBorder(contentColor("border-strong", scheme), lineWidth: metric("hairline"))
                } else {
                    shape.strokeBorder(LinearGradient(stops: [
                        .init(color: chromeColor("material-highlight", scheme), location: 0),
                        .init(color: chromeColor("material-border", scheme), location: 0.55),
                        .init(color: chromeColor("material-highlight", scheme).opacity(0.7), location: 1)
                    ], startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: metric("hairline"))
                }
            }
            .allowsHitTesting(false).accessibilityHidden(true)
    }
}

// Apply the real material to the complete control (label included), so the
// system owns refraction, edge lighting and pointer feedback. There is no
// opaque painted plate between the glass and its backdrop.
struct ControlGlass: ViewModifier {
    var active = true
    var radius: CGFloat = metric("control") / 2
    var selected = false
    var emphasized = false
    var focused = false
    var pressed = false
    var enabled = true
    var danger = false
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: radius, style: .continuous) }
    private var tint: Color? {
        guard enabled else { return nil }
        if danger { return contentColor("danger", scheme).opacity(metric("selectionOpacity")) }
        if emphasized { return contentColor(scheme == .dark || pressed ? "action-active" : "action", scheme) }
        return selected ? chromeColor("action-soft", scheme) : nil
    }
    @ViewBuilder func body(content: Content) -> some View {
        if !active { content }
        else if reduceTransparency || contrast == .increased {
            content.background { ChatGlassSurface(radius: radius, selected: selected, emphasized: emphasized,
                focused: focused, pressed: pressed, enabled: enabled, danger: danger) }
        } else if #available(macOS 26.0, *) {
            content
                .glassEffect(.regular.tint(tint).interactive(enabled && !reduceMotion), in: shape)
                .overlay {
                    if focused { shape.strokeBorder(contentColor("action-text", scheme), lineWidth: metric("hairline") * 2).allowsHitTesting(false) }
                }
        } else {
            content
                .background {
                    // A white primary label needs the solid semantic action
                    // face on older systems; a material above it washes it out.
                    if emphasized {
                        ChatGlassSurface(radius: radius, selected: selected, emphasized: true,
                            pressed: pressed, enabled: enabled, danger: danger)
                    } else {
                        shape.fill(.thinMaterial)
                            .overlay { if let tint { shape.fill(tint.opacity(metric("selectionOpacity") * 2)) } }
                            .overlay { QuietSurfaceEdge(radius: radius) }
                    }
                }
                .overlay {
                    if focused { shape.strokeBorder(contentColor("action-text", scheme), lineWidth: metric("hairline") * 2).allowsHitTesting(false) }
                }
                .shadow(color: Color(nsColor: .shadowColor).opacity(metric("selectionOpacity")), radius: metric("tight"), y: metric("hairline"))
        }
    }
}

// Chat keeps its compact circular geometry while sharing the app-wide material.
struct ChatButtonStyle: ButtonStyle {
    var glass: Bool
    var kind: VznButtonKind = .quiet
    var circular = false
    @ViewBuilder func makeBody(configuration: Configuration) -> some View {
        if glass { ChatButtonBody(configuration: configuration, kind: kind, circular: circular) }
        else { VznButtonStyle(kind: kind).makeBody(configuration: configuration) }
    }
}

private struct ChatButtonBody: View {
    var configuration: ButtonStyleConfiguration
    var kind: VznButtonKind
    var circular: Bool
    @Environment(\.isEnabled) private var enabled
    @Environment(\.colorScheme) private var scheme
    @Environment(\.isFocused) private var focused
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    @State private var hovered = false
    private var danger: Bool { configuration.role == .destructive }
    // Send (`.btn.primary` round): the painted accent face, never tinted glass.
    private var painted: Bool { kind == .primary && !danger && enabled && !reduceTransparency && contrast != .increased }
    var body: some View {
        configuration.label.lineLimit(1)
            .padding(.horizontal, circular ? 0 : metric("gap"))
            .frame(width: circular ? metric("control") : nil)
            .frame(minWidth: metric("control"), minHeight: metric("control"))
            .foregroundStyle(contentColor(!enabled ? "text-disabled" : danger ? "danger" : kind == .primary ? "action-fg" : "text-strong", scheme))
            .background { if painted { PrimaryFace(shape: Capsule(), hovered: hovered, pressed: configuration.isPressed, focused: focused) } }
            .modifier(ControlGlass(active: !painted, selected: hovered || configuration.isPressed,
                                       emphasized: kind == .primary && !danger, focused: focused,
                                       pressed: configuration.isPressed, enabled: enabled, danger: danger))
            .contentShape(Capsule())
            .onHover { hovered = $0 }
    }
}

// `.btn.primary`: accent gradient (action-fill), darker while hovered/pressed,
// an accent shadow, and a separate 2 pt focus ring outside the face.
struct PrimaryFace<S: InsettableShape>: View {
    var shape: S
    var hovered = false
    var pressed = false
    var focused = false
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        shape.fill(LinearGradient(colors: [contentColor("action-fill-top", scheme), contentColor("action-fill-bottom", scheme)],
                                  startPoint: .top, endPoint: .bottom))
            .overlay { if hovered || pressed { shape.fill(contentColor("action-active", scheme).opacity(metric("selectionOpacity") * (pressed ? 3 : 2))) } }
            .shadow(color: contentColor("action", scheme).opacity(metric("overlayShadowOpacity")), radius: metric("small"), y: metric("shadowSmY"))
            .overlay { if focused { shape.inset(by: -metric("hairline") * 2).strokeBorder(contentColor("action-text", scheme), lineWidth: metric("hairline") * 2) } }
            .allowsHitTesting(false).accessibilityHidden(true)
    }
}

// Bounded content surface: one border, one radius, no nested frames.
struct CardSurface: ViewModifier {
    var padded = true
    var selected = false
    @Environment(\.colorScheme) private var scheme
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    private var radius: CGFloat { metric((NativeTheme.shared.preferences.preset ?? "glass") == "glass" ? "chromeCardRadius" : "radius") }
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    @ViewBuilder func body(content: Content) -> some View {
        if glass { glassCard(content) } else { quietCard(content) }
    }
    // `.card`: a flat hairline surface on the reading pane; no blur, no nested pane.
    private func glassCard(_ content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        let solid = contrast == .increased || reduceTransparency
        return content.padding(padded ? metric("inset") : 0)
            .background(shape.fill(contentColor(selected ? "action-soft" : "surface", scheme)))
            .overlay {
                shape.strokeBorder(selected ? contentColor("action", scheme).opacity(metric("selectionOpacity") * 4) : contentColor(solid ? "border-strong" : "border", scheme), lineWidth: metric("hairline"))
            }
            .shadow(color: scheme == .light && !solid ? contentColor("border", scheme) : .clear, radius: metric("hairline"), y: metric("hairline"))
    }
    private func quietCard(_ content: Content) -> some View {
        content.padding(padded ? metric("inset") : 0)
            .background(selected ? contentColor("action-soft", scheme) : contentColor("surface", scheme),
                        in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay {
                if selected {
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .strokeBorder(contentColor("action", scheme).opacity(metric("selectionOpacity") * 4), lineWidth: metric("hairline"))
                } else { QuietSurfaceEdge(radius: radius) }
            }
    }
}

extension View {
    func cardSurface(padded: Bool = true, selected: Bool = false) -> some View { modifier(CardSurface(padded: padded, selected: selected)) }
}

struct CardSection<Content: View>: View {
    // Flush: settings-style card; a titled header bar, rows with edge-to-edge dividers.
    var flush = false
    var title: String?
    @ViewBuilder var content: Content
    var body: some View {
        if flush {
            VStack(alignment: .leading, spacing: 0) {
                if let title {
                    Text(title).font(.system(size: NSFont.systemFontSize, weight: .semibold)).accessibilityAddTraits(.isHeader)
                        .padding(.horizontal, metric("inset")).frame(minHeight: metric("navControl") + metric("tight"), alignment: .leading)
                    CardDivider()
                }
                content.environment(\.cardRowInset, metric("inset"))
            }.frame(maxWidth: .infinity, alignment: .leading).cardSurface(padded: false)
        } else {
            VStack(alignment: .leading, spacing: metric("small")) {
                if let title { Text(title).font(.vzn("subtitleScale", .bold)).accessibilityAddTraits(.isHeader).padding(.bottom, metric("small")) }
                content
            }.frame(maxWidth: .infinity, alignment: .leading).cardSurface()
        }
    }
}

private struct CardRowInsetKey: EnvironmentKey { static let defaultValue: CGFloat = 0 }
extension EnvironmentValues {
    var cardRowInset: CGFloat { get { self[CardRowInsetKey.self] } set { self[CardRowInsetKey.self] = newValue } }
}

// Edge-to-edge row separator inside a card: the warm Glass hairline, the
// system separator elsewhere.
struct CardDivider: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        if (NativeTheme.shared.preferences.preset ?? "glass") == "glass" {
            Rectangle().fill(contentColor("divider", scheme)).frame(height: metric("hairline")).accessibilityHidden(true)
        } else { Divider() }
    }
}

// A labelled setting/action row (`.srow`: at least 48 pt, label 14, description 12).
// Dividers sit between rows, not around them.
struct CardRow<Trailing: View>: View {
    var title: String
    var detail: String = ""
    var divider = true
    @ViewBuilder var trailing: Trailing
    @Environment(\.cardRowInset) private var inset
    private var copy: some View {
        VStack(alignment: .leading, spacing: metric("tight")) {
            Text(title).font(.vzn("labelScale", .medium)).fixedSize(horizontal: false, vertical: true)
            if !detail.isEmpty {
                Text(detail).font(.vzn("smallScale")).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    var body: some View {
        VStack(spacing: 0) {
            SettingsRowLayout {
                copy
                HStack(spacing: metric("small")) { trailing }
            }.padding(.vertical, metric("gap")).padding(.horizontal, inset)
                .frame(minHeight: (NativeTheme.shared.preferences.preset ?? "glass") == "glass" ? metric("navControl") + metric("small") : nil)
            if divider { CardDivider() }
        }.accessibilityElement(children: .contain)
    }
}

// Measure the control group first, then give wrapping copy the remaining width.
// ViewThatFits measures the copy's ideal width and incorrectly stacks long
// descriptions even on desktop; this layout uses the actual available column.
private struct SettingsRowLayout: Layout {
    private func sizes(_ proposal: ProposedViewSize, _ subviews: Subviews) -> (CGFloat, CGSize, CGSize, Bool) {
        let width = max(0, proposal.width ?? metric("reading"))
        let controls = subviews[1].sizeThatFits(ProposedViewSize(width: width, height: nil))
        let horizontal = width >= metric("sidebar") - metric("large") + metric("inset") + controls.width
        let copyWidth = horizontal ? max(0, width - controls.width - metric("inset")) : width
        let copy = subviews[0].sizeThatFits(ProposedViewSize(width: copyWidth, height: nil))
        return (width, copy, controls, horizontal)
    }
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard subviews.count == 2 else { return .zero }
        let (width, copy, controls, horizontal) = sizes(proposal, subviews)
        return CGSize(width: width, height: horizontal ? max(copy.height, controls.height) : copy.height + metric("small") + controls.height)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard subviews.count == 2 else { return }
        let (width, copy, controls, horizontal) = sizes(ProposedViewSize(width: bounds.width, height: nil), subviews)
        let copyWidth = horizontal ? max(0, width - controls.width - metric("inset")) : width
        subviews[0].place(at: CGPoint(x: bounds.minX, y: horizontal ? bounds.midY - copy.height / 2 : bounds.minY), proposal: ProposedViewSize(width: copyWidth, height: copy.height))
        subviews[1].place(at: CGPoint(x: horizontal ? bounds.maxX - controls.width : bounds.minX, y: horizontal ? bounds.midY - controls.height / 2 : bounds.minY + copy.height + metric("small")), proposal: ProposedViewSize(width: controls.width, height: controls.height))
    }
}

extension CardRow where Trailing == EmptyView {
    init(title: String, detail: String = "", divider: Bool = true) { self.init(title: title, detail: detail, divider: divider) { EmptyView() } }
}

struct KeyCap: View {
    var text: String
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        if (NativeTheme.shared.preferences.preset ?? "glass") == "glass" {
            // `.kbd`: a 20 pt mono cap, raised white with a hairline and top highlight.
            let shape = RoundedRectangle(cornerRadius: metric("chromeShortcutRadius"), style: .continuous)
            Text(text).font(.system(size: NSFont.systemFontSize * metric("captionScale"), weight: .medium, design: .monospaced))
                .foregroundStyle(contentColor("text-muted", scheme))
                .padding(.horizontal, metric("small") - metric("hairline") * 2).frame(height: metric("icon"))
                .background(shape.fill(contentColor("surface", scheme)))
                .overlay {
                    shape.strokeBorder(contentColor("border", scheme), lineWidth: metric("hairline"))
                }
                .overlay(alignment: .top) {
                    if scheme == .light {
                        shape.inset(by: metric("hairline")).strokeBorder(chromeColor("material-highlight", scheme), lineWidth: metric("hairline"))
                            .mask(alignment: .top) { Rectangle().frame(height: metric("hairline") * 2) }
                    }
                }
                .fixedSize()
        } else {
            Text(text).font(.vzn("labelScale")).foregroundStyle(contentColor("text-strong", scheme))
                .padding(.horizontal, metric("small") + metric("tight")).frame(minHeight: metric("compactControl"))
                .overlay(RoundedRectangle(cornerRadius: metric("controlRadius")).strokeBorder(contentColor("border", scheme), lineWidth: metric("hairline")))
                .fixedSize()
        }
    }
}

enum StatusTone { case ready, busy, idle, failed, warning }

struct StatusDot: View {
    @Environment(\.colorScheme) private var scheme
    var tone: StatusTone
    var body: some View {
        Circle().fill(tone == .ready ? contentColor("success", scheme) : tone == .busy ? contentColor("action", scheme) : tone == .failed ? contentColor("danger", scheme) : tone == .warning ? contentColor("warning", scheme) : contentColor("text-soft", scheme))
            .frame(width: metric("small"), height: metric("small")).accessibilityHidden(true)
    }
}

// Soft accent pill for live state. The text, not only the color, carries meaning.
struct StatusBadge: View {
    var text: String
    var tone: StatusTone = .busy
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        if (NativeTheme.shared.preferences.preset ?? "glass") == "glass" { chip } else { badge }
    }
    // `.chip`: 24 pt capsule, 12 medium. Ready reads success, live work the
    // accent, idle neutral and failure danger; the words carry the meaning.
    private var chip: some View {
        let role = tone == .ready ? "success" : tone == .busy ? "action-text" : tone == .failed ? "danger" : tone == .warning ? "warning" : "text-muted"
        return HStack(spacing: metric("small") - metric("hairline") * 2) { StatusDot(tone: tone); Text(text).font(.vzn("smallScale", .medium)) }
            .foregroundStyle(contentColor(role, scheme))
            .padding(.horizontal, metric("small") + metric("hairline") * 2).frame(height: metric("gutter"))
            .background(tone == .idle ? contentColor("surface-muted", scheme)
                        : tone == .busy ? contentColor("action-soft", scheme)
                        : contentColor(role, scheme).opacity(metric("selectionOpacity")), in: Capsule())
            .fixedSize()
    }
    private var badge: some View {
        // Accent only for live/ready state; idle reads neutral and failures read as danger.
        HStack(spacing: metric("small")) { StatusDot(tone: tone); Text(text).font(.vzn("smallScale")) }
            .foregroundStyle(contentColor(tone == .idle ? "text-muted" : tone == .failed ? "danger" : "action-text", scheme))
            .padding(.horizontal, metric("small") + metric("tight")).padding(.vertical, metric("tight"))
            .background(tone == .idle || tone == .failed ? contentColor("surface-muted", scheme) : contentColor("action-soft", scheme), in: Capsule())
            .fixedSize()
    }
}

// Glass notice band (Shell-States, Interpret-States, Apps-States): a soft tone
// fill (`selectionOpacity`) with a hairline. `edge` is the band under the
// header that spans the reading pane; otherwise it is a rounded 12 pt box with
// a tinted border inside the page.
struct NoticeBand<Content: View>: View {
    var role: String
    var edge = true
    @ViewBuilder var content: Content
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: edge ? 0 : metric("radius"), style: .continuous)
        HStack(spacing: metric("small") + metric("hairline") * 2) { content }
            .font(.system(size: NSFont.systemFontSize))
            .padding(.leading, edge ? metric("gutter") - metric("tight") : metric("inset"))
            .padding(.trailing, edge ? metric("inset") : metric("gap"))
            .padding(.vertical, metric("tight"))
            .frame(maxWidth: .infinity, minHeight: metric("navControl") + metric("tight"), alignment: .leading)
            .background(contentColor(role, scheme).opacity(metric("selectionOpacity")), in: shape)
            .overlay {
                if !edge { shape.strokeBorder(contentColor(role, scheme).opacity(metric("selectionOpacity") * 2), lineWidth: metric("hairline")) }
            }
            .overlay(alignment: .bottom) { if edge { CardDivider() } }
            .accessibilityElement(children: .contain)
    }
}

// Inline failure inside a message or card (Chat-States, Launcher-States):
// danger icon, a strong first line and an optional muted reason.
struct InlineFailure: View {
    var title: String
    var detail: String? = nil
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: metric("radius"), style: .continuous)
        HStack(alignment: .firstTextBaseline, spacing: metric("small") + metric("hairline") * 2) {
            Image(systemName: "exclamationmark.triangle").foregroundStyle(contentColor("danger", scheme)).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: metric("hairline") * 2) {
                Text(title).font(.system(size: NSFont.systemFontSize, weight: detail == nil ? .regular : .medium)).foregroundStyle(contentColor("text-strong", scheme))
                if let detail { Text(detail).font(.system(size: NSFont.systemFontSize)).foregroundStyle(contentColor("text-muted", scheme)) }
            }.fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, metric("gap")).padding(.vertical, metric("small") + metric("hairline") * 2)
        .background(contentColor("danger", scheme).opacity(metric("selectionOpacity") * 0.7), in: shape)
        .overlay { shape.strokeBorder(contentColor("danger", scheme).opacity(metric("selectionOpacity") * 1.6), lineWidth: metric("hairline")) }
        .accessibilityElement(children: .combine)
    }
}

// Empty state of a Glass page (Dictionary, Interpret, Thermal, Apps): a 52 pt
// tone disc with the glyph, a 15 semibold title and a muted hint.
struct GlassEmptyState: View {
    var symbol: String
    var tone: String
    var title: String
    var hint: String? = nil
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        VStack(spacing: metric("small")) {
            Image(systemName: symbol).font(.system(size: metric("gutter") - metric("hairline") * 2))
                .foregroundStyle(contentColor(tone, scheme))
                .frame(width: metric("hero") + metric("tight"), height: metric("hero") + metric("tight"))
                .background(contentColor(tone, scheme).opacity(metric("selectionOpacity") * 1.5), in: Circle())
                .padding(.bottom, metric("tight")).accessibilityHidden(true)
            Text(title).font(.vzn("subtitleScale", .semibold)).foregroundStyle(contentColor("text-strong", scheme))
            if let hint { Text(hint).font(.system(size: NSFont.systemFontSize)).foregroundStyle(contentColor("text-muted", scheme)) }
        }
        .multilineTextAlignment(.center).frame(maxWidth: metric("dialog") - metric("editor")).frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Listen layer (Overlays-Listen)

/// One thing the Listen layer can read: a titled text in a language.
struct ListenSource: Identifiable, Equatable {
    var id: String
    var title: String
    var text: String
    var language: String
}

extension NativeAudio {
    /// Reads a Listen source; the player remembers which one, so every speaker control agrees.
    func read(_ source: ListenSource, provider: String? = nil) { speak(source.text, language: source.language, source: source.id, provider: provider) }
    func reading(_ sources: [ListenSource]) -> Bool { speaking && sources.contains { $0.id == speakingSource } }
}

private let listenProviderNames = ["system": "voiceSystem", "edge": "Microsoft Edge", "openai": "OpenAI", "gemini": "Gemini", "elevenlabs": "ElevenLabs"]

// The 360 pt layer: a row per source (the first is the lens), a reading line with Read again
// and Stop, an inline failure, then the voice and the speed seg at the foot.
struct ListenPanel: View {
    let store: WorkbenchStore
    var sources: [ListenSource]
    /// Interpretation reads through its own player; everything else uses the store's.
    var audio: NativeAudio? = nil
    var close: () -> Void
    private var player: NativeAudio { audio ?? store.audio }
    @Environment(\.colorScheme) private var scheme
    private var voice: VoicePreferences { store.workspace.voice ?? VoicePreferences() }
    private var providerName: String {
        let key = listenProviderNames[voice.provider] ?? voice.provider
        return key == "voiceSystem" ? store.text(key) : key
    }
    private var rateSupported: Bool { VoicePreferences.rateSupported(voice.provider) }
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(store.text("listen")).font(.system(size: NSFont.systemFontSize, weight: .semibold)).foregroundStyle(contentColor("text-strong", scheme)).accessibilityAddTraits(.isHeader)
                Spacer(minLength: metric("small"))
                Button(action: close) { Image(systemName: "xmark").imageScale(.small) }.buttonStyle(.vznQuiet).help(store.text("close")).accessibilityLabel(store.text("close"))
            }.padding(.leading, metric("inset")).padding(.trailing, metric("small")).frame(height: metric("navControl") + metric("tight"))
            VStack(alignment: .leading, spacing: metric("hairline") * 2) {
                // A reading row keeps its height: the subtitle becomes the reading line and Read again /
                // Stop take the ↩ cap's place, so starting or ending playback never moves the layer.
                ForEach(Array(sources.enumerated()), id: \.element.id) { index, source in
                    let reading = player.speaking && player.speakingSource == source.id
                    sourceRow(source, lens: index == 0 && !reading, reading: reading)
                }
                if let error = player.error {
                    InlineFailure(title: store.text(error)).padding(.horizontal, metric("hairline") * 2).padding(.top, metric("tight"))
                    HStack(spacing: metric("small")) {
                        // A cloud voice failed: read this once with the system voice, settings unchanged.
                        if voice.provider != "system", let failed = sources.first(where: { $0.id == player.lastSource }) ?? sources.first {
                            Button(store.text("readWithSystemVoice")) { player.read(failed, provider: "system") }.buttonStyle(.vznOutline).controlSize(.small)
                        }
                        Button(store.text("openVoiceSettings")) { close(); NotificationCenter.default.post(name: .viezanOpenSettings, object: "voice") }
                            .modifier(NoticeLinkStyle(glass: true, accent: true))
                    }.padding(.horizontal, metric("small")).padding(.vertical, metric("small"))
                }
            }.padding(.horizontal, metric("small")).padding(.bottom, metric("small"))
            CardDivider()
            VStack(alignment: .leading, spacing: metric("small")) {
                HStack(spacing: metric("small")) {
                    footLabel(store.text("voiceShort"))
                    Text(providerName + (voice.voice.isEmpty ? "" : " · " + voiceName)).font(.vzn("smallScale")).foregroundStyle(contentColor("text-strong", scheme)).lineLimit(1)
                    Spacer(minLength: metric("small"))
                    Button(store.text("changeVoice")) { close(); NotificationCenter.default.post(name: .viezanOpenSettings, object: "voice") }
                        .modifier(NoticeLinkStyle(glass: true, accent: true)).accessibilityLabel(store.text("changeVoice") + " " + store.text("voiceProvider"))
                }
                HStack(spacing: metric("small")) {
                    footLabel(store.text("rateShort"))
                    Spacer(minLength: metric("small"))
                    FilterTabs(label: store.text("voiceRate"), items: VoicePreferences.rates.map { ($0, $0.formatted(.number.precision(.fractionLength(0...2))) + "×") },
                               selection: Binding(get: { voice.rate ?? 1 }, set: { store.setVoice(provider: voice.provider, voice: voice.voice, rate: $0) }))
                        .disabled(!rateSupported).opacity(rateSupported ? 1 : 0.45)
                }
            }.padding(.horizontal, metric("inset")).padding(.vertical, metric("gap") - metric("hairline") * 2)
        }
        .frame(width: metric("dialog") - metric("compactSidebar"))
        .accessibilityElement(children: .contain).accessibilityLabel(store.text("listen"))
    }
    private var voiceName: String { player.voices.first { $0.id == voice.voice }?.name ?? voice.voice }
    private func footLabel(_ text: String) -> some View {
        Text(text.uppercased(with: Locale(identifier: store.workspace.locale))).font(.system(size: NSFont.systemFontSize * metric("captionScale") * 0.9, weight: .semibold))
            .foregroundStyle(contentColor("text-muted", scheme)).frame(minWidth: metric("large") + metric("gap"), alignment: .leading)
    }
    private func sourceRow(_ source: ListenSource, lens: Bool, reading: Bool) -> some View {
        HStack(spacing: metric("small")) {
            Button { player.read(source) } label: {
                HStack(spacing: metric("gap")) {
                    Group {
                        if reading { ReadingWave(color: contentColor("action", scheme)) }
                        else { Image(systemName: "play.fill").imageScale(.small).foregroundStyle(contentColor("text-muted", scheme)) }
                    }.frame(width: metric("large"), height: metric("large")).background(contentColor("surface-muted", scheme), in: Circle())
                    VStack(alignment: .leading, spacing: metric("hairline")) {
                        Text(source.title).font(.system(size: NSFont.systemFontSize, weight: .medium)).foregroundStyle(contentColor("text-strong", scheme)).lineLimit(1)
                        Text(reading ? (player.preparing ? store.text("preparingVoice") : store.text("readingCount").replacingOccurrences(of: "{count}", with: source.text.count.formatted()))
                                     : store.text("lang_" + source.language) + " · " + (player.voice(for: source.language)?.name ?? providerName))
                            .font(.vzn("smallScale")).foregroundStyle(contentColor(reading ? "action" : "text-muted", scheme)).lineLimit(1)
                    }.layoutPriority(1)
                    Spacer(minLength: 0)
                }.frame(maxHeight: .infinity).contentShape(Rectangle())
            }.buttonStyle(.plain)
                .keyboardShortcut(lens ? .defaultAction : nil)
                .disabled(source.text.isEmpty)
                .accessibilityLabel(store.text("listen") + ": " + source.title).accessibilityAddTraits(reading ? .isSelected : [])
                .accessibilityIdentifier("listen-source-" + source.id)
            if reading {
                Button { player.read(source) } label: { Image(systemName: "arrow.clockwise") }.buttonStyle(.vznOutline).controlSize(.small)
                    .help(store.text("readAgain")).accessibilityLabel(store.text("readAgain"))
                Button(store.text("stop"), systemImage: "stop.fill", role: .destructive) { player.stopSpeaking() }.buttonStyle(.vznQuiet).controlSize(.small)
                    .foregroundStyle(contentColor("danger", scheme)).accessibilityIdentifier("listen-stop")
            } else if lens { KeyCap(text: "↩").accessibilityHidden(true) }
        }
        .padding(.horizontal, metric("small") + metric("hairline") * 2).frame(height: metric("hero"))
        .background { if lens { GlassLens(radius: metric("radius")) } }
    }
}

/// Four accent bars for "reading now" that rise and fall while reading; still under Reduce Motion.
struct ReadingWave: View {
    var color: Color
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private static let rest: [Double] = [0.4, 0.85, 0.55, 1.0]
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion)) { context in
            let time = context.date.timeIntervalSinceReferenceDate
            HStack(alignment: .bottom, spacing: metric("hairline") * 2) {
                ForEach(Self.rest.indices, id: \.self) { index in
                    let height = reduceMotion ? Self.rest[index] : 0.3 + 0.7 * abs(sin(time * 4.2 + Double(index) * 1.3))
                    RoundedRectangle(cornerRadius: metric("hairline") * 1.5).fill(color).frame(width: metric("hairline") * 2.5, height: metric("gap") * height)
                }
            }.frame(height: metric("gap"), alignment: .bottom)
        }.accessibilityHidden(true)
    }
}

/// The speaker control: a click reads the first source at once and, while reading, turns into a
/// "Reading" pill that stops on click. A secondary click (or ⌥-click) opens the Listen layer.
struct ListenSpeakerButton: View {
    let store: WorkbenchStore
    var label: String
    var sources: [ListenSource]
    var pill = false
    var audio: NativeAudio? = nil
    private var player: NativeAudio { audio ?? store.audio }
    @State private var open = false
    @Environment(\.colorScheme) private var scheme
    private var reading: Bool { player.reading(sources) }
    var body: some View {
        Button {
            if reading { player.stopSpeaking() }
            else if NSEvent.modifierFlags.contains(.option) { open = true }
            else if let first = sources.first { player.read(first) }
        } label: {
            if reading {
                HStack(spacing: metric("small") - metric("hairline") * 2) { ReadingWave(color: contentColor("action-text", scheme)); Text(store.text("readingNow")).fontWeight(.semibold) }
                    .foregroundStyle(contentColor("action-text", scheme))
            } else if pill { Image(systemName: "speaker.wave.2") }
            else { Image(systemName: "speaker.wave.2").imageScale(.small).foregroundStyle(contentColor("text-muted", scheme)) }
        }
        .buttonStyle(pill || reading ? AnyButtonStyle(.vznOutline) : AnyButtonStyle(.vznQuiet)).fixedSize()
        .disabled(sources.allSatisfy { $0.text.isEmpty })
        .help(reading ? store.text("stopSpeaking") : label)
        .accessibilityLabel(reading ? store.text("readingNow") + ", " + store.text("stopSpeaking") : label)
        .accessibilityAddTraits(reading ? .isSelected : [])
        .contextMenu { Button(store.text("listen") + "…") { open = true } }
        .popover(isPresented: $open, arrowEdge: .bottom) { ListenPanel(store: store, sources: sources, audio: audio) { open = false } }
    }
}

/// "1,4 giây": a task's duration in the UI language, one decimal under a minute.
@MainActor func durationText(_ seconds: Double, store: WorkbenchStore) -> String {
    let value = seconds.formatted(.number.precision(.fractionLength(seconds < 60 ? 1 : 0)).locale(Locale(identifier: store.workspace.locale)))
    return store.text("durationSeconds").replacingOccurrences(of: "{n}", with: value)
}

/// Confirms a file written by the app, with Reveal in Finder as the toast action.
@MainActor func announceSaved(_ url: URL, store: WorkbenchStore) {
    ToastCenter.shared.show(store.text("fileSaved").replacingOccurrences(of: "{name}", with: url.lastPathComponent), key: "saved-" + url.path,
                            actionLabel: store.text("reveal")) { NSWorkspace.shared.activateFileViewerSelecting([url]) }
}

/// Copies text and confirms it with a toast (Overlays board: success toast, bottom trailing).
@MainActor func copyText(_ text: String, store: WorkbenchStore) {
    NSPasteboard.general.clearContents()
    let ok = NSPasteboard.general.setString(text, forType: .string)
    ToastCenter.shared.show(store.text(ok ? "copied" : "copyFailed"), key: "copy", error: !ok)
}

private struct WorkspaceOuterInsetKey: EnvironmentKey { static let defaultValue: CGFloat = 0 }
extension EnvironmentValues {
    var workspaceOuterInset: CGFloat {
        get { self[WorkspaceOuterInsetKey.self] }
        set { self[WorkspaceOuterInsetKey.self] = newValue }
    }
}

// One stable feature container. Its outer gutter replaces part of the page's
// existing inset, preserving the reading width and compact toolbar budget.
// Glass (`.content`): the one warm reading pane of the window, `gap` from the
// navigation pane and the window edge, `small` from the header and the bottom.
struct WorkspaceSurface: ViewModifier {
    var compact: Bool
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    func body(content: Content) -> some View {
        let inset = glass ? metric("gap") : 0
        let shape = RoundedRectangle(cornerRadius: glass ? metric("chromeSurfaceRadius") : 0, style: .continuous)
        let solid = reduceTransparency || contrast == .increased
        content
            .environment(\.workspaceOuterInset, inset)
            // Shell-Solid: the reading pane stays the lightest solid surface, above the solid navigation pane.
            .background {
                if glass && solid { chromeColor("titlebar-bg", scheme).overlay(contentColor("surface", scheme)) }
                else { contentColor(glass ? "canvas" : "surface", scheme) }
            }
            .clipShape(shape)
            .overlay {
                if glass {
                    if solid { shape.strokeBorder(contentColor("border-strong", scheme), lineWidth: metric("hairline")) }
                    else { GlassRim(shape: shape, border: scheme == .light ? "material-border" : "border") }
                }
            }
            .background {
                if glass && !solid { OuterShadow(shape: shape, role: "shadow-sm-color", blur: metric("shadowMdBlur"), y: metric("shadowMdY")) }
            }
            .padding(.horizontal, inset)
            .padding(.top, glass ? metric("small") : 0)
            .padding(.bottom, glass ? metric("small") : 0)
    }
}

// Shared reading column for workspace pages.
struct WorkspacePage<Content: View>: View {
    var maxWidth: CGFloat = .infinity
    @ViewBuilder var content: Content
    @Environment(\.workspaceOuterInset) private var outerInset
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: metric("gutter")) { content }
                .frame(maxWidth: maxWidth, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, metric("large") + metric("gap") - outerInset).padding(.vertical, metric("gutter"))
        }
    }
}

// Language pair row shared by Translation, Dictionary and Interpretation.
struct LanguageMenu: View {
    @Bindable var store: WorkbenchStore
    @Environment(\.colorScheme) private var scheme
    @State private var hovered = false
    var label: String
    var codes: [String]
    var selection: String
    var choose: (String) -> Void
    var disabled = false
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    var body: some View {
        // Framed language button: role label, language, chevron (UI rule: separated pair).
        Menu {
            Picker(label, selection: Binding(get: { selection }, set: choose)) {
                ForEach(codes, id: \.self) { Text(store.text("lang_" + $0)).tag($0) }
            }.pickerStyle(.inline).labelsHidden()
        } label: {
            HStack(spacing: metric("small")) {
                Text(label).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme))
                Text(store.text("lang_" + selection)).font(.vzn("labelScale", .medium)).foregroundStyle(contentColor("text-strong", scheme))
                Image(systemName: "chevron.down").imageScale(.small).foregroundStyle(contentColor("text-muted", scheme))
            }.padding(.horizontal, metric("gap")).frame(minHeight: metric("navControl"))
                .background(hovered && !glass ? contentColor("surface-hover", scheme) : .clear, in: RoundedRectangle(cornerRadius: metric("controlRadius")))
                .modifier(ControlGlass(active: glass, radius: metric("navControl") / 2, selected: hovered, enabled: !disabled))
                .contentShape(RoundedRectangle(cornerRadius: metric("controlRadius")))
        }.menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize().disabled(disabled)
            .onHover { hovered = $0 }
            .accessibilityLabel(label + ": " + store.text("lang_" + selection))
    }
}

extension Feature {
    var symbol: String { self == .chat ? "bubble.left.and.bubble.right" : self == .dictionary ? "book" : "translate" }
}

@MainActor func relativeTime(_ seconds: Double?, store: WorkbenchStore) -> String {
    guard let seconds else { return "" }
    let formatter = RelativeDateTimeFormatter()
    formatter.locale = Locale(identifier: store.workspace.locale)
    formatter.dateTimeStyle = .named; formatter.unitsStyle = .short
    return formatter.localizedString(for: Date(timeIntervalSince1970: seconds), relativeTo: Date())
}

// GroupBox rendered as a Review 18 card: optional heading, one bounded surface.
struct CardGroupBoxStyle: GroupBoxStyle {
    func makeBody(configuration: Configuration) -> some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            configuration.label.font(.vzn("labelScale", .semibold))
            configuration.content
        }.frame(maxWidth: .infinity, alignment: .leading).cardSurface()
    }
}

// Equal columns once the container is wide enough; otherwise a single stack.
struct AdaptiveColumns: Layout {
    var spacing: CGFloat = metric("inset")
    var threshold: CGFloat = metric("reading")
    private func columns(_ width: CGFloat, _ count: Int) -> Bool { count > 1 && width >= threshold }
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? threshold
        if columns(width, subviews.count) {
            let column = (width - spacing * CGFloat(subviews.count - 1)) / CGFloat(subviews.count)
            return CGSize(width: width, height: subviews.map { $0.sizeThatFits(ProposedViewSize(width: column, height: nil)).height }.max() ?? 0)
        }
        let heights = subviews.map { $0.sizeThatFits(ProposedViewSize(width: width, height: nil)).height }
        return CGSize(width: width, height: heights.reduce(0, +) + spacing * CGFloat(max(0, subviews.count - 1)))
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        if columns(bounds.width, subviews.count) {
            let column = (bounds.width - spacing * CGFloat(subviews.count - 1)) / CGFloat(subviews.count)
            for (index, view) in subviews.enumerated() {
                view.place(at: CGPoint(x: bounds.minX + CGFloat(index) * (column + spacing), y: bounds.minY), anchor: .topLeading, proposal: ProposedViewSize(width: column, height: nil))
            }
        } else {
            var y = bounds.minY
            for view in subviews {
                let size = view.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
                view.place(at: CGPoint(x: bounds.minX, y: y), anchor: .topLeading, proposal: ProposedViewSize(width: bounds.width, height: nil))
                y += size.height + spacing
            }
        }
    }
}

// Review 18 `.grid.three`/`.equal`: `maxColumns` equal columns that fill the row
// (extra items wrap), or one column once a column would fall below `minimum`.
struct UniformGrid: Layout {
    var maxColumns: Int
    var minimum: CGFloat = metric("sidebar") - metric("large")
    var spacing: CGFloat = metric("inset")
    private func rows(_ width: CGFloat, _ subviews: Subviews) -> (column: CGFloat, perRow: Int, heights: [CGFloat]) {
        let perRow = width + spacing >= CGFloat(maxColumns) * (minimum + spacing) ? maxColumns : 1
        let column = (width - spacing * CGFloat(perRow - 1)) / CGFloat(perRow)
        let heights = stride(from: 0, to: subviews.count, by: perRow).map { start in
            subviews[start..<min(start + perRow, subviews.count)].map { $0.sizeThatFits(ProposedViewSize(width: column, height: nil)).height }.max() ?? 0
        }
        return (column, perRow, heights)
    }
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? metric("reading")
        let layout = rows(width, subviews)
        return CGSize(width: width, height: layout.heights.reduce(0, +) + spacing * CGFloat(max(0, layout.heights.count - 1)))
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let layout = rows(bounds.width, subviews)
        var y = bounds.minY
        for (row, height) in layout.heights.enumerated() {
            for slot in 0..<layout.perRow where row * layout.perRow + slot < subviews.count {
                subviews[row * layout.perRow + slot].place(at: CGPoint(x: bounds.minX + CGFloat(slot) * (layout.column + spacing), y: y), anchor: .topLeading,
                                                          proposal: ProposedViewSize(width: layout.column, height: height))
            }
            y += height + spacing
        }
    }
}

// Review 18 buttons: outlined secondary, one solid primary, quiet utilities.
// Native disabled always reads gray; destructive roles read the danger role.
enum VznButtonKind { case outline, primary, quiet }

struct VznButtonStyle: ButtonStyle {
    var kind: VznButtonKind
    var allowsGlass = true
    func makeBody(configuration: Configuration) -> some View { VznButtonBody(configuration: configuration, kind: kind, allowsGlass: allowsGlass) }
}

private struct VznButtonBody: View {
    let configuration: ButtonStyleConfiguration
    let kind: VznButtonKind
    var allowsGlass = true
    @Environment(\.isEnabled) private var enabled
    @Environment(\.controlSize) private var size
    @Environment(\.colorScheme) private var scheme
    @Environment(\.isFocused) private var focused
    @State private var hovered = false
    private var danger: Bool { configuration.role == .destructive }
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    private var glass: Bool { allowsGlass && (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    private var height: CGFloat { size == .large ? metric("control") : metric("compactControl") }
    // Glass buttons are pills (`.btn`); other presets keep their control radius.
    private var radius: CGFloat { glass ? height / 2 : metric((NativeTheme.shared.preferences.preset ?? "glass") == "glass" ? "chromeControlRadius" : "controlRadius") }
    // `.btn.primary`: the accent gradient face with a light top edge and accent shadow.
    private var paintedPrimary: Bool { glass && kind == .primary && !danger && enabled && !reduceTransparency && contrast != .increased }
    private func color(_ role: String) -> Color { contentColor(role, scheme) }
    private var foreground: Color {
        if !enabled { return color("text-disabled") }
        if danger { return color("danger") }
        return kind == .primary ? color("action-fg") : color("text-strong")
    }
    private var fill: Color {
        if !enabled { return kind == .quiet ? .clear : color("surface-subtle") }
        switch kind {
        case .primary: return color(hovered || configuration.isPressed ? "action-hover" : "action")
        case .outline: return danger ? color("danger").opacity(metric("selectionOpacity") * (hovered ? 2 : 1.5)) : color(hovered || configuration.isPressed ? "surface-hover" : "surface")
        case .quiet: return hovered || configuration.isPressed ? color("surface-hover") : .clear
        }
    }
    private var stroke: Color {
        if kind != .outline { return .clear }
        return !enabled ? color("border") : danger ? .clear : color("border-strong")
    }
    var body: some View {
        if glass { glassBody } else { quietBody }
    }
    private var glassBody: some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        return configuration.label
            .lineLimit(1)
            .font(.system(size: NSFont.systemFontSize, weight: kind == .primary ? .semibold : .medium))
            .padding(.horizontal, size == .large ? metric("gap") + metric("tight") / 2 : metric("gap"))
            .frame(minWidth: height, minHeight: height)
            .foregroundStyle(foreground)
            .background {
                if paintedPrimary { PrimaryFace(shape: shape, hovered: hovered, pressed: configuration.isPressed, focused: focused) }
            }
            .modifier(ControlGlass(active: !paintedPrimary && (kind != .quiet || hovered || configuration.isPressed), radius: radius,
                selected: hovered || configuration.isPressed, emphasized: kind == .primary && !danger, focused: focused,
                pressed: configuration.isPressed, enabled: enabled, danger: danger))
            .contentShape(shape)
            .onHover { hovered = $0 }
    }
    private var quietBody: some View {
        configuration.label
            .lineLimit(1)
            .padding(.horizontal, kind == .quiet ? metric("small") : metric("gap"))
            .frame(minWidth: size == .large ? metric("control") : metric("compactControl"),
                   minHeight: size == .large ? metric("control") : metric("compactControl"))
            .foregroundStyle(foreground)
            .background(glass ? .clear : fill, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay {
                if !glass {
                    if kind == .outline && enabled && !danger { QuietSurfaceEdge(radius: radius, strong: true) }
                    else { RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(stroke, lineWidth: metric("hairline")) }
                }
            }
            .modifier(ControlGlass(active: glass, radius: radius, selected: hovered || configuration.isPressed,
                emphasized: kind == .primary && !danger, focused: focused, pressed: configuration.isPressed,
                enabled: enabled, danger: danger))
            .contentShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .onHover { hovered = $0 }
    }
}

extension ButtonStyle where Self == VznButtonStyle {
    static var vznOutline: VznButtonStyle { VznButtonStyle(kind: .outline) }
    static var vznPrimary: VznButtonStyle { VznButtonStyle(kind: .primary) }
    static var vznQuiet: VznButtonStyle { VznButtonStyle(kind: .quiet) }
}

// One inset group with a single raised selection lens. Idle segments stay clear
// instead of stacking a painted selection onto a second full glass container.
struct FilterTabs<Value: Hashable>: View {
    var label: String
    var items: [(Value, String)]
    @Binding var selection: Value
    // Accent: the selected tab reads as an active mode (soft accent), not a filter.
    var accent = false
    @Environment(\.colorScheme) private var scheme
    @State private var hoveredIndex: Int?
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    private var radius: CGFloat { metric(glass ? "chromeControlRadius" : "controlRadius") }
    var body: some View {
        HStack(spacing: glass ? metric("hairline") * 2 : metric("tight")) {
            ForEach(items.indices, id: \.self) { index in
                let item = items[index]
                let active = item.0 == selection
                Button { selection = item.0 } label: {
                    Text(item.1).font(glass ? .system(size: NSFont.systemFontSize, weight: active ? .semibold : .medium)
                                            : .vzn(accent ? "labelScale" : "smallScale", active && !accent ? .semibold : .regular))
                        .lineLimit(1).fixedSize(horizontal: true, vertical: false)
                        .padding(.horizontal, metric("gap")).frame(minHeight: glass ? metric("compactControl") - metric("tight") * 2 : metric("compactControl"))
                        .foregroundStyle(contentColor(active ? (accent && !glass ? "action-text" : "text-strong") : (accent && !glass ? "text" : "text-muted"), scheme))
                        .background(active && !glass ? contentColor(accent ? "action-soft" : "surface-raised", scheme) : .clear, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
                        .contentShape(Rectangle())
                }.buttonStyle(FilterSegmentStyle(glass: glass, selected: active, hovered: hoveredIndex == index))
                    .onHover { hoveredIndex = $0 ? index : nil }
                    .accessibilityAddTraits(active ? .isSelected : [])
            }
        }
        .padding(glass ? metric("tight") : 0)
        .background { if glass { SegmentTrack() } }
        .accessibilityElement(children: .contain).accessibilityLabel(label)
    }
}

// `.seg` track: a recessed capsule (surface-muted with an inner top shade).
private struct SegmentTrack: View {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.colorSchemeContrast) private var contrast
    var body: some View {
        Capsule().fill(contentColor("surface-muted", scheme))
            .overlay {
                Capsule().strokeBorder(contentColor(contrast == .increased ? "border-strong" : "border", scheme), lineWidth: metric("hairline"))
                    .mask(alignment: .top) { LinearGradient(colors: [.white, .clear], startPoint: .top, endPoint: .center) }
            }
            .allowsHitTesting(false).accessibilityHidden(true)
    }
}

private struct FilterSegmentStyle: ButtonStyle {
    var glass: Bool
    var selected: Bool
    var hovered: Bool
    @Environment(\.isEnabled) private var enabled
    @ViewBuilder func makeBody(configuration: Configuration) -> some View {
        if glass {
            NavigationButtonStyle(glass: true, selected: selected, hovered: hovered)
                .makeBody(configuration: configuration)
        } else { configuration.label.opacity(enabled ? (configuration.isPressed ? 0.8 : 1) : 0.5) }
    }
}

// Session model as a quiet trailing control: sparkle, provider · model.
// Readiness at the point of action. Only local Ollama models have a probe; a
// configured cloud provider reports its own failure after sending.
// Readiness at the point of action, from the store's provider discovery: local
// runtimes that answer and cloud providers with a saved key. Unknown never warns.
@MainActor func modelUnavailable(_ model: String, store: WorkbenchStore) -> Bool {
    ![.available, .unknown].contains(store.providers.availability(model))
}

// One quiet line under a feature's language row or above the chat composer (never a
// frame around the composer). Send stays enabled: the line says what will happen and
// offers the fix — switch to a model this device can run, or open the right settings.
struct ProviderNotice: View {
    @Bindable var store: WorkbenchStore
    var model: String
    /// Applies a replacement model; defaults to the active session.
    var use: ((String) -> Void)? = nil
    private var reason: String {
        switch store.providers.availability(model) {
        case .offline: store.text("modelOfflineReason")
        case .missingKey: store.text("modelMissingKeyReason")
        case .notInstalled: store.text("modelNotInstalledReason")
        default: store.text("modelUnsupportedReason")
        }
    }
    var body: some View {
        Group {
            if store.providers.empty {
                row(store.text("noProviderNotice")) {
                    open("localModels", label: "openLocalModels", primary: false)
                    open("providers", label: "openProviders", primary: true)
                }
            } else if modelUnavailable(model, store: store) {
                row(nativeModelLabel(model, store: store) + " — " + reason, tone: .warning) {
                    if let preferred = store.preferredModel, preferred != model {
                        Button(store.text("useModel") + " " + nativeModelLabel(preferred, store: store)) { (use ?? { store.setModel(store.session.id, $0) })(preferred) }
                            .buttonStyle(.vznOutline).help(preferred).accessibilityIdentifier("provider-notice-use")
                    } else if store.providers.availability(model) == .missingKey {
                        open("providers", label: "openProviders", primary: false)
                    } else {
                        open("localModels", label: "openLocalModels", primary: false)
                    }
                }
            }
        }.task { store.discoverIfNeeded() }
    }
    @Environment(\.colorScheme) private var scheme
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    // Glass (Chat-States): one quiet 12 pt line above the composer — a danger dot when
    // nothing can answer, a warning dot for an unavailable model — with text-link actions.
    private func row<Actions: View>(_ text: String, tone: StatusTone = .failed, @ViewBuilder actions: () -> Actions) -> some View {
        HStack(spacing: metric("small")) {
            StatusDot(tone: glass ? tone : .failed)
            Text(text).font(.vzn("smallScale")).foregroundStyle(glass ? contentColor("text-muted", scheme) : .secondary).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: metric("small"))
            Button(store.text("checkAgain")) { store.discoverProviders(); Task { await store.localRuntime.refresh() } }
                .modifier(NoticeLinkStyle(glass: glass)).disabled(store.discovering).accessibilityIdentifier("provider-notice-check")
            actions()
        }.accessibilityElement(children: .contain)
    }
    @ViewBuilder private func open(_ section: String, label: String, primary: Bool) -> some View {
        if glass {
            Button(store.text(label)) { NotificationCenter.default.post(name: .viezanOpenSettings, object: section) }
                .modifier(NoticeLinkStyle(glass: true, accent: true)).accessibilityIdentifier("provider-notice-open-" + section)
        } else {
            Button(store.text(label)) { NotificationCenter.default.post(name: .viezanOpenSettings, object: section) }
                .buttonStyle(primary ? .vznPrimary : .vznOutline).accessibilityIdentifier("provider-notice-open-" + section)
        }
    }
}

// A notice action in Glass reads as a text link (12 medium, accent or muted); other presets keep the quiet button.
struct NoticeLinkStyle: ViewModifier {
    var glass: Bool
    var accent = false
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        if glass {
            content.buttonStyle(.plain).font(.vzn("smallScale", .medium))
                .foregroundStyle(contentColor(accent ? "action-text" : "text-muted", scheme)).fixedSize()
        } else {
            content.buttonStyle(.vznQuiet).tint(.primary)
        }
    }
}

// Interpretation and voice input transcribe in the cloud: say so before recording when the
// chosen speech provider ("auto" = any of OpenAI, Gemini, Groq) has no key on this device.
struct SpeechProviderNotice: View {
    let store: WorkbenchStore
    var body: some View {
        if store.providers.checked && !store.providers.speechReady(store.speechProvider) {
            HStack(spacing: metric("small")) {
                StatusDot(tone: .failed)
                Text(store.text(store.speechProvider == "auto" ? "speechProviderMissing" : "speechProviderKeyMissing")).font(.vzn("smallScale")).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: metric("small"))
                Button(store.text("openProviders")) { NotificationCenter.default.post(name: .viezanOpenSettings, object: "providers") }
                    .buttonStyle(.vznOutline).accessibilityIdentifier("speech-notice-open")
            }.accessibilityElement(children: .contain)
        }
    }
}

// A task's localized status/error, with the provider's own explanation under it when one exists.
struct TaskStatusText: View {
    let store: WorkbenchStore
    let task: WorkTask
    var body: some View {
        VStack(alignment: .leading, spacing: metric("tight")) {
            Text(store.text(task.status == .failed ? (task.errorCode ?? "providerError") : task.status.rawValue)).foregroundStyle(.secondary)
            if task.status == .failed, let detail = task.errorDetail {
                Text(detail).font(.vzn("captionScale")).foregroundStyle(.secondary).textSelection(.enabled).lineLimit(3).help(detail)
            }
        }
    }
}

struct ModelBadgeLabel: View {
    var text: String
    var offline = false
    var body: some View {
        HStack(spacing: metric("small")) {
            if offline { StatusDot(tone: .failed) } else { Image(systemName: "sparkles").accessibilityHidden(true) }
            Text(text).lineLimit(1)
        }.font(.vzn("smallScale"))
    }
}

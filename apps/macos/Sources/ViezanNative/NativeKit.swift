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
    @State private var hovered = false
    private var danger: Bool { configuration.role == .destructive }
    var body: some View {
        configuration.label.lineLimit(1)
            .padding(.horizontal, circular ? 0 : metric("gap"))
            .frame(width: circular ? metric("control") : nil)
            .frame(minWidth: metric("control"), minHeight: metric("control"))
            .foregroundStyle(contentColor(!enabled ? "text-disabled" : danger ? "danger" : kind == .primary ? "action-fg" : "text-strong", scheme))
            .modifier(ControlGlass(selected: hovered || configuration.isPressed,
                                       emphasized: kind == .primary && !danger, focused: focused,
                                       pressed: configuration.isPressed, enabled: enabled, danger: danger))
            .contentShape(Capsule())
            .onHover { hovered = $0 }
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
    private var lightGlass: Bool { scheme == .light && (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    func body(content: Content) -> some View {
        content.padding(padded ? metric("inset") : 0)
            .background {
                let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
                shape.fill(selected ? contentColor("action-soft", scheme) : contentColor("surface", scheme))
                    .overlay {
                        if lightGlass && !selected && !reduceTransparency && contrast != .increased {
                            // A broad light wash sits behind the text on an
                            // opaque base; it is illumination, not extra blur.
                            shape.fill(LinearGradient(colors: [chromeColor("surface-raised", scheme), .clear],
                                                      startPoint: .topLeading, endPoint: .bottomTrailing))
                        }
                    }
            }
            .overlay {
                if selected {
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .strokeBorder(contentColor("action", scheme).opacity(metric("selectionOpacity") * 4), lineWidth: metric("hairline"))
                } else { QuietSurfaceEdge(radius: radius) }
            }
            .shadow(color: chromeColor("text-strong", scheme).opacity(
                lightGlass && contrast != .increased && !reduceTransparency ? metric("selectionOpacity") / 4 : 0),
                    radius: metric("small"), y: metric("tight"))
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
                    Divider()
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

// A labelled setting/action row. Dividers sit between rows, not around them.
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
            if divider { Divider() }
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
        Text(text).font(.vzn("labelScale")).foregroundStyle(contentColor("text-strong", scheme))
            .padding(.horizontal, metric("small") + metric("tight")).frame(minHeight: metric("compactControl"))
            .overlay(RoundedRectangle(cornerRadius: metric("controlRadius")).strokeBorder(contentColor("border", scheme), lineWidth: metric("hairline")))
            .fixedSize()
    }
}

enum StatusTone { case ready, busy, idle, failed }

struct StatusDot: View {
    @Environment(\.colorScheme) private var scheme
    var tone: StatusTone
    var body: some View {
        Circle().fill(tone == .ready ? contentColor("success", scheme) : tone == .busy ? contentColor("action", scheme) : tone == .failed ? contentColor("danger", scheme) : contentColor("text-soft", scheme))
            .frame(width: metric("small"), height: metric("small")).accessibilityHidden(true)
    }
}

// Soft accent pill for live state. The text, not only the color, carries meaning.
struct StatusBadge: View {
    var text: String
    var tone: StatusTone = .busy
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        // Accent only for live/ready state; idle reads neutral and failures read as danger.
        HStack(spacing: metric("small")) { StatusDot(tone: tone); Text(text).font(.vzn("smallScale")) }
            .foregroundStyle(contentColor(tone == .idle ? "text-muted" : tone == .failed ? "danger" : "action-text", scheme))
            .padding(.horizontal, metric("small") + metric("tight")).padding(.vertical, metric("tight"))
            .background(tone == .idle || tone == .failed ? contentColor("surface-muted", scheme) : contentColor("action-soft", scheme), in: Capsule())
            .fixedSize()
    }
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
struct WorkspaceSurface: ViewModifier {
    var compact: Bool
    @Environment(\.colorScheme) private var scheme
    private var lightGlass: Bool { scheme == .light && (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    func body(content: Content) -> some View {
        let inset = lightGlass ? metric(compact ? "gap" : "inset") : 0
        let radius = lightGlass ? metric("chromeSurfaceRadius") : 0
        content
            .environment(\.workspaceOuterInset, inset)
            .background(contentColor(lightGlass ? "canvas" : "surface", scheme))
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay {
                if lightGlass { QuietSurfaceEdge(radius: radius) }
            }
            .padding(.horizontal, inset)
            .padding(.top, lightGlass ? metric("small") : 0)
            .padding(.bottom, lightGlass ? metric("gap") : 0)
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
    private var glass: Bool { allowsGlass && (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    private var radius: CGFloat { metric((NativeTheme.shared.preferences.preset ?? "glass") == "glass" ? "chromeControlRadius" : "controlRadius") }
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
        HStack(spacing: metric("tight")) {
            ForEach(items.indices, id: \.self) { index in
                let item = items[index]
                let active = item.0 == selection
                Button { selection = item.0 } label: {
                    Text(item.1).font(.vzn(accent ? "labelScale" : "smallScale", active && (glass || !accent) ? .semibold : .regular))
                        .lineLimit(1).fixedSize(horizontal: true, vertical: false)
                        .padding(.horizontal, metric("gap")).frame(minHeight: metric("compactControl"))
                        .foregroundStyle(contentColor(active ? (accent ? "action-text" : "text-strong") : (accent ? "text" : "text-muted"), scheme))
                        .background(active && !glass ? contentColor(accent ? "action-soft" : "surface-raised", scheme) : .clear, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
                        .contentShape(Rectangle())
                }.buttonStyle(FilterSegmentStyle(glass: glass, selected: active, hovered: hoveredIndex == index))
                    .onHover { hoveredIndex = $0 ? index : nil }
                    .accessibilityAddTraits(active ? .isSelected : [])
            }
        }
        .padding(glass ? metric("tight") : 0)
        .background { if glass { InsetInputSurface(radius: radius + metric("tight")) } }
        .accessibilityElement(children: .contain).accessibilityLabel(label)
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
                row(nativeModelLabel(model, store: store) + " — " + reason) {
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
    private func row<Actions: View>(_ text: String, @ViewBuilder actions: () -> Actions) -> some View {
        HStack(spacing: metric("small")) {
            StatusDot(tone: .failed)
            Text(text).font(.vzn("smallScale")).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: metric("small"))
            Button(store.text("checkAgain")) { store.discoverProviders(); Task { await store.localRuntime.refresh() } }
                .buttonStyle(.vznQuiet).tint(.primary).disabled(store.discovering).accessibilityIdentifier("provider-notice-check")
            actions()
        }.accessibilityElement(children: .contain)
    }
    private func open(_ section: String, label: String, primary: Bool) -> some View {
        Button(store.text(label)) { NotificationCenter.default.post(name: .viezanOpenSettings, object: section) }
            .buttonStyle(primary ? .vznPrimary : .vznOutline).accessibilityIdentifier("provider-notice-open-" + section)
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

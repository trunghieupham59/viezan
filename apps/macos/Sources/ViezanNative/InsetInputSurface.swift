import SwiftUI

// Inputs keep an opaque reading surface beneath the native editor. A recessed
// rim relates them to Glass controls without blurring text or using a button's
// accent focus ring. The caret and stronger neutral edge indicate editing.
struct InsetInputSurface: View {
    var radius: CGFloat
    var focused = false
    var baseRole = "surface-subtle"
    var enabled = true
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast

    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    private var solid: Bool { reduceTransparency || contrast == .increased }
    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: radius, style: .continuous) }
    private var editing: Bool { enabled && focused }

    var body: some View {
        shape.fill(contentColor(enabled ? baseRole : "surface-subtle", scheme))
            .overlay {
                if glass && !solid && enabled {
                    // The upper inner shade and lower reflection make this an
                    // inset field, distinct from the raised action lenses.
                    shape.inset(by: metric("hairline"))
                        .strokeBorder(LinearGradient(stops: [
                            .init(color: contentColor("text-strong", scheme).opacity(metric("selectionOpacity") / 2), location: 0),
                            .init(color: .clear, location: 0.45),
                            .init(color: chromeColor("material-highlight", scheme).opacity(0.5), location: 1)
                        ], startPoint: .top, endPoint: .bottom), lineWidth: metric("hairline"))
                }
            }
            .overlay {
                if glass && !solid && !editing && enabled {
                    shape.strokeBorder(LinearGradient(stops: [
                        .init(color: contentColor("border", scheme), location: 0),
                        .init(color: chromeColor("material-border", scheme), location: 0.55),
                        .init(color: chromeColor("material-highlight", scheme), location: 1)
                    ], startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: metric("hairline"))
                } else {
                    shape.strokeBorder(contentColor(contrast == .increased ? "text-muted" : editing || solid ? "border-strong" : "border", scheme),
                                       lineWidth: metric("hairline"))
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

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
                    // `.field`: an inner shade along the top edge reads as a
                    // recess, distinct from the raised action lenses.
                    shape.inset(by: metric("hairline"))
                        .strokeBorder(contentColor("border", scheme), lineWidth: metric("hairline"))
                        .mask(alignment: .top) {
                            LinearGradient(colors: [.white, .clear], startPoint: .top, endPoint: .bottom).frame(height: metric("tight"))
                        }
                }
            }
            .overlay {
                // A hairline at rest, the stronger neutral edge while editing;
                // the caret is the main focus cue, never an accent ring.
                shape.strokeBorder(contentColor(contrast == .increased ? "text-muted" : editing || solid ? "border-strong" : "border", scheme),
                                   lineWidth: metric("hairline"))
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

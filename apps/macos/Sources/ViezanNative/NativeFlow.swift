import SwiftUI

// Wrap controls by their measured size while retaining native focus/reading order.
struct NativeFlow: Layout {
    var spacing: CGFloat
    private func arrangement(_ subviews: Subviews, width: CGFloat) -> (CGSize, [CGPoint], [CGSize]) {
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, used: CGFloat = 0
        var points: [CGPoint] = [], sizes: [CGSize] = []
        for view in subviews {
            let size = view.sizeThatFits(ProposedViewSize(width: width, height: nil))
            if x > 0 && x + size.width > width { y += rowHeight + spacing; x = 0; rowHeight = 0 }
            points.append(CGPoint(x: x, y: y)); sizes.append(size)
            used = max(used, x + size.width); rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
        }
        return (CGSize(width: used, height: y + rowHeight), points, sizes)
    }
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrangement(subviews, width: proposal.width ?? .greatestFiniteMagnitude)
        return CGSize(width: proposal.width ?? result.0.width, height: result.0.height)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrangement(subviews, width: bounds.width)
        for index in subviews.indices {
            subviews[index].place(at: CGPoint(x: bounds.minX + result.1[index].x, y: bounds.minY + result.1[index].y), anchor: .topLeading, proposal: ProposedViewSize(result.2[index]))
        }
    }
}

import SwiftUI

// Keep a text view alive for each message. Appending to its text storage retains
// the native selection instead of replacing the reading surface on every token.
struct TranscriptText: NSViewRepresentable {
    var text: String
    var font: NSFont
    var label: String
    var markdown = false
    var resetSelection: Int
    var selectionChanged: (Bool) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeNSView(context: Context) -> TranscriptTextView {
        let view = TranscriptTextView()
        view.delegate = context.coordinator
        return view
    }
    func updateNSView(_ view: TranscriptTextView, context: Context) {
        context.coordinator.parent = self
        context.coordinator.applying = true
        defer { context.coordinator.applying = false }
        view.setAccessibilityLabel(label)
        if view.selectionReset != resetSelection {
            view.selectionReset = resetSelection
            view.setSelectedRange(NSRange(location: 0, length: 0))
        }
        view.apply(text, font: font, markdown: markdown)
    }
    func sizeThatFits(_ proposal: ProposedViewSize, nsView: TranscriptTextView, context: Context) -> CGSize? {
        guard let width = proposal.width, width > 0 else { return nil }
        return CGSize(width: width, height: nsView.readingHeight(width: width))
    }
    class Coordinator: NSObject, NSTextViewDelegate {
        var parent: TranscriptText
        var applying = false
        init(_ parent: TranscriptText) { self.parent = parent }
        func textViewDidChangeSelection(_ notification: Notification) {
            guard !applying, let view = notification.object as? NSTextView else { return }
            parent.selectionChanged(view.selectedRanges.contains { $0.rangeValue.length > 0 })
        }
    }
}

final class TranscriptTextView: NSTextView {
    var selectionReset = 0
    private var source = ""
    private var rendered = false
    convenience init() {
        self.init(frame: .zero)
        isEditable = false; isSelectable = true; isRichText = true
        drawsBackground = false; focusRingType = .none
        isVerticallyResizable = true; isHorizontallyResizable = false
        textContainerInset = .zero
        textContainer?.lineFragmentPadding = 0
        textContainer?.widthTracksTextView = false
        setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    }
    func apply(_ value: String, font readingFont: NSFont, markdown: Bool = false) {
        let wantsMarkdown = markdown && !selectedRanges.contains { $0.rangeValue.length > 0 }
        if wantsMarkdown {
            if source != value || !rendered || font != readingFont { textStorage?.setAttributedString(MarkdownRendering.render(value, font: readingFont)); source = value; rendered = true; invalidateIntrinsicContentSize() }
            return
        }
        if rendered && source == value { return }
        source = value; rendered = false
        let ranges = selectedRanges.map(\.rangeValue)
        if string != value {
            let attributes: [NSAttributedString.Key: Any] = [.font: readingFont, .foregroundColor: NSColor.textColor]
            if value.hasPrefix(string) {
                textStorage?.append(NSAttributedString(string: String(value.dropFirst(string.count)), attributes: attributes))
            } else {
                textStorage?.setAttributedString(NSAttributedString(string: value, attributes: attributes))
            }
        }
        if font != readingFont { font = readingFont }
        textColor = .textColor
        let length = (value as NSString).length
        selectedRanges = ranges.map { range in
            let start = min(range.location, length)
            return NSValue(range: NSRange(location: start, length: min(range.length, length - start)))
        }
        invalidateIntrinsicContentSize()
    }
    func readingHeight(width: CGFloat) -> CGFloat {
        guard let textContainer, let layoutManager, let font else { return 0 }
        textContainer.containerSize = NSSize(width: width, height: .greatestFiniteMagnitude)
        layoutManager.ensureLayout(for: textContainer)
        return max(layoutManager.defaultLineHeight(for: font), ceil(layoutManager.usedRect(for: textContainer).height))
    }
}

struct CopyResponseButton: View {
    var text: String
    var label: String
    var copiedLabel: String
    @State private var copied = false
    var body: some View {
        Button(copied ? copiedLabel : label, systemImage: copied ? "checkmark" : "doc.on.doc") {
            NSPasteboard.general.clearContents()
            copied = NSPasteboard.general.setString(text, forType: .string)
        }.buttonStyle(.vznQuiet).disabled(text.isEmpty)
            .onChange(of: text) { _, _ in copied = false }
    }
}

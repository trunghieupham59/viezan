import SwiftUI

// Keep the native field editor in charge of marked text. Arrow/Return shortcuts
// apply only after IME composition, while focus stays in the search field.
struct HistorySearch: NSViewRepresentable {
    @Binding var query: String
    var label: String
    var move: (Int) -> Void = { _ in }
    var submit: () -> Void = {}
    var cancel: (() -> Void)? = nil
    var first: (() -> Void)? = nil
    var last: (() -> Void)? = nil
    var onTab: ((Bool) -> Void)? = nil
    var focusEpoch = 0
    // Panels focus their search on open; a persistent header field does not.
    var autofocus = true
    /// The wrapping `SearchBox` strengthens its border while the field edits.
    var onFocus: ((Bool) -> Void)? = nil

    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeNSView(context: Context) -> FocusSearchField {
        let field = FocusSearchField()
        field.delegate = context.coordinator
        field.sendsSearchStringImmediately = true
        // Bare text: the surrounding SearchBox draws the surface, border and magnifier from tokens, so
        // every search reads like the sidebar's "Tìm" field. Focus is the caret and a stronger border.
        field.focusRingType = .none
        field.isBezeled = false; field.isBordered = false; field.drawsBackground = false
        (field.cell as? NSSearchFieldCell)?.searchButtonCell = nil
        field.font = .systemFont(ofSize: NSFont.systemFontSize * metric(autofocus ? "labelScale" : "smallScale"))
        if !autofocus { field.controlSize = .large }
        field.setContentHuggingPriority(.defaultLow, for: .horizontal)
        if autofocus { field.requestInitialFocus() }
        return field
    }
    func updateNSView(_ field: FocusSearchField, context: Context) {
        context.coordinator.parent = self
        if context.coordinator.focusEpoch != focusEpoch {
            context.coordinator.focusEpoch = focusEpoch
            if focusEpoch > 0 { field.requestInitialFocus() }
        }
        field.placeholderString = label
        field.setAccessibilityLabel(label)
        if (field.currentEditor() as? NSTextView)?.hasMarkedText() != true,
           field.stringValue != query { field.stringValue = query }
    }
    // SwiftUI can create a search field before attaching its overlay to a window.
    // Keep the initial request until attachment; normal updates must not steal focus.
    class FocusSearchField: NSSearchField {
        private var pendingFocus = false
        func requestInitialFocus() {
            pendingFocus = true
            scheduleFocus()
        }
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            if pendingFocus { scheduleFocus() }
        }
        private func scheduleFocus() {
            DispatchQueue.main.async { [weak self] in
                guard let self, pendingFocus, let window else { return }
                if window.makeFirstResponder(self) { pendingFocus = false }
            }
        }
    }
    class Coordinator: NSObject, NSSearchFieldDelegate {
        var parent: HistorySearch
        var focusEpoch = 0
        init(_ parent: HistorySearch) { self.parent = parent }
        func controlTextDidChange(_ notification: Notification) {
            guard let field = notification.object as? NSSearchField else { return }
            parent.query = field.stringValue
        }
        func controlTextDidBeginEditing(_ notification: Notification) { if let onFocus = parent.onFocus { DispatchQueue.main.async { onFocus(true) } } }
        func controlTextDidEndEditing(_ notification: Notification) { if let onFocus = parent.onFocus { DispatchQueue.main.async { onFocus(false) } } }
        func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
            guard !textView.hasMarkedText() else { return false }
            switch commandSelector {
            case #selector(NSResponder.insertTab(_:)), #selector(NSResponder.insertBacktab(_:)):
                guard let onTab = parent.onTab else { return false }
                onTab(commandSelector == #selector(NSResponder.insertBacktab(_:)))
            case #selector(NSResponder.moveDown(_:)): parent.move(1)
            case #selector(NSResponder.moveUp(_:)): parent.move(-1)
            case #selector(NSResponder.insertNewline(_:)): parent.submit()
            case #selector(NSResponder.moveToBeginningOfDocument(_:)), #selector(NSResponder.scrollToBeginningOfDocument(_:)):
                guard let first = parent.first else { return false }
                first()
            case #selector(NSResponder.moveToEndOfDocument(_:)), #selector(NSResponder.scrollToEndOfDocument(_:)):
                guard let last = parent.last else { return false }
                last()
            case #selector(NSResponder.cancelOperation(_:)):
                guard let cancel = parent.cancel else { return false }
                cancel()
            default: return false
            }
            return true
        }
    }
}

// The one search field of the app: magnifier, bare text, a quiet surface with a hairline that
// strengthens on focus. Same shape as the sidebar's "Tìm" field; height is one control (or the
// compact control in a header).
struct SearchBox: View {
    @Binding var query: String
    var label: String
    var move: (Int) -> Void = { _ in }
    var submit: () -> Void = {}
    var cancel: (() -> Void)? = nil
    var first: (() -> Void)? = nil
    var last: (() -> Void)? = nil
    var onTab: ((Bool) -> Void)? = nil
    var focusEpoch = 0
    var autofocus = true
    var compact = false
    @Environment(\.colorScheme) private var scheme
    @State private var focused = false
    var body: some View {
        HStack(spacing: metric("small")) {
            Image(systemName: "magnifyingglass").imageScale(.medium).foregroundStyle(.secondary).accessibilityHidden(true)
            HistorySearch(query: $query, label: label, move: move, submit: submit, cancel: cancel, first: first, last: last, onTab: onTab, focusEpoch: focusEpoch, autofocus: autofocus, onFocus: { focused = $0 })
        }
        .padding(.horizontal, metric("gap")).frame(height: metric(compact ? "compactControl" : "control"))
        .background(contentColor("surface-subtle", scheme), in: RoundedRectangle(cornerRadius: metric("controlRadius")))
        .overlay(RoundedRectangle(cornerRadius: metric("controlRadius")).strokeBorder(contentColor(focused ? "border-strong" : "border", scheme), lineWidth: metric("hairline")))
    }
}

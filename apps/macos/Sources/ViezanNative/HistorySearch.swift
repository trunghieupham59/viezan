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

    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeNSView(context: Context) -> FocusSearchField {
        let field = FocusSearchField()
        field.delegate = context.coordinator
        field.sendsSearchStringImmediately = true
        field.focusRingType = .exterior
        field.setContentHuggingPriority(.defaultLow, for: .horizontal)
        field.requestInitialFocus()
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

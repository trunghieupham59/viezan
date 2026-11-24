import AppKit
import Testing
@testable import ViezanDomain
@testable import ViezanNative

@MainActor
struct FanControlAccessibilityTests {
    @Test func escapeUnwindsTheNameBeforeThePopoverAndRespectsMarkedText() {
        let editor = NSTextView()
        editor.setMarkedText("に", selectedRange: NSRange(location: 1, length: 0),
                             replacementRange: NSRange(location: NSNotFound, length: 0))
        #expect(FanEditorKeyboard.isComposing(editor))
        #expect(FanEditorKeyboard.escape(naming: true, responder: editor) == .composition)
        editor.unmarkText()
        #expect(!FanEditorKeyboard.isComposing(editor))
        #expect(FanEditorKeyboard.escape(naming: true, responder: editor) == .name)
        #expect(FanEditorKeyboard.escape(naming: false, responder: nil) == .popover)
    }

    @Test func returnsFocusToKeyboardAndAssistiveOpeners() {
        #expect(FanEditorKeyboard.returnsFocus(after: .keyDown))
        #expect(FanEditorKeyboard.returnsFocus(after: nil))
        #expect(!FanEditorKeyboard.returnsFocus(after: .leftMouseDown))
        #expect(!FanEditorKeyboard.returnsFocus(after: .leftMouseUp))
    }

    @Test func sliderNamesTheFanAndDistinguishesThreeValuesInEachLocale() {
        let cases = [
            ("vi", "Tốc độ mục tiêu · A", ["Hiện tại 1500 RPM", "Đang chọn 1500 RPM", "Mục tiêu 1500 RPM"]),
            ("en", "Target speed · A", ["Current 1500 RPM", "Selected 1500 RPM", "Target 1500 RPM"]),
            ("ja", "目標速度・A", ["現在：1500RPM", "選択中：1500RPM", "目標：1500RPM"])
        ]
        let values: [FanSliderValue] = [.current(1500), .selected(1500), .target(1500)]
        for (locale, label, expected) in cases {
            func text(_ key: String) -> String { NativeResources.shared.text(key, locale: locale) }
            #expect(text("fanSliderLabel").replacingOccurrences(of: "{fan}", with: "A") == label)
            #expect(values.map { $0.accessibilityValue(text) } == expected)
        }
    }

    @Test func onlyTheOwningConfirmedRestoreReportsSuccess() throws {
        var announcements = 0
        let restored = Data(#"{"restored":true}"#.utf8)
        try ThermalMonitor.confirmRestore(restored, isCurrent: false) { announcements += 1 }
        for response in [#"{"restored":false}"#, "{}", "invalid"] {
            #expect(throws: (any Error).self) {
                try ThermalMonitor.confirmRestore(Data(response.utf8), isCurrent: true) { announcements += 1 }
            }
        }
        #expect(announcements == 0)
        try ThermalMonitor.confirmRestore(restored, isCurrent: true) { announcements += 1 }
        #expect(announcements == 1)
    }
}

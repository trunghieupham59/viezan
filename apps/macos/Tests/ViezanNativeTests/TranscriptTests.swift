import AppKit
import Testing
@testable import ViezanNative

@Test @MainActor func streamedAppendKeepsNativeUnicodeSelection() {
    _ = NSApplication.shared
    let view = TranscriptTextView()
    let font = NSFont.preferredFont(forTextStyle: .body)
    let initial = "Tiếng Việt・日本語・👩🏽‍💻"
    view.apply(initial, font: font)
    let selected = (initial as NSString).range(of: "日本語・👩🏽‍💻")
    view.setSelectedRange(selected)
    view.apply(initial + "\nNew response text", font: font)
    #expect(view.string == initial + "\nNew response text")
    #expect(view.selectedRange() == selected)
    #expect((view.string as NSString).substring(with: view.selectedRange()) == "日本語・👩🏽‍💻")
}

@Test @MainActor func retryShorteningClampsSelectionAndFontChangeKeepsIt() {
    _ = NSApplication.shared
    let view = TranscriptTextView()
    let font = NSFont.preferredFont(forTextStyle: .body)
    view.apply("Previous long answer", font: font)
    view.setSelectedRange(NSRange(location: 9, length: 10))
    view.apply("New", font: font)
    #expect(view.selectedRange() == NSRange(location: 3, length: 0))
    view.setSelectedRange(NSRange(location: 0, length: 3))
    view.apply("New", font: NSFont.preferredFont(forTextStyle: .headline))
    #expect(view.selectedRange() == NSRange(location: 0, length: 3))
}

@Test @MainActor func transcriptWrapsToItsContainerWithoutNestedScrolling() {
    _ = NSApplication.shared
    let view = TranscriptTextView()
    view.apply(String(repeating: "A paragraph of readable content. ", count: 20), font: .preferredFont(forTextStyle: .body))
    let narrow = view.readingHeight(width: 240)
    let wide = view.readingHeight(width: 720)
    #expect(narrow > wide)
    #expect(!view.isEditable)
    #expect(view.isSelectable)
    #expect(!view.isHorizontallyResizable)
}

@Test @MainActor func shellResizingNeverChangesPreferenceAndPanelsStayBounded() {
    for width in [640.0, 820, 1200, 1440] {
        for collapsed in [false, true] {
            let layout = ShellLayout(width: width, height: 480, collapsed: collapsed)
            #expect(layout.navigationWidth == metric(width < 900 || collapsed ? "rail" : "sidebar"))
            #expect(layout.panelWidth <= width - metric("inset") * 2)
            #expect(layout.panelHeight <= 480 - metric("inset") * 2)
            #expect(layout.collapsed == collapsed)
        }
    }
}

@Test @MainActor func shellOverlaysAreExclusiveAndToggleRestoresFocusRequest() {
    let shell = ShellPresentation()
    shell.show(.history)
    shell.show(.commands)
    #expect(shell.overlay == .commands)
    shell.show(.commands)
    #expect(shell.overlay == nil)
    #expect(shell.focusEpochs["commands"] == 1)
}

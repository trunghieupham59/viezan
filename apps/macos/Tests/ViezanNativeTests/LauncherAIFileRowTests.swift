import Testing
@testable import ViezanNative

struct LauncherAIFileRowTests {
    @Test func onlyOffersExplicitSearchForPlainTextWithUtilitiesEnabled() {
        for input in ["", "  abc  ", "2 + 2", "100 USD", "t budget", "D budget", "?ghi chú", "????", "=abc"] {
            #expect(!LauncherAIFileRow.visible(input, locale: "en", utilities: true), "\(input)")
        }
        #expect(!LauncherAIFileRow.visible("budget", locale: "en", utilities: false))
        #expect(LauncherAIFileRow.visible("  見積書類 ", locale: "ja", utilities: true))
    }
}

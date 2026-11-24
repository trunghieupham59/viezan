import Testing
import ViezanDomain
@testable import ViezanNative

@Suite struct ScreenQuickTranslateTests {
    @Test func generatedLocalesIncludeScreenTranslation() throws {
        for locale in ["vi", "en", "ja"] {
            let strings = try #require(NativeResources.shared.locales[locale])
            for key in ["translateScreen", "shortcutDetail_translateScreen", "quickNoText", "quickNeedsScreenRecording", "screenPermissionHint"] {
                #expect(strings[key]?.isEmpty == false, "\(locale): \(key)")
            }
        }
    }

    @Test @MainActor func screenStatusWidthsMatchTheirSelectionCounterparts() {
        #expect(QuickTranslateView.width(.noText) == QuickTranslateView.width(.noSelection))
        #expect(QuickTranslateView.width(.needsScreenAccess) == QuickTranslateView.width(.needsAccess))
    }

    @Test @MainActor func announcesScreenOutcomesWithTheVisibleText() {
        let model = QuickTranslate.Model()
        let text: (String) -> String = { NativeResources.shared.text($0, locale: "ja") }
        model.source = ""
        model.phase = .needsScreenAccess
        #expect(model.screenAnnouncement(text) == text("quickNeedsScreenRecording"))
        model.phase = .failed("captureError", nil)
        #expect(model.screenAnnouncement(text) == [text("quickFailed"), text("captureError")].joined(separator: " "))
        model.phase = .noText
        #expect(model.screenAnnouncement(text) == text("quickNoText"))

        model.source = "Hello"; model.language = "ja"
        model.phase = .translating("ja")
        #expect(model.screenAnnouncement(text) == nil)
        model.phase = .failed("providerError", "Offline")
        #expect(model.screenAnnouncement(text) == [text("quickFailed"), text("providerError"), "Offline"].joined(separator: " "))
        model.phase = .result("こんにちは", paste: false)
        #expect(model.screenAnnouncement(text) == text("quickResultTitle").replacingOccurrences(of: "{lang}", with: text("lang_ja")))
        model.source = nil
        #expect(model.screenAnnouncement(text) == nil)
    }
}

import Testing
import ViezanDomain
@testable import ViezanNative

@Suite struct PinAsNoteTests {
    @Test func detailUsesLocalizedSourceAndTarget() {
        let detail = QuickTranslate.noteDetail(source: "vi", target: "ja") { NativeResources.shared.text($0, locale: "en") }
        #expect(detail == "Vietnamese → Japanese")
    }

    @Test func detailUsesOnlyTheTargetWhenTheSourceIsUnknown() {
        let detail = QuickTranslate.noteDetail(source: "auto", target: "vi") { NativeResources.shared.text($0, locale: "ja") }
        #expect(detail == "ベトナム語")
    }

    @Test func generatedLocalesNameThePinAction() {
        for (locale, label) in [("vi", "Ghim thành ghi chú"), ("en", "Pin as note"), ("ja", "メモにピン留めする")] {
            #expect(NativeResources.shared.locales[locale]?["pinAsNote"] == label)
        }
    }
}

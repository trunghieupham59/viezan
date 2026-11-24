import Testing
import ViezanDomain

@Suite struct LauncherControlsTests {
    @Test func matchesNamesKeywordsAndWordPrefixes() {
        let name = "Ngăn máy ngủ", keywords = "ngăn ngủ, thức, màn hình, caffeine, sleep, awake"
        for query in ["ng", "ngan ngu", "caff", "may", "  HINH\n"] {
            #expect(LauncherControls.matches(query, name: name, keywords: keywords))
        }
        for query in ["", " n ", "xyz", "affe"] {
            #expect(!LauncherControls.matches(query, name: name, keywords: keywords))
        }
        #expect(LauncherControls.matches("tat tieng", name: "Tắt tiếng", keywords: ""))
        #expect(LauncherControls.matches("dien", name: "ĐIỆN", keywords: ""))
        #expect(LauncherControls.matches("lamp", name: "Desk-lamp", keywords: ""))
        #expect(LauncherControls.matches("スリ", name: "画面", keywords: "カフェイン,スリープ"))
    }

    @Test func onlyPlainQueriesOfferControlsInLauncherOrder() {
        // Even a localized keyword identical to a reserved query must not claim it.
        let text: (String) -> String = { _ in "common, t mute, d mute, ?mute, ??, =mute, 2+2" }
        for query in ["", " ", "t mute", "D mute", "?mute", "??", "=mute", "2+2"] {
            #expect(LauncherControls.rows(query, text: text).isEmpty)
        }
        #expect(LauncherControls.rows("com", text: text).map(\.id) == ["awake", "mute", "dark"])
    }

    @Test func rowsUseOnlyTheCurrentLocale() {
        let vi: (String) -> String = { NativeResources.shared.text($0, locale: "vi") }
        let ja: (String) -> String = { NativeResources.shared.text($0, locale: "ja") }
        #expect(LauncherControls.rows("may", text: vi) == [.awake])
        #expect(LauncherControls.rows("loa", text: vi) == [.mute])
        #expect(LauncherControls.rows("loa", text: ja).isEmpty)
        #expect(LauncherControls.rows("スリ", text: ja) == [.awake])
    }

    @Test func generatedLocalesIncludeSystemControls() throws {
        for locale in ["vi", "en", "ja"] {
            let strings = try #require(NativeResources.shared.locales[locale])
            for key in ["groupSystem", "unavailable", "launcher_control_awake", "launcher_control_awake_detail",
                        "launcher_control_awake_keywords", "launcher_control_mute", "launcher_control_mute_unsupported",
                        "launcher_control_mute_keywords", "launcher_control_on", "launcher_control_off",
                        "launcher_control_dark", "launcher_control_dark_keywords", "launcher_control_dark_denied",
                        "launcher_control_turn_on", "launcher_control_turn_off", "launcher_control_failed"] {
                #expect(strings[key]?.isEmpty == false, "\(locale): \(key)")
            }
            for key in ["launcher_control_announced_on", "launcher_control_announced_off"] {
                #expect(strings[key]?.contains("{name}") == true, "\(locale): \(key)")
            }
        }
    }

    @Test func darkModeFollowsMuteAndMatchesLocalizedSearch() {
        #expect(LauncherControls.allCases.map(\.id) == ["awake", "mute", "dark"])
        let vi: (String) -> String = { NativeResources.shared.text($0, locale: "vi") }
        for query in ["dark", "che do toi", "toi"] {
            #expect(LauncherControls.rows(query, text: vi).map(\.id) == ["dark"])
        }
    }
}

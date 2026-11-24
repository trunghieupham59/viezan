import AppKit
import Testing
import ViezanDomain
@testable import ViezanNative

extension AppKitFixtureTests {
    @Suite @MainActor struct ShellControlTests {
        private func button(_ identifier: String) -> NSButton {
            let button = NSButton(title: identifier, target: nil, action: nil)
            button.setAccessibilityIdentifier(identifier)
            return button
        }
        @Test func historyEmptyMessageFollowsSearchAndArchiveFilter() {
            #expect(HistoryEmptyMessage.keys(query: "", archived: false) == ("historyEmpty", nil))
            #expect(HistoryEmptyMessage.keys(query: "  ", archived: true) == ("historyArchivedEmpty", nil))
            let search = HistoryEmptyMessage.keys(query: "abc", archived: true)
            #expect(search.title == "noHistory" && search.hint == "historyNoMatchesHint")
            for key in ["historyEmpty", "historyArchivedEmpty", "historyNoMatchesHint", "historyRenameHint", "historyRenamed"] {
                for locale in ["vi", "en", "ja"] { #expect(NativeResources.shared.text(key, locale: locale) != key) }
            }
        }
        // Confirmations name what they delete; the device line is a sentence part per language.
        @Test func namedConfirmationsAndDeviceLineKeepTheirPlaceholders() {
            for locale in ["vi", "en", "ja"] {
                for (key, placeholder) in [("deleteNamedKeyConfirm", "{name}"), ("deleteNamedModelConfirm", "{name}"), ("deviceProcessors", "{count}"), ("deviceMemory", "{size}"), ("localModelMeasured", "{rate}"), ("researchingElapsed", "{time}"), ("pinModelNamed", "{name}")] {
                    #expect(NativeResources.shared.text(key, locale: locale).contains(placeholder), "\(key) \(locale)")
                }
            }
        }
        @Test func launcherPrefixRowsFollowTheQueryAndModules() {
            let on: (String) -> Bool = { _ in true }
            #expect(LauncherPrefix.row("t hello", enabled: on) == .init(query: .translate("hello"), title: "paletteTranslate", text: "hello", symbol: "character.bubble"))
            #expect(LauncherPrefix.row("d serendipity", enabled: on)?.title == "paletteLookup")
            #expect(LauncherPrefix.row("? why", enabled: { _ in false })?.query == .ask("why"))
            // A module that is off, a calculation, plain text and a bare prefix give no row.
            #expect(LauncherPrefix.row("t hello", enabled: { $0 != "translate" }) == nil)
            #expect(LauncherPrefix.row("d word", enabled: { $0 != "dictionary" }) == nil)
            #expect(LauncherPrefix.row("2+2", enabled: on) == nil)
            #expect(LauncherPrefix.row("terminal", enabled: on) == nil)
            #expect(LauncherPrefix.row("t ", enabled: on) == nil)
        }
        @Test func updateSummaryNamesVersionSizeAndCurrent() {
            let vi: (String) -> String = { NativeResources.shared.text($0, locale: "vi") }
            let sized = UpdateSummary.text(version: "2.6.0", size: 48_000_000, current: "2.5.2", text: vi)
            #expect(sized.contains("2.6.0") && sized.contains("2.5.2") && sized.contains("MB") && !sized.contains("{"))
            let unsized = UpdateSummary.text(version: "2.6.0", size: nil, current: "2.5.2", text: vi)
            #expect(unsized == UpdateSummary.text(version: "2.6.0", size: 0, current: "2.5.2", text: vi) && !unsized.contains("MB") && !unsized.contains("{"))
        }
        @Test func thermalHelperToneWarnsOnlyWhileWaitingForApproval() {
            #expect(ThermalStatus.helperTone("helperEnabled") == .ready)
            #expect(ThermalStatus.helperTone("helperApproval") == .warning)
            #expect(ThermalStatus.helperTone("helperUnavailable") == .idle)
            #expect(ThermalStatus.helperTone("") == .idle)
            #expect(ThermalStatus.canRetry(error: "thermalReadError", monitoring: false))
            #expect(!ThermalStatus.canRetry(error: "thermalReadError", monitoring: true))
            #expect(!ThermalStatus.canRetry(error: "fanCommandError", monitoring: false))
            #expect(ThermalStatus.isReaderError("thermalReaderMissing") && !ThermalStatus.isReaderError("fanProfileSaveError"))
            #expect(ThermalStatus.waiting(monitoring: true, hasSnapshot: false, hasError: false))
            #expect(!ThermalStatus.waiting(monitoring: false, hasSnapshot: false, hasError: false))
            #expect(!ThermalStatus.waiting(monitoring: true, hasSnapshot: true, hasError: false))
            #expect(!ThermalStatus.waiting(monitoring: true, hasSnapshot: false, hasError: true))
        }
        @Test func helperWaitingForApprovalIsNotAFanError() {
            #expect(ThermalMonitor.registrationError(status: "helperApproval") == nil)
            #expect(ThermalMonitor.registrationError(status: "helperEnabled") == nil)
            #expect(ThermalMonitor.registrationError(status: "helperUnavailable") == "helperRegisterError")
            #expect(ThermalMonitor.errorAfterHelperChange("helperRegisterError", from: "helperApproval", to: "helperEnabled") == nil)
            #expect(ThermalMonitor.errorAfterHelperChange("fanProfileSaveError", from: "helperApproval", to: "helperEnabled") == "fanProfileSaveError")
            #expect(ThermalMonitor.errorAfterHelperChange("fanCommandError", from: "helperEnabled", to: "helperEnabled") == "fanCommandError")
            #expect(ThermalMonitor.errorAfterHelperChange("fanCommandError", from: "helperUnavailable", to: "helperApproval") == "fanCommandError")
            #expect(ThermalMonitor.errorAfterHelperChange("thermalReadError", from: "helperApproval", to: "helperEnabled") == "thermalReadError")
        }
        @Test func everyFanErrorHasItsOwnSentenceInEachLanguage() {
            let keys = ["fanCommandError", "fanProfileApplyError", "fanProfileSaveError", "fanCalibrationError", "helperRegisterError", "helperUnregisterError"]
            for locale in ["vi", "en", "ja"] {
                let texts = keys.map { NativeResources.shared.text($0, locale: locale) }
                #expect(Set(texts).count == keys.count && zip(keys, texts).allSatisfy { $0 != $1 && !$1.isEmpty })
            }
        }
        @Test func activityTitleCountsJobsOnlyWhenThereAreSome() {
            for locale in ["vi", "en", "ja"] {
                let t: (String) -> String = { NativeResources.shared.text($0, locale: locale) }
                #expect(ActivityTitle.text(jobs: 0, text: t) == t("activity"))
                let busy = ActivityTitle.text(jobs: 3, text: t)
                #expect(busy.contains("3") && !busy.contains("{") && busy != t("activity"))
                #expect(t("recordingDraftHint") != "recordingDraftHint")
            }
        }
        @Test func useAsSourceNeverTranslatesALanguageIntoItself() {
            let languages = ["vi", "en", "ja"]
            #expect(TranslateSwap.target(source: "en", target: "vi", locale: "vi", languages: languages) == "en")
            #expect(TranslateSwap.target(source: "auto", target: "en", locale: "vi", languages: languages) == "vi")
            // Automatic → Vietnamese with a Vietnamese interface used to give vi → vi.
            #expect(TranslateSwap.target(source: "auto", target: "vi", locale: "vi", languages: languages) == "en")
            #expect(TranslateSwap.target(source: "auto", target: "en", locale: "en", languages: languages) == "vi")
            for locale in languages { #expect(NativeResources.shared.text("usedAsSource", locale: locale) != "usedAsSource") }
        }
        @Test func researchClockReadsMinutesAndClampsBadInput() {
            #expect(ResearchPanel.elapsed(0) == "0:00")
            #expect(ResearchPanel.elapsed(102.9) == "1:42")
            #expect(ResearchPanel.elapsed(3725) == "1:02:05")
            #expect(ResearchPanel.elapsed(-5) == "0:00")
            #expect(ResearchPanel.elapsed(.infinity) == "0:00")
            #expect(ResearchPanel.elapsed(.nan) == "0:00")
        }
        // The Model and "+" menu commands press the control on screen: nested, visible and enabled only.
        @Test func menuCommandFindsOnlyAVisibleEnabledControl() {
            let root = NSView(), composer = NSView(), retired = NSView()
            let model = button("model-toggle"), tools = button("tools-toggle"), hiddenModel = button("model-toggle")
            retired.isHidden = true
            retired.addSubview(hiddenModel); composer.addSubview(tools); composer.addSubview(model)
            root.addSubview(retired); root.addSubview(composer)
            #expect(shellControl("model-toggle", in: root) === model)
            #expect(shellControl("tools-toggle", in: root) === tools)
            #expect(shellControl("history-toggle", in: root) == nil)
            #expect(shellControl("model-toggle", in: nil) == nil)
            // A busy composer disables "+": the command does nothing instead of pressing it.
            tools.isEnabled = false
            #expect(shellControl("tools-toggle", in: root) == nil)
        }
    }
}

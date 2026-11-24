import Foundation
import Testing
@testable import ViezanDomain
@testable import ViezanNative

struct FanControlReviewTests {
    private func mode(_ id: String? = nil, controlling: Bool = false, held: Bool = false,
                      calibrating: Bool = false, manualPending: Bool = false) -> FanControlMode {
        FanControlMode(profileID: id, controlling: controlling, hasTargets: held,
                       calibrating: calibrating, manualPending: manualPending)
    }

    private func vi(_ key: String) -> String { NativeResources.shared.text(key, locale: "vi") }

    @Test func menuRequiresConfirmationAndAnEnabledFanService() {
        func applies(_ confirmed: Bool, _ helper: String, monitoring: Bool = true, calibrating: Bool = false) -> Bool {
            FanControlDisplay.canApplyFromMenu(confirmed: confirmed, helper: helper, monitoring: monitoring, calibrating: calibrating)
        }
        #expect(!applies(false, "helperEnabled"))
        #expect(!applies(true, "helperApproval"))
        #expect(!applies(true, "helperUnavailable"))
        #expect(!applies(true, "helperEnabled", monitoring: false))
        #expect(!applies(true, "helperEnabled", calibrating: true))
        #expect(applies(true, "helperEnabled"))
    }

    @Test func leavingOnlyStopsAnIdleReaderStartedByThisPage() {
        #expect(mode().shouldStopOnDisappear(startedHere: true))
        #expect(!mode().shouldStopOnDisappear(startedHere: false))
        for state in [mode("quiet"), mode("custom", controlling: true), mode(controlling: true, held: true),
                      mode(calibrating: true), mode(manualPending: true)] {
            #expect(!state.shouldStopOnDisappear(startedHere: true))
            #expect(!state.shouldStopOnDisappear(startedHere: false))
        }
    }

    @Test func cardAndEditorIdentifyCalibrationAndUnconfirmedRequests() {
        for (state, key) in [(mode(calibrating: true), "fanCalibrating"), (mode("quiet"), "fanApplying"),
                             (mode("custom"), "fanApplying"), (mode(manualPending: true), "fanApplying")] {
            #expect(state.label(profiles: FanProfile.builtins, text: vi) == vi(key))
            #expect(state.ruleStatus(profiles: FanProfile.builtins, text: vi) == vi(key))
            #expect(state.canRestore)
        }
        let active = mode("quiet", controlling: true)
        #expect(active.label(profiles: FanProfile.builtins, text: vi) == vi("fanQuiet"))
        #expect(active.ruleStatus(profiles: FanProfile.builtins, text: vi).contains(vi("fanQuiet")))
        #expect(active.canRestore)
        #expect(!mode().canRestore)
        #expect(mode().ruleStatus(profiles: [], text: vi) == vi("fanRuleNotApplied"))
    }

    @Test func draftsFollowTheFanAndAreDiscardedOnReleaseOrModeChange() {
        let manual = mode(controlling: true, held: true)
        let held = FanSliderContext(mode: manual, held: 2500, rules: nil)
        let released = FanSliderContext(mode: manual, held: nil, rules: nil) // A second fan is still held.
        #expect(held.retainedDraft(3000, from: held) == 3000)
        #expect(released.retainedDraft(3000, from: held) == nil)
        #expect(FanSliderValue.resolve(current: 1900, held: 2500, draft: 2500) == .target(2500))
        let idle = FanSliderContext(mode: mode(), held: nil, rules: nil)
        for newMode in [mode("quiet"), mode("custom", controlling: true), mode(calibrating: true)] {
            let changed = FanSliderContext(mode: newMode, held: nil, rules: nil)
            #expect(changed.retainedDraft(3000, from: idle) == nil)
        }
        let custom = mode("custom", controlling: true)
        let original = FanSliderContext(mode: custom, held: nil, rules: ["*": FanRule(sensor: "cpu")])
        let edited = FanSliderContext(mode: custom, held: nil, rules: ["*": FanRule(sensor: "gpu")])
        #expect(edited.retainedDraft(3000, from: original) == nil)
    }

    @Test func manualControlsExplainCalibrationAndStoppedMonitoring() {
        #expect(FanControlDisplay.manualBlock(calibrating: true, monitoring: true) == "fanRuleCalibrating")
        #expect(FanControlDisplay.manualBlock(calibrating: false, monitoring: false) == "sensorsEmptyHint")
        #expect(FanControlDisplay.manualBlock(calibrating: false, monitoring: true) == nil)
    }

    @Test func previewLabelsTheEstimateOnceInEachLanguage() {
        let reading = FanPolicy.Reading(celsius: 55.7, rpm: 2450)
        for (locale, expected) in [("vi", "Dự kiến: 56 °C → 2.450 RPM"),
                                   ("en", "Expected: 56 °C → 2,450 RPM"), ("ja", "予測：56 °C → 2,450 RPM")] {
            let line = FanRulePreview.line(reading, fan: nil, locale: Locale(identifier: locale)) {
                NativeResources.shared.text($0, locale: locale)
            }
            #expect(line == expected)
        }
    }

    @Test func missingSourceBlocksApplyUntilItReturns() {
        let fan = ThermalSnapshot.Fan(index: 2, rpm: 1500, min: 1000, max: 6000, target: nil, name: nil)
        let sensor = ThermalSnapshot.Sensor(key: "hid:NAND", celsius: 56, source: "hid")
        func preview(_ rule: FanRule, _ sensors: [ThermalSnapshot.Sensor], monitoring: Bool = true) -> FanRulePreview {
            FanRulePreview(rule: rule, snapshot: .init(ok: true, sensors: sensors, fans: [fan], model: nil),
                           affinity: [:], helper: "helperEnabled", calibrating: false, monitoring: monitoring)
        }
        let rule = FanRule(sensor: sensor.key)
        let missing = preview(rule, [.init(key: "Tp01", celsius: 50)])
        #expect(missing.readings.isEmpty && missing.block == "fanRuleSensorMissing")
        let available = preview(rule, [sensor])
        #expect(available.readings[2]?.celsius == 56 && available.block == nil)
        #expect(preview(rule, [], monitoring: false).block == "sensorsEmptyHint")
        #expect(preview(.init(lower: 75, upper: 45), []).block == nil) // The threshold field owns this error.
    }

    @MainActor @Test func savingADraftReportsTheWriteResultAtThePointOfSave() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let monitor = ThermalMonitor(preferences: directory.appendingPathComponent("profiles.json"))
        let name = "Bàn làm việc"
        let rules = ["*": FanRule(sensor: "cpu")]
        try Data().write(to: directory) // Obstruct the write, then retry the same draft.
        let failed = monitor.saveProfile(name: name, rules: rules)
        #expect(FanProfileSaveFeedback(savedID: failed, name: name, text: vi) == .fieldError("fanProfileSaveError"))
        try FileManager.default.removeItem(at: directory)
        let saved = monitor.saveProfile(name: name, rules: rules)
        #expect(FanProfileSaveFeedback(savedID: saved, name: name, text: vi) == .saved("Đã lưu Bàn làm việc"))
        let profile = try #require(monitor.profiles.first { $0.id == saved })
        let fan = ThermalSnapshot.Fan(index: 0, rpm: 1500, min: 1000, max: 6000, target: nil, name: nil)
        let otherRules = ["*": FanRule(sensor: "gpu")]
        var running = try #require(RunningFanPolicy(id: "custom", rules: otherRules, monitoring: true, calibrating: false, fans: [fan]))
        running.adoptSavedProfile(profile)
        #expect(running.id == "custom" && running.rules == otherRules)
    }
}

import Foundation
import Testing
@testable import ViezanDomain
@testable import ViezanNative

struct FanControlDisplayTests {
    private func vi(_ key: String) -> String { NativeResources.shared.text(key, locale: "vi") }

    @Test func editorReopensWithTheRunningRuleOrTheAutomaticDefaults() {
        let active = FanRule(sensor: "hid:short", lower: 52, upper: 84)
        #expect(FanControlDisplay.initialRule(["*": active]) == active)
        #expect(FanControlDisplay.initialRule(nil) == FanRule(sensor: "all", lower: 45, upper: 75))
        #expect(FanControlDisplay.initialRule(["2": active, "10": FanRule()]) == active)
    }

    @Test func sourceNamesMatchThePickerEvenWhenASensorDisappears() {
        let hid = ThermalSnapshot.Sensor(key: "hid:short", celsius: 56, name: "NAND CH0 temp", source: "hid")
        func name(_ source: String) -> String {
            FanControlDisplay.sourceName(source, sensors: [hid, .init(key: "TB0T", celsius: 43)], text: vi)
        }
        #expect(name("all") == "Cảm biến nóng nhất")
        #expect(name("cpu") == "CPU")
        #expect(name("gpu") == "GPU")
        #expect(name("affinity") == "Cảm biến đã hiệu chuẩn")
        #expect(name("hid:short") == "Ổ lưu trữ · NAND CH0 temp")
        #expect(name("TB0T") == "Pin · TB0T")
        #expect(name("hid:gone") == "hid:gone")
    }

    @Test func summaryUsesTheLocaleAndPreservesStoredThresholds() {
        let rule = FanRule(sensor: "cpu", lower: 43.5, upper: 78)
        for (locale, expected) in [("vi", "CPU · 43.5–78 °C"), ("en", "CPU · 43.5–78 °C"), ("ja", "CPU・43.5〜78°C")] {
            let summary = FanControlDisplay.summary(rule, sensors: []) { NativeResources.shared.text($0, locale: locale) }
            #expect(summary == expected)
        }
        #expect(FanControlDisplay.reading(.init(celsius: 55.6, rpm: 2450), text: vi) == "Hiện 56 °C → 2450 RPM")
        #expect(FanControlDisplay.reading(nil, text: vi) == vi("thermal_fan_sensor_missing"))
    }

    @Test func modeNamesDistinguishAllFourStatesAndKeepUserNamesLiteral() {
        let saved = FanProfile(name: "fanQuiet", rules: ["*": .init()])
        func mode(_ id: String?, manual: Bool = false) -> String {
            FanControlDisplay.modeName(profileID: id, profiles: FanProfile.builtins + [saved], manual: manual, text: vi)
        }
        #expect(mode(nil) == "Hệ thống đang điều khiển")
        #expect(mode(nil, manual: true) == "Thủ công")
        #expect(mode("custom") == "Tuỳ chỉnh")
        #expect(mode("quiet") == "Yên tĩnh")
        #expect(mode(saved.id) == "fanQuiet")
    }

    @Test func applyExplainsHelperCalibrationAndMissingFanData() {
        let fan = ThermalSnapshot.Fan(index: 0, rpm: 1529, min: 1000, max: 6000, target: 3367, name: nil)
        let noRange = ThermalSnapshot.Fan(index: 1, rpm: 0, min: nil, max: nil, target: nil, name: nil)
        func blocked(_ helper: String = "helperEnabled", calibrating: Bool = false, monitoring: Bool = true,
                     fans: [ThermalSnapshot.Fan] = []) -> String? {
            FanControlDisplay.applyBlock(helper: helper, calibrating: calibrating, monitoring: monitoring, fans: fans)
        }
        #expect(blocked("helperApproval", fans: [fan]) == "fanRuleNeedHelper")
        #expect(blocked(calibrating: true, fans: [fan]) == "fanRuleCalibrating")
        #expect(blocked(monitoring: false, fans: [fan]) == "sensorsEmptyHint")
        #expect(blocked() == "fanRuleNeedFanData")
        #expect(blocked(fans: [fan, noRange]) == "fanRuleNeedFanData")
        #expect(blocked(fans: [fan]) == nil)
    }

    @Test func thresholdAndNameErrorsBelongToTheirOwnFields() {
        #expect(FanControlDisplay.temperatureError(.init(lower: 50, upper: 50)) == "fanRuleTempOrderError")
        #expect(FanControlDisplay.temperatureError(.init(lower: 51, upper: 50)) == "fanRuleTempOrderError")
        #expect(FanControlDisplay.temperatureError(.init(lower: 49, upper: 50)) == nil)
        #expect(FanControlDisplay.saveBlock(name: "  \n ", count: 0) == "fanRuleNameRequired")
        #expect(FanControlDisplay.saveBlock(name: String(repeating: "a", count: 101), count: 0) == "fanRuleNameLimit")
        #expect(FanControlDisplay.saveBlock(name: "A", count: 50) == "fanProfileLimit")
        #expect(FanControlDisplay.saveBlock(name: "夜", count: 49) == nil)
    }

    @Test func sliderTracksReadingsUntilEditedAndThenTracksConfirmedTargets() {
        let range = 1000.0...6000.0
        func slider(_ rpm: Double, held: Double? = nil, draft: Double? = nil) -> FanSliderValue {
            FanSliderValue.resolve(current: rpm, held: held, draft: draft)
        }
        let idle = slider(1529)
        #expect(idle.position(in: range) == 1529 && idle.label(vi) == "1529 RPM")
        #expect(!idle.canApply(held: nil, in: range))
        #expect(slider(1617) == .current(1617))
        #expect(slider(0).position(in: range) == 1000 && slider(0).label(vi) == "0 RPM")

        let draft = slider(1529, draft: 3350)
        #expect(slider(1617, draft: 3350) == draft && draft.label(vi) == "Đang chọn 3350 RPM")
        #expect(draft.canApply(held: nil, in: range))
        #expect(!draft.canApply(held: 3350, in: range))
        #expect(slider(1700, held: 3350, draft: 3500) == .selected(3500))

        let held = slider(1620, held: 3350)
        #expect(held.position(in: range) == 3350 && held.label(vi) == "Mục tiêu 3350 RPM")
        #expect(!held.canApply(held: 3350, in: range))
        #expect(slider(1620) == .current(1620))
    }

    @Test func appliedFeedbackRequiresTheMatchingConfirmedControl() {
        let rule = FanRule(sensor: "cpu", lower: 50, upper: 70)
        let rules = ["*": rule]
        let request = FanControlRequest.rules(rule)
        #expect(!request.isConfirmed(controlling: false, profileID: "custom", rules: rules, targets: [:]))
        #expect(!request.isConfirmed(controlling: true, profileID: "custom", rules: ["*": FanRule()], targets: [:]))
        #expect(request.isConfirmed(controlling: true, profileID: "custom", rules: rules, targets: [:]))
        #expect(!FanControlRequest.profile("cool").isConfirmed(controlling: true, profileID: "quiet", rules: rules, targets: [:]))
        let manual = FanControlRequest.manual(index: 1, rpm: 3350)
        #expect(!manual.isConfirmed(controlling: true, profileID: nil, rules: nil, targets: [0: 3350]))
        #expect(!manual.isConfirmed(controlling: true, profileID: nil, rules: nil, targets: [1: 3300]))
        #expect(manual.isConfirmed(controlling: true, profileID: nil, rules: nil, targets: [1: 3350]))
    }

    @MainActor @Test func confirmationBelongsToTheMonitorSession() {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let monitor = ThermalMonitor(preferences: file)
        #expect(!monitor.manualControlConfirmed)
        monitor.manualControlConfirmed = true
        monitor.disconnectControl()
        #expect(monitor.manualControlConfirmed)
        #expect(!ThermalMonitor(preferences: file).manualControlConfirmed)
    }
}

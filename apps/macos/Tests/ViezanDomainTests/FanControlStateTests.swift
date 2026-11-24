import Foundation
import Testing
@testable import ViezanDomain

@Suite @MainActor final class FanControlStateTests {
    private let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    private var file: URL { directory.appendingPathComponent("fan-profiles.json") }
    deinit { try? FileManager.default.removeItem(at: directory) }

    private func fan(_ index: Int, _ minimum: Double?, _ maximum: Double?) -> ThermalSnapshot.Fan {
        .init(index: index, rpm: 1500, min: minimum, max: maximum, target: nil, name: nil)
    }

    @Test func previewUsesTheSourceAndEachFansRange() {
        let snapshot = ThermalSnapshot(ok: true, sensors: [
            .init(key: "Tp01", celsius: 51.2), .init(key: "TG0D", celsius: 60),
            .init(key: "TB0T", celsius: 80), .init(key: "hid:pACC", celsius: 90, source: "hid"),
        ], fans: [fan(2, 1000, 5000), fan(0, 2000, 4000)], model: nil)
        func preview(_ source: String) -> [Int: FanPolicy.Reading] {
            FanPolicy.preview(snapshot, rule: .init(sensor: source, lower: 40, upper: 80),
                              affinity: [2: ["Tp01", "hid:pACC"], 0: ["TG0D"]])
        }
        #expect(preview("cpu") == [2: .init(celsius: 51.2, rpm: 2100), 0: .init(celsius: 51.2, rpm: 2550)])
        #expect(preview("all") == [2: .init(celsius: 80, rpm: 5000), 0: .init(celsius: 80, rpm: 4000)])
        #expect(preview("affinity") == [2: .init(celsius: 51.2, rpm: 2100), 0: .init(celsius: 60, rpm: 3000)])
        #expect(preview("TG0D")[2] == .init(celsius: 60, rpm: 3000))
        #expect(preview("hid:pACC")[2] == .init(celsius: 90, rpm: 5000))
        #expect(preview("pACC").isEmpty)
    }

    @Test func previewOmitsFansWithoutRangeOrSource() {
        let fans = [fan(0, nil, 5000), fan(1, 1000, nil), fan(2, 2000, 2000),
                    fan(3, 1000, .infinity), fan(4, 1000, 5000)]
        let sensor = ThermalSnapshot.Sensor(key: "Tp01", celsius: 30)
        let snapshot = ThermalSnapshot(ok: true, sensors: [sensor], fans: fans, model: nil)
        #expect(FanPolicy.preview(snapshot, rule: .init()) == [4: .init(celsius: 30, rpm: 1000)])
        #expect(FanPolicy.preview(snapshot, rule: .init(sensor: "TG99")).isEmpty)
        #expect(FanPolicy.preview(snapshot, rule: .init(lower: 75, upper: 45)).isEmpty)
        let hidOnly = ThermalSnapshot(ok: true, sensors: [.init(key: "hid:pACC", celsius: 70, source: "hid")],
                                      fans: fans, model: nil)
        #expect(FanPolicy.preview(hidOnly, rule: .init(sensor: "cpu")).isEmpty)
    }

    @Test func policyAdmissionRequiresMonitoringFansAndValidRules() {
        let rules = ["*": FanRule()]
        let fans = [fan(0, 1000, 5000)]
        func admits(_ rules: [String: FanRule], monitoring: Bool = true, calibrating: Bool = false) -> Bool {
            RunningFanPolicy(id: "custom", rules: rules, monitoring: monitoring, calibrating: calibrating, fans: fans) != nil
        }
        #expect(admits(rules))
        #expect(!admits(rules, monitoring: false))
        #expect(!admits(rules, calibrating: true))
        #expect(RunningFanPolicy(id: "custom", rules: rules, monitoring: true, calibrating: false, fans: []) == nil)
        #expect(!admits([:]))
        #expect(!admits(["*": .init(), "1": .init(lower: 60, upper: 60)]))
        #expect(!admits(["*": .init(sensor: "")]))
        #expect(!admits(["fan0": .init()]))
        #expect(!admits(["-1": .init()]))
        var perFan = Dictionary(uniqueKeysWithValues: (0..<16).map { (String($0), FanRule()) })
        #expect(admits(perFan))
        perFan["*"] = FanRule()
        #expect(!admits(perFan))
    }

    @Test func applyRulesWhileStoppedLeavesControlAndDiskUntouched() {
        let monitor = ThermalMonitor(preferences: file)
        monitor.applyRules(["*": .init()])
        monitor.applyRules(["0": .init(lower: 80, upper: 70)])
        #expect(monitor.activeProfile == nil)
        #expect(monitor.activeRules == nil)
        #expect(monitor.policyReadings.isEmpty && monitor.manualTargets.isEmpty)
        #expect(!monitor.controlling && !FileManager.default.fileExists(atPath: file.path))
    }

    @Test func customIsReservedEvenWhenUsedAsAProfileNameOrFileID() throws {
        let monitor = ThermalMonitor(preferences: file)
        let id = try #require(monitor.saveProfile(name: "custom", rules: ["*": .init()]))
        #expect(UUID(uuidString: id) != nil)
        #expect(ThermalMonitor(preferences: file).profiles.last?.id == id)
        #expect(!monitor.profiles.contains { $0.id == "custom" })

        let json = try String(contentsOf: file, encoding: .utf8)
        try json.replacingOccurrences(of: id, with: "custom").write(to: file, atomically: true, encoding: .utf8)
        #expect(ThermalMonitor(preferences: file).profiles.map(\.id) == FanProfile.builtins.map(\.id))
    }

    @Test func aRunNeedsARuleAndASpeedRangeForEveryFan() {
        let rule = FanRule(sensor: "cpu")
        func runs(_ rules: [String: FanRule], _ fans: [ThermalSnapshot.Fan]) -> Bool {
            RunningFanPolicy(id: "custom", rules: rules, monitoring: true, calibrating: false, fans: fans) != nil
        }
        #expect(runs(["*": rule], [fan(0, 1000, 5000), fan(1, 1000, 5000)]))
        #expect(runs(["0": rule, "1": rule], [fan(0, 1000, 5000), fan(1, 1000, 5000)]))
        #expect(!runs(["0": rule], [fan(0, 1000, 5000), fan(1, 1000, 5000)]))
        #expect(!runs(["*": rule], [fan(0, 1000, 5000), fan(1, 5000, 5000)]))
    }

    @Test func onlyAnExactSaveAdoptsTheCustomRun() throws {
        let rules = ["*": FanRule(sensor: "cpu"), "1": FanRule(sensor: "gpu")]
        var run = try #require(RunningFanPolicy(id: "custom", rules: rules, monitoring: true,
                                                calibrating: false, fans: [fan(0, 1000, 5000)]))
        run.adoptSavedProfile(FanProfile(name: "Subset", rules: ["*": FanRule(sensor: "cpu")]))
        #expect(run.id == "custom")
        let saved = FanProfile(name: "Match", rules: rules)
        run.adoptSavedProfile(saved)
        #expect(run.id == saved.id && run.rules == rules)
        run.adoptSavedProfile(FanProfile(name: "Later copy", rules: rules))
        #expect(run.id == saved.id)
    }

    @Test func failedSaveDoesNotPublishAnIDOrProfile() throws {
        let monitor = ThermalMonitor(preferences: file)
        #expect(monitor.saveProfile(name: "Bad rule", rules: [:]) == nil)
        try Data().write(to: directory) // A regular file cannot hold the preferences file.
        #expect(monitor.saveProfile(name: "Valid", rules: ["*": .init()]) == nil)
        #expect(monitor.profiles.map(\.id) == FanProfile.builtins.map(\.id))
        #expect(monitor.error == "fanProfileSaveError")
    }

    @Test func readingsPairTheLatestTemperatureWithTheHeldTarget() throws {
        let data = Data(#"{"activeOverrides":[{"id":"fan2","rpm":2450},{"id":"fan0","rpm":1800}]}"#.utf8)
        let status = try FanOverrideStatus(data: data)
        #expect(status.targets == [2: 2450, 0: 1800])
        #expect(try status.readings(for: [2: 63.2, 0: 54]) == [2: .init(celsius: 63.2, rpm: 2450),
                                                               0: .init(celsius: 54, rpm: 1800)])
        #expect(throws: StorageFailure.self) { try status.readings(for: [2: 63.2, 1: 54]) }
        #expect(throws: StorageFailure.self) { try FanOverrideStatus(data: Data(#"{"activeOverrides":[]}"#.utf8)) }
    }
}

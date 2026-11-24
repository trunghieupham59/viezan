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

    @Test func quietIgnoresAnIsolatedSpikeAndRampsOnFreshReadings() throws {
        let rule = try #require(FanProfile.builtins.first { $0.id == "quiet" }?.rules["*"])
        let item = fan(0, 1500, 5500)
        let start = ContinuousClock.now
        var response = QuietFanResponse()
        func step(_ celsius: Double, _ seconds: Int) -> Double? {
            response.nextTarget(temperature: celsius, rule: rule, fan: item, range: 1500...5500,
                                sampledAt: start.advanced(by: .seconds(seconds)))
        }

        #expect(step(70, 0) == 1500)
        #expect(step(95, 2) == nil)
        #expect(step(95, 2) == nil) // The controller polled again before the reader published.
        #expect(step(70, 4) == nil)
        #expect(step(94, 6) == nil)
        #expect(step(94, 8) == 1900)
        #expect(step(94, 8) == nil)
        for index in 2...8 {
            #expect(step(94, 6 + 2 * index) == Double(1500 + 400 * index))
        }
        #expect(step(94, 24) == nil) // Steady at the curve target of 4700 RPM.
        #expect(step(68, 26) == 4500)
        #expect(step(68, 28) == 4300)
    }

    @Test func quietUsesTheExactMaximumOnTheFirstHotSample() {
        let rule = FanRule(sensor: "cpu", lower: 70, upper: 100)
        let item = ThermalSnapshot.Fan(index: 1, rpm: 5100, min: 1500, max: 5774, target: 5750, name: nil)
        let start = ContinuousClock.now
        var response = QuietFanResponse()
        func step(_ celsius: Double, _ seconds: Int) -> Double? {
            response.nextTarget(temperature: celsius, rule: rule, fan: item, range: 1500...5774,
                                sampledAt: start.advanced(by: .seconds(seconds)))
        }

        #expect(step(99.9, 0) == 5750) // Keep the existing target on activation.
        #expect(step(100, 2) == 5774) // A 24 RPM increase still bypasses the normal deadband.
        #expect(step(102, 4) == nil)
        #expect(step(70, 6) == 5560)
        #expect(step(101, 8) == 5774)
        response = QuietFanResponse()
        #expect(step(100, 10) == 5774) // Also bypass the startup hold.
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

    @Test func replacementReaderWaitsForExitAndGoodSamplesClearReadErrors() async throws {
        let monitor = ThermalMonitor(preferences: file)
        let first = Process(), replacement = Process()
        let firstInput = Pipe(), secondInput = Pipe()
        first.executableURL = URL(fileURLWithPath: "/bin/sh")
        first.arguments = ["-c", #"trap '' TERM; echo '{"ok":true}'; read done"#]
        first.standardInput = firstInput
        replacement.executableURL = URL(fileURLWithPath: "/bin/cat")
        replacement.standardInput = secondInput
        defer {
            try? firstInput.fileHandleForWriting.close()
            try? secondInput.fileHandleForWriting.close()
            monitor.stop()
        }
        func waitFor(_ condition: () -> Bool) async throws {
            let deadline = ContinuousClock.now + .seconds(5)
            while !condition(), ContinuousClock.now < deadline { try await Task.sleep(for: .milliseconds(10)) }
            try #require(condition())
        }
        monitor.start(reader: first)
        try await waitFor { monitor.snapshot != nil }
        monitor.stop()
        monitor.start(reader: replacement)
        #expect(first.isRunning && !replacement.isRunning)
        try firstInput.fileHandleForWriting.write(contentsOf: Data([10]))
        try await waitFor { replacement.isRunning && !first.isRunning }
        try secondInput.fileHandleForWriting.write(contentsOf: Data("invalid\n".utf8))
        try await waitFor { monitor.error == "thermalReadError" }
        try secondInput.fileHandleForWriting.write(contentsOf: Data("{\"ok\":true,\"model\":\"fixture\"}\n".utf8))
        try await waitFor { monitor.snapshot?.model == "fixture" }
        #expect(monitor.error == nil)
    }

    @Test func losingTheNamedSensorDisconnectsAnActiveProfile() async throws {
        let helper = RecordingFanConnection()
        let monitor = ThermalMonitor(preferences: file, fan: helper)
        let id = try #require(monitor.saveProfile(name: "CPU diode", rules: ["*": FanRule(sensor: "TC0D")]))
        let input = Pipe(), reader = Process()
        reader.executableURL = URL(fileURLWithPath: "/bin/cat")
        reader.standardInput = input
        monitor.start(reader: reader)
        defer { monitor.stop(); try? input.fileHandleForWriting.close() }

        let other = ThermalSnapshot.Sensor(key: "TG0D", celsius: 85)
        func send(_ sensors: [ThermalSnapshot.Sensor]) throws {
            let sample = ThermalSnapshot(ok: true, sensors: sensors, fans: [fan(0, 1000, 5000)], model: nil)
            try input.fileHandleForWriting.write(contentsOf: JSONEncoder().encode(sample) + Data([10]))
        }
        func waitFor(_ condition: () -> Bool) async throws {
            let deadline = ContinuousClock.now + .seconds(10)
            while !condition(), ContinuousClock.now < deadline { try await Task.sleep(for: .milliseconds(20)) }
            try #require(condition())
        }

        try send([.init(key: "TC0D", celsius: 60), other])
        try await waitFor { monitor.snapshot != nil }
        monitor.applyProfile(id)
        try await waitFor { monitor.controlling }
        #expect(monitor.activeProfile == id)
        #expect(monitor.policyReadings[0] == .init(celsius: 60, rpm: 3000))

        try send([other])
        try await waitFor { monitor.activeProfile == nil }
        #expect(monitor.monitoring && !monitor.controlling && monitor.policyReadings.isEmpty)
        #expect(monitor.error == "fanProfileApplyError")
        let events = helper.events
        #expect(events.filter { $0 != "status" } == ["set:3000", "disconnect"])
        #expect(events.contains("status") && events.last == "disconnect")
    }

    @Test func onlyTheBuiltInQuietProfileFiltersTargetsInTheLiveLoop() async throws {
        let helper = RecordingFanConnection()
        let monitor = ThermalMonitor(preferences: file, fan: helper)
        let quiet = try #require(monitor.profiles.first { $0.id == "quiet" })
        let copy = try #require(monitor.saveProfile(name: "Quiet", rules: quiet.rules))
        let fans = [fan(0, 1000, 5000), fan(1, 1400, 5774)]
        let input = Pipe(), reader = Process()
        reader.executableURL = URL(fileURLWithPath: "/bin/cat")
        reader.standardInput = input
        monitor.start(reader: reader)
        defer { monitor.stop(); try? input.fileHandleForWriting.close() }
        func send(_ celsius: Double) throws {
            let sample = ThermalSnapshot(ok: true, sensors: [.init(key: "Tp01", celsius: celsius)], fans: fans, model: nil)
            try input.fileHandleForWriting.write(contentsOf: JSONEncoder().encode(sample) + Data([10]))
        }
        func waitFor(_ condition: () -> Bool) async throws {
            let deadline = ContinuousClock.now + .seconds(10)
            while !condition(), ContinuousClock.now < deadline { try await Task.sleep(for: .milliseconds(20)) }
            try #require(condition())
        }

        try send(85)
        try await waitFor { monitor.snapshot != nil }
        monitor.applyProfile(copy)
        try await waitFor { monitor.controlling }
        #expect(monitor.policyReadings[0]?.rpm == 3000)
        monitor.applyProfile(quiet.id)
        try await waitFor { monitor.controlling }
        #expect(monitor.policyReadings.values.map(\.rpm).sorted() == [1500, 1500])
        try send(100)
        try await waitFor { monitor.policyReadings[1]?.celsius == 100 }
        #expect(monitor.policyReadings[0]?.rpm == 5000)
        #expect(monitor.policyReadings[1]?.rpm == 5774)
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
        let first = try #require(monitor.fanFailure)
        #expect(monitor.saveProfile(name: "Retry", rules: ["*": .init()]) == nil)
        let second = try #require(monitor.fanFailure)
        #expect(first.code == second.code && first.id != second.id)
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

private final class RecordingFanConnection: FanConnection, @unchecked Sendable {
    private let lock = NSLock()
    private var recorded: [String] = []
    private var targets: [String: Double] = [:]
    private var owner: UUID?
    var events: [String] { lock.withLock { recorded } }

    func beginLease() -> UUID {
        lock.withLock { let id = UUID(); owner = id; return id }
    }
    func disconnect() {
        lock.withLock {
            if owner != nil { recorded.append("disconnect") }
            owner = nil
            targets.removeAll()
        }
    }
    func command(_ op: String, args: [String: String], rpm: Double?, lease: UUID) throws -> Data {
        try lock.withLock {
            guard lease == owner else { throw CancellationError() }
            if op == "fans.setTarget", let id = args["id"], let rpm {
                recorded.append("set:\(Int(rpm))")
                targets[id] = rpm
                return Data()
            }
            guard op == "status" else { throw StorageFailure.invalidData }
            recorded.append("status")
            let overrides = targets.map { ["id": $0.key, "rpm": $0.value] as [String: Any] }
            return try JSONSerialization.data(withJSONObject: ["activeOverrides": overrides])
        }
    }
}

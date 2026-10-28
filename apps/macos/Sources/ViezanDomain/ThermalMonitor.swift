import Foundation
import Observation
import ServiceManagement
import Darwin

public struct ThermalSnapshot: Codable, Sendable {
    public struct Sensor: Codable, Identifiable, Sendable { public let key: String; public let celsius: Double; public var id: String { key } }
    public struct Fan: Codable, Identifiable, Sendable { public let index: Int; public let rpm: Double; public let min: Double?; public let max: Double?; public let target: Double?; public let name: String?; public var id: Int { index } }
    public let ok: Bool
    public let sensors: [Sensor]?
    public let fans: [Fan]?
    public let model: String?
}
private final class FanSocket: @unchecked Sendable {
    private let lock = NSLock()
    private var fd: Int32 = -1
    private var pending = Data()
    private var lease = UUID()
    func beginLease() -> UUID { lock.lock(); defer { lock.unlock() }; lease = UUID(); return lease }
    deinit { disconnect() }
    func disconnect() { lock.lock(); defer { lock.unlock() }; lease = UUID(); if fd >= 0 { Darwin.close(fd); fd = -1 }; pending.removeAll() }
    func command(_ op: String, args: [String: String] = [:], rpm: Double? = nil, lease expected: UUID) throws -> Data {
        lock.lock(); defer { lock.unlock() }
        guard expected == lease else { throw CancellationError() }
        do {
            if fd < 0 { try connect(); let hello = try exchange("hello", args: [:]); guard let value = try JSONSerialization.jsonObject(with: hello) as? [String: Any], value["protocol"] as? Int == 1 else { throw StorageFailure.invalidData } }
            var values: [String: Any] = args; if let rpm { values["rpm"] = rpm }
            return try exchange(op, args: values)
        } catch { if fd >= 0 { Darwin.close(fd); fd = -1 }; pending.removeAll(); throw error }
    }
    private func connect() throws {
        let path = "/var/run/viezan-fan-helper.sock"
        var info = stat()
        guard lstat(path, &info) == 0, info.st_uid == 0, info.st_mode & S_IFMT == S_IFSOCK else { throw StorageFailure.invalidData }
        fd = socket(AF_UNIX, SOCK_STREAM, 0); guard fd >= 0 else { throw StorageFailure.invalidData }
        var timeout = timeval(tv_sec: 2, tv_usec: 0), noSignal: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size)); setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size)); setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, socklen_t(MemoryLayout<Int32>.size))
        var address = sockaddr_un(); address.sun_family = sa_family_t(AF_UNIX)
        let bytes = Array(path.utf8CString)
        guard bytes.count <= MemoryLayout.size(ofValue: address.sun_path) else { throw StorageFailure.invalidData }
        withUnsafeMutableBytes(of: &address.sun_path) { target in for (index, byte) in bytes.enumerated() { target[index] = UInt8(bitPattern: byte) } }
        address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
        let result = withUnsafePointer(to: &address) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) } }
        var uid: uid_t = 1, gid: gid_t = 1
        guard result == 0, getpeereid(fd, &uid, &gid) == 0, uid == 0 else { throw StorageFailure.invalidData }
    }
    private func exchange(_ op: String, args: [String: Any]) throws -> Data {
        let id = UUID().uuidString
        let data = try JSONSerialization.data(withJSONObject: ["id": id, "op": op, "args": args]) + Data([10])
        try data.withUnsafeBytes { buffer in
            var offset = 0
            while offset < buffer.count { let written = Darwin.send(fd, buffer.baseAddress!.advanced(by: offset), buffer.count - offset, 0); guard written > 0 else { throw StorageFailure.invalidData }; offset += written }
        }
        while !pending.contains(10) {
            var bytes = [UInt8](repeating: 0, count: 4096); let count = bytes.withUnsafeMutableBytes { Darwin.recv(fd, $0.baseAddress, $0.count, 0) }
            guard count > 0, pending.count + count <= 262144 else { throw StorageFailure.invalidData }; pending.append(contentsOf: bytes.prefix(count))
        }
        let end = pending.firstIndex(of: 10)!; let line = pending.prefix(upTo: end); pending.removeSubrange(...end)
        guard let value = try JSONSerialization.jsonObject(with: line) as? [String: Any], value["id"] as? String == id, value["ok"] as? Bool == true, let result = value["result"] else { throw StorageFailure.invalidData }
        return try JSONSerialization.data(withJSONObject: result)
    }
}
@MainActor @Observable public final class ThermalMonitor {
    public private(set) var snapshot: ThermalSnapshot?
    public private(set) var error: String?
    public private(set) var monitoring = false
    public private(set) var controlling = false
    public private(set) var helperStatus = ""
    @ObservationIgnored private var process: Process?
    @ObservationIgnored private var output: FileHandle?
    @ObservationIgnored private var buffer = Data()
    @ObservationIgnored private var generation = UUID()
    @ObservationIgnored private let fan = FanSocket()
    @ObservationIgnored private var controlGeneration = UUID()
    @ObservationIgnored private var heartbeat: Task<Void, Never>?
    public private(set) var profiles: [FanProfile] = FanProfile.builtins
    public private(set) var activeProfile: String?
    public private(set) var calibrating = false
    public private(set) var calibrationPhase = ""
    public private(set) var calibrationRemaining = 0
    public private(set) var affinity: [Int: [String]] = [:]
    @ObservationIgnored private var policy: Task<Void, Never>?
    @ObservationIgnored private var calibration: Task<Void, Never>?
    @ObservationIgnored private var lastSnapshot = ContinuousClock.now
    @ObservationIgnored private var samples: [(Date, ThermalSnapshot)] = []
    @ObservationIgnored private let preferences = FilePersistence.previewURL().deletingLastPathComponent().appendingPathComponent("fan-profiles.json")
    private struct Saved: Codable { var profiles: [FanProfile]; var affinity: [Int: [String]] }
    public init() {
        if let size = try? preferences.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 1_048_576,
           let data = try? Data(contentsOf: preferences), let saved = try? JSONDecoder().decode(Saved.self, from: data), saved.profiles.count <= 50,
           saved.profiles.allSatisfy({ UUID(uuidString: $0.id) != nil && !$0.name.isEmpty && $0.name.count <= 100 && $0.rules.count <= 16 && $0.rules.values.allSatisfy(\.valid) }) {
            profiles += saved.profiles; affinity = saved.affinity
        }
    }
    private func persistProfiles() {
        do {
            let data = try JSONEncoder().encode(Saved(profiles: profiles.filter { UUID(uuidString: $0.id) != nil }, affinity: affinity))
            try FileManager.default.createDirectory(at: preferences.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            try data.write(to: preferences, options: .atomic); try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: preferences.path)
        } catch { self.error = "fanControlError" }
    }
    public func saveProfile(name: String, rules: [String: FanRule]) {
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, name.count <= 100, profiles.count < 54, !rules.isEmpty, rules.count <= 16, rules.values.allSatisfy(\.valid) else { return }
        profiles.append(FanProfile(name: name, rules: rules)); persistProfiles()
    }
    public func removeProfile(_ id: String) {
        guard UUID(uuidString: id) != nil else { return }; if activeProfile == id { restoreAutomatic() }; profiles.removeAll { $0.id == id }; persistProfiles()
    }
    public func unregisterHelper() async {
        cancelCalibration(); restoreAutomatic()
        do { try await SMAppService.daemon(plistName: "com.viezan.fan-helper.plist").unregister(); refreshHelperStatus() }
        catch { self.error = "fanControlError" }
    }
    public func applyProfile(_ id: String) {
        guard !calibrating, let profile = profiles.first(where: { $0.id == id }), monitoring, !(snapshot?.fans ?? []).isEmpty else { return }
        disconnectControl(); let owner = fan.beginLease(); controlGeneration = owner; activeProfile = id; let socket = fan
        policy = Task { [weak self] in
            var smoothed: [Int: Double] = [:], targets: [Int: Double] = [:], changed: [Int: ContinuousClock.Instant] = [:]
            do {
                while !Task.isCancelled {
                    guard let self, self.controlGeneration == owner, let snapshot = self.snapshot, self.lastSnapshot.duration(to: .now) < .seconds(8) else { throw StorageFailure.invalidData }
                    for item in snapshot.fans ?? [] {
                        guard let rule = profile.rules[String(item.index)] ?? profile.rules["*"], rule.valid, let lo = item.min, let hi = item.max, lo.isFinite, hi.isFinite, hi > lo,
                              let reading = FanPolicy.temperature(snapshot, source: rule.sensor, affinity: self.affinity, fan: item.index) else { throw StorageFailure.invalidData }
                        let previous = smoothed[item.index] ?? reading
                        let temperature = abs(reading-previous) >= 8 ? reading : previous + (1-exp(-0.2))*(reading-previous)
                        smoothed[item.index] = temperature
                        let rpm = FanPolicy.target(temperature: temperature, rule: rule, minimum: lo, maximum: hi)
                        let delta = abs(rpm-(targets[item.index] ?? -10000))
                        if delta >= 100 && (delta >= 400 || (changed[item.index]?.duration(to: .now) ?? .seconds(6)) >= .seconds(6)) {
                            _ = try await Task.detached { try socket.command("fans.setTarget", args: ["id": "fan\(item.index)"], rpm: rpm, lease: owner) }.value
                            guard self.controlGeneration == owner else { return }; targets[item.index] = rpm; changed[item.index] = .now
                        }
                    }
                    let data = try await Task.detached { try socket.command("status", lease: owner) }.value
                    let result = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                    guard (result?["activeOverrides"] as? [[String: Any]])?.isEmpty == false else { throw StorageFailure.invalidData }
                    self.controlling = true; try await Task.sleep(for: .seconds(2))
                }
            } catch { if let self, self.controlGeneration == owner { self.disconnectControl(); if !Task.isCancelled { self.error = "fanControlError" } } }
        }
    }
    public func cancelCalibration() { calibration?.cancel(); calibration = nil; calibrating = false; calibrationRemaining = 0; samples.removeAll(); disconnectControl() }
    public func calibrate() {
        guard !calibrating, monitoring, let fans = snapshot?.fans, !fans.isEmpty, fans.count <= 16, fans.allSatisfy({ ($0.max ?? 0).isFinite && ($0.max ?? 0) > 0 }) else { return }
        disconnectControl(); let owner = fan.beginLease(); controlGeneration = owner; calibrating = true; samples.removeAll(); let socket = fan
        calibration = Task { [weak self] in
            guard let self else { return }
            do {
                _ = try await Task.detached { try socket.command("fans.restoreAll", lease: owner) }.value
                try await self.calibrationWait(45, phase: "fanSettle", owner: owner)
                var deltas: [Int: [String: Double]] = [:]
                for item in fans {
                    try await self.calibrationWait(12, phase: "fanBaseline", owner: owner); let before = self.averageSamples()
                    let rpm = item.max!
                    _ = try await Task.detached { try socket.command("fans.setTarget", args: ["id": "fan\(item.index)"], rpm: rpm, lease: owner) }.value
                    try await self.calibrationWait(40, phase: "fanSpin", owner: owner); let during = self.averageSamples()
                    _ = try await Task.detached { try socket.command("fans.restoreAll", lease: owner) }.value
                    try await self.calibrationWait(30, phase: "fanSettle", owner: owner); let after = self.averageSamples()
                    var values: [String: Double] = [:]
                    for (key, a) in before { if let b = during[key], let c = after[key] { values[key] = (a+c)/2-b } }
                    deltas[item.index] = values
                }
                guard self.controlGeneration == owner else { return }
                var affinity: [Int: [String]] = [:]
                for (index, values) in deltas {
                    let candidates = values.filter { $0.value >= 0.5 }.sorted { $0.value > $1.value }
                    let owned = candidates.filter { key, cooling in
                        let other = deltas.filter { $0.key != index }.map { max(0, $0.value[key] ?? 0) }.max() ?? 0
                        let total = deltas.values.reduce(0.0) { $0 + max(0, $1[key] ?? 0) }
                        return cooling-other >= 0.4 || cooling/max(cooling,total) >= 0.6
                    }
                    affinity[index] = Array((owned.isEmpty ? candidates : owned).prefix(12).map(\.key))
                }
                self.affinity = affinity; self.persistProfiles(); self.calibrationPhase = "succeeded"
            } catch { if !Task.isCancelled { self.error = "fanControlError" } }
            if self.controlGeneration == owner { self.calibrating = false; self.calibrationRemaining = 0; self.samples.removeAll(); self.disconnectControl() }
        }
    }
    private func calibrationWait(_ seconds: Int, phase: String, owner: UUID) async throws {
        calibrationPhase = phase
        for remaining in stride(from: seconds, to: 0, by: -1) {
            try Task.checkCancellation(); guard controlGeneration == owner, lastSnapshot.duration(to: .now) < .seconds(8) else { throw StorageFailure.invalidData }
            calibrationRemaining = remaining; let socket = fan
            let data = try await Task.detached { try socket.command("status", lease: owner) }.value
            if phase == "fanSpin" {
                let result = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                guard (result?["activeOverrides"] as? [[String: Any]])?.isEmpty == false else { throw StorageFailure.invalidData }
            }
            try await Task.sleep(for: .seconds(1))
        }
    }
    private func averageSamples() -> [String: Double] {
        let recent = samples.filter { $0.0 > Date().addingTimeInterval(-12) }; var sums: [String: Double] = [:], counts: [String: Int] = [:]
        for (_, snapshot) in recent { for sensor in snapshot.sensors ?? [] where sensor.celsius.isFinite { sums[sensor.key, default: 0] += sensor.celsius; counts[sensor.key, default: 0] += 1 } }
        return sums.mapValues { $0 }.reduce(into: [:]) { $0[$1.key] = $1.value / Double(counts[$1.key]!) }
    }
    public func start() {
        guard process == nil else { return }
        guard let url = Bundle.main.resourceURL?.appendingPathComponent("native/viezan-smc"), FileManager.default.isExecutableFile(atPath: url.path) else { error = "thermalReaderMissing"; return }
        let owner = UUID(); generation = owner
        let process = Process(), pipe = Pipe(); process.executableURL = url; process.arguments = ["--watch", "2000"]
        process.standardOutput = pipe; process.standardError = FileHandle.nullDevice; output = pipe.fileHandleForReading
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in let data = handle.availableData; Task { @MainActor in self?.consume(data, owner: owner) } }
        process.terminationHandler = { [weak self] _ in Task { @MainActor in guard let self, self.generation == owner else { return }; self.stop(); self.error = "thermalReadError" } }
        do { try process.run(); self.process = process; monitoring = true; error = nil }
        catch { output?.readabilityHandler = nil; output = nil; self.error = "thermalReadError" }
    }
    public func stop() {
        cancelCalibration()
        generation = UUID(); output?.readabilityHandler = nil; output = nil; process?.terminationHandler = nil
        if process?.isRunning == true { process?.terminate() }; process = nil; buffer.removeAll(); monitoring = false; disconnectControl()
    }
    private func consume(_ data: Data, owner: UUID) {
        guard generation == owner else { return }
        if data.isEmpty { output?.readabilityHandler = nil; return }
        buffer.append(data); guard buffer.count <= 1_048_576 else { stop(); error = "thermalReadError"; return }
        while let end = buffer.firstIndex(of: 10) {
            let line = Data(buffer[..<end]); buffer.removeSubrange(...end)
            guard let value = try? JSONDecoder().decode(ThermalSnapshot.self, from: line), value.ok else { error = "thermalReadError"; continue }
            snapshot = value; lastSnapshot = .now
            if calibrating { samples.append((Date(), value)); samples.removeAll { $0.0 < Date().addingTimeInterval(-15) } }
        }
    }
    public func registerHelper() {
        do { try SMAppService.daemon(plistName: "com.viezan.fan-helper.plist").register(); refreshHelperStatus(); error = nil }
        catch { refreshHelperStatus(); self.error = "fanControlError" }
    }
    public func refreshHelperStatus() {
        switch SMAppService.daemon(plistName: "com.viezan.fan-helper.plist").status {
        case .enabled: helperStatus = "helperEnabled"
        case .requiresApproval: helperStatus = "helperApproval"
        default: helperStatus = "helperUnavailable"
        }
    }
    public func openHelperSettings() { SMAppService.openSystemSettingsLoginItems() }
    public func setTarget(index: Int, rpm: Double) {
        guard !calibrating else { return }; policy?.cancel(); policy = nil; activeProfile = nil
        guard let item = snapshot?.fans?.first(where: { $0.index == index }), let minimum = item.min, let maximum = item.max, rpm.isFinite, maximum > minimum, rpm >= minimum, rpm <= maximum else { error = "fanControlError"; return }
        let fan = self.fan; heartbeat?.cancel(); heartbeat = nil
        let owner = fan.beginLease(); controlGeneration = owner
        Task {
            do {
                _ = try await Task.detached { try fan.command("fans.setTarget", args: ["id": "fan\(index)"], rpm: rpm, lease: owner) }.value
                guard controlGeneration == owner else { return }
                controlling = true; error = nil; startHeartbeat(owner)
            } catch { if controlGeneration == owner { disconnectControl(); self.error = "fanControlError" } }
        }
    }
    public func restoreAutomatic() {
        cancelCalibration()
        let fan = self.fan; heartbeat?.cancel(); heartbeat = nil
        let owner = fan.beginLease(); controlGeneration = owner
        Task {
            do {
                let data = try await Task.detached { try fan.command("fans.restoreAll", lease: owner) }.value
                guard controlGeneration == owner else { return }
                guard let result = try JSONSerialization.jsonObject(with: data) as? [String: Bool], result["restored"] == true else { throw StorageFailure.invalidData }
                error = nil
            } catch { if controlGeneration == owner { self.error = "fanControlError" } }
            if controlGeneration == owner { disconnectControl() }
        }
    }
    public func disconnectControl() { policy?.cancel(); policy = nil; activeProfile = nil; controlGeneration = UUID(); heartbeat?.cancel(); heartbeat = nil; fan.disconnect(); controlling = false }
    private func startHeartbeat(_ owner: UUID) {
        guard heartbeat == nil else { return }
        let fan = self.fan
        heartbeat = Task { [weak self] in
            do {
                while !Task.isCancelled {
                    try await Task.sleep(for: .seconds(3))
                    let data = try await Task.detached { try fan.command("status", lease: owner) }.value
                    guard self?.controlGeneration == owner else { return }
                    if let result = try JSONSerialization.jsonObject(with: data) as? [String: Any], (result["activeOverrides"] as? [[String: Any]])?.isEmpty == true { self?.disconnectControl(); return }
                }
            } catch { if !Task.isCancelled, self?.controlGeneration == owner { self?.disconnectControl(); self?.error = "fanControlError" } }
        }
    }
}

/// Meaning of Apple SMC temperature keys (four characters; the second names the subsystem
/// on most machines). Exact keys differ per model, so well-known keys come first and the
/// subsystem letter is the fallback. Labels are `thermal_label_*` copy ids.
public enum ThermalSensors {
    public enum Group: String, CaseIterable, Sendable { case cpu, gpu, other }
    public struct Meaning: Equatable, Sendable { public let group: Group; public let label: String? }
    private static let known: [String: Meaning] = [
        // Intel Macs
        "TC0P": .init(group: .cpu, label: "cpu_proximity"), "TC0D": .init(group: .cpu, label: "cpu_die"), "TC0E": .init(group: .cpu, label: "cpu_die"),
        "TC0F": .init(group: .cpu, label: "cpu_die"), "TC0H": .init(group: .cpu, label: "cpu_package"), "TCXC": .init(group: .cpu, label: "cpu_package"),
        "TG0D": .init(group: .gpu, label: "gpu_die"), "TG0P": .init(group: .gpu, label: "gpu_proximity"), "TG0H": .init(group: .gpu, label: "gpu"),
        "TM0P": .init(group: .other, label: "memory"), "TA0P": .init(group: .other, label: "ambient"), "TH0P": .init(group: .other, label: "storage"),
        "TL0P": .init(group: .other, label: "display"), "TPCD": .init(group: .other, label: "power"), "TI0P": .init(group: .other, label: "thunderbolt"),
        "TI1P": .init(group: .other, label: "thunderbolt"),
        // Apple Silicon
        "TaLP": .init(group: .other, label: "airflow_left"), "TaRF": .init(group: .other, label: "airflow_right"), "Ts0P": .init(group: .other, label: "palm_rest"),
        "Ts1P": .init(group: .other, label: "palm_rest"), "TW0P": .init(group: .other, label: "wifi"), "TB0T": .init(group: .other, label: "battery"),
        "TB1T": .init(group: .other, label: "battery"), "TB2T": .init(group: .other, label: "battery"), "TH0a": .init(group: .other, label: "storage"),
        "TH0b": .init(group: .other, label: "storage"), "TH0x": .init(group: .other, label: "storage"),
    ]
    private static let subsystems: [Character: Meaning] = [
        "p": .init(group: .cpu, label: "cpu_performance_core"), "e": .init(group: .cpu, label: "cpu_efficiency_core"),
        "C": .init(group: .cpu, label: "cpu_core"), "c": .init(group: .cpu, label: "cpu_core"),
        "G": .init(group: .gpu, label: "gpu"), "g": .init(group: .gpu, label: "gpu"), "f": .init(group: .gpu, label: "gpu"),
        "B": .init(group: .other, label: "battery"), "W": .init(group: .other, label: "wifi"), "M": .init(group: .other, label: "memory"),
        "m": .init(group: .other, label: "memory"), "H": .init(group: .other, label: "storage"), "L": .init(group: .other, label: "display"),
        "s": .init(group: .other, label: "skin"), "I": .init(group: .other, label: "thunderbolt"), "P": .init(group: .other, label: "power"),
    ]
    public static func classify(_ key: String) -> Meaning {
        if let meaning = known[key] { return meaning }
        let characters = Array(key)
        return characters.count > 1 ? subsystems[characters[1]] ?? .init(group: .other, label: nil) : .init(group: .other, label: nil)
    }

    /// Every sensor that means the same thing folded into one row showing the hottest reading:
    /// a Mac exposes hundreds of keys; a dozen rows is what a person can read.
    public struct Row: Identifiable, Equatable, Sendable {
        public let group: Group
        public let label: String?          // nil: the group's unrecognized sensors
        public let sensors: [ThermalSnapshot.Sensor]   // hottest first
        public var id: String { group.rawValue + "/" + (label ?? "") }
        public var max: Double { sensors.first?.celsius ?? 0 }
        public var average: Double { sensors.isEmpty ? 0 : sensors.map(\.celsius).reduce(0, +) / Double(sensors.count) }
        public static func == (a: Row, b: Row) -> Bool { a.id == b.id && a.sensors.map(\.key) == b.sensors.map(\.key) && a.max == b.max }
    }
    /// Rows per group, hottest first, the unrecognized row last.
    public static func rows(_ sensors: [ThermalSnapshot.Sensor]) -> [Group: [Row]] {
        var buckets: [String: (Group, String?, [ThermalSnapshot.Sensor])] = [:]
        for sensor in sensors where sensor.celsius.isFinite {
            let meaning = classify(sensor.key), key = meaning.group.rawValue + "/" + (meaning.label ?? "")
            buckets[key, default: (meaning.group, meaning.label, [])].2.append(sensor)
        }
        var result: [Group: [Row]] = [:]
        for (group, label, members) in buckets.values {
            result[group, default: []].append(Row(group: group, label: label, sensors: members.sorted { $0.celsius > $1.celsius }))
        }
        for group in Group.allCases {
            result[group]?.sort { ($0.label == nil ? 1 : 0, -$0.max) < ($1.label == nil ? 1 : 0, -$1.max) }
        }
        return result
    }
    /// Warm at 70 °C, hot at 90 °C.
    public static func tone(_ celsius: Double) -> String { celsius >= 90 ? "hot" : celsius >= 70 ? "warm" : "ok" }
}

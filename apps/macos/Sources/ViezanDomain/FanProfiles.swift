import Foundation

public struct FanRule: Codable, Equatable, Sendable {
    public var sensor: String
    public var lower: Double
    public var upper: Double
    public init(sensor: String = "all", lower: Double = 45, upper: Double = 75) { self.sensor = sensor; self.lower = lower; self.upper = upper }
    public var valid: Bool { !sensor.isEmpty && sensor.count <= 64 && lower.isFinite && upper.isFinite && lower >= 20 && upper <= 110 && upper > lower }
}
public struct FanProfile: Codable, Identifiable, Sendable {
    public var id: String
    public var name: String
    public var rules: [String: FanRule]
    public init(id: String = UUID().uuidString, name: String, rules: [String: FanRule]) { self.id = id; self.name = name; self.rules = rules }
    public static let builtins: [FanProfile] = [
        .init(id: "quiet", name: "fanQuiet", rules: ["*": .init(sensor: "cpu", lower: 70, upper: 100)]),
        .init(id: "cool", name: "fanCool", rules: ["*": .init(sensor: "cpu", lower: 45, upper: 75)]),
        .init(id: "gaming", name: "fanGaming", rules: ["*": .init(sensor: "gpu", lower: 50, upper: 80)]),
        .init(id: "localAI", name: "fanLocalAI", rules: ["*": .init(sensor: "cpu", lower: 45, upper: 70)])
    ]
}
public enum FanPolicy {
    public struct Reading: Equatable, Sendable {
        public let celsius: Double
        public let rpm: Double
    }

    static func validRules(_ rules: [String: FanRule]) -> Bool {
        guard (1...16).contains(rules.count) else { return false }
        return rules.allSatisfy { key, rule in
            guard rule.valid else { return false }
            if key == "*" { return true }
            guard let index = Int(key), index >= 0 else { return false }
            return key == String(index)
        }
    }

    /// Instantaneous source temperature and target before the live loop applies smoothing and its deadband.
    public static func preview(_ snapshot: ThermalSnapshot, rule: FanRule, affinity: [Int: [String]] = [:]) -> [Int: Reading] {
        guard snapshot.ok, rule.valid else { return [:] }
        var readings: [Int: Reading] = [:]
        for fan in snapshot.fans ?? [] {
            guard let range = fan.speedRange,
                  let celsius = temperature(snapshot, source: rule.sensor, affinity: affinity, fan: fan.index) else { continue }
            let rpm = target(temperature: celsius, rule: rule, minimum: range.lowerBound, maximum: range.upperBound)
            readings[fan.index] = Reading(celsius: celsius, rpm: rpm)
        }
        return readings
    }

    public static func temperature(_ snapshot: ThermalSnapshot, source: String, affinity: [Int: [String]] = [:], fan: Int) -> Double? {
        let sensors = (snapshot.sensors ?? []).filter { $0.celsius.isFinite && $0.celsius > 0 && $0.celsius <= 150 }
        // The privileged helper enforces its thermal ceiling using SMC readings.
        let smc = sensors.filter { !$0.isHID }
        var selected: [ThermalSnapshot.Sensor]
        switch source {
        case "cpu": selected = smc.filter { $0.key.hasPrefix("TC") || $0.key.hasPrefix("Tp") || $0.key.hasPrefix("Te") || $0.key.hasPrefix("Tf") }
        case "gpu": selected = smc.filter { $0.key.hasPrefix("TG") || $0.key.hasPrefix("Tg") }
        case "all": selected = smc
        case "affinity": selected = smc.filter { affinity[fan]?.contains($0.key) == true }
        default: selected = sensors.filter { $0.key == source }
        }
        if selected.isEmpty && ["cpu", "gpu", "affinity"].contains(source) { selected = smc }
        return selected.map(\.celsius).max()
    }
    public static func target(temperature: Double, rule: FanRule, minimum: Double, maximum: Double) -> Double {
        let fraction = min(1, max(0, (temperature - rule.lower) / (rule.upper - rule.lower)))
        return min(maximum, max(minimum, ((minimum + fraction * (maximum-minimum)) / 50).rounded() * 50))
    }
}

extension ThermalSnapshot.Fan {
    var speedRange: ClosedRange<Double>? {
        guard let min, let max, min.isFinite, max.isFinite, max > min else { return nil }
        return min...max
    }
}

struct RunningFanPolicy {
    static let customID = "custom"
    private(set) var id: String
    let rules: [String: FanRule]

    init?(id: String, rules: [String: FanRule], monitoring: Bool, calibrating: Bool, fans: [ThermalSnapshot.Fan]?) {
        guard monitoring, !calibrating, let fans, !fans.isEmpty, FanPolicy.validRules(rules) else { return nil }
        // Refuse before the running mode is torn down: every fan needs a rule and a speed range.
        guard fans.allSatisfy({ $0.speedRange != nil && (rules[String($0.index)] ?? rules["*"]) != nil }) else { return nil }
        self.id = id
        self.rules = rules
    }

    mutating func adoptSavedProfile(_ profile: FanProfile) {
        if id == Self.customID && rules == profile.rules { id = profile.id }
    }
}

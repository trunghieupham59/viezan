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
    public static func temperature(_ snapshot: ThermalSnapshot, source: String, affinity: [Int: [String]] = [:], fan: Int) -> Double? {
        let sensors = (snapshot.sensors ?? []).filter { $0.celsius.isFinite && $0.celsius > 0 && $0.celsius <= 150 }
        var selected: [ThermalSnapshot.Sensor]
        switch source {
        case "cpu": selected = sensors.filter { $0.key.hasPrefix("TC") || $0.key.hasPrefix("Tp") || $0.key.hasPrefix("Te") || $0.key.hasPrefix("Tf") }
        case "gpu": selected = sensors.filter { $0.key.hasPrefix("TG") || $0.key.hasPrefix("Tg") }
        case "all": selected = sensors
        case "affinity": selected = sensors.filter { affinity[fan]?.contains($0.key) == true }
        default: selected = sensors.filter { $0.key == source }
        }
        if selected.isEmpty && ["cpu", "gpu", "affinity"].contains(source) { selected = sensors }
        return selected.map(\.celsius).max()
    }
    public static func target(temperature: Double, rule: FanRule, minimum: Double, maximum: Double) -> Double {
        let fraction = min(1, max(0, (temperature - rule.lower) / (rule.upper - rule.lower)))
        return min(maximum, max(minimum, ((minimum + fraction * (maximum-minimum)) / 50).rounded() * 50))
    }
}

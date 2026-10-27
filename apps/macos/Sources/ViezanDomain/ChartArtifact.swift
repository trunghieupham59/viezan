import Foundation
public struct ChartArtifact: Identifiable, Sendable {
    public struct Point: Identifiable, Sendable { public let id: String; public let label: String; public let series: String; public let value: Double }
    public let id: Int
    public let type: String
    public let title: String
    public let points: [Point]
    public static func parse(_ text: String) -> [ChartArtifact] {
        guard text.utf8.count <= 16_777_216, let regex = try? NSRegularExpression(pattern: #"(?m)^```chart\s*\n([\s\S]*?)\n```"#) else { return [] }
        let source = text as NSString
        return regex.matches(in: text, range: NSRange(location: 0, length: source.length)).enumerated().compactMap { index, match in
            guard let data = source.substring(with: match.range(at: 1)).data(using: .utf8), data.count <= 65536,
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let type = object["type"] as? String, ["bar", "line", "pie"].contains(type),
                  let labels = object["labels"] as? [String], !labels.isEmpty, labels.count <= 24,
                  let series = object["series"] as? [[String: Any]], !series.isEmpty, series.count <= 4 else { return nil }
            var points: [Point] = []
            for (s, record) in series.enumerated() {
                guard let values = record["values"] as? [Any], values.count == labels.count else { return nil }
                for (l, raw) in values.enumerated() {
                    guard let value = (raw as? NSNumber)?.doubleValue ?? (raw as? String).flatMap(Double.init), value.isFinite else { return nil }
                    if type == "pie" && s > 0 { continue }
                    points.append(Point(id: "\(s):\(l)", label: String(labels[l].prefix(40)), series: String((record["name"] as? String ?? "\(s + 1)").prefix(80)), value: type == "pie" ? max(0, value) : value))
                }
            }
            return ChartArtifact(id: index, type: type, title: String((object["title"] as? String ?? "").prefix(80)), points: points)
        }
    }
}

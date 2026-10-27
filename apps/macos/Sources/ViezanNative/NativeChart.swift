import SwiftUI
import Charts
import ViezanDomain
struct NativeChart: View {
    let artifact: ChartArtifact
    var body: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            if !artifact.title.isEmpty { Text(artifact.title).font(.headline) }
            Chart(artifact.points) { point in
                if artifact.type == "pie" {
                    SectorMark(angle: .value(point.label, point.value)).foregroundStyle(by: .value("", point.label)).accessibilityLabel(point.label).accessibilityValue(String(point.value))
                } else if artifact.type == "line" {
                    LineMark(x: .value("", point.label), y: .value(point.series, point.value)).foregroundStyle(by: .value("", point.series))
                    PointMark(x: .value("", point.label), y: .value(point.series, point.value)).foregroundStyle(by: .value("", point.series))
                } else { BarMark(x: .value("", point.label), y: .value(point.series, point.value)).foregroundStyle(by: .value("", point.series)).position(by: .value("", point.series)) }
            }.frame(height: metric("editor") * 2)
            DisclosureGroup(artifact.title.isEmpty ? "CSV" : artifact.title) {
                Text(artifact.points.map { $0.series + " · " + $0.label + ": " + String($0.value) }.joined(separator: "\n")).textSelection(.enabled)
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

import SwiftUI
import ViezanDomain

// Web and deep research under an answer: the phase line stays one row; opening it
// shows every phase, the queries with their progress, the numbered sources the
// answer cites and the findings gathered so far. Reading never calls a provider.
struct ResearchPanel: View {
    let store: WorkbenchStore
    let task: WorkTask
    let research: ResearchState
    @State private var expanded = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var scheme
    private static let phases = ["analyze", "survey", "cross", "gap", "synth", "done"]
    private var currentIndex: Int { Self.phases.firstIndex(of: research.phase) ?? 0 }
    var body: some View {
        glassBody
    }
    // Chat-States: one flat card; the 40 pt head names the phase with counts, and
    // opening it shows numbered steps beside the queries, sources and findings.
    private var glassBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { withAnimation(reduceMotion ? nil : .default) { expanded.toggle() } } label: {
                HStack(spacing: metric("small")) {
                    StatusDot(tone: task.status == .running ? .busy : task.status == .succeeded ? .ready : task.status == .failed ? .failed : .idle)
                        .background(Circle().fill(contentColor("action", scheme).opacity(task.status == .running ? metric("selectionOpacity") * 2 : 0)).padding(-metric("hairline") * 3))
                    Text(store.text("research_" + research.phase)).fontWeight(.semibold).foregroundStyle(contentColor("text-strong", scheme))
                    Text(counts).foregroundStyle(contentColor("text-muted", scheme)).monospacedDigit().lineLimit(1)
                    Spacer(minLength: metric("small"))
                    Image(systemName: expanded ? "chevron.up" : "chevron.down").imageScale(.small).foregroundStyle(contentColor("text-soft", scheme))
                }.padding(.horizontal, metric("gap") + metric("hairline") * 2).frame(height: metric("navControl")).contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityLabel(store.text("researchSteps") + ": " + store.text("research_" + research.phase) + ", " + counts)
                .accessibilityAddTraits(expanded ? .isSelected : []).accessibilityIdentifier("research-toggle")
            if expanded {
                CardDivider()
                HStack(alignment: .top, spacing: metric("inset")) {
                    VStack(alignment: .leading, spacing: metric("tight")) {
                        Eyebrow(text: store.text("researchSteps")).padding(.bottom, metric("tight"))
                        ForEach(Array(Self.phases.dropLast().enumerated()), id: \.offset) { index, phase in
                            HStack(spacing: metric("small") + metric("hairline") * 2) {
                                stepMark(index)
                                Text(store.text("research_" + phase))
                                    .fontWeight(index == currentIndex && research.phase != "done" ? .semibold : .regular)
                                    .foregroundStyle(contentColor(index <= currentIndex || research.phase == "done" ? "text-strong" : "text-soft", scheme))
                                if index == currentIndex, research.round > 0, research.phase != "done" {
                                    Text(store.text("researchRound").replacingOccurrences(of: "{n}", with: String(research.round))).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme))
                                }
                            }.frame(minHeight: metric("gutter") + metric("tight"))
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                    VStack(alignment: .leading, spacing: metric("gap")) { details }.frame(maxWidth: .infinity, alignment: .leading)
                }.padding(.horizontal, metric("gap") + metric("hairline") * 2).padding(.top, metric("gap") - metric("hairline") * 2).padding(.bottom, metric("gap"))
            }
        }.cardSurface(padded: false).accessibilityElement(children: .contain)
    }
    /// "1:42", or "1:02:05" past an hour; never negative when the clock moved.
    static func elapsed(_ seconds: Double) -> String {
        let value = seconds.isFinite ? Int(min(max(0, seconds), 359_999)) : 0
        return value >= 3600 ? String(format: "%d:%02d:%02d", value / 3600, value / 60 % 60, value % 60) : String(format: "%d:%02d", value / 60, value % 60)
    }
    private var counts: String {
        var parts: [String] = []
        if !research.queries.isEmpty { parts.append("\(min(research.cursor, research.queries.count))/\(research.queries.count) " + store.text("researchQueries").lowercased()) }
        if !research.sources.isEmpty { parts.append("\(research.sources.count) " + store.text("researchSources").lowercased()) }
        return parts.joined(separator: " · ")
    }
    // Done steps: soft success disc with a check; the current one: accent disc with its number; later ones: an outline.
    @ViewBuilder private func stepMark(_ index: Int) -> some View {
        let size = metric("inset") + metric("hairline") * 2
        if index < currentIndex || research.phase == "done" {
            Image(systemName: "checkmark").font(.system(size: metric("gap") - metric("tight"), weight: .bold)).foregroundStyle(contentColor("success", scheme))
                .frame(width: size, height: size).background(contentColor("success", scheme).opacity(metric("selectionOpacity") * 1.4), in: Circle())
        } else if index == currentIndex {
            Text(String(index + 1)).font(.system(size: metric("gap") - metric("hairline") * 2, weight: .bold)).foregroundStyle(contentColor("action-fg", scheme))
                .frame(width: size, height: size).background(contentColor(task.status == .failed ? "danger" : "action", scheme), in: Circle())
        } else {
            Text(String(index + 1)).font(.system(size: metric("gap") - metric("hairline") * 2, weight: .semibold)).foregroundStyle(contentColor("text-soft", scheme))
                .frame(width: size, height: size).overlay(Circle().strokeBorder(contentColor("border-strong", scheme), lineWidth: metric("hairline")))
        }
    }
    @ViewBuilder private var details: some View {
        if !research.queries.isEmpty {
            VStack(alignment: .leading, spacing: metric("tight")) {
                Eyebrow(text: store.text("researchQueries"))
                ForEach(Array(research.queries.enumerated()), id: \.offset) { index, query in
                    HStack(alignment: .firstTextBaseline, spacing: metric("small") - metric("hairline") * 2) {
                        Image(systemName: index < research.cursor ? "checkmark" : "circle").imageScale(.small)
                            .foregroundStyle(contentColor(index < research.cursor ? "success" : "text-soft", scheme)).accessibilityHidden(true)
                        Text(query).font(.vzn("smallScale")).foregroundStyle(contentColor(index < research.cursor ? "text-strong" : "text-soft", scheme)).textSelection(.enabled)
                    }
                }
            }
        }
        if !research.sources.isEmpty {
            VStack(alignment: .leading, spacing: metric("tight")) {
                Eyebrow(text: store.text("researchSources"))
                ForEach(Array(research.sources.enumerated()), id: \.offset) { index, source in
                    HStack(alignment: .firstTextBaseline, spacing: metric("small")) {
                        Text("[\(index + 1)]").font(.vzn("smallScale")).monospacedDigit().foregroundStyle(contentColor("text-muted", scheme))
                        if let url = URL(string: source.url) {
                            Link(destination: url) { Text(source.title).font(.vzn("smallScale")).foregroundStyle(contentColor("action-text", scheme)).lineLimit(1) }.help(source.url)
                        } else { Text(source.title).font(.vzn("smallScale")) }
                    }
                }
            }
        }
        if !research.findings.isEmpty {
            VStack(alignment: .leading, spacing: metric("tight")) {
                Eyebrow(text: store.text("researchFindings") + " · " + String(research.findings.count))
                ForEach(Array(research.findings.enumerated()), id: \.offset) { _, finding in
                    Text(finding).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).lineLimit(3).textSelection(.enabled)
                }
            }
        }
    }
}

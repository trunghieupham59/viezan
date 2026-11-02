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
    @Environment(\.colorScheme) private var scheme
    private static let phases = ["analyze", "survey", "cross", "gap", "synth", "done"]
    private var currentIndex: Int { Self.phases.firstIndex(of: research.phase) ?? 0 }
    private func tone(_ index: Int) -> StatusTone {
        if index < currentIndex || research.phase == "done" { return .ready }
        if index == currentIndex { return task.status == .running ? .busy : task.status == .succeeded ? .ready : .failed }
        return .idle
    }
    var body: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            Button { withAnimation { expanded.toggle() } } label: {
                HStack(spacing: metric("small")) {
                    if task.status == .running { ProgressView().controlSize(.small) } else { StatusDot(tone: task.status == .succeeded ? .ready : task.status == .failed ? .failed : .idle) }
                    Text(store.text("research_" + research.phase))
                    if !research.queries.isEmpty { Text("\(min(research.cursor, research.queries.count))/\(research.queries.count)").monospacedDigit() }
                    if !research.sources.isEmpty { Text("· \(research.sources.count) " + store.text("researchSources").lowercased()) }
                    Image(systemName: expanded ? "chevron.up" : "chevron.down").imageScale(.small)
                }.font(.vzn("captionScale")).foregroundStyle(.secondary).contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityLabel(store.text("researchSteps")).accessibilityAddTraits(expanded ? .isSelected : [])
                .accessibilityIdentifier("research-toggle")
            if expanded {
                VStack(alignment: .leading, spacing: metric("inset")) {
                    VStack(alignment: .leading, spacing: metric("small")) {
                        Eyebrow(text: store.text("researchSteps"))
                        ForEach(Array(Self.phases.enumerated()), id: \.offset) { index, phase in
                            HStack(spacing: metric("small")) {
                                StatusDot(tone: tone(index))
                                Text(store.text("research_" + phase)).foregroundStyle(index <= currentIndex ? contentColor("text-strong", scheme) : contentColor("text-muted", scheme))
                                if index == currentIndex, research.round > 0 { Text(store.text("researchRound").replacingOccurrences(of: "{n}", with: String(research.round))).foregroundStyle(.secondary) }
                            }.font(.vzn("smallScale"))
                        }
                    }
                    if !research.queries.isEmpty {
                        VStack(alignment: .leading, spacing: metric("tight")) {
                            Eyebrow(text: store.text("researchQueries"))
                            ForEach(Array(research.queries.enumerated()), id: \.offset) { index, query in
                                HStack(alignment: .firstTextBaseline, spacing: metric("small")) {
                                    Image(systemName: index < research.cursor ? "checkmark.circle" : "circle").imageScale(.small).foregroundStyle(index < research.cursor ? contentColor("success", scheme) : contentColor("text-soft", scheme)).accessibilityHidden(true)
                                    Text(query).font(.vzn("smallScale")).textSelection(.enabled)
                                }
                            }
                        }
                    }
                    if !research.sources.isEmpty {
                        VStack(alignment: .leading, spacing: metric("tight")) {
                            Eyebrow(text: store.text("researchSources"))
                            ForEach(Array(research.sources.enumerated()), id: \.offset) { index, source in
                                HStack(alignment: .firstTextBaseline, spacing: metric("small")) {
                                    Text("[\(index + 1)]").font(.vzn("smallScale")).monospacedDigit().foregroundStyle(.secondary)
                                    if let url = URL(string: source.url) {
                                        Link(destination: url) {
                                            VStack(alignment: .leading, spacing: 0) {
                                                Text(source.title).font(.vzn("smallScale")).foregroundStyle(contentColor("action-text", scheme)).lineLimit(1)
                                                Text(url.host ?? source.url).font(.vzn("captionScale")).foregroundStyle(.secondary).lineLimit(1)
                                            }
                                        }.help(source.url)
                                    } else { Text(source.title).font(.vzn("smallScale")) }
                                }
                            }
                        }
                    }
                    if !research.findings.isEmpty {
                        VStack(alignment: .leading, spacing: metric("tight")) {
                            Eyebrow(text: store.text("researchFindings") + " · " + String(research.findings.count))
                            ForEach(Array(research.findings.enumerated()), id: \.offset) { _, finding in
                                Text(finding).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(3).textSelection(.enabled)
                            }
                        }
                    }
                }.padding(metric("inset")).frame(maxWidth: .infinity, alignment: .leading)
                    .background(contentColor("surface-muted", scheme), in: RoundedRectangle(cornerRadius: metric("radius")))
                    .accessibilityElement(children: .contain)
            }
        }
    }
}

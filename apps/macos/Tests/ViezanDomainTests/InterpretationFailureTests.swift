import Foundation
import Testing
@testable import ViezanDomain

// The same failure twice in a row is two events: the UI shows its toast again.
@Test @MainActor func repeatedSummaryLimitCountsEachFailure() throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: folder) }
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    var meeting = InterpretationSession(model: "openai:gpt-4.1", provider: "openai", source: "en", target: "vi", locale: "vi")
    meeting.segments = [InterpretationSegment(start: 0, end: 1, original: String(repeating: "a", count: 262_145), translated: "", status: "done")]
    try JSONEncoder().encode([meeting]).write(to: folder.appendingPathComponent("interpretation.json"))
    let interpretation = Interpretation(file: folder.appendingPathComponent("interpretation.json"))
    #expect(interpretation.error == nil && interpretation.failures == 0)

    interpretation.summarize()
    #expect(interpretation.error == "interpretSummaryLimit" && interpretation.failures == 1)
    interpretation.summarize()
    #expect(interpretation.error == "interpretSummaryLimit" && interpretation.failures == 2)
}

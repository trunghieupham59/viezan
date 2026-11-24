import Foundation
import Testing
@testable import ViezanDomain

@Test func pullStepReadsBytesAndRejectsBadLines() throws {
    let step = try PullStep.parse(Data(#"{"status":"pulling 6a0746a1ec1a","digest":"sha256:6a07","total":4900000000,"completed":2100000000}"#.utf8))
    #expect(step == PullStep(status: "pulling 6a0746a1ec1a", completed: 2_100_000_000, total: 4_900_000_000, digest: "sha256:6a07"))
    #expect(abs((step.fraction ?? 0) - 2.1 / 4.9) < 0.0001)
    // Manifest lines carry no sizes: no progress, never a division by zero.
    let manifest = try PullStep.parse(Data(#"{"status":"pulling manifest"}"#.utf8))
    #expect(manifest.fraction == nil && manifest.total == 0)
    // Out-of-range or inconsistent sizes are clamped, not shown.
    #expect(try PullStep.parse(Data(#"{"status":"x","total":100,"completed":250}"#.utf8)).completed == 100)
    #expect(try PullStep.parse(Data(#"{"status":"x","total":-5,"completed":3}"#.utf8)).fraction == nil)
    #expect(try PullStep.parse(Data(#"{"status":"x","total":1e30,"completed":1}"#.utf8)).fraction == nil)
    #expect(try PullStep.parse(Data(#"{"completed":1,"total":2}"#.utf8)).status == "running")
    #expect(throws: (any Error).self) { try PullStep.parse(Data(#"{"error":"pull model manifest: file does not exist"}"#.utf8)) }
    #expect(throws: (any Error).self) { try PullStep.parse(Data("not json".utf8)) }
    #expect(throws: (any Error).self) { try PullStep.parse(Data("[1]".utf8)) }
}

@Test func pullProgressCountsEachLayerOnceAcrossInterleavedUpdates() throws {
    var progress = PullProgress()
    func consume(_ json: String) throws -> PullStep { try progress.consume(Data(json.utf8)) }
    #expect(try consume(#"{"status":"pulling manifest"}"#).fraction == nil)
    _ = try consume(#"{"digest":"sha256:a","total":100,"completed":70}"#)
    let second = try consume(#"{"digest":"sha256:b","total":50,"completed":10}"#)
    #expect(second.completed == 80 && second.total == 150)
    _ = try consume(#"{"digest":"sha256:b","total":50,"completed":10}"#)
    _ = try consume(#"{"digest":"sha256:a","total":100,"completed":60}"#)
    let last = try consume(#"{"digest":"sha256:a","total":100,"completed":100}"#)
    #expect(last.completed == 110 && last.total == 150)
    let verify = try consume(#"{"status":"verifying sha256 digest"}"#)
    #expect(verify.completed == 110 && verify.total == 150)
    #expect(verify.statusKey == "localPullVerifying")
    #expect(try consume(#"{"status":"writing manifest"}"#).statusKey == "localPullFinishing")
    #expect(try consume(#"{"status":"unknown phase"}"#).statusKey == "localPullDownloading")
    var fresh = PullProgress()
    #expect(try fresh.consume(Data(#"{"status":"pulling manifest"}"#.utf8)).fraction == nil)
}

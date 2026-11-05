import Foundation
import Testing
@testable import ViezanDomain

@Test func selectionReplacementUsesUTF16AndPreservesSurroundingText() throws {
    let plan = try #require(SelectionReplacement(value: "Hi 🌏 world!", selected: "world", range: CFRange(location: 6, length: 5), replacement: "世界"))
    #expect(plan.expected == "Hi 🌏 世界!")
    #expect(SelectionReplacement(value: "abc", selected: "wrong", range: CFRange(location: 0, length: 3), replacement: "x") == nil)
    #expect(SelectionReplacement(value: "abc", selected: "a", range: CFRange(location: Int.max, length: 1), replacement: "x") == nil)
    #expect(SelectionReplacement(value: "abc", selected: "a", range: CFRange(location: -1, length: 1), replacement: "x") == nil)
}

@Test @MainActor func selectionReplacementRejectsAcceptedButUnchangedWrites() async throws {
    let plan = try #require(SelectionReplacement(value: "hello", selected: "hello", range: CFRange(location: 0, length: 5), replacement: "こんにちは"))
    var reads = 0
    let result = await plan.verify(read: { reads += 1; return "hello" }, pause: {})
    #expect(!result)
    #expect(reads == 12)
    #expect(await plan.verify(read: { nil }, pause: {}) == false)
    #expect(await plan.verify(read: { "unrelated user edit" }, pause: {}) == false)
}

@Test @MainActor func selectionReplacementWaitsForExactDocumentAndHonorsCancellation() async throws {
    let plan = try #require(SelectionReplacement(value: "hello", selected: "hello", range: CFRange(location: 0, length: 5), replacement: "こんにちは"))
    var reads = 0
    #expect(await plan.verify(read: { reads += 1; return reads < 3 ? "hello" : "こんにちは" }, pause: {}))
    #expect(reads == 3)
    #expect(await plan.verify(read: { "hello" }, pause: { throw CancellationError() }) == false)
    let task = Task { @MainActor in
        withUnsafeCurrentTask { $0?.cancel() }
        return await plan.verify(read: { "こんにちは" }, pause: {})
    }
    #expect(await task.value == false)
}

@Test @MainActor func selectionReplacementDoesNotClaimAnUnchangedTranslationWasEdited() async throws {
    let plan = try #require(SelectionReplacement(value: "hello", selected: "hello", range: CFRange(location: 0, length: 5), replacement: "hello"))
    #expect(await plan.verify(read: { "hello" }, pause: {}) == false)
}

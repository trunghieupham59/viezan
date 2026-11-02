import Testing
import ViezanDomain
@testable import ViezanNative

@MainActor private final class LabelStorage: WorkspacePersistence {
    func load() throws -> Workspace? { Workspace() }
    func save(_ workspace: Workspace) throws {}
}

@MainActor @Test func modelLabelReadsProviderAndDropsReleaseDates() {
    let store = WorkbenchStore(persistence: LabelStorage(), automaticProvider: false)
    #expect(nativeModelLabel("claude:claude-haiku-4-5-20251001", store: store) == "Claude · claude-haiku-4-5")
    #expect(nativeModelLabel("openai:gpt-4.1-mini-2025-04-14", store: store) == "OpenAI · gpt-4.1-mini")
    #expect(nativeModelLabel("ollama:qwen3:4b", store: store) == "Ollama · qwen3:4b")
}

@MainActor @Test func toastCenterReplacesSameKeyAndRunsUndoOnce() {
    let center = ToastCenter()
    var undone = 0
    center.show("first", key: "archive-1", actionLabel: "Undo") { undone += 1 }
    center.show("second", key: "archive-1", actionLabel: "Undo") { undone += 10 }
    #expect(center.toasts.count == 1)
    #expect(center.toasts.first?.text == "second")
    let id = center.toasts[0].id
    center.run(id); center.run(id)
    #expect(undone == 10)
    #expect(center.toasts.isEmpty)
    for index in 0..<5 { center.show("toast \(index)") }
    #expect(center.toasts.count == ToastCenter.maximum)
    #expect(center.toasts.first?.text == "toast 2")
}

@Test func paletteQueryReadsSumsPrefixesAndQuestions() {
    #expect(PaletteQuery.parse("12*7+3") == .calculation("87"))
    #expect(PaletteQuery.parse("t good evening") == .translate("good evening"))
    #expect(PaletteQuery.parse("D serendipity") == .lookup("serendipity"))
    #expect(PaletteQuery.parse("?what is REST") == .ask("what is REST"))
    #expect(PaletteQuery.parse("?? verify this") == .ask("verify this"))
    #expect(PaletteQuery.parse("t ") == nil)
    #expect(PaletteQuery.parse("translate") == nil)
    #expect(PaletteQuery.parse("") == nil)
}

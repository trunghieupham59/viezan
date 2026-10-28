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

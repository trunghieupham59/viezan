import Testing
@testable import ViezanDomain

@Test @MainActor func chatReasoningSynchronizesFlagsWithoutInvalidatingWork() throws {
    let store = WorkbenchStore(persistence: MemoryPersistence(), automaticProvider: false)
    let id = store.session.id
    store.setDraft(id, "Question")
    let task = try #require(store.submit(id))
    let revision = store.session.revision
    store.setChatReasoning(id, effort: "high")
    #expect(store.session.carefulReasoning == true)
    #expect(store.session.reasoningEffort == "high")
    store.setChatReasoning(id, effort: "medium")
    #expect(store.session.carefulReasoning == false)
    #expect(store.session.reasoningEffort == "medium")
    store.setChatReasoning(id, effort: "unknown")
    #expect(store.session.reasoningEffort == "medium")
    #expect(store.session.revision == revision)
    #expect(store.running(id)?.id == task.id)
    store.navigate(.translate)
    let translation = store.session
    store.setChatReasoning(translation.id, effort: "high")
    #expect(store.session == translation)
}
@Test @MainActor func carefulReasoningSynchronizesEffortAndPreservesMiddleLevels() {
    let store = WorkbenchStore(persistence: MemoryPersistence(), automaticProvider: false)
    let id = store.session.id
    store.setCarefulReasoning(id, true)
    #expect(store.session.reasoningEffort == "high")
    store.setCarefulReasoning(id, false)
    #expect(store.session.reasoningEffort == "auto")
    #expect(store.session.carefulReasoning == false)
    store.setChatReasoning(id, effort: "low"); store.setCarefulReasoning(id, false)
    #expect(store.session.reasoningEffort == "low")
}
@Test func effortSupportUsesProviderPolicy() {
    for model in ["openai:gpt-5.5", "claude:claude-opus-5-5", "gemini:gemini-3-pro", "gemini:gemini-2.5-flash"] { #expect(ModelLineup.supportsEffort(model: model)) }
    for model in ["ollama:llama3.2", "lmstudio:gpt-5.5", "llamacpp:gemini-3-pro", "openai:gpt-5-chat", "claude:claude-haiku-5-5", "unknown:gpt-5.5"] { #expect(!ModelLineup.supportsEffort(model: model)) }
}

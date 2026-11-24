import Foundation
import Testing
@testable import ViezanDomain

@Test func pinnedModelsFormTheirOwnGroupAndLeaveRecent() {
    let listings = ["openai": ["openai:gpt-5.5", "openai:gpt-5.5-mini"], "claude": ["claude:claude-sonnet-5-5", "claude:claude-haiku-5-5"]]
    let tiers: [ModelTier: String] = [.fast: "openai:gpt-5.5-mini", .balanced: "openai:gpt-5.5", .careful: "openai:gpt-5.5"]
    let cloud = ["openai", "claude", "gemini"], local = ["ollama"]
    let idle = ModelLineup.sections(query: "", tiers: tiers, pinned: ["claude:claude-haiku-5-5", "openai:gpt-7"], recent: ["claude:claude-haiku-5-5", "claude:claude-sonnet-5-5"],
                                    listings: listings, cloud: cloud, local: local)
    #expect(idle.map(\.key) == ["purpose", "pinned", "recent", "openai", "claude", "gemini", "local"])
    // A pinned model the listing lacks stays reachable; pinned models are not repeated under Recent.
    #expect(idle[1].rows == [.model("claude:claude-haiku-5-5"), .model("openai:gpt-7")])
    #expect(idle[2].rows == [.model("claude:claude-sonnet-5-5")])
    // A model offered by purpose can still be pinned by name.
    #expect(ModelLineup.sections(query: "", tiers: tiers, pinned: ["openai:gpt-5.5"], recent: [], listings: listings, cloud: cloud, local: local)[1].rows == [.model("openai:gpt-5.5")])
    // Search lists matches only; no pinned group.
    #expect(ModelLineup.sections(query: "mini", tiers: tiers, pinned: ["claude:claude-haiku-5-5"], recent: [], listings: listings, cloud: cloud, local: local).map(\.key) == ["openai"])
    #expect(!ModelLineup.sections(query: "", tiers: nil, recent: [], listings: listings, cloud: cloud, local: local).contains { $0.key == "pinned" })
}

@Test @MainActor func pinnedModelsToggleValidateAndPersist() throws {
    let persistence = MemoryPersistence()
    let store = WorkbenchStore(persistence: persistence, automaticProvider: false)
    #expect(store.pinnedModels.isEmpty && store.workspace.pinnedModels == nil)
    store.togglePinnedModel("not a model")
    #expect(store.pinnedModels.isEmpty)
    store.togglePinnedModel("openai:gpt-5.5")
    store.togglePinnedModel("claude:claude-sonnet-5-5")
    #expect(store.pinnedModels == ["openai:gpt-5.5", "claude:claude-sonnet-5-5"])
    let restored = WorkbenchStore(persistence: persistence, automaticProvider: false)
    #expect(restored.pinnedModels == ["openai:gpt-5.5", "claude:claude-sonnet-5-5"])
    restored.togglePinnedModel("openai:gpt-5.5")
    #expect(restored.pinnedModels == ["claude:claude-sonnet-5-5"])
    restored.togglePinnedModel("claude:claude-sonnet-5-5")
    #expect(restored.workspace.pinnedModels == nil)
    // Bounded: the list never grows past the limit, and unpinning still works at the limit.
    for index in 0..<(WorkbenchStore.pinnedModelLimit + 2) { restored.togglePinnedModel("openai:gpt-\(index)") }
    #expect(restored.pinnedModels.count == WorkbenchStore.pinnedModelLimit)
    #expect(!restored.canPinModel("openai:gpt-99") && restored.canPinModel("openai:gpt-0"))
    restored.togglePinnedModel("openai:gpt-0")
    #expect(restored.pinnedModels.count == WorkbenchStore.pinnedModelLimit - 1)
}

@Test @MainActor func pinnedModelsRejectInvalidStorageAndBlockedWorkspace() throws {
    var workspace = WorkbenchStore(persistence: MemoryPersistence(), automaticProvider: false).workspace
    workspace.pinnedModels = ["openai:gpt-5.5", "openai:gpt-5.5"]
    #expect(throws: StorageFailure.self) { _ = try workspace.validated() }
    workspace.pinnedModels = ["no provider"]
    #expect(throws: StorageFailure.self) { _ = try workspace.validated() }
    workspace.pinnedModels = (0...WorkbenchStore.pinnedModelLimit).map { "openai:gpt-\($0)" }
    #expect(throws: StorageFailure.self) { _ = try workspace.validated() }
    workspace.pinnedModels = ["openai:gpt-5.5"]
    #expect(try workspace.validated().pinnedModels == ["openai:gpt-5.5"])
    // A workspace written before pinning existed has no field and still loads.
    var legacy = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(workspace)) as? [String: Any])
    legacy.removeValue(forKey: "pinnedModels")
    #expect(try JSONDecoder().decode(Workspace.self, from: JSONSerialization.data(withJSONObject: legacy)).validated().pinnedModels == nil)
    let persistence = MemoryPersistence()
    persistence.failLoad = true
    let blocked = WorkbenchStore(persistence: persistence, automaticProvider: false)
    blocked.togglePinnedModel("openai:gpt-5.5")
    #expect(blocked.pinnedModels.isEmpty && persistence.writes == 0)
}

import Foundation
import Testing
@testable import ViezanDomain

@MainActor final class MemoryPersistence: WorkspacePersistence {
    var value: Workspace?
    var failLoad = false
    var failSave = false
    var writes = 0
    func load() throws -> Workspace? { if failLoad { throw StorageFailure.invalidData }; return value }
    func save(_ workspace: Workspace) throws { if failSave { throw StorageFailure.invalidData }; value = workspace; writes += 1 }
}

@Test @MainActor func sessionsKeepIndependentDraftsAndModelsWhileTasksRun() throws {
    let store = WorkbenchStore(persistence: MemoryPersistence(), automaticProvider: false)
    let chat = store.session.id
    store.setDraft(chat, "Chat prompt"); store.setModel(chat, "demo.slow")
    let first = try #require(store.submit(chat))
    store.setDraft(chat, "Next message")
    store.navigate(.translate)
    let translate = store.session.id
    store.setDraft(translate, "Translate prompt")
    let second = try #require(store.submit(translate))
    store.setModel(chat, "demo.standard")
    store.receive(taskID: first.id, attemptID: first.attemptID, chunk: "Reply")
    #expect(store.session.id == translate)
    #expect(store.session.model == "demo.standard")
    #expect(store.session.output.isEmpty)
    #expect(first.request.model == "demo.slow")
    store.cancel(first.id)
    #expect(store.running(translate)?.id == second.id)
    store.select(chat)
    #expect(store.session.draft == "Next message")
    #expect(store.session.messages.last?.text == "Reply")
}

@Test @MainActor func cancellationAndRetryRejectOldAttemptWithoutDuplicatingMessages() throws {
    let store = WorkbenchStore(persistence: MemoryPersistence(), automaticProvider: false)
    store.setDraft(store.session.id, "Question")
    let task = try #require(store.submit(store.session.id))
    store.cancel(task.id)
    store.receive(taskID: task.id, attemptID: task.attemptID, chunk: "late")
    #expect(store.session.messages.last?.text == "")
    store.retry(task.id)
    let attempt = try #require(store.running(store.session.id))
    #expect(attempt.attemptID != task.attemptID)
    #expect(attempt.attemptNumber == 2)
    store.receive(taskID: task.id, attemptID: task.attemptID, chunk: "old attempt", terminal: .succeeded)
    store.receive(taskID: attempt.id, attemptID: attempt.attemptID, chunk: "New reply", terminal: .succeeded)
    #expect(store.session.messages.count == 2)
    #expect(store.session.messages.last?.text == "New reply")
    #expect(store.workspace.tasks.count == 1)
}

@Test @MainActor func editingTranslationInvalidatesOutputAndStaleCompletion() throws {
    let store = WorkbenchStore(persistence: MemoryPersistence(), automaticProvider: false)
    store.navigate(.translate)
    let id = store.session.id
    store.setDraft(id, "Original")
    let task = try #require(store.submit(id))
    store.receive(taskID: task.id, attemptID: task.attemptID, chunk: "Old result")
    store.setDraft(id, "Edited")
    store.receive(taskID: task.id, attemptID: task.attemptID, chunk: "late", terminal: .succeeded)
    #expect(store.session.draft == "Edited")
    #expect(store.session.output.isEmpty)
    #expect(!store.canRetry(store.workspace.tasks[0]))
    let next = try #require(store.submit(id))
    store.setPair(id, source: "en", target: "ja")
    store.receive(taskID: next.id, attemptID: next.attemptID, chunk: "wrong language", terminal: .succeeded)
    #expect(store.session.output.isEmpty)
    #expect(store.session.target == "ja")
}

@Test @MainActor func recoveryKeepsPartialResultAndNeverRestartsTasks() throws {
    let persistence = MemoryPersistence()
    let first = WorkbenchStore(persistence: persistence, automaticProvider: false)
    first.setDraft(first.session.id, "Question")
    let task = try #require(first.submit(first.session.id))
    first.receive(taskID: task.id, attemptID: task.attemptID, chunk: "Partial")
    first.setDraft(first.session.id, "Unsent draft")
    let recovered = WorkbenchStore(persistence: persistence, automaticProvider: false)
    #expect(recovered.recovered)
    #expect(recovered.workspace.tasks[0].status == .interrupted)
    #expect(recovered.session.messages.last?.text == "Partial")
    #expect(recovered.session.draft == "Unsent draft")
    #expect(recovered.running(recovered.session.id) == nil)
}

@Test @MainActor func storageFailureIsVisibleAndRetryDoesNotDiscardDraft() {
    let persistence = MemoryPersistence()
    let store = WorkbenchStore(persistence: persistence, automaticProvider: false)
    persistence.failSave = true
    store.setDraft(store.session.id, "Keep me")
    #expect(store.storageError == "storageError")
    #expect(store.session.draft == "Keep me")
    persistence.failSave = false; store.save()
    #expect(store.storageError == nil)
    #expect(persistence.value?.sessions.first?.draft == "Keep me")
}

@Test @MainActor func malformedStorageIsNotOverwritten() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("workbench.json")
    let original = Data("invalid-json".utf8)
    try original.write(to: url)
    let store = WorkbenchStore(persistence: FilePersistence(url: url), automaticProvider: false)
    store.setDraft(store.session.id, "New in-memory draft"); store.save()
    #expect(store.loadBlocked)
    #expect(try Data(contentsOf: url) == original)
}

@Test @MainActor func fileRoundTripAndSchemaValidation() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let storage = FilePersistence(url: directory.appendingPathComponent("workbench.json"))
    var workspace = Workspace()
    workspace.sessions[0].draft = "日本語・Tiếng Việt"
    try storage.save(workspace)
    #expect(try storage.load() == workspace)
    workspace.schemaVersion = 99
    try storage.save(workspace)
    #expect(throws: (any Error).self) { try storage.load() }
}

@Test func resourcesHaveLocaleParityAndCanonicalMetrics() {
    let resource = NativeResources.shared
    #expect(Set(resource.locales["vi"]!.keys) == Set(resource.locales["en"]!.keys))
    #expect(Set(resource.locales["vi"]!.keys) == Set(resource.locales["ja"]!.keys))
    #expect(resource.fixtures.models.count == 3)
    #expect(resource.metric("reading") > resource.metric("sidebar"))
    #expect(resource.textScales["small"]! < resource.textScales["medium"]!)
    #expect(resource.textScales["large"]! > resource.textScales["medium"]!)
}

@Test @MainActor func appearancePersistsWithoutChangingSessionsOrRunningRequests() throws {
    let persistence = MemoryPersistence()
    let store = WorkbenchStore(persistence: persistence, automaticProvider: false)
    store.setDraft(store.session.id, "Question")
    let task = try #require(store.submit(store.session.id))
    store.setDraft(store.session.id, "Unsent next message")
    let before = store.workspace
    store.setAppearance(mode: .light, textSize: .large)
    store.setLocale("ja")
    #expect(store.workspace.sessions == before.sessions)
    #expect(store.workspace.tasks == before.tasks)
    #expect(store.workspace.active == before.active)
    #expect(store.workspace.tasks.first?.request.locale == task.request.locale)
    let restored = WorkbenchStore(persistence: persistence, automaticProvider: false)
    #expect(restored.workspace.preferences.mode == .light)
    #expect(restored.workspace.preferences.textSize == .large)
    #expect(restored.session.draft == "Unsent next message")
    #expect(restored.workspace.locale == "ja")
    #expect(restored.workspace.tasks.first?.status == .interrupted)
    persistence.failSave = true
    store.setAppearance(mode: .dark)
    #expect(store.storageError == "storageError")
    #expect(store.session.draft == "Unsent next message")
    persistence.failSave = false; store.save()
    #expect(persistence.value?.preferences.mode == .dark)
}

@Test func oldSnapshotsDefaultAppearanceAndInvalidValuesFailClosed() throws {
    let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../../contracts/native-workbench/recovery-fixture.json")
    let original = try Data(contentsOf: url)
    let old = try JSONDecoder().decode(Workspace.self, from: original).validated()
    #expect(old.preferences.mode == .system)
    #expect(old.preferences.textSize == .medium)
    var object = try #require(JSONSerialization.jsonObject(with: original) as? [String: Any])
    object["appearance"] = ["mode": "invalid", "textSize": "large"]
    let invalid = try JSONSerialization.data(withJSONObject: object)
    #expect(throws: (any Error).self) { try JSONDecoder().decode(Workspace.self, from: invalid) }
}

@Test func settingsSearchIncludesLocalizedRowLabelsWithoutDiacritics() {
    let resource = NativeResources.shared
    #expect(resource.settings(query: "  ", locale: "vi").count == 3)
    #expect(resource.settings(query: "co chu", locale: "vi").map(\.id) == ["appearance"])
    #expect(resource.settings(query: "ngon ngu", locale: "vi").map(\.id) == ["general"])
    #expect(resource.settings(query: "text size", locale: "en").map(\.id) == ["appearance"])
    #expect(resource.settings(query: "文字サイズ", locale: "ja").map(\.id) == ["appearance"])
    #expect(resource.settings(query: "missing-setting", locale: "ja").isEmpty)
}

@Test @MainActor func historyIncludesEmptyQueryAndAccentInsensitiveContent() throws {
    let store = WorkbenchStore(persistence: MemoryPersistence(), automaticProvider: false)
    let id = store.session.id
    store.setDraft(id, "Đổi ngôn ngữ 日本語")
    let task = try #require(store.submit(id))
    store.receive(taskID: task.id, attemptID: task.attemptID, chunk: "Phản hồi tiếng Việt", terminal: .succeeded)
    #expect(store.history(query: "").count == 1)
    #expect(store.history(query: "  ").count == 1)
    #expect(store.history(query: "doi ngon ngu").first?.id == id)
    #expect(store.history(query: "phan hoi").first?.id == id)
    #expect(store.history(query: "日本語").first?.id == id)
    store.navigate(.translate)
    #expect(store.history(query: "doi ngon ngu").isEmpty)
}

@Test @MainActor func sharedRecoveryContractPreservesUnicodeAndIdentities() throws {
    let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../../contracts/native-workbench/recovery-fixture.json")
    let persistence = MemoryPersistence()
    persistence.value = try JSONDecoder().decode(Workspace.self, from: Data(contentsOf: url)).validated()
    let store = WorkbenchStore(persistence: persistence, automaticProvider: false)
    #expect(store.workspace.tasks[0].status == .interrupted)
    #expect(store.workspace.tasks[0].attemptID == "attempt-fixture")
    #expect(store.workspace.tasks[0].request.model == "demo.slow")
    #expect(store.session.draft == "Bản nháp chưa gửi")
    #expect(store.session.messages.last?.text == "Phản hồi dở dang")
}

@Test @MainActor func streamingWritesAreCoalescedAndQuitFlushesPartialOutput() throws {
    let persistence = MemoryPersistence()
    let store = WorkbenchStore(persistence: persistence, automaticProvider: false)
    store.setDraft(store.session.id, "Question")
    let task = try #require(store.submit(store.session.id))
    let before = persistence.writes
    for _ in 0..<100 { store.receive(taskID: task.id, attemptID: task.attemptID, chunk: "a") }
    #expect(persistence.writes == before)
    store.shutdown()
    #expect(persistence.writes == before + 1)
    #expect(persistence.value?.tasks.first?.status == .interrupted)
    #expect(persistence.value?.sessions.first?.messages.last?.text.count == 100)
}

@Test @MainActor func navigationPreferencePreservesWorkAndSurvivesRecovery() throws {
    let persistence = MemoryPersistence()
    let store = WorkbenchStore(persistence: persistence, automaticProvider: false)
    #expect(!store.workspace.navigationCollapsed)
    store.setDraft(store.session.id, "Keep draft")
    let before = store.workspace
    store.setNavigationCollapsed(true)
    #expect(store.workspace.sessions == before.sessions)
    #expect(store.workspace.tasks == before.tasks)
    store.navigate(.translate)
    #expect(store.workspace.navigationCollapsed)
    let restored = WorkbenchStore(persistence: persistence, automaticProvider: false)
    #expect(restored.workspace.navigationCollapsed)
    persistence.failSave = true
    store.setNavigationCollapsed(false)
    #expect(store.storageError == "storageError")
    #expect(!store.workspace.navigationCollapsed)
    persistence.failSave = false; store.save()
    #expect(persistence.value?.navigationCollapsed == false)
    let writes = persistence.writes
    store.setNavigationCollapsed(false)
    #expect(persistence.writes == writes)
}

@Test func navigationPreferenceRejectsInvalidTypeAndSupportsOlderSnapshot() throws {
    let data = try JSONEncoder().encode(Workspace())
    #expect(try JSONDecoder().decode(Workspace.self, from: data).navigationCollapsed == false)
    var json = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
    json["shell"] = ["navigationCollapsed": "false"]
    let invalid = try JSONSerialization.data(withJSONObject: json)
    #expect(throws: (any Error).self) { try JSONDecoder().decode(Workspace.self, from: invalid) }
}

@Test func commandsMatchVietnameseWithoutAccentsAndJapanese() {
    let resources = NativeResources.shared
    #expect(resources.matchingCommands(query: "lich su", locale: "vi").contains { $0.id == "history" })
    #expect(resources.matchingCommands(query: resources.text("history", locale: "ja"), locale: "ja").contains { $0.id == "history" })
}

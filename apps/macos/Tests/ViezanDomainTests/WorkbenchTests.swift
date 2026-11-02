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
    let translationModel = store.session.model
    store.setDraft(translate, "Translate prompt")
    let second = try #require(store.submit(translate))
    store.setModel(chat, "demo.standard")
    store.receive(taskID: first.id, attemptID: first.attemptID, chunk: "Reply")
    #expect(store.session.id == translate)
    #expect(store.session.model == translationModel)
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
    #expect(throws: (any Error).self) { try storage.save(workspace) }
    #expect(try storage.load()?.schemaVersion == 1)
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
    let old = try JSONDecoder().decode(Workspace.self, from: original).upgrading().validated()
    #expect(old.preferences.mode == .system)
    #expect(old.preferences.textSize == .medium)
    var object = try #require(JSONSerialization.jsonObject(with: original) as? [String: Any])
    object["appearance"] = ["mode": "invalid", "textSize": "large"]
    let invalid = try JSONSerialization.data(withJSONObject: object)
    #expect(throws: (any Error).self) { try JSONDecoder().decode(Workspace.self, from: invalid) }
}

@Test func settingsSearchIncludesLocalizedRowLabelsWithoutDiacritics() {
    let resource = NativeResources.shared
    #expect(Set(resource.settings(query: "  ", locale: "vi").map(\.id)) == Set(resource.settingsSections.map(\.id)))
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
    persistence.value = try JSONDecoder().decode(Workspace.self, from: Data(contentsOf: url)).upgrading().validated()
    let store = WorkbenchStore(persistence: persistence, automaticProvider: false)
    #expect(store.workspace.tasks[0].status == .interrupted)
    #expect(store.workspace.tasks[0].attemptID == "attempt-fixture")
    #expect(store.workspace.tasks[0].request.model == "ollama:llama3.2")
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

@Test func commandPaletteListsDestinationsInNavigationOrderBeforeActions() {
    let resources = NativeResources.shared
    let ids = resources.matchingCommands(query: "", locale: "vi").map(\.id)
    let destinations = resources.navigation.map(\.id)
    #expect(Array(ids.prefix(destinations.count)) == destinations)
}

// Provider notices must not warn before the first probe; afterwards the flag holds
// whether or not a local runtime answered.
@Test @MainActor func localRuntimeReportsCheckedOnlyAfterAProbe() async {
    let runtime = LocalRuntime()
    #expect(!runtime.checked)
    await runtime.refresh()
    #expect(runtime.checked)
}

@Test func providerSnapshotPrefersOnDeviceThenCloudDefaults() {
    var snapshot = ProviderDiscovery.Snapshot()
    #expect(snapshot.availability("ollama:llama3.2") == .unknown)
    snapshot.checked = true
    #expect(snapshot.empty)
    snapshot.keyed = ["openai"]
    snapshot.models["openai"] = ["openai:text-embedding-3-small", "openai:whisper-1", "openai:gpt-4o", "openai:gpt-4.1-mini-2025-04-14"]
    #expect(!snapshot.empty)
    #expect(snapshot.preferredModel(recent: []) == "openai:gpt-4.1-mini-2025-04-14")
    #expect(snapshot.availability("ollama:llama3.2") == .offline)
    #expect(snapshot.availability("claude:claude-haiku-4") == .missingKey)
    #expect(snapshot.availability("demo.standard") == .unsupported)
    snapshot.models["ollama"] = ["ollama:nomic-embed-text", "ollama:qwen3:4b"]
    #expect(snapshot.preferredModel(recent: []) == "ollama:qwen3:4b")
    #expect(snapshot.availability("ollama:llama3.2") == .notInstalled)
    // A recently used model that still runs wins over the provider order.
    #expect(snapshot.preferredModel(recent: ["ollama:llama3.2", "openai:gpt-4o"]) == "openai:gpt-4o")
}

@Test @MainActor func discoveryMovesOnlySessionsWithoutWorkToAvailableModels() async {
    let persistence = MemoryPersistence()
    let store = WorkbenchStore(persistence: persistence, automaticProvider: false,
                               listModels: { provider in
                                   guard provider == "gemini" else { throw ProviderFailure.unavailable }
                                   return ["gemini:gemini-2.5-flash", "gemini:gemini-2.5-pro"]
                               },
                               hasKey: { $0 == "gemini" })
    store.navigate(.chat)
    let started = store.session.id
    store.setDraft(started, "Earlier question")
    _ = store.submit(started)
    store.navigate(.translate)
    let blank = store.session.id
    await store.discoverProviders().value
    #expect(store.providers.checked && !store.providers.empty)
    #expect(store.session(blank)?.model == "gemini:gemini-2.5-flash")
    #expect(store.session(started)?.model == "ollama:llama3.2")
    #expect(store.availableModels.contains("gemini:gemini-2.5-pro"))
    store.newSession()
    #expect(store.session.model == "gemini:gemini-2.5-flash")
}

@Test @MainActor func discoveryWithNothingAvailableKeepsModelsAndReportsEmpty() async {
    let store = WorkbenchStore(persistence: MemoryPersistence(), automaticProvider: false,
                               listModels: { _ in throw ProviderFailure.unavailable }, hasKey: { _ in false })
    let model = store.session.model
    await store.discoverProviders().value
    #expect(store.providers.empty)
    #expect(store.preferredModel == nil)
    #expect(store.session.model == model)
    #expect(store.providers.availability(model) == .offline)
}

@Test func unreachableLocalRuntimeFailsAsOfflineNotGeneric() {
    #expect(WorkbenchStore.failureCode(URLError(.cannotConnectToHost), model: "ollama:qwen3:4b") == "providerOffline")
    #expect(WorkbenchStore.failureCode(ProviderFailure.unavailable, model: "lmstudio:gemma") == "providerOffline")
    #expect(WorkbenchStore.failureCode(URLError(.timedOut), model: "openai:gpt-4o") == "providerError")
    #expect(WorkbenchStore.failureCode(CloudFailure.missingKey, model: "openai:gpt-4o") == "providerMissingKey")
}

@Test func dictionaryAcceptsJSONInsideAMarkdownFence() {
    let json = #"{"headword":"serendipity","pronunciation":"/ˌserənˈdɪpɪti/","meaning":"chance","translations":[{"text":"sự tình cờ","pronunciation":"sự tình cờ"}]}"#
    #expect(DictionaryEntry.extractJSON("```json\n" + json + "\n```") == json)
    #expect(DictionaryEntry.extractJSON("Here you go:\n" + json + "\nHope it helps") == json)
    #expect(DictionaryEntry.parse("```json\n" + json + "\n```")?.headword == "serendipity")
    #expect(DictionaryEntry.extractJSON("not json") == "not json")
}

@Test func imageGenerationUsesAnyKeyedImageProvider() {
    #expect(ImageGeneration.provider(for: "gemini:gemini-2.5-flash", hasKey: { _ in true }) == "gemini")
    #expect(ImageGeneration.provider(for: "claude:claude-haiku-4-5", hasKey: { $0 == "openai" }) == "openai")
    #expect(ImageGeneration.provider(for: "ollama:qwen3:4b", hasKey: { $0 == "gemini" }) == "gemini")
    #expect(ImageGeneration.provider(for: "openai:gpt-4o", hasKey: { $0 == "gemini" }) == "gemini")
    #expect(ImageGeneration.provider(for: "claude:claude-haiku-4-5", hasKey: { _ in false }) == nil)
}

@Test func refusedImageRequestsExplainTheModelCannotReadImages() {
    #expect(CloudFailure.http(400) == .rejected && CloudFailure.http(503) == .network)
    #expect(WorkbenchStore.failureCode(CloudFailure.rejected, model: "openai:gpt-3.5-turbo", images: true) == "imageModelUnsupported")
    #expect(WorkbenchStore.failureCode(CloudFailure.rejected, model: "openai:gpt-3.5-turbo") == "providerRejected")
    #expect(WorkbenchStore.failureCode(CloudFailure.authentication, model: "openai:gpt-4o", images: true) == "providerAuthError")
}

@Test func providerRejectionKeepsOnlyTheProvidersMessage() {
    let body = Data(#"{"error":{"message":"The model `gpt-image-1` does not exist\nor you do not have access.","type":"invalid_request_error"}}"#.utf8)
    #expect(ProviderRejection.message(body) == "The model `gpt-image-1` does not exist or you do not have access.")
    #expect(ProviderRejection.message(Data("<html>bad gateway</html>".utf8)) == "")
    #expect(WorkbenchStore.failureCode(ProviderRejection(failure: .rejected, detail: "x"), model: "claude:claude-haiku-4-5", images: true) == "imageModelUnsupported")
}

@Test func imageGenerationPicksAnImageModelTheAccountLists() {
    let listed = ["openai:gpt-4o", "openai:gpt-image-1", "openai:gpt-image-1-mini", "openai:gpt-image-1.5", "gemini:imagen-4.0", "gemini:gemini-2.5-flash-image"]
    #expect(ImageGeneration.imageModel(provider: "openai", selected: "gpt-4o", available: listed) == "gpt-image-1.5")
    #expect(ImageGeneration.imageModel(provider: "openai", selected: "gpt-image-1-mini", available: listed) == "gpt-image-1-mini")
    #expect(ImageGeneration.imageModel(provider: "gemini", selected: "", available: listed) == "gemini-2.5-flash-image")
    #expect(ImageGeneration.imageModel(provider: "openai", selected: "", available: []) == "gpt-image-1")
}

@Test @MainActor func speechRecognitionDefaultsToAnyKeyedProvider() async {
    let store = WorkbenchStore(persistence: MemoryPersistence(), automaticProvider: false,
                               listModels: { _ in throw ProviderFailure.unavailable }, hasKey: { $0 == "groq" })
    #expect(store.speechProvider == "auto")
    await store.discoverProviders().value
    #expect(store.providers.speechReady("auto"))
    #expect(store.providers.speechReady("groq") && !store.providers.speechReady("openai"))
    store.speechProvider = "openai"
    #expect(store.speechProvider == "openai")
    #expect(Interpretation.speechFailure(CloudFailure.missingKey) == "providerMissingKey")
    #expect(Interpretation.speechFailure(URLError(.notConnectedToInternet)) == "providerNetworkError")
    #expect(Interpretation.speechFailure(ProviderFailure.oversizedResponse) == "audioError")
}

@Test func transcriptionUsesTheBestModelTheAccountLists() {
    #expect(SpeechProvider.transcriptionModel([]) == "whisper-1")
    #expect(SpeechProvider.transcriptionModel(["openai:whisper-1", "openai:gpt-4o-mini-transcribe"]) == "gpt-4o-mini-transcribe")
    #expect(SpeechProvider.transcriptionModel(["openai:gpt-4o-mini-transcribe", "openai:gpt-4o-transcribe"]) == "gpt-4o-transcribe")
}

@Test func voiceGateIgnoresSteadyRoomNoiseAndClosesAtAPause() {
    var gate = VoiceGate()
    // A fan at -38 dB (above the old fixed -42 dB threshold) is learned as the floor.
    for _ in 0..<300 { #expect(gate.feed(-38) != .finish) }
    #expect(!gate.heard)
    // Speech 15 dB above the floor for two seconds, then a pause, closes the utterance.
    for _ in 0..<20 { #expect(gate.feed(-23) == .none) }
    #expect(gate.heard)
    var events: [VoiceGate.Event] = []
    for _ in 0..<10 { events.append(gate.feed(-38)) }
    #expect(events.contains(.finish))
}

@Test func voiceGateDropsClicksAndSplitsLongSpeechAtAGap() {
    var gate = VoiceGate()
    for _ in 0..<10 { _ = gate.feed(-70) }
    // A 0.1 s click is not an utterance.
    _ = gate.feed(-30)
    var events: [VoiceGate.Event] = []
    for _ in 0..<10 { events.append(gate.feed(-70)) }
    #expect(events.contains(.discard) && !events.contains(.finish))
    // Typing: short taps every 0.4 s for 8 s keep the clip open but are not speech.
    events = []
    for i in 0..<80 { events.append(gate.feed(i % 4 == 0 ? -30 : -70)) }
    for _ in 0..<10 { events.append(gate.feed(-70)) }
    #expect(events.contains(.discard) && !events.contains(.finish))
    // Continuous speech past 12 s closes at the next short gap, before the 25 s cap.
    var finished = 0.0
    for i in 0..<250 {
        let gap = i >= 140 && i % 30 < 5
        if gate.feed(gap ? -70 : -30) == .finish { finished = Double(i) * VoiceGate.frame; break }
    }
    #expect(finished >= VoiceGate.longClip && finished < VoiceGate.maximum)
    #expect(VoiceGate.meaningful("Hello.") && VoiceGate.meaningful("Xin chào") && !VoiceGate.meaningful(" ... ") && !VoiceGate.meaningful("."))
}

@Test func voiceGateKeepsQuietSpeechInANoisyRoomAsOneUtterance() {
    // Levels measured on a real Mac: room noise flickers between -27 and -34 dB while a
    // speaker's voice is only -20…-29 dB. A 16 s sentence must stay one utterance.
    let noise = [-31, -28, -33, -30, -27.5, -32, -29, -34], speech = [-23, -25, -22, -26, -24, -28.8, -21, -24.5, -23.5, -25.5]
    var gate = VoiceGate(), events: [VoiceGate.Event] = []
    for i in 0..<60 { events.append(gate.feed(noise[i % noise.count])) }
    #expect(!events.contains(.finish))
    events = []
    for i in 0..<160 { events.append(gate.feed(speech[i % speech.count])) }
    #expect(events.allSatisfy { $0 == .none })
    for i in 0..<20 { events.append(gate.feed(noise[i % noise.count])) }
    #expect(events.filter { $0 != .none } == [.finish])
}

@Test func quickTranslatePairRoutesTextAlreadyInThePrimaryLanguage() {
    let off = QuickTranslatePreferences(primary: "vi")
    #expect(off.target(detected: "vi") == "vi" && off.target(detected: "en") == "vi")
    let pair = QuickTranslatePreferences(primary: "vi", secondary: "en")
    #expect(pair.target(detected: "vi") == "en" && pair.target(detected: "ja") == "vi" && pair.target(detected: nil) == "vi")
    #expect(QuickTranslatePreferences(primary: "zh", secondary: "en").target(detected: "zh-TW") == "en")
    // Choosing the secondary as primary swaps the pair.
    #expect(pair.choosing(primary: "en") == QuickTranslatePreferences(primary: "en", secondary: "vi"))
    #expect(pair.choosing(primary: "ja") == QuickTranslatePreferences(primary: "ja", secondary: "en"))
    #expect(TextLanguage.detect("Xin chào, cuộc họp bắt đầu lúc chín giờ sáng nay.") == "vi")
    #expect(TextLanguage.detect("Good morning, the meeting starts at nine.") == "en")
    #expect(TextLanguage.detect("会議は午前九時に始まります。") == "ja")
}

@Test @MainActor func quickTranslatePairDefaultsToTheTranslateTargetAndPersists() throws {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathComponent("workspace.json")
    let store = WorkbenchStore(persistence: FilePersistence(url: url))
    #expect(store.quickTranslate.secondary == nil && NativeResources.shared.nativeLanguages.contains(store.quickTranslate.primary))
    store.quickTranslate = QuickTranslatePreferences(primary: "ja", secondary: "en")
    store.quickTranslate = QuickTranslatePreferences(primary: "ja", secondary: "ja")   // invalid: ignored
    #expect(WorkbenchStore(persistence: FilePersistence(url: url)).quickTranslate == QuickTranslatePreferences(primary: "ja", secondary: "en"))
}

@Test func launcherRanksNamePrefixThenWordThenAnywhereWithRecentFirst() {
    let apps = ["Safari", "System Settings", "Photos", "Visual Studio Code", "Messages", "Notes", "Font Book"].map { LauncherApplication(id: "/Applications/\($0).app", name: $0) }
    let names = { (query: String, recent: [String]) in LauncherRanking.applications(apps, query: query, recent: recent).map(\.name) }
    #expect(names("s", []) == ["Safari", "System Settings", "Visual Studio Code", "Notes", "Photos", "Messages"])
    #expect(names("set", []) == ["System Settings"])
    #expect(names("code", []) == ["Visual Studio Code"])
    #expect(names("s", ["/Applications/System Settings.app"]).first == "System Settings")
    #expect(names("", ["/Applications/Notes.app", "/Applications/Safari.app"]) == ["Notes", "Safari"])
    #expect(names("zzz", []).isEmpty)
}

@Test func applicationInventoryListsLinkedAppsAsProtectedAndOnlyBrokenLinksBlockIt() throws {
    // The inventory insists on canonical paths; /var/folders is itself a link.
    let temporary = realpath(FileManager.default.temporaryDirectory.path, nil)!; defer { free(temporary) }
    let root = URL(fileURLWithPath: String(cString: temporary)).appendingPathComponent(UUID().uuidString)
    func app(_ name: String, id: String, at folder: URL) throws {
        let contents = folder.appendingPathComponent(name + ".app/Contents")
        try FileManager.default.createDirectory(at: contents, withIntermediateDirectories: true)
        try PropertyListSerialization.data(fromPropertyList: ["CFBundleIdentifier": id, "CFBundleName": name, "CFBundlePackageType": "APPL"], format: .xml, options: 0)
            .write(to: contents.appendingPathComponent("Info.plist"))
    }
    let installed = root.appendingPathComponent("Applications"), elsewhere = root.appendingPathComponent("Cryptex")
    try app("Fixture", id: "dev.viezan.fixture", at: installed)
    try app("Linked", id: "dev.viezan.linked", at: elsewhere)
    try FileManager.default.createSymbolicLink(at: installed.appendingPathComponent("Linked.app"), withDestinationURL: elsewhere.appendingPathComponent("Linked.app"))
    defer { try? FileManager.default.removeItem(at: root) }
    let listed = try ApplicationFiles.inventory(roots: [installed.path])
    #expect(Set(listed.map(\.bundleID)) == ["dev.viezan.fixture", "dev.viezan.linked"])
    #expect(listed.first { $0.bundleID == "dev.viezan.linked" }?.blocked == "appProtected")
    #expect(!listed.contains { $0.blocked == "appIncomplete" })
    // A link that resolves to nothing still means the inventory cannot be trusted.
    try FileManager.default.createSymbolicLink(at: installed.appendingPathComponent("Gone.app"), withDestinationURL: root.appendingPathComponent("missing.app"))
    #expect(try ApplicationFiles.inventory(roots: [installed.path]).allSatisfy { $0.blocked == "appIncomplete" })
}

@Test func thermalSensorsFoldIntoNamedRowsPerGroup() {
    #expect(ThermalSensors.classify("Tp0Y") == .init(group: .cpu, label: "cpu_performance_core"))
    #expect(ThermalSensors.classify("Te02") == .init(group: .cpu, label: "cpu_efficiency_core"))
    #expect(ThermalSensors.classify("TB1T") == .init(group: .other, label: "battery"))
    #expect(ThermalSensors.classify("TCMz") == .init(group: .cpu, label: "cpu_core"))
    #expect(ThermalSensors.classify("Tz9q") == .init(group: .other, label: nil))
    let sensors = [("Tp01", 61.0), ("Tp02", 55.0), ("Te02", 58.0), ("Tg0a", 49.0), ("Tz9q", 80.0), ("TB0T", 31.0)].map { ThermalSnapshot.Sensor(key: $0.0, celsius: $0.1) }
    let rows = ThermalSensors.rows(sensors)
    #expect(rows[.cpu]?.map(\.label) == ["cpu_performance_core", "cpu_efficiency_core"])
    #expect(rows[.cpu]?.first?.max == 61 && rows[.cpu]?.first?.sensors.count == 2 && rows[.cpu]?.first?.average == 58)
    // The unrecognized row goes last even when it is the hottest.
    #expect(rows[.other]?.map(\.label) == ["battery", nil])
    #expect(ThermalSensors.tone(69.9) == "ok" && ThermalSensors.tone(70) == "warm" && ThermalSensors.tone(90) == "hot")
}

@Test func launcherCurrencyReadsAmountsUnitsAndTargetsLikeTheRenderer() {
    func parse(_ query: String, _ locale: String = "en") -> CurrencyQuery? { LauncherCurrency.parse(query, locale: locale) }
    func money(_ amount: Double, _ from: String, _ to: String? = nil) -> CurrencyQuery { CurrencyQuery(amount: amount, from: from, to: to) }
    for (query, expected) in [("2$", money(2, "USD")), ("$2", money(2, "USD")), ("2 usd", money(2, "USD")), ("2USD", money(2, "USD")), ("100 yen", money(100, "JPY")),
                              ("50€", money(50, "EUR")), ("£ 10", money(10, "GBP")), ("1000₩", money(1000, "KRW")), ("US$ 3", money(3, "USD")),
                              ("2 usd to vnd", money(2, "USD", "VND")), ("2$ in jpy", money(2, "USD", "JPY")), ("2$ → eur", money(2, "USD", "EUR")), ("2$ = eur", money(2, "USD", "EUR")),
                              ("2 usd vnd", money(2, "USD", "VND")), ("$2 vnd", money(2, "USD", "VND")), ("2$ inr", money(2, "USD", "INR")), ("2$ to", money(2, "USD")),
                              ("2 usd to usd", money(2, "USD")), ("1.5 usd", money(1.5, "USD")), ("1,500 usd", money(1500, "USD")), ("1.5m usd", money(1_500_000, "USD")), ("2 krw", money(2, "KRW"))] {
        #expect(parse(query) == expected, "\(query)")
    }
    for (query, expected) in [("2 đô sang yên", money(2, "USD", "JPY")), ("2 do la", money(2, "USD")), ("50.000đ", money(50_000, "VND")), ("50.000 đồng", money(50_000, "VND")),
                              ("1,5 usd", money(1.5, "USD")), ("1.500.000 vnd", money(1_500_000, "VND")), ("500k vnd", money(500_000, "VND")), ("2tr vnd", money(2_000_000, "VND"))] {
        #expect(parse(query, "vi") == expected, "\(query)")
    }
    for (query, expected) in [("100円", money(100, "JPY")), ("100ドル に 円", money(100, "USD", "JPY")), ("1万円", money(10_000, "JPY"))] {
        #expect(parse(query, "ja") == expected, "\(query)")
    }
    for query in ["", "2", "2 + 2", "chat", "2 abc", "1password", "2$ to abc", "2 m", "12 tr", "2 in", "usd", "$", "2$$", "9999999999999999 usd", "2,5,5 usd", String(repeating: "x", count: 61)] {
        #expect(parse(query) == nil, "\(query)")
    }
}

@Test func launcherCurrencyTargetFollowsChoiceThenLanguageButNeverTheTypedCurrency() {
    #expect(LauncherCurrency.defaultTarget(locale: "en", preferred: nil) == "USD")
    #expect(LauncherCurrency.defaultTarget(locale: "vi", preferred: nil) == "VND")
    #expect(LauncherCurrency.defaultTarget(locale: "ja", preferred: "") == "JPY")
    #expect(LauncherCurrency.defaultTarget(locale: "vi", preferred: "JPY") == "JPY")
    #expect(LauncherCurrency.defaultTarget(locale: "vi", preferred: "XXX") == "VND")
    #expect(LauncherCurrency.defaultTarget(locale: "vi", preferred: nil, from: "VND") == "USD")
    #expect(LauncherCurrency.defaultTarget(locale: "en", preferred: nil, from: "USD") == "EUR")
    #expect(LauncherCurrency.defaultTarget(locale: "vi", preferred: "JPY", from: "JPY") == "VND")
    let snapshot = CurrencySnapshot(rates: ["USD": 1, "VND": 25_000, "JPY": 150], updated: 1)
    #expect(snapshot.convert(2, from: "USD", to: "VND")?.value == 50_000)
    #expect(snapshot.convert(300, from: "JPY", to: "USD")?.rate == 1.0 / 150)
    #expect(snapshot.convert(1, from: "USD", to: "EUR") == nil)
}

@Test @MainActor func onlyTheNewestFinishedChatAnswerCanBeRegenerated() throws {
    let store = WorkbenchStore(persistence: MemoryPersistence(), automaticProvider: false)
    store.navigate(.chat)
    let id = store.session.id
    store.setDraft(id, "First")
    let first = try #require(store.submit(id))
    store.receive(taskID: first.id, attemptID: first.attemptID, chunk: "One", terminal: .succeeded)
    #expect(store.canRetry(try #require(store.workspace.tasks.first { $0.id == first.id })))
    store.setDraft(id, "Second")
    let second = try #require(store.submit(id))
    store.receive(taskID: second.id, attemptID: second.attemptID, chunk: "Two", terminal: .succeeded)
    #expect(!store.canRetry(try #require(store.workspace.tasks.first { $0.id == first.id })))
    store.retry(second.id)
    #expect(store.running(id)?.id == second.id)
    #expect(store.session.messages.last?.text == "")
    #expect(store.session.messages.map(\.text).prefix(3) == ["First", "One", "Second"])
}

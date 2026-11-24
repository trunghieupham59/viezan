import Foundation
import Testing
@testable import ViezanDomain

// Two stores (workspace and interpretation) change together or not at all.
@MainActor private func meetingStore(_ folder: URL, persistence: MemoryPersistence) throws -> (WorkbenchStore, Interpretation) {
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let meetings = [InterpretationSession(model: "openai:gpt-4.1", provider: "openai", source: "en", target: "vi", locale: "vi")]
    try JSONEncoder().encode(meetings).write(to: folder.appendingPathComponent("interpretation.json"))
    let interpretation = Interpretation(file: folder.appendingPathComponent("interpretation.json"))
    let store = WorkbenchStore(persistence: persistence, automaticProvider: false, interpretation: interpretation)
    store.quarantine = { _ in }
    return (store, interpretation)
}

@Test @MainActor func clearHistoryKeepsBothStoresWhenTheWorkspaceCannotBeSaved() throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: folder) }
    let persistence = MemoryPersistence()
    let (store, interpretation) = try meetingStore(folder, persistence: persistence)
    store.setDraft(store.session.id, "Keep me")
    persistence.failSave = true
    #expect(throws: StorageFailure.self) { try store.clearHistory() }
    #expect(interpretation.sessions.count == 1)
    #expect(store.session.draft == "Keep me")
    // The meeting is still on disk, not only in memory.
    #expect(Interpretation(file: folder.appendingPathComponent("interpretation.json")).sessions.count == 1)
}

@Test @MainActor func clearHistoryKeepsBothStoresWhenTheMeetingStoreCannotBeWritten() throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: folder.path); try? FileManager.default.removeItem(at: folder) }
    let persistence = MemoryPersistence()
    let (store, interpretation) = try meetingStore(folder, persistence: persistence)
    store.setDraft(store.session.id, "Keep me")
    let writes = persistence.writes
    try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: folder.path)
    #expect(throws: StorageFailure.self) { try store.clearHistory() }
    #expect(interpretation.sessions.count == 1)
    #expect(store.session.draft == "Keep me")
    #expect(persistence.value?.sessions.contains { $0.draft == "Keep me" } ?? (persistence.writes == writes))
}

@Test @MainActor func importBackupLeavesMeetingsAloneWhenTheWorkspaceCannotBeSaved() throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: folder) }
    let persistence = MemoryPersistence()
    let (store, interpretation) = try meetingStore(folder, persistence: persistence)
    let incoming = InterpretationSession(model: "openai:gpt-4.1", provider: "openai", source: "ja", target: "vi", locale: "vi")
    var imported = Session(feature: .chat); imported.draft = "From backup"
    let preview = BackupPreview(preferences: store.workspace, interpretation: [incoming], tasks: [], prompts: [], sessions: [imported], attachments: [], bytes: [:])
    persistence.failSave = true
    #expect(throws: StorageFailure.self) { try store.importBackup(preview) }
    #expect(interpretation.sessions.count == 1)
    #expect(!store.workspace.sessions.contains { $0.id == imported.id })
    #expect(Interpretation(file: folder.appendingPathComponent("interpretation.json")).sessions.count == 1)
    // And when it can be saved, both arrive.
    persistence.failSave = false
    try store.importBackup(preview)
    #expect(interpretation.sessions.count == 2 && store.workspace.sessions.contains { $0.id == imported.id })
}

@Test @MainActor func clearHistoryFailurePutsMeetingsBackExactlyAndSweepsNothing() throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: folder) }
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let first = InterpretationSession(model: "openai:gpt-4.1", provider: "openai", source: "en", target: "vi", locale: "vi")
    let second = InterpretationSession(model: "openai:gpt-4.1", provider: "openai", source: "ja", target: "vi", locale: "vi")
    try JSONEncoder().encode([first, second]).write(to: folder.appendingPathComponent("interpretation.json"))
    let interpretation = Interpretation(file: folder.appendingPathComponent("interpretation.json"))
    interpretation.select(second.id)
    let persistence = MemoryPersistence()
    let store = WorkbenchStore(persistence: persistence, automaticProvider: false, interpretation: interpretation)
    var swept = 0; store.quarantine = { _ in swept += 1 }
    persistence.failSave = true
    #expect(throws: StorageFailure.self) { try store.clearHistory() }
    #expect(interpretation.sessions.map(\.id) == [first.id, second.id])
    #expect(interpretation.selectedID == second.id)
    #expect(swept == 0)
}

@Test @MainActor func importBackupRefusedByTheMeetingStoreLeavesTheWorkspaceUnwritten() throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: folder.path); try? FileManager.default.removeItem(at: folder) }
    let persistence = MemoryPersistence()
    let (store, interpretation) = try meetingStore(folder, persistence: persistence)
    var imported = Session(feature: .chat); imported.draft = "From backup"
    let incoming = InterpretationSession(model: "openai:gpt-4.1", provider: "openai", source: "ja", target: "vi", locale: "vi")
    // A meeting the store would refuse is found before anything is written.
    var invalid = incoming; invalid.id = ""
    let refused = BackupPreview(preferences: store.workspace, interpretation: [invalid], tasks: [], prompts: [], sessions: [imported], attachments: [], bytes: [:])
    let writes = persistence.writes
    #expect(throws: (any Error).self) { try store.importBackup(refused) }
    #expect(persistence.writes == writes && !store.workspace.sessions.contains { $0.id == imported.id })
    // A meeting store that cannot be written: the workspace goes back to what it was, on disk too.
    let preview = BackupPreview(preferences: store.workspace, interpretation: [incoming], tasks: [], prompts: [], sessions: [imported], attachments: [], bytes: [:])
    try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: folder.path)
    #expect(throws: StorageFailure.self) { try store.importBackup(preview) }
    #expect(interpretation.sessions.count == 1)
    #expect(!store.workspace.sessions.contains { $0.id == imported.id })
    #expect(persistence.value?.sessions.contains { $0.id == imported.id } != true)
}

@Test @MainActor func failedBackupImportRemovesOnlyItsNewImagesAndCanRetry() throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: folder) }
    let persistence = MemoryPersistence()
    let (store, _) = try meetingStore(folder, persistence: persistence)
    let directory = folder.appendingPathComponent("attachments")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let old = ImageAttachment(id: UUID().uuidString, name: "old.png", mime: "image/png")
    let new = ImageAttachment(id: UUID().uuidString, name: "new.png", mime: "image/png")
    let data = Data([1, 2, 3])
    let oldURL = directory.appendingPathComponent(old.id), newURL = directory.appendingPathComponent(new.id)
    try data.write(to: oldURL)
    var imported = Session(feature: .chat)
    imported.images = [old, new]
    let preview = BackupPreview(preferences: store.workspace, interpretation: [], tasks: [], prompts: [],
                                sessions: [imported], attachments: [new, old], bytes: [new.id: data, old.id: data])
    persistence.failSave = true
    #expect(throws: (any Error).self) { try store.importBackup(preview, attachmentDirectory: directory) }
    #expect(!FileManager.default.fileExists(atPath: newURL.path))
    #expect(try Data(contentsOf: oldURL) == data)
    persistence.failSave = false
    try Data([4]).write(to: oldURL)
    #expect(throws: (any Error).self) { try store.importBackup(preview, attachmentDirectory: directory) }
    #expect(!FileManager.default.fileExists(atPath: newURL.path))
    #expect(try Data(contentsOf: oldURL) == Data([4]))
    try data.write(to: oldURL)
    try store.importBackup(preview, attachmentDirectory: directory)
    #expect(try Data(contentsOf: newURL) == data)
    #expect(store.session(imported.id)?.images == [old, new])
}

@Test @MainActor func failedBackupRollbackKeepsReferencedImageAndBlocksStaleWritesUntilReload() throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let meetings = folder.appendingPathComponent("meetings")
    let directory = folder.appendingPathComponent("attachments")
    defer {
        try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: meetings.path)
        try? FileManager.default.removeItem(at: folder)
    }
    let persistence = MemoryPersistence()
    let (store, _) = try meetingStore(meetings, persistence: persistence)
    let image = ImageAttachment(id: UUID().uuidString, name: "new.png", mime: "image/png")
    var imported = Session(feature: .chat); imported.images = [image]
    let meeting = InterpretationSession(model: "openai:gpt-4.1", provider: "openai", source: "ja", target: "vi", locale: "vi")
    let data = Data([7, 8, 9])
    let preview = BackupPreview(preferences: store.workspace, interpretation: [meeting], tasks: [], prompts: [],
                                sessions: [imported], attachments: [image], bytes: [image.id: data])
    try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: meetings.path)
    persistence.failAfterWrites = persistence.writes + 1
    #expect(throws: (any Error).self) { try store.importBackup(preview, attachmentDirectory: directory) }
    #expect(store.loadBlocked && store.storageError != nil)
    persistence.failAfterWrites = nil
    store.save()
    #expect(persistence.value?.sessions.contains { $0.id == imported.id } == true)
    #expect(try Data(contentsOf: directory.appendingPathComponent(image.id)) == data)
    store.reload()
    #expect(!store.loadBlocked && store.storageError == nil && store.session(imported.id)?.images == [image])
}

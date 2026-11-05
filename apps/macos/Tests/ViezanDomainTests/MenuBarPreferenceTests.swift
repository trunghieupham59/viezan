import Foundation
import Testing
@testable import ViezanDomain

@Test @MainActor func menuBarVisibilityDefaultsVisibleAndPersistsIndependently() throws {
    let persistence = MemoryPersistence()
    let store = WorkbenchStore(persistence: persistence, automaticProvider: false)
    #expect(store.workspace.menuBarVisible == nil)
    #expect(store.menuBarVisible)
    let temperature = store.menuBarTemperature
    store.menuBarVisible = false
    let restored = WorkbenchStore(persistence: persistence, automaticProvider: false)
    #expect(!restored.menuBarVisible)
    #expect(restored.menuBarTemperature == temperature)
    let decoded = try JSONDecoder().decode(Workspace.self, from: JSONEncoder().encode(restored.workspace))
    #expect(decoded.menuBarVisible == false)
    restored.menuBarVisible = true
    #expect(WorkbenchStore(persistence: persistence, automaticProvider: false).menuBarVisible)
}

@Test @MainActor func menuBarVisibilityDoesNotOverwriteBlockedWorkspace() {
    let persistence = MemoryPersistence()
    persistence.failLoad = true
    let store = WorkbenchStore(persistence: persistence, automaticProvider: false)
    #expect(store.loadBlocked)
    store.menuBarVisible = false
    #expect(store.menuBarVisible)
    #expect(persistence.writes == 0)
}

@Test @MainActor func menuBarSystemCallbacksDoNotRepeatWritesOrObservation() {
    let persistence = MemoryPersistence()
    let store = WorkbenchStore(persistence: persistence, automaticProvider: false)
    let initialWrites = persistence.writes
    for _ in 0..<10 { store.menuBarVisible = true }
    #expect(persistence.writes == initialWrites)
    #expect(store.workspace.menuBarVisible == nil)
    store.menuBarVisible = false
    let changedWrites = persistence.writes
    #expect(changedWrites == initialWrites + 1)
    for _ in 0..<10 { store.menuBarVisible = false }
    #expect(persistence.writes == changedWrites)
}

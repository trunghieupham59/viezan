#if DEBUG
import AppKit
import Testing
import ViezanDomain
@testable import ViezanNative

@MainActor private final class ReloadStorage: WorkspacePersistence {
    var snapshot: Workspace?
    var writes = 0
    var failSave = false
    func load() throws -> Workspace? { snapshot }
    func save(_ workspace: Workspace) throws {
        writes += 1
        if failSave { throw StorageFailure.invalidData }
        snapshot = workspace
    }
}

extension AppKitFixtureTests {
    @Suite @MainActor struct DevelopmentReloadTests {
        @Test(arguments: ["にほん", "Tiếng Việt"])
        func compositionStartedDuringBuildDefersReadySaveUntilCommitted(composition: String) {
            _ = NSApplication.shared
            let storage = ReloadStorage()
            let store = WorkbenchStore(persistence: storage, automaticProvider: false)
            let reload = DevelopmentReload(configuration: nil)
            let editor = NSTextView()
            editor.isFieldEditor = true
            // The initial request was safe; composition starts while it builds.
            #expect(reload.readyAction(store: store, firstResponder: editor) == .restart)
            editor.setMarkedText(composition, selectedRange: NSRange(location: (composition as NSString).length, length: 0),
                                 replacementRange: NSRange(location: NSNotFound, length: 0))
            #expect(editor.hasMarkedText())
            let writesBeforeReady = storage.writes
            for _ in 0..<2 {
                #expect(reload.readyAction(store: store, firstResponder: editor) == .wait)
                #expect(storage.writes == writesBeforeReady)
                #expect(editor.hasMarkedText() && editor.string == composition)
            }
            editor.unmarkText()
            store.setDraft(store.session.id, editor.string)
            let writesBeforeRestart = storage.writes
            #expect(reload.readyAction(store: store, firstResponder: editor) == .restart)
            #expect(storage.writes == writesBeforeRestart + 1)
            #expect(storage.snapshot?.sessions.first { $0.id == store.session.id }?.draft == composition)
        }

        @Test func failedFinalSaveCancelsReadyRestart() {
            _ = NSApplication.shared
            let storage = ReloadStorage()
            let store = WorkbenchStore(persistence: storage, automaticProvider: false)
            let reload = DevelopmentReload(configuration: nil)
            storage.failSave = true
            let writesBeforeReady = storage.writes
            #expect(reload.readyAction(store: store, firstResponder: nil) == .cancel)
            #expect(storage.writes == writesBeforeReady + 1)
            #expect(store.storageError != nil)
        }
    }
}
#endif

import Testing
@testable import ViezanNative

@MainActor
struct ApplicationsToastTests {
    @Test(arguments: ["appJournalError", "appIncomplete"])
    func lockedOrIncompleteInventoryStaysInThePage(key: String) {
        #expect(ApplicationsWorkspace.persistentError(key))
    }

    @Test(arguments: ["appActionError", "appInUse", "appHelperMissing"])
    func oneFailedActionIsAToast(key: String) {
        #expect(!ApplicationsWorkspace.persistentError(key))
    }
}

@MainActor
struct InterpretationToastTests {
    @Test(arguments: ["interpretStorageError", "microphoneDenied"])
    func blockedStoreOrMissingPermissionStaysInThePage(key: String) {
        #expect(InterpretationWorkspace.persistentError(key))
    }

    @Test(arguments: ["audioError", "systemAudioError", "interpretQueueFull", "interpretSummaryLimit"])
    func oneFailedCaptureOrSummaryIsAToast(key: String) {
        #expect(!InterpretationWorkspace.persistentError(key))
    }
}

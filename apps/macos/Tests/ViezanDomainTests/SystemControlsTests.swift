import Testing
@testable import ViezanDomain

@Suite @MainActor struct SystemControlsTests {
    @Test func keepAwakeDefaultsToOff() {
        let controls = SystemControls()
        #expect(!controls.keepAwake)
    }

    @Test func keepAwakeCanBeEnabledTwiceThenDisabled() throws {
        let controls = SystemControls()
        defer { controls.shutdown() }
        try #require(controls.setKeepAwake(true))
        #expect(controls.keepAwake)
        #expect(controls.setKeepAwake(true))
        #expect(controls.setKeepAwake(false))
        #expect(!controls.keepAwake)
    }

    @Test func shutdownTurnsOffKeepAwake() throws {
        let controls = SystemControls()
        defer { controls.shutdown() }
        try #require(controls.setKeepAwake(true))
        controls.shutdown()
        #expect(!controls.keepAwake)
    }

    @Test func outputMutedReadsConsistently() {
        let controls = SystemControls()
        let first = controls.outputMuted()
        #expect(controls.outputMuted() == first)
    }

    @Test func appearanceChangeMapsAppleEventErrors() {
        #expect(SystemControls.appearanceChange(errorNumber: nil) == .changed)
        #expect(SystemControls.appearanceChange(errorNumber: -1743) == .denied)
        #expect(SystemControls.appearanceChange(errorNumber: -1728) == .failed)
    }

    @Test func darkModeReadsConsistently() {
        let controls = SystemControls()
        let first = controls.darkMode()
        #expect(controls.darkMode() == first)
    }
}

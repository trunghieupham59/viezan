import CoreAudio
import Foundation
import IOKit.pwr_mgt
import Observation

public enum AppearanceChange: Equatable, Sendable { case changed, denied, failed }

@MainActor @Observable public final class SystemControls {
    public private(set) var keepAwake = false
    @ObservationIgnored private var assertionID = IOPMAssertionID(kIOPMNullAssertionID)

    public init() {}

    @discardableResult public func setKeepAwake(_ on: Bool) -> Bool {
        guard keepAwake != on else { return true }
        if on {
            guard IOPMAssertionCreateWithName(kIOPMAssertionTypePreventUserIdleDisplaySleep as CFString, IOPMAssertionLevel(kIOPMAssertionLevelOn),
                                              "Viezan keeps the Mac awake" as CFString, &assertionID) == kIOReturnSuccess else { return false }
        } else {
            guard IOPMAssertionRelease(assertionID) == kIOReturnSuccess else { return false }
            assertionID = IOPMAssertionID(kIOPMNullAssertionID)
        }
        keepAwake = on
        return true
    }

    public func shutdown() { setKeepAwake(false) }

    public func outputMuted() -> Bool? {
        guard let property = outputMuteProperty() else { return nil }
        return readUInt32(property.device, property.address).map { $0 != 0 }
    }

    @discardableResult public func setOutputMuted(_ muted: Bool) -> Bool {
        guard let property = outputMuteProperty() else { return false }
        var address = property.address, settable: DarwinBoolean = false
        guard AudioObjectIsPropertySettable(property.device, &address, &settable) == noErr, settable.boolValue else { return false }
        var value: UInt32 = muted ? 1 : 0
        return AudioObjectSetPropertyData(property.device, &address, 0, nil, UInt32(MemoryLayout<UInt32>.size), &value) == noErr
    }

    public func darkMode() -> Bool {
        UserDefaults.standard.string(forKey: "AppleInterfaceStyle") == "Dark"
    }

    public func setDarkMode(_ on: Bool) async -> AppearanceChange {
        await Task.detached {
            let source = #"tell application "System Events" to tell appearance preferences to set dark mode to \#(on ? "true" : "false")"#
            guard let script = NSAppleScript(source: source) else { return .failed }
            var error: NSDictionary?
            script.executeAndReturnError(&error)
            let number = error?[NSAppleScript.errorNumber] as? Int
            guard error == nil || number != nil else { return .failed }
            return Self.appearanceChange(errorNumber: number)
        }.value
    }

    nonisolated static func appearanceChange(errorNumber: Int?) -> AppearanceChange {
        switch errorNumber {
        case nil: .changed
        case -1743: .denied
        default: .failed
        }
    }

    private func outputMuteProperty() -> (device: AudioDeviceID, address: AudioObjectPropertyAddress)? {
        let defaultOutput = address(kAudioHardwarePropertyDefaultOutputDevice, scope: kAudioObjectPropertyScopeGlobal)
        guard let device = readUInt32(AudioObjectID(kAudioObjectSystemObject), defaultOutput), device != kAudioObjectUnknown else { return nil }
        var mute = address(kAudioDevicePropertyMute, scope: kAudioDevicePropertyScopeOutput)
        guard AudioObjectHasProperty(device, &mute) else { return nil }
        return (device, mute)
    }

    private func address(_ selector: AudioObjectPropertySelector, scope: AudioObjectPropertyScope) -> AudioObjectPropertyAddress {
        .init(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
    }

    private func readUInt32(_ object: AudioObjectID, _ property: AudioObjectPropertyAddress) -> UInt32? {
        var address = property, value: UInt32 = 0, size = UInt32(MemoryLayout<UInt32>.size)
        guard AudioObjectGetPropertyData(object, &address, 0, nil, &size, &value) == noErr, size == MemoryLayout<UInt32>.size else { return nil }
        return value
    }
}

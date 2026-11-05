import AppKit
import OSLog
@preconcurrency import ApplicationServices

/// AX ranges use UTF-16 offsets, including when the selection contains emoji or CJK.
struct SelectionReplacement {
    let original: String
    let expected: String

    init?(value: String, selected: String, range: CFRange, replacement: String) {
        let source = value as NSString
        guard !replacement.isEmpty, range.location >= 0, range.length > 0,
              range.location <= source.length, range.length <= source.length - range.location,
              source.substring(with: NSRange(location: range.location, length: range.length)) == selected else { return nil }
        original = value
        expected = source.replacingCharacters(in: NSRange(location: range.location, length: range.length), with: replacement)
    }

    /// A successful AX return code or a posted key event is not evidence of an edit.
    @MainActor func verify(read: () -> String?, pause: () async throws -> Void = {
        try await Task.sleep(for: .milliseconds(50))
    }) async -> Bool {
        guard expected != original else { return false }
        for attempt in 0..<12 {
            guard !Task.isCancelled else { return false }
            guard let value = read() else { return false }
            if value == expected { return true }
            guard value == original, attempt < 11 else { return false }
            do { try await pause() } catch { return false }
        }
        return false
    }
}

@MainActor public final class SelectedTextTarget {
    public let text: String
    private let application: AXUIElement
    private let element: AXUIElement
    private let range: CFRange
    private let pid: pid_t
    private let originalValue: String?
    public let canReplace: Bool

    private init(text: String, application: AXUIElement, element: AXUIElement, range: CFRange, pid: pid_t) {
        self.text = text; self.application = application; self.element = element; self.range = range; self.pid = pid
        originalValue = Self.string(element, kAXValueAttribute)
        let role = Self.string(element, kAXRoleAttribute)
        var writable: DarwinBoolean = false
        canReplace = [kAXTextFieldRole, kAXTextAreaRole, kAXComboBoxRole].contains(role ?? "") &&
            AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &writable) == .success && writable.boolValue
    }

    private static func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
        return value
    }
    private static func string(_ element: AXUIElement, _ name: String) -> String? { attribute(element, name) as? String }
    private static func selectionRange(_ element: AXUIElement) -> CFRange? {
        guard let value = attribute(element, kAXSelectedTextRangeAttribute), CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
        var range = CFRange()
        return AXValueGetValue(value as! AXValue, .cfRange, &range) ? range : nil
    }

    public static func capture() throws -> SelectedTextTarget {
        guard AXIsProcessTrusted(), let foreground = NSWorkspace.shared.frontmostApplication,
              foreground.processIdentifier != ProcessInfo.processInfo.processIdentifier else { throw StorageFailure.invalidData }
        let application = AXUIElementCreateApplication(foreground.processIdentifier)
        guard let focused = attribute(application, kAXFocusedUIElementAttribute),
              CFGetTypeID(focused) == AXUIElementGetTypeID() else { throw StorageFailure.invalidData }
        let element = focused as! AXUIElement
        guard let text = string(element, kAXSelectedTextAttribute), !text.isEmpty, text.utf8.count <= 131072,
              let range = selectionRange(element), range.length > 0 else { throw StorageFailure.invalidData }
        return Self(text: text, application: application, element: element, range: range, pid: foreground.processIdentifier)
    }

    private func isCurrent() -> Bool {
        guard !Task.isCancelled, NSWorkspace.shared.frontmostApplication?.processIdentifier == pid,
              let focused = Self.attribute(application, kAXFocusedUIElementAttribute), CFEqual(focused, element),
              Self.string(element, kAXValueAttribute) == originalValue,
              Self.string(element, kAXSelectedTextAttribute) == text,
              let current = Self.selectionRange(element) else { return false }
        return current.location == range.location && current.length == range.length
    }

    /// Preserve the captured document and selection; never paste into a newly focused control.
    public func replace(with translation: String) async throws {
        SelectionDiagnostics.record("replace-enter;editable:\(canReplace);value:\(originalValue != nil);current:\(isCurrent())")
        guard canReplace, let value = originalValue,
              let replacement = SelectionReplacement(value: value, selected: text, range: range, replacement: translation),
              let running = NSRunningApplication(processIdentifier: pid), !running.isTerminated,
              isCurrent() else { throw StorageFailure.invalidData }
        // Use the application's edit command, never the AX selected-text setter:
        // browser accessibility caches can acknowledge a write without a DOM edit.
        // An unchanged translation is a result, not a successful replacement.
        guard replacement.expected != replacement.original else { throw StorageFailure.invalidData }
        SelectionDiagnostics.record("posting-paste")
        #if DEBUG
        Logger(subsystem: "app.viezan", category: "selection").notice("Verified target; posting paste")
        #endif
        guard isCurrent(), await SelectionClipboard.paste(translation, into: running, isCurrent: { self.isCurrent() }, verify: {
            await replacement.verify(read: { Self.string(self.element, kAXValueAttribute) })
        }) else {
            SelectionDiagnostics.record("paste-unverified")
            #if DEBUG
            Logger(subsystem: "app.viezan", category: "selection").notice("Paste not verified; retaining result")
            #endif
            throw StorageFailure.invalidData
        }
        SelectionDiagnostics.record("paste-verified")
        #if DEBUG
        Logger(subsystem: "app.viezan", category: "selection").notice("Paste value verified")
        #endif
    }
}

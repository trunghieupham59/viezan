import AppKit
@preconcurrency import ApplicationServices
import Carbon
import Observation

public struct NativeShortcut: Codable, Identifiable, Sendable {
    public var id: String
    public var key: String
    public var enabled: Bool
}
@MainActor @Observable public final class DesktopIntegration {
    public private(set) var shortcuts: [NativeShortcut] = [
        .init(id: "quickChat", key: "Control+Option+Space", enabled: false),
        .init(id: "translateSelection", key: "Option+T", enabled: false),
        .init(id: "launcher", key: "Option+Space", enabled: false)]
    public private(set) var error: String?
    public var onAction: ((String) -> Void)?
    public var accessibilityGranted: Bool { AXIsProcessTrusted() }
    @ObservationIgnored private var references: [String: EventHotKeyRef] = [:]
    @ObservationIgnored private var handler: EventHandlerRef?
    @ObservationIgnored private let file = FilePersistence.previewURL().deletingLastPathComponent().appendingPathComponent("shortcuts.json")
    public init() {
        if let data = try? Data(contentsOf: file), let values = try? JSONDecoder().decode([NativeShortcut].self, from: data), values.count == 3, Set(values.map(\.id)) == Set(shortcuts.map(\.id)) { shortcuts = values }
    }
    public func activate() {
        guard handler == nil else { return }
        var type = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let result = InstallEventHandler(GetApplicationEventTarget(), { _, event, context in
            guard let event, let context else { return OSStatus(eventNotHandledErr) }
            var identifier = EventHotKeyID()
            guard GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil, .init(MemoryLayout<EventHotKeyID>.size), nil, &identifier) == noErr else { return OSStatus(eventNotHandledErr) }
            let integration = Unmanaged<DesktopIntegration>.fromOpaque(context).takeUnretainedValue()
            MainActor.assumeIsolated { integration.trigger(Int(identifier.id)) }
            return noErr
        }, 1, &type, Unmanaged.passUnretained(self).toOpaque(), &handler)
        guard result == noErr else { error = "shortcutError"; return }
        for shortcut in shortcuts where shortcut.enabled { if !register(shortcut) { error = "shortcutError" } }
    }
    public func requestAccessibility() {
        _ = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary)
    }
    public func configure(_ id: String, key: String, enabled: Bool) {
        guard let index = shortcuts.firstIndex(where: { $0.id == id }) else { return }
        let value = NativeShortcut(id: id, key: key, enabled: enabled)
        guard Self.parse(key) != nil else { error = "shortcutError"; return }
        let previous = shortcuts[index]
        if let reference = references.removeValue(forKey: id) { UnregisterEventHotKey(reference) }
        if enabled && !register(value) { if previous.enabled { _ = register(previous) }; error = "shortcutError"; return }
        var next = shortcuts; next[index] = value
        do {
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            try JSONEncoder().encode(next).write(to: file, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
            shortcuts = next; error = nil
        } catch {
            if let reference = references.removeValue(forKey: id) { UnregisterEventHotKey(reference) }
            if previous.enabled { _ = register(previous) }; self.error = "shortcutError"
        }
    }
    public func shutdown() {
        for reference in references.values { UnregisterEventHotKey(reference) }; references.removeAll()
        if let handler { RemoveEventHandler(handler) }; handler = nil
    }
    private func trigger(_ index: Int) { guard shortcuts.indices.contains(index), shortcuts[index].enabled else { return }; onAction?(shortcuts[index].id) }
    private func register(_ shortcut: NativeShortcut) -> Bool {
        guard let (key, modifiers) = Self.parse(shortcut.key), let index = shortcuts.firstIndex(where: { $0.id == shortcut.id }) else { return false }
        var reference: EventHotKeyRef?
        guard RegisterEventHotKey(key, modifiers, EventHotKeyID(signature: 0x565A4E31, id: UInt32(index)), GetApplicationEventTarget(), 0, &reference) == noErr, let reference else { return false }
        references[shortcut.id] = reference; return true
    }
    private static func parse(_ input: String) -> (UInt32, UInt32)? {
        let keys: [String: UInt32] = ["a":0,"s":1,"d":2,"f":3,"h":4,"g":5,"z":6,"x":7,"c":8,"v":9,"b":11,"q":12,"w":13,"e":14,"r":15,"y":16,"t":17,"1":18,"2":19,"3":20,"4":21,"6":22,"5":23,"9":25,"7":26,"8":28,"0":29,"o":31,"u":32,"i":34,"p":35,"l":37,"j":38,"k":40,"n":45,"m":46,"space":49]
        let parts = input.lowercased().split(separator: "+").map { $0.trimmingCharacters(in: .whitespaces) }
        guard let key = parts.last.flatMap({ keys[$0] }), parts.count > 1 else { return nil }
        var flags: UInt32 = 0
        for part in parts.dropLast() {
            switch part { case "command", "cmd", "meta": flags |= UInt32(cmdKey); case "control", "ctrl": flags |= UInt32(controlKey); case "option", "alt": flags |= UInt32(optionKey); case "shift": flags |= UInt32(shiftKey); default: return nil }
        }
        guard flags & UInt32(cmdKey | controlKey | optionKey) != 0 else { return nil }; return (key, flags)
    }
}
@MainActor public final class SelectedTextTarget {
    public let text: String
    public let applicationName: String
    private let application: AXUIElement
    private let element: AXUIElement
    private let range: CFRange
    private let pid: pid_t
    private init(text: String, applicationName: String, application: AXUIElement, element: AXUIElement, range: CFRange, pid: pid_t) {
        self.text = text; self.applicationName = applicationName; self.application = application; self.element = element; self.range = range; self.pid = pid
    }
    public static func capture() throws -> SelectedTextTarget {
        guard AXIsProcessTrusted(), let foreground = NSWorkspace.shared.frontmostApplication, foreground.processIdentifier != ProcessInfo.processInfo.processIdentifier else { throw StorageFailure.invalidData }
        let application = AXUIElementCreateApplication(foreground.processIdentifier)
        var focused: CFTypeRef?, selected: CFTypeRef?, selectionRange: CFTypeRef?
        guard AXUIElementCopyAttributeValue(application, kAXFocusedUIElementAttribute as CFString, &focused) == .success, let focused, CFGetTypeID(focused) == AXUIElementGetTypeID() else { throw StorageFailure.invalidData }
        let element = focused as! AXUIElement
        guard AXUIElementCopyAttributeValue(element, kAXSelectedTextAttribute as CFString, &selected) == .success, let text = selected as? String, !text.isEmpty, text.utf8.count <= 131072,
              AXUIElementCopyAttributeValue(element, kAXSelectedTextRangeAttribute as CFString, &selectionRange) == .success,
              let selectionRange, CFGetTypeID(selectionRange) == AXValueGetTypeID() else { throw StorageFailure.invalidData }
        var range = CFRange()
        guard AXValueGetValue(selectionRange as! AXValue, .cfRange, &range), range.length > 0 else { throw StorageFailure.invalidData }
        return Self(text: text, applicationName: foreground.localizedName ?? "", application: application, element: element, range: range, pid: foreground.processIdentifier)
    }
    public func replace(with translation: String) throws {
        guard !translation.isEmpty, NSRunningApplication(processIdentifier: pid)?.isTerminated == false else { throw StorageFailure.invalidData }
        var focused: CFTypeRef?, selected: CFTypeRef?, selectionRange: CFTypeRef?
        guard AXUIElementCopyAttributeValue(application, kAXFocusedUIElementAttribute as CFString, &focused) == .success, let focused, CFEqual(focused, element),
              AXUIElementCopyAttributeValue(element, kAXSelectedTextAttribute as CFString, &selected) == .success, selected as? String == text,
              AXUIElementCopyAttributeValue(element, kAXSelectedTextRangeAttribute as CFString, &selectionRange) == .success, let selectionRange, CFGetTypeID(selectionRange) == AXValueGetTypeID() else { throw StorageFailure.invalidData }
        var current = CFRange(); var writable: DarwinBoolean = false
        guard AXValueGetValue(selectionRange as! AXValue, .cfRange, &current), current.location == range.location, current.length == range.length,
              AXUIElementIsAttributeSettable(element, kAXSelectedTextAttribute as CFString, &writable) == .success, writable.boolValue,
              AXUIElementSetAttributeValue(element, kAXSelectedTextAttribute as CFString, translation as CFString) == .success else { throw StorageFailure.invalidData }
    }
}
public struct LauncherApplication: Identifiable, Sendable { public let id: String; public let name: String }
public enum LauncherCatalog {
    public static func applications() -> [LauncherApplication] {
        let fm = FileManager.default
        let roots = [URL(fileURLWithPath: "/Applications"), URL(fileURLWithPath: "/System/Applications"), fm.homeDirectoryForCurrentUser.appendingPathComponent("Applications")]
        var result: [LauncherApplication] = []
        for root in roots {
            guard let iterator = fm.enumerator(at: root, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles, .skipsPackageDescendants]) else { continue }
            for case let url as URL in iterator {
                if iterator.level > 3 { iterator.skipDescendants(); continue }
                if url.pathExtension == "app" { result.append(.init(id: url.path, name: Bundle(url: url)?.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? url.deletingPathExtension().lastPathComponent)); iterator.skipDescendants() }
            }
        }
        return result.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
}

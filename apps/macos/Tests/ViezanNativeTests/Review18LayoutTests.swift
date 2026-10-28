import AppKit
import SwiftUI
import Testing
import ViezanDomain
@testable import ViezanNative

// Isolated layout evidence: no user storage, provider calls or UI automation.
@MainActor private final class ReviewStorage: WorkspacePersistence {
    func load() throws -> Workspace? { Workspace() }
    func save(_ workspace: Workspace) throws {}
}

@Suite(.serialized) @MainActor struct Review18LayoutTests {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["VIEZAN_REVIEW18_LAYOUT_EVIDENCE"] != nil))
    func renderSettingsAndDictionary() async throws {
        _ = NSApplication.shared
        let originalPreferences = NativeTheme.shared.preferences
        defer { NativeTheme.shared.preferences = originalPreferences }
        let folder = try #require(ProcessInfo.processInfo.environment["VIEZAN_REVIEW18_LAYOUT_EVIDENCE"])
        let directory = URL(fileURLWithPath: folder)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let entry = try #require(DictionaryEntry.parse(#"{"headword":"serendipity","pronunciation":"/ˌser.ənˈdɪp.ə.ti/","meaning":"Sự tình cờ may mắn","translations":[{"text":"Sự tình cờ may mắn","pronunciation":"sự tình cờ may mắn","meaning":"Tìm thấy điều tốt đẹp một cách bất ngờ.","examples":["Finding this little bookshop was pure serendipity."]}],"examples":["Tìm thấy hiệu sách nhỏ này đúng là một sự tình cờ may mắn."]}"#))
        for mode in [AppearanceMode.light, .dark] {
            for width in [640.0, 820, 1400] {
                for section in ["general", "appearance", "voice", "dictionary"] {
                    let store = WorkbenchStore(persistence: ReviewStorage(), automaticProvider: false)
                    store.setLocale("vi")
                    store.setAppearance(mode: mode, textSize: .medium)
                    NativeTheme.shared.preferences = store.workspace.preferences
                    let content: AnyView
                    if section == "dictionary" {
                        content = AnyView(ScrollView { DictionaryResultView(entry: entry, store: store).padding(metric("gutter")) })
                    } else {
                        content = AnyView(NativeSettings(store: store, query: .constant(""), section: .constant(section)))
                    }
                    let host = NSHostingView(rootView: content.background(contentColor("canvas", mode == .dark ? .dark : .light)).environment(\.colorScheme, mode == .dark ? .dark : .light))
                    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: width - metric("rail"), height: 600), styleMask: [.borderless], backing: .buffered, defer: false)
                    window.isReleasedWhenClosed = false
                    window.contentView = host
                    window.appearance = NSAppearance(named: mode == .dark ? .darkAqua : .aqua)
                    // Use feature-container widths, after the primary rail is removed.
                    window.setContentSize(NSSize(width: width - metric("rail"), height: 600))
                    try await Task.sleep(for: .milliseconds(80))
                    host.layoutSubtreeIfNeeded()
                    #expect(abs(host.bounds.width - (width - metric("rail"))) < 1)
                    let bitmap = try #require(host.bitmapImageRepForCachingDisplay(in: host.bounds))
                    host.cacheDisplay(in: host.bounds, to: bitmap)
                    let data = try #require(bitmap.representation(using: .png, properties: [:]))
                    try data.write(to: directory.appendingPathComponent("\(section)-\(mode.rawValue)-\(Int(width)).png"))
                    window.contentView = nil
                    window.close()
                }
            }
        }
    }
}

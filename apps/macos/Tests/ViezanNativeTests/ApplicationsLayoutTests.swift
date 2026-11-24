import AppKit
import SwiftUI
import Testing
@testable import ViezanDomain
@testable import ViezanNative

extension AppKitFixtureTests {
    @Suite @MainActor struct ApplicationsLayoutTests {
        private struct Storage: WorkspacePersistence {
            func load() throws -> Workspace? { Workspace() }
            func save(_ workspace: Workspace) throws {}
        }

        private func height(of view: some View, width: CGFloat) -> CGFloat {
            NSHostingView(rootView: view.frame(width: width).fixedSize(horizontal: false, vertical: true)).fittingSize.height
        }

        @Test(arguments: ["vi", "en", "ja"])
        func planWrapsLongPathsAndReflowsTheTrashButton(locale: String) {
            _ = NSApplication.shared
            let store = WorkbenchStore(persistence: Storage(), automaticProvider: false, listModels: { _ in [] }, hasKey: { _ in false })
            store.setLocale(locale)
            let workspace = ApplicationsWorkspace(store: store)
            let app = InstalledApplication(path: "/Applications/Example.app", name: "Example", bundleID: "org.example.app", version: "1")
            let plan = ApplicationPlan(app: app, items: [], incomplete: false)
            func row(_ path: String) -> some View {
                workspace.planItemRow(.init(path: path, kind: "data", evidence: "exact", bytes: 1024, selected: false), selection: .constant([]))
            }
            let longPath = "/Library/Preferences/org.example." + String(repeating: "longcomponent", count: 12) + ".plist"
            for width: CGFloat in [400, 500, 760] {
                #expect(height(of: row(longPath), width: width) > height(of: row(app.path), width: width))
            }
            let footer = workspace.planFooter(plan)
            #expect(height(of: footer, width: 380) > height(of: footer, width: 760))
        }

        private struct PlanRowFixture: View {
            let workspace: ApplicationsWorkspace
            let item: ApplicationDataItem
            @State private var selection = Set<String>()

            var body: some View {
                workspace.planItemRow(item, selection: $selection)
            }
        }

        @Test(arguments: [false, true])
        func libraryRowsExposeTheirSelectionStateToAccessibility(shortcut: Bool) async throws {
            _ = NSApplication.shared
            let store = WorkbenchStore(persistence: Storage(), automaticProvider: false, listModels: { _ in [] }, hasKey: { _ in false })
            let workspace = ApplicationsWorkspace(store: store)
            let id = "dev.example.Editor"
            let path = shortcut ? "/Applications/Editor.app" : "/Library/Logs/" + id
            // SwiftUI exposes virtual controls through AX selectors without adopting the full AppKit protocol.
            func checkbox(in object: NSObject) -> NSObject? {
                let node: AnyObject = object
                let role = node.accessibilityRole?()
                if role == .checkBox { return object }
                let children = node.accessibilityChildren?() as? [NSObject] ?? []
                return children.lazy.compactMap { checkbox(in: $0) }.first
            }
            func waitForCheckbox(in host: NSView, checked: Bool) async throws -> NSObject {
                let deadline = ContinuousClock.now + .seconds(2)
                var matching: NSObject?
                repeat {
                    host.layoutSubtreeIfNeeded()
                    if let element = checkbox(in: host) {
                        let value = element.perform(#selector(NSAccessibilityProtocol.accessibilityValue))?.takeUnretainedValue() as? NSNumber
                        if value?.boolValue == checked { matching = element; break }
                    }
                    try await Task.sleep(for: .milliseconds(10))
                } while ContinuousClock.now < deadline
                return try #require(matching, "Expected an accessible checkbox with checked = \(checked)")
            }
            for width in [820, 1200] {
                for scheme in [ColorScheme.light, .dark] {
                    for block: String? in [nil, "appShared"] {
                        let item = ApplicationDataItem(path: path, kind: shortcut ? "bundle" : "data", evidence: shortcut ? "symbolicLink" : "exact",
                                                       bytes: shortcut ? 0 : 1024, selected: false, blocked: block,
                                                       systemItem: !shortcut && block == nil ? .init(identifier: id, folder: "Logs") : nil)
                        let row = PlanRowFixture(workspace: workspace, item: item)
                            .environment(\.colorScheme, scheme).environment(\.accessibilityEnabled, true).frame(width: CGFloat(width) / 2)
                        let host = NSHostingView(rootView: row)
                        let window = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: width, height: 120),
                                              styleMask: [.borderless], backing: .buffered, defer: false)
                        window.contentView = host
                        window.isReleasedWhenClosed = false
                        window.orderFront(nil)
                        defer { window.contentView = nil; window.close() }
                        let control: AnyObject = try await waitForCheckbox(in: host, checked: false)
                        let name = try #require(control.accessibilityLabel?())
                        #expect(name.contains(path))
                        #expect(control.isAccessibilityEnabled?() == (block == nil))
                        if let block {
                            #expect(name.contains(store.text(block)))
                        } else {
                            if shortcut { #expect(name.contains(store.text("appEvidence_symbolicLink"))) }
                            #expect(control.accessibilityPerformPress?() == true)
                            let checked: AnyObject = try await waitForCheckbox(in: host, checked: true)
                            #expect(checked.accessibilityPerformPress?() == true)
                            _ = try await waitForCheckbox(in: host, checked: false)
                        }
                    }
                }
            }
        }

        @Test(arguments: ["vi", "en", "ja"])
        func scanActionsReflowWithTheAvailableWidth(locale: String) {
            _ = NSApplication.shared
            let store = WorkbenchStore(persistence: Storage(), automaticProvider: false, listModels: { _ in [] }, hasKey: { _ in false })
            store.setLocale(locale)
            let workspace = ApplicationsWorkspace(store: store)
            let issue = ApplicationScanIssue(path: "/Applications/Fixture.app", reason: .invalidBundle)
            let longPath = "/Applications/" + String(repeating: "Nested folder/", count: 20) + "Fixture.app"
            let longIssue = ApplicationScanIssue(path: longPath, reason: .invalidBundle)

            // Measure the card's own content width, independently of the sidebar and window minimum.
            let row = workspace.scanIssueRow(issue)
            let wideRow = height(of: row, width: 900)
            #expect(height(of: row, width: 400) >= wideRow + metric("compactControl"))
            #expect(height(of: workspace.scanIssueRow(longIssue), width: 900) == wideRow)
            #expect(wideRow < metric("compactControl") * 2)

            let header = workspace.scanWarningHeader(blocking: true, count: 1)
            #expect(height(of: header, width: 400) >= height(of: header, width: 900) + metric("compactControl"))
        }
    }
}

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

import Foundation
import Testing
@testable import ViezanDomain

@MainActor
struct ApplicationsShortcutsTests {
    private let files = FileManager.default
    private var directory: URL { files.temporaryDirectory.appendingPathComponent(UUID().uuidString) }

    private func item(_ status: String, backup: String? = nil) -> ApplicationJournal.Item {
        .init(path: "/fixture/Example.app", status: status,
              snapshot: .init(device: 1, inode: 2, digest: "fixture", bytes: 0), preferenceBackup: backup)
    }

    @Test func personalDataCountUsesCurrentSelectionAndExcludesBlockedItems() {
        let app = InstalledApplication(path: "/fixture/Example.app", name: "Example", bundleID: "example.app", version: "1")
        func dataItem(_ kind: String, personal: Bool, blocked: String? = nil) -> ApplicationDataItem {
            .init(id: kind, path: "/fixture/" + kind, kind: kind, evidence: "exact", bytes: nil,
                  selected: !personal, blocked: blocked, note: personal ? "personalData" : nil)
        }
        let items = [dataItem("cache", personal: false), dataItem("cookies", personal: true),
                     dataItem("preferences", personal: true), dataItem("container", personal: true, blocked: "appProtected")]
        let plan = ApplicationPlan(app: app, items: items, incomplete: false)

        #expect(plan.personalDataCount(selected: []) == 0)
        #expect(plan.personalDataCount(selected: ["cache"]) == 0)
        #expect(plan.personalDataCount(selected: ["cookies", "cache"]) == 1)
        #expect(plan.personalDataCount(selected: ["cookies", "preferences"]) == 2)
        #expect(plan.personalDataCount(selected: ["container"]) == 0)
    }

    @Test(arguments: ["trashed", "preferencesRemoved", "preferencesBackedUp", "failed"])
    func latestUndoableJournalUsesTheFirstRestorableEntry(status: String) throws {
        let root = directory
        try files.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? files.removeItem(at: root) }
        let skipped = ApplicationJournal(appName: "Finished", action: "uninstall",
                                         items: [item("restored"), item("failed"), item("pending")])
        let eligible = ApplicationJournal(appName: "Latest", action: "reset",
                                          items: [item("restored"), item(status, backup: status == "failed" ? "backup.plist" : nil)])
        let older = ApplicationJournal(appName: "Older", action: "uninstall", items: [item("trashed")])
        let url = root.appendingPathComponent("journal.json")
        try JSONEncoder().encode([skipped, eligible, older]).write(to: url)
        #expect(Applications(journalDirectory: root).latestUndoableJournalID == eligible.id)
        try JSONEncoder().encode([skipped]).write(to: url)
        let apps = Applications(journalDirectory: root)
        #expect(apps.error == nil)
        #expect(apps.latestUndoableJournalID == nil)
    }

    @Test func dropMatchesTheInventoryEntryResolvingOnlyItsParent() throws {
        let root = directory
        let folder = root.appendingPathComponent("Applications")
        let bundle = folder.appendingPathComponent("Example.app")
        try files.createDirectory(at: bundle, withIntermediateDirectories: true)
        defer { try? files.removeItem(at: root) }
        let alias = root.appendingPathComponent("Linked folder")
        try files.createSymbolicLink(at: alias, withDestinationURL: folder)
        let externalLink = root.appendingPathComponent("Example.app")
        try files.createSymbolicLink(at: externalLink, withDestinationURL: bundle)
        let entry = InstalledApplication(path: bundle.path, name: "Example", bundleID: "example.app", version: "1")
        let apps = Applications(journalDirectory: root, applications: [entry])

        #expect(apps.application(forDroppedPath: bundle.path)?.id == entry.id)
        #expect(apps.application(forDroppedPath: bundle.path + "/")?.id == entry.id)
        #expect(apps.application(forDroppedPath: alias.appendingPathComponent("Example.app").path)?.id == entry.id)
        #expect(apps.application(forDroppedPath: folder.appendingPathComponent("Missing.app").path) == nil)
        #expect(apps.application(forDroppedPath: externalLink.path) == nil)
        #expect(apps.application(forDroppedPath: bundle.path + "/Contents") == nil)
        #expect(apps.application(forDroppedPath: bundle.path + "/Contents/Example.app") == nil)
    }
}

import Foundation
import Testing
@testable import ViezanDomain

@MainActor
struct ApplicationsOwnershipTests {
    private final class Fixture: Sendable {
        let root: URL
        var installed: URL { root.appendingPathComponent("Applications") }
        var store: URL { installed.appendingPathComponent("Store HD.app") }
        var trash: URL { root.appendingPathComponent("Trash") }
        var moved: URL { trash.appendingPathComponent(store.lastPathComponent) }
        var journalDirectory: URL { root.appendingPathComponent("Journal") }
        var installs: [ApplicationInstallRoot] { [.init(path: installed.path)] }

        init() throws {
            let fm = FileManager.default
            root = URL(fileURLWithPath: try ApplicationFiles.canonical(fm.temporaryDirectory.path)).appendingPathComponent(UUID().uuidString)
            try fm.createDirectory(at: trash, withIntermediateDirectories: true)
            for (name, id) in [("Store HD", "dev.viezan.store"), ("Mine", "dev.viezan.mine")] {
                let contents = installed.appendingPathComponent(name + ".app/Contents")
                try fm.createDirectory(at: contents, withIntermediateDirectories: true)
                try PropertyListSerialization.data(fromPropertyList: ["CFBundleIdentifier": id, "CFBundlePackageType": "APPL"], format: .xml, options: 0).write(to: contents.appendingPathComponent("Info.plist"))
            }
            try fm.setAttributes([.posixPermissions: 0o555], ofItemAtPath: store.path)
        }
        deinit {
            let fm = FileManager.default
            for url in [store, moved] where fm.fileExists(atPath: url.path) { try? fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: url.path) }
            try? fm.removeItem(at: root)
        }

        func inventory() throws -> [InstalledApplication] {
            let result = try ApplicationFiles.scan(roots: [installed.path], home: root.path, installRoots: installs)
            #expect(result.issues.isEmpty)
            return result.applications
        }
        func plan() throws -> ApplicationPlan {
            let all = try inventory(), app = try #require(all.first { $0.path == store.path })
            return ApplicationFiles.plan(app, all: all, userLibrary: installed.appendingPathComponent("Library").path, systemLibrary: root.appendingPathComponent("SystemLibrary").path, receipts: root.appendingPathComponent("receipts").path)
        }
        // The fixture owns the 0555 bundle and can grant itself the write bit for the move.
        func move(_ path: String, to destination: String) throws {
            let fm = FileManager.default
            try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: path)
            try fm.moveItem(atPath: path, toPath: destination)
            try fm.setAttributes([.posixPermissions: 0o555], ofItemAtPath: destination)
        }
        var finder: ApplicationFinder {
            ApplicationFinder(trash: { [self] path in
                try move(path, to: moved.path)
                return moved.path + "/"
            }, restore: { [self] path, parent in
                try move(path, to: (parent as NSString).appendingPathComponent((path as NSString).lastPathComponent))
            })
        }
        @MainActor func apps(_ finder: ApplicationFinder) -> Applications {
            Applications(journalDirectory: journalDirectory, finder: finder, installRoots: installs, trashDirectory: trash)
        }
        @MainActor func uninstall(_ apps: Applications, _ plan: ApplicationPlan) async {
            await apps.apply(plan, itemIDs: Set(plan.items.map(\.id)), reset: false, quit: false, helper: root.appendingPathComponent("missing-helper"))
        }
    }

    @Test func bundleTheUserCannotWriteNeedsAnAdministrator() throws {
        let fixture = try Fixture(), apps = try fixture.inventory()
        let store = try #require(apps.first { $0.path == fixture.store.path })
        let mine = try #require(apps.first { $0.bundleID == "dev.viezan.mine" })
        #expect(store.blocked == nil && store.needsAuthentication == true)
        #expect(try fixture.plan().items.first { $0.kind == "bundle" }?.note == "authentication")
        #expect(mine.blocked == nil && mine.needsAuthentication != true)
    }

    @Test(arguments: [false, true]) func authenticatedBundleCanBeTrashedAndRestored(cancelUndo: Bool) async throws {
        let fixture = try Fixture(), apps = fixture.apps(fixture.finder), plan = try fixture.plan()
        await fixture.uninstall(apps, plan)
        let journal = try #require(apps.journals.first), item = try #require(journal.items.first)
        try #require(item.status == "trashed")
        #expect(apps.error == nil && !apps.applications.contains { $0.path == fixture.store.path })
        #expect(item.authenticated == true)
        #expect(item.trashPath == fixture.moved.path && item.trashSnapshot == item.snapshot)

        let reopened = fixture.apps(ApplicationFinder(trash: fixture.finder.trash, restore: { path, parent in
            if cancelUndo { throw ApplicationActionFailure.cancelled }
            try fixture.finder.restore(path, parent)
        }))
        await reopened.undo(journal.id)
        #expect(reopened.error == nil)
        #expect(reopened.journals.first?.items.first?.status == (cancelUndo ? "trashed" : "restored"))
        #expect(FileManager.default.fileExists(atPath: fixture.store.path) == !cancelUndo)
        #expect(FileManager.default.fileExists(atPath: fixture.moved.path) == cancelUndo)
        #expect(try ApplicationFiles.snapshot(cancelUndo ? fixture.moved.path : fixture.store.path) == item.snapshot)
    }

    @Test func undoRestoresTheOriginalNameWhenTheTrashRenamedTheBundle() async throws {
        let fixture = try Fixture(), renamed = fixture.trash.appendingPathComponent("Store HD 19.21.54.app")
        let apps = fixture.apps(ApplicationFinder(trash: { path in
            try fixture.move(path, to: renamed.path)
            return renamed.path + "/"
        }, restore: fixture.finder.restore))
        await fixture.uninstall(apps, try fixture.plan())
        let journal = try #require(apps.journals.first), item = try #require(journal.items.first)
        try #require(item.status == "trashed" && item.trashPath == renamed.path)
        await apps.undo(journal.id)
        #expect(apps.error == nil && apps.journals.first?.items.first?.status == "restored")
        #expect(try ApplicationFiles.snapshot(fixture.store.path) == item.snapshot)
        #expect(!FileManager.default.fileExists(atPath: fixture.installed.appendingPathComponent(renamed.lastPathComponent).path))
    }

    @Test func undoRequiresTheOriginalSnapshotAtTheRestoredPath() async throws {
        let fixture = try Fixture()
        let apps = fixture.apps(ApplicationFinder(trash: fixture.finder.trash, restore: { _, parent in
            try FileManager.default.createDirectory(atPath: (parent as NSString).appendingPathComponent(fixture.store.lastPathComponent), withIntermediateDirectories: false)
        }))
        await fixture.uninstall(apps, try fixture.plan())
        let journal = try #require(apps.journals.first)
        try #require(journal.items.first?.status == "trashed")
        await apps.undo(journal.id)
        #expect(apps.journals.first?.items.first?.status == "trashed")
        #expect(apps.error == "appActionError")
    }

    @Test func cancellingAuthenticationPreservesDataAndPreviousJournal() async throws {
        let fixture = try Fixture(), fm = FileManager.default
        let cache = fixture.installed.appendingPathComponent("Library/Caches/dev.viezan.store")
        try fm.createDirectory(at: cache, withIntermediateDirectories: true)
        try fm.createDirectory(at: fixture.journalDirectory, withIntermediateDirectories: true)
        let older = ApplicationJournal(appName: "Older", action: "reset", items: [])
        try JSONEncoder().encode([older]).write(to: fixture.journalDirectory.appendingPathComponent("journal.json"))
        let plan = try fixture.plan()
        #expect(plan.items.contains { $0.path == cache.path && $0.blocked == nil && $0.selected })
        let dataFirst = ApplicationPlan(app: plan.app, items: plan.items.reversed(), incomplete: plan.incomplete)
        let finder = ApplicationFinder(trash: { path in
            #expect(path == fixture.store.path)
            let saved = try JSONDecoder().decode([ApplicationJournal].self, from: Data(contentsOf: fixture.journalDirectory.appendingPathComponent("journal.json")))
            #expect(saved.first?.items.map(\.path) == [fixture.store.path, cache.path])
            #expect(saved.first?.items.map(\.authenticated) == [true, nil])
            throw ApplicationActionFailure.cancelled
        }, restore: fixture.finder.restore)
        let apps = fixture.apps(finder)
        await fixture.uninstall(apps, dataFirst)
        #expect(apps.error == nil && apps.journals.map(\.id) == [older.id])
        #expect(fixture.apps(finder).journals.map(\.id) == [older.id])
        #expect(apps.applications.contains { $0.path == fixture.store.path })
        #expect(fm.fileExists(atPath: fixture.store.path) && fm.fileExists(atPath: cache.path))
    }

    @Test(arguments: ["wrongSnapshot", "outsideTrash", "denied"])
    func invalidFinderResultDoesNotMarkTheBundleTrashed(result: String) async throws {
        let fixture = try Fixture()
        try FileManager.default.createDirectory(at: fixture.moved, withIntermediateDirectories: false)
        let apps = fixture.apps(ApplicationFinder(trash: { path in
            if result == "denied" { throw ApplicationActionFailure.finderDenied }
            return result == "outsideTrash" ? path : fixture.moved.path
        }, restore: fixture.finder.restore))
        await fixture.uninstall(apps, try fixture.plan())
        let item = try #require(apps.journals.first?.items.first)
        #expect(item.status == "failed" && item.trashPath == nil && item.trashSnapshot == nil)
        #expect(apps.error == (result == "denied" ? "appFinderDenied" : "appActionError"))
    }
}

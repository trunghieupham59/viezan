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
        func savedJournal() throws -> ApplicationJournal {
            let data = try Data(contentsOf: journalDirectory.appendingPathComponent("journal.json"))
            return try #require(JSONDecoder().decode([ApplicationJournal].self, from: data).first)
        }
        func describe(_ paths: [String]) -> String {
            paths.map { path in
                var info = stat()
                let name = (path as NSString).lastPathComponent
                guard lstat(path, &info) == 0 else { return "\(name) errno=\(errno)" }
                let digest = (try? ApplicationFiles.snapshot(path).digest) ?? "unavailable"
                return "\(name) dev=\(info.st_dev) ino=\(info.st_ino) mode=\(String(info.st_mode, radix: 8)) digest=\(digest)"
            }.joined(separator: ", ")
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
            }, restore: { [self] path, destination in
                try move(path, to: destination)
                return destination + "/"
            })
        }
        @MainActor func apps(_ finder: ApplicationFinder) -> Applications {
            Applications(journalDirectory: journalDirectory, finder: finder, installRoots: installs, trashDirectory: trash)
        }
        @MainActor func uninstall(_ apps: Applications, _ plan: ApplicationPlan) async {
            await apps.apply(plan, itemIDs: Set(plan.items.map(\.id)), reset: false, quit: false, helper: root.appendingPathComponent("missing-helper"))
        }
    }

    @Test func fileHelperRoundTripsUninstallResetAndScanIssueInsideFixture() async throws {
        let fixture = try Fixture()
        let helper = fixture.root.appendingPathComponent("viezan-fs-fixture")
        // Only accept direct fixture paths. Refuse to overwrite an occupied slot, including a dangling link.
        let script = #"""
        #!/bin/sh
        set -eu
        root=$(cd -P "${0%/*}" && pwd -P)
        case "$1" in
          trash|trash-link)
            case "$2" in "$root/Applications/Mine.app"|"$root/Applications/FixtureCache"|"$root/Applications/Broken.app") ;; *) exit 1 ;; esac
            case "$5" in "$root/Journal/"*.json) ;; *) exit 1 ;; esac
            test "$(/usr/bin/stat -f %d:%i "$2")" = "$3:$4" || exit 1
            dst="$root/Trash/${2##*/}"
            test ! -e "$dst" && test ! -L "$dst" || exit 1
            /bin/mv "$2" "$dst"
            /usr/bin/plutil -create xml1 "$5"
            /usr/bin/plutil -insert path -string "$dst" "$5"
            /usr/bin/plutil -convert json "$5"
            /bin/cat "$5" ;;
          restore|restore-link)
            case "$3" in "$root/Applications/Mine.app"|"$root/Applications/FixtureCache"|"$root/Applications/Broken.app") ;; *) exit 1 ;; esac
            test "$2" = "$root/Trash/${3##*/}" || exit 1
            test "$(/usr/bin/stat -f %d:%i "$2")" = "$4:$5" || exit 1
            test ! -e "$3" && test ! -L "$3" || exit 1
            /bin/mv "$2" "$3" ;;
          *) exit 1 ;;
        esac
        """#
        try Data((script + "\n").utf8).write(to: helper)
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: helper.path)
        let apps = Applications(journalDirectory: fixture.journalDirectory, installRoots: fixture.installs,
                                trashDirectory: fixture.trash, userLibrary: fixture.root.appendingPathComponent("UserLibrary").path,
                                systemLibrary: fixture.root.appendingPathComponent("SystemLibrary").path, helperURL: helper)
        await apps.refresh()
        let mine = try #require(apps.applications.first { $0.bundleID == "dev.viezan.mine" })
        // Use an explicitly scoped cache fixture to avoid enumerating the user's Library.
        let bundle = ApplicationDataItem(path: mine.path, kind: "bundle", evidence: "bundle", bytes: nil, selected: true,
                                         snapshot: try ApplicationFiles.snapshot(mine.path))
        let cache = fixture.installed.appendingPathComponent("FixtureCache")
        try Data("fixture".utf8).write(to: cache)
        let data = ApplicationDataItem(path: cache.path, kind: "cache", evidence: "bundleID", bytes: nil, selected: true,
                                      snapshot: try ApplicationFiles.snapshot(cache.path))
        let plan = ApplicationPlan(app: mine, items: [bundle, data], incomplete: false)
        for (reset, selected) in [(true, [data]), (false, [bundle, data])] {
            await apps.apply(plan, itemIDs: Set(selected.map(\.id)), reset: reset, quit: false, helper: helper)
            let journal = try #require(apps.journals.first)
            try #require(apps.error == nil)
            #expect(journal.action == (reset ? "reset" : "uninstall"))
            #expect(journal.items.count == selected.count && journal.items.allSatisfy { $0.status == "trashed" })
            #expect(FileManager.default.fileExists(atPath: mine.path) == reset)
            #expect(!FileManager.default.fileExists(atPath: cache.path))
            for item in journal.items {
                let receipt = fixture.journalDirectory.appendingPathComponent(journal.id + "-" + item.id + ".json")
                #expect(try JSONDecoder().decode([String: String].self, from: Data(contentsOf: receipt))["path"] == item.trashPath)
            }
            await apps.undo(journal.id)
            #expect(apps.error == nil && apps.journals.first?.items.allSatisfy { $0.status == "restored" } == true)
            #expect(try ApplicationFiles.snapshot(mine.path) == bundle.snapshot)
            #expect(try Data(contentsOf: cache) == Data("fixture".utf8))
        }
        let broken = fixture.installed.appendingPathComponent("Broken.app")
        try FileManager.default.createSymbolicLink(atPath: broken.path, withDestinationPath: "Missing.app")
        await apps.refresh()
        let issue = try #require(apps.scanIssues.first { $0.path == broken.path })
        #expect(issue.canTrash)
        await apps.trashIssue(issue.id)
        let journal = try #require(apps.journals.first)
        #expect(apps.error == nil && journal.items.first?.isLink == true && journal.items.first?.status == "trashed")
        await apps.undo(journal.id)
        #expect(apps.error == nil && apps.journals.first?.items.first?.status == "restored")
        #expect(try FileManager.default.destinationOfSymbolicLink(atPath: broken.path) == "Missing.app")

        try FileManager.default.removeItem(at: broken)
        try FileManager.default.createSymbolicLink(atPath: broken.path, withDestinationPath: "Mine.app")
        for removeBundle in [false, true] {
            await apps.refresh()
            await apps.inspect(mine.path)
            let preview = try #require(apps.plan)
            let paths = removeBundle ? [broken.path, mine.path] : [broken.path]
            let selected = preview.items.filter { paths.contains($0.path) }
            try #require(selected.count == paths.count && selected.allSatisfy { $0.blocked == nil })
            await apps.apply(planID: preview.id, itemIDs: Set(selected.map(\.id)), reset: false, quit: false)
            let saved = try #require(apps.journals.first)
            try #require(apps.error == nil && saved.items.allSatisfy { $0.status == "trashed" })
            #expect(saved.items.first { $0.path == broken.path }?.isLink == true)
            #expect(FileManager.default.fileExists(atPath: mine.path) == !removeBundle)
            #expect((try? FileManager.default.destinationOfSymbolicLink(atPath: broken.path)) == nil)
            await apps.undo(saved.id)
            #expect(apps.error == nil && apps.journals.first?.items.allSatisfy { $0.status == "restored" } == true)
            #expect(try ApplicationFiles.snapshot(mine.path) == bundle.snapshot)
            #expect(try FileManager.default.destinationOfSymbolicLink(atPath: broken.path) == "Mine.app")
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

        let reopened = fixture.apps(ApplicationFinder(trash: fixture.finder.trash, restore: { path, destination in
            if cancelUndo { throw ApplicationActionFailure.cancelled }
            return try fixture.finder.restore(path, destination)
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
        let intermediate = fixture.installed.appendingPathComponent(renamed.lastPathComponent)
        #expect(apps.error == nil && apps.journals.first?.items.first?.status == "restored",
                "Expected \(item.snapshot.digest). \(fixture.describe([fixture.store.path, renamed.path, intermediate.path]))")
        #expect(try ApplicationFiles.snapshot(fixture.store.path) == item.snapshot)
        #expect(!FileManager.default.fileExists(atPath: intermediate.path))
    }

    @Test(arguments: [false, true])
    func resumesPersistedUndoBeforeOrAfterAnExclusiveMove(alreadyMoved: Bool) async throws {
        let fixture = try Fixture(), renamed = fixture.trash.appendingPathComponent("Store HD 2.app")
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: fixture.store.path)
        let expected = try ApplicationFiles.snapshot(fixture.store.path)
        try FileManager.default.moveItem(at: fixture.store, to: renamed)
        let item = ApplicationJournal.Item(path: fixture.store.path, status: "restoring", trashPath: renamed.path,
                                           snapshot: expected, authenticated: true, trashSnapshot: expected)
        let journal = ApplicationJournal(appName: "Store HD", action: "uninstall", items: [item])
        try FileManager.default.createDirectory(at: fixture.journalDirectory, withIntermediateDirectories: true)
        try JSONEncoder().encode([journal]).write(to: fixture.journalDirectory.appendingPathComponent("journal.json"))
        if alreadyMoved { _ = try ApplicationFinder.live.restore(renamed.path, fixture.store.path) }
        let reopened = fixture.apps(.live)
        await reopened.undo(journal.id)
        #expect(reopened.error == nil)
        #expect(try fixture.savedJournal().items.first?.status == "restored")
        #expect(try ApplicationFiles.snapshot(fixture.store.path) == expected)
        #expect(!FileManager.default.fileExists(atPath: renamed.path))
        #expect(!FileManager.default.fileExists(atPath: fixture.installed.appendingPathComponent(renamed.lastPathComponent).path))
    }

    @Test func undoPersistsIntentAndReconcilesAnErrorAfterTheMove() async throws {
        let fixture = try Fixture()
        let apps = fixture.apps(ApplicationFinder(trash: fixture.finder.trash, restore: { source, destination in
            #expect(try fixture.savedJournal().items.first?.status == "restoring")
            try fixture.move(source, to: destination)
            throw ApplicationActionFailure.cancelled
        }))
        await fixture.uninstall(apps, try fixture.plan())
        let journal = try fixture.savedJournal()
        await apps.undo(journal.id)
        #expect(apps.error == nil)
        #expect(try fixture.savedJournal().items.first?.status == "restored")
        #expect(try ApplicationFiles.snapshot(fixture.store.path) == journal.items.first?.snapshot)
    }

    @Test func undoLeavesAnAlteredIntermediateInPlace() async throws {
        let fixture = try Fixture(), renamed = fixture.trash.appendingPathComponent("Store HD 2.app")
        let apps = fixture.apps(ApplicationFinder(trash: { path in
            try fixture.move(path, to: renamed.path)
            return renamed.path
        }, restore: fixture.finder.restore))
        await fixture.uninstall(apps, try fixture.plan())
        let journal = try fixture.savedJournal()
        let intermediate = fixture.installed.appendingPathComponent(renamed.lastPathComponent)
        try fixture.move(renamed.path, to: intermediate.path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: intermediate.path) }
        let marker = intermediate.appendingPathComponent("Contents/changed")
        try Data("changed".utf8).write(to: marker)
        let reopened = fixture.apps(fixture.finder)
        await reopened.undo(journal.id)
        #expect(reopened.error == "appActionError")
        #expect(try fixture.savedJournal().items.first?.status == "restoring")
        #expect(try Data(contentsOf: marker) == Data("changed".utf8))
        #expect(!FileManager.default.fileExists(atPath: fixture.store.path))
    }

    @Test func undoRequiresTheOriginalSnapshotAtTheRestoredPath() async throws {
        let fixture = try Fixture()
        let apps = fixture.apps(ApplicationFinder(trash: fixture.finder.trash, restore: { _, destination in
            try FileManager.default.createDirectory(atPath: destination, withIntermediateDirectories: false)
            return destination
        }))
        await fixture.uninstall(apps, try fixture.plan())
        let journal = try #require(apps.journals.first)
        try #require(journal.items.first?.status == "trashed")
        await apps.undo(journal.id)
        #expect(apps.journals.first?.items.first?.status == "trashed")
        #expect(apps.error == "appActionError")
    }

    @Test(arguments: [false, true])
    func resumesAuthenticatedUndoFromA260Journal(alreadyAtOriginal: Bool) async throws {
        let fixture = try Fixture(), renamed = fixture.trash.appendingPathComponent("Store HD 19.21.54.app")
        let apps = fixture.apps(ApplicationFinder(trash: { path in
            try fixture.move(path, to: renamed.path)
            return renamed.path
        }, restore: fixture.finder.restore))
        await fixture.uninstall(apps, try fixture.plan())
        let journal = try #require(apps.journals.first)
        try #require(journal.items.first?.status == "trashed")
        let intermediate = fixture.installed.appendingPathComponent(renamed.lastPathComponent)
        try fixture.move(renamed.path, to: alreadyAtOriginal ? fixture.store.path : intermediate.path)

        let reopened = fixture.apps(fixture.finder)
        #expect(reopened.journals.first?.items.first?.status == "restoring")
        await reopened.undo(journal.id)
        #expect(reopened.error == nil)
        #expect(reopened.journals.first?.items.first?.status == "restored")
        #expect(try ApplicationFiles.snapshot(fixture.store.path) == journal.items.first?.snapshot)
        #expect(!FileManager.default.fileExists(atPath: intermediate.path))
        await reopened.undo(journal.id)
        #expect(fixture.apps(fixture.finder).journals.first?.items.first?.status == "restored")
    }

    @Test func liveRestoreMovesAWritableRenamedBundleDirectlyToItsOriginalName() throws {
        let fixture = try Fixture()
        let source = fixture.trash.appendingPathComponent("Writable 19.21.54.app")
        let destination = fixture.installed.appendingPathComponent("Writable.app")
        let intermediate = fixture.installed.appendingPathComponent(source.lastPathComponent)
        try FileManager.default.createDirectory(at: source, withIntermediateDirectories: false)
        try Data([1, 2, 3]).write(to: source.appendingPathComponent("fixture"))
        let before = try ApplicationFiles.snapshot(source.path)
        let restored = try ApplicationFinder.live.restore(source.path, destination.path)
        #expect(restored == destination.path)
        #expect(try ApplicationFiles.snapshot(restored) == before)
        #expect(!FileManager.default.fileExists(atPath: source.path))
        #expect(!FileManager.default.fileExists(atPath: intermediate.path))
    }

    @Test func protectedDestinationKeepsTheRenamedBundleInTrash() async throws {
        let fixture = try Fixture(), renamed = fixture.trash.appendingPathComponent("Store HD 2.app")
        let apps = fixture.apps(ApplicationFinder(trash: { path in
            try fixture.move(path, to: renamed.path)
            return renamed.path
        }, restore: ApplicationFinder.live.restore))
        await fixture.uninstall(apps, try fixture.plan())
        let journal = try #require(apps.journals.first)
        try #require(journal.items.first?.status == "trashed")
        try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: fixture.installed.path)
        defer {
            try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: fixture.installed.path)
            try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: renamed.path)
        }
        try #require(access(fixture.installed.path, W_OK) != 0)
        await apps.undo(journal.id)
        #expect(apps.error == "appRestoreInFinder")
        let saved = try #require(fixture.apps(fixture.finder).journals.first?.items.first)
        #expect(saved.status == "trashed" && saved.issue == "appRestoreInFinder")
        #expect(try ApplicationFiles.snapshot(renamed.path) == saved.snapshot)
        #expect(!FileManager.default.fileExists(atPath: fixture.store.path))
        #expect(!FileManager.default.fileExists(atPath: fixture.installed.appendingPathComponent(renamed.lastPathComponent).path))
    }

    @Test(arguments: [false, true])
    func renamedBundleCannotReplaceALateArrival(danglingLink: Bool) async throws {
        let fixture = try Fixture(), renamed = fixture.trash.appendingPathComponent("Store HD 2.app")
        let marker = Data("existing file".utf8), missing = fixture.root.appendingPathComponent("missing").path
        let apps = fixture.apps(ApplicationFinder(trash: { path in
            try fixture.move(path, to: renamed.path)
            return renamed.path
        }, restore: { source, destination in
            if danglingLink {
                try FileManager.default.createSymbolicLink(atPath: destination, withDestinationPath: missing)
            } else {
                try marker.write(to: URL(fileURLWithPath: destination))
            }
            return try ApplicationFinder.live.restore(source, destination)
        }))
        await fixture.uninstall(apps, try fixture.plan())
        let journal = try #require(apps.journals.first)
        try #require(journal.items.first?.status == "trashed")
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: renamed.path) }
        await apps.undo(journal.id)
        #expect(apps.error != nil && apps.journals.first?.items.first?.status == "trashed")
        #expect(try ApplicationFiles.snapshot(renamed.path) == journal.items.first?.snapshot)
        if danglingLink { #expect(try FileManager.default.destinationOfSymbolicLink(atPath: fixture.store.path) == missing) }
        else { #expect(try Data(contentsOf: fixture.store) == marker) }
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

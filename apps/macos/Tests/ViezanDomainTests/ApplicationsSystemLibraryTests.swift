import Foundation
import Testing
@testable import ViezanDomain

@MainActor
struct ApplicationsSystemLibraryTests {
    private struct Fixture {
        let root: URL
        let appID = "dev.example.Editor"
        var installs: URL { root.appendingPathComponent("Applications") }
        var bundle: URL { installs.appendingPathComponent("Editor.app") }
        var library: URL { root.appendingPathComponent("Library") }
        var trash: URL { root.appendingPathComponent("Trash") }
        var prefs: URL { library.appendingPathComponent("Preferences/" + appID + ".helper.plist") }
        var logs: URL { library.appendingPathComponent("Logs/" + appID) }
        var daemon: URL { library.appendingPathComponent("LaunchDaemons/" + appID + ".helper.plist") }
        var fm: FileManager { .default }

        init() throws {
            root = URL(fileURLWithPath: try ApplicationFiles.canonical(FileManager.default.temporaryDirectory.path)).appendingPathComponent(UUID().uuidString + ".noindex")
            try writePlist(["CFBundleIdentifier": appID, "SMPrivilegedExecutables": [appID + ".helper": "requirement"]],
                           to: bundle.appendingPathComponent("Contents/Info.plist"))
            let executable = bundle.appendingPathComponent("Contents/MacOS/helper")
            try fm.createDirectory(at: executable.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data().write(to: executable)
            try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: executable.path)
            try writePlist(["Label": appID + ".helper", "ProgramArguments": [executable.path]], to: daemon)
            try writePlist(["fixture": true], to: prefs)
            try fm.createDirectory(at: logs, withIntermediateDirectories: true)
            try fm.createDirectory(at: trash, withIntermediateDirectories: true)
        }

        func writePlist(_ info: [String: Any], to path: URL) throws {
            try fm.createDirectory(at: path.deletingLastPathComponent(), withIntermediateDirectories: true)
            try PropertyListSerialization.data(fromPropertyList: info, format: .xml, options: 0).write(to: path)
        }

        @MainActor func service(_ selection: @escaping @Sendable ([String]) throws -> [String]) -> Applications {
            let finder = ApplicationFinder(trash: { _ in throw StorageFailure.invalidData }, restore: { path, destination in
                try FileManager.default.moveItem(atPath: path, toPath: destination)
                return destination
            }, trashSelection: selection)
            return Applications(journalDirectory: root.appendingPathComponent("Journal"), finder: finder,
                                installRoots: [.init(path: installs.path)], trashDirectory: trash,
                                userLibrary: root.appendingPathComponent("UserLibrary").path, systemLibrary: library.path,
                                helperURL: URL(fileURLWithPath: "/usr/bin/false"))
        }

        @MainActor func plan(_ apps: Applications) async throws -> ApplicationPlan {
            await apps.refresh()
            await apps.inspect(bundle.path)
            return try #require(apps.plan)
        }
    }

    @Test func previewAndConfirmOnlySelectedOwnedLibraryItems() async throws {
        let f = try Fixture()
        defer { try? f.fm.removeItem(at: f.root) }
        let lookalike = f.library.appendingPathComponent("Preferences/" + f.appID + ".other.plist")
        try f.writePlist([:], to: lookalike)
        let dest = f.trash.path, expected = Set([f.prefs.path, f.logs.path, f.daemon.path])
        let apps = f.service { paths in
            #expect(Set(paths) == expected)
            return try paths.map { source in
                let name = (source as NSString).lastPathComponent
                let target = FileManager.default.fileExists(atPath: dest + "/" + name) ? dest + "/2 " + name : dest + "/" + name
                try FileManager.default.moveItem(atPath: source, toPath: target)
                return target
            }.reversed()
        }
        let plan = try await f.plan(apps)
        let allowed = plan.items.filter { $0.systemItem != nil }
        #expect(Set(allowed.map(\.path)) == expected)
        #expect(allowed.allSatisfy { $0.blocked == nil && !$0.selected && $0.requiresFinder && $0.uninstallOnly })
        #expect(plan.items.first { $0.path == lookalike.path }?.blocked == "appProtected")
        let ids = Set(allowed.map(\.id))
        await apps.apply(planID: plan.id, itemIDs: ids, reset: true, quit: false)
        #expect(apps.journals.isEmpty)
        await apps.apply(planID: plan.id, itemIDs: ids, reset: false, quit: false)
        let journal = try #require(apps.journals.first, "Application error: \(apps.error ?? "none")")
        #expect(apps.error == nil && journal.items.count == 3 && journal.items.allSatisfy { $0.status == "trashed" })
        #expect(f.fm.fileExists(atPath: lookalike.path) && f.fm.fileExists(atPath: f.bundle.path))
        let reopened = f.service { _ in throw StorageFailure.invalidData }
        await reopened.undo(journal.id)
        #expect(reopened.error == "appPutBackItem")
        #expect(f.fm.fileExists(atPath: f.prefs.path) && f.fm.fileExists(atPath: f.logs.path))
        let daemon = try #require(reopened.journals.first?.items.first { $0.path == f.daemon.path })
        #expect(daemon.status == "trashed" && daemon.issue == "appPutBackItem")
        try f.fm.moveItem(atPath: try #require(daemon.trashPath), toPath: f.daemon.path)
        await reopened.undo(journal.id)
        #expect(reopened.error == nil && reopened.journals.first?.items.allSatisfy { $0.status == "restored" } == true)
    }

    @Test func shortcutSharesOneInventoryRowAndDoesNotClaimTheEmbeddedLoginAgent() async throws {
        let f = try Fixture()
        defer { try? f.fm.removeItem(at: f.root) }
        let suite = f.installs.appendingPathComponent("Editor Suite")
        let main = suite.appendingPathComponent("Editor.app"), shortcut = f.bundle
        let agentID = f.appID + ".useragent"
        let login = main.appendingPathComponent("Contents/Library/LoginItems/Editor.app")
        let executable = login.appendingPathComponent("Contents/MacOS/useragent")
        let agent = f.library.appendingPathComponent("LaunchAgents/" + agentID + ".plist")
        let uninstaller = suite.appendingPathComponent("Uninstall Editor.app")
        try f.fm.createDirectory(at: suite, withIntermediateDirectories: true)
        try f.fm.moveItem(at: f.bundle, to: main)
        try f.writePlist(["CFBundleIdentifier": f.appID + ".uninstaller"], to: uninstaller.appendingPathComponent("Contents/Info.plist"))
        try f.writePlist(["CFBundleIdentifier": agentID], to: login.appendingPathComponent("Contents/Info.plist"))
        try f.fm.createDirectory(at: executable.deletingLastPathComponent(), withIntermediateDirectories: true)
        try f.fm.copyItem(atPath: "/usr/bin/true", toPath: executable.path)
        try f.writePlist(["Label": agentID, "ProgramArguments": [executable.path], "AssociatedBundleIdentifiers": [f.appID]], to: agent)
        try f.fm.createSymbolicLink(atPath: shortcut.path, withDestinationPath: "Editor Suite/Editor.app")
        let chain = f.installs.appendingPathComponent("Another shortcut.app")
        try f.fm.createSymbolicLink(at: chain, withDestinationURL: shortcut)

        let apps = f.service { _ in Issue.record("A stale selection reached Finder"); return [] }
        await apps.refresh()
        #expect(Set(apps.applications.map(\.path)) == [main.path, uninstaller.path])
        #expect(apps.application(forDroppedPath: shortcut.path)?.path == main.path)
        await apps.inspect(main.path)
        let preview = try #require(apps.plan)
        let row = try #require(preview.items.first { $0.path == agent.path })
        #expect(row.blocked == nil && row.systemItem != nil && row.uninstallOnly && !row.selected)
        let link = try #require(preview.items.first { $0.path == shortcut.path })
        #expect(link.uninstallOnly && !link.selected && link.blocked == nil && link.snapshot == (try? ApplicationFiles.linkSnapshot(shortcut.path)))
        #expect(preview.items.first { $0.path == chain.path }?.blocked == "appProtected")
        await apps.apply(planID: preview.id, itemIDs: [link.id, row.id], reset: true, quit: false)
        #expect(apps.journals.isEmpty && apps.error == nil)

        let copy = f.installs.appendingPathComponent("Second installation.app")
        try f.fm.copyItem(at: main, to: copy)
        await apps.apply(planID: preview.id, itemIDs: [row.id], reset: false, quit: false)
        #expect(apps.error != nil && apps.journals.isEmpty)
        await apps.refresh()
        #expect(apps.applications.filter { $0.bundleID == f.appID }.count == 2)
        await apps.inspect(main.path)
        #expect(apps.plan?.items.first { $0.path == agent.path }?.blocked == "appShared")

        let stale = try #require(apps.plan)
        let oldLink = try #require(stale.items.first { $0.path == shortcut.path })
        try f.fm.removeItem(at: shortcut)
        try f.fm.createSymbolicLink(at: shortcut, withDestinationURL: copy)
        #expect(apps.application(forDroppedPath: shortcut.path) == nil)
        await apps.apply(planID: stale.id, itemIDs: [oldLink.id], reset: false, quit: false)
        #expect(apps.error != nil && apps.journals.isEmpty)
        #expect(try f.fm.destinationOfSymbolicLink(atPath: shortcut.path) == copy.path)
    }

    @Test(arguments: ["owner", "shared", "malformed", "directory"])
    func launchServiceRequiresAnOwnedExecutableAndChecksItsAssociations(caseName: String) async throws {
        let f = try Fixture()
        defer { try? f.fm.removeItem(at: f.root) }
        var plist: [String: Any] = ["Label": f.appID + ".helper",
                                    "Program": f.bundle.appendingPathComponent("Contents/MacOS/helper").path,
                                    "AssociatedBundleIdentifiers": f.appID]
        let expected: String?
        switch caseName {
        case "owner": expected = nil
        case "shared": plist["AssociatedBundleIdentifiers"] = [f.appID, "other.installed.App"]; expected = "appShared"
        case "malformed": plist["AssociatedBundleIdentifiers"] = true; expected = "appProtected"
        default: plist["Program"] = f.bundle.path; expected = "appProtected"
        }
        try f.writePlist(plist, to: f.daemon)
        let apps = f.service { _ in Issue.record("Preview must not move files"); return [] }
        let plan = try await f.plan(apps)
        let row = try #require(plan.items.first { $0.path == f.daemon.path })
        #expect(row.blocked == expected && !row.selected)
    }

    @Test func newInstallAfterPreviewProtectsExactUserDataDuringReset() async throws {
        let f = try Fixture()
        defer { try? f.fm.removeItem(at: f.root) }
        let shortcut = f.installs.appendingPathComponent("Shortcut.app")
        try f.fm.createSymbolicLink(at: shortcut, withDestinationURL: f.bundle)
        let cache = f.root.appendingPathComponent("UserLibrary/Caches/" + f.appID)
        try f.fm.createDirectory(at: cache, withIntermediateDirectories: true)
        let apps = f.service { _ in Issue.record("Reset must not call Finder"); return [] }
        let plan = try await f.plan(apps)
        let row = try #require(plan.items.first { $0.path == cache.path && $0.selected })
        try f.writePlist(["CFBundleIdentifier": f.appID], to: f.installs.appendingPathComponent("Copy.app/Contents/Info.plist"))
        await apps.apply(planID: plan.id, itemIDs: [row.id], reset: true, quit: false)
        #expect(apps.error != nil && apps.journals.isEmpty && f.fm.fileExists(atPath: cache.path))
    }

    @Test(arguments: [false, true]) func cancellingFinderSelectionRecordsOnlyCompletedMoves(partial: Bool) async throws {
        let f = try Fixture()
        defer { try? f.fm.removeItem(at: f.root) }
        let prefs = f.prefs.path, renamed = f.trash.appendingPathComponent("collision 2.plist").path
        let apps = f.service { _ in
            if partial { try FileManager.default.moveItem(atPath: prefs, toPath: renamed) }
            throw ApplicationActionFailure.cancelled
        }
        let plan = try await f.plan(apps)
        let paths = [f.prefs.path, f.logs.path, f.bundle.path]
        await apps.apply(planID: plan.id, itemIDs: Set(plan.items.filter { paths.contains($0.path) }.map(\.id)), reset: false, quit: false)
        #expect(f.fm.fileExists(atPath: f.bundle.path) && f.fm.fileExists(atPath: f.logs.path))
        if partial {
            let journal = try #require(apps.journals.first, "Application error: \(apps.error ?? "none")")
            #expect(journal.items.first { $0.path == prefs }?.trashPath == renamed && journal.canUndo)
            #expect(journal.items.first { $0.path == f.bundle.path }?.status == "pending")
            #expect(apps.error == "appsUninstallCancelled")
            await apps.undo(journal.id)
            #expect(f.fm.fileExists(atPath: prefs))
        } else {
            #expect(apps.journals.isEmpty && apps.error == nil && f.fm.fileExists(atPath: prefs))
        }
    }

    @Test func refreshRecoversFinderMoveInterruptedBeforeResultWasSaved() async throws {
        let f = try Fixture()
        defer { try? f.fm.removeItem(at: f.root) }
        let apps = f.service { _ in throw StorageFailure.invalidData }
        let plan = try await f.plan(apps)
        let row = try #require(plan.items.first { $0.path == f.prefs.path })
        let descriptor: ApplicationSystemLibraryItem = try #require(row.systemItem)
        let item = ApplicationJournal.Item(path: row.path, snapshot: try #require(row.snapshot),
                                           authenticated: true, systemItem: descriptor)
        let journal = ApplicationJournal(appName: plan.app.name, action: "uninstall", items: [item])
        let directory = f.root.appendingPathComponent("Journal")
        try f.fm.createDirectory(at: directory, withIntermediateDirectories: true)
        try JSONEncoder().encode([journal]).write(to: directory.appendingPathComponent("journal.json"))
        let renamed = f.trash.appendingPathComponent("collision 2.plist")
        try f.fm.moveItem(at: f.prefs, to: renamed)
        let reopened = f.service { _ in throw StorageFailure.invalidData }
        await reopened.refresh()
        #expect(reopened.journals.first?.items.first?.trashPath == renamed.path)
        await reopened.undo(journal.id)
        #expect(reopened.error == nil && reopened.journals.first?.items.first?.status == "restored")
    }

    @Test(arguments: ["shared", "sharedExtension", "symlink", "changed", "wrongProgram"])
    func rechecksLibraryOwnershipAndIdentityBeforeFinder(change: String) async throws {
        let f = try Fixture()
        defer { try? f.fm.removeItem(at: f.root) }
        let apps = f.service { _ in Issue.record("Finder received an invalid plan"); return [] }
        let plan = try await f.plan(apps)
        let item = try #require(plan.items.first { $0.path == f.daemon.path && $0.systemItem != nil })
        switch change {
        case "shared":
            try f.writePlist(["CFBundleIdentifier": "org.other.Product", "SMPrivilegedExecutables": [f.appID + ".helper": "requirement"]],
                             to: f.installs.appendingPathComponent("Other.app/Contents/Info.plist"))
        case "sharedExtension":
            let other = f.installs.appendingPathComponent("Other.app")
            try f.writePlist(["CFBundleIdentifier": "org.other.Product"], to: other.appendingPathComponent("Contents/Info.plist"))
            try f.writePlist(["CFBundleIdentifier": f.appID + ".helper"], to: other.appendingPathComponent("Contents/PlugIns/Shared.appex/Contents/Info.plist"))
        case "symlink":
            try f.fm.removeItem(at: f.daemon)
            try f.fm.createSymbolicLink(at: f.daemon, withDestinationURL: f.prefs)
        case "changed":
            try f.writePlist(["Label": f.appID + ".helper", "Program": f.bundle.appendingPathComponent("Contents/MacOS/helper").path], to: f.daemon)
        default:
            try f.writePlist(["Label": f.appID + ".helper", "Program": "/usr/bin/true"], to: f.daemon)
        }
        await apps.apply(planID: plan.id, itemIDs: [item.id], reset: false, quit: false)
        #expect(apps.error != nil && apps.journals.isEmpty && f.fm.fileExists(atPath: f.daemon.path))
    }
}

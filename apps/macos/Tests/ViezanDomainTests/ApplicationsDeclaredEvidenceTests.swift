import Foundation
import Testing
@testable import ViezanDomain

struct ApplicationsDeclaredEvidenceTests {
    private let fm = FileManager.default
    private let parentID = "dev.example.Editor"
    private var temporaryFolder: URL {
        fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    }

    private func bundle(_ url: URL, id: String, info: [String: Any] = [:]) throws {
        let contents = url.appendingPathComponent("Contents")
        try fm.createDirectory(at: contents, withIntermediateDirectories: true)
        var plist = info
        plist["CFBundleIdentifier"] = id
        try PropertyListSerialization.data(fromPropertyList: plist, format: .binary, options: 0)
            .write(to: contents.appendingPathComponent("Info.plist"))
    }

    @Test func collectsChildIdentifiersAndOnlyMainHelperKeys() throws {
        let app = temporaryFolder.appendingPathExtension("app")
        defer { try? fm.removeItem(at: app) }
        try bundle(app, id: parentID, info: ["SMPrivilegedExecutables": ["net.helper": "signing requirement"]])
        try bundle(app.appendingPathComponent("Contents/PlugIns/Share.appex"), id: "net.Share",
                   info: ["SMPrivilegedExecutables": ["net.child.helper": "ignored"]])
        try bundle(app.appendingPathComponent("Contents/XPCServices/Render.xpc"), id: "net.Render")
        try bundle(app.appendingPathComponent("Contents/Helpers/Login.app"), id: "net.Login")
        try bundle(app.appendingPathComponent("Updater.xpc"), id: "ORG.Sparkle-Project.Updater")
        try bundle(app.appendingPathComponent("System.appex"), id: "Com.Apple.System")
        try bundle(app.appendingPathComponent("Duplicate.app"), id: parentID.uppercased())
        try bundle(app.appendingPathComponent("Ignored.framework"), id: "net.Framework")

        let ids = ApplicationFiles.declaredIdentifiers(appPath: app.path, bundleID: parentID)
        #expect(ids.bundles == ["net.Share", "net.Render", "net.Login"])
        #expect(ids.helpers == ["net.helper"])
        #expect(ids.groups.isEmpty)
    }

    @Test func readsSignedGroupsFromParentAndExtension() throws {
        let folder = temporaryFolder
        defer { try? fm.removeItem(at: folder) }
        let app = folder.appendingPathComponent("Editor.app")
        func sign(_ url: URL, id: String, type: String, groups: [String]) throws {
            try bundle(url, id: id, info: ["CFBundleExecutable": "fixture", "CFBundlePackageType": type])
            let binaries = url.appendingPathComponent("Contents/MacOS")
            try fm.createDirectory(at: binaries, withIntermediateDirectories: true)
            try fm.copyItem(atPath: "/usr/bin/true", toPath: binaries.appendingPathComponent("fixture").path)
            let entitlements = folder.appendingPathComponent(id + ".plist")
            try PropertyListSerialization.data(fromPropertyList: ["com.apple.security.application-groups": groups], format: .xml, options: 0)
                .write(to: entitlements)
            let command = try Process.run(URL(fileURLWithPath: "/usr/bin/codesign"),
                                          arguments: ["--force", "--sign", "-", "--timestamp=none", "--entitlements", entitlements.path, url.path])
            command.waitUntilExit()
            try #require(command.terminationStatus == 0)
        }
        try sign(app.appendingPathComponent("Contents/PlugIns/Share.appex"), id: "net.Share", type: "XPC!",
                 groups: ["group.extension", "group.common"])
        try sign(app, id: parentID, type: "APPL", groups: ["group.editor", "group.common"])
        let ids = ApplicationFiles.declaredIdentifiers(appPath: app.path, bundleID: parentID)
        #expect(ids.groups == ["group.editor", "group.extension", "group.common"])
    }

    @Test func skipsSymlinksAndStopsAtSixLevels() throws {
        let folder = temporaryFolder
        defer { try? fm.removeItem(at: folder) }
        let app = folder.appendingPathComponent("Editor.app")
        let outside = folder.appendingPathComponent("Outside/Other.app")
        try bundle(app, id: parentID)
        try bundle(outside, id: "net.Outside")
        try bundle(app.appendingPathComponent("a/b/c/d/e/Edge.appex"), id: "net.Edge")
        try bundle(app.appendingPathComponent("a/b/c/d/e/f/Deep.xpc"), id: "net.Deep")
        try fm.createSymbolicLink(at: app.appendingPathComponent("Linked.app"), withDestinationURL: outside)
        try fm.createSymbolicLink(at: app.appendingPathComponent("LinkedFolder"), withDestinationURL: outside.deletingLastPathComponent())
        let nested = app.appendingPathComponent("LinkedContents.appex")
        try fm.createDirectory(at: nested, withIntermediateDirectories: false)
        try fm.createSymbolicLink(at: nested.appendingPathComponent("Contents"), withDestinationURL: outside.appendingPathComponent("Contents"))
        let contents = app.appendingPathComponent("LinkedPlist.xpc/Contents")
        try fm.createDirectory(at: contents, withIntermediateDirectories: true)
        try fm.createSymbolicLink(at: contents.appendingPathComponent("Info.plist"), withDestinationURL: outside.appendingPathComponent("Contents/Info.plist"))
        let ids = ApplicationFiles.declaredIdentifiers(appPath: app.path, bundleID: parentID)
        #expect(ids.bundles == ["net.Edge"])
        let alias = folder.appendingPathComponent("Alias.app")
        try fm.createSymbolicLink(at: alias, withDestinationURL: app)
        #expect(ApplicationFiles.declaredIdentifiers(appPath: alias.path, bundleID: parentID).bundles.isEmpty)
    }

    @Test func countsFilesAndDirectoriesTowardTheEntryLimit() throws {
        let app = temporaryFolder.appendingPathExtension("app")
        defer { try? fm.removeItem(at: app) }
        try bundle(app, id: parentID)
        // Each extension contributes three entries, including Contents and Info.plist.
        for index in 0..<670 {
            try bundle(app.appendingPathComponent("Child-\(index).appex"), id: "net.child.\(index)")
        }
        let ids = ApplicationFiles.declaredIdentifiers(appPath: app.path, bundleID: parentID)
        #expect((666...667).contains(ids.bundles.count))
    }

    @Test func matchesEvidenceInPriorityOrderAndOnlyInEligibleRoots() {
        let ids = ApplicationFiles.DeclaredIdentifiers(bundles: [parentID, "dev.example.Share", "net.Child"],
                                                       groups: ["group.Editor"], helpers: ["net.Helper"])
        func evidence(_ stem: String, in root: String = "Caches") -> String? {
            ApplicationFiles.evidence(root: root, stem: stem, bundleID: parentID, name: "Editor", declared: ids)
        }
        #expect(evidence(parentID) == "exact")
        #expect(evidence("dev.example.Share") == "declared")
        #expect(evidence("dev.example.Other") == "vendor")
        #expect(evidence("dev.example") == "vendor")
        #expect(evidence("EDITOR") == "vendor")
        #expect(evidence("net.Child", in: "Preferences") == "declared")
        #expect(evidence("net.child") == nil)
        #expect(evidence("group.Editor", in: "Group Containers") == "declared")
        #expect(evidence("group.editor", in: "Group Containers") == nil)
        #expect(evidence("group.Editor", in: "Containers") == nil)
        #expect(evidence("net.Helper", in: "PrivilegedHelperTools") == "declared")
        #expect(evidence("net.Helper", in: "LaunchDaemons") == "declared")
        #expect(evidence("net.helper", in: "LaunchDaemons") == nil)
        #expect(evidence("net.Helper", in: "LaunchAgents") == nil)
    }

    @Test func planLocksDeclaredItemsAndKeepsThemUnchecked() throws {
        let temp = try ApplicationFiles.canonical(fm.temporaryDirectory.path)
        let folder = URL(fileURLWithPath: temp).appendingPathComponent(UUID().uuidString)
        defer { try? fm.removeItem(at: folder) }
        let app = folder.appendingPathComponent("Editor.app")
        let user = folder.appendingPathComponent("User/Library"), system = folder.appendingPathComponent("Library")
        try bundle(app, id: parentID, info: ["SMPrivilegedExecutables": ["net.Helper": "requirement"]])
        try bundle(app.appendingPathComponent("Share.appex"), id: "net.Share")
        let cache = user.appendingPathComponent("Caches/net.Share")
        let saved = user.appendingPathComponent("Saved Application State/net.Share.savedState")
        let daemon = system.appendingPathComponent("LaunchDaemons/net.Helper.plist")
        try fm.createDirectory(at: cache, withIntermediateDirectories: true)
        try fm.createDirectory(at: saved.deletingLastPathComponent(), withIntermediateDirectories: true)
        try fm.createSymbolicLink(at: saved, withDestinationURL: cache)
        try fm.createDirectory(at: daemon.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data().write(to: daemon)
        let editor = InstalledApplication(path: app.path, name: "Editor", bundleID: parentID, version: "1")
        let other = InstalledApplication(path: folder.appendingPathComponent("Other.app").path, name: "Other", bundleID: "net.Helper", version: "1")
        for all in [[editor], [editor, other]] {
            let plan = ApplicationFiles.plan(editor, all: all, userLibrary: user.path, systemLibrary: system.path,
                                             receipts: folder.appendingPathComponent("receipts").path)
            let rows = plan.items.filter { $0.evidence == "declared" }
            #expect(Set(rows.map(\.path)) == [cache.path, saved.path, daemon.path])
            #expect(rows.allSatisfy { !$0.selected })
            #expect(rows.first { $0.path == cache.path }?.blocked == "appProtected")
            #expect(rows.first { $0.path == cache.path }?.bytes != nil)
            #expect(rows.first { $0.path == saved.path }?.blocked == "appProtected")
            #expect(rows.first { $0.path == daemon.path }?.blocked == (all.count == 1 ? "appProtected" : "appShared"))
            #expect(plan.incomplete) // The saved-state link cannot be snapshotted.
        }
    }

    @Test(arguments: [
        ("Library/Application Scripts", "", "appProtected"),
        ("Library/SyncedPreferences", ".plist", "appProtected"),
        ("Library/Cookies", ".binarycookies", nil),
        ("Library/Application Support/com.apple.sharedfilelist/com.apple.LSSharedFileList.ApplicationRecentDocuments", ".sfl2", nil),
        ("Library/Application Support/com.apple.sharedfilelist/com.apple.LSSharedFileList.ApplicationRecentDocuments", ".sfl3", nil),
        ("Library/Application Support/com.apple.sharedfilelist/com.apple.LSSharedFileList.ApplicationRecentDocuments", ".sfl4", nil),
        ("receipts", ".bom", "appNeedsAdmin"),
        ("receipts", ".plist", "appNeedsAdmin")
    ] as [(String, String, String?)])
    func plansOnlyExactFilenames(_ root: String, _ suffix: String, _ block: String?) throws {
        let folder = URL(fileURLWithPath: try ApplicationFiles.canonical(fm.temporaryDirectory.path)).appendingPathComponent(UUID().uuidString)
        defer { try? fm.removeItem(at: folder) }
        let app = folder.appendingPathComponent("Editor.app")
        try bundle(app, id: parentID, info: ["SMPrivilegedExecutables": ["net.Helper": "requirement"]])
        try bundle(app.appendingPathComponent("Share.appex"), id: "net.Share")
        try bundle(app.appendingPathComponent("Mixed.xpc"), id: "net.Mixed")
        let editor = InstalledApplication(path: app.path, name: "Editor", bundleID: parentID, version: "1")
        let directory = folder.appendingPathComponent(root)
        try fm.createDirectory(at: directory, withIntermediateDirectories: true)
        let recent = suffix.hasPrefix(".sfl")
        let main = (recent ? parentID.lowercased() : parentID) + suffix
        let child = (recent ? "net.share" : "net.Share") + suffix
        let wrongCase = (recent ? "net.Mixed" : "net.mixed") + suffix
        for name in [main, child, wrongCase, "dev.example.Other" + suffix, "Editor" + suffix, "net.Helper" + suffix,
                     "unrelated" + suffix, main + ".bak", parentID + ".Extra" + suffix] {
            let url = directory.appendingPathComponent(name)
            if suffix.isEmpty { try fm.createDirectory(at: url, withIntermediateDirectories: false) }
            else { try Data().write(to: url) }
        }
        func plan(_ others: [InstalledApplication]) -> ApplicationPlan {
            ApplicationFiles.plan(editor, all: [editor] + others, userLibrary: folder.path + "/Library",
                                  systemLibrary: folder.path + "/SystemLibrary", receipts: folder.path + "/receipts")
        }
        let own = plan([])
        #expect(!own.incomplete)
        let rows = own.items.filter { $0.kind != "bundle" }
        #expect(Set(rows.map(\.path)) == [directory.path + "/" + main, directory.path + "/" + child])
        let exact = try #require(rows.first { $0.evidence == "exact" })
        let declared = try #require(rows.first { $0.evidence == "declared" })
        #expect(exact.path == directory.path + "/" + main)
        #expect(declared.path == directory.path + "/" + child)
        #expect(exact.blocked == block)
        #expect(exact.note == (block == nil ? "personalData" : nil))
        #expect(declared.blocked == (block ?? "appProtected"))
        #expect(rows.allSatisfy { !$0.selected && $0.kind == (root == "Library/SyncedPreferences" ? "preferences" : "data") })
        if block == nil { try ApplicationFiles.policy(exact.path, home: folder.path) }

        let others = [parentID + ".Plugin", "net.Share.Plugin"].map {
            InstalledApplication(path: folder.path + "/" + $0 + ".app", name: $0, bundleID: $0, version: "1")
        }
        let shared = plan(others).items.filter { $0.kind != "bundle" }
        #expect(shared.count == 2)
        #expect(shared.allSatisfy { $0.blocked == "appShared" && !$0.selected })
    }

    @Test func cookiePolicyAllowsOnlyDirectRegularCookieFilesAndTheirRestoreSlots() throws {
        let home = URL(fileURLWithPath: try ApplicationFiles.canonical(fm.temporaryDirectory.path)).appendingPathComponent(UUID().uuidString)
        defer { try? fm.removeItem(at: home) }
        let cookies = home.appendingPathComponent("Library/Cookies")
        let nested = cookies.appendingPathComponent("nested")
        try fm.createDirectory(at: nested, withIntermediateDirectories: true)
        let cookie = cookies.appendingPathComponent(parentID + ".binarycookies")
        try Data().write(to: cookie)
        try ApplicationFiles.policy(cookie.path, home: home.path)
        #expect(try !ApplicationFiles.inUse(cookie.path))
        let openCookie = try FileHandle(forReadingFrom: cookie)
        #expect(try ApplicationFiles.inUse(cookie.path))
        try openCookie.close()
        let other = cookies.appendingPathComponent("Cookies.sqlite")
        let nestedCookie = nested.appendingPathComponent(cookie.lastPathComponent)
        let directory = cookies.appendingPathComponent("folder.binarycookies")
        try Data().write(to: other)
        try Data().write(to: nestedCookie)
        try fm.createDirectory(at: directory, withIntermediateDirectories: false)
        for url in [cookies, other, nestedCookie, directory] {
            #expect(throws: StorageFailure.self) { try ApplicationFiles.policy(url.path, home: home.path) }
        }
        try fm.removeItem(at: cookie)
        try ApplicationFiles.policy(cookie.path, missing: true, home: home.path)
    }

    @Test(.enabled(if: getuid() != 0)) func distinguishesMissingAndUnreadableScanRoots() throws {
        let folder = URL(fileURLWithPath: try ApplicationFiles.canonical(fm.temporaryDirectory.path)).appendingPathComponent(UUID().uuidString)
        defer { try? fm.removeItem(at: folder) }
        let app = folder.appendingPathComponent("Editor.app")
        try bundle(app, id: parentID)
        let editor = InstalledApplication(path: app.path, name: "Editor", bundleID: parentID, version: "1")
        let receipts = folder.appendingPathComponent("receipts")
        func plan() -> ApplicationPlan {
            ApplicationFiles.plan(editor, all: [editor], userLibrary: folder.path + "/UserLibrary",
                                  systemLibrary: folder.path + "/SystemLibrary", receipts: receipts.path)
        }
        #expect(!plan().incomplete)
        try fm.createDirectory(at: receipts, withIntermediateDirectories: false, attributes: [.posixPermissions: 0])
        defer { try? fm.setAttributes([.posixPermissions: 0o700], ofItemAtPath: receipts.path) }
        #expect(plan().incomplete)
    }
}

@Test func planNamesLibraryFoldersItMayNotList() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let user = root.appendingPathComponent("Library"), locked = user.appendingPathComponent("Caches")
    try FileManager.default.createDirectory(at: locked, withIntermediateDirectories: true)
    try FileManager.default.setAttributes([.posixPermissions: 0o000], ofItemAtPath: locked.path)
    defer { try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: locked.path); try? FileManager.default.removeItem(at: root) }
    let app = InstalledApplication(path: root.appendingPathComponent("Sample.app").path, name: "Sample", bundleID: "com.example.sample", version: "1", blocked: nil)
    let plan = ApplicationFiles.plan(app, all: [app], userLibrary: user.path, systemLibrary: root.appendingPathComponent("System").path, receipts: root.appendingPathComponent("receipts").path)
    #expect(plan.incomplete)
    #expect(plan.unreadable == [locked.path])
}

import Foundation
import AppKit
import CryptoKit
import Darwin
import Observation
import Security

public struct InstalledApplication: Codable, Identifiable, Sendable {
    public var id: String { path }
    public let path: String
    public let name: String
    public let bundleID: String
    public let version: String
    public var blocked: String?
    public var needsAuthentication: Bool?
}
public struct ApplicationScanIssue: Identifiable, Sendable, Equatable {
    public enum Reason: String, Error { case invalidBundle, brokenLink, unreadable, scanLimit, notAnApp }
    // A rescan that changes the reason also invalidates an open confirmation.
    public var id: String { reason.rawValue + ":" + path }
    public var blocking: Bool { reason != .notAnApp && !targetGone }
    public var canTrash: Bool { allowsTrash(installRoots: ApplicationInstallRoot.defaults()) }
    fileprivate func allowsTrash(installRoots: [ApplicationInstallRoot]) -> Bool {
        (reason == .invalidBundle || reason == .notAnApp || reason == .brokenLink) && path.hasSuffix(".app")
            && installRoots.contains(where: { reason == .brokenLink ? $0.allowsTrashLink(path) : $0.allowsTrash(path) })
            && !ApplicationFiles.within(path, "/Applications/Setapp") && !ApplicationFiles.within(path, Bundle.main.bundlePath) && !ApplicationFiles.within(Bundle.main.bundlePath, path)
    }
    public let path: String
    public let reason: Reason
    /// A broken link whose target is absent from a folder that could be read: no app is left to own shared data.
    public var targetGone = false
}
public struct ApplicationDataItem: Codable, Identifiable, Sendable {
    public var id = UUID().uuidString
    public let path: String
    public let kind: String
    public let evidence: String
    public let bytes: Int64?
    public var selected: Bool
    public var blocked: String?
    var snapshot: ApplicationSnapshot?
    /// Why an allowed item starts unticked: "personalData" (documents, settings, site data are kept
    /// unless the person ticks them). Nil for pre-ticked and blocked items.
    public var note: String? = nil
}
public struct ApplicationPlan: Identifiable, Sendable {
    public var id = UUID().uuidString
    public let app: InstalledApplication
    public let items: [ApplicationDataItem]
    public let incomplete: Bool
    /// Library folders that exist but could not be listed for lack of permission (EPERM/EACCES).
    public var unreadable: [String] = []

    public func personalDataCount(selected: Set<String>) -> Int {
        items.count { $0.note == "personalData" && $0.blocked == nil && selected.contains($0.id) }
    }
}
struct ApplicationSnapshot: Codable, Equatable, Sendable { let device: Int32; let inode: UInt64; let digest: String; let bytes: Int64 }
public struct ApplicationJournal: Codable, Identifiable, Sendable {
    public struct Item: Codable, Identifiable, Sendable {
        public var id = UUID().uuidString
        public var path: String
        public var status = "pending"
        public var trashPath: String?
        var snapshot: ApplicationSnapshot
        var isLink: Bool?
        public var authenticated: Bool?
        var trashSnapshot: ApplicationSnapshot?
        public var preferenceDomain: String?
        public var preferenceBackup: String?
        public var issue: String?
        /// Size when it was moved (Apps journal row).
        public var bytes: Int64 { snapshot.bytes }

        func currentSnapshot(at path: String) throws -> ApplicationSnapshot {
            try isLink == true ? ApplicationFiles.linkSnapshot(path) : ApplicationFiles.snapshot(path)
        }

        func verifyForTrash(installRoots: [ApplicationInstallRoot]) throws {
            let isFileAction = isLink == true || (try? ApplicationPreferences.domain(for: path)) == nil
            if isFileAction { try ApplicationFiles.policy(path, isLink: isLink == true, installRoots: installRoots) }
            guard try currentSnapshot(at: path) == snapshot else { throw StorageFailure.invalidData }
            if isFileAction, isLink != true, try ApplicationFiles.inUse(path) { throw ApplicationActionFailure.inUse }
        }
    }
    public var canUndo: Bool {
        items.contains { ["trashed", "preferencesRemoved", "preferencesBackedUp"].contains($0.status) || ($0.status == "failed" && $0.preferenceBackup != nil) }
    }
    /// What the action moved, in bytes (items that reached the Trash or had preferences removed).
    public var movedBytes: Int64 { items.filter { ["trashed", "preferencesRemoved"].contains($0.status) }.reduce(0) { $0 + $1.bytes } }
    public var id = UUID().uuidString
    public var appName: String
    public var action: String
    public var created = Date().timeIntervalSince1970
    public var items: [Item]
}
struct ApplicationInstallRoot {
    let path: String
    var isLauncher = false

    static func defaults(home: String = FileManager.default.homeDirectoryForCurrentUser.path) -> [Self] {
        [.init(path: "/Applications"), .init(path: home + "/Applications"), .init(path: "/Users/Shared/Riot Games", isLauncher: true)]
    }
    func contains(_ entry: String) -> Bool {
        if isLauncher { return entry.hasSuffix(".app") && (entry as NSString).deletingLastPathComponent == path }
        return entry.hasPrefix(path + "/")
    }
    func ownershipBlock(owner: uid_t, currentUser: uid_t = getuid()) -> String? {
        isLauncher && owner != currentUser ? "appNeedsAdmin" : nil
    }
    /// A launcher root lives in world-writable /Users/Shared. It is used only while another local
    /// account can neither replace it nor change what is inside: a real folder owned by this user
    /// (or root) that group and others cannot write to.
    var trusted: Bool {
        guard isLauncher else { return true }
        var st = stat()
        return lstat(path, &st) == 0 && st.st_mode & S_IFMT == S_IFDIR && (st.st_uid == getuid() || st.st_uid == 0) && st.st_mode & (S_IWGRP | S_IWOTH) == 0
    }
    func allowsTrash(_ entry: String, missing: Bool = false) -> Bool {
        guard contains(entry), trusted else { return false }
        guard isLauncher && !missing else { return true }
        var st = stat()
        return lstat(entry, &st) == 0 && st.st_mode & S_IFMT == S_IFDIR && ownershipBlock(owner: st.st_uid) == nil
    }
    func allowsTrashLink(_ entry: String, missing: Bool = false) -> Bool {
        let name = (entry as NSString).lastPathComponent
        guard name.hasSuffix(".app"), !entry.utf8.contains(0), entry == path + "/" + name,
              (try? ApplicationFiles.canonical(path)) == path, trusted else { return false }
        var st = stat()
        if missing { return lstat(entry, &st) != 0 && errno == ENOENT }
        return lstat(entry, &st) == 0 && st.st_mode & S_IFMT == S_IFLNK && ownershipBlock(owner: st.st_uid) == nil
    }
}
enum ApplicationFiles {
    static func canonical(_ path: String) throws -> String {
        guard let value = Darwin.realpath(path, nil) else { throw StorageFailure.invalidData }; defer { free(value) }; return String(cString: value)
    }
    static func within(_ path: String, _ root: String) -> Bool { path == root || path.hasPrefix(root + "/") }
    static func snapshot(_ path: String) throws -> ApplicationSnapshot {
        guard try canonical(path) == path else { throw StorageFailure.invalidData }
        var first = stat(); guard lstat(path, &first) == 0, first.st_mode & S_IFMT != S_IFLNK else { throw StorageFailure.invalidData }
        var hash = SHA256(), count = 0, bytes: Int64 = 0; var seen = Set<String>()
        let deadline = ProcessInfo.processInfo.systemUptime + 30
        func visit(_ entry: String) throws {
            count += 1; guard count <= 150000, ProcessInfo.processInfo.systemUptime < deadline, !Task.isCancelled else { throw StorageFailure.invalidData }
            var info = stat(); guard lstat(entry, &info) == 0, info.st_dev == first.st_dev else { throw StorageFailure.invalidData }
            let metadata = [String(entry.dropFirst(path.count)), String(info.st_dev), String(info.st_ino), String(info.st_mode), String(info.st_size), String(info.st_mtimespec.tv_sec), String(info.st_mtimespec.tv_nsec)]
            hash.update(data: try JSONEncoder().encode(metadata))
            if seen.insert("\(info.st_dev):\(info.st_ino)").inserted { bytes += Int64(info.st_blocks) * 512 }
            if info.st_mode & S_IFMT == S_IFDIR { for name in try FileManager.default.contentsOfDirectory(atPath: entry).sorted() { try visit(entry + "/" + name) } }
        }
        try visit(path)
        return ApplicationSnapshot(device: first.st_dev, inode: first.st_ino, digest: hash.finalize().map { String(format: "%02x", $0) }.joined(), bytes: bytes)
    }
    static func linkSnapshot(_ path: String) throws -> ApplicationSnapshot {
        let parent = (path as NSString).deletingLastPathComponent
        var st = stat()
        guard try canonical(parent) == parent, lstat(path, &st) == 0, st.st_mode & S_IFMT == S_IFLNK else { throw StorageFailure.invalidData }
        var target = [UInt8](repeating: 0, count: Int(MAXPATHLEN))
        let count = readlink(path, &target, target.count)
        guard count > 0, count < target.count else { throw StorageFailure.invalidData }
        // Rename preserves these fields. Reading the link can change atime and moving it can change ctime.
        let metadata = [String(st.st_dev), String(st.st_ino), String(st.st_mode), String(st.st_uid), String(st.st_gid),
                        String(st.st_size), String(st.st_mtimespec.tv_sec), String(st.st_mtimespec.tv_nsec)]
        var hash = SHA256()
        hash.update(data: try JSONEncoder().encode(metadata))
        hash.update(data: Data(target.prefix(count)))
        return ApplicationSnapshot(device: st.st_dev, inode: st.st_ino, digest: hash.finalize().map { String(format: "%02x", $0) }.joined(), bytes: 0)
    }
    private static func isRegularFile(_ path: String) -> Bool {
        var info = stat()
        return lstat(path, &info) == 0 && info.st_mode & S_IFMT == S_IFREG
    }
    static func policy(_ path: String, missing: Bool = false, isLink: Bool = false, installRoots: [ApplicationInstallRoot] = ApplicationInstallRoot.defaults(),
                       home: String = FileManager.default.homeDirectoryForCurrentUser.path) throws {
        let dataRoots = ["Caches", "Logs", "Application Support", "Saved Application State", "HTTPStorages", "WebKit"].map { home + "/Library/" + $0 }
        let name = (path as NSString).lastPathComponent
        let cookie = name.hasSuffix(".binarycookies") && name != ".binarycookies"
            && path == home + "/Library/Cookies/" + name && (missing || isRegularFile(path))
        let allowed = isLink ? installRoots.contains { $0.allowsTrashLink(path, missing: missing) }
            : installRoots.contains { $0.allowsTrash(path, missing: missing) } || dataRoots.contains { path.hasPrefix($0 + "/") } || cookie
        let forbidden = [FilePersistence.previewURL().deletingLastPathComponent().path, home + "/Library/Keychains", home + "/Library/Mobile Documents", home + "/.ssh", home + "/.aws", home + "/.gnupg"]
        guard allowed, !forbidden.contains(where: { within(path, $0) || within($0, path) }), !path.split(separator: "/").contains(where: { $0 == ".." || $0.hasSuffix(".photoslibrary") }) else { throw StorageFailure.invalidData }
        if isLink { return } // The install root checked the link itself (or the empty restore slot) and its parent.
        if missing { var info = stat(); guard lstat(path, &info) != 0, errno == ENOENT, try canonical((path as NSString).deletingLastPathComponent) == (path as NSString).deletingLastPathComponent else { throw StorageFailure.invalidData } }
        else { guard try canonical(path) == path else { throw StorageFailure.invalidData } }
    }
    static func inventory(roots: [String]? = nil) throws -> [InstalledApplication] {
        try scan(roots: roots).applications
    }
    static func trashableIssue(_ id: String, in issues: [ApplicationScanIssue], home: String = FileManager.default.homeDirectoryForCurrentUser.path, installRoots: [ApplicationInstallRoot]? = nil) -> ApplicationScanIssue? {
        let installs = installRoots ?? ApplicationInstallRoot.defaults(home: home)
        guard let issue = issues.first(where: { $0.id == id }), issue.allowsTrash(installRoots: installs), stillMatches(issue) else { return nil }
        return issue
    }
    fileprivate static func stillMatches(_ issue: ApplicationScanIssue) -> Bool {
        let path = issue.path
        var st = stat()
        if issue.reason == .brokenLink {
            let parent = (path as NSString).deletingLastPathComponent
            guard lstat(path, &st) == 0, st.st_mode & S_IFMT == S_IFLNK, (try? canonical(parent)) == parent,
                  case .failure(.brokenLink) = scanMetadata(at: path, linked: true) else { return false }
            return true
        }
        guard lstat(path, &st) == 0, st.st_mode & S_IFMT == S_IFDIR, (try? canonical(path)) == path,
              access(path, R_OK | X_OK) == 0, case .failure(issue.reason) = bundleMetadata(at: path) else { return false }
        return true
    }
    /// True only when the link's final name is missing from a folder that exists and can be listed.
    /// An unmounted volume or an unreadable parent says nothing about the app, so those keep blocking.
    static func linkTargetIsGone(_ link: String) -> Bool {
        var buffer = [UInt8](repeating: 0, count: Int(MAXPATHLEN))
        let count = readlink(link, &buffer, buffer.count)
        guard count > 0, count < buffer.count else { return false }
        var target = String(decoding: buffer.prefix(count), as: UTF8.self)
        if !target.hasPrefix("/") { target = (link as NSString).deletingLastPathComponent + "/" + target }
        let name = (target as NSString).lastPathComponent
        guard name != ".", name != "..", let parent = try? canonical((target as NSString).deletingLastPathComponent) else { return false }
        var st = stat()
        return access(parent, R_OK | X_OK) == 0 && lstat(parent + "/" + name, &st) != 0 && errno == ENOENT
    }
    private static func scanMetadata(at path: String, linked: Bool) -> Result<(Bundle, [String: Any], String), ApplicationScanIssue.Reason> {
        guard let target = try? canonical(path), linked || target == path else { return .failure(linked ? .brokenLink : .invalidBundle) }
        return bundleMetadata(at: target, linked: linked)
    }
    private static func bundleMetadata(at path: String, linked: Bool = false) -> Result<(Bundle, [String: Any], String), ApplicationScanIssue.Reason> {
        // Read from disk: Bundle caches identifiers even when an app has been reinstalled at the same URL.
        let found = CFBundleCopyInfoDictionaryInDirectory(URL(fileURLWithPath: path, isDirectory: true) as CFURL) as? [String: Any]
        guard let info = found, let id = info["CFBundleIdentifier"] as? String, id.contains("."), let bundle = Bundle(path: path) else {
            if linked { return .failure(.brokenLink) }
            return .failure((found ?? [:]).isEmpty && hasNoBundleMetadata(path) ? .notAnApp : .invalidBundle)
        }
        return .success((bundle, info, id))
    }
    private static func hasNoBundleMetadata(_ path: String) -> Bool {
        // Only an empty folder qualifies: anything inside (a nested app included) keeps the scan blocking.
        guard let children = try? FileManager.default.contentsOfDirectory(atPath: path), children.allSatisfy({ $0 == ".DS_Store" }) else { return false }
        let contents = path + "/Contents"
        var st = stat()
        for candidate in [path + "/Info.plist", contents + "/Info.plist", path + "/Wrapper"] {
            guard lstat(candidate, &st) != 0, errno == ENOENT else { return false }
        }
        // A dangling Contents link also returns ENOENT for Contents/Info.plist.
        guard lstat(contents, &st) == 0 else { return errno == ENOENT }
        return access(contents, R_OK | X_OK) == 0
    }
    // Read the shared directory through the descriptor opened without following links.
    private static func launcherBundles(at path: String) throws -> [String] {
        let fd = open(path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW_ANY | O_CLOEXEC)
        guard fd >= 0 else { throw StorageFailure.invalidData }
        guard let directory = fdopendir(fd) else { close(fd); throw StorageFailure.invalidData }
        defer { closedir(directory) }
        guard try canonical(path) == path else { throw StorageFailure.invalidData }
        var names: [String] = []
        while true {
            errno = 0
            guard let entry = readdir(directory) else {
                guard errno == 0 else { throw StorageFailure.invalidData }
                return names
            }
            let length = Int(entry.pointee.d_namlen)
            let name = withUnsafeBytes(of: &entry.pointee.d_name) { bytes in
                String(decoding: bytes.prefix(length), as: UTF8.self)
            }
            if name.hasSuffix(".app") { names.append(name) }
        }
    }
    static func scan(roots: [String]? = nil, home: String = FileManager.default.homeDirectoryForCurrentUser.path, installRoots: [ApplicationInstallRoot]? = nil) throws -> (applications: [InstalledApplication], issues: [ApplicationScanIssue], blockingIssueCount: Int) {
        let fm = FileManager.default
        let installs = installRoots ?? ApplicationInstallRoot.defaults(home: home)
        var applications: [InstalledApplication] = [], issues: [ApplicationScanIssue] = []; var visited = 0
        let issueLimit = 50
        var blockingIssueCount = 0
        func record(_ path: String, _ reason: ApplicationScanIssue.Reason) {
            let issue = ApplicationScanIssue(path: path, reason: reason, targetGone: reason == .brokenLink && linkTargetIsGone(path))
            if issue.blocking {
                blockingIssueCount += 1
                guard blockingIssueCount <= issueLimit else { return }
                // Keep blocking paths first, displacing an informational path when full.
                if issues.count == issueLimit { issues.removeLast() }
                issues.insert(issue, at: blockingIssueCount - 1)
            } else if issues.count < issueLimit { issues.append(issue) }
        }
        func visit(_ path: String, depth: Int) {
            visited += 1; guard visited < 20000, depth < 9 else { record(path, .scanLimit); return }
            let launcher = installs.first { $0.isLauncher && $0.path == path }, isLauncher = launcher != nil
            // A launcher root another account controls is left unmanaged, as before it was scanned at all;
            // it must not be able to lock the apps in /Applications.
            if let launcher, !launcher.trusted { return }
            let children: [String]
            do { children = try isLauncher ? launcherBundles(at: path) : fm.contentsOfDirectory(atPath: path) }
            catch {
                // An optional install root (such as ~/Applications) may not exist.
                var st = stat(); if depth != 0 || lstat(path, &st) == 0 || errno != ENOENT { record(path, .unreadable) }; return
            }
            for child in children.sorted() {
                let entry = path + "/" + child; var st = stat(); guard lstat(entry, &st) == 0 else { record(entry, .unreadable); continue }
                let kind = st.st_mode & S_IFMT, linked = kind == S_IFLNK
                guard child.hasSuffix(".app") else { if kind == S_IFDIR { visit(entry, depth: depth + 1) }; continue }
                guard linked || kind == S_IFDIR else { continue }
                if !linked && access(entry, R_OK | X_OK) != 0 { record(entry, .unreadable); continue }
                let (bundle, info, id): (Bundle, [String: Any], String)
                switch scanMetadata(at: entry, linked: linked) {
                case .success(let metadata): (bundle, info, id) = metadata
                case .failure(let reason): record(entry, reason); continue
                }
                let localized = bundle.bundleIdentifier == id ? bundle.localizedInfoDictionary : nil
                func text(_ key: String) -> String? { localized?[key] as? String ?? info[key] as? String }
                // Linked apps (such as Safari) participate in ownership checks but stay protected.
                let install = installs.first { $0.contains(entry) }
                let protected = linked || install == nil || within(entry, "/Applications/Setapp") || id.lowercased().hasPrefix("com.apple.") || id.lowercased().hasPrefix("com.viezan.") || entry == Bundle.main.bundlePath
                let blocked = protected ? "appProtected" : install?.ownershipBlock(owner: st.st_uid)
                let needsAuthentication: Bool? = blocked == nil && access(entry, W_OK) != 0 ? true : nil
                applications.append(InstalledApplication(path: entry, name: text("CFBundleDisplayName") ?? text("CFBundleName") ?? String(child.dropLast(4)), bundleID: id, version: text("CFBundleShortVersionString") ?? "", blocked: blocked, needsAuthentication: needsAuthentication))
            }
        }
        for root in roots ?? (installs.map(\.path) + ["/System/Applications"]) { visit(root, depth: 0) }
        if blockingIssueCount > 0 { for i in applications.indices where applications[i].blocked == nil { applications[i].blocked = "appIncomplete" } }
        return (applications.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }, issues, blockingIssueCount)
    }
    struct DeclaredIdentifiers {
        var bundles: Set<String> = []
        var groups: Set<String> = []
        var helpers: Set<String> = []
    }

    private static func declaredInfo(at url: URL) -> [String: Any]? {
        // Contents or Info.plist can itself be a link, even in a real bundle directory.
        let fd = open(url.path, O_RDONLY | O_NOFOLLOW_ANY | O_NONBLOCK | O_CLOEXEC)
        guard fd >= 0 else { return nil }
        let file = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        var info = stat()
        guard fstat(fd, &info) == 0, info.st_mode & S_IFMT == S_IFREG,
              let data = try? file.readToEnd() else { return nil }
        return (try? PropertyListSerialization.propertyList(from: data, format: nil)) as? [String: Any]
    }

    private static func applicationGroups(at bundle: URL) -> Set<String> {
        var code: SecStaticCode?
        var info: CFDictionary?
        guard SecStaticCodeCreateWithPath(bundle as CFURL, [], &code) == errSecSuccess, let code,
              SecCodeCopySigningInformation(code, SecCSFlags(rawValue: kSecCSSigningInformation), &info) == errSecSuccess,
              let entitlements = (info as NSDictionary?)?[kSecCodeInfoEntitlementsDict] as? [String: Any],
              let groups = entitlements["com.apple.security.application-groups"] as? [String] else { return [] }
        return Set(groups)
    }

    static func declaredIdentifiers(appPath: String, bundleID: String) -> DeclaredIdentifiers {
        var declared = DeclaredIdentifiers()
        let app = URL(fileURLWithPath: appPath, isDirectory: true)
        guard let parent = try? canonical(app.deletingLastPathComponent().path) else { return declared }
        let root = URL(fileURLWithPath: parent, isDirectory: true).appendingPathComponent(app.lastPathComponent, isDirectory: true)
        var info = stat()
        guard lstat(root.path, &info) == 0, info.st_mode & S_IFMT == S_IFDIR else { return declared }
        let mainInfo = declaredInfo(at: root.appendingPathComponent("Contents/Info.plist"))
            ?? declaredInfo(at: root.appendingPathComponent("Info.plist"))
        if let helpers = mainInfo?["SMPrivilegedExecutables"] as? [String: Any] {
            declared.helpers = Set(helpers.keys)
        }
        declared.groups = applicationGroups(at: root)

        let keys: [URLResourceKey] = [.isDirectoryKey, .isSymbolicLinkKey]
        guard let entries = FileManager.default.enumerator(at: root, includingPropertiesForKeys: keys,
                                                           options: [], errorHandler: { _, _ in true }) else { return declared }
        var remaining = 2_000
        while remaining > 0, let entry = entries.nextObject() as? URL {
            remaining -= 1
            if entries.level >= 6 { entries.skipDescendants() }
            guard ["app", "appex", "xpc"].contains(entry.pathExtension.lowercased()),
                  let values = try? entry.resourceValues(forKeys: Set(keys)),
                  values.isDirectory == true, values.isSymbolicLink == false,
                  let id = declaredInfo(at: entry.appendingPathComponent("Contents/Info.plist"))?["CFBundleIdentifier"] as? String,
                  !id.isEmpty, id.caseInsensitiveCompare(bundleID) != .orderedSame else { continue }
            let lower = id.lowercased()
            guard !lower.hasPrefix("com.apple."), !lower.hasPrefix("org.sparkle-project.") else { continue }
            declared.bundles.insert(id)
            declared.groups.formUnion(applicationGroups(at: entry))
        }
        return declared
    }

    private static func vendorID(_ bundleID: String) -> String {
        bundleID.split(separator: ".").dropLast().joined(separator: ".")
    }

    static func evidence(root: String, stem: String, bundleID: String, name: String, declared: DeclaredIdentifiers) -> String? {
        if stem == bundleID { return "exact" }
        if declared.bundles.contains(stem)
            || (root == "Group Containers" && declared.groups.contains(stem))
            || (["PrivilegedHelperTools", "LaunchDaemons"].contains(root) && declared.helpers.contains(stem)) {
            return "declared"
        }
        let vendor = vendorID(bundleID)
        if (vendor.contains(".") && (stem == vendor || stem.hasPrefix(vendor + "."))) || stem.lowercased() == name.lowercased() {
            return "vendor"
        }
        return nil
    }

    static func exactEvidence(filename: String, suffixes: [String], bundleID: String,
                              childIDs: Set<String>) -> (stem: String, evidence: String)? {
        guard let suffix = suffixes.first(where: { filename.hasSuffix($0) }) else { return nil }
        let stem = String(filename.dropLast(suffix.count))
        if stem == bundleID { return (stem, "exact") }
        if childIDs.contains(stem) { return (stem, "declared") }
        return nil
    }

    static func plan(_ app: InstalledApplication, all: [InstalledApplication],
                     userLibrary: String = FileManager.default.homeDirectoryForCurrentUser.path + "/Library",
                     systemLibrary: String = "/Library", receipts: String = "/private/var/db/receipts") -> ApplicationPlan {
        let fm = FileManager.default; var items: [ApplicationDataItem] = []; var incomplete = false; var unreadable: [String] = []
        func add(_ path: String, kind: String, evidence: String, blocked: String?, selected: Bool, keepBlock: Bool = false) {
            let snapshot = try? snapshot(path); if snapshot == nil { incomplete = true }
            let keepReason = blocked != nil && (keepBlock || evidence == "declared")
            let finalBlocked = snapshot == nil && !keepReason ? "appIncomplete" : blocked
            items.append(ApplicationDataItem(path: path, kind: kind, evidence: evidence, bytes: snapshot?.bytes, selected: selected && blocked == nil && snapshot != nil, blocked: finalBlocked, snapshot: snapshot,
                                             note: finalBlocked == nil && !selected ? "personalData" : nil))
        }
        add(app.path, kind: "bundle", evidence: "exact", blocked: app.blocked, selected: true)
        if app.needsAuthentication == true, !items.isEmpty { items[items.count - 1].note = "authentication" }
        let declared = declaredIdentifiers(appPath: app.path, bundleID: app.bundleID)
        let vendor = vendorID(app.bundleID)
        func names(in directory: String) -> [String] {
            do { return try fm.contentsOfDirectory(atPath: directory) }
            catch {
                var info = stat()
                if lstat(directory, &info) == 0 || errno != ENOENT { incomplete = true }
                let code = (error as NSError).code
                if [NSFileReadNoPermissionError, Int(EPERM), Int(EACCES)].contains(code) { unreadable.append(directory) }
                return []
            }
        }
        func isShared(stem: String, evidence: String, bundleID: String, lowercaseIDs: Bool = false) -> Bool {
            all.contains { other in
                guard other.path != app.path else { return false }
                let id = lowercaseIDs ? other.bundleID.lowercased() : other.bundleID
                return id == bundleID || id == stem || id.hasPrefix(stem + ".") || stem.hasPrefix(id + ".")
                    || (evidence == "vendor" && id.hasPrefix(vendor + "."))
            }
        }
        for system in [false, true] {
            for root in ["Caches", "Logs", "Application Support", "Preferences", "Preferences/ByHost", "Containers", "Group Containers", "Saved Application State", "HTTPStorages", "WebKit", "LaunchAgents", "LaunchDaemons", "PrivilegedHelperTools"] {
                let directory = (system ? systemLibrary : userLibrary) + "/" + root
                for name in names(in: directory) {
                    let stem = name.hasSuffix(".plist") ? String(name.dropLast(6)) : name.hasSuffix(".savedState") ? String(name.dropLast(11)) : name
                    guard let evidence = evidence(root: root, stem: stem, bundleID: app.bundleID, name: app.name, declared: declared) else { continue }
                    let exact = evidence == "exact"
                    let shared = isShared(stem: stem, evidence: evidence, bundleID: app.bundleID)
                    let protected = ["Preferences/ByHost", "Containers", "Group Containers", "LaunchAgents", "LaunchDaemons", "PrivilegedHelperTools"].contains(root)
                    let blocked = shared ? "appShared" : system ? "appNeedsAdmin" : protected || !exact || (root == "Preferences" && (try? ApplicationPreferences.domain(for: directory + "/" + name)) == nil) ? "appProtected" : app.blocked
                    add(directory + "/" + name, kind: root.hasPrefix("Preferences") ? "preferences" : "data", evidence: evidence, blocked: blocked, selected: ["Caches", "Logs", "Saved Application State"].contains(root))
                }
            }
        }
        struct ExactLocation {
            let directory: String
            let suffixes: [String]
            var kind = "data"
            var block: String?
            var lowercaseIDs = false
        }
        let recentDocuments = "Application Support/com.apple.sharedfilelist/com.apple.LSSharedFileList.ApplicationRecentDocuments"
        let locations: [ExactLocation] = [
            .init(directory: userLibrary + "/Application Scripts", suffixes: [""], block: "appProtected"),
            .init(directory: userLibrary + "/SyncedPreferences", suffixes: [".plist"], kind: "preferences", block: "appProtected"),
            .init(directory: userLibrary + "/Cookies", suffixes: [".binarycookies"]),
            .init(directory: userLibrary + "/" + recentDocuments, suffixes: [".sfl2", ".sfl3", ".sfl4"], lowercaseIDs: true),
            .init(directory: receipts, suffixes: [".bom", ".plist"], block: "appNeedsAdmin")
        ]
        for location in locations {
            let bundleID = location.lowercaseIDs ? app.bundleID.lowercased() : app.bundleID
            let childIDs = location.lowercaseIDs ? Set(declared.bundles.map { $0.lowercased() }) : declared.bundles
            for name in names(in: location.directory) {
                guard let match = exactEvidence(filename: name, suffixes: location.suffixes, bundleID: bundleID, childIDs: childIDs) else { continue }
                let path = location.directory + "/" + name
                let shared = isShared(stem: match.stem, evidence: match.evidence, bundleID: bundleID, lowercaseIDs: location.lowercaseIDs)
                let blocked = shared ? "appShared" : location.block
                    ?? (match.evidence == "declared" || !isRegularFile(path) ? "appProtected" : app.blocked)
                add(path, kind: location.kind, evidence: match.evidence, blocked: blocked, selected: false, keepBlock: true)
            }
        }
        return ApplicationPlan(app: app, items: items, incomplete: incomplete, unreadable: unreadable)
    }
    static func inUse(_ path: String) throws -> Bool {
        let target = isRegularFile(path) ? ["--", path] : ["+D", path]
        let command = try NativeCommand.run(URL(fileURLWithPath: "/usr/sbin/lsof"), ["-n", "-P", "-F", "ftn"] + target, timeout: 15)
        guard command.diagnostics.isEmpty, command.status == 0 || command.status == 1 else { throw StorageFailure.invalidData }
        return holdsOpenFiles(String(decoding: command.output, as: UTF8.self), under: path)
    }
    /// `lsof -F ftn` output. System agents (UserEventAgent) keep a watch descriptor on each bundle
    /// folder in /Applications: a numbered descriptor on the scanned folder itself is a watch, not
    /// use. Anything else is use: open files, descriptors on folders inside, a working directory,
    /// mapped code, and any line this does not recognise.
    static func holdsOpenFiles(_ fields: String, under path: String) -> Bool {
        var descriptor: Substring?, type: Substring?
        for line in fields.split(separator: "\n") {
            let value = line.dropFirst()
            switch line.first {
            case "p": guard descriptor == nil, !value.isEmpty, value.allSatisfy({ $0.isASCII && $0.isNumber }) else { return true }
            case "f": guard descriptor == nil, !value.isEmpty, value.allSatisfy({ $0.isASCII && $0.isNumber }) else { return true }; descriptor = value
            case "t": guard descriptor != nil, type == nil, value == "DIR" else { return true }; type = value
            case "n": guard descriptor != nil, type != nil, value == path else { return true }; descriptor = nil; type = nil
            default: return true
            }
        }
        return descriptor != nil
    }
}
enum ApplicationActionFailure: Error {
    case inUse, cancelled, finderDenied

    static func messageKey(for error: Error) -> String {
        switch error as? Self {
        case .inUse: "appInUse"
        case .finderDenied: "appFinderDenied"
        default: "appActionError"
        }
    }
}

struct ApplicationFinder: Sendable {
    let trash: @Sendable (_ path: String) throws -> String
    let restore: @Sendable (_ trashPath: String, _ parent: String) throws -> Void

    static let live = Self(trash: { path in
        try run("""
        on run argv
            set source to (POSIX file (item 1 of argv)) as alias
            tell application "Finder" to set moved to (delete source)
            return POSIX path of (moved as alias)
        end run
        """, [path])
    }, restore: { path, parent in
        _ = try run("""
        on run argv
            set source to (POSIX file (item 1 of argv)) as alias
            set destination to (POSIX file (item 2 of argv)) as alias
            tell application "Finder" to set moved to (move source to destination)
            return POSIX path of (moved as alias)
        end run
        """, [path, parent])
    })

    private static func run(_ script: String, _ paths: [String]) throws -> String {
        let result = try NativeCommand.run(URL(fileURLWithPath: "/usr/bin/osascript"), ["-e", script] + paths, timeout: 300)
        guard result.status == 0 else {
            let diagnostics = String(decoding: result.diagnostics, as: UTF8.self)
            if diagnostics.contains("(-128)") { throw ApplicationActionFailure.cancelled }
            if diagnostics.contains("(-1743)") { throw ApplicationActionFailure.finderDenied }
            throw StorageFailure.invalidData
        }
        guard var path = String(data: result.output, encoding: .utf8) else { throw StorageFailure.invalidData }
        if path.last == "\n" { path.removeLast() }
        return path
    }
}

@MainActor @Observable public final class Applications {
    public private(set) var applications: [InstalledApplication] = []
    public private(set) var scanIssues: [ApplicationScanIssue] = []
    public private(set) var blockingIssueCount = 0
    public private(set) var plan: ApplicationPlan?
    public private(set) var journals: [ApplicationJournal] = []
    public var latestUndoableJournalID: String? { journals.first(where: \.canUndo)?.id }

    public func application(forDroppedPath path: String) -> InstalledApplication? {
        guard path.hasPrefix("/"), !path.utf8.contains(0) else { return nil }
        let dropped = URL(fileURLWithPath: path, isDirectory: true)
        guard dropped.pathExtension.lowercased() == "app" else { return nil }
        let parent = dropped.deletingLastPathComponent().resolvingSymlinksInPath().path
        // An inventoried .app link has its own protection status. Resolve only its parent.
        return applications.first { app in
            let installed = URL(fileURLWithPath: app.path, isDirectory: true)
            return installed.lastPathComponent == dropped.lastPathComponent
                && installed.deletingLastPathComponent().resolvingSymlinksInPath().path == parent
        }
    }

    public private(set) var busy = false
    public private(set) var error: String?
    @ObservationIgnored private var blocked = false
    @ObservationIgnored private let root: URL
    private let finder: ApplicationFinder
    private let installRoots: [ApplicationInstallRoot]?
    private let trashDirectory: URL?
    public convenience init() {
        self.init(journalDirectory: FilePersistence.previewURL().deletingLastPathComponent().appendingPathComponent("app-actions", isDirectory: true))
    }
    init(journalDirectory: URL, applications: [InstalledApplication] = [], finder: ApplicationFinder = .live, installRoots: [ApplicationInstallRoot]? = nil, trashDirectory: URL? = nil) {
        root = journalDirectory
        self.applications = applications
        self.finder = finder; self.installRoots = installRoots; self.trashDirectory = trashDirectory
        do {
            let url = root.appendingPathComponent("journal.json")
            if FileManager.default.fileExists(atPath: url.path) {
                guard (try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0) <= 16_777_216 else { throw StorageFailure.invalidData }
                journals = try JSONDecoder().decode([ApplicationJournal].self, from: Data(contentsOf: url))
                guard journals.allSatisfy({ UUID(uuidString: $0.id) != nil && $0.items.allSatisfy { UUID(uuidString: $0.id) != nil } }) else { throw StorageFailure.invalidData }
                // Helper receipts survive a killed UI process; recover the exact inode,
                // never infer success merely because an original path disappeared.
                for j in journals.indices { for i in journals[j].items.indices where journals[j].items[i].authenticated != true && ["pending", "failed"].contains(journals[j].items[i].status) {
                    let receipt = root.appendingPathComponent(journals[j].id + "-" + journals[j].items[i].id + ".json")
                    guard let data = try? Data(contentsOf: receipt), data.count < 16384,
                          let object = try? JSONSerialization.jsonObject(with: data) as? [String: String], let path = object["path"],
                          let snapshot = try? journals[j].items[i].currentSnapshot(at: path), snapshot == journals[j].items[i].snapshot else { continue }
                    journals[j].items[i].trashPath = path; journals[j].items[i].trashSnapshot = snapshot; journals[j].items[i].status = "trashed"
                } }

            }
        } catch { blocked = true; self.error = "appJournalError" }
    }
    private func reloadInventory() async throws {
        plan = nil
        (applications, scanIssues, blockingIssueCount) = try await Task.detached { [installRoots] in
            try ApplicationFiles.scan(roots: installRoots?.map(\.path), installRoots: installRoots)
        }.value
    }
    public func refresh() async {
        guard !busy else { return }; busy = true; defer { busy = false }
        // A journal that could not be read keeps changes locked, so its message stays too.
        do { try await reloadInventory(); error = blocked ? "appJournalError" : nil }
        catch { self.error = "appIncomplete" }
    }
    public func inspect(_ id: String) async {
        guard !busy, let app = applications.first(where: { $0.id == id }) else { return }; busy = true; defer { busy = false }
        let all = applications; plan = await Task.detached { ApplicationFiles.plan(app, all: all) }.value
    }
    public func dismissPlan() { if !busy { plan = nil } }
    public func reveal(_ id: String) { guard let item = plan?.items.first(where: { $0.id == id }) else { return }; NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: item.path)]) }
    public func revealIssue(_ id: String) { guard let issue = scanIssues.first(where: { $0.id == id }) else { return }; NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: issue.path)]) }
    private func save() throws {
        guard !blocked else { throw StorageFailure.invalidData }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let data = try JSONEncoder().encode(journals); guard data.count <= 16_777_216 else { throw StorageFailure.invalidData }
        let url = root.appendingPathComponent("journal.json"); try data.write(to: url, options: .atomic); try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
    private var fileHelper: URL? {
        guard let url = Bundle.main.resourceURL?.appendingPathComponent("native/viezan-fs"),
              FileManager.default.isExecutableFile(atPath: url.path) else { return nil }
        return url
    }
    private nonisolated func trashRoot(for parent: URL) throws -> String {
        let directory = try trashDirectory ?? FileManager.default.url(for: .trashDirectory, in: .userDomainMask, appropriateFor: parent, create: false)
        return try ApplicationFiles.canonical(directory.path)
    }
    public func trashIssue(_ id: String) async {
        guard !busy, !blocked else { return }
        busy = true; defer { busy = false }; error = nil
        let issues = scanIssues
        do {
            let current = await Task.detached { ApplicationFiles.trashableIssue(id, in: issues) }.value
            guard let issue = current else { throw StorageFailure.invalidData }
            guard let helper = fileHelper else { error = "appHelperMissing"; return }
            let isLink = issue.reason == .brokenLink
            let snapshot = try await Task.detached { try isLink ? ApplicationFiles.linkSnapshot(issue.path) : ApplicationFiles.snapshot(issue.path) }.value
            let name = URL(fileURLWithPath: issue.path, isDirectory: !isLink).deletingPathExtension().lastPathComponent
            let journal = ApplicationJournal(appName: name, action: "uninstall", items: [.init(path: issue.path, snapshot: snapshot, isLink: isLink ? true : nil)])
            try await execute(journal, helper: helper, verifying: issue)
        } catch {
            self.error = ApplicationActionFailure.messageKey(for: error)
            try? await reloadInventory()
        }
    }
    public func apply(planID: String, itemIDs: Set<String>, reset: Bool, quit: Bool) async {
        guard let plan, plan.id == planID else { return }
        await apply(plan, itemIDs: itemIDs, reset: reset, quit: quit, helper: fileHelper)
    }
    func apply(_ plan: ApplicationPlan, itemIDs: Set<String>, reset: Bool, quit: Bool, helper: URL?) async {
        guard !busy, !blocked, plan.app.blocked == nil, !itemIDs.isEmpty,
              itemIDs.isSubset(of: Set(plan.items.filter { $0.blocked == nil && (!reset || $0.kind != "bundle") }.map(\.id))) else { return }
        guard let helper else { error = "appHelperMissing"; return }
        busy = true; defer { busy = false }; error = nil
        let items = plan.items.filter { itemIDs.contains($0.id) }.compactMap { item in
            item.snapshot.map { ApplicationJournal.Item(path: item.path, snapshot: $0, authenticated: item.kind == "bundle" && plan.app.needsAuthentication == true ? true : nil) }
        }.sorted { $0.authenticated == true && $1.authenticated != true }
        let journal = ApplicationJournal(appName: plan.app.name, action: reset ? "reset" : "uninstall", items: items)
        do {
            let running = NSWorkspace.shared.runningApplications.filter { $0.bundleURL?.path == plan.app.path || $0.bundleURL?.path.hasPrefix(plan.app.path + "/") == true }
            if !running.isEmpty {
                guard quit, running.allSatisfy({ $0.terminate() }) else { error = "appInUse"; return }
                let deadline = Date().addingTimeInterval(15)
                while running.contains(where: { !$0.isTerminated }), Date() < deadline { try await Task.sleep(for: .milliseconds(100)) }
                guard running.allSatisfy(\.isTerminated) else { error = "appInUse"; return }
            }
            try await execute(journal, helper: helper)
        } catch { self.error = ApplicationActionFailure.messageKey(for: error) }
    }
    private func execute(_ intent: ApplicationJournal, helper: URL, verifying issue: ApplicationScanIssue? = nil) async throws {
        var journal = intent
        let installs = installRoots ?? ApplicationInstallRoot.defaults()
        // Full preflight precedes the first mutation. Repeat each snapshot at execution.
        for item in journal.items {
            try await Task.detached { try item.verifyForTrash(installRoots: installs) }.value
        }
        journals.insert(journal, at: 0); try save()
        for i in journal.items.indices {
            let item = journal.items[i]; let receipt = root.appendingPathComponent(journal.id + "-" + item.id + ".json")
            do {
                if item.isLink != true, let domain = try? ApplicationPreferences.domain(for: item.path) {
                    let backup = root.appendingPathComponent(journal.id + "-" + item.id + ".plist")
                    try await Task.detached {
                        guard try ApplicationFiles.snapshot(item.path) == item.snapshot else { throw StorageFailure.invalidData }
                        try ApplicationPreferences.export(domain, to: backup)
                        guard try ApplicationFiles.snapshot(item.path) == item.snapshot else { throw StorageFailure.invalidData }
                    }.value
                    journal.items[i].preferenceDomain = domain; journal.items[i].preferenceBackup = backup.lastPathComponent; journal.items[i].status = "preferencesBackedUp"
                    journals[0] = journal; try save()
                    try await Task.detached { guard try ApplicationFiles.snapshot(item.path) == item.snapshot else { throw StorageFailure.invalidData }; try ApplicationPreferences.remove(domain) }.value
                    journal.items[i].status = "preferencesRemoved"; journals[0] = journal; try save(); continue
                }
                let path = try await Task.detached { [finder, self] in
                    try item.verifyForTrash(installRoots: installs)
                    if let issue, !ApplicationFiles.stillMatches(issue) { throw StorageFailure.invalidData }
                    if item.authenticated == true {
                        let moved = try finder.trash(item.path)
                        guard moved.hasPrefix("/"), !moved.utf8.contains(0) else { throw StorageFailure.invalidData }
                        let path = try ApplicationFiles.canonical(moved) // realpath also removes Finder's trailing slash.
                        let trash = try trashRoot(for: URL(fileURLWithPath: item.path).deletingLastPathComponent())
                        guard path != trash, ApplicationFiles.within(path, trash), try ApplicationFiles.snapshot(path) == item.snapshot else { throw StorageFailure.invalidData }
                        return path
                    }
                    let result = try NativeCommand.run(helper, [item.isLink == true ? "trash-link" : "trash", item.path, String(item.snapshot.device), String(item.snapshot.inode), receipt.path])
                    guard result.status == 0, let object = try JSONSerialization.jsonObject(with: result.output) as? [String: String], let path = object["path"] else { throw StorageFailure.invalidData }
                    return path
                }.value
                journal.items[i].trashPath = path
                let snapshot = item.authenticated == true ? item.snapshot : try await Task.detached { try item.currentSnapshot(at: path) }.value
                guard item.isLink != true || snapshot == item.snapshot else { throw StorageFailure.invalidData }
                journal.items[i].trashSnapshot = snapshot; journal.items[i].status = "trashed"
            } catch ApplicationActionFailure.cancelled where journal.items.allSatisfy({ $0.status == "pending" }) {
                journals.removeFirst(); try save(); break
            } catch {
                let key = ApplicationActionFailure.messageKey(for: error)
                journal.items[i].status = "failed"
                journal.items[i].issue = key
                self.error = key
            }
            journals[0] = journal; try save()
            if journal.items[i].status == "failed" { break }
        }
        try await reloadInventory()
    }
    public func undo(_ id: String) async {
        guard !busy, !blocked, let j = journals.firstIndex(where: { $0.id == id }), let helper = Bundle.main.resourceURL?.appendingPathComponent("native/viezan-fs") else { return }
        busy = true; defer { busy = false }; error = nil
        let installs = installRoots ?? ApplicationInstallRoot.defaults()
        // Ask for authentication first, so cancelling it leaves the data in the Trash with its app.
        let indices = journals[j].items.indices.reversed()
        for i in indices.filter({ journals[j].items[$0].authenticated == true }) + indices.filter({ journals[j].items[$0].authenticated != true }) {
            let item = journals[j].items[i]
            if item.isLink != true, let domain = item.preferenceDomain, let filename = item.preferenceBackup, ["preferencesRemoved", "preferencesBackedUp", "failed"].contains(item.status) {
                do {
                    guard filename == journals[j].id + "-" + item.id + ".plist", try ApplicationPreferences.domain(for: item.path) == domain else { throw StorageFailure.invalidData }
                    let source = root.appendingPathComponent(filename)
                    try await Task.detached { try ApplicationPreferences.restore(domain, from: source) }.value
                    journals[j].items[i].status = "restored"; try save()
                } catch { self.error = "appActionError"; return }
                continue
            }
            guard item.status == "trashed", let path = item.trashPath, let snapshot = item.trashSnapshot else { continue }
            do {
                let parent = URL(fileURLWithPath: (item.path as NSString).deletingLastPathComponent, isDirectory: true)
                let trash = try trashRoot(for: parent)
                guard ApplicationFiles.within(path, trash), path != trash else { throw StorageFailure.invalidData }
                try await Task.detached { [finder] in
                    try ApplicationFiles.policy(item.path, missing: true, isLink: item.isLink == true, installRoots: installs)
                    guard try item.currentSnapshot(at: path) == snapshot else { throw StorageFailure.invalidData }
                    if item.authenticated == true {
                        try finder.restore(path, parent.path)
                        // Finder keeps the name it gave the bundle in the Trash, which differs when that name was taken.
                        let restored = parent.appendingPathComponent((path as NSString).lastPathComponent).path
                        guard restored == item.path || renamex_np(restored, item.path, UInt32(RENAME_EXCL)) == 0,
                              try ApplicationFiles.snapshot(item.path) == item.snapshot else { throw StorageFailure.invalidData }
                        return
                    }
                    let result = try NativeCommand.run(helper, [item.isLink == true ? "restore-link" : "restore", path, item.path, String(snapshot.device), String(snapshot.inode)])
                    guard result.status == 0 else { throw StorageFailure.invalidData }
                }.value
                journals[j].items[i].status = "restored"; try save()
            } catch ApplicationActionFailure.cancelled { break }
            catch { self.error = ApplicationActionFailure.messageKey(for: error); return }
        }
        do { try await reloadInventory() } catch { self.error = "appIncomplete" }
    }
}

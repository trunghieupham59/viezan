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
    /// Inventoried symbolic links to this same bundle. Separate installations keep their own rows.
    var symbolicLinks: [String]?
}
public struct ApplicationScanIssue: Identifiable, Sendable, Equatable {
    public enum Reason: String, Error { case invalidBundle, brokenLink, unreadable, scanLimit, notAnApp }
    // A rescan that changes the reason also invalidates an open confirmation.
    public var id: String { reason.rawValue + ":" + path }
    public var blocking: Bool { reason != .notAnApp && !targetGone }
    public private(set) var canTrash: Bool = false
    init(path: String, reason: Reason, targetGone: Bool = false, installRoots: [ApplicationInstallRoot] = ApplicationInstallRoot.defaults()) {
        self.path = path; self.reason = reason; self.targetGone = targetGone
        canTrash = allowsTrash(installRoots: installRoots)
    }
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
    var systemItem: ApplicationSystemLibraryItem?
    public var uninstallOnly: Bool { kind == "bundle" || systemItem != nil }
    public var requiresFinder: Bool { systemItem != nil || note == "authentication" }
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
        var systemItem: ApplicationSystemLibraryItem?
        var trashSnapshot: ApplicationSnapshot?
        public var preferenceDomain: String?
        public var preferenceBackup: String?
        public var issue: String?
        /// Size when it was moved (Apps journal row).
        public var bytes: Int64 { snapshot.bytes }

        func currentSnapshot(at path: String) throws -> ApplicationSnapshot {
            try isLink == true ? ApplicationFiles.linkSnapshot(path) : ApplicationFiles.snapshot(path)
        }

        func verifyForTrash(installRoots: [ApplicationInstallRoot], systemLibrary: String) throws {
            let isFileAction = isLink == true || (try? ApplicationPreferences.domain(for: path)) == nil
            if let systemItem {
                guard authenticated == true, isLink != true else { throw StorageFailure.invalidData }
                try systemItem.validate(path, library: systemLibrary)
            } else if isFileAction { try ApplicationFiles.policy(path, isLink: isLink == true, installRoots: installRoots) }
            guard try currentSnapshot(at: path) == snapshot else { throw StorageFailure.invalidData }
            if isFileAction, isLink != true, try ApplicationFiles.inUse(path) { throw ApplicationActionFailure.inUse }
        }
    }
    public var canUndo: Bool {
        items.contains { ["trashed", "restoring", "preferencesRemoved", "preferencesBackedUp"].contains($0.status) || ($0.status == "failed" && $0.preferenceBackup != nil) }
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
    static func hasIdentity(_ snapshot: ApplicationSnapshot, at path: String) -> Bool {
        var info = stat()
        return lstat(path, &info) == 0 && info.st_dev == snapshot.device && info.st_ino == snapshot.inode
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
    private static func scanMetadata(at path: String, linked: Bool) -> Result<(Bundle, [String: Any], String, String), ApplicationScanIssue.Reason> {
        guard let target = try? canonical(path), linked || target == path else { return .failure(linked ? .brokenLink : .invalidBundle) }
        return bundleMetadata(at: target, linked: linked).map { bundle, info, id in (bundle, info, id, target) }
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
        var bundleIndices = [String: Int]()
        var linkedApps: [(app: InstalledApplication, target: String)] = []
        let issueLimit = 50
        var blockingIssueCount = 0
        func record(_ path: String, _ reason: ApplicationScanIssue.Reason) {
            let issue = ApplicationScanIssue(path: path, reason: reason, targetGone: reason == .brokenLink && linkTargetIsGone(path), installRoots: installs)
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
                let (bundle, info, id, target): (Bundle, [String: Any], String, String)
                switch scanMetadata(at: entry, linked: linked) {
                case .success(let metadata): (bundle, info, id, target) = metadata
                case .failure(let reason): record(entry, reason); continue
                }
                let localized = bundle.bundleIdentifier == id ? bundle.localizedInfoDictionary : nil
                func text(_ key: String) -> String? { localized?[key] as? String ?? info[key] as? String }
                // A link whose target was not independently inventoried stays a protected owner.
                let install = installs.first { $0.contains(entry) }
                let protected = linked || install == nil || within(entry, "/Applications/Setapp") || id.lowercased().hasPrefix("com.apple.") || id.lowercased().hasPrefix("com.viezan.") || entry == Bundle.main.bundlePath
                let blocked = protected ? "appProtected" : install?.ownershipBlock(owner: st.st_uid)
                let needsAuthentication: Bool? = blocked == nil && access(entry, W_OK) != 0 ? true : nil
                let app = InstalledApplication(path: entry, name: text("CFBundleDisplayName") ?? text("CFBundleName") ?? String(child.dropLast(4)), bundleID: id, version: text("CFBundleShortVersionString") ?? "", blocked: blocked, needsAuthentication: needsAuthentication)
                if linked { linkedApps.append((app, target)) }
                else {
                    bundleIndices[entry] = applications.count
                    applications.append(app)
                }
            }
        }
        for root in roots ?? (installs.map(\.path) + ["/System/Applications"]) { visit(root, depth: 0) }
        for (link, target) in linkedApps {
            guard let owner = bundleIndices[target],
                  link.bundleID == applications[owner].bundleID else { applications.append(link); continue }
            if applications[owner].symbolicLinks == nil { applications[owner].symbolicLinks = [] }
            applications[owner].symbolicLinks?.append(link.path)
        }
        if blockingIssueCount > 0 { for i in applications.indices where applications[i].blocked == nil { applications[i].blocked = "appIncomplete" } }
        return (applications.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }, issues, blockingIssueCount)
    }
    struct DeclaredIdentifiers {
        var bundles: Set<String> = []
        var groups: Set<String> = []
        var helpers: Set<String> = []
    }

    static func declaredInfo(at url: URL) -> [String: Any]? {
        // Contents or Info.plist can itself be a link, even in a real bundle directory.
        let fd = open(url.path, O_RDONLY | O_NOFOLLOW_ANY | O_NONBLOCK | O_CLOEXEC)
        guard fd >= 0 else { return nil }
        let file = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        var info = stat()
        guard fstat(fd, &info) == 0, info.st_mode & S_IFMT == S_IFREG, info.st_size <= 4_194_304,
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

    static func declaredIdentifiers(appPath: String, bundleID: String, includeGroups: Bool = true) -> DeclaredIdentifiers {
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
        if includeGroups { declared.groups = applicationGroups(at: root) }

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
            if includeGroups { declared.groups.formUnion(applicationGroups(at: entry)) }
        }
        return declared
    }

    private static func vendorID(_ bundleID: String) -> String {
        bundleID.split(separator: ".").dropLast().joined(separator: ".")
    }

    static func identifiersOverlap(_ first: String, _ second: String) -> Bool {
        first == second || first.hasPrefix(second + ".") || second.hasPrefix(first + ".")
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
                     systemLibrary: String = "/Library", receipts: String = "/private/var/db/receipts",
                     installRoots: [ApplicationInstallRoot] = ApplicationInstallRoot.defaults()) -> ApplicationPlan {
        let fm = FileManager.default; var items: [ApplicationDataItem] = []; var incomplete = false; var unreadable: [String] = []
        func add(_ path: String, kind: String, evidence: String, blocked: String?, selected: Bool, keepBlock: Bool = false, systemItem: ApplicationSystemLibraryItem? = nil) {
            let snapshot = try? snapshot(path); if snapshot == nil { incomplete = true }
            let keepReason = blocked != nil && (keepBlock || evidence == "declared")
            let finalBlocked = snapshot == nil && !keepReason ? "appIncomplete" : blocked
            let personalData = systemItem.map { ["Preferences", "Application Support", "WebKit", "HTTPStorages"].contains($0.folder) } ?? !selected
            items.append(ApplicationDataItem(path: path, kind: kind, evidence: evidence, bytes: snapshot?.bytes, selected: selected && blocked == nil && snapshot != nil, blocked: finalBlocked, snapshot: snapshot, systemItem: finalBlocked == nil ? systemItem : nil,
                                             note: finalBlocked == nil && personalData ? "personalData" : nil))
        }
        add(app.path, kind: "bundle", evidence: "exact", blocked: app.blocked, selected: true)
        if app.needsAuthentication == true, !items.isEmpty { items[items.count - 1].note = "authentication" }
        for path in app.symbolicLinks ?? [] {
            let snapshot = try? linkSnapshot(path)
            let parent = (path as NSString).deletingLastPathComponent
            let target = try? fm.destinationOfSymbolicLink(atPath: path)
            // The leaf snapshot pins a direct reference, even after Finder has moved the app.
            // A chain can change its destination without changing this link's inode or text.
            let direct = target == app.path || target.map { parent + "/" + $0 == app.path } == true
            let allowed = snapshot != nil && direct && (try? canonical(path)) == app.path
                && installRoots.contains { $0.allowsTrashLink(path) } && access(parent, W_OK | X_OK) == 0
            items.append(ApplicationDataItem(path: path, kind: "bundle", evidence: "symbolicLink", bytes: snapshot?.bytes,
                                             selected: false, blocked: allowed ? app.blocked : "appProtected", snapshot: snapshot))
        }
        let declared = declaredIdentifiers(appPath: app.path, bundleID: app.bundleID)
        let systemHelpers = declared.helpers.union(ApplicationSystemLibraryItem.embeddedHelpers(app))
        lazy var systemOwnership = ApplicationLibraryOwnership(app: app, declared: declared, inventory: all, helpers: systemHelpers)
        let ownerID = app.bundleID.lowercased()
        let vendor = vendorID(ownerID)
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
        func isShared(stem: String, evidence: String) -> Bool {
            let identifier = stem.lowercased()
            return all.contains { other in
                guard other.path != app.path else { return false }
                let id = other.bundleID.lowercased()
                return id == ownerID || identifiersOverlap(id, identifier)
                    || (evidence == "vendor" && id.hasPrefix(vendor + "."))
            }
        }
        for system in [false, true] {
            for root in ["Caches", "Logs", "Application Support", "Preferences", "Preferences/ByHost", "Containers", "Group Containers", "Saved Application State", "HTTPStorages", "WebKit", "LaunchAgents", "LaunchDaemons", "PrivilegedHelperTools"] {
                let directory = (system ? systemLibrary : userLibrary) + "/" + root
                for name in names(in: directory) {
                    let stem = name.hasSuffix(".plist") ? String(name.dropLast(6)) : name.hasSuffix(".savedState") ? String(name.dropLast(11)) : name
                    let systemHelper = system && systemHelpers.contains(stem)
                    guard let evidence = systemHelper ? "declared" : evidence(root: root, stem: stem, bundleID: app.bundleID, name: app.name, declared: declared) else { continue }
                    let exact = evidence == "exact"
                    if system {
                        let item = ApplicationSystemLibraryItem(identifier: stem, folder: root)
                        let path = directory + "/" + name
                        let block = systemOwnership.block(item, at: path, library: systemLibrary)
                        let eligible = block == nil
                        add(path, kind: root.hasPrefix("Preferences") ? "preferences" : "data", evidence: evidence,
                            blocked: block, selected: false, systemItem: eligible ? item : nil)
                        continue
                    }
                    let shared = isShared(stem: stem, evidence: evidence)
                    let protected = ["Preferences/ByHost", "Containers", "Group Containers", "LaunchAgents", "LaunchDaemons", "PrivilegedHelperTools"].contains(root)
                    let blocked = shared ? "appShared" : protected || !exact || (root == "Preferences" && (try? ApplicationPreferences.domain(for: directory + "/" + name)) == nil) ? "appProtected" : app.blocked
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
                let shared = isShared(stem: match.stem, evidence: match.evidence)
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
    case inUse, cancelled, finderDenied, restoreInFinder

    static func messageKey(for error: Error) -> String {
        switch error as? Self {
        case .inUse: "appInUse"
        case .cancelled: "appsUninstallCancelled"
        case .finderDenied: "appFinderDenied"
        case .restoreInFinder: "appRestoreInFinder"
        default: "appActionError"
        }
    }
}

struct ApplicationFinder: Sendable {
    let trash: @Sendable (_ path: String) throws -> String
    let restore: @Sendable (_ source: String, _ destination: String) throws -> String

    var trashSelection: @Sendable ([String]) throws -> [String] = { _ in throw StorageFailure.invalidData }

    static let live = Self(trash: { path in
        try run("""
        on run argv
            set source to (POSIX file (item 1 of argv)) as alias
            tell application "Finder" to set moved to (delete source)
            return POSIX path of (moved as alias)
        end run
        """, [path])
    }, restore: { path, destination in
        // Finder's move command accepts a folder, not a new basename. Changing the
        // basename must happen in one exclusive move to the original path.
        if (path as NSString).lastPathComponent != (destination as NSString).lastPathComponent {
            guard renamex_np(path, destination, UInt32(RENAME_EXCL)) == 0 else {
                let code = errno
                if code == EACCES || code == EPERM { throw ApplicationActionFailure.restoreInFinder }
                throw POSIXError(POSIXErrorCode(rawValue: code) ?? .EIO)
            }
            return destination
        }
        return try run("""
        on run argv
            set source to (POSIX file (item 1 of argv)) as alias
            set destination to (POSIX file (item 2 of argv)) as alias
            tell application "Finder" to set moved to (move source to destination without replacing)
            return POSIX path of (moved as alias)
        end run
        """, [path, (destination as NSString).deletingLastPathComponent])
    }, trashSelection: { paths in
        let output = try run(selectionScript, paths)
        guard let data = Data(base64Encoded: output) else { throw StorageFailure.invalidData }
        return try JSONDecoder().decode([String].self, from: data)
    })

    // One Finder operation for the whole authorized selection. Base64 JSON preserves every
    // legal filename (including line breaks) when osascript returns the resulting Trash URLs.
    static let selectionScript = """
        use framework "Foundation"
        use scripting additions
        on run argv
            set sources to {}
            repeat with p in argv
                set end of sources to ((POSIX file (contents of p)) as alias)
            end repeat
            with timeout of 290 seconds
                tell application "Finder" to set movedItems to delete sources
            end timeout
            if class of movedItems is not list then set movedItems to {movedItems}
            set paths to current application's NSMutableArray's array()
            repeat with movedItem in movedItems
                set movedPath to POSIX path of (movedItem as alias)
                paths's addObject:movedPath
            end repeat
            set payload to current application's NSJSONSerialization's dataWithJSONObject:paths options:0 |error|:(missing value)
            return (payload's base64EncodedStringWithOptions:0) as text
        end run
        """

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
        guard let parent = try? ApplicationFiles.canonical(dropped.deletingLastPathComponent().path) else { return nil }
        // Accept only inventoried entries. A grouped link must still resolve to the same bundle.
        let entry = (parent as NSString).appendingPathComponent(dropped.lastPathComponent)
        return applications.first { app in
            if app.symbolicLinks?.contains(entry) == true { return (try? ApplicationFiles.canonical(entry)) == app.path }
            let installed = URL(fileURLWithPath: app.path, isDirectory: true)
            return installed.lastPathComponent == dropped.lastPathComponent
                && (try? ApplicationFiles.canonical(installed.deletingLastPathComponent().path)) == parent
        }
    }

    public private(set) var busy = false
    public private(set) var error: String?
    @ObservationIgnored private var blocked = false
    @ObservationIgnored private let root: URL
    private let finder: ApplicationFinder
    private let installRoots: [ApplicationInstallRoot]?
    private let userLibrary: String
    private let systemLibrary: String
    private let trashDirectory: URL?
    private let helperURL: URL?
    public convenience init() {
        self.init(journalDirectory: FilePersistence.previewURL().deletingLastPathComponent().appendingPathComponent("app-actions", isDirectory: true))
    }
    init(journalDirectory: URL, applications: [InstalledApplication] = [], finder: ApplicationFinder = .live, installRoots: [ApplicationInstallRoot]? = nil, trashDirectory: URL? = nil,
         userLibrary: String = FileManager.default.homeDirectoryForCurrentUser.path + "/Library", systemLibrary: String = "/Library",
         helperURL: URL? = Bundle.main.resourceURL?.appendingPathComponent("native/viezan-fs")) {
        self.userLibrary = userLibrary
        self.systemLibrary = systemLibrary
        root = journalDirectory
        self.applications = applications
        self.finder = finder; self.installRoots = installRoots; self.trashDirectory = trashDirectory; self.helperURL = helperURL
        do {
            let url = root.appendingPathComponent("journal.json")
            if FileManager.default.fileExists(atPath: url.path) {
                guard (try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0) <= 16_777_216 else { throw StorageFailure.invalidData }
                journals = try JSONDecoder().decode([ApplicationJournal].self, from: Data(contentsOf: url))
                guard journals.allSatisfy({ UUID(uuidString: $0.id) != nil && $0.items.allSatisfy { UUID(uuidString: $0.id) != nil } }) else { throw StorageFailure.invalidData }
                // In 2.6.0 Finder could move the bundle before the journal advanced.
                // Resolve its identity on Undo, away from the main thread.
                for j in journals.indices {
                    for i in journals[j].items.indices {
                        let item = journals[j].items[i]
                        guard item.authenticated == true, item.status == "trashed", let path = item.trashPath else { continue }
                        var info = stat()
                        if lstat(path, &info) != 0 && errno == ENOENT { journals[j].items[i].status = "restoring" }
                    }
                }
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
        do { try await recoverFinderSelections(); try await reloadInventory(); error = blocked ? "appJournalError" : nil }
        catch { self.error = "appIncomplete" }
    }
    public func inspect(_ id: String) async {
        guard !busy, let app = applications.first(where: { $0.id == id }) else { return }; busy = true; defer { busy = false }
        let all = applications; plan = await Task.detached { [userLibrary, systemLibrary, installRoots] in
            ApplicationFiles.plan(app, all: all, userLibrary: userLibrary, systemLibrary: systemLibrary,
                                  installRoots: installRoots ?? ApplicationInstallRoot.defaults())
        }.value
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
        guard let url = helperURL,
              FileManager.default.isExecutableFile(atPath: url.path) else { return nil }
        return url
    }
    private nonisolated func trashRoot(for parent: URL) throws -> String {
        let directory = try trashDirectory ?? FileManager.default.url(for: .trashDirectory, in: .userDomainMask, appropriateFor: parent, create: false)
        return try ApplicationFiles.canonical(directory.path)
    }

    private nonisolated func finderRestore(_ item: ApplicationJournal.Item, roots: [ApplicationInstallRoot]) throws -> ApplicationFinderRestore {
        let parent = URL(fileURLWithPath: item.path).deletingLastPathComponent()
        return try ApplicationFinderRestore(item, trash: trashRoot(for: parent), roots: roots, systemLibrary: systemLibrary)
    }

    public func revealRestoreItem(_ itemID: String) async {
        guard !busy, !blocked, let item = journals.lazy.flatMap(\.items).first(where: { $0.id == itemID }),
              item.authenticated == true, ["trashed", "restoring"].contains(item.status) else { return }
        busy = true; defer { busy = false }; error = nil
        let roots = installRoots ?? ApplicationInstallRoot.defaults()
        do {
            let path = try await Task.detached { [self] in try finderRestore(item, roots: roots).location() }.value
            NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
        } catch { self.error = "appActionError" }
    }
    public func trashIssue(_ id: String) async {
        guard !busy, !blocked else { return }
        busy = true; defer { busy = false }; error = nil
        let issues = scanIssues
        do {
            let current = await Task.detached { [installRoots] in ApplicationFiles.trashableIssue(id, in: issues, installRoots: installRoots) }.value
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
              itemIDs.isSubset(of: Set(plan.items.filter { $0.blocked == nil && (!reset || !$0.uninstallOnly) }.map(\.id))) else { return }
        guard let helper else { error = "appHelperMissing"; return }
        busy = true; defer { busy = false }; error = nil
        let items = plan.items.filter { itemIDs.contains($0.id) }.compactMap { item in
            item.snapshot.map { ApplicationJournal.Item(path: item.path, snapshot: $0, isLink: item.evidence == "symbolicLink" ? true : nil,
                                                       authenticated: item.requiresFinder ? true : nil, systemItem: item.systemItem) }
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
            if items.contains(where: { $0.path != plan.app.path }) {
                // App ownership and sharing may have changed while the confirmation was open.
                try await Task.detached { [installRoots, systemLibrary] in
                    let inventory = try ApplicationFiles.scan(roots: installRoots?.map(\.path), installRoots: installRoots)
                    guard let app = inventory.applications.first(where: { $0.path == plan.app.path }),
                          app.bundleID == plan.app.bundleID, app.blocked == nil else { throw StorageFailure.invalidData }
                    let links = items.filter { $0.isLink == true }
                    guard Set(links.map(\.path)).isSubset(of: Set(app.symbolicLinks ?? [])) else { throw StorageFailure.invalidData }
                    if items.contains(where: { $0.path != app.path && $0.isLink != true && $0.systemItem == nil }) {
                        // Only exact main-app user data is selectable. Recheck for a second owner.
                        let id = app.bundleID.lowercased()
                        guard !inventory.applications.contains(where: { other in
                            other.path != app.path && ApplicationFiles.identifiersOverlap(other.bundleID.lowercased(), id)
                        }) else { throw StorageFailure.invalidData }
                    }
                    if items.contains(where: { $0.systemItem != nil }) {
                        let declared = ApplicationFiles.declaredIdentifiers(appPath: app.path, bundleID: app.bundleID)
                        let helpers = declared.helpers.union(ApplicationSystemLibraryItem.embeddedHelpers(app))
                        let ownership = ApplicationLibraryOwnership(app: app, declared: declared, inventory: inventory.applications, helpers: helpers)
                        for item in items {
                            guard let systemItem = item.systemItem else { continue }
                            guard ownership.block(systemItem, at: item.path, library: systemLibrary) == nil else { throw StorageFailure.invalidData }
                        }
                    }
                }.value
            }
            try await execute(journal, helper: helper)
        } catch { self.error = ApplicationActionFailure.messageKey(for: error) }
    }
    private func execute(_ intent: ApplicationJournal, helper: URL, verifying issue: ApplicationScanIssue? = nil) async throws {
        var journal = intent
        let installs = installRoots ?? ApplicationInstallRoot.defaults()
        // Full preflight precedes the first mutation. Repeat each snapshot at execution.
        for item in journal.items {
            try await Task.detached { [systemLibrary] in try item.verifyForTrash(installRoots: installs, systemLibrary: systemLibrary) }.value
        }
        journals.insert(journal, at: 0); try save()
        if journal.items.contains(where: { $0.systemItem != nil }) {
            let group = journal.items.filter { $0.authenticated == true }
            // Finder owns both the macOS prompt and the Trash operation. Submit this group
            // before touching any user files, and persist partial results even on cancellation.
            var failure: Error?
            var hints: [String] = []
            do {
                hints = try await Task.detached { [finder, systemLibrary] in
                    for item in group { try item.verifyForTrash(installRoots: installs, systemLibrary: systemLibrary) }
                    return try finder.trashSelection(group.map(\.path))
                }.value
            } catch { failure = error }
            let results = await verifiedFinderMoves(group, hints: hints)
            for i in journal.items.indices where journal.items[i].authenticated == true {
                if let moved = results[journal.items[i].id] {
                    journal.items[i].trashPath = moved
                    journal.items[i].trashSnapshot = journal.items[i].snapshot
                    journal.items[i].status = "trashed"
                } else {
                    journal.items[i].status = "failed"
                    journal.items[i].issue = ApplicationActionFailure.messageKey(for: failure ?? StorageFailure.invalidData)
                }
            }
            if failure as? ApplicationActionFailure == .cancelled && results.isEmpty
                && group.allSatisfy({ ApplicationFiles.hasIdentity($0.snapshot, at: $0.path) }) {
                journals.removeFirst()
                try save()
                return
            }
            journals[0] = journal
            try save()
            if failure != nil || results.count != group.count {
                try await reloadInventory()
                throw failure ?? StorageFailure.invalidData
            }
        }
        for i in journal.items.indices where journal.items[i].status == "pending" {
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
                    try item.verifyForTrash(installRoots: installs, systemLibrary: systemLibrary)
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
    private func verifiedFinderMoves(_ items: [ApplicationJournal.Item], hints: [String]) async -> [String: String] {
        await Task.detached { [self] in
            var verified: [String: String] = [:]
            var contents: [String: [String]] = [:]
            for item in items {
                guard !ApplicationFiles.hasIdentity(item.snapshot, at: item.path),
                      let trash = try? trashRoot(for: URL(fileURLWithPath: item.path).deletingLastPathComponent()) else { continue }
                func matches(_ path: String) -> Bool {
                    (path as NSString).deletingLastPathComponent == trash && !path.utf8.contains(0)
                        && ApplicationFiles.hasIdentity(item.snapshot, at: path)
                        && (try? ApplicationFiles.snapshot(path)) == item.snapshot
                }
                let originalName = (item.path as NSString).lastPathComponent
                let candidates = hints.map { ($0 as NSString).standardizingPath } + [trash + "/" + originalName]
                if let path = candidates.first(where: matches) { verified[item.id] = path; continue }
                // Finder can rename a collision or finish moving some files before a cancellation.
                if contents[trash] == nil {
                    contents[trash] = (try? FileManager.default.contentsOfDirectory(atPath: trash)) ?? []
                }
                if let name = contents[trash]?.first(where: { matches(trash + "/" + $0) }) { verified[item.id] = trash + "/" + name }
            }
            return verified
        }.value
    }

    private func recoverFinderSelections() async throws {
        for j in journals.indices where journals[j].items.contains(where: { $0.systemItem != nil }) {
            let unresolved = journals[j].items.filter { $0.authenticated == true && ["failed", "pending"].contains($0.status) }
            guard !unresolved.isEmpty else { continue }
            let moved = await verifiedFinderMoves(unresolved, hints: [])
            for i in journals[j].items.indices {
                if let path = moved[journals[j].items[i].id] {
                    journals[j].items[i].trashPath = path
                    journals[j].items[i].trashSnapshot = journals[j].items[i].snapshot
                    journals[j].items[i].status = "trashed"
                    journals[j].items[i].issue = nil
                }
            }
            if !moved.isEmpty { try save() }
        }
    }

    public func undo(_ id: String) async {
        guard !busy, !blocked, let j = journals.firstIndex(where: { $0.id == id }), let helper = helperURL else { return }
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
            if item.authenticated == true, ["trashed", "restoring"].contains(item.status) {
                do {
                    journals[j].items[i].status = "restoring"
                    journals[j].items[i].issue = nil
                    try save() // Write intent before Finder or rename can change the filesystem.
                    let restore = try finderRestore(item, roots: installs)
                    do {
                        try await Task.detached { [finder] in try restore.restore(using: finder) }.value
                        journals[j].items[i].status = "restored"
                    } catch {
                        let location = try? await Task.detached { try restore.location() }.value
                        if location == restore.original {
                            journals[j].items[i].status = "restored"
                        } else {
                            journals[j].items[i].status = location == restore.trashed ? "trashed" : "restoring"
                            if error as? ApplicationActionFailure == .restoreInFinder {
                                journals[j].items[i].issue = item.systemItem != nil ? "appPutBackItem" : "appRestoreInFinder"
                            }
                            try save()
                            throw error
                        }
                    }
                    try save()
                } catch ApplicationActionFailure.cancelled { break }
                catch ApplicationActionFailure.restoreInFinder where item.systemItem != nil {
                    self.error = "appPutBackItem"
                }
                catch { self.error = ApplicationActionFailure.messageKey(for: error); return }
                continue
            }
            guard item.status == "trashed", let path = item.trashPath, let snapshot = item.trashSnapshot else { continue }
            do {
                let parent = URL(fileURLWithPath: (item.path as NSString).deletingLastPathComponent, isDirectory: true)
                let trash = try trashRoot(for: parent)
                guard ApplicationFiles.within(path, trash), path != trash else { throw StorageFailure.invalidData }
                try await Task.detached {
                    try ApplicationFiles.policy(item.path, missing: true, isLink: item.isLink == true, installRoots: installs)
                    guard try item.currentSnapshot(at: path) == snapshot else { throw StorageFailure.invalidData }
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

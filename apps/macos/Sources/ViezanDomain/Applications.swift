import Foundation
import AppKit
import CryptoKit
import Darwin
import Observation

public struct InstalledApplication: Codable, Identifiable, Sendable {
    public var id: String { path }
    public let path: String
    public let name: String
    public let bundleID: String
    public let version: String
    public var blocked: String?
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
}
public struct ApplicationPlan: Identifiable, Sendable {
    public var id = UUID().uuidString
    public let app: InstalledApplication
    public let items: [ApplicationDataItem]
    public let incomplete: Bool
}
struct ApplicationSnapshot: Codable, Equatable, Sendable { let device: Int32; let inode: UInt64; let digest: String; let bytes: Int64 }
public struct ApplicationJournal: Codable, Identifiable, Sendable {
    public struct Item: Codable, Identifiable, Sendable {
        public var id = UUID().uuidString
        public var path: String
        public var status = "pending"
        public var trashPath: String?
        var snapshot: ApplicationSnapshot
        var trashSnapshot: ApplicationSnapshot?
        public var preferenceDomain: String?
        public var preferenceBackup: String?
        public var issue: String?
    }
    public var id = UUID().uuidString
    public var appName: String
    public var action: String
    public var created = Date().timeIntervalSince1970
    public var items: [Item]
}
private enum ApplicationFiles {
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
    static func policy(_ path: String, missing: Bool = false) throws {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let roots = ["/Applications", home + "/Applications"] + ["Caches", "Logs", "Application Support", "Saved Application State", "HTTPStorages", "WebKit"].map { home + "/Library/" + $0 }
        let forbidden = [FilePersistence.previewURL().deletingLastPathComponent().path, home + "/Library/Keychains", home + "/Library/Mobile Documents", home + "/.ssh", home + "/.aws", home + "/.gnupg"]
        guard roots.contains(where: { path != $0 && within(path, $0) }), !forbidden.contains(where: { within(path, $0) || within($0, path) }), !path.split(separator: "/").contains(where: { $0 == ".." || $0.hasSuffix(".photoslibrary") }) else { throw StorageFailure.invalidData }
        if missing { var info = stat(); guard lstat(path, &info) != 0, errno == ENOENT, try canonical((path as NSString).deletingLastPathComponent) == (path as NSString).deletingLastPathComponent else { throw StorageFailure.invalidData } }
        else { guard try canonical(path) == path else { throw StorageFailure.invalidData } }
    }
    static func inventory() throws -> [InstalledApplication] {
        let fm = FileManager.default; let home = fm.homeDirectoryForCurrentUser.path
        var applications: [InstalledApplication] = []; var visited = 0; var incomplete = false
        func scan(_ path: String, depth: Int) {
            visited += 1; guard visited < 20000, depth < 9 else { incomplete = true; return }
            guard let children = try? fm.contentsOfDirectory(atPath: path) else { if fm.fileExists(atPath: path) { incomplete = true }; return }
            for child in children {
                let entry = path + "/" + child; var st = stat(); guard lstat(entry, &st) == 0 else { incomplete = true; continue }
                if st.st_mode & S_IFMT == S_IFLNK { if child.hasSuffix(".app") { incomplete = true }; continue }
                guard st.st_mode & S_IFMT == S_IFDIR else { continue }
                if child.hasSuffix(".app") {
                    guard let bundle = Bundle(path: entry), let id = bundle.bundleIdentifier, id.contains("."), let canonical = try? canonical(entry), canonical == entry else { incomplete = true; continue }
                    let blocked = (!within(entry, "/Applications") && !within(entry, home + "/Applications")) || within(entry, "/Applications/Setapp") || id.lowercased().hasPrefix("com.apple.") || id.lowercased().hasPrefix("com.viezan.") || entry == Bundle.main.bundlePath
                    applications.append(InstalledApplication(path: entry, name: bundle.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? bundle.object(forInfoDictionaryKey: "CFBundleName") as? String ?? String(child.dropLast(4)), bundleID: id, version: bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "", blocked: blocked ? "appProtected" : nil))
                } else { scan(entry, depth: depth + 1) }
            }
        }
        for root in ["/Applications", "/System/Applications", home + "/Applications"] { scan(root, depth: 0) }
        if incomplete { for i in applications.indices { applications[i].blocked = "appIncomplete" } }
        return applications.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }
    static func plan(_ app: InstalledApplication, all: [InstalledApplication]) -> ApplicationPlan {
        let fm = FileManager.default; let home = fm.homeDirectoryForCurrentUser.path; var items: [ApplicationDataItem] = []; var incomplete = false
        func add(_ path: String, kind: String, evidence: String, blocked: String?, selected: Bool) {
            let snapshot = try? snapshot(path); if snapshot == nil { incomplete = true }
            items.append(ApplicationDataItem(path: path, kind: kind, evidence: evidence, bytes: snapshot?.bytes, selected: selected && blocked == nil && snapshot != nil, blocked: snapshot == nil ? "appIncomplete" : blocked, snapshot: snapshot))
        }
        add(app.path, kind: "bundle", evidence: "exact", blocked: app.blocked, selected: true)
        let vendor = app.bundleID.split(separator: ".").dropLast().joined(separator: ".")
        for system in [false, true] {
            for root in ["Caches", "Logs", "Application Support", "Preferences", "Preferences/ByHost", "Containers", "Group Containers", "Saved Application State", "HTTPStorages", "WebKit", "LaunchAgents", "LaunchDaemons", "PrivilegedHelperTools"] {
                let directory = (system ? "/Library/" : home + "/Library/") + root
                guard let names = try? fm.contentsOfDirectory(atPath: directory) else { if fm.fileExists(atPath: directory) { incomplete = true }; continue }
                for name in names {
                    let stem = name.hasSuffix(".plist") ? String(name.dropLast(6)) : name.hasSuffix(".savedState") ? String(name.dropLast(11)) : name
                    let exact = stem == app.bundleID
                    guard exact || (vendor.contains(".") && (stem == vendor || stem.hasPrefix(vendor + "."))) || stem.lowercased() == app.name.lowercased() else { continue }
                    let shared = all.contains { $0.path != app.path && ($0.bundleID == app.bundleID || $0.bundleID == stem || $0.bundleID.hasPrefix(stem + ".") || stem.hasPrefix($0.bundleID + ".") || (!exact && $0.bundleID.hasPrefix(vendor + "."))) }
                    let protected = ["Preferences/ByHost", "Containers", "Group Containers", "LaunchAgents", "LaunchDaemons", "PrivilegedHelperTools"].contains(root)
                    let blocked = shared ? "appShared" : system ? "appNeedsAdmin" : protected || !exact || (root == "Preferences" && (try? ApplicationPreferences.domain(for: directory + "/" + name)) == nil) ? "appProtected" : app.blocked
                    add(directory + "/" + name, kind: root.hasPrefix("Preferences") ? "preferences" : "data", evidence: exact ? "exact" : "vendor", blocked: blocked, selected: ["Caches", "Logs", "Saved Application State"].contains(root))
                }
            }
        }
        return ApplicationPlan(app: app, items: items, incomplete: incomplete)
    }
    static func inUse(_ path: String) throws -> Bool {
        let command = try NativeCommand.run(URL(fileURLWithPath: "/usr/sbin/lsof"), ["-n", "-P", "-t", "+D", path], timeout: 15)
        guard command.diagnostics.isEmpty, command.status == 0 || command.status == 1 else { throw StorageFailure.invalidData }
        return !command.output.isEmpty
    }
}
@MainActor @Observable public final class Applications {
    public private(set) var applications: [InstalledApplication] = []
    public private(set) var plan: ApplicationPlan?
    public private(set) var journals: [ApplicationJournal] = []
    public private(set) var busy = false
    public private(set) var error: String?
    @ObservationIgnored private var blocked = false
    @ObservationIgnored private let root = FilePersistence.previewURL().deletingLastPathComponent().appendingPathComponent("app-actions", isDirectory: true)
    public init() {
        do {
            let url = root.appendingPathComponent("journal.json")
            if FileManager.default.fileExists(atPath: url.path) {
                guard (try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0) <= 16_777_216 else { throw StorageFailure.invalidData }
                journals = try JSONDecoder().decode([ApplicationJournal].self, from: Data(contentsOf: url))
                guard journals.allSatisfy({ UUID(uuidString: $0.id) != nil && $0.items.allSatisfy { UUID(uuidString: $0.id) != nil } }) else { throw StorageFailure.invalidData }
                // Helper receipts survive a killed UI process; recover the exact inode,
                // never infer success merely because an original path disappeared.
                for j in journals.indices { for i in journals[j].items.indices where ["pending", "failed"].contains(journals[j].items[i].status) {
                    let receipt = root.appendingPathComponent(journals[j].id + "-" + journals[j].items[i].id + ".json")
                    guard let data = try? Data(contentsOf: receipt), data.count < 16384,
                          let object = try? JSONSerialization.jsonObject(with: data) as? [String: String], let path = object["path"],
                          let snapshot = try? ApplicationFiles.snapshot(path), snapshot == journals[j].items[i].snapshot else { continue }
                    journals[j].items[i].trashPath = path; journals[j].items[i].trashSnapshot = snapshot; journals[j].items[i].status = "trashed"
                } }

            }
        } catch { blocked = true; self.error = "appJournalError" }
    }
    public func refresh() async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do { applications = try await Task.detached { try ApplicationFiles.inventory() }.value; error = nil }
        catch { self.error = "appIncomplete" }
    }
    public func inspect(_ id: String) async {
        guard !busy, let app = applications.first(where: { $0.id == id }) else { return }; busy = true; defer { busy = false }
        let all = applications; plan = await Task.detached { ApplicationFiles.plan(app, all: all) }.value
    }
    public func dismissPlan() { if !busy { plan = nil } }
    public func reveal(_ id: String) { guard let item = plan?.items.first(where: { $0.id == id }) else { return }; NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: item.path)]) }
    private func save() throws {
        guard !blocked else { throw StorageFailure.invalidData }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let data = try JSONEncoder().encode(journals); guard data.count <= 16_777_216 else { throw StorageFailure.invalidData }
        let url = root.appendingPathComponent("journal.json"); try data.write(to: url, options: .atomic); try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
    public func apply(planID: String, itemIDs: Set<String>, reset: Bool, quit: Bool) async {
        guard !busy, !blocked, let plan, plan.id == planID, plan.app.blocked == nil, !itemIDs.isEmpty,
              itemIDs.isSubset(of: Set(plan.items.filter { $0.blocked == nil && (!reset || $0.kind != "bundle") }.map(\.id))) else { return }
        guard let helper = Bundle.main.resourceURL?.appendingPathComponent("native/viezan-fs"), FileManager.default.isExecutableFile(atPath: helper.path) else { error = "appHelperMissing"; return }
        busy = true; defer { busy = false }; error = nil
        var journal = ApplicationJournal(appName: plan.app.name, action: reset ? "reset" : "uninstall", items: plan.items.filter { itemIDs.contains($0.id) }.compactMap { item in item.snapshot.map { ApplicationJournal.Item(path: item.path, snapshot: $0) } })
        do {
            let running = NSWorkspace.shared.runningApplications.filter { $0.bundleURL?.path == plan.app.path || $0.bundleURL?.path.hasPrefix(plan.app.path + "/") == true }
            if !running.isEmpty {
                guard quit, running.allSatisfy({ $0.terminate() }) else { error = "appInUse"; return }
                let deadline = Date().addingTimeInterval(15)
                while running.contains(where: { !$0.isTerminated }), Date() < deadline { try await Task.sleep(for: .milliseconds(100)) }
                guard running.allSatisfy(\.isTerminated) else { error = "appInUse"; return }
            }
            // Full preflight precedes the first mutation. Repeat each snapshot at execution.
            for item in journal.items {
                try await Task.detached {
                    if (try? ApplicationPreferences.domain(for: item.path)) == nil { try ApplicationFiles.policy(item.path) }
                    guard try ApplicationFiles.snapshot(item.path) == item.snapshot else { throw StorageFailure.invalidData }
                    if (try? ApplicationPreferences.domain(for: item.path)) == nil { guard try !ApplicationFiles.inUse(item.path) else { throw StorageFailure.invalidData } }
                }.value
            }
            journals.insert(journal, at: 0); try save()
            for i in journal.items.indices {
                let item = journal.items[i]; let receipt = root.appendingPathComponent(journal.id + "-" + item.id + ".json")
                do {
                    if let domain = try? ApplicationPreferences.domain(for: item.path) {
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
                    let result = try await Task.detached {
                        try ApplicationFiles.policy(item.path)
                        guard try ApplicationFiles.snapshot(item.path) == item.snapshot, try !ApplicationFiles.inUse(item.path) else { throw StorageFailure.invalidData }
                        return try NativeCommand.run(helper, ["trash", item.path, String(item.snapshot.device), String(item.snapshot.inode), receipt.path])
                    }.value
                    guard result.status == 0, let object = try JSONSerialization.jsonObject(with: result.output) as? [String: String], let path = object["path"] else { throw StorageFailure.invalidData }
                    journal.items[i].trashPath = path; journal.items[i].trashSnapshot = try await Task.detached { try ApplicationFiles.snapshot(path) }.value; journal.items[i].status = "trashed"
                } catch { journal.items[i].status = "failed"; journal.items[i].issue = "appActionError"; self.error = "appActionError" }
                journals[0] = journal; try save()
                if journal.items[i].status == "failed" { break }
            }
            self.plan = nil
            applications = try await Task.detached { try ApplicationFiles.inventory() }.value
        } catch { self.error = "appActionError" }
    }
    public func undo(_ id: String) async {
        guard !busy, !blocked, let j = journals.firstIndex(where: { $0.id == id }), let helper = Bundle.main.resourceURL?.appendingPathComponent("native/viezan-fs") else { return }
        busy = true; defer { busy = false }
        for i in journals[j].items.indices.reversed() {
            let item = journals[j].items[i]
            if let domain = item.preferenceDomain, let filename = item.preferenceBackup, ["preferencesRemoved", "preferencesBackedUp", "failed"].contains(item.status) {
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
                let trash = try FileManager.default.url(for: .trashDirectory, in: .userDomainMask, appropriateFor: URL(fileURLWithPath: item.path).deletingLastPathComponent(), create: false).resolvingSymlinksInPath().path
                guard ApplicationFiles.within(path, trash), path != trash else { throw StorageFailure.invalidData }
                try await Task.detached {
                    try ApplicationFiles.policy(item.path, missing: true)
                    guard try ApplicationFiles.snapshot(path) == snapshot else { throw StorageFailure.invalidData }
                    let result = try NativeCommand.run(helper, ["restore", path, item.path, String(snapshot.device), String(snapshot.inode)])
                    guard result.status == 0 else { throw StorageFailure.invalidData }
                }.value
                journals[j].items[i].status = "restored"; try save()
            } catch { self.error = "appActionError"; return }
        }
        do { applications = try await Task.detached { try ApplicationFiles.inventory() }.value; plan = nil } catch { self.error = "appIncomplete" }
    }
}

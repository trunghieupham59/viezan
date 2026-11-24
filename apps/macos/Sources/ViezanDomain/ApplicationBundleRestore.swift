import Darwin
import Foundation

/// Resolves Finder moves by inode, including partially completed bundle restores from 2.6.0.
struct ApplicationFinderRestore: Sendable {
    let original: String
    let trashed: String
    let intermediate: String
    let snapshot: ApplicationSnapshot
    let roots: [ApplicationInstallRoot]

    let systemItem: ApplicationSystemLibraryItem?
    let systemLibrary: String

    init(_ item: ApplicationJournal.Item, trash: String, roots: [ApplicationInstallRoot], systemLibrary: String) throws {
        let parent = (item.path as NSString).deletingLastPathComponent
        guard item.authenticated == true, item.isLink != true, !item.path.utf8.contains(0),
              item.snapshot == item.trashSnapshot, let path = item.trashPath,
              !path.utf8.contains(0), (path as NSString).deletingLastPathComponent == trash,
              !ApplicationFiles.within(parent, trash),
              try ApplicationFiles.canonical(parent) == parent else { throw StorageFailure.invalidData }
        if let systemItem = item.systemItem {
            var info = stat()
            let missing = lstat(item.path, &info) != 0 && errno == ENOENT
            try systemItem.validate(item.path, library: systemLibrary, missing: missing)
        } else {
            guard item.path.hasSuffix(".app"), path.hasSuffix(".app"),
                  roots.contains(where: { $0.allowsTrash(item.path, missing: true) }) else { throw StorageFailure.invalidData }
        }
        self.systemItem = item.systemItem
        self.systemLibrary = systemLibrary
        original = item.path
        trashed = path
        intermediate = (parent as NSString).appendingPathComponent((path as NSString).lastPathComponent)
        snapshot = item.snapshot
        self.roots = roots
    }

    func location() throws -> String {
        var match: String?
        for path in Set(systemItem == nil ? [original, trashed, intermediate] : [original, trashed]) {
            var info = stat()
            if lstat(path, &info) != 0 {
                guard errno == ENOENT else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
                continue
            }
            guard info.st_dev == snapshot.device, info.st_ino == snapshot.inode else { continue }
            guard match == nil, (systemItem != nil || info.st_mode & S_IFMT == S_IFDIR),
                  try ApplicationFiles.snapshot(path) == snapshot else { throw StorageFailure.invalidData }
            if path != trashed, systemItem == nil { try ApplicationFiles.policy(path, installRoots: roots) }
            match = path
        }
        guard let match else { throw StorageFailure.invalidData }
        return match
    }

    func restore(using finder: ApplicationFinder) throws {
        let source = try location()
        if source == original { return }
        if let systemItem {
            try systemItem.validate(original, library: systemLibrary, missing: true)
            // Never authorize a write into /Library based on a user-writable journal.
            // Finder owns the original location for Put Back. Ordinary data can be restored
            // without elevation by a single exclusive rename if the destination permits it.
            if systemItem.launchService { throw ApplicationActionFailure.restoreInFinder }
            guard renamex_np(source, original, UInt32(RENAME_EXCL)) == 0 else {
                let code = errno
                if code == EACCES || code == EPERM { throw ApplicationActionFailure.restoreInFinder }
                throw POSIXError(POSIXErrorCode(rawValue: code) ?? .EIO)
            }
            guard try location() == original else { throw StorageFailure.invalidData }
            return
        } else {
            try ApplicationFiles.policy(original, missing: true, installRoots: roots)
        }
        let result = try finder.restore(source, original)
        guard try ApplicationFiles.canonical(result) == original, try location() == original else { throw StorageFailure.invalidData }
    }
}

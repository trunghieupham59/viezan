import Foundation
import Darwin

func reject() throws -> Never { throw NSError(domain: "ViezanFiles", code: 1) }
// Foundation strips /private from some paths; use the same POSIX canonical form as Node.
func canonical(_ path: String) throws -> String {
    guard let resolved = Darwin.realpath(path, nil) else { try reject() }
    defer { free(resolved) }
    return String(cString: resolved)
}

// Pin the parent, and pass only one name to the *at calls. The leaf may be dangling.
class LinkEntry {
    let parent: String
    let name: String
    let fd: Int32

    init(_ path: String) throws {
        let bytes = path.utf8
        let separator = UInt8(ascii: "/")
        guard bytes.first == separator, let slash = bytes.lastIndex(of: separator) else { try reject() }
        parent = slash == bytes.startIndex ? "/" : String(decoding: bytes[..<slash], as: UTF8.self)
        name = String(decoding: bytes[bytes.index(after: slash)...], as: UTF8.self)
        guard !name.isEmpty, name != ".", name != "..", try canonical(parent) == parent else { try reject() }
        fd = open(parent, O_SEARCH | O_NOFOLLOW_ANY | O_CLOEXEC)
        guard fd >= 0 else { try reject() }
    }
    deinit { close(fd) }

    func verify(_ dev: String, _ ino: String) throws {
        var info = stat()
        guard fstatat(fd, name, &info, AT_SYMLINK_NOFOLLOW) == 0, info.st_mode & S_IFMT == S_IFLNK,
              String(info.st_dev) == dev, String(info.st_ino) == ino else { try reject() }
    }
    func isMissing() throws -> Bool {
        var info = stat()
        if fstatat(fd, name, &info, AT_SYMLINK_NOFOLLOW) == 0 { return false }
        guard errno == ENOENT else { try reject() }
        return true
    }
    func move(to destination: LinkEntry, dev: String, ino: String) throws {
        try verify(dev, ino)
        guard renameatx_np(fd, name, destination.fd, destination.name, UInt32(RENAME_EXCL)) == 0 else { try reject() }
        // Further moves require a verified identity, including any receipt rollback.
        try destination.verify(dev, ino)
    }
}

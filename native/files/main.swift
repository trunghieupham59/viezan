// Unprivileged file operations only. Main owns IDs, ownership, denylist, previews and journal.
import Foundation
import AppKit
import Darwin

let fm = FileManager.default
func reject() throws -> Never { throw NSError(domain: "ViezanFiles", code: 1) }
// Foundation strips /private from some paths; use the same POSIX canonical form as Node.
func canonical(_ path: String) throws -> String {
    guard let resolved = Darwin.realpath(path, nil) else { try reject() }
    defer { free(resolved) }
    return String(cString: resolved)
}
func verified(_ path: String, _ dev: String, _ ino: String) throws -> URL {
    guard try canonical(path) == path else { try reject() }
    var info = stat()
    guard lstat(path, &info) == 0, String(info.st_dev) == dev, String(info.st_ino) == ino,
          (info.st_mode & S_IFMT) != S_IFLNK else { try reject() }
    return URL(fileURLWithPath: path)
}
func emit(_ object: [String: Any]) throws {
    let data = try JSONSerialization.data(withJSONObject: object)
    FileHandle.standardOutput.write(data)
}
do {
    let args = Array(CommandLine.arguments.dropFirst())
    guard let command = args.first else { try reject() }
    switch command {
    case "trash":
        guard args.count == 5 else { try reject() }
        let source = try verified(args[1], args[2], args[3])
        var result: NSURL?
        try fm.trashItem(at: source, resultingItemURL: &result)
        guard let result else { try reject() }
        let trashedPath = try canonical(result.path ?? "")
        // Written by the helper, so a terminated Electron process can recover the result.
        let receipt = URL(fileURLWithPath: args[4])
        let data = try JSONSerialization.data(withJSONObject: ["path": trashedPath])
        try data.write(to: receipt, options: .atomic)
        try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: receipt.path)
        try emit(["path": trashedPath])
    case "restore":
        guard args.count == 5 else { try reject() }
        let source = try verified(args[1], args[3], args[4])
        let destination = args[2]
        let parent = (destination as NSString).deletingLastPathComponent
        // Never replace an existing path, even a dangling symlink; refuse changed ancestors.
        var info = stat()
        guard destination.hasPrefix("/"), !destination.split(separator: "/").contains(".."),
              lstat(destination, &info) != 0, errno == ENOENT,
              try canonical(parent) == parent else { try reject() }
        try fm.moveItem(atPath: source.path, toPath: destination)
        try emit(["path": destination])
    case "running", "quit":
        guard args.count == 2 else { try reject() }
        func applications() -> [NSRunningApplication] {
            NSWorkspace.shared.runningApplications.filter { app in
                guard let url = app.bundleURL else { return false }
                return url.path == args[1] || url.path.hasPrefix(args[1] + "/")
            }
        }
        if command == "quit" {
            for app in applications() { guard app.terminate() else { try reject() } }
            let deadline = Date().addingTimeInterval(15)
            while !applications().isEmpty && Date() < deadline {
                RunLoop.current.run(until: Date().addingTimeInterval(0.1))
            }
            guard applications().isEmpty else { try reject() }
        }
        try emit(["running": !applications().isEmpty])
    default: try reject()
    }
} catch {
    // No paths or personal metadata in diagnostics.
    let nsError = error as NSError
    FileHandle.standardError.write(Data("File operation refused: \(nsError.domain) \(nsError.code)\n".utf8))
    exit(1)
}

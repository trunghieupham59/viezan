import Foundation
import Darwin

public enum StorageFailure: Error { case invalidData }
@MainActor public protocol WorkspacePersistence {
    func load() throws -> Workspace?
    func save(_ workspace: Workspace) throws
}
@MainActor public final class FilePersistence: WorkspacePersistence {
    public let url: URL
    public init(url: URL) { self.url = url }
    public func load() throws -> Workspace? {
        if (try? FileManager.default.destinationOfSymbolicLink(atPath: url.path)) != nil { throw StorageFailure.invalidData }
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let properties = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
        guard properties.isRegularFile == true, properties.isSymbolicLink != true,
              let size = properties.fileSize, size > 0, size <= 134_217_728 else { throw StorageFailure.invalidData }
        return try JSONDecoder().decode(Workspace.self, from: Data(contentsOf: url)).upgrading().validated()
    }
    public func save(_ workspace: Workspace) throws {
        if (try? FileManager.default.destinationOfSymbolicLink(atPath: url.path)) != nil { throw StorageFailure.invalidData }
        _ = try workspace.validated()
        if FileManager.default.fileExists(atPath: url.path) {
            let properties = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
            guard properties.isRegularFile == true, properties.isSymbolicLink != true else { throw StorageFailure.invalidData }
        }
        let data = try JSONEncoder().encode(workspace)
        guard data.count <= 134_217_728 else { throw StorageFailure.invalidData }
        try Self.writePrivate(data, to: url)
    }
    /// Publish complete, mode-0600 data as the last fallible step. A thrown save leaves the old file in place.
    @discardableResult nonisolated static func writePrivate(_ data: Data, to url: URL, exclusive: Bool = false) throws -> stat {
        let directory = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        var template = Array(directory.appendingPathComponent(".viezan-XXXXXX").path.utf8CString)
        let descriptor = mkstemp(&template)
        guard descriptor >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        let temporary = String(cString: template)
        defer { unlink(temporary) }
        let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        try handle.write(contentsOf: data)
        var identity = stat()
        guard fstat(descriptor, &identity) == 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        try handle.close()
        let result = exclusive ? link(temporary, url.path) : rename(temporary, url.path)
        guard result == 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        return identity
    }
    nonisolated public static func previewURL() -> URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ViezanNativePreview", isDirectory: true).appendingPathComponent("workbench.json")
    }
}

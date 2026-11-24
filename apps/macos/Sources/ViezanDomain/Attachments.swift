import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

public struct ImageAttachment: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let mime: String
    /// Pixel size, read when the image is stored. Optional: attachments saved before have none.
    public var width: Int? = nil
    public var height: Int? = nil
    /// The image model that drew it ("openai:gpt-image-1"); nil for pictures a person attached.
    public var generator: String? = nil
    /// Same stored file: backups and imports match on identity, not on the optional details.
    public func sameFile(_ other: ImageAttachment) -> Bool { id == other.id && name == other.name && mime == other.mime }
}
public enum Attachments {
    static var directory: URL { FilePersistence.previewURL().deletingLastPathComponent().appendingPathComponent("attachments", isDirectory: true) }
    public static func quarantineUnreferenced(workspace: Workspace) throws {
        // Preserve content outside the live set for recovery; never follow links.
        let manager = FileManager.default
        guard manager.fileExists(atPath: directory.path) else { return }
        var referenced = Set<String>()
        for item in workspace.sessions {
            for image in item.images ?? [] { referenced.insert(image.id) }
            for message in item.messages { for image in message.images ?? [] { referenced.insert(image.id) } }
        }
        for task in workspace.tasks { for message in task.request.messages ?? [] { for image in message.images ?? [] { referenced.insert(image.id) } } }
        let recovery = directory.appendingPathComponent("recovery", isDirectory: true)
        for file in try manager.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.isSymbolicLinkKey, .isRegularFileKey, .contentModificationDateKey]) {
            let properties = try file.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey, .contentModificationDateKey])
            guard UUID(uuidString: file.lastPathComponent) != nil, !referenced.contains(file.lastPathComponent), properties.isRegularFile == true, properties.isSymbolicLink != true,
                  let changed = properties.contentModificationDate, Date().timeIntervalSince(changed) > 86400 else { continue }
            try manager.createDirectory(at: recovery, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            let target = recovery.appendingPathComponent(file.lastPathComponent)
            if !manager.fileExists(atPath: target.path) { try manager.moveItem(at: file, to: target) }
        }
    }
    public static func ingest(_ source: URL) throws -> ImageAttachment {
        let accessing = source.startAccessingSecurityScopedResource()
        defer { if accessing { source.stopAccessingSecurityScopedResource() } }
        let size = try source.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size > 0, size <= 20_000_000 else { throw ProviderFailure.oversizedResponse }
        return try ingest(try Data(contentsOf: source), name: source.lastPathComponent)
    }
    /// Pasted or dropped image bytes: the same limits and formats as a picked file.
    public static func ingest(_ data: Data, name: String) throws -> ImageAttachment {
        guard !data.isEmpty, data.count <= 20_000_000 else { throw ProviderFailure.oversizedResponse }
        guard let image = CGImageSourceCreateWithData(data as CFData, nil), let type = CGImageSourceGetType(image),
              let mime = UTType(type as String)?.preferredMIMEType, ["image/jpeg", "image/png", "image/webp", "image/gif"].contains(mime),
              let properties = CGImageSourceCopyPropertiesAtIndex(image, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int, let height = properties[kCGImagePropertyPixelHeight] as? Int,
              width > 0, height > 0, Double(width) * Double(height) <= 40_000_000 else { throw ProviderFailure.invalidResponse }
        let attachment = ImageAttachment(id: UUID().uuidString, name: name, mime: mime, width: width, height: height)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let destination = directory.appendingPathComponent(attachment.id)
        try data.write(to: destination, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: destination.path)
        return attachment
    }
    public static func data(_ attachment: ImageAttachment) throws -> Data {
        guard UUID(uuidString: attachment.id) != nil, ["image/jpeg", "image/png", "image/webp", "image/gif"].contains(attachment.mime) else { throw ProviderFailure.invalidResponse }
        let live = directory.appendingPathComponent(attachment.id)
        let url = FileManager.default.fileExists(atPath: live.path) ? live : directory.appendingPathComponent("recovery").appendingPathComponent(attachment.id)
        return try readFile(url)
    }
    private static func readFile(_ url: URL) throws -> Data {
        let properties = try url.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey, .fileSizeKey])
        guard properties.isSymbolicLink != true, properties.isRegularFile == true, let size = properties.fileSize, size <= 20_000_000 else { throw ProviderFailure.invalidResponse }
        return try Data(contentsOf: url)
    }
    public static func captureScreen() throws -> ImageAttachment {
        try withCapturedScreen(ingest)
    }
    public static func captureScreenText() throws -> String {
        try withCapturedScreen { url in
            let data = try Data(contentsOf: url, options: .alwaysMapped)
            guard !data.isEmpty, data.count <= 20_000_000 else { throw ProviderFailure.oversizedResponse }
            return try recognize(data)
        }
    }
    private static func withCapturedScreen<Result>(_ read: (URL) throws -> Result) throws -> Result {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension("png")
        defer { try? FileManager.default.removeItem(at: url) }
        let process = Process(); process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        process.arguments = ["-i", "-x", "-t", "png", url.path]
        process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
        try process.run(); process.waitUntilExit()
        guard process.terminationStatus == 0, FileManager.default.fileExists(atPath: url.path) else { throw CancellationError() }
        return try read(url)
    }
    struct InstalledFile {
        let url: URL
        let identity: stat

        func discard() throws {
            var current = stat()
            if lstat(url.path, &current) != 0 {
                if errno == ENOENT { return }
                throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
            }
            guard current.st_dev == identity.st_dev, current.st_ino == identity.st_ino else { throw StorageFailure.invalidData }
            guard unlink(url.path) == 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        }
    }
    /// Only a file created by this call belongs to the import's rollback.
    static func restore(_ attachment: ImageAttachment, data: Data, in directory: URL) throws -> InstalledFile? {
        guard UUID(uuidString: attachment.id) != nil, data.count <= 20_000_000 else { throw StorageFailure.invalidData }
        let url = directory.appendingPathComponent(attachment.id)
        if FileManager.default.fileExists(atPath: url.path) {
            guard try readFile(url) == data else { throw StorageFailure.invalidData }
            return nil
        }
        do {
            let identity = try FilePersistence.writePrivate(data, to: url, exclusive: true)
            return InstalledFile(url: url, identity: identity)
        } catch let error as POSIXError where error.code == .EEXIST {
            guard try readFile(url) == data else { throw StorageFailure.invalidData }
            return nil
        }
    }
    public static func recognize(_ attachment: ImageAttachment) throws -> String {
        try recognize(data(attachment))
    }
    public static func recognize(_ data: Data) throws -> String {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate; request.usesLanguageCorrection = true
        request.automaticallyDetectsLanguage = true
        try VNImageRequestHandler(data: data, options: [:]).perform([request])
        return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    }
}

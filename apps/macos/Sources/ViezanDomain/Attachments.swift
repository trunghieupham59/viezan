import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

public struct ImageAttachment: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let mime: String
}
public enum Attachments {
    private static var directory: URL { FilePersistence.previewURL().deletingLastPathComponent().appendingPathComponent("attachments", isDirectory: true) }
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
        let data = try Data(contentsOf: source)
        guard data.count <= 20_000_000, let image = CGImageSourceCreateWithData(data as CFData, nil), let type = CGImageSourceGetType(image),
              let mime = UTType(type as String)?.preferredMIMEType, ["image/jpeg", "image/png", "image/webp", "image/gif"].contains(mime),
              let properties = CGImageSourceCopyPropertiesAtIndex(image, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int, let height = properties[kCGImagePropertyPixelHeight] as? Int,
              width > 0, height > 0, Double(width) * Double(height) <= 40_000_000 else { throw ProviderFailure.invalidResponse }
        let attachment = ImageAttachment(id: UUID().uuidString, name: source.lastPathComponent, mime: mime)
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
        let properties = try url.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey, .fileSizeKey])
        guard properties.isSymbolicLink != true, properties.isRegularFile == true, let size = properties.fileSize, size <= 20_000_000 else { throw ProviderFailure.invalidResponse }
        return try Data(contentsOf: url)
    }
    public static func captureScreen() throws -> ImageAttachment {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension("png")
        defer { try? FileManager.default.removeItem(at: url) }
        let process = Process(); process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        process.arguments = ["-i", "-x", "-t", "png", url.path]
        process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
        try process.run(); process.waitUntilExit()
        guard process.terminationStatus == 0, FileManager.default.fileExists(atPath: url.path) else { throw CancellationError() }
        return try ingest(url)
    }
    static func restore(_ attachment: ImageAttachment, data: Data) throws {
        guard UUID(uuidString: attachment.id) != nil, data.count <= 20_000_000 else { throw StorageFailure.invalidData }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let url = directory.appendingPathComponent(attachment.id)
        if FileManager.default.fileExists(atPath: url.path) {
            guard try self.data(attachment) == data else { throw StorageFailure.invalidData }
            return
        }
        try data.write(to: url, options: [.withoutOverwriting])
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
    public static func recognize(_ attachment: ImageAttachment) throws -> String {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate; request.usesLanguageCorrection = true
        request.automaticallyDetectsLanguage = true
        try VNImageRequestHandler(data: data(attachment), options: [:]).perform([request])
        return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    }
}

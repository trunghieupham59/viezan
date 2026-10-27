import Foundation
import Darwin

enum ApplicationPreferences {
    static func domain(for path: String) throws -> String {
        let root = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Preferences").path
        let url = URL(fileURLWithPath: path), domain = url.deletingPathExtension().lastPathComponent
        guard url.deletingLastPathComponent().path == root, url.pathExtension == "plist",
              domain.range(of: "^[A-Za-z0-9][A-Za-z0-9.-]{2,199}$", options: .regularExpression) != nil, domain.contains("."),
              !domain.lowercased().hasPrefix("com.apple."), !domain.lowercased().contains("viezan") else { throw StorageFailure.invalidData }
        return domain
    }
    static func export(_ domain: String, to destination: URL) throws {
        let path = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Preferences/" + domain + ".plist").path
        _ = try self.domain(for: path)
        guard !FileManager.default.fileExists(atPath: destination.path) else { throw StorageFailure.invalidData }
        let result = try NativeCommand.run(URL(fileURLWithPath: "/usr/bin/defaults"), ["export", domain, destination.path], timeout: 15)
        guard result.status == 0 else { throw StorageFailure.invalidData }
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: destination.path)
        _ = try content(destination)
    }
    static func content(_ url: URL) throws -> NSDictionary {
        let info = try url.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey, .fileSizeKey])
        guard info.isRegularFile == true, info.isSymbolicLink != true, let size = info.fileSize, size <= 1_048_576,
              let value = try PropertyListSerialization.propertyList(from: Data(contentsOf: url), options: [], format: nil) as? NSDictionary else { throw StorageFailure.invalidData }
        return value
    }
    static func absent(_ domain: String) throws -> Bool {
        let file = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Preferences/" + domain + ".plist")
        _ = try self.domain(for: file.path)
        let result = try NativeCommand.run(URL(fileURLWithPath: "/usr/bin/defaults"), ["read", domain], timeout: 15)
        if result.status == 0 {
            guard String(decoding: result.output, as: UTF8.self).range(of: "^\\s*\\{\\s*\\}\\s*$", options: .regularExpression) != nil else { return false }
            if !FileManager.default.fileExists(atPath: file.path) { return true }
            return try content(file).count == 0
        }
        let diagnostic = String(decoding: result.diagnostics, as: UTF8.self)
        var info = stat(); let missing = lstat(file.path, &info) != 0 && errno == ENOENT
        guard missing, result.status == 1, diagnostic.contains("Domain '\(domain)' not found") || diagnostic.contains("Domain \(domain) does not exist") else { throw StorageFailure.invalidData }; return true
    }
    static func remove(_ domain: String) throws {
        let result = try NativeCommand.run(URL(fileURLWithPath: "/usr/bin/defaults"), ["delete", domain], timeout: 15)
        guard result.status == 0, try absent(domain) else { throw StorageFailure.invalidData }
    }
    static func restore(_ domain: String, from source: URL) throws {
        guard try absent(domain) else { throw StorageFailure.invalidData }; let before = try content(source)
        let result = try NativeCommand.run(URL(fileURLWithPath: "/usr/bin/defaults"), ["import", domain, source.path], timeout: 15)
        guard result.status == 0 else { throw StorageFailure.invalidData }
        let verification = source.deletingLastPathComponent().appendingPathComponent(UUID().uuidString + ".plist")
        defer { try? FileManager.default.removeItem(at: verification) }
        try export(domain, to: verification); guard before.isEqual(try content(verification)) else { throw StorageFailure.invalidData }
    }
}

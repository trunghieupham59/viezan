import Foundation
import CryptoKit
import Observation
import AppKit

private final class ReleaseRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    static func allowed(_ url: URL?) -> Bool {
        guard let url, url.scheme == "https", url.user == nil, url.password == nil, url.port == nil || url.port == 443 else { return false }
        return ["api.github.com", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"].contains(url.host?.lowercased() ?? "")
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) { completionHandler(Self.allowed(request.url) ? request : nil) }
}
public struct NativeRelease: Sendable {
    public let version: String
    public let notes: String
    public let page: URL
    let package: URL
    let manifest: URL
    let name: String
}
@MainActor @Observable public final class NativeUpdates {
    public private(set) var release: NativeRelease?
    public private(set) var busy = false
    public private(set) var status = ""
    public private(set) var progress: Double = 0
    public private(set) var downloaded: URL?
    @ObservationIgnored private var worker: Task<Void, Never>?
    @ObservationIgnored private var generation = UUID()
    public init() {}
    public func cancel() { generation = UUID(); worker?.cancel(); worker = nil; busy = false; progress = 0 }
    public func check() {
        guard !busy else { return }; busy = true; status = ""; downloaded = nil; release = nil; let epoch = UUID(); generation = epoch
        let current = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
        worker = Task {
            do {
                let value = try await Self.fetchRelease(current: current); try Task.checkCancellation()
                guard generation == epoch else { return }; release = value; status = value == nil ? "updateCurrent" : "updateAvailable"
            } catch { if !Task.isCancelled, generation == epoch { status = "updateError" } }
            if generation == epoch { busy = false; worker = nil }
        }
    }
    public func download() {
        guard !busy, let release else { return }; busy = true; downloaded = nil; progress = 0; status = ""; let epoch = UUID(); generation = epoch
        worker = Task {
            do {
                let url = try await Self.downloadRelease(release) { [weak self] value in await MainActor.run { if self?.generation == epoch { self?.progress = value } } }
                try Task.checkCancellation(); guard generation == epoch else { return }; downloaded = url; status = "updateReady"
            } catch { if !Task.isCancelled, generation == epoch { status = "updateError" } }
            if generation == epoch { busy = false; worker = nil }
        }
    }
    public func openInstaller() { if let downloaded { NSWorkspace.shared.open(downloaded) } }
    private nonisolated static func session() -> URLSession {
        let config = URLSessionConfiguration.ephemeral; config.timeoutIntervalForRequest = 30; config.timeoutIntervalForResource = 1800
        return URLSession(configuration: config, delegate: ReleaseRedirect(), delegateQueue: nil)
    }
    private nonisolated static func bytes(_ url: URL, limit: Int) async throws -> Data {
        guard ReleaseRedirect.allowed(url) else { throw CloudFailure.invalidResponse }
        let session = session(); defer { session.invalidateAndCancel() }
        var request = URLRequest(url: url); request.setValue("Viezan-Native", forHTTPHeaderField: "User-Agent")
        let (stream, response) = try await session.bytes(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw CloudFailure.network }
        var result = Data(); for try await byte in stream { try Task.checkCancellation(); guard result.count < limit else { throw CloudFailure.invalidResponse }; result.append(byte) }; return result
    }
    private nonisolated static func fetchRelease(current: String) async throws -> NativeRelease? {
        let data = try await bytes(URL(string: "https://api.github.com/repos/trunghieupham59/viezan/releases/latest")!, limit: 2_097_152)
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any], object["draft"] as? Bool == false, object["prerelease"] as? Bool == false,
              let tag = object["tag_name"] as? String, let assets = object["assets"] as? [[String: Any]] else { throw CloudFailure.invalidResponse }
        let version = tag.hasPrefix("v") ? String(tag.dropFirst()) : tag
        guard version.range(of: "^[0-9]+\\.[0-9]+\\.[0-9]+$", options: .regularExpression) != nil else { throw CloudFailure.invalidResponse }
        guard version.compare(current, options: .numeric) == .orderedDescending else { return nil }
        #if arch(arm64)
        let architecture = "arm64"
        #else
        let architecture = "x64"
        #endif
        let prefix = "Viezan-\(version)-darwin-\(architecture)"
        func asset(_ name: String) -> URL? {
            guard let item = assets.first(where: { $0["name"] as? String == name }), let raw = item["browser_download_url"] as? String, let url = URL(string: raw), ReleaseRedirect.allowed(url), url.host == "github.com", url.path.hasPrefix("/trunghieupham59/viezan/releases/download/") else { return nil }; return url
        }
        guard let package = asset(prefix + ".dmg"), let manifest = asset(prefix + ".json") else { throw CloudFailure.invalidResponse }
        return NativeRelease(version: version, notes: String((object["body"] as? String ?? "").prefix(65536)), page: URL(string: "https://github.com/trunghieupham59/viezan/releases")!, package: package, manifest: manifest, name: prefix + ".dmg")
    }
    private nonisolated static func downloadRelease(_ release: NativeRelease, progress: @escaping @Sendable (Double) async -> Void) async throws -> URL {
        let data = try await bytes(release.manifest, limit: 65536)
        guard let manifest = try JSONSerialization.jsonObject(with: data) as? [String: Any], manifest["version"] as? String == release.version,
              let item = (manifest["artifacts"] as? [[String: Any]])?.first(where: { $0["name"] as? String == release.name }), let size = item["size"] as? Int64, size > 0, size <= 2_147_483_648,
              let hash = item["sha256"] as? String, hash.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw CloudFailure.invalidResponse }
        let directory = FilePersistence.previewURL().deletingLastPathComponent().appendingPathComponent("updates").appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let destination = directory.appendingPathComponent(release.name); var completed = false
        defer { if !completed { try? FileManager.default.removeItem(at: directory) } }
        guard FileManager.default.createFile(atPath: destination.path, contents: nil, attributes: [.posixPermissions: 0o600]) else { throw StorageFailure.invalidData }
        let handle = try FileHandle(forWritingTo: destination); defer { try? handle.close() }
        let session = session(); defer { session.invalidateAndCancel() }
        let (stream, response) = try await session.bytes(from: release.package)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw CloudFailure.network }
        var digest = SHA256(), count: Int64 = 0, buffer = Data()
        for try await byte in stream {
            try Task.checkCancellation(); count += 1; guard count <= size else { throw CloudFailure.invalidResponse }; buffer.append(byte)
            if buffer.count >= 65536 { digest.update(data: buffer); try handle.write(contentsOf: buffer); buffer.removeAll(keepingCapacity: true); await progress(Double(count)/Double(size)) }
        }
        if !buffer.isEmpty { digest.update(data: buffer); try handle.write(contentsOf: buffer) }
        try handle.synchronize()
        guard count == size, digest.finalize().map({ String(format: "%02x", $0) }).joined() == hash else { throw CloudFailure.invalidResponse }
        // The package is verified before opening. Gatekeeper remains responsible for
        // the installed app's Developer ID; the currently running bundle is untouched.
        completed = true; await progress(1); return destination
    }
}

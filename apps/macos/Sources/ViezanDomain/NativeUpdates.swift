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
    /// The package's size in bytes, from the release listing (nil when the listing omits it).
    public let size: Int64?
    let package: URL
    let manifest: URL
    let signature: URL
    let name: String
}
@MainActor @Observable public final class NativeUpdates {
    public private(set) var release: NativeRelease?
    public private(set) var busy = false
    public private(set) var status = ""
    public private(set) var progress: Double = 0
    public private(set) var downloaded: URL?
    /// True while the downloaded app is being put in place; this step cannot be cancelled.
    public private(set) var installing = false
    /// The verified package can replace the running app without the user handling the disk image.
    public var canInstall: Bool { downloaded != nil && Self.installTarget() != nil }
    /// When the last check finished (seconds since 1970), for "Đã kiểm tra 8 phút trước". Not saved.
    public private(set) var checkedAt: Double?
    @ObservationIgnored private var downloadStarted: Double?
    /// Estimated seconds left in the download ("khoảng 20 giây nữa"); nil until it can be told.
    public var remainingSeconds: Double? {
        guard busy, let downloadStarted else { return nil }
        return Self.remaining(elapsed: Date().timeIntervalSince1970 - downloadStarted, fraction: progress)
    }
    /// Linear estimate from the time so far; none before 2 % or the first second (too noisy).
    public nonisolated static func remaining(elapsed: Double, fraction: Double) -> Double? {
        guard elapsed >= 1, fraction >= 0.02, fraction < 1 else { return nil }
        return elapsed * (1 - fraction) / fraction
    }
    /// Viezan's own Ed25519 update key (base64 of the raw public key). The release workflow signs each
    /// manifest with the private half, so an update is trusted without an Apple or Microsoft certificate.
    public nonisolated static let signingKey = "aZpQFhJBvVltlekF09R2lM6OdOIBhKmpGXzVfnWvtWg="
    /// True when `signature` (the `.json.sig` asset: base64 of a raw Ed25519 signature) signs exactly `manifest`.
    public nonisolated static func signed(_ manifest: Data, signature: Data, key: String = signingKey) -> Bool {
        guard let keyData = Data(base64Encoded: key), let publicKey = try? Curve25519.Signing.PublicKey(rawRepresentation: keyData),
              let text = String(data: signature, encoding: .utf8), let raw = Data(base64Encoded: text.trimmingCharacters(in: .whitespacesAndNewlines)) else { return false }
        return publicKey.isValidSignature(raw, for: manifest)
    }
    @ObservationIgnored private var worker: Task<Void, Never>?
    @ObservationIgnored private var generation = UUID()
    public init() {}
    public func cancel() { generation = UUID(); worker?.cancel(); worker = nil; busy = false; progress = 0 }
    public func check() {
        guard !busy, !installing else { return }; busy = true; status = ""; downloaded = nil; release = nil; let epoch = UUID(); generation = epoch
        let current = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
        worker = Task {
            do {
                let value = try await Self.fetchRelease(current: current); try Task.checkCancellation()
                guard generation == epoch else { return }; release = value; status = value == nil ? "updateCurrent" : "updateAvailable"; checkedAt = Date().timeIntervalSince1970
            } catch { if !Task.isCancelled, generation == epoch { status = "updateError" } }
            if generation == epoch { busy = false; worker = nil }
        }
    }
    public func download() {
        guard !busy, let release else { return }; busy = true; downloaded = nil; progress = 0; status = ""; downloadStarted = Date().timeIntervalSince1970; let epoch = UUID(); generation = epoch
        worker = Task {
            do {
                let url = try await Self.downloadRelease(release) { [weak self] value in await MainActor.run { if self?.generation == epoch { self?.progress = value } } }
                try Task.checkCancellation(); guard generation == epoch else { return }; downloaded = url; status = "updateReady"
            } catch { if !Task.isCancelled, generation == epoch { status = "updateError" } }
            if generation == epoch { busy = false; worker = nil }
        }
    }
    public func openInstaller() { if let downloaded { NSWorkspace.shared.open(downloaded) } }
    /// Replaces the running app with the downloaded one and arranges for it to open once this process exits.
    /// Returns true when the caller should quit now; on failure the package stays available to open by hand.
    public func install() async -> Bool {
        guard !busy, !installing, let downloaded, let release, let target = Self.installTarget() else { return false }
        installing = true; status = "updateInstalling"; defer { installing = false }
        do {
            let previous = try await Task.detached { try Self.replace(target, image: downloaded, version: release.version) }.value
            try Self.relaunch(target, removing: previous); return true
        } catch { status = "updateInstallError"; return false }
    }
    /// Where a self-install may replace the app: a real `.app` this user can write to, not a translocated or read-only copy.
    public nonisolated static func installTarget(_ bundle: URL = Bundle.main.bundleURL) -> URL? {
        let path = bundle.standardizedFileURL.path
        guard bundle.pathExtension == "app", !path.contains("/AppTranslocation/"),
              FileManager.default.isWritableFile(atPath: path), FileManager.default.isWritableFile(atPath: bundle.deletingLastPathComponent().path) else { return nil }
        return bundle
    }
    /// Copies the app out of the verified disk image and swaps it in. Returns the folder that now holds the previous app.
    nonisolated static func replace(_ target: URL, image: URL, version: String, identifier: String? = Bundle.main.bundleIdentifier) throws -> URL {
        let files = FileManager.default, hdiutil = URL(fileURLWithPath: "/usr/bin/hdiutil")
        let staging = try files.url(for: .itemReplacementDirectory, in: .userDomainMask, appropriateFor: target, create: true)
        // If the swap failed and the old app could not be moved back, it only exists in staging: keep that folder.
        var kept = false; defer { if !kept, files.fileExists(atPath: target.path) { try? files.removeItem(at: staging) } }
        let mount = staging.appendingPathComponent("image"), fresh = staging.appendingPathComponent("new.app")
        try files.createDirectory(at: mount, withIntermediateDirectories: false)
        guard try NativeCommand.run(hdiutil, ["attach", image.path, "-nobrowse", "-readonly", "-noautoopen", "-mountpoint", mount.path], timeout: 300).status == 0 else { throw StorageFailure.invalidData }
        do {
            defer { _ = try? NativeCommand.run(hdiutil, ["detach", mount.path, "-force"]) }
            try files.copyItem(at: mount.appendingPathComponent("Viezan.app"), to: fresh)
        }
        try swap(target, with: fresh, previous: staging.appendingPathComponent("previous.app"), version: version, identifier: identifier)
        kept = true; return staging
    }
    /// Moves `fresh` into place only when it is this app at `version`, and puts the old app back if the move fails.
    nonisolated static func swap(_ target: URL, with fresh: URL, previous: URL, version: String, identifier: String?) throws {
        guard let info = NSDictionary(contentsOf: fresh.appendingPathComponent("Contents/Info.plist")), info["CFBundleShortVersionString"] as? String == version,
              let found = info["CFBundleIdentifier"] as? String, found == identifier else { throw StorageFailure.invalidData }
        try FileManager.default.moveItem(at: target, to: previous)
        do { try FileManager.default.moveItem(at: fresh, to: target) }
        catch { try? FileManager.default.moveItem(at: previous, to: target); throw error }
    }
    /// The new app must start after this process is gone, or it would defer to the running instance and quit.
    nonisolated static func relaunch(_ target: URL, removing previous: URL, after pid: Int32 = ProcessInfo.processInfo.processIdentifier) throws {
        let process = Process(); process.executableURL = URL(fileURLWithPath: "/bin/sh")
        process.arguments = ["-c", "while kill -0 \"$1\" 2>/dev/null; do sleep 0.2; done; [ -d \"$3/previous.app\" ] && rm -rf \"$3\"; open \"$2\"", "viezan-update",
                             String(pid), target.path, previous.path]
        process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
        try process.run()
    }
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
        let packageSize = (assets.first(where: { $0["name"] as? String == prefix + ".dmg" })?["size"] as? NSNumber).map(\.int64Value).flatMap { $0 > 0 ? $0 : nil }
        func asset(_ name: String) -> URL? {
            guard let item = assets.first(where: { $0["name"] as? String == name }), let raw = item["browser_download_url"] as? String, let url = URL(string: raw), ReleaseRedirect.allowed(url), url.host == "github.com", url.path.hasPrefix("/trunghieupham59/viezan/releases/download/") else { return nil }; return url
        }
        guard let package = asset(prefix + ".dmg"), let manifest = asset(prefix + ".json"), let signature = asset(prefix + ".json.sig") else { throw CloudFailure.invalidResponse }
        return NativeRelease(version: version, notes: String((object["body"] as? String ?? "").prefix(65536)), page: URL(string: "https://github.com/trunghieupham59/viezan/releases")!, size: packageSize, package: package, manifest: manifest, signature: signature, name: prefix + ".dmg")
    }
    private nonisolated static func downloadRelease(_ release: NativeRelease, progress: @escaping @Sendable (Double) async -> Void) async throws -> URL {
        let data = try await bytes(release.manifest, limit: 65536)
        guard signed(data, signature: try await bytes(release.signature, limit: 1024)) else { throw CloudFailure.invalidResponse }
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

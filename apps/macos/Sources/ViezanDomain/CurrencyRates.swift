import Foundation
/// Rates against USD and the day the provider published them.
public struct CurrencySnapshot: Sendable, Equatable {
    public var rates: [String: Double]
    public var updated: Double
    public init(rates: [String: Double], updated: Double) { self.rates = rates; self.updated = updated }
    /// `amount` of `from` in `to`, with the rate for one unit; nil when either currency is missing.
    public func convert(_ amount: Double, from: String, to: String) -> (value: Double, rate: Double)? {
        guard let a = rates[from], let b = rates[to], (amount / a * b).isFinite else { return nil }
        return (amount / a * b, b / a)
    }
}
public actor CurrencyRates {
    public static let shared = CurrencyRates()
    private struct Snapshot: Codable, Sendable { var rates: [String: Double]; var updated: Double; var fetched: Double }
    private var snapshot: Snapshot?
    private var refreshTask: Task<Snapshot?, Never>?
    private var retryAfter: Double = 0
    private let file = FilePersistence.previewURL().deletingLastPathComponent().appendingPathComponent("currency.json")
    private static func valid(_ value: Snapshot) -> Bool {
        value.updated > 0 && value.updated <= Date().timeIntervalSince1970 + 86400 && value.updated.isFinite && value.fetched > 0 && value.fetched <= Date().timeIntervalSince1970 + 60 && value.rates.count <= 1000 && value.rates["USD"] == 1 && value.rates.allSatisfy { $0.key.range(of: "^[A-Z]{3}$", options: .regularExpression) != nil && $0.value.isFinite && $0.value > 0 }
    }
    /// Today's rates against USD: the cached day if fresh, otherwise one shared download.
    /// `retry` lifts the five-minute back-off after a failed download (the launcher's ↵ on "no rates").
    public func rates(retry: Bool = false) async -> CurrencySnapshot? {
        if snapshot == nil, let size = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 524288, let data = try? Data(contentsOf: file), let value = try? JSONDecoder().decode(Snapshot.self, from: data), Self.valid(value) { snapshot = value }
        let now = Date().timeIntervalSince1970
        if retry { retryAfter = 0 }
        if now - (snapshot?.fetched ?? 0) >= 86400 {
            if refreshTask == nil && now >= retryAfter {
                retryAfter = now + 300
                // Shared unstructured work survives cancellation of an obsolete search query.
                refreshTask = Task { try? await Self.fetch() }
            }
            if let pending = refreshTask {
                if let value = await pending.value {
                    snapshot = value
                    if let data = try? JSONEncoder().encode(value) {
                        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
                        try? data.write(to: file, options: .atomic); try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
                    }
                }
                refreshTask = nil
            }
        }
        return snapshot.map { CurrencySnapshot(rates: $0.rates, updated: $0.updated) }
    }
    private static func fetch() async throws -> Snapshot {
        let config = URLSessionConfiguration.ephemeral; config.timeoutIntervalForRequest = 8; config.timeoutIntervalForResource = 10
        let session = URLSession(configuration: config, delegate: NoRedirectDelegate(), delegateQueue: nil); defer { session.invalidateAndCancel() }
        let (bytes, response) = try await session.bytes(from: URL(string: "https://open.er-api.com/v6/latest/USD")!)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw CloudFailure.network }
        var data = Data(); for try await byte in bytes { try Task.checkCancellation(); guard data.count < 524288 else { throw CloudFailure.invalidResponse }; data.append(byte) }
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any], object["result"] as? String == "success", object["base_code"] as? String == "USD", let rates = object["rates"] as? [String: Double], let updated = object["time_last_update_unix"] as? Double else { throw CloudFailure.invalidResponse }
        let value = Snapshot(rates: rates, updated: updated, fetched: Date().timeIntervalSince1970); guard Self.valid(value) else { throw CloudFailure.invalidResponse }; return value
    }
}

import Foundation
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
    public func convert(_ query: String) async -> String? {
        guard query.utf8.count <= 128, let expression = try? NSRegularExpression(pattern: #"^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s+([A-Za-z]{3})\s+(?:to|in|=)\s+([A-Za-z]{3})\s*$"#, options: .caseInsensitive),
              let match = expression.firstMatch(in: query, range: NSRange(query.startIndex..., in: query)) else { return nil }
        let text = query as NSString
        guard let amount = Double(text.substring(with: match.range(at: 1))), amount.isFinite, abs(amount) <= 1e15 else { return nil }
        let from = text.substring(with: match.range(at: 2)).uppercased(), to = text.substring(with: match.range(at: 3)).uppercased()
        if snapshot == nil, let size = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 524288, let data = try? Data(contentsOf: file), let value = try? JSONDecoder().decode(Snapshot.self, from: data), Self.valid(value) { snapshot = value }
        let now = Date().timeIntervalSince1970
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
        guard let snapshot, let a = snapshot.rates[from], let b = snapshot.rates[to], (amount / a * b).isFinite else { return nil }
        let date = Date(timeIntervalSince1970: snapshot.updated).formatted(date: .numeric, time: .omitted)
        return amount.formatted() + " " + from + " = " + (amount / a * b).formatted(.number.precision(.fractionLength(0...6))) + " " + to + " · " + date
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

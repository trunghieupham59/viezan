import Foundation

public enum ModelCatalog {
    public static func models(provider: String) async throws -> [String] {
        if provider == "ollama" { return try await LocalProvider.models() }
        let local = ["lmstudio", "llamacpp"].contains(provider)
        guard local || ["openai", "claude", "gemini"].contains(provider) else { throw CloudFailure.invalidResponse }
        let key = local ? "" : (try? CredentialStore.read(provider))
        guard let key else { throw CloudFailure.missingKey }
        let endpoint = provider == "lmstudio" ? "http://127.0.0.1:1234/v1/models" : provider == "llamacpp" ? "http://127.0.0.1:8080/v1/models" : provider == "openai" ? "https://api.openai.com/v1/models" : provider == "claude" ? "https://api.anthropic.com/v1/models?limit=100" : "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000"
        let config = URLSessionConfiguration.ephemeral; config.timeoutIntervalForRequest = 30; config.timeoutIntervalForResource = 60
        if local { config.connectionProxyDictionary = [:] }
        let session = URLSession(configuration: config, delegate: NoRedirectDelegate(), delegateQueue: nil); defer { session.invalidateAndCancel() }
        var result: [String] = [], cursor: String?
        for _ in 0..<20 {
            try Task.checkCancellation()
            var components = URLComponents(string: endpoint)!
            if let cursor { components.queryItems = (components.queryItems ?? []) + [.init(name: provider == "claude" ? "after_id" : "pageToken", value: cursor)] }
            var request = URLRequest(url: components.url!)
            if !local { request.setValue(provider == "openai" ? "Bearer " + key : key, forHTTPHeaderField: provider == "openai" ? "Authorization" : provider == "claude" ? "x-api-key" : "x-goog-api-key") }
            if provider == "claude" { request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version") }
            let (bytes, response) = try await session.bytes(for: request)
            guard let status = (response as? HTTPURLResponse)?.statusCode else { throw CloudFailure.network }
            guard status == 200 else { throw CloudFailure.http(status) }
            var data = Data(); for try await byte in bytes { try Task.checkCancellation(); guard data.count < 4_194_304 else { throw ProviderFailure.oversizedResponse }; data.append(byte) }
            guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any], let rows = root[provider == "gemini" ? "models" : "data"] as? [[String: Any]] else { throw CloudFailure.invalidResponse }
            for row in rows {
                var id = row[provider == "gemini" ? "name" : "id"] as? String ?? ""
                if provider == "gemini" {
                    guard (row["supportedGenerationMethods"] as? [String] ?? []).contains("generateContent") else { continue }
                    if id.hasPrefix("models/") { id = String(id.dropFirst(7)) }
                }
                if NativeModel.valid(provider + ":" + id) { result.append(provider + ":" + id) }
            }
            let next = provider == "claude" && root["has_more"] as? Bool == true ? root["last_id"] as? String : root["nextPageToken"] as? String
            guard let next, !next.isEmpty, next != cursor else { return Array(Set(result)).sorted() }; cursor = next
        }
        throw CloudFailure.invalidResponse
    }
}

import Foundation
public enum ImageGeneration {
    /// Images are drawn by OpenAI or Gemini: the session's own provider when it can draw,
    /// otherwise any image provider this device has a key for (local AI cannot draw).
    public static func provider(for model: String, hasKey: (String) -> Bool = { CredentialStore.has($0) }) -> String? {
        let own = String(model.split(separator: ":", maxSplits: 1).first ?? "")
        if ["openai", "gemini"].contains(own), hasKey(own) { return own }
        return ["openai", "gemini"].first(where: hasKey)
    }
    /// The image model to call: the session's own image model, else the newest full-size image
    /// model the account lists (discovery), else a known default.
    static func imageModel(provider: String, selected: String, available: [String]) -> String {
        if provider == "openai" ? selected.hasPrefix("gpt-image-") : selected.contains("image") && !selected.hasPrefix("imagen") { return selected }
        let listed = available.filter { $0.hasPrefix(provider + ":") }.map { String($0.dropFirst(provider.count + 1)) }
            .filter { provider == "openai" ? $0.hasPrefix("gpt-image-") : $0.contains("image") && !$0.hasPrefix("imagen") }.sorted()
        return listed.last(where: { !$0.contains("mini") }) ?? listed.last ?? (provider == "openai" ? "gpt-image-1" : "gemini-3.1-flash-image-preview")
    }
    public static func generate(_ input: Request, available: [String] = []) async throws -> [ImageAttachment] {
        let parts = input.model.split(separator: ":", maxSplits: 1).map(String.init)
        guard input.input.utf8.count <= 32768 else { throw CloudFailure.invalidResponse }
        guard let provider = provider(for: input.model) else { throw CloudFailure.imageProviderMissing }
        // A chosen image model is kept only when it belongs to the provider that draws.
        let selected = parts.count == 2 && parts[0] == provider ? parts[1] : ""
        let model = imageModel(provider: provider, selected: selected, available: available)
        guard model.range(of: "^[A-Za-z0-9._-]+$", options: .regularExpression) != nil, let key = try? CredentialStore.read(provider) else { throw CloudFailure.missingKey }
        let images = input.messages?.last(where: { $0.role == "user" })?.images ?? []
        guard images.count <= 4 else { throw CloudFailure.invalidResponse }
        var request: URLRequest
        if provider == "gemini" {
            request = URLRequest(url: URL(string: "https://generativelanguage.googleapis.com/v1beta/models/\(model):generateContent")!)
            request.setValue(key, forHTTPHeaderField: "x-goog-api-key"); request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            var content: [[String: Any]] = [["text": input.input]]
            for image in images { content.append(["inlineData": ["mimeType": image.mime, "data": try Attachments.data(image).base64EncodedString()]]) }
            request.httpBody = try JSONSerialization.data(withJSONObject: ["contents": [["role": "user", "parts": content]], "generationConfig": ["responseModalities": ["TEXT", "IMAGE"]]])
        } else {
            request = URLRequest(url: URL(string: "https://api.openai.com/v1/images/" + (images.isEmpty ? "generations" : "edits"))!)
            request.setValue("Bearer " + key, forHTTPHeaderField: "Authorization")
            if images.isEmpty {
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try JSONSerialization.data(withJSONObject: ["model": model, "prompt": input.input, "n": 1, "size": "auto", "quality": "auto"])
            } else {
                let boundary = UUID().uuidString; request.setValue("multipart/form-data; boundary=" + boundary, forHTTPHeaderField: "Content-Type"); var body = Data()
                for (name, value) in [("model", model), ("prompt", input.input), ("n", "1"), ("size", "auto"), ("quality", "auto")] { body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".utf8)) }
                for image in images {
                    let ext = image.mime == "image/jpeg" ? "jpg" : image.mime == "image/webp" ? "webp" : "png"
                    body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"image[]\"; filename=\"image.\(ext)\"\r\nContent-Type: \(image.mime)\r\n\r\n".utf8)); body.append(try Attachments.data(image)); body.append(Data("\r\n".utf8))
                }
                body.append(Data("--\(boundary)--\r\n".utf8)); request.httpBody = body
            }
        }
        request.httpMethod = "POST"
        let config = URLSessionConfiguration.ephemeral; config.timeoutIntervalForRequest = 300; config.timeoutIntervalForResource = 600
        let session = URLSession(configuration: config, delegate: NoRedirectDelegate(), delegateQueue: nil); defer { session.invalidateAndCancel() }
        let (bytes, response) = try await session.bytes(for: request)
        guard let response = response as? HTTPURLResponse else { throw CloudFailure.network }; guard response.statusCode == 200 else { throw await ProviderRejection.from(status: response.statusCode, bytes: bytes) }
        var data = Data(); for try await byte in bytes { try Task.checkCancellation(); guard data.count < 64_000_000 else { throw ProviderFailure.oversizedResponse }; data.append(byte) }
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw CloudFailure.invalidResponse }
        var encoded: [(String, String)] = []
        if provider == "openai" { for item in object["data"] as? [[String: Any]] ?? [] { if let value = item["b64_json"] as? String { encoded.append((value, "image/png")) } } }
        else {
            for candidate in object["candidates"] as? [[String: Any]] ?? [] {
                for part in (candidate["content"] as? [String: Any])?["parts"] as? [[String: Any]] ?? [] {
                    if let inline = part["inlineData"] as? [String: String], let value = inline["data"], let mime = inline["mimeType"] { encoded.append((value, mime)) }
                }
            }
        }
        guard !encoded.isEmpty, encoded.count <= 4 else { throw CloudFailure.invalidResponse }
        return try encoded.map { encoded, mime in
            try Task.checkCancellation(); guard let bytes = Data(base64Encoded: encoded), !bytes.isEmpty, bytes.count <= 20_000_000, ["image/png", "image/jpeg", "image/webp"].contains(mime) else { throw CloudFailure.invalidResponse }
            let temporary = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".png")
            defer { try? FileManager.default.removeItem(at: temporary) }; try bytes.write(to: temporary, options: .atomic)
            return try Attachments.ingest(temporary)
        }
    }
}

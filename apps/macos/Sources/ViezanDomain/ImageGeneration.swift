import Foundation
public enum ImageGeneration {
    public static func generate(_ input: Request) async throws -> [ImageAttachment] {
        let parts = input.model.split(separator: ":", maxSplits: 1).map(String.init)
        guard parts.count == 2, ["openai", "gemini"].contains(parts[0]), input.input.utf8.count <= 32768 else { throw CloudFailure.invalidResponse }
        let provider = parts[0], selected = parts[1]
        let model = provider == "openai" ? (selected.hasPrefix("gpt-image-") ? selected : "gpt-image-1") : (selected.contains("image") ? selected : "gemini-3.1-flash-image-preview")
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
        guard let response = response as? HTTPURLResponse else { throw CloudFailure.network }; guard response.statusCode == 200 else { throw CloudFailure.http(response.statusCode) }
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

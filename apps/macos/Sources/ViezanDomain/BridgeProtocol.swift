import Foundation
import CryptoKit
import Security

struct BridgeHTTPRequest: Sendable {
    let method: String
    let path: String
    let headers: [String: String]
    let body: Data
    static func parse(_ data: Data) throws -> Self? {
        guard data.count <= 278_528 else { throw StorageFailure.invalidData }
        guard let boundary = data.range(of: Data("\r\n\r\n".utf8)) else {
            if data.count > 16_384 { throw StorageFailure.invalidData }; return nil
        }
        guard boundary.lowerBound <= 16_384, let header = String(data: data[..<boundary.lowerBound], encoding: .utf8), !header.contains("\0") else { throw StorageFailure.invalidData }
        let lines = header.components(separatedBy: "\r\n")
        let request = (lines.first ?? "").split(separator: " ")
        guard request.count == 3, ["GET", "POST", "OPTIONS"].contains(String(request[0])), ["HTTP/1.1", "HTTP/1.0"].contains(String(request[2])), request[1].hasPrefix("/"), !request[1].hasPrefix("//") else { throw StorageFailure.invalidData }
        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":"), line.first != " ", line.first != "\t" else { throw StorageFailure.invalidData }
            let key = line[..<colon].lowercased(), value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
            guard !key.isEmpty, headers[key] == nil, !value.contains("\r"), !value.contains("\n") else { throw StorageFailure.invalidData }; headers[key] = value
        }
        let hosts = ["127.0.0.1:39875", "localhost:39875", "[::1]:39875"]
        guard hosts.contains(headers["host"]?.lowercased() ?? ""), headers["transfer-encoding"] == nil,
              let size = Int(headers["content-length"] ?? (request[0] == "POST" ? "invalid" : "0")), size >= 0, size <= 262_144 else { throw StorageFailure.invalidData }
        let expected = boundary.upperBound + size
        if data.count < expected { return nil }
        guard data.count == expected else { throw StorageFailure.invalidData }
        return Self(method: String(request[0]), path: String(request[1]), headers: headers, body: Data(data[boundary.upperBound...]))
    }
    var origin: String? { headers["origin"] }
    var trustedOrigin: Bool {
        guard let origin else { return true }
        guard let url = URLComponents(string: origin), url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
              url.path.isEmpty || url.path == "/" else { return false }
        if url.scheme == "chrome-extension" { return url.host?.range(of: "^[a-p]{32}$", options: .regularExpression) != nil }
        return ["http", "https"].contains(url.scheme ?? "") && ["127.0.0.1", "localhost", "::1", "[::1]"].contains(url.host ?? "")
    }
}
public struct BridgeToken: Codable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let expiresAt: Double
    let digest: String
}
enum BridgeAuth {
    static func digest(_ value: String) -> String { SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined() }
    static func create(name: String, days: Int) throws -> (BridgeToken, String) {
        guard (1...365).contains(days), !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, name.count <= 80 else { throw StorageFailure.invalidData }
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw StorageFailure.invalidData }
        let secret = "sk-vie-" + bytes.map { String(format: "%02x", $0) }.joined()
        return (BridgeToken(id: UUID().uuidString, name: name, expiresAt: Date().timeIntervalSince1970 + Double(days) * 86400, digest: digest(secret)), secret)
    }
    static func valid(_ secret: String, tokens: [BridgeToken]) -> Bool {
        guard secret.range(of: "^sk-vie-[0-9a-f]{64}$", options: .regularExpression) != nil else { return false }
        let hash = Array(digest(secret).utf8), now = Date().timeIntervalSince1970
        return tokens.contains { token in
            let expected = Array(token.digest.utf8)
            guard token.expiresAt > now, expected.count == hash.count else { return false }
            return zip(expected, hash).reduce(UInt8(0)) { $0 | ($1.0 ^ $1.1) } == 0
        }
    }
}
public enum NativeTTS {
    public static func audio(_ text: String, voice: String = "", provider: String = "openai", language: String = "en") async throws -> Data {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.count <= 5000, ["openai", "gemini", "elevenlabs", "edge"].contains(provider) else { throw StorageFailure.invalidData }
        if provider == "edge" { return try await EdgeSpeech.audio(text, language: language, voice: voice) }
        let selected = voice.isEmpty ? (provider == "gemini" ? "Aoede" : provider == "elevenlabs" ? "pNInz6obpgDQGcFmaJgB" : "alloy") : voice
        guard selected.range(of: "^[A-Za-z0-9_-]{1,100}$", options: .regularExpression) != nil else { throw StorageFailure.invalidData }
        guard let key = try? CredentialStore.read(provider) else { throw CloudFailure.missingKey }
        let endpoint = provider == "gemini" ? "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent" : provider == "elevenlabs" ? "https://api.elevenlabs.io/v1/text-to-speech/" + selected : "https://api.openai.com/v1/audio/speech"
        var call = URLRequest(url: URL(string: endpoint)!)
        call.httpMethod = "POST"; call.setValue(provider == "openai" ? "Bearer " + key : key, forHTTPHeaderField: provider == "gemini" ? "x-goog-api-key" : provider == "elevenlabs" ? "xi-api-key" : "Authorization"); call.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any]
        if provider == "gemini" { body = ["contents": [["parts": [["text": text]]]], "generationConfig": ["responseModalities": ["AUDIO"], "speechConfig": ["voiceConfig": ["prebuiltVoiceConfig": ["voiceName": selected]]]]] }
        else if provider == "elevenlabs" { body = ["text": text, "model_id": "eleven_multilingual_v2"] }
        else { body = ["model": "tts-1", "input": text, "voice": selected, "response_format": "mp3"] }
        call.httpBody = try JSONSerialization.data(withJSONObject: body)
        let config = URLSessionConfiguration.ephemeral; config.timeoutIntervalForRequest = 60; config.timeoutIntervalForResource = 180
        let session = URLSession(configuration: config, delegate: NoRedirectDelegate(), delegateQueue: nil); defer { session.invalidateAndCancel() }
        let (bytes, response) = try await session.bytes(for: call)
        guard let response = response as? HTTPURLResponse else { throw CloudFailure.network }; guard response.statusCode == 200 else { throw CloudFailure.http(response.statusCode) }
        var result = Data()
        for try await byte in bytes { try Task.checkCancellation(); guard result.count < 16_777_216 else { throw ProviderFailure.oversizedResponse }; result.append(byte) }
        guard !result.isEmpty else { throw CloudFailure.invalidResponse }
        if provider == "gemini" {
            guard let root = try JSONSerialization.jsonObject(with: result) as? [String: Any], let candidate = (root["candidates"] as? [[String: Any]])?.first,
                  let content = candidate["content"] as? [String: Any], let inline = (content["parts"] as? [[String: Any]])?.compactMap({ $0["inlineData"] as? [String: Any] }).first,
                  let encoded = inline["data"] as? String, let data = Data(base64Encoded: encoded), !data.isEmpty else { throw CloudFailure.invalidResponse }
            let mime = inline["mimeType"] as? String ?? ""
            if mime.hasPrefix("audio/wav") { return data }
            guard (mime.hasPrefix("audio/L16") || mime.hasPrefix("audio/pcm")), mime.contains("rate=24000"), data.count % 2 == 0 else { throw CloudFailure.invalidResponse }
            var wave = Data("RIFF".utf8)
            func u32(_ value: UInt32) { var number = value.littleEndian; withUnsafeBytes(of: &number) { wave.append(contentsOf: $0) } }
            func u16(_ value: UInt16) { var number = value.littleEndian; withUnsafeBytes(of: &number) { wave.append(contentsOf: $0) } }
            u32(UInt32(data.count + 36)); wave.append(Data("WAVEfmt ".utf8)); u32(16); u16(1); u16(1); u32(24000); u32(48000); u16(2); u16(16); wave.append(Data("data".utf8)); u32(UInt32(data.count)); wave.append(data); return wave
        }
        return result
    }
}

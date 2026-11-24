import Foundation

public enum NativeModel {
    public static func valid(_ id: String) -> Bool {
        NativeResources.shared.fixtures.models.contains(id) ||
        (["ollama:", "lmstudio:", "llamacpp:", "openai:", "claude:", "gemini:"].contains(where: { id.hasPrefix($0) && id.count > $0.count }) && id.utf8.count <= 512 && !id.unicodeScalars.contains { CharacterSet.controlCharacters.contains($0) })
    }
}
public struct ProviderMessage: Codable, Equatable, Sendable {
    public var role: String
    public var content: String
    public var images: [ImageAttachment]?
    public init(role: String, content: String) { self.role = role; self.content = content }
}
public enum ProviderFailure: Error { case unavailable, invalidResponse, oversizedResponse }

// Fixed loopback transport; neither redirects nor user-controlled URLs can send prompts off-host.
private final class LocalSessionDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
public enum LocalProvider {
    private static func session() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 120
        config.timeoutIntervalForResource = 3600
        config.connectionProxyDictionary = [:]
        return URLSession(configuration: config, delegate: LocalSessionDelegate(), delegateQueue: nil)
    }
    /// Installed Ollama models with their size on disk in bytes (0 when the runtime gives none).
    public static func catalog() async throws -> [String: Int64] {
        let session = session()
        defer { session.invalidateAndCancel() }
        let (bytes, response) = try await session.bytes(from: URL(string: "http://127.0.0.1:11434/api/tags")!)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw ProviderFailure.unavailable }
        var data = Data()
        for try await byte in bytes {
            try Task.checkCancellation()
            guard data.count < 1_048_576 else { throw ProviderFailure.oversizedResponse }
            data.append(byte)
        }
        return try parseCatalog(data)
    }
    static func parseCatalog(_ data: Data) throws -> [String: Int64] {
        // A size of the wrong type must not hide the model: the list of names is what chat needs.
        struct Catalog: Decodable {
            struct Model: Decodable {
                let name: String; let size: Double?
                enum CodingKeys: String, CodingKey { case name, size }
                init(from decoder: Decoder) throws {
                    let values = try decoder.container(keyedBy: CodingKeys.self)
                    name = try values.decode(String.self, forKey: .name); size = try? values.decode(Double.self, forKey: .size)
                }
            }
            let models: [Model]
        }
        var sizes: [String: Int64] = [:]
        for model in try JSONDecoder().decode(Catalog.self, from: data).models where NativeModel.valid("ollama:" + model.name) {
            let bytes = model.size.flatMap { $0.isFinite && $0 > 0 && $0 < 1e15 ? Int64($0) : nil } ?? 0
            sizes["ollama:" + model.name] = max(sizes["ollama:" + model.name] ?? 0, bytes)
        }
        return sizes
    }
    public static func models() async throws -> [String] { try await catalog().keys.sorted() }
    public static func stream(_ request: Request, usage: @escaping @Sendable (TokenUsage) async -> Void = { _ in }, receive: @escaping @Sendable (String) async -> Void) async throws {
        guard !LocalPerformanceLease.occupied else { throw ProviderFailure.unavailable }
        struct Event: Decodable {
            struct Content: Decodable { let content: String? }
            let message: Content?
            let done: Bool?
            let error: String?
            let prompt_eval_count: Int?
            let eval_count: Int?
        }
        let messages = ProviderPrompt.messages(request)
        var call = URLRequest(url: URL(string: "http://127.0.0.1:11434/api/chat")!)
        call.httpMethod = "POST"
        call.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let payload: [[String: Any]] = try messages.map { message in
            var value: [String: Any] = ["role": message.role, "content": message.content]
            if let images = message.images, !images.isEmpty { value["images"] = try images.map { try Attachments.data($0).base64EncodedString() } }
            return value
        }
        call.httpBody = try JSONSerialization.data(withJSONObject: ["model": String(request.model.dropFirst(7)), "messages": payload, "stream": true, "options": LocalPerformance.options(request.model)])
        let session = session()
        defer { session.invalidateAndCancel() }
        let (bytes, response) = try await session.bytes(for: call)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw ProviderFailure.unavailable }
        var line = Data(), total = 0
        func consume(_ data: Data) async throws -> Bool {
            guard !data.isEmpty else { return false }
            let event = try JSONDecoder().decode(Event.self, from: data)
            guard event.error == nil else { throw ProviderFailure.unavailable }
            if let content = event.message?.content { await receive(content) }
            if event.done == true { let tokens = TokenUsage(input: event.prompt_eval_count ?? 0, output: event.eval_count ?? 0); if tokens.valid { await usage(tokens) } }; return event.done == true
        }
        for try await byte in bytes {
            try Task.checkCancellation()
            total += 1
            guard total <= 16_777_216, line.count < 1_048_576 else { throw ProviderFailure.oversizedResponse }
            if byte == 10 {
                if try await consume(line) { return }
                line.removeAll(keepingCapacity: true)
            } else { line.append(byte) }
        }
        if !line.isEmpty, try await consume(line) { return }
        throw ProviderFailure.invalidResponse // EOF without done must never appear successful.
    }
}

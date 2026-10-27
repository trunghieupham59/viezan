import Foundation
import Observation

@MainActor @Observable public final class LocalModelManager {
    public private(set) var busy = false
    public private(set) var progress: Double?
    public private(set) var status = ""
    public private(set) var error: String?
    @ObservationIgnored private var worker: Task<Void, Never>?
    @ObservationIgnored private var generation = UUID()
    public init() {}
    public func cancel() { generation = UUID(); worker?.cancel(); worker = nil; busy = false; status = "cancelled" }
    public func run(model: String, delete: Bool = false, completion: @escaping @MainActor () async -> Void) {
        guard !busy, !model.isEmpty, model.utf8.count <= 505, !model.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains) else { return }
        let owner = UUID(); generation = owner; busy = true; progress = nil; error = nil; status = "running"
        worker = Task { [weak self] in
            guard let manager = self else { return }
            do {
                try await LocalModelTransport.run(model: model, delete: delete) { status, progress in
                    await manager.update(owner, status: status, progress: progress)
                }
                guard let self, self.generation == owner else { return }
                self.busy = false; self.status = "succeeded"; self.worker = nil
                await completion()
            } catch {
                guard let self, self.generation == owner else { return }
                self.busy = false; self.error = Task.isCancelled ? nil : "providerError"; self.worker = nil
            }
        }
    }
    private func update(_ owner: UUID, status: String, progress: Double?) {
        guard generation == owner else { return }; self.status = status; self.progress = progress
    }
}
private enum LocalModelTransport {
    static func run(model: String, delete: Bool, receive: @escaping @Sendable (String, Double?) async -> Void) async throws {
        let config = URLSessionConfiguration.ephemeral
        config.connectionProxyDictionary = [:]; config.timeoutIntervalForRequest = 120; config.timeoutIntervalForResource = 86400
        let session = URLSession(configuration: config, delegate: NoRedirectDelegate(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        var call = URLRequest(url: URL(string: "http://127.0.0.1:11434/api/" + (delete ? "delete" : "pull"))!)
        call.httpMethod = delete ? "DELETE" : "POST"; call.setValue("application/json", forHTTPHeaderField: "Content-Type")
        call.httpBody = try JSONSerialization.data(withJSONObject: ["model": model, "stream": !delete])
        let (bytes, response) = try await session.bytes(for: call)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw ProviderFailure.unavailable }
        if delete { return }
        var line = Data()
        func consume(_ line: Data) async throws -> Bool {
            guard !line.isEmpty else { return false }
            guard let value = try JSONSerialization.jsonObject(with: line) as? [String: Any], value["error"] == nil else { throw ProviderFailure.invalidResponse }
            let status = value["status"] as? String ?? "running"
            let total = value["total"] as? Double ?? 0, completed = value["completed"] as? Double ?? 0
            await receive(status, total > 0 ? min(1, max(0, completed / total)) : nil)
            return status == "success"
        }
        for try await byte in bytes {
            try Task.checkCancellation()
            guard line.count < 1_048_576 else { throw ProviderFailure.oversizedResponse }
            if byte == 10 { if try await consume(line) { return }; line.removeAll(keepingCapacity: true) }
            else { line.append(byte) }
        }
        if !line.isEmpty, try await consume(line) { return }
        throw ProviderFailure.invalidResponse
    }
}

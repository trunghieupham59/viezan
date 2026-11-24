import Foundation
import Observation

@MainActor @Observable public final class LocalModelManager {
    public private(set) var busy = false
    public private(set) var progress: Double?
    public private(set) var downloading: String?
    /// Transfer across the layers reported in the current pull.
    public private(set) var transferred: (completed: Int64, total: Int64)?
    public private(set) var status = ""
    public private(set) var error: String?
    @ObservationIgnored private var worker: Task<Void, Never>?
    @ObservationIgnored private var generation = UUID()
    public init() {}
    public func cancel() { generation = UUID(); worker?.cancel(); worker = nil; busy = false; downloading = nil; progress = nil; transferred = nil; status = "cancelled" }
    public func run(model: String, delete: Bool = false, completion: @escaping @MainActor () async -> Void) {
        guard !busy, !model.isEmpty, model.utf8.count <= 505, !model.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains) else { return }
        let owner = UUID(); generation = owner; busy = true; progress = nil; transferred = nil; error = nil
        downloading = delete ? nil : model; status = delete ? "running" : "localPullPreparing"
        worker = Task { [weak self] in
            guard let manager = self else { return }
            do {
                try await LocalModelTransport.run(model: model, delete: delete) { step in
                    await manager.update(owner, step)
                }
                guard let self, self.generation == owner else { return }
                self.busy = false; self.downloading = nil; self.progress = nil; self.transferred = nil; self.status = "succeeded"; self.worker = nil
                await completion()
            } catch {
                guard let self, self.generation == owner else { return }
                self.busy = false; self.downloading = nil; self.progress = nil; self.transferred = nil; self.error = Task.isCancelled ? nil : "providerError"; self.worker = nil
            }
        }
    }
    private func update(_ owner: UUID, _ step: PullStep) {
        guard generation == owner else { return }
        status = step.statusKey; progress = step.fraction; transferred = step.total > 0 ? (step.completed, step.total) : nil
    }
}
/// One line of the runtime's pull stream. Sizes are bounded and never negative; a line without a
/// positive total carries no progress.
public struct PullStep: Equatable, Sendable {
    public var status: String
    public var completed: Int64
    public var total: Int64
    var digest: String?
    var statusKey: String {
        switch status {
        case "pulling manifest": "localPullPreparing"
        case "verifying sha256 digest": "localPullVerifying"
        case "writing manifest", "removing unused layers": "localPullFinishing"
        case "success": "succeeded"
        default: "localPullDownloading"
        }
    }
    public var fraction: Double? { total > 0 ? Double(completed) / Double(total) : nil }
    public static func parse(_ line: Data) throws -> PullStep {
        guard let value = try JSONSerialization.jsonObject(with: line) as? [String: Any], value["error"] == nil else { throw ProviderFailure.invalidResponse }
        func size(_ key: String) -> Int64 { (value[key] as? Double).flatMap { $0.isFinite && $0 > 0 && $0 < 1e15 ? Int64($0) : nil } ?? 0 }
        let total = size("total")
        return PullStep(status: value["status"] as? String ?? "running", completed: min(size("completed"), total), total: total, digest: value["digest"] as? String)
    }
}
struct PullProgress {
    private var layers: [String: (completed: Int64, total: Int64)] = [:]
    private var completed: Int64 = 0
    private var total: Int64 = 0
    private var exceededLimit = false

    mutating func consume(_ line: Data) throws -> PullStep {
        var step = try PullStep.parse(line)
        if let digest = step.digest, step.total > 0 {
            // Limit retained identifiers and keep sums of bounded layer sizes within Int64.
            if digest.utf8.count > 128 || digest.isEmpty || (layers[digest] == nil && layers.count >= 8192) { exceededLimit = true }
            if !exceededLimit {
                let previous = layers[digest] ?? (completed: 0, total: 0)
                let next = (completed: max(previous.completed, step.completed), total: max(previous.total, step.total))
                completed += next.completed - previous.completed
                total += next.total - previous.total
                layers[digest] = next
            }
        } else if step.total > 0 && !exceededLimit {
            return step
        }
        step.completed = exceededLimit ? 0 : completed
        step.total = exceededLimit ? 0 : total
        return step
    }
}

private enum LocalModelTransport {
    static func run(model: String, delete: Bool, receive: @escaping @Sendable (PullStep) async -> Void) async throws {
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
        var progress = PullProgress()
        func consume(_ line: Data) async throws -> Bool {
            guard !line.isEmpty else { return false }
            let step = try progress.consume(line)
            await receive(step)
            return step.status == "success"
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

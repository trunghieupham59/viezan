import Foundation
import Observation

enum LocalPerformanceLease {
    private final class State: @unchecked Sendable { let lock = NSLock(); var occupied = false }
    private static let state = State()
    static var occupied: Bool { state.lock.lock(); defer { state.lock.unlock() }; return state.occupied }
    static func set(_ value: Bool) { state.lock.lock(); defer { state.lock.unlock() }; state.occupied = value }
}

public struct LocalProfile: Codable, Equatable, Sendable {
    public var layers: Int
    public var context: Int
    public var valid: Bool { (1...999).contains(layers) && (512...32768).contains(context) }
}
public struct LocalMeasurement: Codable, Identifiable, Sendable {
    public var id: String
    public var profile: LocalProfile
    public var tokensPerSecond: Double?
    public var firstTokenMilliseconds: Double?
    public var gpuPercent: Double?
    public var error: String?
}
@MainActor @Observable public final class LocalPerformance {
    private struct Record: Codable { var results: [LocalMeasurement]; var selected: LocalProfile? }
    public private(set) var busy = false
    public private(set) var model = ""
    public private(set) var results: [LocalMeasurement] = []
    public private(set) var error: String?
    @ObservationIgnored private var worker: Task<Void, Never>?
    private nonisolated static var file: URL { FilePersistence.previewURL().deletingLastPathComponent().appendingPathComponent("local-performance.json") }
    private nonisolated static func load() -> [String: Record] {
        guard let size = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 4_194_304, let data = try? Data(contentsOf: file), let values = try? JSONDecoder().decode([String: Record].self, from: data), values.count <= 1000 else { return [:] }
        return values.filter { $0.key.hasPrefix("ollama:") && NativeModel.valid($0.key) && ($0.value.selected?.valid ?? true) }
    }
    public nonisolated static func options(_ model: String) -> [String: Int] {
        guard let selected = load()[model]?.selected, selected.valid else { return [:] }; return ["num_gpu": selected.layers, "num_ctx": selected.context]
    }
    private static func save(_ values: [String: Record]) throws {
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try JSONEncoder().encode(values).write(to: file, options: .atomic); try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
    }
    public init() {}
    public func selectModel(_ value: String) { guard !busy else { return }; model = value; results = Self.load()[value]?.results ?? []; error = nil }
    public func select(_ mode: String) {
        guard !busy, model.hasPrefix("ollama:") else { return }
        var values = Self.load(); var record = values[model] ?? Record(results: results)
        if mode == "auto" { record.selected = nil }
        else {
            guard let result = record.results.first(where: { $0.id == mode && $0.error == nil && ($0.tokensPerSecond ?? 0) > 0 }), result.profile.valid else { return }
            record.selected = result.profile
        }
        values[model] = record
        do { try Self.save(values) } catch { self.error = "runtimeStartError" }
    }
    public func cancel() { worker?.cancel() }
    public func compare() {
        guard !busy, model.hasPrefix("ollama:"), NativeModel.valid(model) else { return }
        let model = self.model; LocalPerformanceLease.set(true); busy = true; error = nil; results = []
        worker = Task {
            defer { LocalPerformanceLease.set(false) }
            let original = Self.load()[model]; var resident: [String: Any]?; var touched = false
            do {
                let tags = try await Self.json("tags")["models"] as? [[String: Any]] ?? []
                let name = String(model.dropFirst(7))
                guard tags.contains(where: { $0["name"] as? String == name }) else { throw ProviderFailure.invalidResponse }
                let running = try await Self.json("ps")["models"] as? [[String: Any]] ?? []
                guard running.allSatisfy({ $0["name"] as? String == name || $0["model"] as? String == name }) else { throw ProviderFailure.unavailable }; resident = running.first
                let info = try await Self.json("show", body: ["model": name])["model_info"] as? [String: Any] ?? [:]
                guard let blocks = info.first(where: { $0.key.hasSuffix(".block_count") })?.value as? Int, blocks >= 2, blocks <= 1998 else { throw ProviderFailure.invalidResponse }
                for mode in ["gpu", "hybrid"] {
                    try Task.checkCancellation(); let profile = LocalProfile(layers: mode == "gpu" ? 999 : max(1, blocks/2), context: 2048)
                    var result = LocalMeasurement(id: mode, profile: profile)
                    do {
                        touched = true; _ = try await Self.json("generate", body: ["model": name, "keep_alive": 0, "stream": false])
                        try await Task.sleep(for: .milliseconds(1500))
                        _ = try await Self.sample(name, profile: profile)
                        let a = try await Self.sample(name, profile: profile), b = try await Self.sample(name, profile: profile)
                        let residents = try await Self.json("ps")["models"] as? [[String: Any]] ?? []
                        guard let value = residents.first(where: { $0["name"] as? String == name || $0["model"] as? String == name }), let size = value["size"] as? Double, size > 0, let vram = value["size_vram"] as? Double else { throw ProviderFailure.invalidResponse }
                        let percent = min(100, vram/size*100)
                        guard mode == "gpu" ? percent >= 95 : percent > 0 && percent < 95 else { throw ProviderFailure.invalidResponse }
                        result.tokensPerSecond = (a.0+b.0)/2; result.firstTokenMilliseconds = (a.1+b.1)/2; result.gpuPercent = percent
                    } catch { try Task.checkCancellation(); result.error = "runtimeComparisonError" }
                    results.append(result)
                }
            } catch { if !Task.isCancelled { self.error = "runtimeComparisonError" } }
            if touched {
                // Restoration must still run after cancellation, on an independent task.
                let name = String(model.dropFirst(7)), context = resident?["context_length"] as? Int, restore = resident != nil
                let selected = original?.selected
                do { try await Task.detached {
                    _ = try await Self.json("generate", body: ["model": name, "keep_alive": 0, "stream": false])
                    if restore { var options: [String: Int] = [:]; if let selected { options = ["num_gpu": selected.layers, "num_ctx": selected.context] } else if let context { options["num_ctx"] = context }
                        _ = try await Self.json("generate", body: ["model": name, "prompt": "", "keep_alive": "30m", "stream": false, "options": options]) }
                }.value } catch { self.error = "runtimeRestoreError" }
            }
            if !Task.isCancelled && error == nil {
                var values = Self.load(); values[model] = Record(results: results, selected: original?.selected)
                do { try Self.save(values) } catch { self.error = "runtimeComparisonError" }
            }
            busy = false; worker = nil
        }
    }
    private nonisolated static func session() -> URLSession {
        let config = URLSessionConfiguration.ephemeral; config.connectionProxyDictionary = [:]; config.timeoutIntervalForRequest = 120; config.timeoutIntervalForResource = 180
        return URLSession(configuration: config, delegate: NoRedirectDelegate(), delegateQueue: nil)
    }
    private struct JSONValue: @unchecked Sendable { let value: [String: Any]; subscript(_ key: String) -> Any? { value[key] } }
    private nonisolated static func json(_ path: String, body: [String: Any]? = nil) async throws -> JSONValue {
        let session = session(); defer { session.invalidateAndCancel() }; var request = URLRequest(url: URL(string: "http://127.0.0.1:11434/api/" + path)!)
        if let body { request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (bytes, response) = try await session.bytes(for: request); guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw ProviderFailure.unavailable }
        var data = Data(); for try await byte in bytes { try Task.checkCancellation(); guard data.count < 4_194_304 else { throw ProviderFailure.oversizedResponse }; data.append(byte) }
        guard let result = try JSONSerialization.jsonObject(with: data) as? [String: Any], result["error"] == nil else { throw ProviderFailure.invalidResponse }; return JSONValue(value: result)
    }
    private nonisolated static func sample(_ model: String, profile: LocalProfile) async throws -> (Double, Double) {
        let session = session(); defer { session.invalidateAndCancel() }; var request = URLRequest(url: URL(string: "http://127.0.0.1:11434/api/generate")!)
        request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["model": model, "prompt": "Write the numbers 1 to 20 in order, separated by spaces. Output only the numbers.", "think": false, "stream": true, "keep_alive": "2m", "options": ["num_gpu": profile.layers, "num_ctx": profile.context, "num_predict": 96, "temperature": 0, "seed": 42]])
        let start = ContinuousClock.now; let (bytes, response) = try await session.bytes(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw ProviderFailure.unavailable }
        var line = Data(), total = 0, output = "", first: Double?, rate: Double?
        func consume() throws {
            guard !line.isEmpty else { return }; defer { line.removeAll(keepingCapacity: true) }
            guard let event = try JSONSerialization.jsonObject(with: line) as? [String: Any], event["error"] == nil else { throw ProviderFailure.invalidResponse }
            if let chunk = event["response"] as? String, !chunk.isEmpty { if first == nil { let elapsed = start.duration(to: .now).components; first = Double(elapsed.seconds)*1000 + Double(elapsed.attoseconds)/1e15 }; output += chunk }
            if event["done"] as? Bool == true, let count = event["eval_count"] as? Double, let duration = event["eval_duration"] as? Double, count > 0, duration > 0 { rate = count/duration*1e9 }
        }
        for try await byte in bytes { try Task.checkCancellation(); total += 1; guard total <= 1_048_576 else { throw ProviderFailure.oversizedResponse }; if byte == 10 { try consume() } else { line.append(byte) } }
        try consume()
        let regex = try NSRegularExpression(pattern: "\\b[0-9]+\\b"), value = output as NSString
        let numbers = regex.matches(in: output, range: NSRange(location: 0, length: value.length)).map { value.substring(with: $0.range) }.joined(separator: " ")
        guard numbers == (1...20).map(String.init).joined(separator: " "), let rate, rate.isFinite, let first else { throw ProviderFailure.invalidResponse }; return (rate, first)
    }
}

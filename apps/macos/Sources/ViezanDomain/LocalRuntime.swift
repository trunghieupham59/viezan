import Foundation
import Observation

@MainActor @Observable public final class LocalRuntime {
    public private(set) var owned = false
    public private(set) var available = false
    public private(set) var busy = false
    public private(set) var error: String?
    public private(set) var version = ""
    public let processors = ProcessInfo.processInfo.activeProcessorCount
    public let memory = ProcessInfo.processInfo.physicalMemory
    @ObservationIgnored private var process: Process?
    @ObservationIgnored private var generation = UUID()
    public init() {}
    public func refresh() async {
        let epoch = generation
        let result = await Self.probe()
        guard epoch == generation else { return }; available = result != nil; version = result ?? ""
    }
    public func start(parallel: Int, context: Int) async {
        guard !busy, !owned, [1, 2, 4].contains(parallel), [2048, 4096, 8192, 16384, 32768].contains(context) else { return }
        busy = true; error = nil; let epoch = UUID(); generation = epoch
        defer { if generation == epoch { busy = false } }
        if let value = await Self.probe() { guard generation == epoch else { return }; available = true; version = value; error = "runtimeExternal"; return }
        guard generation == epoch else { return }
        let candidates = ["/Applications/Ollama.app/Contents/Resources/ollama", "/opt/homebrew/bin/ollama", "/usr/local/bin/ollama"]
        guard let binary = candidates.first(where: FileManager.default.isExecutableFile(atPath:)) else { error = "runtimeMissing"; return }
        let value = Process(); value.executableURL = URL(fileURLWithPath: binary); value.arguments = ["serve"]
        value.environment = ["HOME": FileManager.default.homeDirectoryForCurrentUser.path, "TMPDIR": FileManager.default.temporaryDirectory.path, "PATH": "/usr/bin:/bin:/usr/sbin:/sbin", "OLLAMA_HOST": "127.0.0.1:11434", "OLLAMA_NO_CLOUD": "1", "OLLAMA_NUM_PARALLEL": String(parallel), "OLLAMA_CONTEXT_LENGTH": String(context)]
        value.standardInput = FileHandle.nullDevice; value.standardOutput = FileHandle.nullDevice; value.standardError = FileHandle.nullDevice
        value.terminationHandler = { [weak self] _ in Task { @MainActor in guard let self, self.generation == epoch else { return }; self.process = nil; self.owned = false; self.available = false; self.error = "runtimeStartError" } }
        do {
            try value.run(); process = value; owned = true
            for _ in 0..<20 {
                guard generation == epoch, value.isRunning else { return }
                if let version = await Self.probe() { guard generation == epoch, value.isRunning else { return }; self.version = version; available = true; return }
                try await Task.sleep(for: .milliseconds(500))
            }
            stop(); error = "runtimeStartError"
        } catch { guard generation == epoch else { return }; stop(); self.error = "runtimeStartError" }
    }
    public func stop() {
        generation = UUID(); busy = false
        if let process { process.terminationHandler = nil; if process.isRunning { process.terminate() } }
        process = nil; owned = false; available = false; version = ""
    }
    private nonisolated static func probe() async -> String? {
        let config = URLSessionConfiguration.ephemeral; config.connectionProxyDictionary = [:]; config.timeoutIntervalForRequest = 1; config.timeoutIntervalForResource = 2
        let session = URLSession(configuration: config, delegate: NoRedirectDelegate(), delegateQueue: nil); defer { session.invalidateAndCancel() }
        do {
            let (bytes, response) = try await session.bytes(from: URL(string: "http://127.0.0.1:11434/api/version")!)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
            var data = Data(); for try await byte in bytes { guard data.count < 65536 else { return nil }; data.append(byte) }
            return (try JSONSerialization.jsonObject(with: data) as? [String: String])?["version"]
        } catch { return nil }
    }
}

import Foundation
import Observation
@preconcurrency import Network

@MainActor @Observable public final class ExtensionBridge {
    public private(set) var listening = false
    public private(set) var tokens: [BridgeToken] = []
    public private(set) var error: String?
    public private(set) var revealedToken = ""
    public var model: String = ""
    public var voice = VoicePreferences()
    public var enabled = true { didSet { if !enabled { stop() } } }
    public var allowedOrigins: [String] = []
    @ObservationIgnored private var listener: NWListener?
    @ObservationIgnored private var clients: [UUID: NWConnection] = [:]
    @ObservationIgnored private var tasks: [UUID: Task<Void, Never>] = [:]
    @ObservationIgnored private var timeouts: [UUID: Task<Void, Never>] = [:]
    @ObservationIgnored private let file = FilePersistence.previewURL().deletingLastPathComponent().appendingPathComponent("extension-tokens.json")
    public init() {
        if FileManager.default.fileExists(atPath: file.path) {
            do { tokens = try JSONDecoder().decode([BridgeToken].self, from: Data(contentsOf: file)) }
            catch { self.error = "bridgeStorageError" }
        }
    }
    public func createToken(name: String, days: Int) {
        guard error != "bridgeStorageError" else { return }
        do {
            let (token, secret) = try BridgeAuth.create(name: name, days: days)
            let next = tokens.filter { $0.expiresAt > Date().timeIntervalSince1970 } + [token]
            try persist(next); tokens = next; revealedToken = secret; error = nil
        } catch { self.error = "bridgeStorageError" }
    }
    public func dismissToken() { revealedToken = "" }
    public func revoke(_ id: String) {
        do { let next = tokens.filter { $0.id != id }; try persist(next); tokens = next; stop(); error = nil }
        catch { self.error = "bridgeStorageError" }
    }
    private func persist(_ values: [BridgeToken]) throws {
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try JSONEncoder().encode(values).write(to: file, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
    }
    public func start() {
        guard enabled else { return }
        guard listener == nil, error != "bridgeStorageError" else { return }
        do {
            let parameters = NWParameters.tcp
            parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: 39875)
            let listener = try NWListener(using: parameters)
            self.listener = listener
            listener.stateUpdateHandler = { [weak self, weak listener] state in
                Task { @MainActor in
                    guard let self, self.listener === listener else { return }
                    if case .ready = state { self.listening = true; self.error = nil }
                    else if case .failed = state { self.stop(); self.error = "bridgeListenError" }
                }
            }
            listener.newConnectionHandler = { [weak self] connection in Task { @MainActor in self?.accept(connection) } }
            listener.start(queue: .main)
        } catch { self.error = "bridgeListenError" }
    }
    public func stop() {
        listener?.cancel(); listener = nil; listening = false
        for task in tasks.values { task.cancel() }; tasks.removeAll()
        for task in timeouts.values { task.cancel() }; timeouts.removeAll()
        for connection in clients.values { connection.cancel() }; clients.removeAll()
    }
    private func accept(_ connection: NWConnection) {
        guard listener != nil, clients.count < 8 else { connection.cancel(); return }
        let id = UUID(); clients[id] = connection
        connection.stateUpdateHandler = { [weak self] state in
            if case .failed = state { Task { @MainActor in self?.close(id) } }
            if case .cancelled = state { Task { @MainActor in self?.close(id) } }
        }
        connection.start(queue: .main)
        timeouts[id] = Task { [weak self] in try? await Task.sleep(for: .seconds(30)); if !Task.isCancelled { self?.close(id) } }
        read(id, buffer: Data())
    }
    private func close(_ id: UUID) {
        tasks.removeValue(forKey: id)?.cancel(); timeouts.removeValue(forKey: id)?.cancel()
        clients.removeValue(forKey: id)?.cancel()
    }
    private func read(_ id: UUID, buffer: Data) {
        clients[id]?.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] bytes, _, complete, failure in
            Task { @MainActor in
                guard let self, self.clients[id] != nil else { return }
                var data = buffer; if let bytes { data.append(bytes) }
                do {
                    if let request = try BridgeHTTPRequest.parse(data) {
                        self.timeouts[id]?.cancel()
                        self.timeouts[id] = Task { [weak self] in try? await Task.sleep(for: .seconds(180)); if !Task.isCancelled { self?.close(id) } }
                        self.tasks[id] = Task { [weak self] in await self?.handle(id, request) }; return
                    }
                    if complete || failure != nil { self.close(id) } else { self.read(id, buffer: data) }
                } catch { self.respond(id, status: 400, value: ["success": false, "error": "Invalid HTTP request"], origin: nil) }
            }
        }
    }
    private func handle(_ id: UUID, _ request: BridgeHTTPRequest) async {
        guard request.trustedOrigin || (request.origin.map { allowedOrigins.contains($0) } ?? false) else { respond(id, status: 403, value: ["success": false, "error": "Origin not allowed"], origin: nil); return }
        if request.method == "OPTIONS" { respond(id, status: 200, value: [:], origin: request.origin); return }
        guard BridgeAuth.valid(request.headers["x-viezan-token"] ?? "", tokens: tokens) else { respond(id, status: 401, value: ["success": false, "error": "Unauthorized"], origin: request.origin); return }
        let path = URLComponents(string: request.path)?.path ?? ""
        let selected = model
        if request.method == "GET", path == "/api/status" {
            respond(id, status: 200, value: ["success": true, "appName": "Viezan", "version": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "2.4.2"], origin: request.origin); return
        }
        if request.method == "GET", path == "/api/config" {
            let parts = selected.split(separator: ":", maxSplits: 1).map(String.init)
            respond(id, status: 200, value: ["success": true, "provider": parts.first ?? "", "model": parts.last ?? "", "availableProviders": ["openai": CredentialStore.has("openai"), "claude": CredentialStore.has("claude"), "gemini": CredentialStore.has("gemini")]], origin: request.origin); return
        }
        guard request.method == "POST", ["/api/translate", "/api/tts"].contains(path) else { respond(id, status: 404, value: ["success": false, "error": "Not found"], origin: request.origin); return }
        do {
            guard request.headers["content-type"]?.lowercased().hasPrefix("application/json") == true,
                  let body = try JSONSerialization.jsonObject(with: request.body) as? [String: Any], let text = body["text"] as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw StorageFailure.invalidData }
            if path == "/api/tts" {
                let provider = voice.provider == "system" ? "edge" : voice.provider
                let language = body["lang"] as? String ?? "en"
                guard (NativeResources.shared.nativeLanguages + ["auto"]).contains(language) else { throw StorageFailure.invalidData }
                let audio = try await NativeTTS.audio(text, voice: voice.provider == "system" ? "" : voice.voice, provider: provider, language: language)
                try Task.checkCancellation()
                respond(id, status: 200, value: ["success": true, "audioBase64": audio.base64EncodedString(), "mimeType": provider == "gemini" ? "audio/wav" : "audio/mpeg", "provider": provider], origin: request.origin); return
            }
            guard text.utf8.count <= 131072, let target = body["targetLang"] as? String, NativeResources.shared.nativeLanguages.contains(target) else { throw StorageFailure.invalidData }
            var model = selected
            if let provider = body["provider"] as? String, let name = body["model"] as? String { model = provider + ":" + name }
            guard NativeModel.valid(model), !model.hasPrefix("demo.") else { throw StorageFailure.invalidData }
            let style = body["translationStyle"] as? String ?? "general"
            guard ["general", "formal", "casual", "business", "technical", "natural"].contains(style) else { throw StorageFailure.invalidData }
            var input = Request(sessionID: id.uuidString, feature: .translate, model: model, input: text, source: "auto", target: target, revision: 0, locale: "en")
            input.translationStyle = style
            let collector = BridgeCollector()
            if model.hasPrefix("ollama:") { try await LocalProvider.stream(input) { await collector.append($0) } }
            else { try await CloudProvider.stream(input) { await collector.append($0) } }
            try Task.checkCancellation()
            respond(id, status: 200, value: ["success": true, "translatedText": await collector.text], origin: request.origin)
        } catch {
            if !Task.isCancelled { respond(id, status: 400, value: ["success": false, "error": (error as? CloudFailure)?.rawValue ?? "Request failed"], origin: request.origin) }
        }
    }
    private func respond(_ id: UUID, status: Int, value: [String: Any], origin: String?) {
        guard let connection = clients[id], let body = try? JSONSerialization.data(withJSONObject: value) else { close(id); return }
        let cors = origin.map { "Access-Control-Allow-Origin: \($0)\r\nVary: Origin\r\n" } ?? ""
        let header = "HTTP/1.1 \(status) \(status == 200 ? "OK" : "Error")\r\nContent-Type: application/json\r\nContent-Length: \(body.count)\r\nConnection: close\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, X-Viezan-Token\r\nAccess-Control-Allow-Private-Network: true\r\n\(cors)\r\n"
        connection.send(content: Data(header.utf8) + body, completion: .contentProcessed { [weak self] _ in Task { @MainActor in self?.close(id) } })
    }
}
private actor BridgeCollector {
    var text = ""
    func append(_ value: String) { text += value }
}

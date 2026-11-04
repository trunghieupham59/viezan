import Foundation
import AVFoundation
import Observation

/// Microphone access as the views show it: "granted", "denied" (denied or restricted) or "undetermined".
public enum MicrophonePermission {
    public static var status: String {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized: "granted"
        case .denied, .restricted: "denied"
        default: "undetermined"
        }
    }
}
public struct NativeVoice: Identifiable, Sendable { public let id: String; public let name: String; public let language: String }

@MainActor @Observable public final class NativeAudio {
    public private(set) var permissionPending = false
    public private(set) var recordingOwner: String?
    /// When the current recording started (seconds since 1970), for "Đang ghi âm · 00:14".
    public private(set) var recordingStarted: Double?
    public private(set) var transcribingOwner: String?
    public private(set) var error: String?
    public private(set) var speaking = false
    /// Which text is being read (the caller's source id), so every speaker control shows the same state.
    public private(set) var speakingSource: String?
    /// The source last asked to read; stays after a failure so "Read with the system voice" can retry it.
    public private(set) var lastSource: String?
    /// A cloud voice is being generated: reading has started but no audio plays yet.
    public private(set) var preparing = false
    /// Models the account lists (provider discovery), for choosing a transcription model.
    public var availableModels: [String] = []
    public var voiceProvider = "system"
    public var voiceID = ""
    public var voiceRate: Double = 1
    @ObservationIgnored private var voiceRequest: Task<Void, Never>?
    @ObservationIgnored private var player: AVAudioPlayer?
    @ObservationIgnored private var voiceGeneration = UUID()
    @ObservationIgnored private var recorder: AVAudioRecorder?
    @ObservationIgnored private let synthesizer = AVSpeechSynthesizer()
    @ObservationIgnored private var file: URL?
    @ObservationIgnored private var request: Task<Void, Never>?
    @ObservationIgnored private var permissionGeneration = UUID()
    @ObservationIgnored private var recordingLanguage = "auto"
    @ObservationIgnored private let speechEvents = NativeSpeechEvents()
    /// The system utterance being read. Its own "finished" event ends `speaking`; asking the
    /// synthesizer `isSpeaking` there is unreliable (it can still be true) and left the UI reading.
    @ObservationIgnored private var systemUtterance: ObjectIdentifier?
    public init() { synthesizer.delegate = speechEvents; speechEvents.finished = { [weak self] id in self?.systemSpeechFinished(id) } }
    func beginSystemSpeech(_ id: ObjectIdentifier) { systemUtterance = id; speaking = true }
    func systemSpeechFinished(_ id: ObjectIdentifier) {
        guard systemUtterance == id, voiceRequest == nil else { return }
        systemUtterance = nil; speaking = false; speakingSource = nil
    }
    public func start(owner: String, language: String = "auto") async {
        guard recordingOwner == nil, transcribingOwner == nil, !permissionPending else { return }
        stopSpeaking(); recordingLanguage = language
        let generation = UUID(); permissionGeneration = generation; permissionPending = true
        let permitted = await AVCaptureDevice.requestAccess(for: .audio)
        guard permissionGeneration == generation else { return }
        permissionPending = false
        guard permitted else { error = "microphoneDenied"; return }
        do {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension("m4a")
            file = url
            let recorder = try AVAudioRecorder(url: url, settings: [AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 44100, AVNumberOfChannelsKey: 1, AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue])
            guard recorder.record() else { throw CloudFailure.network }
            self.recorder = recorder; recordingOwner = owner; recordingStarted = Date().timeIntervalSince1970; error = nil
        } catch { self.error = "audioError"; cleanup() }
    }
    public func stop(provider: String, completion: @escaping @MainActor (String, String) -> Void) {
        guard let owner = recordingOwner, let file else { return }
        recorder?.stop(); recorder = nil; recordingOwner = nil; recordingStarted = nil; transcribingOwner = owner
        let generation = permissionGeneration, language = recordingLanguage, available = availableModels
        request = Task { [weak self] in
            defer {
                try? FileManager.default.removeItem(at: file)
                if self?.permissionGeneration == generation { self?.transcribingOwner = nil; self?.file = nil; self?.request = nil }
            }
            do {
                let text = try await SpeechProvider.transcribe(file: file, mime: "audio/mp4", provider: provider, language: language, available: available)
                try Task.checkCancellation(); completion(owner, text)
            } catch {
                if !Task.isCancelled { self?.error = (error as? CloudFailure)?.rawValue ?? "audioError" }
            }
        }
    }
    public func cancel() {
        permissionGeneration = UUID(); permissionPending = false; request?.cancel(); request = nil
        recorder?.stop(); recorder = nil; recordingOwner = nil; recordingStarted = nil; transcribingOwner = nil
        cleanup(); stopSpeaking()
    }
    /// The system voice that reads `language`: the chosen one when it speaks that language, otherwise
    /// the language's default voice (a Japanese voice never reads Vietnamese). Nil for cloud providers.
    public func voice(for language: String) -> NativeVoice? {
        guard voiceProvider == "system" else { return nil }
        let base = { (code: String) in String(code.lowercased().split(whereSeparator: { $0 == "-" || $0 == "_" }).first ?? "") }
        if !voiceID.isEmpty, let chosen = AVSpeechSynthesisVoice(identifier: voiceID), base(chosen.language) == base(language) {
            return NativeVoice(id: chosen.identifier, name: chosen.name, language: chosen.language)
        }
        return Self.defaultVoice(language).map { NativeVoice(id: $0.identifier, name: $0.name, language: $0.language) }
    }
    private static func defaultVoice(_ language: String) -> AVSpeechSynthesisVoice? {
        AVSpeechSynthesisVoice(language: ["en": "en-US", "vi": "vi-VN", "ja": "ja-JP"][language] ?? language)
    }
    public var voices: [NativeVoice] { AVSpeechSynthesisVoice.speechVoices().map { NativeVoice(id: $0.identifier, name: $0.name, language: $0.language) }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending } }
    /// Reads `text`. `source` names what is read (for the speaker controls); `provider` overrides the
    /// voice provider for this one reading only ("system" after a cloud voice failed).
    public func speak(_ text: String, language: String, source: String? = nil, provider: String? = nil) {
        stopSpeaking()
        guard !text.isEmpty, text.utf8.count <= 100000 else { return }
        let epoch = voiceGeneration, voiceProvider = provider ?? self.voiceProvider
        error = nil; speakingSource = source; lastSource = source
        if voiceProvider == "system" {
            let utterance = AVSpeechUtterance(string: text)
            // The chosen voice reads its own language; other languages (and a one-off system reading
            // after a cloud failure) use the language's default voice.
            utterance.voice = provider != nil ? Self.defaultVoice(language) : voice(for: language).flatMap { AVSpeechSynthesisVoice(identifier: $0.id) } ?? Self.defaultVoice(language)
            utterance.rate = min(AVSpeechUtteranceMaximumSpeechRate, max(AVSpeechUtteranceMinimumSpeechRate, AVSpeechUtteranceDefaultSpeechRate * Float(voiceRate)))
            synthesizer.speak(utterance); beginSystemSpeech(ObjectIdentifier(utterance)); return
        }
        let voice = voiceID, rate = voiceRate; speaking = true; preparing = true
        voiceRequest = Task { [weak self] in
            let provider = voiceProvider
            do {
                for chunk in LanguageSegments.chunks(text, limit: 3000) {
                    // Stopped before this ran: never read a key or call the provider.
                    try Task.checkCancellation()
                    let audio = try await NativeTTS.audio(chunk, voice: voice, provider: provider, language: language, rate: rate); try Task.checkCancellation()
                    guard let self, self.voiceGeneration == epoch else { return }
                    let player = try AVAudioPlayer(data: audio); self.player = player
                    guard player.play() else { throw CloudFailure.invalidResponse }
                    self.preparing = false
                    while player.isPlaying { try await Task.sleep(for: .milliseconds(100)); try Task.checkCancellation() }
                }
            } catch { if !Task.isCancelled, self?.voiceGeneration == epoch { self?.error = (error as? CloudFailure)?.rawValue ?? "audioError" } }
            if self?.voiceGeneration == epoch { self?.speaking = false; self?.preparing = false; self?.speakingSource = nil; self?.player = nil; self?.voiceRequest = nil }
        }
    }
    public func stopSpeaking() { voiceGeneration = UUID(); systemUtterance = nil; preparing = false; speakingSource = nil; voiceRequest?.cancel(); voiceRequest = nil; player?.stop(); player = nil; synthesizer.stopSpeaking(at: .immediate); speaking = false }
    private func cleanup() {
        if let file { try? FileManager.default.removeItem(at: file) }; file = nil
    }
}
public enum SpeechProvider {
    /// OpenAI's newer transcription models detect the spoken language better and invent far less
    /// text on noise than whisper-1; use the best one the account lists (discovery).
    public static func transcriptionModel(_ available: [String]) -> String {
        ["gpt-4o-transcribe", "gpt-4o-mini-transcribe"].first { available.contains("openai:" + $0) } ?? "whisper-1"
    }
    public static func transcribe(file: URL, mime: String, provider: String, language: String = "auto", available: [String] = []) async throws -> String {
        guard (NativeResources.shared.nativeLanguages + ["auto"]).contains(language) else { throw CloudFailure.invalidResponse }
        // Auto routing is an explicit user choice. Explicit providers never upload
        // to another service; cancellation always stops the candidate chain.
        if provider == "auto" {
            var failure: Error = CloudFailure.missingKey
            for candidate in ["openai", "gemini", "groq"] where CredentialStore.has(candidate) {
                try Task.checkCancellation()
                do { return try await transcribe(file: file, mime: mime, provider: candidate, language: language, available: available) }
                catch { try Task.checkCancellation(); failure = error }
            }
            throw failure
        }
        guard ["openai", "groq", "gemini"].contains(provider),
              let key = try? CredentialStore.read(provider) else { throw CloudFailure.missingKey }
        let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size > 0, size <= 25_000_000 else { throw ProviderFailure.oversizedResponse }
        let audio = try Data(contentsOf: file)
        let endpoint = provider == "groq" ? "https://api.groq.com/openai/v1/audio/transcriptions" : provider == "gemini" ? "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" : "https://api.openai.com/v1/audio/transcriptions"
        var call = URLRequest(url: URL(string: endpoint)!)
        call.httpMethod = "POST"
        if provider == "gemini" {
            call.setValue(key, forHTTPHeaderField: "x-goog-api-key"); call.setValue("application/json", forHTTPHeaderField: "Content-Type")
            call.httpBody = try JSONSerialization.data(withJSONObject: ["contents": [["parts": [["text": "Transcribe this audio faithfully in its original language. Return only the transcript." + (language == "auto" ? "" : " The source language is " + language + ".")], ["inlineData": ["mimeType": mime, "data": audio.base64EncodedString()]]]]]])
        } else {
            call.setValue("Bearer " + key, forHTTPHeaderField: "Authorization")
            let boundary = UUID().uuidString
            call.setValue("multipart/form-data; boundary=" + boundary, forHTTPHeaderField: "Content-Type")
            var body = Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\n\(provider == "groq" ? "whisper-large-v3-turbo" : transcriptionModel(available))\r\n--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"recording.m4a\"\r\nContent-Type: \(mime)\r\n\r\n".utf8)
            if language != "auto" { body.insert(contentsOf: Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"language\"\r\n\r\n\(language.split(separator: "-").first.map(String.init) ?? language)\r\n".utf8), at: 0) }
            body.append(audio); body.append(Data("\r\n--\(boundary)--\r\n".utf8)); call.httpBody = body
        }
        let config = URLSessionConfiguration.ephemeral; config.timeoutIntervalForResource = 180
        let session = URLSession(configuration: config, delegate: NoRedirectDelegate(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let (bytes, response) = try await session.bytes(for: call)
        guard let http = response as? HTTPURLResponse else { throw CloudFailure.network }
        guard http.statusCode == 200 else { throw CloudFailure.http(http.statusCode) }
        var data = Data()
        for try await byte in bytes { try Task.checkCancellation(); guard data.count < 1_048_576 else { throw ProviderFailure.oversizedResponse }; data.append(byte) }
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        let text: String
        if provider == "gemini" {
            let candidate = (object["candidates"] as? [[String: Any]])?.first
            guard candidate?["finishReason"] as? String == "STOP" else { throw CloudFailure.invalidResponse }
            let parts = (candidate?["content"] as? [String: Any])?["parts"] as? [[String: Any]] ?? []
            text = parts.compactMap { $0["text"] as? String }.joined()
        } else { text = object["text"] as? String ?? "" }
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw CloudFailure.invalidResponse }
        return text
    }
}

private final class NativeSpeechEvents: NSObject, AVSpeechSynthesizerDelegate, @unchecked Sendable {
    @MainActor var finished: ((ObjectIdentifier) -> Void)?
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        let id = ObjectIdentifier(utterance)
        Task { @MainActor [weak self] in self?.finished?(id) }
    }
}

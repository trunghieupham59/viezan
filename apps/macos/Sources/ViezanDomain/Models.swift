import Foundation

public enum Feature: String, Codable, CaseIterable, Sendable { case chat, translate, dictionary }
public enum AppearanceMode: String, Codable, CaseIterable, Sendable { case system, light, dark }
public enum ReadingSize: String, Codable, CaseIterable, Sendable { case small, medium, large }
public struct AppearancePreferences: Codable, Equatable, Sendable {
    public var preset: String?
    public var accent: String?
    public var mode: AppearanceMode = .system
    public var textSize: ReadingSize = .medium
    public init() {}
}
public enum TaskStatus: String, Codable, Sendable {
    case running, succeeded, cancelled, failed, interrupted
}
public struct ShellPreferences: Codable, Equatable, Sendable {
    public var navigationCollapsed = false
    public var lastRoute: String?
    public init() {}
}
public struct Message: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var role: String
    public var text: String
    public var images: [ImageAttachment]?
}
public struct Session: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var feature: Feature
    public var updated: Double?
    public var title: String = ""
    public var draft: String = ""
    public var model: String = "ollama:llama3.2"
    public var source: String = "en"
    public var target: String = "vi"
    public var revision: Int = 0
    public var output: String = ""
    public var messages: [Message] = []
    public var images: [ImageAttachment]?
    public var reasoningEffort: String?
    public var translationStyle: String?
    public var translationMode: String?
    public var systemPrompt: String?
    public var carefulReasoning: Bool?
    public var chatMode: String?
    public var dictionaryContext: String?
    public var comparisonParent: String?
    public var comparisonRevision: Int?
    public var assemblyParts: [String: String]?
    public var favorite: Bool?
    public var archived: Bool?
    public init(id: String = UUID().uuidString, feature: Feature) { self.id = id; self.feature = feature }
}
public struct Request: Codable, Equatable, Sendable {
    public var sessionID: String
    public var feature: Feature
    public var model: String
    public var input: String
    public var source: String
    public var target: String
    public var revision: Int
    public var locale: String
    public var messages: [ProviderMessage]? = nil
    public var reasoningEffort: String?
    public var translationStyle: String?
    public var translationMode: String?
    public var systemPrompt: String?
    public var carefulReasoning: Bool?
    public var chatMode: String?
    public var dictionaryContext: String? = nil
}
public struct UsageRate: Codable, Equatable, Sendable {
    public var input: Double
    public var output: Double
    public var currency: String
    public init(input: Double, output: Double, currency: String) { self.input = input; self.output = output; self.currency = currency }
    public var valid: Bool { input.isFinite && output.isFinite && input >= 0 && output >= 0 && input <= 1_000_000 && output <= 1_000_000 && currency.range(of: "^[A-Z]{3}$", options: .regularExpression) != nil }
}
public struct TokenUsage: Codable, Equatable, Sendable {
    public var input: Int = 0
    public var output: Int = 0
    public init(input: Int = 0, output: Int = 0) { self.input = input; self.output = output }
    public var valid: Bool { input >= 0 && output >= 0 && input <= 1_000_000_000 && output <= 1_000_000_000 }
}
public struct WorkTask: Codable, Identifiable, Equatable, Sendable {
    public var usage: TokenUsage? = nil
    public var research: ResearchState? = nil
    public var id: String
    public var attemptID: String
    public var attemptNumber: Int = 1
    public var errorCode: String?
    public var request: Request
    public var status: TaskStatus
    public var output: String
}
public struct BridgePreferences: Codable, Equatable, Sendable {
    public var automatic = false
    public var origins: [String] = []
    public init(automatic: Bool = false, origins: [String] = []) { self.automatic = automatic; self.origins = origins }
    public static func normalize(_ value: String) -> String? {
        guard var url = URLComponents(string: value.trimmingCharacters(in: .whitespacesAndNewlines)), url.scheme == "https", let host = url.host, !host.isEmpty, url.user == nil, url.password == nil, url.query == nil, url.fragment == nil, url.path.isEmpty || url.path == "/" else { return nil }
        url.host = host.lowercased(); url.path = ""; if url.port == 443 { url.port = nil }; return url.string
    }
    public var valid: Bool { origins.count <= 32 && Set(origins).count == origins.count && origins.allSatisfy { $0.utf8.count <= 2048 && Self.normalize($0) == $0 } }
}
public struct VoicePreferences: Codable, Equatable, Sendable {
    public var provider = "system"
    public var voice = ""
    public init(provider: String = "system", voice: String = "") { self.provider = provider; self.voice = voice }
    public var valid: Bool { ["system", "edge", "openai", "gemini", "elevenlabs"].contains(provider) && voice.utf8.count <= 256 && !voice.unicodeScalars.contains { CharacterSet.controlCharacters.contains($0) } }
}
public struct RuntimePreferences: Codable, Equatable, Sendable {
    public var parallel = 1
    public var context = 4096
    public init(parallel: Int = 1, context: Int = 4096) { self.parallel = parallel; self.context = context }
    public var valid: Bool { [1, 2, 4].contains(parallel) && [2048, 4096, 8192, 16384, 32768].contains(context) }
}
public struct Workspace: Codable, Equatable, Sendable {
    public var schemaVersion = 1
    public var sessions: [Session]
    public var tasks: [WorkTask] = []
    public var active: [String: String]
    public var feature: Feature = .chat
    public var locale = "vi"
    // Optional so snapshots created before appearance settings remain readable.
    public var disabledModules: [String]?
    public var rates: [String: UsageRate]?
    public var prompts: [SavedPrompt]?
    public var bridge: BridgePreferences?
    public var voice: VoicePreferences?
    public var runtime: RuntimePreferences?
    public var autoTranslate: Bool?
    public var autoTranslateDelay: Int?
    public var speechProvider: String?
    public var appearance: AppearancePreferences?
    public var shell: ShellPreferences?
    public var navigationCollapsed: Bool { shell?.navigationCollapsed ?? false }
    public var preferences: AppearancePreferences { appearance ?? AppearancePreferences() }
    public init() {
        let chat = Session(feature: .chat), translate = Session(feature: .translate), dictionary = Session(feature: .dictionary)
        sessions = [chat, translate, dictionary]
        active = [Feature.chat.rawValue: chat.id, Feature.translate.rawValue: translate.id, Feature.dictionary.rawValue: dictionary.id]
    }
    public func upgrading() -> Workspace {
        var result = self
        for i in result.sessions.indices where result.sessions[i].model.hasPrefix("demo.") { result.sessions[i].model = "ollama:llama3.2" }
        for i in result.tasks.indices where result.tasks[i].request.model.hasPrefix("demo.") { result.tasks[i].request.model = "ollama:llama3.2" }
        if !sessions.contains(where: { $0.feature == .dictionary }), active["dictionary"] == nil {
            let dictionary = Session(feature: .dictionary)
            result.sessions.append(dictionary); result.active["dictionary"] = dictionary.id
        }
        return result
    }
    public func validated() throws -> Workspace {
        guard ["graphite", "glass", "paper", "corporate", "midnight"].contains(preferences.preset ?? "glass"), ["auto", "violet", "pink", "teal", "green", "amber", "red"].contains(preferences.accent ?? "auto"), (disabledModules ?? []).allSatisfy({ ["chat", "translate", "dictionary", "interpret", "thermal", "apps", "utilities", "bridge"].contains($0) }), (rates?.count ?? 0) <= 1000, rates?.allSatisfy({ NativeModel.valid($0.key) && $0.value.valid }) ?? true, schemaVersion == 1,
              ["vi", "en", "ja"].contains(locale),
              Set(sessions.map(\.id)).count == sessions.count,
              Set(tasks.map(\.id)).count == tasks.count,
              Feature.allCases.allSatisfy({ feature in sessions.contains { $0.feature == feature && $0.id == active[feature.rawValue] && $0.archived != true } }),
              sessions.contains(where: { $0.feature == feature && $0.id == active[feature.rawValue] }),
              sessions.allSatisfy({ NativeModel.valid($0.model) && $0.revision >= 0 && (NativeResources.shared.nativeLanguages + ["auto"]).contains($0.source) && NativeResources.shared.nativeLanguages.contains($0.target) }),
              tasks.allSatisfy({ task in
                  (task.usage?.valid ?? true) && NativeModel.valid(task.request.model) && task.request.revision >= 0 &&
                  !task.attemptID.isEmpty && task.attemptNumber > 0 &&
                  (NativeResources.shared.nativeLanguages + ["auto"]).contains(task.request.source) && NativeResources.shared.nativeLanguages.contains(task.request.target) &&
                  ["en", "vi", "ja"].contains(task.request.locale) &&
                  sessions.contains { $0.id == task.request.sessionID && $0.feature == task.request.feature }
              })
        else { throw StorageFailure.invalidData }
        func validImages(_ images: [ImageAttachment]?) -> Bool {
            guard let images else { return true }
            return images.count <= 4 && Set(images.map(\.id)).count == images.count && images.allSatisfy { UUID(uuidString: $0.id) != nil && ["image/jpeg", "image/png", "image/webp", "image/gif"].contains($0.mime) }
        }
        var busy: Set<String> = []
        for session in sessions {
            guard !session.id.isEmpty, session.reasoningEffort == nil || ["auto", "low", "medium", "high"].contains(session.reasoningEffort!), validImages(session.images), (session.systemPrompt?.utf8.count ?? 0) <= 32768,
                  session.translationStyle == nil || ["general", "formal", "casual", "business", "technical", "natural"].contains(session.translationStyle!),
                  session.translationMode == nil || ["translate", "annotate", "phonetic", "rewrite"].contains(session.translationMode!),
                  Set(session.messages.map(\.id)).count == session.messages.count,
                  session.messages.allSatisfy({ !$0.id.isEmpty && ["user", "assistant", "system"].contains($0.role) && validImages($0.images) }) else { throw StorageFailure.invalidData }
        }
        for task in tasks {
            guard !task.id.isEmpty, task.request.reasoningEffort == nil || ["auto", "low", "medium", "high"].contains(task.request.reasoningEffort!), (task.request.messages ?? []).allSatisfy({ ["user", "assistant", "system"].contains($0.role) && validImages($0.images) }) else { throw StorageFailure.invalidData }
            if task.status == .running { guard busy.insert(task.request.sessionID).inserted else { throw StorageFailure.invalidData } }
        }
        if let prompts { guard prompts.count <= 500, Set(prompts.map(\.id)).count == prompts.count, prompts.allSatisfy({ !$0.name.isEmpty && $0.name.count <= 100 && $0.text.utf8.count <= 32768 }) else { throw StorageFailure.invalidData } }
        if let bridge, !bridge.valid { throw StorageFailure.invalidData }
        if let voice, !voice.valid { throw StorageFailure.invalidData }
        if let runtime, !runtime.valid { throw StorageFailure.invalidData }
        if let autoTranslateDelay, !(100...5000).contains(autoTranslateDelay) { throw StorageFailure.invalidData }
        if let speechProvider, !["auto", "openai", "groq", "gemini"].contains(speechProvider) { throw StorageFailure.invalidData }
        return self
    }
}
public struct NativeResources: Decodable, Sendable {
    public struct NavigationItem: Decodable, Identifiable, Sendable {
        public let id: String
        public let title: String
        public let systemImage: String
        public let icon: String
    }
    public struct CommandItem: Decodable, Identifiable, Sendable {
        public let id: String
        public let title: String
        public let systemImage: String
        public let icon: String
        public let shortcut: String
    }
    public struct SettingsSection: Decodable, Identifiable, Sendable {
        public let id: String
        public let title: String
        public let description: String
        public let terms: [String]
    }
    public struct Fixtures: Decodable, Sendable {
        public let models: [String]
        public let responses: [String: [String: String]]
    }
    public let nativeLanguages: [String]
    public let translationTemplates: [String: String]
    public let chatPrompt: [String: String]
    public let imageTranslationPrompt: String
    public let reasoningPolicy: [String: String]
    public let translationSystem: String
    public let rewriteSystem: String
    public let themePalettes: [String: [String: [String: String]]]
    public let chromePalettes: [String: [String: String]]
    public static var brandURL: URL? { Bundle.module.url(forResource: "brand", withExtension: "png") }
    public let metrics: [String: Double]
    public let textScales: [String: Double]
    public let settingsSections: [SettingsSection]
    public let navigation: [NavigationItem]
    public let commands: [CommandItem]
    public let locales: [String: [String: String]]
    public let fixtures: Fixtures
    public static let shared: NativeResources = {
        guard let url = Bundle.module.url(forResource: "native", withExtension: "json"),
              let data = try? Data(contentsOf: url), let resources = try? JSONDecoder().decode(NativeResources.self, from: data)
        else { fatalError("Run node scripts/native/generate-resources.mjs before building") }
        return resources
    }()
    public func text(_ key: String, locale: String) -> String { locales[locale]?[key] ?? locales["en"]?[key] ?? key }
    public func metric(_ key: String) -> Double { metrics[key]! }
    public func matchingCommands(query: String, locale: String) -> [CommandItem] {
        func normalize(_ value: String) -> String {
            value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: locale)).replacingOccurrences(of: "đ", with: "d")
        }
        let needle = normalize(query.trimmingCharacters(in: .whitespacesAndNewlines))
        return commands.filter { needle.isEmpty || normalize(text($0.title, locale: locale)).contains(needle) }
    }
    public func settings(query: String, locale: String) -> [SettingsSection] {
        func normalize(_ value: String) -> String {
            value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: locale)).replacingOccurrences(of: "đ", with: "d")
        }
        let needle = normalize(query.trimmingCharacters(in: .whitespacesAndNewlines))
        return settingsSections.filter { section in
            needle.isEmpty || normalize(([section.title, section.description] + section.terms).map { text($0, locale: locale) }.joined(separator: " ")).contains(needle)
        }
    }
}

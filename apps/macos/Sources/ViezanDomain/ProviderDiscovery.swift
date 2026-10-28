import Foundation

// Which AI sources this device can use right now: local runtimes that answer on
// loopback (models already downloaded) and cloud providers that have a saved key.
// Arrays are in preference order: on-device first, then cloud.
public enum ProviderDiscovery {
    public static let localProviders = ["ollama", "lmstudio", "llamacpp"]
    public static let cloudProviders = ["openai", "claude", "gemini"]
    public static var providers: [String] { localProviders + cloudProviders }
    // Cloud catalogs list every model (embeddings, speech, images); a new session
    // gets a fast general chat model. Entries are ID prefixes, first match wins.
    static let cloudDefaults: [String: [String]] = [
        "openai": ["gpt-4.1-mini", "gpt-4o-mini", "gpt-4.1", "gpt-4o"],
        "claude": ["claude-haiku-4", "claude-sonnet-4", "claude-3-5-haiku", "claude-3-5-sonnet"],
        "gemini": ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"],
    ]
    static func provider(_ model: String) -> String { model.split(separator: ":", maxSplits: 1).first.map(String.init) ?? "" }
    public static func chatCapable(_ model: String) -> Bool {
        let id = model.lowercased()
        return !["embed", "whisper", "tts", "dall-e", "image", "moderation", "rerank"].contains { id.contains($0) }
    }

    public enum Availability: Equatable, Sendable {
        case unknown              // not probed yet: never warn
        case available
        case offline              // local runtime did not answer
        case missingKey           // cloud provider without a saved key
        case notInstalled         // runtime answers but this model is not downloaded
        case unsupported          // demo or unknown provider
    }

    public struct Snapshot: Equatable, Sendable {
        /// provider → model IDs ("provider:model"); a provider absent here did not answer.
        public var models: [String: [String]] = [:]
        /// Cloud providers that have a saved key (listing may still have failed).
        public var keyed: Set<String> = []
        /// provider → failure code of its last listing (e.g. "providerAuthError" for a rejected key).
        public var failures: [String: String] = [:]
        public var checked = false
        public init() {}
        public var all: [String] { ProviderDiscovery.providers.flatMap { models[$0] ?? [] } }
        /// Nothing usable: no downloaded local model and no keyed cloud provider.
        public var empty: Bool { checked && keyed.isEmpty && !all.contains(where: ProviderDiscovery.chatCapable) }

        public func availability(_ model: String) -> Availability {
            guard checked else { return .unknown }
            let provider = ProviderDiscovery.provider(model)
            guard ProviderDiscovery.providers.contains(provider) else { return .unsupported }
            if ProviderDiscovery.cloudProviders.contains(provider) {
                guard keyed.contains(provider) else { return .missingKey }
                // A keyed provider whose listing failed is still usable; the request reports its own error.
                return models[provider].map { $0.contains(model) ? .available : .notInstalled } ?? .available
            }
            guard let installed = models[provider] else { return .offline }
            return installed.contains(model) ? .available : .notInstalled
        }

        /// The model a new or still-empty session should use: a recently used model that
        /// is available, otherwise the first available provider's default.
        public func preferredModel(recent: [String]) -> String? {
            if let model = recent.first(where: { availability($0) == .available && ProviderDiscovery.chatCapable($0) && (models[ProviderDiscovery.provider($0)]?.contains($0) ?? false) }) { return model }
            for provider in ProviderDiscovery.providers {
                let candidates = (models[provider] ?? []).filter(ProviderDiscovery.chatCapable)
                guard !candidates.isEmpty else { continue }
                if let prefixes = ProviderDiscovery.cloudDefaults[provider] {
                    for prefix in prefixes {
                        if let match = candidates.filter({ $0.dropFirst(provider.count + 1).hasPrefix(prefix) }).sorted().first { return match }
                    }
                }
                return candidates.sorted().first
            }
            return nil
        }
    }
}

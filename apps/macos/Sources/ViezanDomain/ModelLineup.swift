import Foundation

/// Three purposes a person picks by instead of a model name; each resolves to one
/// model of the current provider (`ModelLineup.tiers`). Careful also turns on
/// careful reasoning for the session.
public enum ModelTier: String, CaseIterable, Sendable { case fast, balanced, careful }

/// Reads provider model listings into what the picker shows: the newest model of
/// each family, a short name derived from the ID (never a hand-written catalog, so
/// a model released tomorrow still appears), and the family that serves each tier.
public enum ModelLineup {
    static func supportsEffort(model: String, family: String) -> Bool {
        NativeResources.shared.reasoningPolicy[family].map { model.range(of: $0, options: [.regularExpression, .caseInsensitive]) != nil } ?? false
    }
    public static func supportsEffort(model: String) -> Bool {
        let parts = model.split(separator: ":", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { return false }
        let families: [String]
        switch parts[0] {
        case "openai", "claude": families = [parts[0]]
        case "gemini": families = ["geminiLevel", "geminiBudget"]
        default: return false
        }
        return families.contains { supportsEffort(model: parts[1], family: $0) }
    }

    /// A model family within a provider: `rank` orders capability (0 = lightest),
    /// `version` orders releases within the family.
    public struct Family: Equatable, Sendable {
        public var provider: String
        public var name: String
        public var rank: Int
        public var version: Double
        public var preview: Bool
        /// The ID named a release date; the plain ID of the same version is the one to show.
        public var dated: Bool
        /// A codename after the version ("gpt-6-astra"): shown, never used for ordering.
        public var suffix: String = ""
    }

    // Listings mix in models that cannot hold a chat; none of these belong in the picker.
    static let excluded = ["embed", "tts", "whisper", "audio", "realtime", "image", "computer-use", "moderation",
                           "babbage", "davinci", "instruct", "transcribe", "search", "latest", "codex", "dall-e",
                           "sora", "veo", "imagen", "aqa", "learnlm", "live", "native-audio", "robotics", "deep-research"]
    static let claudeRanks = ["haiku": 0, "sonnet": 1, "opus": 2, "fable": 3]
    static let openAIRanks = ["nano": 0, "mini": 1, "": 2, "pro": 3]
    static let geminiRanks = ["flash-lite": 0, "flash": 1, "pro": 2]
    /// The rank of each provider's main line (Sonnet, GPT, Flash): Balanced lives there, Careful at
    /// or above it, Fast below it.
    static let mainRank = ["claude": 1, "openai": 2, "gemini": 1]

    public static func provider(_ id: String) -> String { id.firstIndex(of: ":").map { String(id[..<$0]) } ?? "" }
    /// The model part of "provider:model" without a trailing release date.
    public static func model(_ id: String) -> String {
        let raw = id.firstIndex(of: ":").map { String(id[id.index(after: $0)...]) } ?? id
        return raw.replacingOccurrences(of: #"-(\d{8}|\d{4}-\d{2}-\d{2})$"#, with: "", options: .regularExpression)
    }
    static func hasDate(_ id: String) -> Bool { model(id).count < (id.firstIndex(of: ":").map { String(id[id.index(after: $0)...]) } ?? id).count }
    public static func isChatModel(_ id: String) -> Bool {
        let model = Self.model(id).lowercased()
        return !excluded.contains { model.contains($0) }
    }

    /// The family a cloud model belongs to; nil for local runtimes and IDs the rules do not read.
    public static func family(_ id: String) -> Family? {
        let provider = Self.provider(id), model = Self.model(id).lowercased()
        func number(_ text: Substring) -> Double { Double(text.replacingOccurrences(of: "-", with: ".")) ?? 0 }
        func match(_ pattern: String) -> [Substring?]? {
            guard let regex = try? NSRegularExpression(pattern: pattern), let hit = regex.firstMatch(in: model, range: NSRange(model.startIndex..., in: model)) else { return nil }
            return (1..<hit.numberOfRanges).map { Range(hit.range(at: $0), in: model).map { model[$0] } }
        }
        switch provider {
        case "claude":
            guard let groups = match(#"^claude-(fable|opus|sonnet|haiku)-(\d+(?:-\d+)?)(?:-([a-z]+))?$"#), let name = groups[0], let version = groups[1] else { return nil }
            return Family(provider: provider, name: String(name), rank: claudeRanks[String(name)] ?? 0, version: number(version), preview: false, dated: hasDate(id), suffix: groups[2].map(String.init) ?? "")
        case "openai":
            if let groups = match(#"^gpt-(\d+(?:\.\d+)?)(?:-(nano|mini|pro))?(?:-([a-z]+))?$"#), let version = groups[0] {
                let size = groups[1].map(String.init) ?? ""
                return Family(provider: provider, name: size.isEmpty ? "gpt" : "gpt-" + size, rank: openAIRanks[size] ?? 2, version: number(version), preview: false, dated: hasDate(id), suffix: groups[2].map(String.init) ?? "")
            }
            if let groups = match(#"^o(\d+)(?:-(mini|pro))?$"#), let version = groups[0] {
                let size = groups[1].map(String.init) ?? ""
                return Family(provider: provider, name: size.isEmpty ? "o" : "o-" + size, rank: openAIRanks[size] ?? 2, version: number(version), preview: false, dated: hasDate(id))
            }
            return nil
        case "gemini":
            guard let groups = match(#"^gemini-(\d+(?:\.\d+)?)-(flash-lite|flash|pro)(?:-(preview|exp)(?:-[\w.-]+)?)?$"#), let version = groups[0], let name = groups[1] else { return nil }
            return Family(provider: provider, name: String(name), rank: geminiRanks[String(name)] ?? 0, version: number(version), preview: groups[2] != nil, dated: hasDate(id))
        default:
            return nil
        }
    }

    /// One model per size (rank), most capable first: the main line of the provider (GPT over the
    /// o-series) at its newest release, plain IDs over dated snapshots and previews. Local runtimes
    /// list everything installed; cloud IDs the rules do not read fall back to a few names, never nothing.
    public static func featured(_ ids: [String], limit: Int = 4) -> [String] {
        let chat = ids.filter(isChatModel)
        guard let first = chat.first, ProviderDiscovery.cloudProviders.contains(provider(first)) else { return chat.sorted() }
        func score(_ family: Family) -> (Int, Double, Int, Int) { (family.name.hasPrefix("o") ? 0 : 1, family.version, family.preview ? 0 : 1, family.dated ? 0 : 1) }
        var bySize: [Int: (id: String, family: Family)] = [:]
        for id in chat {
            guard let family = family(id) else { continue }
            if let current = bySize[family.rank]?.family, score(current) >= score(family) { continue }
            bySize[family.rank] = (id, family)
        }
        if bySize.isEmpty { return Array(chat.sorted().prefix(limit + 1)) }
        return bySize.sorted { $0.key > $1.key }.prefix(limit).map(\.value.id)
    }

    /// The "other models" search: chat-capable IDs of one listing, dated snapshots folded into their
    /// plain ID, filtered by a case-insensitive query on the model part, a bounded number of names.
    public static func search(_ ids: [String], query: String, limit: Int = 8) -> [String] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        var representative: [String: String] = [:]
        for id in ids.filter(isChatModel) {
            let name = model(id)
            // A plain ID stands for the name; among dated snapshots only, the newest one does.
            if let current = representative[name], !hasDate(current) || (hasDate(id) && current > id) { continue }
            representative[name] = id
        }
        return representative.filter { needle.isEmpty || $0.key.lowercased().contains(needle) }.keys.sorted().prefix(limit).compactMap { representative[$0] }
    }

    /// "Sonnet 5.5", "GPT-5.5 mini", "Gemini 3 Pro"; otherwise the model part of the ID.
    public static func shortName(_ id: String) -> String {
        guard let family = family(id) else { return model(id) }
        let version = family.version.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(family.version)) : String(family.version)
        // Every word after the version is capitalised the same way: "GPT-5.5 Pro", "GPT-6 Astra", "Flash Lite".
        let codename = family.suffix.isEmpty ? "" : " " + family.suffix.capitalized
        switch family.provider {
        case "claude": return family.name.capitalized + " " + version + codename
        case "openai":
            let parts = family.name.split(separator: "-").map(String.init)
            let base = parts[0] == "gpt" ? "GPT-" + version : "o" + version
            return (parts.count > 1 ? base + " " + parts[1].capitalized : base) + codename
        case "gemini": return "Gemini " + version + " " + family.name.split(separator: "-").map(\.capitalized).joined(separator: " ")
        default: return model(id)
        }
    }

    /// One model per tier for the provider of `current`, from that provider's listing; nil when the
    /// provider is local or lists fewer than two sizes (then purposes would not differ). Generation
    /// beats size: Careful is the newest of the large sizes (main line or Pro), never an older Pro
    /// below the model in use; Balanced is the newest main line; Fast the newest small size.
    public static func tiers(for current: String, listing ids: [String]) -> [ModelTier: String]? {
        let provider = Self.provider(current)
        guard ProviderDiscovery.cloudProviders.contains(provider) else { return nil }
        let families = featured(ids.filter { Self.provider($0) == provider }, limit: 8).compactMap { id in family(id).map { (id: id, family: $0) } }
        guard families.count >= 2, let main = mainRank[provider] else { return nil }
        func newest(_ pool: [(id: String, family: Family)]) -> (id: String, family: Family)? { pool.max { ($0.family.version, $0.family.rank) < ($1.family.version, $1.family.rank) } }
        guard let careful = newest(families.filter { $0.family.rank >= main }) ?? newest(families) else { return nil }
        let balanced = newest(families.filter { $0.family.rank == main }) ?? careful
        // Fast: the newest small size, and at one version the smallest of them.
        let fast = families.filter { $0.family.rank < main }.max { ($0.family.version, -$0.family.rank) < ($1.family.version, -$1.family.rank) } ?? balanced
        return [.fast: fast.id, .balanced: balanced.id, .careful: careful.id]
    }

    /// What the picker panel lists, top to bottom. Without a query: purpose, recent, one group per
    /// cloud provider (its sizes, or a setup row), local models (or a setup row). With a query: the
    /// matching chat models of every provider that lists any, local matches, and the typed ID itself
    /// when it names a provider ("openai:gpt-7") so an unlisted model stays reachable.
    public struct Section: Equatable, Sendable { public var key: String; public var rows: [Row] }
    public enum Row: Equatable, Sendable, Identifiable {
        case tier(ModelTier, String), model(String), setup(String), typed(String)
        public var id: String {
            switch self {
            case .tier(let tier, _): return "tier-" + tier.rawValue
            case .model(let id): return id
            case .setup(let provider): return "setup-" + provider
            case .typed(let id): return "typed-" + id
            }
        }
        public var modelID: String? { switch self { case .tier(_, let id), .model(let id), .typed(let id): return id; case .setup: return nil } }
    }
    public static func sections(query: String, tiers: [ModelTier: String]?, recent: [String], listings: [String: [String]], cloud: [String], local: [String]) -> [Section] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        var sections: [Section] = []
        let localModels = local.flatMap { listings[$0] ?? [] }
        if needle.isEmpty {
            if let tiers, tiers.count == ModelTier.allCases.count { sections.append(Section(key: "purpose", rows: ModelTier.allCases.map { .tier($0, tiers[$0] ?? "") })) }
            let offered = Set(tiers?.values ?? [:].values)
            let picks = recent.filter { !offered.contains($0) }
            if !picks.isEmpty { sections.append(Section(key: "recent", rows: picks.map(Row.model))) }
            for provider in cloud {
                if let listing = listings[provider], !listing.isEmpty { sections.append(Section(key: provider, rows: featured(listing).map(Row.model))) }
                else { sections.append(Section(key: provider, rows: [.setup(provider)])) }
            }
            sections.append(Section(key: "local", rows: localModels.isEmpty ? [.setup("local")] : localModels.map(Row.model)))
            return sections
        }
        for provider in cloud {
            let hits = search(listings[provider] ?? [], query: needle, limit: 6)
            if !hits.isEmpty { sections.append(Section(key: provider, rows: hits.map(Row.model))) }
        }
        let localHits = localModels.filter { model($0).lowercased().contains(needle.lowercased()) }
        if !localHits.isEmpty { sections.append(Section(key: "local", rows: localHits.map(Row.model))) }
        if needle.contains(":"), NativeModel.valid(needle), !sections.contains(where: { $0.rows.contains(.model(needle)) }) { sections.append(Section(key: "typed", rows: [.typed(needle)])) }
        return sections
    }

    /// Distinct models from a newest-first history, at most three, chat-capable only.
    public static func recent(_ history: [String]) -> [String] {
        var seen: [String] = []
        for id in history where isChatModel(id) && !seen.contains(id) { seen.append(id); if seen.count == 3 { break } }
        return seen
    }
}

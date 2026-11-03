import Foundation

public struct DictionaryEntry: Codable, Sendable {
    public struct Translation: Codable, Sendable {
        public let text: String
        public let pronunciation: String
        public let partOfSpeech: String?
        public let meaning: String?
        public let usage: String?
        public let nuance: String?
        public let examples: [String]?
        public let collocations: [String]?
        public let notes: [String]?
        /// The register of each example, in order ("everyday", "formal"…). Optional and lenient:
        /// older entries have none, and a malformed list is dropped without failing the entry.
        public let exampleRegisters: [String]?
        private enum CodingKeys: String, CodingKey { case text, pronunciation, partOfSpeech, meaning, usage, nuance, examples, collocations, notes, exampleRegisters }
        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            text = try container.decode(String.self, forKey: .text)
            pronunciation = try container.decode(String.self, forKey: .pronunciation)
            partOfSpeech = try container.decodeIfPresent(String.self, forKey: .partOfSpeech)
            meaning = try container.decodeIfPresent(String.self, forKey: .meaning)
            usage = try container.decodeIfPresent(String.self, forKey: .usage)
            nuance = try container.decodeIfPresent(String.self, forKey: .nuance)
            examples = try container.decodeIfPresent([String].self, forKey: .examples)
            collocations = try container.decodeIfPresent([String].self, forKey: .collocations)
            notes = try container.decodeIfPresent([String].self, forKey: .notes)
            exampleRegisters = ((try? container.decodeIfPresent([String].self, forKey: .exampleRegisters)) ?? nil)?.map { String($0.trimmingCharacters(in: .whitespacesAndNewlines).prefix(40)) }
        }
        /// The register of example `index`, when the model gave one.
        public func register(_ index: Int) -> String? { exampleRegisters.flatMap { $0.indices.contains(index) && !$0[index].isEmpty ? $0[index] : nil } }
    }
    /// A term the dictionary has no entry for: the closest forms, each with its class and a short gloss.
    public struct NotFound: Equatable, Sendable {
        public struct Suggestion: Equatable, Sendable { public let word: String; public let partOfSpeech: String?; public let meaning: String? }
        public let suggestions: [Suggestion]
    }
    /// `{"notFound": true, "suggestions": [...]}` replies; suggestions may be plain words or objects
    /// with word / partOfSpeech / meaning, at most 5. Nil for anything else.
    public static func notFound(_ text: String) -> NotFound? {
        guard let data = extractJSON(text).data(using: .utf8), data.count <= 65_536,
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any], object["notFound"] as? Bool == true else { return nil }
        func clean(_ value: Any?, _ limit: Int) -> String? {
            guard let value = (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty, value.count <= limit else { return nil }
            return value
        }
        let suggestions = (object["suggestions"] as? [Any] ?? []).compactMap { item -> NotFound.Suggestion? in
            if let word = clean(item, 120) { return .init(word: word, partOfSpeech: nil, meaning: nil) }
            guard let item = item as? [String: Any], let word = clean(item["word"], 120) else { return nil }
            return .init(word: word, partOfSpeech: clean(item["partOfSpeech"], 60), meaning: clean(item["meaning"], 200))
        }
        return NotFound(suggestions: Array(suggestions.prefix(5)))
    }
    /// Words related to the headword (same root, near, opposite). Optional: older entries and models
    /// that omit it still parse; a malformed value is dropped instead of failing the entry.
    public struct Related: Codable, Sendable, Equatable {
        public let derived: [String]?
        public let synonyms: [String]?
        public let antonyms: [String]?
        public init(derived: [String]? = nil, synonyms: [String]? = nil, antonyms: [String]? = nil) { self.derived = derived; self.synonyms = synonyms; self.antonyms = antonyms }
        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            func words(_ key: CodingKeys) -> [String]? {
                let list = ((try? container.decodeIfPresent([String].self, forKey: key)) ?? nil)?
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty && $0.count <= 120 }.prefix(6)
                return list.map(Array.init).flatMap { $0.isEmpty ? nil : $0 }
            }
            derived = words(.derived); synonyms = words(.synonyms); antonyms = words(.antonyms)
        }
        public var isEmpty: Bool { (derived ?? []).isEmpty && (synonyms ?? []).isEmpty && (antonyms ?? []).isEmpty }
        public var count: Int { (derived ?? []).count + (synonyms ?? []).count + (antonyms ?? []).count }
    }
    public let detectedSourceLang: String?
    public let headword: String
    public let pronunciation: String
    public let partOfSpeech: [String]?
    public let meaning: String
    public let translations: [Translation]
    public let examples: [String]?
    public let notes: [String]?
    public let related: Related?
    /// With a context, the 1-based translation that fits it (the prompt orders it first). Optional:
    /// older entries and lookups without context have none; an out-of-range value is dropped.
    public let contextSense: Int?
    private enum CodingKeys: String, CodingKey { case detectedSourceLang, headword, pronunciation, partOfSpeech, meaning, translations, examples, notes, related, contextSense }
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        detectedSourceLang = try container.decodeIfPresent(String.self, forKey: .detectedSourceLang)
        headword = try container.decode(String.self, forKey: .headword)
        pronunciation = try container.decode(String.self, forKey: .pronunciation)
        partOfSpeech = try container.decodeIfPresent([String].self, forKey: .partOfSpeech)
        meaning = try container.decode(String.self, forKey: .meaning)
        translations = try container.decode([Translation].self, forKey: .translations)
        examples = try container.decodeIfPresent([String].self, forKey: .examples)
        notes = try container.decodeIfPresent([String].self, forKey: .notes)
        // Optional and lenient: a related block the model got wrong never hides the entry.
        related = ((try? container.decodeIfPresent(Related.self, forKey: .related)) ?? nil).flatMap { $0.isEmpty ? nil : $0 }
        let sense = (try? container.decodeIfPresent(Int.self, forKey: .contextSense)) ?? nil
        let count = translations.count
        contextSense = sense.flatMap { (1...max(1, count)).contains($0) ? $0 : nil }
    }
    public static func preview(_ text: String) -> [String] {
        guard text.utf8.count <= 1048576, let expression = try? NSRegularExpression(pattern: #""(headword|pronunciation|meaning)"\s*:\s*("(?:[^"\\]|\\.)*")"#) else { return [] }
        let source = text as NSString; var found: [String: String] = [:]
        for match in expression.matches(in: text, range: NSRange(location: 0, length: source.length)) {
            let key = source.substring(with: match.range(at: 1)); guard found[key] == nil, let bytes = source.substring(with: match.range(at: 2)).data(using: .utf8), let value = try? JSONDecoder().decode(String.self, from: bytes) else { continue }; found[key] = value
        }
        return ["headword", "pronunciation", "meaning"].compactMap { found[$0] }
    }
    /// The JSON object inside a reply: strips a ```json fence or any text around the outermost braces.
    public static func extractJSON(_ text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.hasPrefix("{") || !trimmed.hasSuffix("}"),
              let start = trimmed.firstIndex(of: "{"), let end = trimmed.lastIndex(of: "}"), start < end else { return trimmed }
        return String(trimmed[start...end])
    }
    public static func parse(_ text: String) -> DictionaryEntry? {
        guard let data = extractJSON(text).data(using: .utf8), data.count <= 1_048_576,
              let entry = try? JSONDecoder().decode(Self.self, from: data),
              !entry.headword.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !entry.pronunciation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !entry.meaning.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !entry.translations.isEmpty, entry.translations.count <= 6,
              entry.translations.allSatisfy({ !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !$0.pronunciation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty })
        else { return nil }
        return entry
    }
    /// The shared dictionary prompt (contracts/native-workbench/dictionary-prompt.json via native.json).
    public static func prompt(_ request: Request) -> String {
        (NativeResources.shared.dictionaryPrompt["system"] ?? "")
            .replacingOccurrences(of: "{{TARGET}}", with: request.target)
            .replacingOccurrences(of: "{{SOURCE}}", with: request.source)
    }
    public static func userMessage(_ request: Request) -> String {
        (NativeResources.shared.dictionaryPrompt["user"] ?? "Term: {{TERM}}\nContext: {{CONTEXT}}")
            .replacingOccurrences(of: "{{CONTEXT}}", with: request.dictionaryContext ?? "")
            .replacingOccurrences(of: "{{TERM}}", with: request.input)
    }
}

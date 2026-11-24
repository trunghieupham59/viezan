import Foundation

public enum LauncherCalculator {
    public static func evaluate(_ input: String) -> String? {
        guard input.utf8.count <= 512, input.contains(where: { "+-*/^%()".contains($0) }) else { return nil }
        struct Parser {
            let chars: [Character]; var index = 0; var depth = 0
            enum Invalid: Error { case expression }
            mutating func space() { while index < chars.count && chars[index].isWhitespace { index += 1 } }
            mutating func take(_ value: Character) -> Bool { space(); if index < chars.count && chars[index] == value { index += 1; return true }; return false }
            mutating func sum() throws -> Double { var value = try product(); while true { if take("+") { value += try product() } else if take("-") { value -= try product() } else { return value } } }
            mutating func product() throws -> Double { var value = try unary(); while true { if take("*") { value *= try unary() } else if take("/") { let divisor = try unary(); guard divisor != 0 else { throw Invalid.expression }; value /= divisor } else { return value } } }
            mutating func unary() throws -> Double { depth += 1; defer { depth -= 1 }; guard depth < 64 else { throw Invalid.expression }; if take("+") { return try unary() }; if take("-") { return try -unary() }; return try power() }
            mutating func power() throws -> Double { var value = try atom(); if take("^") { value = pow(value, try unary()) }; while take("%") { value /= 100 }; return value }
            mutating func atom() throws -> Double {
                if take("(") { let value = try sum(); guard take(")") else { throw Invalid.expression }; return value }
                space(); let begin = index
                while index < chars.count && (chars[index].isASCII && chars[index].isNumber || chars[index] == ".") { index += 1 }
                guard begin < index, let value = Double(String(chars[begin..<index])), value.isFinite else { throw Invalid.expression }; return value
            }
        }
        var parser = Parser(chars: Array(input)); guard let value = try? parser.sum(), value.isFinite else { return nil }; parser.space(); guard parser.index == parser.chars.count else { return nil }
        return String(format: "%.12g", value)
    }
}
public struct LauncherFile: Identifiable, Sendable, Equatable {
    public var id: String; public var name: String
    public var isDirectory = false
    /// Last content change, seconds since 1970; nil when the file system does not say.
    public var modified: Double?
    public var contentMatch = false
}

/// Only the surrounding wildcards are Spotlight operators.
private func spotlightPattern(_ text: String) -> String {
    var pattern = "\"*"
    for scalar in text.unicodeScalars {
        if ["\\", "\"", "'", "*"].contains(scalar) { pattern.append("\\") }
        pattern.unicodeScalars.append(scalar)
    }
    return pattern + "*\"cd"
}

public enum LauncherFiles {
    private static let limit = 50
    /// Dependency and build folders hold thousands of files nobody opens from a launcher.
    static let skipped: Set<String> = ["node_modules", "DerivedData", "Pods", "Carthage", "site-packages", "__pycache__", "target", "dist", "build"]
    /// A result row for a path under `home`: regular files and folders only, nothing hidden, no
    /// dependency or build folders, no symbolic links.
    static func file(at path: String, home: String) -> LauncherFile? {
        let url = URL(fileURLWithPath: path)
        // Only the part below the home folder decides: an account named "build" still has files.
        guard path.hasPrefix(home + "/"), !path.dropFirst(home.count).split(separator: "/").contains(where: { $0.hasPrefix(".") || skipped.contains(String($0)) }),
              let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .isDirectoryKey, .isSymbolicLinkKey, .isPackageKey, .contentModificationDateKey]),
              values.isRegularFile == true || values.isDirectory == true, values.isSymbolicLink != true else { return nil }
        // A package (an app, a Pages document) opens like a file, so it reads as one.
        return LauncherFile(id: path, name: url.lastPathComponent, isDirectory: values.isDirectory == true && values.isPackage != true, modified: values.contentModificationDate?.timeIntervalSince1970)
    }
    static func contentQuery(_ text: String) -> String {
        "kMDItemTextContent == \(spotlightPattern(text))"
    }

    private static func indexedFiles(_ arguments: [String], home: String) throws -> some Sequence<LauncherFile> {
        // Never walk the home directory as a fallback. NUL separates paths even if a name contains a newline.
        try Task.checkCancellation()
        let result = try NativeCommand.run(URL(fileURLWithPath: "/usr/bin/mdfind"), ["-0", "-onlyin", home] + arguments, timeout: 3)
        guard result.status == 0 else { throw CocoaError(.fileReadUnknown) }
        let paths = String(decoding: result.output, as: UTF8.self)
        return paths.split(separator: "\0").lazy.compactMap { file(at: String($0), home: home) }
    }

    public static func search(_ input: String) -> [LauncherFile] {
        let query = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= 2, query.utf8.count <= 256, !query.utf8.contains(0) else { return [] }
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        var files = (try? Array(indexedFiles(["-name", query], home: home).prefix(limit))) ?? []
        guard query.count >= 3, files.count < limit, let matches = try? indexedFiles([contentQuery(query)], home: home) else { return files }
        var seen = Set(files.map(\.id))
        for var file in matches where seen.insert(file.id).inserted {
            file.contentMatch = true
            files.append(file)
            if files.count == limit { break }
        }
        return files
    }

    public static func search(_ plan: FileSearchPlan, now: Date = Date()) -> [LauncherFile] {
        (try? searchPlan(plan, now: now)) ?? []
    }

    fileprivate static func searchPlan(_ plan: FileSearchPlan, now: Date) throws -> [LauncherFile] {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        var files = try Array(indexedFiles([plan.query(matchAll: true, now: now)], home: home))
        if files.isEmpty, plan.keywords.count > 1 {
            files = try Array(indexedFiles([plan.query(matchAll: false, now: now)], home: home))
        }
        files.sort { ($0.modified ?? -.infinity) > ($1.modified ?? -.infinity) }
        return Array(files.prefix(limit))
    }
}

public struct FileSearchPlan: Equatable, Sendable {
    public enum Kind: String, CaseIterable, Sendable {
        case pdf, document, spreadsheet, presentation, image, text, audio, video, folder

        fileprivate var contentTypes: [String] {
            switch self {
            case .pdf: ["com.adobe.pdf"]
            // Excel/Numbers and PowerPoint/Keynote share type trees. Word and Pages need their individual types.
            case .document: ["com.microsoft.word.doc", "org.openxmlformats.wordprocessingml.document", "com.apple.iwork.pages.pages", "com.apple.iwork.pages.sffpages"]
            case .spreadsheet: ["public.spreadsheet"]
            case .presentation: ["public.presentation"]
            case .image: ["public.image"]
            case .text: ["public.plain-text"]
            case .audio: ["public.audio"]
            case .video: ["public.movie"]
            case .folder: ["public.folder"]
            }
        }
    }

    public let keywords: [String]
    public let kinds: [Kind]
    public let withinDays: Int?

    public static let instruction: String = """
    Given a file description in any language, return only one JSON object of the form {"keywords":[...],"kinds":[...],"within_days":N|null}.
    Choose 1–6 distinct keywords of 1–64 characters likely to appear in the filename or contents. Keep the original language and optionally add common English translations.
    Choose kinds from pdf, document, spreadsheet, presentation, image, text, audio, video, folder. Use [] for any kind.
    Infer the modification window in days (1–3650). Use 14 for last week, 62 for last month and null when unspecified. No explanation or Markdown.
    """

    public static func parse(_ reply: String) -> FileSearchPlan? {
        guard reply.count <= 4_000 else { return nil }
        let json: Any
        if let whole = try? JSONSerialization.jsonObject(with: Data(reply.utf8), options: .fragmentsAllowed) {
            json = whole
        } else {
            guard let start = reply.firstIndex(of: "{"), let end = reply.lastIndex(of: "}"), start < end,
                  let wrapped = try? JSONSerialization.jsonObject(with: Data(reply[start...end].utf8)) else { return nil }
            json = wrapped
        }
        guard let object = json as? [String: Any], let terms = object["keywords"] as? [String],
              let rawKinds = (object["kinds"] ?? []) as? [String] else { return nil }
        var keywords: [String] = []
        for term in terms {
            let word = term.trimmingCharacters(in: .whitespacesAndNewlines)
            guard (1...64).contains(word.count), !word.utf8.contains(0),
                  !keywords.contains(where: { $0.caseInsensitiveCompare(word) == .orderedSame }) else { continue }
            keywords.append(word)
            if keywords.count == 6 { break }
        }
        guard !keywords.isEmpty else { return nil }
        var kinds: [Kind] = []
        for kind in rawKinds.compactMap(Kind.init(rawValue:)) where !kinds.contains(kind) {
            kinds.append(kind)
        }
        var withinDays: Int?
        if let number = object["within_days"] as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
           let days = number as? Int, (1...3650).contains(days) { withinDays = days }
        return FileSearchPlan(keywords: keywords, kinds: kinds, withinDays: withinDays)
    }

    public func query(matchAll: Bool, now: Date) -> String {
        let terms = keywords.map { word in
            let pattern = spotlightPattern(word)
            return "(kMDItemFSName == \(pattern) || kMDItemTextContent == \(pattern))"
        }
        let joined = terms.joined(separator: matchAll ? " && " : " || ")
        var clauses = [terms.count > 1 ? "(\(joined))" : joined]
        let types = kinds.flatMap(\.contentTypes).map { "kMDItemContentTypeTree == \"\($0)\"c" }
        if !types.isEmpty { clauses.append("(" + types.joined(separator: " || ") + ")") }
        if let withinDays {
            let cutoff = now.addingTimeInterval(-Double(withinDays) * 86_400)
            clauses.append("kMDItemFSContentChangeDate >= $time.iso(\(cutoff.ISO8601Format()))")
        }
        return clauses.joined(separator: " && ")
    }

    public func summary(text: (String) -> String) -> String {
        var parts = [keywords.joined(separator: ", ")]
        if !kinds.isEmpty {
            parts.append(kinds.map { text($0 == .folder ? "launcher_folder" : "fileKind_" + $0.rawValue) }.joined(separator: ", "))
        }
        if let withinDays { parts.append(text("launcher_ai_files_days").replacingOccurrences(of: "{count}", with: String(withinDays))) }
        return parts.joined(separator: " · ")
    }

    public static func search(_ plan: FileSearchPlan, now: Date = Date()) throws -> [LauncherFile] {
        try LauncherFiles.searchPlan(plan, now: now)
    }
}
/// Orders launcher applications for a query: name prefix, then a word prefix, then anywhere;
/// recently opened apps first within each tier. An empty query lists only recent apps.
public enum LauncherRanking {
    public static func applications(_ apps: [LauncherApplication], query: String, recent: [String], limit: Int = 8) -> [LauncherApplication] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let order = Dictionary(recent.enumerated().map { ($1, $0) }, uniquingKeysWith: { first, _ in first })
        guard !needle.isEmpty else { return Array(apps.filter { order[$0.id] != nil }.sorted { order[$0.id]! < order[$1.id]! }.prefix(limit)) }
        func tier(_ name: String) -> Int? {
            let options: String.CompareOptions = [.caseInsensitive, .diacriticInsensitive]
            if name.range(of: needle, options: options.union(.anchored)) != nil { return 0 }
            if name.split(whereSeparator: { $0 == " " || $0 == "-" || $0 == "." }).contains(where: { $0.range(of: needle, options: options.union(.anchored)) != nil }) { return 1 }
            return name.range(of: needle, options: options) != nil ? 2 : nil
        }
        return Array(apps.compactMap { app in tier(app.name).map { (app, $0) } }
            .sorted { ($0.1, order[$0.0.id] ?? Int.max, $0.0.name.count) < ($1.1, order[$1.0.id] ?? Int.max, $1.0.name.count) }
            .map(\.0).prefix(limit))
    }
}
/// An "amount + currency" launcher query: `2$`, `$2`, `2 usd`, `500k vnd`, `2tr`, `100 usd to jpy`, `100 đô sang yên`.
public struct CurrencyQuery: Equatable, Sendable {
    public var amount: Double
    /// ISO 4217 code of the typed currency.
    public var from: String
    /// ISO 4217 code of a target named in the query, if any.
    public var to: String?
}
/// Port of the retired renderer's `currencyQuery.ts` / `currencies.ts`: aliases are matched after
/// folding (no diacritics, `đ` → `d`, lower case), so `đô la` is listed as `do la`.
public enum LauncherCurrency {
    public static let currencies: [(code: String, aliases: [String])] = [
        ("USD", ["$", "us$", "usd", "dollar", "dollars", "bucks", "do", "do la", "dola", "do-la", "ドル", "米ドル"]),
        ("VND", ["₫", "d", "vnd", "vnđ", "dong", "dong viet", "ドン"]),
        ("JPY", ["¥", "￥", "jpy", "yen", "円", "えん"]),
        ("EUR", ["€", "eur", "euro", "euros", "ユーロ"]),
        ("GBP", ["£", "gbp", "pound", "pounds", "bang", "bang anh", "ポンド"]),
        ("KRW", ["₩", "krw", "won", "ウォン"]),
        ("CNY", ["cny", "rmb", "yuan", "te", "nhan dan te", "元", "人民元"]),
        ("TWD", ["nt$", "twd", "dai te", "台湾ドル"]),
        ("HKD", ["hk$", "hkd", "香港ドル"]),
        ("SGD", ["s$", "sgd", "シンガポールドル"]),
        ("THB", ["฿", "thb", "baht", "bat", "バーツ"]),
        ("MYR", ["rm", "myr", "ringgit", "リンギット"]),
        ("IDR", ["rp", "idr", "rupiah", "ルピア"]),
        ("PHP", ["₱", "php", "peso", "pesos", "ペソ"]),
        ("INR", ["₹", "inr", "rupee", "rupees", "ルピー"]),
        ("AUD", ["a$", "au$", "aud", "do uc", "豪ドル"]),
        ("NZD", ["nz$", "nzd"]),
        ("CAD", ["c$", "ca$", "cad", "do canada", "カナダドル"]),
        ("CHF", ["chf", "franc", "francs", "フラン"]),
        ("SEK", ["sek", "krona", "kronor"]),
        ("NOK", ["nok", "krone", "kroner"]),
        ("DKK", ["dkk"]),
        ("PLN", ["pln", "zloty", "zł"]),
        ("CZK", ["czk", "koruna"]),
        ("TRY", ["₺", "try", "lira"]),
        ("RUB", ["₽", "rub", "ruble", "rubles", "rup", "ルーブル"]),
        ("BRL", ["r$", "brl", "real", "reais"]),
        ("MXN", ["mx$", "mxn"]),
        ("ZAR", ["zar", "rand"]),
        ("AED", ["aed", "dirham"]),
    ]
    public static let codes = currencies.map(\.code)
    static func fold(_ text: String) -> String {
        String(String.UnicodeScalarView(text.decomposedStringWithCanonicalMapping.unicodeScalars.filter { !$0.properties.isDiacritic }))
            .replacingOccurrences(of: "đ", with: "d").replacingOccurrences(of: "Đ", with: "d").lowercased()
    }
    private static let aliases: [String: String] = {
        var map: [String: String] = [:]
        for currency in currencies { for alias in currency.aliases { map[fold(alias)] = currency.code }; map[currency.code.lowercased()] = currency.code }
        return map
    }()
    private static let multipliers: [String: Double] = ["k": 1_000, "tr": 1_000_000, "m": 1_000_000, "万": 10_000]
    private static let pattern: NSRegularExpression = {
        // Longest alias first so `us$` is not read as `us` + `$`, and `inr` not as `in` + `r`.
        func group(_ values: [String]) -> String { "(?:" + values.sorted { $0.count > $1.count }.map(NSRegularExpression.escapedPattern(for:)).joined(separator: "|") + ")" }
        let unit = group(Array(aliases.keys)), multiplier = group(Array(multipliers.keys))
        let separator = group(["->", "→", "=", "to", "in", "into", "sang", "thanh", "ra", "den", "に", "へ"])
        let number = #"(?:\d[\d.,]*\d|\d|\.\d+)"#
        return try! NSRegularExpression(pattern: "^(?:(\(unit))\\s*)?(\(number))(\(multiplier))?(?:\\s*(\(unit)))?(?:\\s*\(separator)\\s*(\(unit))?|\\s+(\(unit)))?$")
    }()
    public static func parse(_ query: String, locale: String) -> CurrencyQuery? {
        let text = fold(query.trimmingCharacters(in: .whitespacesAndNewlines))
        guard !text.isEmpty, text.count <= 60, let match = pattern.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) else { return nil }
        func part(_ index: Int) -> String? { Range(match.range(at: index), in: text).map { String(text[$0]) } }
        let prefix = part(1), suffix = part(4)
        guard let from = aliases[prefix ?? suffix ?? ""], let number = part(2), let parsed = LauncherCurrency.number(number, locale: locale) else { return nil }
        let amount = parsed * (part(3).flatMap { multipliers[$0] } ?? 1)
        guard amount.isFinite, amount >= 0, amount <= 1e15 else { return nil }
        // `$2 vnd` names both ends without a separator: the suffix becomes the target.
        let target = part(5) ?? part(6) ?? (prefix != nil && suffix != nil ? suffix : nil)
        let to = target.flatMap { aliases[$0] }
        if target != nil && to == nil { return nil }
        return CurrencyQuery(amount: amount, from: from, to: to == from ? nil : to)
    }
    /// The user's launcher choice wins, then the UI language; never the typed currency itself.
    public static func defaultTarget(locale: String, preferred: String?, from: String? = nil) -> String {
        let local = ["en": "USD", "vi": "VND", "ja": "JPY"][locale]
        return [preferred, local, "USD", "EUR"].compactMap { $0 }.first { codes.contains($0) && $0 != from } ?? "USD"
    }
    /// One plain number in the locale's `.` / `,` conventions (`1.234,5` in Vietnamese, `1,234.5` elsewhere).
    public static func number(_ raw: String, locale: String) -> Double? {
        guard raw.range(of: #"^(?:\d[\d.,]*\d|\d|\.\d+)$"#, options: .regularExpression) != nil else { return nil }
        let lastDot = raw.lastIndex(of: "."), lastComma = raw.lastIndex(of: ",")
        var normalized = raw
        if let lastDot, let lastComma {
            let decimal: Character = lastDot > lastComma ? "." : ",", grouping: Character = decimal == "." ? "," : "."
            guard raw.filter({ $0 == decimal }).count == 1 else { return nil }
            normalized = String(raw.filter { $0 != grouping }.map { $0 == decimal ? "." : $0 })
        } else if lastDot != nil || lastComma != nil {
            let separator: Character = lastDot != nil ? "." : ",", grouping: Character = locale == "vi" ? "." : ","
            let parts = raw.split(separator: separator, omittingEmptySubsequences: false).map(String.init)
            let grouped = parts[0].range(of: #"^[1-9]\d{0,2}$"#, options: .regularExpression) != nil && parts.dropFirst().allSatisfy { $0.count == 3 }
            if parts.count > 2 { guard separator == grouping, grouped else { return nil }; normalized = parts.joined() }
            else { normalized = parts.joined(separator: separator == grouping && grouped ? "" : ".") }
        }
        guard let value = Double(normalized), value.isFinite else { return nil }
        return value
    }
}

/// What a ⌘K palette query means beyond page names: a sum, a `t ` / `d ` prefix, or a `?` question.
/// Shared with Qt (`LauncherTools::paletteQuery`).
public enum PaletteQuery: Equatable, Sendable {
    case calculation(String), translate(String), lookup(String), ask(String)
    public static func parse(_ raw: String) -> PaletteQuery? {
        let query = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return nil }
        if let value = LauncherCalculator.evaluate(query) { return .calculation(value) }
        if query.hasPrefix("?") { let text = query.drop(while: { $0 == "?" }).trimmingCharacters(in: .whitespaces); return text.isEmpty ? nil : .ask(text) }
        if raw.lowercased().hasPrefix("t ") { let text = raw.dropFirst(2).trimmingCharacters(in: .whitespacesAndNewlines); return text.isEmpty ? nil : .translate(text) }
        if raw.lowercased().hasPrefix("d ") { let text = raw.dropFirst(2).trimmingCharacters(in: .whitespacesAndNewlines); return text.isEmpty ? nil : .lookup(text) }
        return nil
    }
}

/// Launcher control order and localized search rules for the future Qt implementation.
public enum LauncherControls: String, CaseIterable, Identifiable, Sendable {
    case awake, mute, dark

    public var id: String { rawValue }
    public var nameKey: String { "launcher_control_" + id }
    public var keywordsKey: String { nameKey + "_keywords" }

    public static func matches(_ query: String, name: String, keywords: String) -> Bool {
        let prefix = LauncherCurrency.fold(query.trimmingCharacters(in: .whitespacesAndNewlines))
        guard prefix.count >= 2 else { return false }
        let terms = [name] + keywords.components(separatedBy: ",")
        return terms.contains { term in
            let folded = LauncherCurrency.fold(term.trimmingCharacters(in: .whitespacesAndNewlines))
            return folded.hasPrefix(prefix) || folded.split { !$0.isLetter && !$0.isNumber }.contains { $0.hasPrefix(prefix) }
        }
    }

    public static func rows(_ input: String, text: (String) -> String) -> [Self] {
        let query = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= 2, !query.hasPrefix("="), !query.hasPrefix("?"), PaletteQuery.parse(query) == nil else { return [] }
        return allCases.filter { matches(query, name: text($0.nameKey), keywords: text($0.keywordsKey)) }
    }
}

/// The launcher before anything is typed (Launcher board): continue the quick AI conversation and
/// Viezan's own pages. Shared with Qt (`WorkbenchBridge::launcherHome`); where the quick session id
/// is remembered stays with each app.
public enum LauncherHome {
    public struct Page: Equatable, Sendable { public let route: String; public let title: String; public let symbol: String }
    /// Viezan pages in launcher order; Settings is always offered, the rest follow enabled modules.
    public static let pages: [Page] = [
        Page(route: "translate", title: "launcher_translate", symbol: "character.bubble"),
        Page(route: "dictionary", title: "launcher_dictionary", symbol: "book"),
        Page(route: "interpret", title: "launcher_live", symbol: "waveform"),
        Page(route: "chat", title: "ai_chat_popup_open_in_chat", symbol: "bubble.left.and.bubble.right"),
        Page(route: "settings", title: "quickOpenSettings", symbol: "gearshape"),
    ]
    public static func pages(enabled: (String) -> Bool) -> [Page] { pages.filter { $0.route == "settings" || enabled($0.route) } }
    /// A quick conversation worth continuing: a live chat with at least one message.
    public static func continuable(_ session: Session?) -> Session? {
        guard let session, session.feature == .chat, session.archived != true, !session.messages.isEmpty else { return nil }
        return session
    }
    /// Within 30 minutes of its last change a new question continues it instead of starting over.
    public static let freshFor: Double = 1800
    public static func fresh(_ session: Session, now: Double) -> Bool { now - (session.updated ?? 0) < freshFor }
}

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
public struct LauncherFile: Identifiable, Sendable { public var id: String; public var name: String }
public enum LauncherFiles {
    /// Dependency and build folders hold thousands of files nobody opens from a launcher.
    static let skipped: Set<String> = ["node_modules", "DerivedData", "Pods", "Carthage", "site-packages", "__pycache__", "target", "dist", "build"]
    public static func search(_ input: String) -> [LauncherFile] {
        let query = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= 2, query.utf8.count <= 256 else { return [] }
        let manager = FileManager.default
        if let result = try? NativeCommand.run(URL(fileURLWithPath: "/usr/bin/mdfind"), ["-onlyin", manager.homeDirectoryForCurrentUser.path, "-name", query], timeout: 3), result.status == 0 {
            let paths = String(decoding: result.output, as: UTF8.self).split(separator: "\n").map(String.init)
            let indexed = paths.compactMap { path -> LauncherFile? in
                let url = URL(fileURLWithPath: path)
                guard path.hasPrefix(manager.homeDirectoryForCurrentUser.path + "/"), !url.pathComponents.contains(where: { $0.hasPrefix(".") || LauncherFiles.skipped.contains($0) }), let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .isDirectoryKey, .isSymbolicLinkKey]), (values.isRegularFile == true || values.isDirectory == true), values.isSymbolicLink != true else { return nil }
                return LauncherFile(id: path, name: url.lastPathComponent)
            }
            return Array(indexed.prefix(50))
        }
        // Without Spotlight there are no file results: walking Desktop, Documents and Downloads
        // would raise macOS's folder-access prompt in the middle of typing.
        return []
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

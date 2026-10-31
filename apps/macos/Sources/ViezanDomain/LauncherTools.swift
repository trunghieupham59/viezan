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

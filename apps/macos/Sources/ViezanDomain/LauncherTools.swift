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
    public static func search(_ input: String) -> [LauncherFile] {
        let query = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= 2, query.utf8.count <= 256 else { return [] }
        let manager = FileManager.default
        if let result = try? NativeCommand.run(URL(fileURLWithPath: "/usr/bin/mdfind"), ["-onlyin", manager.homeDirectoryForCurrentUser.path, "-name", query], timeout: 3), result.status == 0 {
            let paths = String(decoding: result.output, as: UTF8.self).split(separator: "\n").map(String.init)
            let indexed = paths.compactMap { path -> LauncherFile? in
                let url = URL(fileURLWithPath: path)
                guard path.hasPrefix(manager.homeDirectoryForCurrentUser.path + "/"), !url.pathComponents.contains(where: { $0.hasPrefix(".") }), let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .isDirectoryKey, .isSymbolicLinkKey]), (values.isRegularFile == true || values.isDirectory == true), values.isSymbolicLink != true else { return nil }
                return LauncherFile(id: path, name: url.lastPathComponent)
            }
            if !indexed.isEmpty { return Array(indexed.prefix(50)) }
        }
        var results: [LauncherFile] = []; var visited = 0
        let deadline = Date().addingTimeInterval(2)
        for folder in [FileManager.SearchPathDirectory.documentDirectory, .desktopDirectory, .downloadsDirectory] {
            guard let root = manager.urls(for: folder, in: .userDomainMask).first,
                  let iterator = manager.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey, .isDirectoryKey, .isSymbolicLinkKey], options: [.skipsHiddenFiles, .skipsPackageDescendants]) else { continue }
            for case let url as URL in iterator {
                visited += 1; if visited > 20000 || results.count >= 50 || Date() > deadline || Task.isCancelled { return results }
                guard let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .isDirectoryKey, .isSymbolicLinkKey]), values.isSymbolicLink != true else { continue }
                if (values.isRegularFile == true || values.isDirectory == true) && url.lastPathComponent.localizedStandardContains(query) { results.append(.init(id: url.path, name: url.lastPathComponent)) }
            }
        }
        return results
    }
}

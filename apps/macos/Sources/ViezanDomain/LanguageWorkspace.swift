import Foundation

public struct SavedPrompt: Codable, Identifiable, Equatable, Sendable {
    public var id = UUID().uuidString
    public var name: String
    public var text: String
    public init(name: String, text: String) { self.name = name; self.text = text }
}
public enum LanguageSegments {
    public static func sentences(_ text: String) -> [String] {
        // Keep the delimiter with the sentence. Assembly is allowed only for
        // candidates whose segment count exactly matches the source.
        guard let expression = try? NSRegularExpression(pattern: #"[^.!?。！？\n]+(?:[.!?。！？]+|\n|$)"#) else { return [text] }
        let value = text as NSString
        return expression.matches(in: text, range: NSRange(location: 0, length: value.length)).map { value.substring(with: $0.range).trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }
    public static func chunks(_ text: String, limit: Int = 3000) -> [String] {
        guard text.count > limit else { return [text] }
        var result: [String] = [], chunk = ""
        for line in text.components(separatedBy: "\n") {
            var rest = line
            if !chunk.isEmpty && chunk.count + rest.count + 1 > limit { result.append(chunk); chunk = "" }
            while rest.count > limit { if !chunk.isEmpty { result.append(chunk); chunk = "" }; let boundary = rest.index(rest.startIndex, offsetBy: limit); let split = rest[..<boundary].lastIndex(where: { $0.isWhitespace }) ?? boundary; let end = split == rest.startIndex ? boundary : split; result.append(String(rest[..<end])); rest = String(rest[end...]).trimmingCharacters(in: .whitespaces) }
            chunk += (chunk.isEmpty ? "" : "\n") + rest
        }
        if !chunk.isEmpty { result.append(chunk) }; return result
    }
}
public enum NativeProvider {
    public static func stream(_ request: Request, usage: @escaping @Sendable (TokenUsage) async -> Void = { _ in }, receive: @escaping @Sendable (String) async -> Void) async throws {
        let chunks = request.feature == .translate && !ImageTranslation.isImageRequest(request) ? LanguageSegments.chunks(request.input) : [request.input]
        for (index, text) in chunks.enumerated() {
            try Task.checkCancellation(); var part = request; part.input = text
            if index > 0 { await receive("\n\n") }
            if part.model.hasPrefix("ollama:") { try await LocalProvider.stream(part, usage: usage, receive: receive) }
            else { try await CloudProvider.stream(part, usage: usage, receive: receive) }
        }
    }
}

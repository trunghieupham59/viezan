import Foundation

/// Development-only bounded event trace. Never pass selected text, output or provider errors.
@MainActor public enum SelectionDiagnostics {
    #if DEBUG
    private static var events: [String] = []
    #endif
    public static func record(_ event: String) {
        #if DEBUG
        guard let metadata = Bundle.main.object(forInfoDictionaryKey: "ViezanDevelopment") as? [String: String],
              let root = metadata["root"] else { return }
        events.append("\(Date().timeIntervalSince1970) \(event)")
        events = Array(events.suffix(60))
        let file = URL(fileURLWithPath: root).appendingPathComponent(".native-build/dev/selection-diagnostics.log")
        try? Data(events.joined(separator: "\n").utf8).write(to: file, options: .atomic)
        #endif
    }
}

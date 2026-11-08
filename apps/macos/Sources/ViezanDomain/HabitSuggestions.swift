import Foundation

public enum HabitAction: Equatable, Hashable, Sendable {
    case chatMode(String)
    case translatePair(source: String, target: String)
    case dictionary
}
public struct HabitSuggestion: Equatable, Identifiable, Sendable {
    public let action: HabitAction
    public let count: Int
    public let score: Double
    public var id: String {
        switch action {
        case .chatMode(let mode): return "chat-" + mode
        case .translatePair(let source, let target): return "translate-" + source + "-" + target
        case .dictionary: return "dictionary"
        }
    }
}
public enum HabitSuggestions {
    static func action(for session: Session) -> HabitAction? {
        switch session.feature {
        case .chat: return session.chatMode.flatMap { ["web", "research", "image"].contains($0) ? .chatMode($0) : nil }
        case .translate: return .translatePair(source: session.source, target: session.target)
        case .dictionary: return .dictionary
        }
    }
    public static func suggest(sessions: [Session], now: Double, calendar: Calendar = .current, excluding current: HabitAction? = nil, limit: Int = 3) -> [HabitSuggestion] {
        guard now.isFinite, limit > 0 else { return [] }
        func minute(_ time: Double) -> Int {
            let parts = calendar.dateComponents([.hour, .minute], from: Date(timeIntervalSince1970: time))
            return (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
        }
        let currentMinute = minute(now)
        var occurrences: [HabitAction: [Double]] = [:]
        for session in sessions {
            guard session.comparisonParent == nil, !session.messages.isEmpty || !session.output.isEmpty,
                  let updated = session.updated, updated.isFinite, updated <= now, now - updated <= 30 * 86_400,
                  let action = action(for: session), action != current else { continue }
            occurrences[action, default: []].append(updated)
        }
        return occurrences.compactMap { action, times -> (HabitSuggestion, Double)? in
            let timely = times.filter { let distance = abs(minute($0) - currentMinute); return min(distance, 1440 - distance) <= 90 }.count >= 3
            guard times.count >= 3 || timely else { return nil }
            let score = times.reduce(0) { $0 + exp(-(now - $1) / 86_400 / 10) } * (timely ? 2 : 1)
            return (HabitSuggestion(action: action, count: times.count, score: score), times.max()!)
        }.sorted {
            if $0.0.score != $1.0.score { return $0.0.score > $1.0.score }
            if $0.1 != $1.1 { return $0.1 > $1.1 }
            return $0.0.id < $1.0.id
        }.prefix(limit).map { $0.0 }
    }
}

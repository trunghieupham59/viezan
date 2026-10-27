import Foundation

/// Pause-based turn hints, not biometric speaker recognition.
struct SpeakerTurns {
    var current = "Speaker 1", count = 1
    var changed: Double = 0, ended: Double = 0
    var history: [String] = []
    mutating func next(start: Double, end: Double) -> String {
        let silence = max(0, start - ended)
        if silence >= 2 && start - changed > 2.5 {
            let previous = current
            if count == 1 { count = 2; current = "Speaker 2" }
            else if count == 2 {
                if silence >= 4 && history.count >= 4 { count = 3; current = "Speaker 3" }
                else { current = previous == "Speaker 1" ? "Speaker 2" : "Speaker 1" }
            } else if count < 6 {
                if silence >= 4 { count += 1; current = "Speaker \(count)" }
                else if let other = history.reversed().first(where: { $0 != previous }) { current = other }
                else { count += 1; current = "Speaker \(count)" }
            } else {
                var recent: [String] = []
                for label in history.reversed() where !recent.contains(label) { recent.append(label) }
                current = (1...6).map { "Speaker \($0)" }.first(where: { !recent.contains($0) }) ?? recent.last ?? "Speaker 1"
            }
            if current != previous { changed = start }
        }
        ended = end; history.append(current); history = Array(history.suffix(10)); return current
    }
}

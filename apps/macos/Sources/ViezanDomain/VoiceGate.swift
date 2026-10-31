import Foundation

/// Splits live microphone audio into utterances. Speech is judged against the room's
/// own noise floor, not a fixed level, so a fan or air conditioner neither keeps a clip
/// open nor reaches speech-to-text (which invents words for noise). Levels are smoothed
/// over 0.3 s: speech is sustained, room noise and taps flicker. A clip closes at a pause;
/// a long monologue closes at its next short gap rather than mid-word.
struct VoiceGate: Equatable {
    enum Event: Equatable { case none, discard, finish }
    static let frame = 0.1                  // seconds per meter reading
    static let window = 3                   // readings averaged (by power) per decision
    static let margin = 6.0                 // dB above the noise floor that counts as voice
    static let quietest = -60.0             // dB; below this nothing is voice
    static let pause = 0.7                  // seconds of quiet that end an utterance
    static let longClip = 12.0              // after this, any short gap ends the clip
    static let gap = 0.3
    static let maximum = 25.0               // seconds of one utterance
    static let idle = 10.0                  // a clip with no voice this long is dropped
    static let minimumRun = 0.5             // an utterance has this much continuous voice; clicks do not

    private(set) var floor: Double?
    private(set) var heard = false
    private var recent: [Double] = []
    private var waiting = 0.0, length = 0.0, quiet = 0.0, run = 0.0, longest = 0.0

    /// Feeds one meter reading (dBFS) of the open clip; `.finish`/`.discard` end it.
    mutating func feed(_ decibels: Double) -> Event {
        let level = decibels.isFinite ? max(-160, decibels) : -160
        recent = Array((recent + [pow(10, level / 10)]).suffix(Self.window))
        let smoothed = 10 * log10(recent.reduce(0, +) / Double(recent.count))
        let base = floor ?? level
        let voice = smoothed > max(base + Self.margin, Self.quietest)
        // The floor tracks the quiet troughs: it drops at once and rises slowly (~20 s), never on speech.
        if level < base { floor = level } else if !voice { floor = base + (level - base) * 0.005 } else { floor = base }
        if voice { heard = true; quiet = 0; run += Self.frame; longest = max(longest, run) } else { quiet += Self.frame; run = 0 }
        guard heard else {
            waiting += Self.frame
            if waiting >= Self.idle { reset(); return .discard }
            return .none
        }
        length += Self.frame
        let ended = quiet >= Self.pause || (length >= Self.longClip && quiet >= Self.gap) || length >= Self.maximum
        guard ended else { return .none }
        let event: Event = longest >= Self.minimumRun - 0.001 ? .finish : .discard
        reset(); return event
    }
    /// A new clip keeps the learned noise floor and the smoothing window.
    mutating func reset() { heard = false; waiting = 0; length = 0; quiet = 0; run = 0; longest = 0 }

    /// A transcript with no letters or digits ("." or "...") is silence, not speech.
    static func meaningful(_ transcript: String) -> Bool {
        transcript.unicodeScalars.contains { CharacterSet.alphanumerics.contains($0) }
    }
}

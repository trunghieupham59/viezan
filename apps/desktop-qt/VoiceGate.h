#pragma once
#include <QString>
#include <QtGlobal>
#include <cmath>
// Splits live microphone audio into utterances. Speech is judged against the room's
// own noise floor, not a fixed level, so a fan or air conditioner neither keeps a clip
// open nor reaches speech-to-text (which invents words for noise). Levels are smoothed
// over 0.3 s: speech is sustained, room noise and taps flicker. A clip closes at a pause;
// a long monologue closes at its next short gap rather than mid-word.
// Mirrors ViezanDomain/VoiceGate.swift.
struct VoiceGate {
    enum Event { None, Discard, Finish };
    static constexpr int window = 3;
    static constexpr double frame = 0.1, margin = 6, quietest = -60, pause = 0.7, longClip = 12, gap = 0.3, maximum = 25, idle = 10, minimumRun = 0.5;
    double floor = NAN; bool heard = false;
    double recent[window] = {}; int count = 0;
    double waiting = 0, length = 0, quiet = 0, run = 0, longest = 0;
    // One meter reading (dBFS) of the open clip; Finish/Discard end it.
    Event feed(double decibels) {
        const auto level = std::isfinite(decibels) ? qMax(-160.0, decibels) : -160.0;
        recent[count++ % window] = std::pow(10, level / 10);
        double power = 0; const auto used = qMin(count, window); for (int i = 0; i < used; ++i) power += recent[i];
        const auto smoothed = 10 * std::log10(power / used);
        const auto base = std::isnan(floor) ? level : floor;
        const auto voice = smoothed > qMax(base + margin, quietest);
        // The floor tracks the quiet troughs: it drops at once and rises slowly (~20 s), never on speech.
        floor = level < base ? level : !voice ? base + (level - base) * 0.005 : base;
        if (voice) { heard = true; quiet = 0; run += frame; longest = qMax(longest, run); } else { quiet += frame; run = 0; }
        if (!heard) { waiting += frame; if (waiting >= idle) { reset(); return Discard; } return None; }
        length += frame;
        if (quiet < pause && !(length >= longClip && quiet >= gap) && length < maximum) return None;
        const auto event = longest >= minimumRun - 0.001 ? Finish : Discard; reset(); return event;
    }
    // A new clip keeps the learned noise floor and the smoothing window.
    void reset() { heard = false; waiting = 0; length = 0; quiet = 0; run = 0; longest = 0; }
    static double decibels(double rms) { return rms > 0 ? 20 * std::log10(rms) : -160; }
    // A transcript with no letters or digits ("." or "...") is silence, not speech.
    static bool meaningful(const QString &text) { for (const auto c : text) if (c.isLetterOrNumber()) return true; return false; }
};

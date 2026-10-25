import '../../styles/speakers.css'

/**
 * SPEAKER_COLORS — rotating tone classes for speaker badges (see
 * styles/speakers.css). Each maps to a distinct `--vzn-tone-*` token, so the
 * active style preset recolours speakers. The badge always shows the speaker
 * name, so colour is never the only signal.
 * Shared across SegmentRow, TranslationRow, and SpeakerAnalysisText.
 */
export const SPEAKER_COLORS = [
  'speaker-tone speaker-tone--blue',
  'speaker-tone speaker-tone--violet',
  'speaker-tone speaker-tone--green',
  'speaker-tone speaker-tone--orange',
]

/**
 * Resolve a tone class for a speaker label like "Speaker 3".
 * Falls back to index 0 when the label has no trailing digits (e.g. legacy
 * data) — Number('') is NaN and would otherwise read SPEAKER_COLORS[NaN] = undefined.
 */
export function getSpeakerColorClass(speaker: string): string {
  const digits = speaker.replace(/\D/g, '')
  const n = digits ? Number(digits) : 1
  const idx = Number.isFinite(n) && n > 0 ? (n - 1) % SPEAKER_COLORS.length : 0
  return SPEAKER_COLORS[idx]
}

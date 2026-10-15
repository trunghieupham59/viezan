/**
 * Pure helpers for the Live Translate session lifecycle.
 *
 * Kept free of React so the capture-resource teardown, duplicate-chunk filter
 * and translation-ordering rules can be unit tested without browser media APIs.
 */
import { jaccardSimilarity } from '../../utils/live-translate'

/** An identical chunk is only treated as a Whisper re-emit inside this window. */
export const DUPLICATE_CHUNK_WINDOW_MS = 6_000

/** Containment / near-duplicate matches only apply to text at least this long. */
export const DUPLICATE_MIN_LONG_CHARS = 20

const JACCARD_DUPLICATE_THRESHOLD = 0.92

export function normaliseChunkText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Decide whether a freshly transcribed chunk repeats the previous one.
 *
 *  - exact (normalised) match of the immediately previous chunk, within
 *    DUPLICATE_CHUNK_WINDOW_MS  -> duplicate (so a genuine "yes" ... "yes" later is kept)
 *  - fully contained in the previous chunk AND long enough to be meaningful
 *    -> duplicate (short replies such as "yes" after "yes, I think so" are kept)
 *  - near-identical word bag AND long enough -> duplicate
 */
export function isDuplicateChunk(newText: string, lastText: string, elapsedMs: number): boolean {
  const normNew  = normaliseChunkText(newText)
  const normLast = normaliseChunkText(lastText)
  if (!normNew || !normLast) return false
  if (normNew === normLast) return elapsedMs <= DUPLICATE_CHUNK_WINDOW_MS
  if (normNew.length < DUPLICATE_MIN_LONG_CHARS) return false
  return normLast.includes(normNew) || jaccardSimilarity(normNew, normLast) > JACCARD_DUPLICATE_THRESHOLD
}

/**
 * Duplicate check that also reports the refreshed "last seen" timestamp.
 *
 * An exact (normalised) repeat that is dropped still proves the same text was
 * emitted *just now*, so the window slides forward. Without this, a looping
 * hallucination every ~2 s is dropped at 2/4/6 s and then accepted at ~8 s.
 * Containment / near-duplicate drops leave the timestamp untouched.
 */
export function checkDuplicateChunk(
  newText: string,
  lastText: string,
  lastAt: number,
  now: number,
): { duplicate: boolean; lastAt: number } {
  if (!isDuplicateChunk(newText, lastText, now - lastAt)) return { duplicate: false, lastAt }
  const exact = normaliseChunkText(newText) === normaliseChunkText(lastText)
  return { duplicate: true, lastAt: exact ? now : lastAt }
}

/**
 * A final-flush chunk (the last utterance emitted by an orderly Stop) may only
 * be processed while no Clear / Start / unmount has bumped the generation since
 * Stop recorded it. `flushGeneration` is the generation captured right after
 * Stop bumped it (null when no orderly Stop is pending).
 */
export function isFlushGenerationValid(flushGeneration: number | null, currentGeneration: number): boolean {
  return flushGeneration !== null && flushGeneration === currentGeneration
}

/**
 * Saving a live session is an upsert: Stop and "new session" can both save the
 * same session id, which must update the existing history row, not duplicate it.
 */
export function resolveLiveSessionSave(existingIds: readonly string[], id: string): 'add' | 'update' {
  return existingIds.includes(id) ? 'update' : 'add'
}

/**
 * Join per-segment translations in segment (creation) order, not completion
 * order. Concurrent translation streams finish in arbitrary order, so the
 * aggregate used for history/summary must be rebuilt from the ordered ids.
 */
export function joinTranslationsInOrder(
  segmentOrder: readonly string[],
  translations: ReadonlyMap<string, string>,
): string {
  const parts: string[] = []
  for (const id of segmentOrder) {
    const text = translations.get(id)
    if (text) parts.push(text)
  }
  return parts.join(' ')
}

export interface CaptureResources {
  streams: readonly (MediaStream | null | undefined)[]
  analyser?: AnalyserNode | null
  audioCtx?: AudioContext | null
}

/**
 * Stop every track of every stream, disconnect the analyser and close the
 * AudioContext (only when it is not already closed). Never throws, and is safe
 * to call repeatedly with the same resources.
 */
export function releaseCaptureResources({ streams, analyser, audioCtx }: CaptureResources): void {
  for (const stream of streams) {
    if (!stream) continue
    try {
      for (const track of stream.getTracks()) {
        try { track.stop() } catch { /* already stopped */ }
      }
    } catch { /* stream already released */ }
  }
  try { analyser?.disconnect() } catch { /* already disconnected */ }
  if (audioCtx && audioCtx.state !== 'closed') {
    try {
      void Promise.resolve(audioCtx.close()).catch(() => undefined)
    } catch { /* closing an already-closed context */ }
  }
}

/**
 * Pure utility functions for the Live Translate pipeline.
 *
 * Extracted from LiveTranslatePage.tsx — pure functions are here so they can
 * be unit-tested without mounting the full React component.
 */

// ── Whisper hallucination filter ──────────────────────────────────────────────
/**
 * Structural-only hallucination patterns.
 *
 * DESIGN PRINCIPLE:
 *   Content-based pattern matching (blocking specific phrases) is inherently
 *   unreliable because any phrase — "Thanks for your time", "Cảm ơn",
 *   "チャンネル登録" — can be genuine speech in the right context.  Blocking
 *   it silently drops real words from the transcript.
 *
 *   The ONLY reliable content-agnostic hallucination signals are:
 *     1. Whisper's own verbose_json metrics — no_speech_prob, avg_logprob,
 *        compression_ratio (handled upstream in processChunk).
 *     2. Structural anomalies that are IMPOSSIBLE in real speech:
 *        lone punctuation and Whisper's bracketed annotation labels.
 *     3. Character/n-gram repetition loops (checks 3 & 4 in isHallucination).
 *
 *   Everything else should be left to the VAD + Whisper confidence pipeline.
 */
const HALLUCINATION_PATTERNS: RegExp[] = [
  // ── Lone punctuation / whitespace ────────────────────────────────────────
  // A transcription consisting only of punctuation or whitespace is never
  // real speech.  Whisper emits these on near-silent audio.
  /^[\s.…,\-–—!?]+$/,

  // ── Whisper bracketed annotation labels ──────────────────────────────────
  // When Whisper encounters non-speech audio (music, applause, silence) it
  // outputs labels like [Music], (music), (拍手), 【BGM】.  These are
  // structural annotations, not transcribed speech — safe to discard.
  // Matches any utterance that is ENTIRELY enclosed in brackets/parentheses.
  // Closing class includes both ASCII ) and full-width ）】].
  /^\s*[[(（【].*[)\]）】]\s*$/,
]

/**
 * Returns `true` when the text is a known Whisper hallucination OR structurally invalid.
 *
 * Checks (in order):
 *   1. Too short (< 4 chars after trimming)
 *   2. Matches a known hallucination pattern
 *   3. Single-character repetition ≥ 4 times covering > 60% of text
 *   4. Word-level n-gram repetition: any bigram or trigram repeating ≥ 3 times
 *      (catches "hello hello hello" or "xin chào xin chào xin chào" style loops)
 */
export function isHallucination(text: string): boolean {
  const t = text.trim()
  if (t.length < 4) return true

  if (HALLUCINATION_PATTERNS.some(p => p.test(t))) return true

  // ── Check 3: single-character flooding ───────────────────────────────────
  const charFreq = new Map<string, number>()
  for (const ch of t) charFreq.set(ch, (charFreq.get(ch) ?? 0) + 1)
  const maxCharFreq = Math.max(...charFreq.values())
  if (maxCharFreq >= 4 && maxCharFreq / t.length > 0.6) return true

  // ── Check 4: n-gram word repetition ──────────────────────────────────────
  // Tokenise on whitespace; CJK chars treated as single-char tokens
  const tokens = t
    .replace(/[\u3000-\u9fff\uac00-\ud7ff\u3040-\u30ff]/g, c => ` ${c} `)
    .split(/\s+/)
    .filter(Boolean)

  if (tokens.length >= 6) {
    // Check bigrams and trigrams for repetition (≥ 3 occurrences = hallucination)
    for (const n of [2, 3]) {
      const ngFreq = new Map<string, number>()
      for (let i = 0; i <= tokens.length - n; i++) {
        const gram = tokens.slice(i, i + n).join(' ')
        ngFreq.set(gram, (ngFreq.get(gram) ?? 0) + 1)
      }
      for (const count of ngFreq.values()) {
        if (count >= 3) return true
      }
    }
  }

  return false
}

/**
 * Count "words" in a transcript that may contain mixed CJK and Latin/Cyrillic text.
 *
 * Latin/Cyrillic text is tokenised on whitespace (standard word count).
 * CJK scripts (Hiragana, Katakana, CJK Extension A, Han, Hangul) have no
 * whitespace word boundaries — splitting on /\s+/ would count entire
 * sentences as a single "word". For those, each CJK glyph counts as one word.
 *
 * `· · ·` is stripped first — it is the legacy speaker-divider glyph and
 * should never contribute to word totals.
 */
const CJK_GLYPH_RE = /[぀-ヿ㐀-䶿一-鿿가-힯]/g
export function countWords(text: string): number {
  if (!text) return 0
  const cleaned = text.replace(/· · ·/g, '')
  const cjkChars = cleaned.match(CJK_GLYPH_RE)?.length ?? 0
  const nonCjk = cleaned.replace(CJK_GLYPH_RE, ' ')
  const latinWords = nonCjk.split(/\s+/).filter(Boolean).length
  return cjkChars + latinWords
}

/**
 * Jaccard similarity on word-bag: ratio of shared words to total unique words.
 *
 * Used to detect near-duplicate Whisper outputs between consecutive chunks.
 * Returns 0.0 (no overlap) … 1.0 (identical word bags).
 */
export function jaccardSimilarity(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().split(/\s+/).filter(Boolean))
  const setA = words(a)
  const setB = words(b)
  if (setA.size === 0 && setB.size === 0) return 1
  let intersection = 0
  for (const w of setA) if (setB.has(w)) intersection++
  const union = setA.size + setB.size - intersection
  return union === 0 ? 1 : intersection / union
}

/**
 * Split accumulated transcript text at sentence boundaries.
 *
 * Sentence boundaries: `.  !  ?  。  ！  ？  ‼  ⁉  …` optionally followed by whitespace.
 * Returns:
 *   - `complete`: everything up to and including the last boundary (ready to translate)
 *   - `pending`:  the remainder after the last boundary (still accumulating)
 */
export function extractCompleteSentences(text: string): { complete: string; pending: string } {
  // ASCII punctuation (.!?) requires trailing whitespace or EOL (Latin scripts).
  // CJK full-width punctuation (。！？‼⁉…) matches standalone — no space needed.
  const re = /[.!?]+(?:\s|$)|[。！？‼⁉…]+/g
  const matches = [...text.matchAll(re)]
  if (matches.length === 0) return { complete: '', pending: text.trim() }
  const last = matches[matches.length - 1]
  const split = (last.index ?? 0) + last[0].length
  return {
    complete: text.slice(0, split).trim(),
    pending:  text.slice(split).trim(),
  }
}

/**
 * Split a block of (possibly multi-sentence) text into individual sentences.
 *
 * Splits on universal hard punctuation boundaries: `.  !  ?  。  ！  ？  ‼  ⁉  …`
 *
 * Language-agnostic by design — no language-specific pattern matching.
 * When Whisper omits punctuation between sentences, the caller should rely on
 * `stt.segmentTexts` (Whisper's own internal segmentation, which covers all
 * languages) rather than regex heuristics here.
 *
 * e.g. `A。B。` → [`A。`, `B。`]
 *      `A! B? C.` → [`A!`, `B?`, `C.`]
 *      `no punctuation here` → [`no punctuation here`]  (returned as-is)
 */
export function splitSentences(text: string): string[] {
  const t = text.trim()
  if (!t) return []

  const hardRe = /[.!?]+(?=\s|$)|[。！？‼⁉…]+/g
  const hardBounds: number[] = []
  let m: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: standard pattern for iterating matchAll
  while ((m = hardRe.exec(t)) !== null) {
    hardBounds.push(m.index + m[0].length)
  }

  return hardBounds.length > 0 ? _sliceAtBounds(t, hardBounds) : [t]
}

/** Internal helper: slice `text` at each position in `bounds` (sorted ascending). */
function _sliceAtBounds(text: string, bounds: number[]): string[] {
  const results: string[] = []
  let last = 0
  for (const pos of bounds) {
    const chunk = text.slice(last, pos).trim()
    if (chunk) results.push(chunk)
    // Advance past the split point, skipping any leading whitespace
    last = pos
    while (last < text.length && /\s/.test(text[last])) last++
  }
  const tail = text.slice(last).trim()
  if (tail) results.push(tail)
  return results.filter(Boolean)
}

/** Format an elapsed duration as m:ss, or h:mm:ss from one hour on. */
export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = String(totalSec % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

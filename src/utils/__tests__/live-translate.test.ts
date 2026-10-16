/**
 * Unit tests for src/utils/live-translate.ts
 *
 * Tests cover all 3 exported pure functions:
 *   1. isHallucination   — Whisper hallucination filter (structural-only)
 *   2. jaccardSimilarity — Word-bag Jaccard similarity
 *   3. extractCompleteSentences — Sentence boundary splitter
 *
 * DESIGN NOTE — content-based phrase blocking was intentionally removed:
 *   Any phrase ("Thanks for watching", "ありがとうございます", "감사합니다",
 *   "Cảm ơn") CAN be genuine speech in context.  Blocking it silently drops
 *   real words.  isHallucination() only blocks STRUCTURAL anomalies that are
 *   impossible in real speech; common "YouTube-closing" phrases are filtered
 *   upstream by Whisper's verbose_json confidence metrics (no_speech_prob,
 *   avg_logprob, compressionRatio) inside processChunk / useLiveTranslate.
 */
import { describe, expect, it } from 'vitest'
import {
  extractCompleteSentences,
  formatElapsed,
  isHallucination,
  jaccardSimilarity,
  splitSentences,
} from '../live-translate'

// ─────────────────────────────────────────────────────────────────────────────
describe('isHallucination', () => {

  // ── Check 1: too short ────────────────────────────────────────────────────
  describe('text too short (< 4 chars after trim)', () => {
    it('returns true for empty string', () => {
      expect(isHallucination('')).toBe(true)
    })

    it('returns true for single character', () => {
      expect(isHallucination('A')).toBe(true)
    })

    it('returns true for 3-character string', () => {
      expect(isHallucination('abc')).toBe(true)
    })

    it('returns true for whitespace-only string (trims to < 4 chars)', () => {
      expect(isHallucination('   ')).toBe(true)
    })

    it('returns false for string with exactly 4 meaningful chars', () => {
      expect(isHallucination('abcd')).toBe(false)
    })
  })

  // ── Check 2: structural anomalies ────────────────────────────────────────
  //
  // Only TWO structural patterns are blocked — these are IMPOSSIBLE in real speech:
  //   Pattern A: lone punctuation / whitespace  → Whisper emits on near-silent audio
  //   Pattern B: bracketed annotation labels    → [Music], (音楽), 【BGM】, etc.
  //
  // Content-based phrase blocking ("thanks for watching", "ありがとうございます",
  // "감사합니다", "cảm ơn") was deliberately removed — any such phrase can be
  // genuine speech. Those are filtered by Whisper's verbose_json confidence
  // metrics upstream in processChunk.
  describe('structural: lone punctuation / whitespace only (Pattern A)', () => {
    it('returns true for "..." — 3 chars, caught by check 1 (< 4)', () => {
      expect(isHallucination('...')).toBe(true)
    })

    it('returns true for "----" — 4 dashes, matches lone-punctuation pattern', () => {
      expect(isHallucination('----')).toBe(true)
    })

    it('returns true for a string of only spaces and commas', () => {
      expect(isHallucination('   ,   ')).toBe(true)
    })

    it('returns true for a string of only ellipsis characters "…"', () => {
      expect(isHallucination('……')).toBe(true)
    })

    it('returns false for real content with trailing punctuation "Hello!"', () => {
      // Has non-punctuation content → NOT lone punctuation
      expect(isHallucination('Hello!')).toBe(false)
    })
  })

  describe('structural: Whisper bracketed annotation labels (Pattern B)', () => {
    it('returns true for "[Music]"', () => {
      expect(isHallucination('[Music]')).toBe(true)
    })

    it('returns true for "(music)"', () => {
      expect(isHallucination('(music)')).toBe(true)
    })

    it('returns true for "[Applause]"', () => {
      expect(isHallucination('[Applause]')).toBe(true)
    })

    it('returns true for "[Laughter]"', () => {
      expect(isHallucination('[Laughter]')).toBe(true)
    })

    it('returns true for "[inaudible]"', () => {
      expect(isHallucination('[inaudible]')).toBe(true)
    })

    it('returns true for Japanese bracketed sound "(笑)"', () => {
      expect(isHallucination('(笑)')).toBe(true)
    })

    it('returns true for "(音楽)"', () => {
      expect(isHallucination('(音楽)')).toBe(true)
    })

    it('returns true for Vietnamese "(tiếng nhạc)"', () => {
      expect(isHallucination('(tiếng nhạc)')).toBe(true)
    })

    it('returns true for "[tiếng vỗ tay]"', () => {
      expect(isHallucination('[tiếng vỗ tay]')).toBe(true)
    })

    it('returns false for real sentence containing brackets in the middle', () => {
      // Not ENTIRELY enclosed in brackets → not filtered
      expect(isHallucination('The result (see below) was positive')).toBe(false)
    })
  })

  // ── Design verification: common phrases pass through (filtered upstream) ──
  // These tests document intentional behaviour: isHallucination() should NOT
  // block common phrases — Whisper confidence gates handle them.
  describe('common phrases are NOT blocked (by design)', () => {
    it('returns false for "thanks for watching" — filtered upstream by confidence', () => {
      expect(isHallucination('thanks for watching')).toBe(false)
    })

    it('returns false for "ありがとうございます。"', () => {
      expect(isHallucination('ありがとうございます。')).toBe(false)
    })

    it('returns false for "감사합니다" (Korean "thank you")', () => {
      expect(isHallucination('감사합니다')).toBe(false)
    })

    it('returns false for "Cảm ơn bạn"', () => {
      expect(isHallucination('Cảm ơn bạn')).toBe(false)
    })
  })

  // ── Check 3: single-character flooding ───────────────────────────────────
  describe('single-character repetition flooding (> 60% same char)', () => {
    it('returns true for "aaaaaaaaaa" (all same char)', () => {
      expect(isHallucination('aaaaaaaaaa')).toBe(true)
    })

    it('returns true for string where one char covers > 60% of text', () => {
      // "aaaaaaa bcd" — 7 a's out of 11 chars (63.6%)
      expect(isHallucination('aaaaaaa bcd')).toBe(true)
    })

    it('returns false when no single char covers > 60% of text', () => {
      // evenly distributed characters — no flooding
      expect(isHallucination('abcdefghij')).toBe(false)
    })
  })

  // ── Check 4: n-gram word repetition ─────────────────────────────────────
  describe('bigram repetition (≥ 3 occurrences)', () => {
    it('returns true for "hello world hello world hello world"', () => {
      expect(isHallucination('hello world hello world hello world')).toBe(true)
    })

    it('returns true for repeated bigram with extra tokens', () => {
      expect(isHallucination('foo bar foo bar foo bar baz')).toBe(true)
    })
  })

  describe('trigram repetition (≥ 3 occurrences)', () => {
    it('returns true for "xin chào bạn xin chào bạn xin chào bạn"', () => {
      expect(isHallucination('xin chào bạn xin chào bạn xin chào bạn')).toBe(true)
    })

    it('returns true for English trigram repeated 3 times', () => {
      expect(isHallucination('one two three one two three one two three')).toBe(true)
    })
  })

  // ── Negative cases: real content ─────────────────────────────────────────
  describe('real content (should return false)', () => {
    it('returns false for English sentence "Today\'s meeting covered the Q3 roadmap"', () => {
      expect(isHallucination("Today's meeting covered the Q3 roadmap")).toBe(false)
    })

    it('returns false for Japanese sentence "今日の会議では第3四半期の方針を議論しました"', () => {
      expect(isHallucination('今日の会議では第3四半期の方針を議論しました')).toBe(false)
    })

    it('returns false for Vietnamese sentence "Hôm nay thời tiết rất đẹp và mát mẻ"', () => {
      expect(isHallucination('Hôm nay thời tiết rất đẹp và mát mẻ')).toBe(false)
    })

    it('returns false for Korean natural sentence', () => {
      expect(isHallucination('오늘 회의에서 3분기 로드맵에 대해 논의했습니다')).toBe(false)
    })

    it('returns false for a regular English sentence without hallucination signals', () => {
      expect(isHallucination('The quick brown fox jumps over the lazy dog')).toBe(false)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('jaccardSimilarity', () => {

  // ── Boundary cases ────────────────────────────────────────────────────────
  it('returns 1.0 for identical strings', () => {
    expect(jaccardSimilarity('hello world', 'hello world')).toBe(1.0)
  })

  it('returns 1.0 when both strings are empty', () => {
    expect(jaccardSimilarity('', '')).toBe(1.0)
  })

  it('returns 0.0 for completely different words', () => {
    expect(jaccardSimilarity('alpha beta gamma', 'delta epsilon zeta')).toBe(0.0)
  })

  // ── Partial overlap ───────────────────────────────────────────────────────
  it('returns a value between 0 and 1 for partial overlap', () => {
    const result = jaccardSimilarity('hello world foo', 'hello earth bar')
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThan(1)
  })

  it('returns correct value for 50% word overlap (1 shared out of 3 unique)', () => {
    // a = {'hello', 'world'}, b = {'hello', 'earth'}
    // intersection = 1, union = 3 → 1/3
    const result = jaccardSimilarity('hello world', 'hello earth')
    expect(result).toBeCloseTo(1 / 3, 5)
  })

  it('returns 1.0 when both strings contain the same words in different order', () => {
    expect(jaccardSimilarity('world hello', 'hello world')).toBe(1.0)
  })

  // ── Case-insensitivity ────────────────────────────────────────────────────
  it('is case-insensitive: "Hello" and "hello" are the same word', () => {
    expect(jaccardSimilarity('Hello World', 'hello world')).toBe(1.0)
  })

  it('treats "HELLO WORLD" and "hello world" as identical', () => {
    expect(jaccardSimilarity('HELLO WORLD', 'hello world')).toBe(1.0)
  })

  it('case-insensitive partial overlap is calculated correctly', () => {
    // 'Hello Earth' vs 'hello world' — 'hello' matches, 'earth'/'world' don't
    // intersection=1, union=3 → 1/3
    const result = jaccardSimilarity('Hello Earth', 'hello world')
    expect(result).toBeCloseTo(1 / 3, 5)
  })

  // ── Edge cases ────────────────────────────────────────────────────────────
  it('returns 0.0 when one string is empty and the other is not', () => {
    // setA empty, setB non-empty → intersection=0, union=setB.size → 0/n = 0
    expect(jaccardSimilarity('', 'hello world')).toBe(0.0)
  })

  it('handles duplicate words within the same string (treated as a set)', () => {
    // 'hello hello' → set {'hello'}, same as 'hello'
    expect(jaccardSimilarity('hello hello', 'hello')).toBe(1.0)
  })

  it('returns a higher score for strings with more shared words', () => {
    const lowOverlap  = jaccardSimilarity('a b c d', 'a x y z')  // 1 shared
    const highOverlap = jaccardSimilarity('a b c d', 'a b c z')  // 3 shared
    expect(highOverlap).toBeGreaterThan(lowOverlap)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('extractCompleteSentences', () => {

  // ── No boundary ──────────────────────────────────────────────────────────
  it('returns complete="" and pending=full text when there is no sentence boundary', () => {
    const result = extractCompleteSentences('Hello world')
    expect(result.complete).toBe('')
    expect(result.pending).toBe('Hello world')
  })

  it('returns complete="" and pending=trimmed text for empty string', () => {
    const result = extractCompleteSentences('')
    expect(result.complete).toBe('')
    expect(result.pending).toBe('')
  })

  // ── ASCII period ─────────────────────────────────────────────────────────
  it('splits on "." followed by a space', () => {
    const result = extractCompleteSentences('Hello world. This is pending')
    expect(result.complete).toBe('Hello world.')
    expect(result.pending).toBe('This is pending')
  })

  it('splits on "." at end of string — pending is empty', () => {
    const result = extractCompleteSentences('Hello world.')
    expect(result.complete).toBe('Hello world.')
    expect(result.pending).toBe('')
  })

  it('uses the LAST sentence boundary when multiple "." exist', () => {
    const result = extractCompleteSentences('First sentence. Second sentence. Pending here')
    expect(result.complete).toBe('First sentence. Second sentence.')
    expect(result.pending).toBe('Pending here')
  })

  // ── Question mark and exclamation mark ───────────────────────────────────
  it('splits on "?" followed by a space', () => {
    const result = extractCompleteSentences('Are you there? Still pending')
    expect(result.complete).toBe('Are you there?')
    expect(result.pending).toBe('Still pending')
  })

  it('splits on "!" followed by a space', () => {
    const result = extractCompleteSentences('Watch out! Some pending text')
    expect(result.complete).toBe('Watch out!')
    expect(result.pending).toBe('Some pending text')
  })

  it('splits on "!" at end of string — pending is empty', () => {
    const result = extractCompleteSentences('Watch out!')
    expect(result.complete).toBe('Watch out!')
    expect(result.pending).toBe('')
  })

  // ── CJK full-width punctuation ────────────────────────────────────────────
  it('splits on "。" (Japanese period) without requiring trailing space', () => {
    const result = extractCompleteSentences('こんにちは。待機テキスト')
    expect(result.complete).toBe('こんにちは。')
    expect(result.pending).toBe('待機テキスト')
  })

  it('splits on "！" (full-width exclamation mark)', () => {
    const result = extractCompleteSentences('すごい！続きのテキスト')
    expect(result.complete).toBe('すごい！')
    expect(result.pending).toBe('続きのテキスト')
  })

  it('splits on "？" (full-width question mark)', () => {
    const result = extractCompleteSentences('どうですか？続きのテキスト')
    expect(result.complete).toBe('どうですか？')
    expect(result.pending).toBe('続きのテキスト')
  })

  it('handles "。" at end of string — pending is empty', () => {
    const result = extractCompleteSentences('日本語のテスト。')
    expect(result.complete).toBe('日本語のテスト。')
    expect(result.pending).toBe('')
  })

  it('handles "…" (ellipsis) as a sentence boundary', () => {
    const result = extractCompleteSentences('Something happened…and then')
    expect(result.complete).toBe('Something happened…')
    expect(result.pending).toBe('and then')
  })

  // ── Text ends with boundary ───────────────────────────────────────────────
  it('returns pending="" when text ends with "."', () => {
    const result = extractCompleteSentences('This is a complete sentence.')
    expect(result.pending).toBe('')
  })

  it('returns pending="" when text ends with "?"', () => {
    const result = extractCompleteSentences('Is this complete?')
    expect(result.pending).toBe('')
  })

  it('returns pending="" when text ends with "。"', () => {
    const result = extractCompleteSentences('完全な文です。')
    expect(result.pending).toBe('')
  })

  // ── Mixed script ─────────────────────────────────────────────────────────
  it('handles mixed script: English sentence + Japanese sentence + pending', () => {
    const result = extractCompleteSentences('Hello world. こんにちは！ pending text')
    expect(result.complete).toBe('Hello world. こんにちは！')
    expect(result.pending).toBe('pending text')
  })

  it('trims whitespace from complete and pending', () => {
    const result = extractCompleteSentences('  Hello world.   pending  ')
    expect(result.complete).toBe('Hello world.')
    expect(result.pending).toBe('pending')
  })

  // ── Multiple consecutive boundaries ──────────────────────────────────────
  it('handles "!!" as a single boundary token', () => {
    const result = extractCompleteSentences('Wow!! Still going')
    expect(result.complete).toBe('Wow!!')
    expect(result.pending).toBe('Still going')
  })

  it('handles "?!" as a single boundary token', () => {
    const result = extractCompleteSentences('Really?! Pending here')
    expect(result.complete).toBe('Really?!')
    expect(result.pending).toBe('Pending here')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('splitSentences', () => {

  it('splits on "." followed by space', () => {
    const result = splitSentences('First. Second. Third.')
    expect(result).toEqual(['First.', 'Second.', 'Third.'])
  })

  it('splits CJK sentences on "。"', () => {
    const result = splitSentences('A。B。')
    expect(result).toEqual(['A。', 'B。'])
  })

  it('returns the whole string as one element when there is no boundary', () => {
    const result = splitSentences('no punctuation here')
    expect(result).toEqual(['no punctuation here'])
  })

  it('returns empty array for empty string', () => {
    const result = splitSentences('')
    expect(result).toEqual([])
  })

  it('handles mixed punctuation "A! B? C."', () => {
    const result = splitSentences('A! B? C.')
    expect(result).toEqual(['A!', 'B?', 'C.'])
  })

  it('returns single element for text with no trailing boundary (accumulating chunk)', () => {
    const result = splitSentences('This is still being spoken')
    expect(result).toEqual(['This is still being spoken'])
  })
})

describe('formatElapsed', () => {
  it.each([
    [0, '0:00'],
    [65_000, '1:05'],
    [3_600_000 + 2 * 60_000 + 3_000, '1:02:03'],
    [-500, '0:00'],
  ])('formats %i ms as %s', (ms, expected) => {
    expect(formatElapsed(ms)).toBe(expected)
  })
})

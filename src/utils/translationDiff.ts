/**
 * Word-level difference marking for side-by-side translation comparison.
 *
 * Each translation is tokenised into words, whitespace and punctuation. A token
 * is "changed" when it is not part of the longest common subsequence with at
 * least one of the other translations, so the marks point at the places where
 * the models disagree instead of asking the reader to scan every sentence.
 * Everything runs on the client; no provider request is involved.
 */

export interface DiffSegment {
  text: string
  changed: boolean
}

/** Above this many tokens per text the quadratic LCS is skipped and nothing is marked. */
const MAX_DIFF_TOKENS = 4000

const WHITESPACE_ONLY = /^\s+$/u

type Segmenter = { segment: (input: string) => Iterable<{ segment: string }> }

function createSegmenter(): Segmenter | null {
  const segmenterCtor = (Intl as unknown as { Segmenter?: new (
    locales?: string | string[],
    options?: { granularity?: 'grapheme' | 'word' | 'sentence' },
  ) => Segmenter }).Segmenter
  if (!segmenterCtor) return null
  try {
    return new segmenterCtor(undefined, { granularity: 'word' })
  } catch {
    return null
  }
}

const segmenter = createSegmenter()

/** Splits text into comparable tokens; CJK text is segmented per word where the runtime supports it. */
export function tokenizeForDiff(text: string): string[] {
  if (!text) return []
  if (segmenter) {
    return Array.from(segmenter.segment(text), (part) => part.segment)
  }
  return text.match(/\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? []
}

/** Returns, for each token of `base`, whether it is missing from the LCS with `other`. */
function markMissingFromLcs(base: string[], other: string[]): boolean[] {
  const rows = base.length
  const cols = other.length
  if (rows === 0) return []
  if (cols === 0) return base.map(() => true)

  // Classic DP table; sizes are bounded by MAX_DIFF_TOKENS so this stays cheap.
  const table: Uint16Array[] = Array.from({ length: rows + 1 }, () => new Uint16Array(cols + 1))
  for (let i = rows - 1; i >= 0; i--) {
    const current = table[i]
    const next = table[i + 1]
    for (let j = cols - 1; j >= 0; j--) {
      current[j] = base[i] === other[j]
        ? next[j + 1] + 1
        : Math.max(next[j], current[j + 1])
    }
  }

  const changed = base.map(() => true)
  let i = 0
  let j = 0
  while (i < rows && j < cols) {
    if (base[i] === other[j]) {
      changed[i] = false
      i++
      j++
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i++
    } else {
      j++
    }
  }
  return changed
}

function mergeSegments(tokens: string[], changed: boolean[]): DiffSegment[] {
  // Whitespace between two changed tokens joins the mark so a phrase reads as one highlight.
  const resolved = changed.slice()
  for (let i = 1; i < tokens.length - 1; i++) {
    if (WHITESPACE_ONLY.test(tokens[i]) && resolved[i - 1] && resolved[i + 1]) resolved[i] = true
    else if (WHITESPACE_ONLY.test(tokens[i])) resolved[i] = false
  }
  if (tokens.length > 0 && WHITESPACE_ONLY.test(tokens[0])) resolved[0] = false
  if (tokens.length > 1 && WHITESPACE_ONLY.test(tokens[tokens.length - 1])) resolved[tokens.length - 1] = false

  const segments: DiffSegment[] = []
  tokens.forEach((token, index) => {
    const last = segments[segments.length - 1]
    if (last && last.changed === resolved[index]) last.text += token
    else segments.push({ text: token, changed: resolved[index] })
  })
  return segments
}

/**
 * Marks where each translation differs from the others.
 * With fewer than two texts, or texts too long to compare, every segment is unchanged.
 */
export function highlightTranslationDifferences(texts: string[]): DiffSegment[][] {
  const tokenLists = texts.map(tokenizeForDiff)
  const comparable = texts.length >= 2 && tokenLists.every((tokens) => tokens.length <= MAX_DIFF_TOKENS)
  if (!comparable) {
    return texts.map((text) => (text ? [{ text, changed: false }] : []))
  }

  return tokenLists.map((tokens, index) => {
    const changed = tokens.map(() => false)
    tokenLists.forEach((other, otherIndex) => {
      if (otherIndex === index) return
      markMissingFromLcs(tokens, other).forEach((isChanged, tokenIndex) => {
        if (isChanged) changed[tokenIndex] = true
      })
    })
    return mergeSegments(tokens, changed)
  })
}

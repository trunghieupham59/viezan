/**
 * Sentence-level alignment for the multi-model translation comparison.
 *
 * The source text and each finished translation are split into sentences with
 * `Intl.Segmenter` (sentence granularity) where the runtime has it, otherwise
 * on terminal punctuation and line breaks. A translation whose sentence count
 * matches the source is aligned by index; one that does not is kept whole in
 * the last row so the reader still sees it, but it cannot contribute sentences
 * to the assembled result. Everything runs on the client.
 */

export interface SentenceCell {
  /** Text shown in the cell; empty when a misaligned translation has nothing for this row. */
  text: string
  /** True when this cell is one sentence aligned to the source row and can be picked. */
  aligned: boolean
}

export interface SentenceRow {
  index: number
  source: string
  /** One cell per translation, in the order the translations were given. */
  cells: SentenceCell[]
}

export interface SentenceColumn {
  sentenceCount: number
  /** False when the translation could not be split into one sentence per source sentence. */
  aligned: boolean
}

export interface SentenceAlignment {
  rows: SentenceRow[]
  columns: SentenceColumn[]
}

/**
 * Result key handed to the comparison pick handler when the final text was
 * assembled from several models. History attributes such a pick to the model
 * that contributed the most sentences, because a history entry records one
 * provider and one model and the cost estimate needs a real pair.
 */
export const ASSEMBLED_TRANSLATION_KEY = 'assembled'

/** Fallback boundaries: whitespace after `.!?`, anything after `。！？`, and line breaks. */
const FALLBACK_BOUNDARY = /(?<=[.!?])\s+|(?<=[。！？])\s*|\s*\n\s*/u
/** Scripts and closers that take no space before the next sentence. */
const NO_SPACE_AFTER = /[。！？」』）\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u

type Segmenter = { segment: (input: string) => Iterable<{ segment: string }> }
type SegmenterCtor = new (
  locales?: string | string[],
  options?: { granularity?: 'grapheme' | 'word' | 'sentence' },
) => Segmenter

let sentenceSegmenter: Segmenter | null | undefined

function getSegmenter(): Segmenter | null {
  if (sentenceSegmenter !== undefined) return sentenceSegmenter
  const ctor = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter
  try {
    sentenceSegmenter = ctor ? new ctor(undefined, { granularity: 'sentence' }) : null
  } catch {
    sentenceSegmenter = null
  }
  return sentenceSegmenter
}

/** Splits text into trimmed, non-empty sentences. */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const segmenter = getSegmenter()
  const parts = segmenter
    ? Array.from(segmenter.segment(trimmed), (part) => part.segment)
    : trimmed.split(FALLBACK_BOUNDARY)
  return parts.map((part) => part.trim()).filter(Boolean)
}

/**
 * Lines up each translation with the source, sentence by sentence.
 * A translation with a different sentence count is shown whole in the last row.
 */
export function alignSentences(sourceText: string, translations: string[]): SentenceAlignment {
  const sourceSentences = splitSentences(sourceText)
  const translationSentences = translations.map(splitSentences)
  const columns = translationSentences.map((sentences) => ({
    sentenceCount: sentences.length,
    aligned: sourceSentences.length > 0 && sentences.length === sourceSentences.length,
  }))
  const lastRow = sourceSentences.length - 1
  const rows = sourceSentences.map((source, index) => ({
    index,
    source,
    cells: translationSentences.map((sentences, column) => (
      columns[column].aligned
        ? { text: sentences[index], aligned: true }
        : { text: index === lastRow ? translations[column].trim() : '', aligned: false }
    )),
  }))
  return { rows, columns }
}

/** Joins picked sentences; CJK text runs on without a space between sentences. */
export function joinSentences(sentences: string[]): string {
  return sentences.reduce((text, sentence) => {
    if (!text) return sentence
    if (!sentence) return text
    return NO_SPACE_AFTER.test(text) ? `${text}${sentence}` : `${text} ${sentence}`
  }, '')
}

/**
 * The column that contributed the most sentences. Ties go to `preferred` when it
 * is among the leaders, otherwise to the leftmost leader. Null when nothing was chosen.
 */
export function pickDominantColumn(choices: number[], preferred: number | null): number | null {
  if (choices.length === 0) return null
  const counts = new Map<number, number>()
  for (const column of choices) counts.set(column, (counts.get(column) ?? 0) + 1)
  const max = Math.max(...counts.values())
  if (preferred !== null && counts.get(preferred) === max) return preferred
  return Math.min(...Array.from(counts.entries()).filter(([, count]) => count === max).map(([column]) => column))
}

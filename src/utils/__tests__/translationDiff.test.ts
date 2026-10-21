import { describe, expect, it } from 'vitest'
import { highlightTranslationDifferences, tokenizeForDiff } from '../translationDiff'

const changedText = (segments: { text: string; changed: boolean }[]) => (
  segments.filter((segment) => segment.changed).map((segment) => segment.text)
)

describe('tokenizeForDiff', () => {
  it('keeps words, spaces and punctuation as separate tokens', () => {
    expect(tokenizeForDiff('Hello, world').join('|')).toBe('Hello|,| |world')
  })

  it('returns nothing for empty text', () => {
    expect(tokenizeForDiff('')).toEqual([])
  })
})

describe('highlightTranslationDifferences', () => {
  it('marks only the words that differ between two translations', () => {
    const [first, second] = highlightTranslationDifferences([
      'The report shows a steady increase in retention.',
      'The report shows a stable increase in retention.',
    ])

    expect(changedText(first)).toEqual(['steady'])
    expect(changedText(second)).toEqual(['stable'])
    expect(first.map((segment) => segment.text).join('')).toBe(
      'The report shows a steady increase in retention.',
    )
  })

  it('joins adjacent changed words into one highlight', () => {
    const [first] = highlightTranslationDifferences([
      'A quick brown fox jumps',
      'A fox jumps',
    ])

    expect(changedText(first)).toEqual(['quick brown'])
  })

  it('marks a token when it disagrees with at least one other translation', () => {
    const [first, second, third] = highlightTranslationDifferences([
      'morning light',
      'morning light',
      'evening light',
    ])

    expect(changedText(first)).toEqual(['morning'])
    expect(changedText(second)).toEqual(['morning'])
    expect(changedText(third)).toEqual(['evening'])
  })

  it('leaves a single translation unmarked', () => {
    expect(highlightTranslationDifferences(['Only one'])).toEqual([
      [{ text: 'Only one', changed: false }],
    ])
  })
})

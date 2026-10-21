import { afterEach, describe, expect, it, vi } from 'vitest'
import { alignSentences, joinSentences, pickDominantColumn, splitSentences } from '../sentenceSegments'

describe('splitSentences', () => {
  it('splits on sentence boundaries and trims each sentence', () => {
    expect(splitSentences('  First one. Second one!  Third one?  ')).toEqual([
      'First one.',
      'Second one!',
      'Third one?',
    ])
  })

  it('treats line breaks as sentence boundaries', () => {
    expect(splitSentences('Heading without a stop\nBody sentence.')).toEqual([
      'Heading without a stop',
      'Body sentence.',
    ])
  })

  it('splits CJK sentences on full-width terminators', () => {
    expect(splitSentences('今日は晴れです。明日は雨でしょう。')).toEqual([
      '今日は晴れです。',
      '明日は雨でしょう。',
    ])
  })

  it('returns nothing for blank text', () => {
    expect(splitSentences('   ')).toEqual([])
  })
})

describe('splitSentences without Intl.Segmenter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('falls back to punctuation and line breaks', async () => {
    vi.resetModules()
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined })
    const { splitSentences: fallbackSplit } = await import('../sentenceSegments')

    expect(fallbackSplit('One. Two! Three?\nFour 五。六')).toEqual([
      'One.',
      'Two!',
      'Three?',
      'Four 五。',
      '六',
    ])
  })
})

describe('alignSentences', () => {
  it('aligns translations by sentence index when the counts match', () => {
    const { rows, columns } = alignSentences('First one. Second one.', [
      'Eins. Zwei.',
      'Uno. Dos.',
    ])

    expect(columns).toEqual([
      { sentenceCount: 2, aligned: true },
      { sentenceCount: 2, aligned: true },
    ])
    expect(rows).toEqual([
      { index: 0, source: 'First one.', cells: [{ text: 'Eins.', aligned: true }, { text: 'Uno.', aligned: true }] },
      { index: 1, source: 'Second one.', cells: [{ text: 'Zwei.', aligned: true }, { text: 'Dos.', aligned: true }] },
    ])
  })

  it('keeps a translation with a different sentence count whole in the last row', () => {
    const { rows, columns } = alignSentences('First one. Second one. Third one.', [
      'Eins. Zwei. Drei.',
      'Uno y dos. Tres.',
    ])

    expect(columns[1]).toEqual({ sentenceCount: 2, aligned: false })
    expect(rows.map((row) => row.cells[1])).toEqual([
      { text: '', aligned: false },
      { text: '', aligned: false },
      { text: 'Uno y dos. Tres.', aligned: false },
    ])
    expect(rows.map((row) => row.cells[0].text)).toEqual(['Eins.', 'Zwei.', 'Drei.'])
  })

  it('produces no rows for an empty source', () => {
    expect(alignSentences('', ['Eins.'])).toEqual({
      rows: [],
      columns: [{ sentenceCount: 1, aligned: false }],
    })
  })
})

describe('joinSentences', () => {
  it('separates Latin sentences with a space and skips empty pieces', () => {
    expect(joinSentences(['Eins.', '', 'Dos.'])).toBe('Eins. Dos.')
  })

  it('runs CJK sentences together without a space', () => {
    expect(joinSentences(['今日は晴れです。', '明日は雨でしょう。'])).toBe('今日は晴れです。明日は雨でしょう。')
  })
})

describe('pickDominantColumn', () => {
  it('returns the column chosen most often', () => {
    expect(pickDominantColumn([0, 1, 1], 0)).toBe(1)
  })

  it('breaks a tie toward the preferred column, else the leftmost leader', () => {
    expect(pickDominantColumn([0, 1], 1)).toBe(1)
    expect(pickDominantColumn([2, 1], 0)).toBe(1)
  })

  it('returns null with no choices', () => {
    expect(pickDominantColumn([], 0)).toBeNull()
  })
})

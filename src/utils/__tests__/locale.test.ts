import { describe, expect, it } from 'vitest'
import { formatNumberForLocale } from '../locale'

describe('formatNumberForLocale', () => {
  it('follows the app language rather than the OS regional settings', () => {
    expect(formatNumberForLocale(5001, 'en')).toBe('5,001')
    expect(formatNumberForLocale(5001, 'vi')).toBe('5.001')
    expect(formatNumberForLocale(5001, 'ja')).toBe('5,001')
  })
})

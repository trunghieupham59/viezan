import { describe, expect, it } from 'vitest'
import {
  currencyDisplayName,
  defaultCurrencyTarget,
  formatConvertedAmount,
  formatCurrencyAmount,
  formatCurrencyRate,
  parseCurrencyQuery,
} from '../currencyQuery'

const parse = (query: string, locale: 'en' | 'vi' | 'ja' = 'en') => parseCurrencyQuery(query, locale)

describe('parseCurrencyQuery', () => {
  it('reads symbols before or after the amount and ISO codes or names after it', () => {
    expect(parse('2$')).toEqual({ amount: 2, from: 'USD' })
    expect(parse('$2')).toEqual({ amount: 2, from: 'USD' })
    expect(parse('2 usd')).toEqual({ amount: 2, from: 'USD' })
    expect(parse('2USD')).toEqual({ amount: 2, from: 'USD' })
    expect(parse('100 yen')).toEqual({ amount: 100, from: 'JPY' })
    expect(parse('50€')).toEqual({ amount: 50, from: 'EUR' })
    expect(parse('£ 10')).toEqual({ amount: 10, from: 'GBP' })
    expect(parse('1000₩')).toEqual({ amount: 1000, from: 'KRW' })
    expect(parse('US$ 3')).toEqual({ amount: 3, from: 'USD' })
  })

  it('reads an explicit target after to / in / sang / → or as a bare second unit', () => {
    expect(parse('2 usd to vnd')).toEqual({ amount: 2, from: 'USD', to: 'VND' })
    expect(parse('2$ in jpy')).toEqual({ amount: 2, from: 'USD', to: 'JPY' })
    expect(parse('2$ → eur')).toEqual({ amount: 2, from: 'USD', to: 'EUR' })
    expect(parse('2$ = eur')).toEqual({ amount: 2, from: 'USD', to: 'EUR' })
    expect(parse('2 usd vnd')).toEqual({ amount: 2, from: 'USD', to: 'VND' })
    expect(parse('$2 vnd')).toEqual({ amount: 2, from: 'USD', to: 'VND' })
    expect(parse('2$ inr')).toEqual({ amount: 2, from: 'USD', to: 'INR' })
    expect(parse('2$ to')).toEqual({ amount: 2, from: 'USD' })
    expect(parse('2 usd to usd')).toEqual({ amount: 2, from: 'USD' })
  })

  it('understands Vietnamese and Japanese currency words with or without diacritics', () => {
    expect(parse('2 đô sang yên', 'vi')).toEqual({ amount: 2, from: 'USD', to: 'JPY' })
    expect(parse('2 do la', 'vi')).toEqual({ amount: 2, from: 'USD' })
    expect(parse('50.000đ', 'vi')).toEqual({ amount: 50_000, from: 'VND' })
    expect(parse('50.000 đồng', 'vi')).toEqual({ amount: 50_000, from: 'VND' })
    expect(parse('100円', 'ja')).toEqual({ amount: 100, from: 'JPY' })
    expect(parse('100ドル に 円', 'ja')).toEqual({ amount: 100, from: 'USD', to: 'JPY' })
    expect(parse('1万円', 'ja')).toEqual({ amount: 10_000, from: 'JPY' })
  })

  it('parses decimals and thousands per locale and scales k / tr / m suffixes', () => {
    expect(parse('1.5 usd', 'en')).toEqual({ amount: 1.5, from: 'USD' })
    expect(parse('1,5 usd', 'vi')).toEqual({ amount: 1.5, from: 'USD' })
    expect(parse('1,500 usd', 'en')).toEqual({ amount: 1500, from: 'USD' })
    expect(parse('1.500.000 vnd', 'vi')).toEqual({ amount: 1_500_000, from: 'VND' })
    expect(parse('500k vnd', 'vi')).toEqual({ amount: 500_000, from: 'VND' })
    expect(parse('2tr vnd', 'vi')).toEqual({ amount: 2_000_000, from: 'VND' })
    expect(parse('1.5m usd', 'en')).toEqual({ amount: 1_500_000, from: 'USD' })
    expect(parse('2 krw')).toEqual({ amount: 2, from: 'KRW' })
  })

  it('stays silent for plain numbers, text, arithmetic, unknown units and oversized amounts', () => {
    for (const query of ['', '2', '2 + 2', 'chat', '2 abc', '1password', '2$ to abc', '2 m', '12 tr', '2 in', 'usd', '$', '2$$',
      '9999999999999999 usd', '2,5,5 usd', 'x'.repeat(61)]) {
      expect(parse(query), query).toBeNull()
    }
    expect(parse('2$ to')).not.toBeNull()
  })
})

describe('currency helpers', () => {
  it('derives the default target from the UI language unless a known preference exists', () => {
    expect(defaultCurrencyTarget('en', null)).toBe('USD')
    expect(defaultCurrencyTarget('vi', undefined)).toBe('VND')
    expect(defaultCurrencyTarget('ja', null)).toBe('JPY')
    expect(defaultCurrencyTarget('vi', 'JPY')).toBe('JPY')
    expect(defaultCurrencyTarget('vi', 'XXX')).toBe('VND')
    expect(defaultCurrencyTarget('vi', null, 'VND')).toBe('USD')
    expect(defaultCurrencyTarget('en', null, 'USD')).toBe('EUR')
    expect(defaultCurrencyTarget('vi', 'JPY', 'JPY')).toBe('VND')
  })

  it('formats amounts and converted values for the UI locale and the currency minor units', () => {
    expect(formatCurrencyAmount(2, 'USD', 'en')).toBe('2 USD')
    expect(formatCurrencyAmount(1234.5, 'VND', 'vi')).toBe('1.234,5 VND')
    expect(formatConvertedAmount(50900.4, 'VND', 'vi')).toBe('50.900')
    expect(formatConvertedAmount(2.149, 'EUR', 'en')).toBe('2.15')
    expect(formatConvertedAmount(300, 'JPY', 'ja')).toBe('300')
    expect(formatConvertedAmount(1, 'NOPE', 'en')).toBe('1')
    expect(formatCurrencyRate(25400.123, 'vi')).toBe('25.400,1')
    expect(formatCurrencyRate(0.0000394, 'en')).toBe('0.0000394')
    expect(currencyDisplayName('USD', 'vi')).toBe('Đô la Mỹ')
    expect(currencyDisplayName('USD', 'en')).toBe('US Dollar')
  })
})

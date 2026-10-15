import { describe, expect, it } from 'vitest'
import { evaluateQuickCalc } from '../quickCalc'

const calc = (query: string, locale: 'en' | 'vi' | 'ja' = 'en') => evaluateQuickCalc(query, locale)

describe('evaluateQuickCalc', () => {
  it('evaluates basic arithmetic and ignores a trailing "=?"', () => {
    expect(calc('25 + 25')?.value).toBe(50)
    expect(calc('25 + 25 =?')?.value).toBe(50)
    expect(calc('25+25=')?.expression).toBe('25+25')
    expect(calc('7 - 10')?.value).toBe(-3)
  })

  it('respects precedence, parentheses, unary minus and right-associative powers', () => {
    expect(calc('2 + 3 * 4')?.value).toBe(14)
    expect(calc('(2 + 3) * 4')?.value).toBe(20)
    expect(calc('-2 ^ 2')?.value).toBe(-4)
    expect(calc('2 ^ 3 ^ 2')?.value).toBe(512)
    expect(calc('2 ^ -1')?.value).toBe(0.5)
    expect(calc('2 ** 10')?.value).toBe(1024)
  })

  it('accepts x, × and ÷ as operators', () => {
    expect(calc('25 x 25')?.value).toBe(625)
    expect(calc('25X4')?.value).toBe(100)
    expect(calc('6 × 7')?.value).toBe(42)
    expect(calc('84 ÷ 2')?.value).toBe(42)
    expect(calc('6 × 7')?.expression).toBe('6 × 7')
  })

  it('treats percent like a pocket calculator', () => {
    expect(calc('50%')?.value).toBe(0.5)
    expect(calc('200 * 10%')?.value).toBe(20)
    expect(calc('100 + 10%')?.value).toBe(110)
    expect(calc('100 - 25%')?.value).toBe(75)
  })

  it('supports unary functions and constants', () => {
    expect(calc('sqrt(144)')?.value).toBe(12)
    expect(calc('abs(-5) + 1')?.value).toBe(6)
    expect(calc('2 * pi')?.value).toBeCloseTo(Math.PI * 2)
    expect(calc('log(1000)')?.value).toBeCloseTo(3)
  })

  it('removes binary floating point noise', () => {
    expect(calc('0.1 + 0.2')?.value).toBeCloseTo(0.3, 12)
    expect(calc('0.1 + 0.2')?.formatted).toBe('0.3')
  })

  it('formats and parses numbers per locale', () => {
    expect(calc('1000 * 1000')?.formatted).toBe('1,000,000')
    expect(calc('1000 * 1000', 'vi')?.formatted).toBe('1.000.000')
    expect(calc('1,5 + 2,5', 'vi')?.value).toBe(4)
    expect(calc('1.500 + 500', 'vi')?.value).toBe(2000)
    expect(calc('1,500 + 500', 'en')?.value).toBe(2000)
    expect(calc('1.5 + 2.5', 'en')?.value).toBe(4)
    expect(calc('1.234,5 * 2', 'vi')?.value).toBe(2469)
    expect(calc('1,234.5 * 2', 'en')?.value).toBe(2469)
  })

  it('stays silent for anything that is not plainly arithmetic', () => {
    expect(calc('')).toBeNull()
    expect(calc('25')).toBeNull()
    expect(calc('-5')).toBeNull()
    expect(calc('(5)')).toBeNull()
    expect(calc('chat')).toBeNull()
    expect(calc('chat 2 + 2')).toBeNull()
    expect(calc('thông tư 25 về khám sức khoẻ')).toBeNull()
    expect(calc('hello()')).toBeNull()
    expect(calc('2 +')).toBeNull()
    expect(calc('(2 + 3')).toBeNull()
    expect(calc('1; alert(1)')).toBeNull()
  })

  it('does not treat dates and phone-like numbers as subtraction', () => {
    expect(calc('2025-10-11')).toBeNull()
    expect(calc('1/2/2025')).toBeNull()
    expect(calc('0912-345-678')).toBeNull()
  })

  it('returns null for non-finite results and oversized input', () => {
    expect(calc('1 / 0')).toBeNull()
    expect(calc('sqrt(-1)')).toBeNull()
    expect(calc('9 ^ 9 ^ 9')).toBeNull()
    expect(calc(`1${' + 1'.repeat(100)}`)).toBeNull()
  })

  it('never evaluates arbitrary code', () => {
    expect(calc('constructor.constructor("return 1")()')).toBeNull()
    expect(calc('process.exit(1)')).toBeNull()
    expect(calc('__proto__ + 1')).toBeNull()
    expect(calc('toString(1) + 1')).toBeNull()
    expect(calc('constructor(5) + 1')).toBeNull()
    expect(calc('constructor + 1')).toBeNull()
    expect(calc('valueof(2) * 2')).toBeNull()
  })
})

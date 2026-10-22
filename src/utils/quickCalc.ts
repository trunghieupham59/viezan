import type { AppLocale } from '../i18n'

/**
 * Safe inline calculator for the command palette.
 *
 * A hand-written recursive-descent parser — never `eval`/`Function` — so arbitrary
 * user text cannot execute code. It only answers when the query is unambiguously
 * arithmetic (at least one operation, nothing but numbers/operators/known functions);
 * anything else returns `null` so the palette falls back to command search / AI.
 */

export interface QuickCalcResult {
  /** The expression as typed, without the trailing `=` / `?`. */
  expression: string
  value: number
  /** Locale-formatted value for display and clipboard. */
  formatted: string
}

type Token =
  | { type: 'num'; value: number }
  | { type: 'op'; value: '+' | '-' | '*' | '/' | '^' | '%' }
  | { type: 'ident'; value: string }
  | { type: 'lparen' }
  | { type: 'rparen' }

interface Val {
  v: number
  /** True when the value is exactly a `n%` literal, so `100 + 10%` can mean "+10% of 100". */
  pct: boolean
}

const MAX_EXPRESSION_CHARS = 200
const SIGNIFICANT_DIGITS = 12

const BCP47_BY_LOCALE: Record<AppLocale, string> = { en: 'en-US', vi: 'vi-VN', ja: 'ja-JP' }

const CONSTANTS = new Map<string, number>([['pi', Math.PI], ['e', Math.E]])

// Maps (not object literals) so `constructor`/`toString` can never resolve via the prototype chain.
const FUNCTIONS = new Map<string, (x: number) => number>([
  ['sqrt', Math.sqrt],
  ['abs', Math.abs],
  ['round', Math.round],
  ['floor', Math.floor],
  ['ceil', Math.ceil],
  ['sin', Math.sin],
  ['cos', Math.cos],
  ['tan', Math.tan],
  ['log', Math.log10],
  ['ln', Math.log],
])

/** Dates (`2025-10-11`, `1/2/2025`) and phone-like numbers are not arithmetic. */
const DATE_OR_PHONE_LIKE = /^\d{1,4}([-/.]\d{1,4}){2,}$/

class CalcError extends Error {}

function fail(): never {
  throw new CalcError()
}

/**
 * Parse one numeric token, resolving `.` / `,` as decimal or thousands separator.
 * Throws a `CalcError` for an unreadable token; `parseLocaleNumber` is the safe wrapper.
 * When both appear the last one is the decimal; a lone separator followed by exactly
 * three digits is thousands in the locale that uses it for grouping (vi: `.`, others: `,`).
 */
function parseNumberToken(raw: string, locale: AppLocale): number {
  const lastDot = raw.lastIndexOf('.')
  const lastComma = raw.lastIndexOf(',')
  let normalized: string

  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? '.' : ','
    const group = decimal === '.' ? ',' : '.'
    if (raw.split(decimal).length > 2) fail()
    normalized = raw.split(group).join('').replace(decimal, '.')
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ','
    const parts = raw.split(sep)
    const groupSep = locale === 'vi' ? '.' : ','
    const looksGrouped = /^[1-9]\d{0,2}$/.test(parts[0]) && parts.slice(1).every(part => part.length === 3)
    if (parts.length > 2) {
      if (sep !== groupSep || !looksGrouped) fail()
      normalized = parts.join('')
    } else if (sep === groupSep && looksGrouped) {
      normalized = parts.join('')
    } else {
      normalized = parts.join('.')
    }
  } else {
    normalized = raw
  }

  const value = Number(normalized)
  if (!Number.isFinite(value)) fail()
  return value
}

/** `null` when `raw` is not one plain number in the locale's `.` / `,` conventions. */
export function parseLocaleNumber(raw: string, locale: AppLocale): number | null {
  if (!/^(?:\d[\d.,]*\d|\d|\.\d+)$/.test(raw)) return null
  try {
    return parseNumberToken(raw, locale)
  } catch (error) {
    if (error instanceof CalcError) return null
    throw error
  }
}

function tokenize(input: string, locale: AppLocale): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < input.length) {
    const ch = input[i]

    if (/\s/.test(ch)) {
      i += 1
      continue
    }

    const numberMatch = /^(?:\d[\d.,]*\d|\d|\.\d+)/.exec(input.slice(i))
    if (numberMatch) {
      tokens.push({ type: 'num', value: parseNumberToken(numberMatch[0], locale) })
      i += numberMatch[0].length
      continue
    }

    const identMatch = /^[a-z]+/i.exec(input.slice(i))
    if (identMatch) {
      const word = identMatch[0].toLowerCase()
      const prev = tokens[tokens.length - 1]
      const afterOperand = prev?.type === 'num' || prev?.type === 'rparen' || (prev?.type === 'op' && prev.value === '%')
      // `15% of 80` reads as a multiplication, like `25 x 4`.
      if ((word === 'x' || word === 'of') && afterOperand) tokens.push({ type: 'op', value: '*' })
      else tokens.push({ type: 'ident', value: word })
      i += identMatch[0].length
      continue
    }

    if (ch === '*' && input[i + 1] === '*') {
      tokens.push({ type: 'op', value: '^' })
      i += 2
      continue
    }

    if (ch === '(') tokens.push({ type: 'lparen' })
    else if (ch === ')') tokens.push({ type: 'rparen' })
    else if ('+-*/^%'.includes(ch)) tokens.push({ type: 'op', value: ch as '+' | '-' | '*' | '/' | '^' | '%' })
    else fail()
    i += 1
  }

  return tokens
}

/** Evaluates a token stream; returns the value and whether any operation was applied. */
function evaluateTokens(tokens: Token[]): { value: number; hasOperation: boolean } {
  let pos = 0
  let hasOperation = false

  const peek = () => tokens[pos]
  const isOp = (token: Token | undefined, ...ops: string[]): token is Extract<Token, { type: 'op' }> =>
    token?.type === 'op' && ops.includes(token.value)

  function primary(): Val {
    const token = tokens[pos]
    pos += 1
    if (!token) return fail()

    if (token.type === 'num') return { v: token.value, pct: false }

    if (token.type === 'lparen') {
      const inner = additive()
      if (tokens[pos]?.type !== 'rparen') fail()
      pos += 1
      return { v: inner.v, pct: false }
    }

    if (token.type === 'ident') {
      const constant = CONSTANTS.get(token.value)
      if (constant !== undefined) return { v: constant, pct: false }
      const fn = FUNCTIONS.get(token.value)
      if (!fn || tokens[pos]?.type !== 'lparen') return fail()
      pos += 1
      const arg = additive()
      if (tokens[pos]?.type !== 'rparen') fail()
      pos += 1
      hasOperation = true
      return { v: fn(arg.v), pct: false }
    }

    return fail()
  }

  function postfix(): Val {
    let result = primary()
    while (isOp(peek(), '%')) {
      pos += 1
      hasOperation = true
      result = { v: result.v / 100, pct: true }
    }
    return result
  }

  function power(): Val {
    const base = postfix()
    if (!isOp(peek(), '^')) return base
    pos += 1
    hasOperation = true
    const exponent = unary() // right-associative: 2^3^2 = 2^(3^2); allows 2^-1
    return { v: base.v ** exponent.v, pct: false }
  }

  function unary(): Val {
    const token = peek()
    if (isOp(token, '+', '-')) {
      pos += 1
      const operand = unary()
      return { v: token.value === '-' ? -operand.v : operand.v, pct: operand.pct }
    }
    return power()
  }

  function term(): Val {
    let left = unary()
    while (isOp(peek(), '*', '/')) {
      const op = (peek() as { value: string }).value
      pos += 1
      hasOperation = true
      const right = unary()
      left = { v: op === '*' ? left.v * right.v : left.v / right.v, pct: false }
    }
    return left
  }

  function additive(): Val {
    let left = term()
    while (isOp(peek(), '+', '-')) {
      const op = (peek() as { value: string }).value
      pos += 1
      hasOperation = true
      const right = term()
      // `100 + 10%` reads as "100 plus 10% of 100", like a pocket calculator.
      const rightValue = right.pct ? left.v * right.v : right.v
      left = { v: op === '+' ? left.v + rightValue : left.v - rightValue, pct: false }
    }
    return left
  }

  const result = additive()
  if (pos !== tokens.length) fail()
  return { value: result.v, hasOperation }
}

function formatResult(value: number, locale: AppLocale): string {
  const rounded = Number(value.toPrecision(SIGNIFICANT_DIGITS))
  if (rounded === 0 && value !== 0) return value.toExponential(6)
  return new Intl.NumberFormat(BCP47_BY_LOCALE[locale] ?? 'en-US', { maximumFractionDigits: 10 }).format(rounded)
}

/** Returns a result only when `query` is plainly arithmetic; otherwise `null`. */
export function evaluateQuickCalc(query: string, locale: AppLocale): QuickCalcResult | null {
  const expression = query.replace(/[\s=?]+$/u, '').trim()
  const normalized = expression.replace(/×/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-')

  if (!normalized || normalized.length > MAX_EXPRESSION_CHARS) return null
  if (!/\d/.test(normalized)) return null
  if (DATE_OR_PHONE_LIKE.test(normalized.replace(/\s+/g, ''))) return null

  try {
    const { value, hasOperation } = evaluateTokens(tokenize(normalized, locale))
    if (!hasOperation || !Number.isFinite(value)) return null
    return { expression, value, formatted: formatResult(value, locale) }
  } catch (error) {
    if (error instanceof CalcError) return null
    throw error
  }
}

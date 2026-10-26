import { isLauncherCurrency, LAUNCHER_CURRENCIES } from '../constants/currencies'
import type { AppLocale } from '../i18n'
import { foldSearchText } from './foldSearchText'
import { parseLocaleNumber } from './quickCalc'

/**
 * Recognises "amount + currency" launcher queries such as `2$`, `$2`, `2 usd`,
 * `100 yen`, `50€`, `2 usd to vnd` or `2$ in jpy`. Anything else returns `null`
 * so the launcher keeps showing ordinary results.
 */
export interface CurrencyQuery {
  amount: number
  /** ISO 4217 code of the typed currency. */
  from: string
  /** ISO 4217 code of an explicitly requested target, if any. */
  to?: string
}

const MAX_QUERY_CHARS = 60
const MAX_AMOUNT = 1e15
/** `500k`, `2tr` (triệu), `1.5m` and `1万` scale the amount; only when attached to the number. */
const MULTIPLIERS = new Map<string, number>([['k', 1_000], ['tr', 1_000_000], ['m', 1_000_000], ['万', 10_000]])
const TARGET_SEPARATORS = ['->', '→', '=', 'to', 'in', 'into', 'sang', 'thanh', 'ra', 'den', 'に', 'へ']

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Same folding as the launcher search: no diacritics, `đ` → `d`, lower case. */
export const foldCurrencyText = foldSearchText

const aliasToCode = new Map<string, string>()
for (const currency of LAUNCHER_CURRENCIES) {
  for (const alias of currency.aliases) aliasToCode.set(foldCurrencyText(alias), currency.code)
  aliasToCode.set(currency.code.toLowerCase(), currency.code)
}
// Longest alias first so `us$` is not read as `us` + `$`, and `inr` not as `in` + `r`.
const UNIT = `(?:${[...aliasToCode.keys()].sort((a, b) => b.length - a.length).map(escapePattern).join('|')})`
const NUMBER = String.raw`(?:\d[\d.,]*\d|\d|\.\d+)`
const MULTIPLIER = `(?:${[...MULTIPLIERS.keys()].sort((a, b) => b.length - a.length).map(escapePattern).join('|')})`
const SEPARATOR = `(?:${TARGET_SEPARATORS.map(escapePattern).join('|')})`
const QUERY = new RegExp(
  `^(?:(${UNIT})\\s*)?(${NUMBER})(${MULTIPLIER})?(?:\\s*(${UNIT}))?(?:\\s*${SEPARATOR}\\s*(${UNIT})?|\\s+(${UNIT}))?$`,
  'u',
)

export function parseCurrencyQuery(query: string, locale: AppLocale): CurrencyQuery | null {
  const text = foldCurrencyText(query.trim())
  if (!text || text.length > MAX_QUERY_CHARS) return null
  const match = QUERY.exec(text)
  if (!match) return null
  const [, prefix, number, multiplier, suffix, separatedTarget, spacedTarget] = match
  const from = aliasToCode.get(prefix ?? suffix ?? '')
  if (!from) return null
  const parsed = parseLocaleNumber(number, locale)
  if (parsed === null) return null
  const amount = parsed * (multiplier ? MULTIPLIERS.get(multiplier) ?? 1 : 1)
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) return null
  // `$2 vnd` names both ends without a separator: the suffix becomes the target.
  const targetAlias = separatedTarget ?? spacedTarget ?? (prefix && suffix ? suffix : undefined)
  const to = targetAlias ? aliasToCode.get(targetAlias) : undefined
  if (targetAlias && !to) return null
  return { amount, from, ...(to && to !== from ? { to } : {}) }
}

const BCP47_BY_LOCALE: Record<AppLocale, string> = { en: 'en-US', vi: 'vi-VN', ja: 'ja-JP' }
const DEFAULT_TARGET_BY_LOCALE: Record<AppLocale, string> = { en: 'USD', vi: 'VND', ja: 'JPY' }

/**
 * The user's launcher choice wins, then the UI language; a target equal to the
 * typed currency is skipped so `300 yen` never reads "300 JPY = 300 JPY".
 */
export function defaultCurrencyTarget(locale: AppLocale, preferred: string | null | undefined, from?: string): string {
  const candidates = [preferred, DEFAULT_TARGET_BY_LOCALE[locale], 'USD', 'EUR']
  return candidates.find((code): code is string => isLauncherCurrency(code) && code !== from) ?? 'USD'
}

/** `2 USD` / `1.234,5 VND`: the typed amount with its code, in the UI locale. */
export function formatCurrencyAmount(amount: number, code: string, locale: AppLocale): string {
  const formatted = new Intl.NumberFormat(BCP47_BY_LOCALE[locale] ?? 'en-US', { maximumFractionDigits: 6 }).format(amount)
  return `${formatted} ${code}`
}

/** A converted amount with the currency's own minor units, e.g. `50.900` for VND and `2,15` for EUR. */
export function formatConvertedAmount(value: number, code: string, locale: AppLocale): string {
  try {
    return new Intl.NumberFormat(BCP47_BY_LOCALE[locale] ?? 'en-US', { style: 'currency', currency: code, currencyDisplay: 'code' })
      .formatToParts(value)
      .filter(part => part.type !== 'currency' && part.type !== 'literal')
      .map(part => part.value)
      .join('')
      .trim()
  } catch {
    return new Intl.NumberFormat(BCP47_BY_LOCALE[locale] ?? 'en-US', { maximumFractionDigits: 2 }).format(value)
  }
}

/** An exchange rate keeps enough significant digits for both `25.400` and `0,000039`. */
export function formatCurrencyRate(rate: number, locale: AppLocale): string {
  return new Intl.NumberFormat(BCP47_BY_LOCALE[locale] ?? 'en-US', { maximumSignificantDigits: 6 }).format(rate)
}

/** Localised currency name (`Đô la Mỹ`), falling back to the code when the runtime has no data. */
export function currencyDisplayName(code: string, locale: AppLocale): string {
  try {
    return new Intl.DisplayNames(BCP47_BY_LOCALE[locale] ?? 'en-US', { type: 'currency' }).of(code) ?? code
  } catch {
    return code
  }
}

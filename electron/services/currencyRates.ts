import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { CurrencyConversion, CurrencyConversionRequest } from '../../shared/launcher'

/**
 * Daily exchange rates for the launcher's inline currency conversion.
 *
 * Rates come from keyless public endpoints, are cached on disk with the fetch
 * time, and are refreshed at most once per day. Without network the last
 * cached table keeps serving; with no cache at all `get()` resolves `null`.
 */
export interface CurrencyRateSnapshot {
  /** Every rate is "1 base = rate units", base is always USD. */
  base: string
  rates: Record<string, number>
  /** Provider's publication time (ms). */
  updatedAt: number
  /** When this process last downloaded the table (ms). */
  fetchedAt: number
}

export const CURRENCY_RATES_TTL_MS = 24 * 60 * 60 * 1000
/** After a failed download, serve the stale table and wait before trying again. */
export const CURRENCY_RATES_RETRY_MS = 5 * 60 * 1000
const CACHE_VERSION = 1
const FETCH_TIMEOUT_MS = 8_000
const MAX_BODY_BYTES = 512 * 1024
const MAX_RATE_ENTRIES = 1_000
const MAX_AMOUNT = 1e15
const CODE = /^[A-Z]{3}$/

interface RateSource {
  url: string
  parse: (body: unknown) => Omit<CurrencyRateSnapshot, 'fetchedAt'> | null
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Keep only `AAA: positive finite number` pairs; the base itself is pinned to 1. */
function cleanRates(raw: unknown, base: string): Record<string, number> | null {
  if (!isRecord(raw)) return null
  const rates: Record<string, number> = {}
  let count = 0
  for (const [key, value] of Object.entries(raw)) {
    const code = key.toUpperCase()
    if (!CODE.test(code) || typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue
    if (++count > MAX_RATE_ENTRIES) return null
    rates[code] = value
  }
  rates[base] = 1
  return Object.keys(rates).length > 1 ? rates : null
}

const SOURCES: readonly RateSource[] = [
  {
    url: 'https://open.er-api.com/v6/latest/USD',
    parse: body => {
      if (!isRecord(body) || body.result !== 'success' || body.base_code !== 'USD') return null
      const seconds = body.time_last_update_unix
      if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null
      const rates = cleanRates(body.rates, 'USD')
      return rates ? { base: 'USD', rates, updatedAt: Math.floor(seconds * 1000) } : null
    },
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
    parse: body => {
      if (!isRecord(body) || typeof body.date !== 'string') return null
      const updatedAt = Date.parse(`${body.date}T00:00:00Z`)
      if (!Number.isFinite(updatedAt)) return null
      const rates = cleanRates(body.usd, 'USD')
      return rates ? { base: 'USD', rates, updatedAt } : null
    },
  },
]

export function parseCurrencyRateSnapshot(raw: unknown, now: number): CurrencyRateSnapshot | null {
  if (!isRecord(raw) || raw.version !== CACHE_VERSION || raw.base !== 'USD') return null
  const { updatedAt, fetchedAt } = raw
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt <= 0) return null
  if (typeof fetchedAt !== 'number' || !Number.isFinite(fetchedAt) || fetchedAt <= 0 || fetchedAt > now) return null
  const rates = cleanRates(raw.rates, 'USD')
  return rates ? { base: 'USD', rates, updatedAt, fetchedAt } : null
}

/** Shape-checks a renderer request; codes must be upper-case ISO 4217 and the amount bounded. */
export function parseCurrencyConversionRequest(raw: unknown): CurrencyConversionRequest | null {
  if (!isRecord(raw)) return null
  const { amount, from, to } = raw
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) return null
  if (typeof from !== 'string' || !CODE.test(from) || typeof to !== 'string' || !CODE.test(to)) return null
  return { amount, from, to }
}

/** `null` when either code is missing from the table. */
export function convertWithSnapshot(snapshot: CurrencyRateSnapshot, request: CurrencyConversionRequest): CurrencyConversion | null {
  const fromRate = snapshot.rates[request.from]
  const toRate = snapshot.rates[request.to]
  if (!fromRate || !toRate) return null
  const rate = toRate / fromRate
  return { ...request, rate, converted: request.amount * rate, rateUpdatedAt: snapshot.updatedAt }
}

interface StoreOptions {
  file: string
  fetch?: typeof fetch
  now?: () => number
  sources?: readonly RateSource[]
}

export class CurrencyRateStore {
  private snapshot: CurrencyRateSnapshot | null = null
  private loaded?: Promise<void>
  private pending?: Promise<CurrencyRateSnapshot | null>
  private failedAt = 0

  constructor(private readonly options: StoreOptions) {}

  private now() { return this.options.now?.() ?? Date.now() }

  private async load(): Promise<void> {
    try {
      this.snapshot = parseCurrencyRateSnapshot(JSON.parse(await readFile(this.options.file, 'utf-8')), this.now())
    } catch {
      this.snapshot = null
    }
  }

  private async download(): Promise<CurrencyRateSnapshot | null> {
    const fetchImpl = this.options.fetch ?? fetch
    for (const source of this.options.sources ?? SOURCES) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      try {
        const response = await fetchImpl(source.url, { signal: controller.signal, headers: { accept: 'application/json' } })
        if (!response.ok) continue
        const length = Number(response.headers.get('content-length'))
        if (Number.isFinite(length) && length > MAX_BODY_BYTES) continue
        const text = await response.text()
        if (text.length > MAX_BODY_BYTES) continue
        const parsed = source.parse(JSON.parse(text))
        if (parsed) return { ...parsed, fetchedAt: this.now() }
      } catch { /* Try the next source; the caller falls back to the cached table. */ } finally {
        clearTimeout(timer)
      }
    }
    return null
  }

  private async persist(snapshot: CurrencyRateSnapshot): Promise<void> {
    try {
      await mkdir(path.dirname(this.options.file), { recursive: true })
      await writeFile(`${this.options.file}.tmp`, JSON.stringify({ version: CACHE_VERSION, ...snapshot }), 'utf-8')
      await rename(`${this.options.file}.tmp`, this.options.file)
    } catch { /* The in-memory table still serves this session. */ }
  }

  private async refresh(): Promise<CurrencyRateSnapshot | null> {
    const downloaded = await this.download()
    if (downloaded) {
      this.snapshot = downloaded
      this.failedAt = 0
      await this.persist(downloaded)
    } else {
      this.failedAt = this.now()
    }
    return this.snapshot
  }

  /** Fresh table when possible, else the stale cached one, else `null`. */
  async get(): Promise<CurrencyRateSnapshot | null> {
    this.loaded ??= this.load()
    await this.loaded
    const now = this.now()
    if (this.snapshot && now - this.snapshot.fetchedAt < CURRENCY_RATES_TTL_MS) return this.snapshot
    if (this.failedAt && now - this.failedAt < CURRENCY_RATES_RETRY_MS) return this.snapshot
    this.pending ??= this.refresh().finally(() => { this.pending = undefined })
    return this.pending
  }
}

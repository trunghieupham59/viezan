// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CURRENCY_RATES_RETRY_MS,
  CURRENCY_RATES_TTL_MS,
  CurrencyRateStore,
  convertWithSnapshot,
  parseCurrencyConversionRequest,
  parseCurrencyRateSnapshot,
} from '../currencyRates'

const fs = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn(), rename: vi.fn(), mkdir: vi.fn() }))
vi.mock('node:fs/promises', () => fs)

const DAY = CURRENCY_RATES_TTL_MS
const START = 1_800_000_000_000
const cached = { version: 1, base: 'USD', rates: { USD: 1, VND: 25_000, JPY: 150 }, updatedAt: START - 2 * DAY, fetchedAt: START - 2 * DAY }
const primary = { result: 'success', base_code: 'USD', time_last_update_unix: START / 1000 - 3600, rates: { VND: 26_000, JPY: 155, EUR: 0.9, bad: 'x', ZZZZ: 1 } }
const fallback = { date: '2026-10-21', usd: { vnd: 25_500, jpy: 152 } }

const response = (body: unknown, ok = true) => ({
  ok, headers: new Headers({ 'content-length': String(JSON.stringify(body).length) }), text: async () => JSON.stringify(body),
}) as unknown as Response

let now = START
const fetchMock = vi.fn()
const store = () => new CurrencyRateStore({ file: '/data/launcher-currency-rates-v1.json', fetch: fetchMock, now: () => now })

beforeEach(() => {
  vi.clearAllMocks()
  now = START
  fs.readFile.mockRejectedValue(new Error('ENOENT'))
  fs.writeFile.mockResolvedValue(undefined)
  fs.rename.mockResolvedValue(undefined)
  fs.mkdir.mockResolvedValue(undefined)
  fetchMock.mockResolvedValue(response(primary))
})

describe('CurrencyRateStore', () => {
  it('downloads once, validates the table, writes it atomically and serves it for a day', async () => {
    const rates = store()
    const [first, second] = await Promise.all([rates.get(), rates.get()])
    expect(first).toEqual({ base: 'USD', rates: { USD: 1, VND: 26_000, JPY: 155, EUR: 0.9 }, updatedAt: (START / 1000 - 3600) * 1000, fetchedAt: START })
    expect(second).toBe(first)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(new URL(fetchMock.mock.calls[0][0]).origin).toBe('https://open.er-api.com')
    expect(fs.writeFile).toHaveBeenCalledWith('/data/launcher-currency-rates-v1.json.tmp', JSON.stringify({ version: 1, ...first }), 'utf-8')
    expect(fs.rename).toHaveBeenCalledWith('/data/launcher-currency-rates-v1.json.tmp', '/data/launcher-currency-rates-v1.json')
    now = START + DAY - 1
    expect(await rates.get()).toBe(first)
    expect(fetchMock).toHaveBeenCalledOnce()
    now = START + DAY
    await rates.get()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('serves a fresh disk cache without any network request', async () => {
    fs.readFile.mockResolvedValue(JSON.stringify({ ...cached, fetchedAt: START - DAY / 2 }))
    expect(await store().get()).toMatchObject({ rates: { VND: 25_000 }, fetchedAt: START - DAY / 2 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes a stale disk cache and keeps serving it while offline, retrying only after the back-off', async () => {
    fs.readFile.mockResolvedValue(JSON.stringify(cached))
    fetchMock.mockRejectedValue(new Error('offline'))
    const rates = store()
    expect(await rates.get()).toMatchObject({ rates: { VND: 25_000 }, fetchedAt: START - 2 * DAY })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    now = START + CURRENCY_RATES_RETRY_MS - 1
    expect(await rates.get()).toMatchObject({ rates: { VND: 25_000 } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    now = START + CURRENCY_RATES_RETRY_MS
    fetchMock.mockResolvedValue(response(primary))
    expect(await rates.get()).toMatchObject({ rates: { VND: 26_000 }, fetchedAt: now })
    expect(fs.writeFile).toHaveBeenCalledOnce()
  })

  it('falls back to the second source when the first fails or answers garbage', async () => {
    fetchMock.mockResolvedValueOnce(response({ result: 'error' })).mockResolvedValueOnce(response(fallback))
    expect(await store().get()).toEqual({ base: 'USD', rates: { VND: 25_500, JPY: 152, USD: 1 }, updatedAt: Date.parse('2026-10-21T00:00:00Z'), fetchedAt: START })
    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce(response(primary, false)).mockResolvedValueOnce(response(fallback))
    expect(await store().get()).toMatchObject({ rates: { VND: 25_500 } })
  })

  it('resolves null with no cache and no network, ignores corrupt or oversized caches', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    expect(await store().get()).toBeNull()
    expect(fs.writeFile).not.toHaveBeenCalled()
    fs.readFile.mockResolvedValue('{not json')
    expect(await store().get()).toBeNull()
    fs.readFile.mockResolvedValue(JSON.stringify({ ...cached, fetchedAt: START + 1 }))
    expect(await store().get()).toBeNull()
    fs.readFile.mockResolvedValue(JSON.stringify({ ...cached, version: 2 }))
    expect(await store().get()).toBeNull()
  })
})

describe('parseCurrencyRateSnapshot', () => {
  it('accepts a well-formed cache and drops malformed rate entries', () => {
    expect(parseCurrencyRateSnapshot({ ...cached, rates: { vnd: 25_000, JPY: -1, EUR: 'x', TOOLONG: 2 } }, START))
      .toEqual({ base: 'USD', rates: { VND: 25_000, USD: 1 }, updatedAt: cached.updatedAt, fetchedAt: cached.fetchedAt })
    for (const invalid of [null, [], { ...cached, base: 'EUR' }, { ...cached, rates: {} }, { ...cached, updatedAt: 'x' }, { ...cached, fetchedAt: 0 }]) {
      expect(parseCurrencyRateSnapshot(invalid, START)).toBeNull()
    }
  })
})

describe('parseCurrencyConversionRequest and convertWithSnapshot', () => {
  it('validates amount and ISO codes, then converts through the USD base', () => {
    expect(parseCurrencyConversionRequest({ amount: 2, from: 'USD', to: 'VND' })).toEqual({ amount: 2, from: 'USD', to: 'VND' })
    for (const invalid of [null, 'x', { amount: '2', from: 'USD', to: 'VND' }, { amount: -1, from: 'USD', to: 'VND' },
      { amount: Number.NaN, from: 'USD', to: 'VND' }, { amount: 1e16, from: 'USD', to: 'VND' }, { amount: 2, from: 'usd', to: 'VND' },
      { amount: 2, from: 'USD', to: 'VN' }, { amount: 2, from: 'USD' }, { amount: 2, from: '../x', to: 'VND' }]) {
      expect(parseCurrencyConversionRequest(invalid)).toBeNull()
    }
    const snapshot = { base: 'USD', rates: { USD: 1, VND: 25_000, JPY: 150 }, updatedAt: START, fetchedAt: START }
    expect(convertWithSnapshot(snapshot, { amount: 2, from: 'USD', to: 'VND' })).toEqual({ amount: 2, from: 'USD', to: 'VND', rate: 25_000, converted: 50_000, rateUpdatedAt: START })
    expect(convertWithSnapshot(snapshot, { amount: 300, from: 'JPY', to: 'USD' })).toMatchObject({ converted: 2, rate: 1 / 150 })
    expect(convertWithSnapshot(snapshot, { amount: 300, from: 'JPY', to: 'XXX' })).toBeNull()
  })
})

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ IpcMain: class {} }))
vi.mock('../storage', () => ({ getStoredApiKey: vi.fn() }))

import { getStoredApiKey } from '../storage'
import { parseWebSearchParams, registerWebSearchHandlers, sanitizeWebSearchResults } from '../webSearch'

// biome-ignore lint/suspicious/noExplicitAny: test helper
type Handler = (event: unknown, params?: unknown) => Promise<any>

function setup() {
  const handlers: Record<string, Handler> = {}
  registerWebSearchHandlers({
    handle: (channel: string, handler: Handler) => { handlers[channel] = handler },
  } as never)
  return (channel: string, params?: unknown) => handlers[channel]({}, params)
}

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, statusText: String(status), json: async () => body, text: async () => JSON.stringify(body) })

function keys(map: Record<string, string | null>) {
  vi.mocked(getStoredApiKey).mockImplementation(((provider: string) => map[provider] ?? null) as never)
}

describe('websearch:search', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    keys({})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('validates params', async () => {
    const call = setup()
    for (const bad of [undefined, null, 'q', {}, { query: '   ' }, { query: 5 }, { query: 'ok', maxResults: 'many' }, { query: 'x'.repeat(5_000) }]) {
      expect(await call('websearch:search', bad)).toMatchObject({ success: false, errorCode: 'INVALID_INPUT' })
    }
  })

  it('clamps maxResults to 1..10 and trims the query', () => {
    expect(parseWebSearchParams({ query: '  hi  ', maxResults: 99 })).toMatchObject({ ok: true, query: 'hi', maxResults: 10 })
    expect(parseWebSearchParams({ query: 'hi', maxResults: -5 })).toMatchObject({ maxResults: 1 })
    expect(parseWebSearchParams({ query: 'hi', maxResults: 3.9 })).toMatchObject({ maxResults: 3 })
    expect(parseWebSearchParams({ query: 'hi' })).toMatchObject({ maxResults: 5 })
  })

  it('arms a timeout signal on every provider fetch and drops non-http(s) result URLs', async () => {
    keys({ tavily: 'tvly-key' })
    const fetchMock = vi.fn(async () => jsonResponse({
      query: 'q',
      answer: 'short',
      results: [
        { title: 'ok', url: 'https://example.com/a', content: 'x'.repeat(10_000), score: 0.9 },
        { title: 'js', url: 'javascript:alert(1)', content: 'bad', score: 1 },
        { title: 'file', url: 'file:///etc/passwd', content: 'bad', score: 1 },
        { title: 'no url', content: 'bad' },
      ],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await setup()('websearch:search', { query: 'q' })
    expect(result.success).toBe(true)
    expect(result.provider).toBe('tavily')
    expect(result.results).toHaveLength(1)
    expect(result.results[0].url).toBe('https://example.com/a')
    expect(result.results[0].content.length).toBeLessThanOrEqual(2_000)
    expect(result.fallback).toBeUndefined()
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { signal?: AbortSignal }
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('uses a longer timeout for slow providers (Tavily advanced depth, Jina) than for Brave', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')

    // Tavily 'advanced' depth crawls and ranks page content, so it gets the long deadline.
    keys({ tavily: 'tvly-key' })
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ results: [] })))
    await setup()('websearch:search', { query: 'q' })
    expect(timeoutSpy).toHaveBeenLastCalledWith(25_000)

    keys({ brave: 'brave-key' })
    await setup()('websearch:search', { query: 'q' })
    expect(timeoutSpy).toHaveBeenLastCalledWith(12_000)

    keys({})
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [] })))
    await setup()('websearch:search', { query: 'q' })
    expect(timeoutSpy).toHaveBeenLastCalledWith(25_000)
  })

  it('reports which provider answered and why when a keyed provider failed first', async () => {
    keys({ tavily: 'bad-key' })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ data: [{ title: 't', url: 'https://j.example/', content: 'c' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await setup()('websearch:search', { query: 'q' })
    expect(result).toMatchObject({ success: true, provider: 'jina', fallback: { from: 'tavily', reason: 'auth' } })
  })

  it('classifies quota failures', async () => {
    keys({ brave: 'brave-key' })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await setup()('websearch:search', { query: 'q' })
    expect(result.fallback).toEqual({ from: 'brave', reason: 'quota' })
  })

  it('sanitizeWebSearchResults caps the result count', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ title: `t${i}`, url: `https://e.com/${i}`, content: 'c', score: 1 }))
    expect(sanitizeWebSearchResults(many, 3)).toHaveLength(3)
  })
})

describe('websearch:verify', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns codes and English text instead of hard-coded Vietnamese', async () => {
    const call = setup()
    expect(await call('websearch:verify', { provider: 'tavily', apiKey: ' ' })).toEqual({ valid: false, errorCode: 'INVALID_KEY' })
    expect(await call('websearch:verify', { provider: 'bing', apiKey: 'k' })).toMatchObject({ valid: false, errorCode: 'INVALID_PROVIDER' })
    expect(await call('websearch:verify', null)).toMatchObject({ valid: false, errorCode: 'INVALID_INPUT' })

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 401)))
    expect(await call('websearch:verify', { provider: 'tavily', apiKey: 'k' })).toEqual({ valid: false, errorCode: 'INVALID_KEY' })

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ e: 1 }, 500)))
    const http = await call('websearch:verify', { provider: 'brave', apiKey: 'k' })
    expect(http).toMatchObject({ valid: false, errorCode: 'HTTP_ERROR' })
    expect(http.error).toMatch(/^Brave error 500/)

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await call('websearch:verify', { provider: 'tavily', apiKey: 'k' })).toEqual({ valid: false, error: 'offline', errorCode: 'NETWORK' })

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    expect(await call('websearch:verify', { provider: 'tavily', apiKey: 'k' })).toEqual({ valid: true })
  })
})

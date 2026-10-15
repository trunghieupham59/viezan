/**
 * Web Search IPC handler — multi-provider with automatic fallback.
 *
 * Provider priority (highest → lowest):
 *   1. Tavily   — AI-optimised, best quality for LLM consumption (requires key)
 *   2. Brave    — Clean structured results, 2,000 free req/month (requires key)
 *   3. Jina AI  — Completely free, no API key required (default fallback)
 *
 * The first provider that has a configured key (or is free) is used.
 * Raw keys NEVER leave the main process; the renderer only receives results.
 *
 * The fallback chain is intentional (documented in the preload API), but it is
 * never silent: the response always names the provider that answered and, when
 * a configured provider failed first, carries `fallback` describing why
 * (`auth` / `quota` / `error`) so the renderer can surface it.
 *
 * Register keys at:
 *   Tavily → https://app.tavily.com
 *   Brave  → https://api.search.brave.com
 *   Jina   → no registration needed (use https://jina.ai for higher limits)
 */
import type { IpcMain } from 'electron'
import { invalidIpcInput, isRecord } from './ipcValidation'
import { getStoredApiKey } from './storage'

// ─── Shared response types ────────────────────────────────────────────────────

export interface WebSearchResult {
  title: string
  url: string
  content: string
  score: number
}

type WebSearchProviderId = 'tavily' | 'brave' | 'jina'
type WebSearchFallbackReason = 'auth' | 'quota' | 'error'

export interface WebSearchResponse {
  success: boolean
  results?: WebSearchResult[]
  answer?: string
  error?: string
  errorCode?: string
  /** Which provider actually served the request */
  provider?: WebSearchProviderId
  /** Present when a configured provider failed and a lower-priority one answered. */
  fallback?: { from: 'tavily' | 'brave'; reason: WebSearchFallbackReason }
}

const DEFAULT_MAX_RESULTS = 5
const MIN_MAX_RESULTS = 1
const MAX_MAX_RESULTS = 10
const MAX_QUERY_INPUT_CHARS = 2_000
const MAX_QUERY_CHARS = 200
const MAX_TITLE_CHARS = 300
const MAX_RESULT_CONTENT_CHARS = 2_000
const MAX_ANSWER_CHARS = 4_000
const WEB_SEARCH_TIMEOUT_MS = 12_000
/** Tavily 'advanced' depth crawls and ranks page content, so it needs more time than a snippet lookup. */
const TAVILY_SEARCH_TIMEOUT_MS = 25_000
/** Jina's search endpoint fetches and renders each result page, so it is much slower. */
const JINA_SEARCH_TIMEOUT_MS = 25_000

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = WEB_SEARCH_TIMEOUT_MS,
): Promise<Response> {
  // The timeout signal stays armed while the body is read, not just until headers arrive.
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
}

class WebSearchHttpError extends Error {
  readonly status: number

  constructor(providerLabel: string, status: number, detail: string) {
    super(`${providerLabel} ${status}: ${detail}`)
    this.name = 'WebSearchHttpError'
    this.status = status
  }
}

function classifyFallbackReason(error: unknown): WebSearchFallbackReason {
  if (error instanceof WebSearchHttpError) {
    if (error.status === 401 || error.status === 403) return 'auth'
    if (error.status === 402 || error.status === 429 || error.status === 432 || error.status === 433) return 'quota'
  }
  return 'error'
}

function truncate(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function toHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = new URL(value.trim())
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null
  } catch {
    return null
  }
}

/** Drop non-http(s) URLs and cap field sizes before anything reaches the renderer. */
export function sanitizeWebSearchResults(
  results: Array<{ title?: unknown; url?: unknown; content?: unknown; score?: unknown }>,
  maxResults: number,
): WebSearchResult[] {
  const sanitized: WebSearchResult[] = []
  for (const result of results) {
    const url = toHttpUrl(result?.url)
    if (!url) continue
    sanitized.push({
      title: truncate(result.title, MAX_TITLE_CHARS),
      url,
      content: truncate(result.content, MAX_RESULT_CONTENT_CHARS),
      score: typeof result.score === 'number' && Number.isFinite(result.score) ? result.score : 0,
    })
    if (sanitized.length >= maxResults) break
  }
  return sanitized
}

export function parseWebSearchParams(
  rawParams: unknown,
): { ok: true; query: string; maxResults: number } | { ok: false; response: WebSearchResponse } {
  if (!isRecord(rawParams)) return { ok: false, response: invalidIpcInput('Web search payload must be an object') }
  if (typeof rawParams.query !== 'string' || !rawParams.query.trim()) {
    return { ok: false, response: invalidIpcInput('Query is required') }
  }
  if (rawParams.query.length > MAX_QUERY_INPUT_CHARS) {
    return { ok: false, response: invalidIpcInput('Query is too long') }
  }

  let maxResults = DEFAULT_MAX_RESULTS
  if (rawParams.maxResults !== undefined) {
    if (typeof rawParams.maxResults !== 'number' || !Number.isFinite(rawParams.maxResults)) {
      return { ok: false, response: invalidIpcInput('Invalid maxResults') }
    }
    maxResults = Math.min(Math.max(Math.floor(rawParams.maxResults), MIN_MAX_RESULTS), MAX_MAX_RESULTS)
  }

  return { ok: true, query: rawParams.query.trim().slice(0, MAX_QUERY_CHARS), maxResults }
}

// ─── Tavily ───────────────────────────────────────────────────────────────────

const TAVILY_URL = 'https://api.tavily.com/search'

interface TavilyResponse {
  query: string
  answer?: string
  results: Array<{ title: string; url: string; content: string; score: number }>
}

async function searchTavily(
  apiKey: string,
  query: string,
  maxResults: number,
): Promise<WebSearchResponse> {
  const response = await fetchWithTimeout(TAVILY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      // 'advanced' returns relevance-ranked content chunks instead of a short
      // snippet — far better grounding for the answer model.
      search_depth: 'advanced',
      max_results: maxResults,
      include_answer: 'advanced',
      include_raw_content: false,
    }),
  }, TAVILY_SEARCH_TIMEOUT_MS)

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new WebSearchHttpError('Tavily', response.status, text || response.statusText)
  }

  const data = await response.json() as TavilyResponse
  return {
    success: true,
    provider: 'tavily',
    results: sanitizeWebSearchResults(data.results ?? [], maxResults),
    answer: data.answer ? truncate(data.answer, MAX_ANSWER_CHARS) : undefined,
  }
}

// ─── Brave Search ─────────────────────────────────────────────────────────────

const BRAVE_URL = 'https://api.search.brave.com/res/v1/web/search'

interface BraveWebResult {
  title: string
  url: string
  description?: string
  extra_snippets?: string[]
}

interface BraveResponse {
  web?: { results?: BraveWebResult[] }
  summarizer?: { key?: string }
}

async function searchBrave(
  apiKey: string,
  query: string,
  maxResults: number,
): Promise<WebSearchResponse> {
  const url = new URL(BRAVE_URL)
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(maxResults))
  url.searchParams.set('result_filter', 'web')

  const response = await fetchWithTimeout(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new WebSearchHttpError('Brave', response.status, text || response.statusText)
  }

  const data = await response.json() as BraveResponse
  const webResults = data.web?.results ?? []

  return {
    success: true,
    provider: 'brave',
    results: sanitizeWebSearchResults(
      webResults.map((r, i) => ({
        title: r.title,
        url: r.url,
        content: [r.description ?? '', ...(r.extra_snippets ?? [])].filter(Boolean).join('\n'),
        // Brave doesn't provide relevance scores — use position-based descending score
        score: Math.max(0, 1 - i * 0.1),
      })),
      maxResults,
    ),
  }
}

// ─── Jina AI Search (free fallback) ──────────────────────────────────────────

const JINA_SEARCH_URL = 'https://s.jina.ai/'

interface JinaResult {
  title: string
  url: string
  content?: string
  description?: string
}

interface JinaResponse {
  code?: number
  data?: JinaResult[]
}

async function searchJina(
  query: string,
  maxResults: number,
  apiKey?: string,
): Promise<WebSearchResponse> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'X-Retain-Images': 'none',
  }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const response = await fetchWithTimeout(`${JINA_SEARCH_URL}${encodeURIComponent(query)}`, {
    method: 'GET',
    headers,
  }, JINA_SEARCH_TIMEOUT_MS)

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new WebSearchHttpError('Jina', response.status, text || response.statusText)
  }

  const data = await response.json() as JinaResponse
  const results = (data.data ?? []).slice(0, maxResults)

  return {
    success: true,
    provider: 'jina',
    results: sanitizeWebSearchResults(
      results.map((r, i) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        content: r.content ?? r.description ?? '',
        score: Math.max(0, 1 - i * 0.1),
      })),
      maxResults,
    ),
  }
}

// ─── IPC handler ─────────────────────────────────────────────────────────────

export function registerWebSearchHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    'websearch:search',
    async (_event, rawParams: unknown): Promise<WebSearchResponse> => {
      const parsed = parseWebSearchParams(rawParams)
      if (!parsed.ok) return parsed.response
      const { query, maxResults } = parsed

      let fallback: WebSearchResponse['fallback']
      const withFallback = (response: WebSearchResponse): WebSearchResponse =>
        fallback ? { ...response, fallback } : response

      // 1. Try Tavily (best quality for LLMs)
      const tavilyKey = getStoredApiKey('tavily')
      if (tavilyKey) {
        try {
          return await searchTavily(tavilyKey, query, maxResults)
        } catch (err) {
          fallback = { from: 'tavily', reason: classifyFallbackReason(err) }
          console.warn(
            `[webSearch] Tavily failed (${fallback.reason}), trying next provider:`,
            err instanceof Error ? err.message : 'unknown error',
          )
        }
      }

      // 2. Try Brave Search
      const braveKey = getStoredApiKey('brave')
      if (braveKey) {
        try {
          return withFallback(await searchBrave(braveKey, query, maxResults))
        } catch (err) {
          fallback = { from: 'brave', reason: classifyFallbackReason(err) }
          console.warn(
            `[webSearch] Brave failed (${fallback.reason}), trying next provider:`,
            err instanceof Error ? err.message : 'unknown error',
          )
        }
      }

      // 3. Jina AI Search — free fallback (no key required, but key unlocks higher limits)
      const jinaKey = getStoredApiKey('jina') || undefined
      try {
        return withFallback(await searchJina(query, maxResults, jinaKey))
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'All web search providers failed',
          errorCode: 'SEARCH_FAILED',
        }
      }
    },
  )

  /** Check which web search providers are currently configured */
  ipcMain.handle('websearch:status', async (): Promise<{
    tavily: boolean
    brave: boolean
    jina: boolean
    activeProvider: WebSearchProviderId
  }> => {
    const tavily = Boolean(getStoredApiKey('tavily'))
    const brave = Boolean(getStoredApiKey('brave'))
    const jina = true // always available
    const activeProvider = tavily ? 'tavily' : brave ? 'brave' : 'jina'
    return { tavily, brave, jina, activeProvider }
  })

  /**
   * Verify that a web search API key is valid by making a minimal real request.
   * Called BEFORE saving the key to keychain so users get immediate feedback.
   *
   * Returns machine-readable `errorCode`s. For an invalid/empty key the `error`
   * text is intentionally omitted so the renderer falls back to its localized
   * `settings_msg_invalid` string; other failures carry English detail text.
   */
  ipcMain.handle(
    'websearch:verify',
    async (_event, rawParams: unknown): Promise<{
      valid: boolean
      error?: string
      errorCode?: 'INVALID_INPUT' | 'INVALID_KEY' | 'INVALID_PROVIDER' | 'HTTP_ERROR' | 'NETWORK'
    }> => {
      if (!isRecord(rawParams)) return { valid: false, error: 'Invalid payload', errorCode: 'INVALID_INPUT' }
      const { provider } = rawParams
      const apiKey = typeof rawParams.apiKey === 'string' ? rawParams.apiKey.trim() : ''
      if (!apiKey) return { valid: false, errorCode: 'INVALID_KEY' }
      if (provider !== 'tavily' && provider !== 'brave') {
        return { valid: false, error: 'Unsupported provider', errorCode: 'INVALID_PROVIDER' }
      }

      try {
        let res: Response
        let label: string
        if (provider === 'tavily') {
          label = 'Tavily'
          res = await fetchWithTimeout(TAVILY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key: apiKey,
              query: 'test',
              search_depth: 'basic',
              max_results: 1,
              include_answer: false,
              include_raw_content: false,
            }),
          })
        } else {
          label = 'Brave'
          const url = new URL(BRAVE_URL)
          url.searchParams.set('q', 'test')
          url.searchParams.set('count', '1')
          url.searchParams.set('result_filter', 'web')
          res = await fetchWithTimeout(url.toString(), {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Accept-Encoding': 'gzip',
              'X-Subscription-Token': apiKey,
            },
          })
        }

        if (res.ok) return { valid: true }
        if (res.status === 401 || res.status === 403) return { valid: false, errorCode: 'INVALID_KEY' }
        const text = await res.text().catch(() => '')
        return {
          valid: false,
          error: `${label} error ${res.status}: ${(text || res.statusText).slice(0, 300)}`,
          errorCode: 'HTTP_ERROR',
        }
      } catch (err) {
        return {
          valid: false,
          error: err instanceof Error ? err.message : 'Network error',
          errorCode: 'NETWORK',
        }
      }
    },
  )
}

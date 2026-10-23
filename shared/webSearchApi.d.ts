/**
 * Web search API — Tavily → Brave → Jina fallback chain run by the main process.
 * Single source for the `webSearch` / `webSearchVerify` members of `window.api`.
 */

export type WebSearchProvider = 'tavily' | 'brave' | 'jina'

export interface WebSearchParams {
  query: string
  maxResults?: number
}

export interface WebSearchHit {
  title: string
  url: string
  content: string
  score: number
}

export interface WebSearchResult {
  success: boolean
  results?: WebSearchHit[]
  answer?: string
  error?: string
  errorCode?: string
  /** Which provider actually served the request. */
  provider?: WebSearchProvider
  /** Present when a configured provider failed and a lower-priority one answered. */
  fallback?: { from: 'tavily' | 'brave'; reason: 'auth' | 'quota' | 'error' }
}

export interface WebSearchVerifyParams {
  provider: 'tavily' | 'brave'
  apiKey: string
}

export interface WebSearchApi {
  webSearch: (params: WebSearchParams) => Promise<WebSearchResult>
  /** Verify an API key with a real minimal request before it is saved. */
  webSearchVerify: (params: WebSearchVerifyParams) => Promise<{ valid: boolean; error?: string }>
}

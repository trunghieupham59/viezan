/**
 * Shared error classification utilities for IPC handlers.
 *
 * Centralizes provider error detection and response formatting,
 * replacing the near-duplicate error handling blocks (DUP-01, DUP-03)
 * that were previously scattered across translate.ts, chat.ts, and imageTranslate.ts.
 */

export interface IpcErrorResponse {
  success: false
  error: string
  errorCode?: string
}

// ── Structured error helpers ─────────────────────────────────────────────────

/** Error codes thrown by the app itself when a provider returns an unusable result. */
export type ProviderResponseErrorCode = 'EMPTY_RESPONSE' | 'OUTPUT_TRUNCATED' | 'INVALID_RESPONSE' | 'BLOCKED_SAFETY'

/**
 * Error carrying a structured `errorCode`. Thrown when a provider call "succeeds" at the
 * HTTP level but yields nothing usable (empty text) or was cut off (max tokens reached).
 */
export class ProviderResponseError extends Error {
  readonly errorCode: ProviderResponseErrorCode

  constructor(message: string, errorCode: ProviderResponseErrorCode) {
    super(message)
    this.name = 'ProviderResponseError'
    this.errorCode = errorCode
  }
}

export function emptyResponseError(provider: string): ProviderResponseError {
  return new ProviderResponseError(`Empty response from ${provider}`, 'EMPTY_RESPONSE')
}

export function invalidResponseError(provider: string, detail: string): ProviderResponseError {
  return new ProviderResponseError(`Invalid response from ${provider}: ${detail}`, 'INVALID_RESPONSE')
}

export function truncatedOutputError(provider: string): ProviderResponseError {
  return new ProviderResponseError(
    `Output truncated: ${provider} reached its maximum output length`,
    'OUTPUT_TRUNCATED',
  )
}

/**
 * The provider refused / filtered the request for safety reasons without throwing an HTTP error
 * (Claude `stop_reason: "refusal"`, OpenAI `message.refusal`, Gemini BLOCKLIST / PROHIBITED_CONTENT / SPII).
 * Classified as BLOCKED_SAFETY, the same code as the text-based safety detection.
 */
export function blockedSafetyError(provider: string, reason: string): ProviderResponseError {
  return new ProviderResponseError(`Response blocked by ${provider} safety filters: ${reason}`, 'BLOCKED_SAFETY')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function toHttpStatus(value: unknown): number | undefined {
  const n = typeof value === 'string' && /^\d{3}$/.test(value) ? Number(value) : value
  return typeof n === 'number' && Number.isInteger(n) && n >= 100 && n <= 599 ? n : undefined
}

/**
 * Read the HTTP status from a provider/SDK error without parsing its message text.
 * Handles OpenAI/Anthropic (`status`), Gemini (`status`/`statusCode`), fetch-like (`response.status`).
 */
export function getErrorStatus(error: unknown): number | undefined {
  const rec = asRecord(error)
  if (!rec) return undefined
  return (
    toHttpStatus(rec.status)
    ?? toHttpStatus(rec.statusCode)
    ?? toHttpStatus(asRecord(rec.response)?.status)
    ?? toHttpStatus(rec.code)
  )
}

function readHeader(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined
  const getter = (headers as { get?: unknown }).get
  if (typeof getter === 'function') {
    const value = (getter as (key: string) => unknown).call(headers, name)
    return typeof value === 'string' ? value : undefined
  }
  const rec = asRecord(headers)
  if (!rec) return undefined
  for (const [key, value] of Object.entries(rec)) {
    if (key.toLowerCase() === name && (typeof value === 'string' || typeof value === 'number')) return String(value)
  }
  return undefined
}

/**
 * Delay requested by the provider via `retry-after-ms` / `retry-after` (seconds or HTTP date),
 * in milliseconds. Returns undefined when the error carries no usable hint.
 */
export function getRetryAfterMs(error: unknown, now: number = Date.now()): number | undefined {
  const rec = asRecord(error)
  if (!rec) return undefined
  const headerSources = [rec.headers, asRecord(rec.response)?.headers]
  for (const headers of headerSources) {
    const ms = readHeader(headers, 'retry-after-ms')
    if (ms !== undefined && /^\d+(?:\.\d+)?$/.test(ms.trim())) return Math.ceil(Number(ms))
    const raw = readHeader(headers, 'retry-after')
    if (raw === undefined) continue
    const trimmed = raw.trim()
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) return Math.ceil(Number(trimmed) * 1000)
    const date = Date.parse(trimmed)
    if (!Number.isNaN(date)) return Math.max(0, date - now)
  }
  return undefined
}

/**
 * HTTP-looking status patterns inside a message ("401 Unauthorized", "HTTP 429", "status: 503",
 * "[503 Service Unavailable]"). Deliberately NOT a raw substring test, so a token count such as
 * "you requested 140401 tokens" is never mistaken for a 401.
 */
const MESSAGE_STATUS_PATTERNS = [
  /\[([1-5]\d{2})(?!\d)/,
  /(?:^|[^a-z0-9])(?:status(?: code)?|http|error|code)\W{0,3}([1-5]\d{2})(?!\d)/,
  /^\W{0,2}([1-5]\d{2})(?!\d)/,
]
const MESSAGE_STATUS_SCAN_CHARS = 300

export function getStatusFromMessage(message: string): number | undefined {
  const head = message.slice(0, MESSAGE_STATUS_SCAN_CHARS).toLowerCase()
  for (const pattern of MESSAGE_STATUS_PATTERNS) {
    const match = pattern.exec(head)
    if (match) return Number(match[1])
  }
  return undefined
}

function errorMessageOf(input: unknown): string {
  if (typeof input === 'string') return input
  if (input instanceof Error) return input.message
  const message = asRecord(input)?.message
  return typeof message === 'string' ? message : String(input)
}

const RESPONSE_ERROR_MESSAGES: Record<ProviderResponseErrorCode, string> = {
  EMPTY_RESPONSE: 'No response received. Please try again.',
  INVALID_RESPONSE: 'The model returned a response that could not be read. Please try again or choose another model.',
  OUTPUT_TRUNCATED: 'The output was cut off because it reached the maximum output length. Try a shorter text or a model with a larger output limit.',
  BLOCKED_SAFETY: 'The model blocked this response due to safety filters. Try rephrasing your prompt.',
}

/** Key-rejection wordings that arrive without a 401 (Gemini: HTTP 400 `API_KEY_INVALID`). */
const INVALID_KEY_TEXT_PATTERN = /api key not valid|api_key_invalid|api key expired|invalid api key/i

/**
 * Classify a provider error into a structured IPC error response.
 * Accepts a raw message string (legacy) or the thrown error itself; structured fields
 * (`errorCode`, `status`) are preferred over message text.
 *
 * Usage:
 *   } catch (error: unknown) {
 *     return classifyProviderError(error)
 *   }
 */
export function classifyProviderError(input: unknown): IpcErrorResponse {
  const msg = errorMessageOf(input)
  const lower = msg.toLowerCase()
  const structuredCode = asRecord(input)?.errorCode
  const status = getErrorStatus(input) ?? getStatusFromMessage(msg)

  if (
    structuredCode === 'EMPTY_RESPONSE'
    || structuredCode === 'OUTPUT_TRUNCATED'
    || structuredCode === 'INVALID_RESPONSE'
    || structuredCode === 'BLOCKED_SAFETY'
  ) {
    return { success: false, error: RESPONSE_ERROR_MESSAGES[structuredCode], errorCode: structuredCode }
  }
  // Gemini rejects a bad key with HTTP 400 ("API key not valid. Please pass a valid API key.").
  if (status === 401 || lower.includes('invalid_api_key') || lower.includes('authentication') || INVALID_KEY_TEXT_PATTERN.test(msg)) {
    return { success: false, error: 'Invalid API key. Please check your key in Settings.', errorCode: 'INVALID_KEY' }
  }
  if (status === 429 || lower.includes('rate_limit') || lower.includes('quota')) {
    return { success: false, error: 'Rate limit exceeded. Please wait and try again.', errorCode: 'RATE_LIMIT' }
  }
  // Gemini blocks responses that resemble copyrighted material with a RECITATION finish reason.
  // Surface a friendly, actionable message instead of the raw SDK error string.
  if (
    lower.includes('recitation') ||
    (lower.includes('copyright') && (lower.includes('blocked') || lower.includes('filtered')))
  ) {
    return {
      success: false,
      error: 'The model blocked this response because it may resemble copyrighted material. Try rephrasing your prompt or asking for a summary in your own words.',
      errorCode: 'BLOCKED_RECITATION',
    }
  }
  if (
    lower.includes('blocked due to safety') ||
    lower.includes('candidate was blocked') ||
    lower.includes('prompt was blocked') ||
    lower.includes('content was filtered') ||
    lower.includes('finishreason=safety') ||
    lower.includes('finish_reason=content_filter') ||
    lower.includes('safety_settings')
  ) {
    return {
      success: false,
      error: 'The model blocked this response due to safety filters. Try rephrasing your prompt.',
      errorCode: 'BLOCKED_SAFETY',
    }
  }
  if (
    lower.includes('aborterror') ||
    lower.includes('operation was aborted') ||
    lower.includes('request timed out') ||
    lower.includes('timed out') ||
    lower.includes('timeout')
  ) {
    return { success: false, error: 'The request timed out. Please try again.', errorCode: 'TIMEOUT' }
  }
  if (lower.includes('empty response') || lower.includes('no response')) {
    return { success: false, error: 'No response received. Please try again.', errorCode: 'EMPTY_RESPONSE' }
  }
  if (
    lower.includes('enotfound') ||
    lower.includes('econnrefused') ||
    lower.includes('failed to fetch') ||
    lower.includes('fetcherror') ||
    lower.includes('connection error')
  ) {
    return { success: false, error: 'No internet connection.', errorCode: 'NETWORK' }
  }
  return { success: false, error: msg }
}

/**
 * Standard "no API key stored" response for the given provider.
 *
 * Usage:
 *   const apiKey = getStoredApiKey(provider)
 *   if (!apiKey) return noApiKeyResponse(provider)
 */
export function noApiKeyResponse(provider: string): IpcErrorResponse {
  return {
    success: false,
    error: `No API key found for ${provider}. Please add it in Settings.`,
    errorCode: 'NO_API_KEY',
  }
}

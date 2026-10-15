/**
 * withRetry — exponential-backoff retry wrapper for IPC handlers.
 *
 * Designed for AI provider API calls that may fail transiently: network issues
 * (DNS, connection reset, timeout), overloaded/5xx responses and 429 rate limits.
 * Hard failures (auth, validation, quota exhaustion, invalid model) are rethrown
 * immediately without retrying. A provider `Retry-After` hint is honoured, bounded
 * by `maxRetryAfterMs`.
 *
 * Usage:
 * ```ts
 * const result = await withRetry(() => translateWithGemini(apiKey, model, ...))
 * ```
 */

import { getErrorStatus, getRetryAfterMs, getStatusFromMessage } from './errorUtils'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Maximum total attempts including the first try (default: 3) */
  maxAttempts?: number
  /** Delay before the first retry in ms; doubles each subsequent retry (default: 500) */
  initialDelayMs?: number
  /** Maximum delay cap in ms — prevents unbounded waits (default: 8000) */
  maxDelayMs?: number
  /**
   * Predicate — return true if the error is retriable.
   * Default: retries only on transient network errors.
   * Override to customize: e.g. retry on specific status codes or messages.
   */
  shouldRetry?: (error: Error) => boolean
  /**
   * Longest provider-requested `Retry-After` wait honoured, in ms (default: 15000).
   * A larger hint means "come back much later", so the error is thrown instead of waiting.
   */
  maxRetryAfterMs?: number
  /** Aborting stops further attempts and cuts any backoff wait short. */
  signal?: AbortSignal
}

// ── Default shouldRetry ───────────────────────────────────────────────────────

/** Quota / billing exhaustion — waiting a few seconds will not help, so do not retry. */
const QUOTA_EXHAUSTED_PATTERN = /insufficient_quota|quota|resource_exhausted|billing/
/** Plain rate limiting (no quota wording) — a short backoff usually clears it. */
const RATE_LIMIT_PATTERN = /rate_limit|rate limit|too many requests/
const TRANSIENT_PATTERN = new RegExp([
  'enotfound', 'econnrefused', 'etimedout', 'econnreset', 'failed to fetch', 'fetcherror',
  'fetch failed', 'network socket disconnected', 'socket hang up', 'connection reset',
  'connection error', 'timeout', 'overloaded', 'service unavailable', 'bad gateway',
  'gateway timeout', 'internal server error',
].join('|'))
const HARD_FAILURE_PATTERN = /invalid_api_key|authentication|unknown provider|not found/

/**
 * Returns true for transient failures that are safe to retry: network errors, 408/425,
 * 5xx (incl. 503 and Anthropic 529 "overloaded") and non-quota 429.
 * Returns false for auth (401/403), validation/4xx, quota exhaustion and unknown models —
 * retrying those cannot succeed and would waste quota.
 *
 * Structured `status` on the error is trusted first; message text is only a fallback and is
 * matched with HTTP-looking patterns (never a raw substring such as "401" inside a token count).
 */
export function isRetriableError(err: Error): boolean {
  if (err.name === 'AbortError') return false
  const msg = err.message.toLowerCase()
  const status = getErrorStatus(err) ?? getStatusFromMessage(err.message)

  if (status !== undefined) {
    if (status === 429) return !QUOTA_EXHAUSTED_PATTERN.test(msg)
    if (status === 408 || status === 425 || status >= 500) return true
    if (status >= 400) return false
  }

  // Hard failures — do NOT retry
  if (HARD_FAILURE_PATTERN.test(msg) || QUOTA_EXHAUSTED_PATTERN.test(msg)) return false
  // Transient failures — retry
  return RATE_LIMIT_PATTERN.test(msg) || TRANSIENT_PATTERN.test(msg)
}

function abortError(): Error {
  const error = new Error('Retry aborted')
  error.name = 'AbortError'
  return error
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

// ── Main retry function ───────────────────────────────────────────────────────

/**
 * Execute `fn` with up to `maxAttempts` attempts, using exponential backoff.
 *
 * Backoff formula: `Math.min(initialDelayMs * 2^(attempt-1), maxDelayMs)`
 *   Attempt 1 fails → wait 500ms
 *   Attempt 2 fails → wait 1000ms
 *   Attempt 3 fails → throw (no more retries)
 *
 * @param fn - Async function to execute and potentially retry.
 * @param opts - Retry configuration (all fields optional).
 * @returns The resolved value of `fn` on any successful attempt.
 * @throws The last error if all attempts fail or the error is non-retriable.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 500,
    maxDelayMs = 8_000,
    shouldRetry = isRetriableError,
    maxRetryAfterMs = 15_000,
    signal,
  } = opts

  let lastError: Error = new Error('Unknown error')

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      // Non-retriable error, cancelled caller or last attempt → throw immediately
      if (signal?.aborted || attempt === maxAttempts || !shouldRetry(lastError)) {
        throw lastError
      }

      const backoff = Math.min(initialDelayMs * (2 ** (attempt - 1)), maxDelayMs)
      const retryAfter = getRetryAfterMs(lastError)
      if (retryAfter !== undefined && retryAfter > maxRetryAfterMs) throw lastError
      const delay = retryAfter === undefined ? backoff : Math.max(backoff, retryAfter)
      console.warn(
        `[retry] Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}. ` +
        `Retrying in ${delay}ms...`
      )
      await sleep(delay, signal)
    }
  }

  throw lastError
}

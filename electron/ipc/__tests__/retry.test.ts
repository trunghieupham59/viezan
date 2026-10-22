// @vitest-environment node
/**
 * Unit tests for electron/ipc/retry.ts
 *
 * Tests cover:
 *   1. isRetriableError() — classifies errors as retriable or non-retriable
 *   2. withRetry()        — retry count, backoff, success on retry, non-retriable passthrough
 */
import { describe, expect, it, vi } from 'vitest'
import { modelRefusalError } from '../errorUtils'
import { isRetriableError, withRetry } from '../retry'

// ─────────────────────────────────────────────────────────────────────────────
describe('isRetriableError', () => {
  // ── Retriable (network) errors ─────────────────────────────────────────────
  it('returns true for ENOTFOUND (DNS failure)', () => {
    expect(isRetriableError(new Error('getaddrinfo ENOTFOUND api.openai.com'))).toBe(true)
  })

  it('returns true for ECONNREFUSED', () => {
    expect(isRetriableError(new Error('connect ECONNREFUSED 127.0.0.1:443'))).toBe(true)
  })

  it('returns true for ETIMEDOUT', () => {
    expect(isRetriableError(new Error('connection ETIMEDOUT'))).toBe(true)
  })

  it('returns true for ECONNRESET', () => {
    expect(isRetriableError(new Error('read ECONNRESET'))).toBe(true)
  })

  it('returns true for "Failed to fetch"', () => {
    expect(isRetriableError(new Error('Failed to fetch'))).toBe(true)
  })

  it('returns true for "FetchError"', () => {
    expect(isRetriableError(new Error('FetchError: request failed'))).toBe(true)
  })

  it('returns true for "socket hang up"', () => {
    expect(isRetriableError(new Error('socket hang up'))).toBe(true)
  })

  it('returns true for "timeout" in message', () => {
    expect(isRetriableError(new Error('request timeout after 30s'))).toBe(true)
  })

  it('returns true for "connection reset"', () => {
    expect(isRetriableError(new Error('connection reset by peer'))).toBe(true)
  })

  it('returns true for OpenAI APIConnectionError "Connection error."', () => {
    // OpenAI Node SDK throws APIConnectionError with this exact message on
    // DNS failures, TCP resets, or proxy issues.
    expect(isRetriableError(new Error('Connection error.'))).toBe(true)
  })

  it('returns true for lowercase "connection error"', () => {
    expect(isRetriableError(new Error('connection error occurred'))).toBe(true)
  })

  // ── Non-retriable (hard) errors ───────────────────────────────────────────
  it('returns false for 401 Unauthorized (invalid API key)', () => {
    expect(isRetriableError(new Error('401 Unauthorized'))).toBe(false)
  })

  it('returns false for invalid_api_key', () => {
    expect(isRetriableError(new Error('Error: invalid_api_key'))).toBe(false)
  })

  it('returns false for authentication error', () => {
    expect(isRetriableError(new Error('authentication failed'))).toBe(false)
  })

  it('returns true for 429 rate limit (backoff clears it)', () => {
    expect(isRetriableError(new Error('429 rate_limit exceeded'))).toBe(true)
  })

  it('returns false for 429 caused by exhausted quota', () => {
    expect(isRetriableError(new Error('429 You exceeded your current quota'))).toBe(false)
    expect(isRetriableError(new Error('429 insufficient_quota'))).toBe(false)
  })

  it('returns false for quota exceeded', () => {
    expect(isRetriableError(new Error('quota exceeded for gemini-2.0-flash'))).toBe(false)
  })

  it('returns false for RESOURCE_EXHAUSTED (Gemini quota)', () => {
    expect(isRetriableError(new Error('RESOURCE_EXHAUSTED: quota for model'))).toBe(false)
  })

  it('returns false for 403 Forbidden', () => {
    expect(isRetriableError(new Error('403 Forbidden'))).toBe(false)
  })

  it('returns false for "unknown provider"', () => {
    expect(isRetriableError(new Error('Unknown provider: "mymodel"'))).toBe(false)
  })

  it('returns false for "not found"', () => {
    expect(isRetriableError(new Error('404 Model not found: xyz'))).toBe(false)
  })

  it('returns false for unrelated generic error', () => {
    expect(isRetriableError(new Error('Unexpected response type from Claude'))).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('withRetry', () => {
  // ── Success path ──────────────────────────────────────────────────────────
  it('returns the value immediately when fn succeeds on first attempt', async () => {
    const fn = vi.fn().mockResolvedValueOnce('success')
    const result = await withRetry(fn, { maxAttempts: 3 })
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  // ── Retry path ────────────────────────────────────────────────────────────
  it('retries on retriable error and succeeds on the second attempt', async () => {
    const networkError = new Error('ENOTFOUND api.openai.com')
    const fn = vi.fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce('ok on retry')

    const result = await withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 1, // fast test
    })

    expect(result).toBe('ok on retry')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('retries up to maxAttempts and then throws the last error', async () => {
    const networkError = new Error('ENOTFOUND')
    const fn = vi.fn().mockRejectedValue(networkError)

    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 1 })
    ).rejects.toThrow('ENOTFOUND')

    expect(fn).toHaveBeenCalledTimes(3)
  })

  // ── Non-retriable path ────────────────────────────────────────────────────
  it('does NOT retry for non-retriable errors (401) — throws immediately', async () => {
    const authError = new Error('401 Unauthorized invalid_api_key')
    const fn = vi.fn().mockRejectedValue(authError)

    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 1 })
    ).rejects.toThrow('401 Unauthorized')

    // Only called once — no retry for auth error
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries rate limit errors (429) with bounded attempts', async () => {
    const rateLimitError = new Error('429 rate_limit exceeded')
    const fn = vi.fn().mockRejectedValue(rateLimitError)

    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 1 })
    ).rejects.toThrow('429 rate_limit')

    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does NOT retry quota exhaustion', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('429 You exceeded your current quota'))

    await expect(withRetry(fn, { maxAttempts: 3, initialDelayMs: 1 })).rejects.toThrow('quota')

    expect(fn).toHaveBeenCalledTimes(1)
  })

  // ── Custom shouldRetry ────────────────────────────────────────────────────
  it('uses custom shouldRetry predicate', async () => {
    const error = new Error('custom-retriable-error')
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('success')

    const result = await withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 1,
      shouldRetry: (err) => err.message.includes('custom-retriable'),
    })

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does not retry when custom shouldRetry returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('never retry this'))

    await expect(
      withRetry(fn, {
        maxAttempts: 5,
        initialDelayMs: 1,
        shouldRetry: () => false,
      })
    ).rejects.toThrow('never retry this')

    expect(fn).toHaveBeenCalledTimes(1)
  })

  // ── maxAttempts = 1 ───────────────────────────────────────────────────────
  it('maxAttempts=1 means no retries at all', async () => {
    const networkError = new Error('ENOTFOUND')
    const fn = vi.fn().mockRejectedValue(networkError)

    await expect(
      withRetry(fn, { maxAttempts: 1, initialDelayMs: 1 })
    ).rejects.toThrow('ENOTFOUND')

    expect(fn).toHaveBeenCalledTimes(1)
  })

  // ── Edge cases ────────────────────────────────────────────────────────────
  it('handles non-Error rejections by wrapping in Error', async () => {
    const fn = vi.fn().mockRejectedValue('string rejection')

    await expect(
      withRetry(fn, { maxAttempts: 1 })
    ).rejects.toThrow('string rejection')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('isRetriableError — 5xx, overload and structured status', () => {
  it('retries 5xx statuses and overload wording', () => {
    expect(isRetriableError(new Error('500 Internal Server Error'))).toBe(true)
    expect(isRetriableError(new Error('503 Service Unavailable'))).toBe(true)
    expect(isRetriableError(new Error('[GoogleGenerativeAI Error]: Error fetching: [503 Service Unavailable] The model is overloaded'))).toBe(true)
    expect(isRetriableError(new Error('Overloaded'))).toBe(true)
    expect(isRetriableError(new Error('The server is overloaded, please retry'))).toBe(true)
    expect(isRetriableError(new Error('Bad Gateway'))).toBe(true)
  })

  it('trusts the structured status before the message', () => {
    expect(isRetriableError(Object.assign(new Error('boom'), { status: 529 }))).toBe(true)
    expect(isRetriableError(Object.assign(new Error('boom'), { status: 503 }))).toBe(true)
    expect(isRetriableError(Object.assign(new Error('boom'), { status: 429 }))).toBe(true)
    expect(isRetriableError(Object.assign(new Error('boom'), { status: 408 }))).toBe(true)
    // A structured 401 wins even when the message looks transient.
    expect(isRetriableError(Object.assign(new Error('connection error'), { status: 401 }))).toBe(false)
    expect(isRetriableError(Object.assign(new Error('timeout'), { status: 400 }))).toBe(false)
    expect(isRetriableError(Object.assign(new Error('boom'), { status: 422 }))).toBe(false)
    expect(isRetriableError(Object.assign(new Error('boom'), { status: 403 }))).toBe(false)
  })

  it('does not retry auth / validation errors', () => {
    expect(isRetriableError(new Error('400 Bad Request: invalid parameter'))).toBe(false)
    expect(isRetriableError(new Error('401 Unauthorized'))).toBe(false)
    expect(isRetriableError(new Error('invalid_api_key'))).toBe(false)
  })

  it('does not misread digits inside numbers as statuses', () => {
    // Would have been 'hard failure' (401) or 'transient' (503) under raw includes().
    expect(isRetriableError(new Error('you requested 140401 tokens'))).toBe(false)
    expect(isRetriableError(new Error('limit is 450300 tokens'))).toBe(false)
  })

  it('never retries an AbortError', () => {
    const abort = Object.assign(new Error('The operation was aborted: connection error'), { name: 'AbortError' })
    expect(isRetriableError(abort)).toBe(false)
  })
})

describe('withRetry — model refusal', () => {
  const refusal = () => modelRefusalError('claude', 'stop_reason=refusal')

  it('is not a transient error for the default predicate', () => {
    expect(isRetriableError(refusal())).toBe(false)
  })

  it('retries a refusal exactly once and succeeds', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fn = vi.fn().mockRejectedValueOnce(refusal()).mockResolvedValueOnce('translated')
    await expect(withRetry(fn, { initialDelayMs: 1 })).resolves.toBe('translated')
    expect(fn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('gives up after the second refusal even when attempts remain', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fn = vi.fn().mockRejectedValue(refusal())
    await expect(withRetry(fn, { maxAttempts: 5, initialDelayMs: 1 })).rejects.toMatchObject({ errorCode: 'MODEL_REFUSAL' })
    expect(fn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('retries a refusal even when the custom predicate refuses everything, but not past maxAttempts', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fn = vi.fn().mockRejectedValueOnce(refusal()).mockResolvedValueOnce('ok')
    await expect(withRetry(fn, { shouldRetry: () => false, initialDelayMs: 1 })).resolves.toBe('ok')
    const once = vi.fn().mockRejectedValue(refusal())
    await expect(withRetry(once, { maxAttempts: 1 })).rejects.toMatchObject({ errorCode: 'MODEL_REFUSAL' })
    expect(once).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('still retries a transient error after the refusal retry was spent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fn = vi.fn()
      .mockRejectedValueOnce(refusal())
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce('ok')
    await expect(withRetry(fn, { maxAttempts: 3, initialDelayMs: 1 })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
    warn.mockRestore()
  })
})

describe('withRetry — Retry-After and abort', () => {
  it('retries a 503 and succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('Service Unavailable'), { status: 503 }))
      .mockResolvedValueOnce('ok')
    await expect(withRetry(fn, { initialDelayMs: 1 })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('honours Retry-After as a minimum wait', async () => {
    vi.useFakeTimers()
    try {
      const err = Object.assign(new Error('rate limited'), { status: 429, headers: { 'retry-after': '2' } })
      const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce('ok')
      const pending = withRetry(fn, { initialDelayMs: 10 })
      await vi.advanceTimersByTimeAsync(1_500)
      expect(fn).toHaveBeenCalledTimes(1) // still waiting: backoff alone would be 10 ms
      await vi.advanceTimersByTimeAsync(600)
      await expect(pending).resolves.toBe('ok')
      expect(fn).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('gives up immediately when Retry-After exceeds maxRetryAfterMs', async () => {
    const err = Object.assign(new Error('rate limited'), { status: 429, headers: { 'retry-after': '600' } })
    const fn = vi.fn().mockRejectedValue(err)
    await expect(withRetry(fn, { initialDelayMs: 1 })).rejects.toThrow('rate limited')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('stays bounded by maxAttempts on persistent 5xx', async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('overloaded'), { status: 529 }))
    await expect(withRetry(fn, { maxAttempts: 4, initialDelayMs: 1 })).rejects.toThrow('overloaded')
    expect(fn).toHaveBeenCalledTimes(4)
  })

  it('stops retrying once the signal is aborted', async () => {
    const controller = new AbortController()
    const fn = vi.fn().mockImplementation(async () => {
      controller.abort()
      throw new Error('ENOTFOUND')
    })
    await expect(withRetry(fn, { initialDelayMs: 1, signal: controller.signal })).rejects.toThrow('ENOTFOUND')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('cuts the backoff wait short when aborted', async () => {
    const controller = new AbortController()
    const fn = vi.fn().mockRejectedValue(new Error('ENOTFOUND'))
    const pending = withRetry(fn, { initialDelayMs: 60_000, maxDelayMs: 60_000, signal: controller.signal })
    setTimeout(() => controller.abort(), 5)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

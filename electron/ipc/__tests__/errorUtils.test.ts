// @vitest-environment node
/**
 * Unit tests for electron/ipc/errorUtils.ts
 *
 * Tests cover:
 *   1. classifyProviderError() — maps error message strings to typed IPC error responses
 *   2. noApiKeyResponse()      — generates the standard NO_API_KEY response for a provider
 */
import { describe, expect, it } from 'vitest'
import {
  blockedSafetyError,
  classifyProviderError,
  emptyResponseError,
  getErrorStatus,
  getRetryAfterMs,
  getStatusFromMessage,
  invalidResponseError,
  isModelRefusalError,
  modelRefusalError,
  noApiKeyResponse,
  truncatedOutputError,
} from '../errorUtils'

// ─────────────────────────────────────────────────────────────────────────────
describe('classifyProviderError', () => {

  // ── INVALID_KEY detection ─────────────────────────────────────────────────
  describe('401 / invalid key patterns', () => {
    it('classifies "401 Unauthorized" as INVALID_KEY', () => {
      const result = classifyProviderError('401 Unauthorized')
      expect(result.success).toBe(false)
      expect(result.errorCode).toBe('INVALID_KEY')
      expect(result.error).toContain('Invalid API key')
    })

    it('classifies "invalid_api_key" as INVALID_KEY', () => {
      const result = classifyProviderError('Error: invalid_api_key provided')
      expect(result.errorCode).toBe('INVALID_KEY')
    })

    it('classifies "authentication" error as INVALID_KEY', () => {
      const result = classifyProviderError('authentication failed: bad credentials')
      expect(result.errorCode).toBe('INVALID_KEY')
    })

    it('classifies HTTP 401 messages as INVALID_KEY', () => {
      // "401" appears in the error string → still classified
      const result = classifyProviderError('HTTP 401')
      expect(result.errorCode).toBe('INVALID_KEY')
    })
  })

  // ── RATE_LIMIT detection ──────────────────────────────────────────────────
  describe('429 / rate limit patterns', () => {
    it('classifies "429 Too Many Requests" as RATE_LIMIT', () => {
      const result = classifyProviderError('429 Too Many Requests')
      expect(result.success).toBe(false)
      expect(result.errorCode).toBe('RATE_LIMIT')
      expect(result.error).toContain('Rate limit')
    })

    it('classifies "rate_limit" as RATE_LIMIT', () => {
      const result = classifyProviderError('rate_limit exceeded')
      expect(result.errorCode).toBe('RATE_LIMIT')
    })

    it('classifies "quota" error as RATE_LIMIT', () => {
      const result = classifyProviderError('quota exceeded for this project')
      expect(result.errorCode).toBe('RATE_LIMIT')
    })

    it('classifies Gemini RESOURCE_EXHAUSTED as RATE_LIMIT via quota keyword', () => {
      // Gemini sometimes returns quota messages with RESOURCE_EXHAUSTED
      const result = classifyProviderError('RESOURCE_EXHAUSTED: quota for model exceeded')
      expect(result.errorCode).toBe('RATE_LIMIT')
    })
  })

  // ── TIMEOUT / abort detection ─────────────────────────────────────────────
  describe('timeout / abort patterns', () => {
    it('classifies aborted requests as TIMEOUT', () => {
      const result = classifyProviderError('This operation was aborted')
      expect(result.success).toBe(false)
      expect(result.errorCode).toBe('TIMEOUT')
      expect(result.error).toContain('timed out')
    })

    it('classifies request timeout messages as TIMEOUT', () => {
      const result = classifyProviderError('Request timed out after 90000 ms')
      expect(result.errorCode).toBe('TIMEOUT')
    })

    it('classifies AbortError as TIMEOUT', () => {
      const result = classifyProviderError('AbortError: The operation was aborted.')
      expect(result.errorCode).toBe('TIMEOUT')
    })
  })

  // ── EMPTY_RESPONSE detection ──────────────────────────────────────────────
  describe('empty response patterns', () => {
    it('classifies provider empty responses as EMPTY_RESPONSE', () => {
      const result = classifyProviderError('Gemini returned an empty response.')
      expect(result.success).toBe(false)
      expect(result.errorCode).toBe('EMPTY_RESPONSE')
      expect(result.error).toContain('No response')
    })
  })

  // ── NETWORK detection ─────────────────────────────────────────────────────
  describe('network error patterns', () => {
    it('classifies "ENOTFOUND" as NETWORK', () => {
      const result = classifyProviderError('getaddrinfo ENOTFOUND api.openai.com')
      expect(result.success).toBe(false)
      expect(result.errorCode).toBe('NETWORK')
      expect(result.error).toContain('internet')
    })

    it('classifies "ECONNREFUSED" as NETWORK', () => {
      const result = classifyProviderError('connect ECONNREFUSED 127.0.0.1:443')
      expect(result.errorCode).toBe('NETWORK')
    })

    it('classifies "Failed to fetch" as NETWORK', () => {
      const result = classifyProviderError('Failed to fetch')
      expect(result.errorCode).toBe('NETWORK')
    })

    it('classifies "FetchError" as NETWORK', () => {
      const result = classifyProviderError('FetchError: request to https://... failed')
      expect(result.errorCode).toBe('NETWORK')
    })

    it('classifies OpenAI "Connection error." as NETWORK', () => {
      // OpenAI Node SDK throws APIConnectionError with this exact message string.
      const result = classifyProviderError('Connection error.')
      expect(result.success).toBe(false)
      expect(result.errorCode).toBe('NETWORK')
      expect(result.error).toContain('internet')
    })
  })

  // ── BLOCKED_RECITATION / BLOCKED_SAFETY detection ─────────────────────────
  describe('Gemini RECITATION / safety filter patterns', () => {
    it('classifies RECITATION error as BLOCKED_RECITATION', () => {
      const result = classifyProviderError(
        '[GoogleGenerativeAI Error]: Candidate was blocked due to RECITATION'
      )
      expect(result.success).toBe(false)
      expect(result.errorCode).toBe('BLOCKED_RECITATION')
      expect(result.error.toLowerCase()).toContain('copyrighted')
    })

    it('classifies copyrighted-content filters as BLOCKED_RECITATION', () => {
      const result = classifyProviderError(
        'The generated content was filtered because it may contain material that resembles existing copyrighted works.'
      )
      expect(result.errorCode).toBe('BLOCKED_RECITATION')
    })

    it('classifies finishReason=SAFETY as BLOCKED_SAFETY', () => {
      const result = classifyProviderError(
        'Gemini returned an empty response (finishReason=SAFETY).'
      )
      expect(result.errorCode).toBe('BLOCKED_SAFETY')
    })

    it('classifies "blocked due to safety" as BLOCKED_SAFETY', () => {
      const result = classifyProviderError('Candidate was blocked due to SAFETY')
      expect(result.errorCode).toBe('BLOCKED_SAFETY')
    })
  })

  // ── Unknown errors — pass through ─────────────────────────────────────────
  describe('unknown / unclassified errors', () => {
    it('passes through unrecognized error message without errorCode', () => {
      const result = classifyProviderError('Something completely unexpected happened')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Something completely unexpected happened')
      expect(result.errorCode).toBeUndefined()
    })

    it('passes through empty string without errorCode', () => {
      const result = classifyProviderError('')
      expect(result.success).toBe(false)
      expect(result.errorCode).toBeUndefined()
    })

    it('passes through model-not-found error without classification', () => {
      const result = classifyProviderError('404 Model not found: gpt-99')
      expect(result.success).toBe(false)
      expect(result.errorCode).toBeUndefined()
      expect(result.error).toContain('Model not found')
    })
  })

  // ── Return shape ──────────────────────────────────────────────────────────
  describe('return shape', () => {
    it('always returns success: false', () => {
      const cases = [
        'any error message',
        '401 unauthorized',
        '429 rate limit',
        'ENOTFOUND',
      ]
      for (const msg of cases) {
        expect(classifyProviderError(msg).success).toBe(false)
      }
    })

    it('always returns a non-empty error string', () => {
      const result = classifyProviderError('some error')
      expect(typeof result.error).toBe('string')
      expect(result.error.length).toBeGreaterThan(0)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('noApiKeyResponse', () => {
  it('returns success: false', () => {
    expect(noApiKeyResponse('gemini').success).toBe(false)
  })

  it('returns errorCode: NO_API_KEY', () => {
    expect(noApiKeyResponse('gemini').errorCode).toBe('NO_API_KEY')
  })

  it('includes the provider name in the error message', () => {
    const result = noApiKeyResponse('openai')
    expect(result.error).toContain('openai')
  })

  it('generates distinct messages for different providers', () => {
    const gemini = noApiKeyResponse('gemini')
    const claude = noApiKeyResponse('claude')
    expect(gemini.error).not.toBe(claude.error)
    expect(gemini.error).toContain('gemini')
    expect(claude.error).toContain('claude')
  })

  it('works for any provider string including unknown ones', () => {
    const result = noApiKeyResponse('my-custom-provider')
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('NO_API_KEY')
    expect(result.error).toContain('my-custom-provider')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('classifyProviderError — structured status and false positives', () => {
  it('does not map a token count containing "401" to INVALID_KEY', () => {
    const result = classifyProviderError(
      "This model's maximum context length is 128000 tokens. However, you requested 140401 tokens.",
    )
    expect(result.errorCode).toBeUndefined()
  })

  it('does not map "429" inside a longer number to RATE_LIMIT', () => {
    expect(classifyProviderError('request id 1429876 failed').errorCode).toBeUndefined()
  })

  it('prefers the structured status over message text', () => {
    const err = Object.assign(new Error('Something odd happened'), { status: 401 })
    expect(classifyProviderError(err).errorCode).toBe('INVALID_KEY')
    const limited = Object.assign(new Error('Something odd happened'), { status: 429 })
    expect(classifyProviderError(limited).errorCode).toBe('RATE_LIMIT')
  })

  it('recognises HTTP-looking statuses in short SDK messages', () => {
    expect(classifyProviderError('[GoogleGenerativeAI Error]: Error fetching: [429 Too Many Requests] busy').errorCode).toBe('RATE_LIMIT')
    expect(classifyProviderError('status: 401').errorCode).toBe('INVALID_KEY')
    expect(classifyProviderError('401 {"type":"error"}').errorCode).toBe('INVALID_KEY')
  })

  it('accepts a thrown Error as well as a message string', () => {
    expect(classifyProviderError(new Error('ENOTFOUND api.openai.com')).errorCode).toBe('NETWORK')
  })
})

describe('classifyProviderError — empty / truncated / invalid output', () => {
  it('maps emptyResponseError to EMPTY_RESPONSE', () => {
    const result = classifyProviderError(emptyResponseError('openai'))
    expect(result.errorCode).toBe('EMPTY_RESPONSE')
    expect(result.error).toContain('No response')
  })

  it('maps truncatedOutputError to OUTPUT_TRUNCATED with a user-facing message', () => {
    const result = classifyProviderError(truncatedOutputError('claude'))
    expect(result.errorCode).toBe('OUTPUT_TRUNCATED')
    expect(result.error.toLowerCase()).toContain('cut off')
  })

  it('maps invalidResponseError to INVALID_RESPONSE', () => {
    expect(classifyProviderError(invalidResponseError('gemini', 'no JSON')).errorCode).toBe('INVALID_RESPONSE')
  })
})

describe('getErrorStatus / getRetryAfterMs / getStatusFromMessage', () => {
  it('reads status from status, statusCode and response.status', () => {
    expect(getErrorStatus({ status: 503 })).toBe(503)
    expect(getErrorStatus({ statusCode: 429 })).toBe(429)
    expect(getErrorStatus({ response: { status: 502 } })).toBe(502)
    expect(getErrorStatus({ code: 'ECONNRESET' })).toBeUndefined()
    expect(getErrorStatus(new Error('x'))).toBeUndefined()
    expect(getErrorStatus('429')).toBeUndefined()
  })

  it('parses Retry-After seconds, HTTP date, retry-after-ms and Headers objects', () => {
    expect(getRetryAfterMs({ headers: { 'retry-after': '3' } })).toBe(3_000)
    expect(getRetryAfterMs({ headers: { 'Retry-After': '1.5' } })).toBe(1_500)
    expect(getRetryAfterMs({ headers: { 'retry-after-ms': '250' } })).toBe(250)
    expect(getRetryAfterMs({ headers: new Headers({ 'retry-after': '2' }) })).toBe(2_000)
    expect(getRetryAfterMs({ response: { headers: { 'retry-after': '4' } } })).toBe(4_000)
    const now = Date.parse('2026-01-01T00:00:00Z')
    expect(getRetryAfterMs({ headers: { 'retry-after': 'Thu, 01 Jan 2026 00:00:10 GMT' } }, now)).toBe(10_000)
    expect(getRetryAfterMs({ headers: {} })).toBeUndefined()
    expect(getRetryAfterMs(new Error('x'))).toBeUndefined()
  })

  it('only extracts HTTP-looking statuses from messages', () => {
    expect(getStatusFromMessage('HTTP 503 Service Unavailable')).toBe(503)
    expect(getStatusFromMessage('you requested 140401 tokens')).toBeUndefined()
    expect(getStatusFromMessage('you requested 401 tokens')).toBeUndefined()
  })
})

describe('classifyProviderError — Gemini key rejection and safety refusals', () => {
  it.each([
    'API key not valid. Please pass a valid API key.',
    '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com: [400 Bad Request] API key not valid. Please pass a valid API key. [{"reason":"API_KEY_INVALID"}]',
    'API key expired. Please renew the API key.',
    'Incorrect or invalid API key supplied',
    'API_KEY_INVALID',
  ])('maps %j to INVALID_KEY even without a 401', (message) => {
    expect(classifyProviderError(message).errorCode).toBe('INVALID_KEY')
    expect(classifyProviderError(Object.assign(new Error(message), { status: 400 })).errorCode).toBe('INVALID_KEY')
  })

  it('does not flag unrelated API-key wording as an invalid key', () => {
    expect(classifyProviderError('Missing API key header').errorCode).toBeUndefined()
  })

  it('maps blockedSafetyError to BLOCKED_SAFETY with the standard safety message', () => {
    const result = classifyProviderError(blockedSafetyError('gemini', 'finishReason=SAFETY'))
    expect(result.errorCode).toBe('BLOCKED_SAFETY')
    expect(result.error).toBe('The model blocked this response due to safety filters. Try rephrasing your prompt.')
    expect(classifyProviderError('blocked due to safety').error).toBe(result.error)
  })

  it('maps a model refusal to MODEL_REFUSAL, distinct from the input-safety verdict', () => {
    const error = modelRefusalError('claude', 'stop_reason=refusal')
    expect(isModelRefusalError(error)).toBe(true)
    expect(isModelRefusalError(blockedSafetyError('claude', 'x'))).toBe(false)
    expect(isModelRefusalError(new Error('claude declined to answer'))).toBe(false)
    const result = classifyProviderError(error)
    expect(result.errorCode).toBe('MODEL_REFUSAL')
    expect(result.error).toContain('declined')
    expect(result.error).toContain('retried once')
  })
})

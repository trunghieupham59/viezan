// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  clampMaxOutputTokens,
  getLightweightMaxOutputTokens,
  getLightweightTranslateTimeoutMs,
  getTranslateTimeoutMs,
  LIGHTWEIGHT_MAX_OUTPUT_TOKENS_CEILING,
  LIGHTWEIGHT_TRANSLATE_LOCAL_TIMEOUT_MS,
  LIGHTWEIGHT_TRANSLATE_TIMEOUT_MS,
  DETECT_LANG_MAX_CHARS as MAIN_DETECT_LANG_MAX_CHARS,
  MAX_CHAT_REQUEST_CHARS,
  MAX_LIGHTWEIGHT_TRANSLATE_CHARS,
  MAX_LIGHTWEIGHT_TRANSLATE_TOKENS,
  TRANSLATE_CHUNK_CHAR_LIMIT,
  TRANSLATE_CHUNK_CONCURRENCY,
  TRANSLATE_CHUNK_TIMEOUT_MS,
  TRANSLATE_CONTEXT_TAIL_CHARS,
  TRANSLATE_LOCAL_TIMEOUT_MS,
  TRANSLATE_TIMEOUT_MAX_MS,
} from '../ipcConstants'

// Không thể import từ src/ (khác tsconfig), hardcode expected values.
// Nếu test này fail → update CẢ HAI constant VÀ test này.
const EXPECTED_MAX_CHAT_INPUT_CHARS = 3000
const EXPECTED_DETECT_LANG_MAX_CHARS = 500

describe('Cross-boundary constant sync', () => {
  it('MAX_CHAT_REQUEST_CHARS (main) === MAX_CHAT_INPUT_CHARS (renderer)', () => {
    expect(MAX_CHAT_REQUEST_CHARS).toBe(EXPECTED_MAX_CHAT_INPUT_CHARS)
  })
  it('DETECT_LANG_MAX_CHARS (main) === DETECT_LANG_MAX_CHARS (renderer)', () => {
    expect(MAIN_DETECT_LANG_MAX_CHARS).toBe(EXPECTED_DETECT_LANG_MAX_CHARS)
  })
})

describe('Chunk translation parameters (HC-09 to HC-12)', () => {
  it('TRANSLATE_CHUNK_CHAR_LIMIT is 12000 chars (~3000 tokens)', () => {
    expect(TRANSLATE_CHUNK_CHAR_LIMIT).toBe(12_000)
  })

  it('TRANSLATE_CHUNK_TIMEOUT_MS is 90 seconds', () => {
    expect(TRANSLATE_CHUNK_TIMEOUT_MS).toBe(90_000)
  })

  it('TRANSLATE_CHUNK_CONCURRENCY is 5 (balances throughput vs rate limit)', () => {
    expect(TRANSLATE_CHUNK_CONCURRENCY).toBe(5)
  })

  it('TRANSLATE_CONTEXT_TAIL_CHARS is 400 chars of overlap context', () => {
    expect(TRANSLATE_CONTEXT_TAIL_CHARS).toBe(400)
  })

  it('TRANSLATE_CHUNK_CHAR_LIMIT is positive', () => {
    expect(TRANSLATE_CHUNK_CHAR_LIMIT).toBeGreaterThan(0)
  })

  it('TRANSLATE_CHUNK_TIMEOUT_MS is reasonable (between 10s and 5 min)', () => {
    expect(TRANSLATE_CHUNK_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000)
    expect(TRANSLATE_CHUNK_TIMEOUT_MS).toBeLessThanOrEqual(300_000)
  })

  it('TRANSLATE_CHUNK_CONCURRENCY is between 1 and 20', () => {
    expect(TRANSLATE_CHUNK_CONCURRENCY).toBeGreaterThanOrEqual(1)
    expect(TRANSLATE_CHUNK_CONCURRENCY).toBeLessThanOrEqual(20)
  })
})

describe('clampMaxOutputTokens', () => {
  it('clamps legacy Claude families to their output ceilings', () => {
    expect(clampMaxOutputTokens('claude', 'claude-3-5-haiku-20241022', 16_000)).toBe(8_192)
    expect(clampMaxOutputTokens('claude', 'claude-3-5-sonnet-20241022', 16_000)).toBe(8_192)
    expect(clampMaxOutputTokens('claude', 'claude-3-haiku-20240307', 16_000)).toBe(4_096)
    expect(clampMaxOutputTokens('claude', 'claude-3-opus-20240229', 16_000)).toBe(4_096)
  })

  it('clamps legacy OpenAI families', () => {
    expect(clampMaxOutputTokens('openai', 'gpt-4', 16_384)).toBe(4_096)
    expect(clampMaxOutputTokens('openai', 'gpt-4-turbo', 16_384)).toBe(4_096)
    expect(clampMaxOutputTokens('openai', 'gpt-4-0613', 16_384)).toBe(4_096)
    expect(clampMaxOutputTokens('openai', 'gpt-3.5-turbo', 16_384)).toBe(4_096)
  })

  it('leaves newer and unknown models at the requested value', () => {
    expect(clampMaxOutputTokens('openai', 'gpt-4o', 16_384)).toBe(16_384)
    expect(clampMaxOutputTokens('openai', 'gpt-4o-mini', 16_384)).toBe(16_384)
    expect(clampMaxOutputTokens('openai', 'gpt-4.1', 16_384)).toBe(16_384)
    expect(clampMaxOutputTokens('openai', 'gpt-5-mini', 16_384)).toBe(16_384)
    expect(clampMaxOutputTokens('claude', 'claude-sonnet-4-20250514', 16_000)).toBe(16_000)
    expect(clampMaxOutputTokens('claude', 'claude-haiku-4-5', 16_000)).toBe(16_000)
    expect(clampMaxOutputTokens('claude', 'some-future-model', 16_000)).toBe(16_000)
    expect(clampMaxOutputTokens('local', 'gpt-4', 16_384)).toBe(16_384)
  })

  it('limits non-streaming requests for Opus 4.0 / 4.1 ids to 8192 (the SDK demands streaming above it)', () => {
    for (const id of ['claude-opus-4-20250514', 'claude-opus-4-0', 'claude-opus-4-1-20250805', 'claude-opus-4-1', 'claude-opus-4']) {
      expect(clampMaxOutputTokens('claude', id, 16_000)).toBe(8_192)
    }
    expect(clampMaxOutputTokens('claude', 'Claude-Opus-4-20250514', 16_000)).toBe(8_192)
  })

  it('does not clamp newer Opus (4.5+) or Sonnet 4.x ids', () => {
    for (const id of ['claude-opus-4-5-20251101', 'claude-opus-4-5', 'claude-opus-4-6', 'claude-opus-4-7', 'claude-sonnet-4-20250514', 'claude-sonnet-4-5', 'claude-sonnet-4-6']) {
      expect(clampMaxOutputTokens('claude', id, 16_000)).toBe(16_000)
    }
  })

  it('never raises a smaller request', () => {
    expect(clampMaxOutputTokens('claude', 'claude-3-haiku-20240307', 1_000)).toBe(1_000)
  })
})

describe('getTranslateTimeoutMs', () => {
  it('gives the local provider a long fixed deadline regardless of size or effort', () => {
    expect(getTranslateTimeoutMs('local', 10)).toBe(TRANSLATE_LOCAL_TIMEOUT_MS)
    expect(getTranslateTimeoutMs('local', 12_000, 'high')).toBe(TRANSLATE_LOCAL_TIMEOUT_MS)
    expect(TRANSLATE_LOCAL_TIMEOUT_MS).toBeGreaterThanOrEqual(600_000)
  })

  it('keeps the 90 s base for short cloud requests', () => {
    expect(getTranslateTimeoutMs('openai', 5)).toBe(TRANSLATE_CHUNK_TIMEOUT_MS)
    expect(getTranslateTimeoutMs('gemini', 999, 'auto')).toBe(TRANSLATE_CHUNK_TIMEOUT_MS)
    expect(getTranslateTimeoutMs(undefined, 0)).toBe(TRANSLATE_CHUNK_TIMEOUT_MS)
  })

  it('scales cloud deadlines with input size', () => {
    expect(getTranslateTimeoutMs('claude', 3_000)).toBeGreaterThan(TRANSLATE_CHUNK_TIMEOUT_MS)
    expect(getTranslateTimeoutMs('claude', 12_000)).toBeGreaterThan(getTranslateTimeoutMs('claude', 3_000))
  })

  it('allows longer for medium / high reasoning effort and caps the result', () => {
    const base = getTranslateTimeoutMs('openai', 3_000, 'auto')
    expect(getTranslateTimeoutMs('openai', 3_000, 'low')).toBe(base)
    expect(getTranslateTimeoutMs('openai', 3_000, 'medium')).toBeGreaterThan(base)
    expect(getTranslateTimeoutMs('openai', 3_000, 'high')).toBeGreaterThan(getTranslateTimeoutMs('openai', 3_000, 'medium'))
    expect(getTranslateTimeoutMs('openai', 1_000_000, 'high')).toBe(TRANSLATE_TIMEOUT_MAX_MS)
  })
})

describe('lightweight translation limits', () => {
  it('lengthens the lightweight deadline for local and for larger cloud inputs', () => {
    expect(getLightweightTranslateTimeoutMs('gemini', 100)).toBe(LIGHTWEIGHT_TRANSLATE_TIMEOUT_MS)
    expect(getLightweightTranslateTimeoutMs('openai', MAX_LIGHTWEIGHT_TRANSLATE_CHARS)).toBeGreaterThan(LIGHTWEIGHT_TRANSLATE_TIMEOUT_MS)
    expect(getLightweightTranslateTimeoutMs('local', 100)).toBe(LIGHTWEIGHT_TRANSLATE_LOCAL_TIMEOUT_MS)
    expect(LIGHTWEIGHT_TRANSLATE_LOCAL_TIMEOUT_MS).toBeGreaterThan(LIGHTWEIGHT_TRANSLATE_TIMEOUT_MS)
  })

  it('derives the output budget from the input length, within [2048, ceiling]', () => {
    expect(getLightweightMaxOutputTokens(0)).toBe(MAX_LIGHTWEIGHT_TRANSLATE_TOKENS)
    expect(getLightweightMaxOutputTokens(1_000)).toBe(MAX_LIGHTWEIGHT_TRANSLATE_TOKENS)
    expect(getLightweightMaxOutputTokens(5_000)).toBeGreaterThan(MAX_LIGHTWEIGHT_TRANSLATE_TOKENS)
    expect(getLightweightMaxOutputTokens(MAX_LIGHTWEIGHT_TRANSLATE_CHARS)).toBe(LIGHTWEIGHT_MAX_OUTPUT_TOKENS_CEILING)
    expect(getLightweightMaxOutputTokens(10_000_000)).toBe(LIGHTWEIGHT_MAX_OUTPUT_TOKENS_CEILING)
  })

  it('budgets close to one token per input character up to the accepted maximum', () => {
    // Worst case for token-hungry output scripts: roughly one token per character.
    expect(getLightweightMaxOutputTokens(MAX_LIGHTWEIGHT_TRANSLATE_CHARS)).toBeGreaterThanOrEqual(MAX_LIGHTWEIGHT_TRANSLATE_CHARS * 0.75)
  })
})

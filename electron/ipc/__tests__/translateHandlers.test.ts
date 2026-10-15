// @vitest-environment node
/**
 * translate / translate:rewrite / translate:detect-lang / translate:verify handler behaviour:
 * retry + abort + timeout wiring, structured error classification, input type-checks.
 * Provider adapters are replaced by controllable fakes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ IpcMain: class {} }))
vi.mock('../storage', () => ({ getStoredApiKey: vi.fn() }))
vi.mock('../localAi', () => ({
  LOCAL_AI_PLACEHOLDER_KEY: 'local-key',
  isLocalProvider: (provider: string) => provider === 'local',
}))

const providers = vi.hoisted(() => ({
  translate: vi.fn(),
  rewrite: vi.fn(),
  detect: vi.fn(),
  verify: vi.fn(),
}))
vi.mock('../translateProviders', () => ({
  TRANSLATE_PROVIDERS: { gemini: providers.translate, openai: providers.translate, claude: providers.translate, local: providers.translate },
  REWRITE_PROVIDERS: { gemini: providers.rewrite, openai: providers.rewrite, claude: providers.rewrite, local: providers.rewrite },
  DETECT_PROVIDERS: { gemini: providers.detect, openai: providers.detect, claude: providers.detect, local: providers.detect },
  VERIFY_PROVIDERS: { gemini: providers.verify, openai: providers.verify, claude: providers.verify, local: providers.verify },
  streamTranslation: vi.fn(),
}))

import { truncatedOutputError } from '../errorUtils'
import { getTranslateTimeoutMs, TRANSLATE_CHUNK_TIMEOUT_MS, TRANSLATE_LOCAL_TIMEOUT_MS } from '../ipcConstants'
import { getStoredApiKey } from '../storage'
import { registerTranslateHandlers } from '../translate'
import { CHUNK_CHAR_LIMIT } from '../translateChunking'
import { buildMockIpcMain } from './helpers/mockIpcMain'

const baseTranslate = {
  provider: 'openai',
  model: 'gpt-4o',
  sourceText: 'Hello',
  sourceLang: 'en',
  targetLang: 'vi',
}

let invoke: ReturnType<typeof buildMockIpcMain>['invoke']

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(getStoredApiKey).mockReturnValue('fake-key')
  const mock = buildMockIpcMain()
  // biome-ignore lint/suspicious/noExplicitAny: mock IpcMain
  registerTranslateHandlers(mock.ipcMain as any)
  invoke = mock.invoke
})

afterEach(() => {
  vi.useRealTimers()
})

describe('translate:verify', () => {
  it('returns a structured error instead of throwing for a non-string apiKey', async () => {
    for (const apiKey of [undefined, null, 123, { key: 'x' }]) {
      const result = await invoke('translate:verify', 'openai', apiKey)
      expect(result).toMatchObject({ success: false, errorCode: 'INVALID_INPUT' })
    }
    expect(providers.verify).not.toHaveBeenCalled()
  })

  it('validates the provider argument', async () => {
    expect(await invoke('translate:verify', 42, 'k')).toMatchObject({ success: false, errorCode: 'INVALID_INPUT' })
    expect((await invoke('translate:verify', 'mystery', 'k')).error).toContain('Unknown provider')
  })

  it('keeps the legacy messages for empty keys and success', async () => {
    expect(await invoke('translate:verify', 'openai', '   ')).toEqual({ success: false, error: 'API key is empty' })
    providers.verify.mockResolvedValue(undefined)
    expect(await invoke('translate:verify', 'openai', '  sk-test  ')).toEqual({ success: true })
    expect(providers.verify.mock.calls[0][0]).toBe('sk-test')
    expect(providers.verify.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('maps 401 to INVALID_KEY and 429 to a valid-but-rate-limited key', async () => {
    providers.verify.mockRejectedValueOnce(Object.assign(new Error('Incorrect API key'), { status: 401 }))
    expect(await invoke('translate:verify', 'openai', 'k')).toEqual({ success: false, error: 'Invalid API key', errorCode: 'INVALID_KEY' })
    providers.verify.mockRejectedValueOnce(Object.assign(new Error('slow down'), { status: 429 }))
    expect(await invoke('translate:verify', 'openai', 'k')).toMatchObject({ success: false, errorCode: 'RATE_LIMIT', valid: true })
  })

  it('keeps authenticated billing and permission failures distinct and saveable', async () => {
    providers.verify.mockRejectedValueOnce(Object.assign(new Error('billing required'), { status: 402 }))
    expect(await invoke('translate:verify', 'claude', 'k')).toMatchObject({
      success: false,
      errorCode: 'BILLING',
      valid: true,
    })

    providers.verify.mockRejectedValueOnce(Object.assign(new Error('authentication lacks workspace permission'), { status: 403 }))
    expect(await invoke('translate:verify', 'claude', 'k')).toMatchObject({
      success: false,
      errorCode: 'PERMISSION',
      valid: true,
    })
  })

  it('keeps network failures separate and does not mark them as valid', async () => {
    providers.verify.mockRejectedValueOnce(new Error('Failed to fetch'))
    expect(await invoke('translate:verify', 'claude', 'k')).toEqual({
      success: false,
      error: 'No internet connection',
      errorCode: 'NETWORK',
    })
  })

  it('does not call a key invalid because a number in the message contains "401"', async () => {
    providers.verify.mockRejectedValueOnce(new Error('you requested 140401 tokens'))
    const result = await invoke('translate:verify', 'openai', 'k')
    expect(result.errorCode).toBeUndefined()
  })

  it('reports a hung verification as a timeout', async () => {
    vi.useFakeTimers()
    providers.verify.mockImplementation(() => new Promise(() => {}))
    const pending = invoke('translate:verify', 'openai', 'k')
    await vi.advanceTimersByTimeAsync(30_001)
    expect(await pending).toMatchObject({ success: false, errorCode: 'TIMEOUT' })
  })
})

describe('translate', () => {
  it('rejects "auto" as a target language', async () => {
    const result = await invoke('translate', { ...baseTranslate, targetLang: 'auto' })
    expect(result).toMatchObject({ success: false, errorCode: 'INVALID_INPUT' })
    expect(providers.translate).not.toHaveBeenCalled()
  })

  it('still accepts "auto" as a source language', async () => {
    providers.translate.mockResolvedValue('Xin chào')
    const result = await invoke('translate', { ...baseTranslate, sourceLang: 'auto' })
    expect(result).toEqual({ success: true, translatedText: 'Xin chào' })
  })

  it('passes an abort signal to the provider on the non-chunked path', async () => {
    providers.translate.mockResolvedValue('Xin chào')
    await invoke('translate', baseTranslate)
    const options = providers.translate.mock.calls[0][10]
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  it('retries a transient 503 on the non-chunked path', async () => {
    vi.useFakeTimers()
    providers.translate
      .mockRejectedValueOnce(Object.assign(new Error('Service Unavailable'), { status: 503 }))
      .mockResolvedValueOnce('Xin chào')
    const pending = invoke('translate', baseTranslate)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(await pending).toEqual({ success: true, translatedText: 'Xin chào' })
    expect(providers.translate).toHaveBeenCalledTimes(2)
  })

  it('times out a stalled request, aborts it and reports TIMEOUT (not CANCELLED)', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    providers.translate.mockImplementation((...callArgs: unknown[]) => {
      signal = (callArgs[10] as { signal: AbortSignal }).signal
      return new Promise(() => {})
    })
    const pending = invoke('translate', { ...baseTranslate, requestId: 'req-timeout' })
    await vi.advanceTimersByTimeAsync(90_001)
    const result = await pending
    expect(result.errorCode).toBe('TIMEOUT')
    expect(signal?.aborted).toBe(true)
  })

  it('translate:cancel aborts the in-flight request and reports CANCELLED', async () => {
    providers.translate.mockImplementation((...callArgs: unknown[]) => {
      const { signal } = callArgs[10] as { signal: AbortSignal }
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('Request was aborted.'), { name: 'AbortError' })))
      })
    })
    const pending = invoke('translate', { ...baseTranslate, requestId: 'req-cancel' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(await invoke('translate:cancel', { requestId: 'req-cancel' })).toEqual({ success: true })
    expect(await pending).toMatchObject({ success: false, errorCode: 'CANCELLED' })
  })

  it('does not report a dropped connection (ECONNRESET) as a user cancel', async () => {
    providers.translate.mockRejectedValue(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }))
    const result = await invoke('translate', { ...baseTranslate, requestId: 'req-reset' })
    expect(result.errorCode).not.toBe('CANCELLED')
  })

  it('surfaces EMPTY_RESPONSE / OUTPUT_TRUNCATED codes from providers', async () => {
    const { emptyResponseError, truncatedOutputError } = await import('../errorUtils.js')
    providers.translate.mockRejectedValueOnce(emptyResponseError('openai'))
    expect((await invoke('translate', baseTranslate)).errorCode).toBe('EMPTY_RESPONSE')
    providers.translate.mockRejectedValue(truncatedOutputError('openai'))
    expect((await invoke('translate', baseTranslate)).errorCode).toBe('OUTPUT_TRUNCATED')
  })

  it('translates long text in chunks and preserves paragraph separators', async () => {
    const paragraph = 'word '.repeat(Math.floor(CHUNK_CHAR_LIMIT / 10))
    const sourceText = [paragraph, paragraph, paragraph].join('\n\n')
    providers.translate.mockImplementation(async (_k: string, _m: string, text: string) => `T(${text.length > 0 ? 'x' : ''})`)
    const result = await invoke('translate', { ...baseTranslate, sourceText })
    expect(result.success).toBe(true)
    expect(result.translatedText).toContain('\n\n')
  })
})

describe('translate:rewrite', () => {
  const baseRewrite = { provider: 'openai', model: 'gpt-4o', text: 'Some text', lang: 'en' }

  it('accepts the renderer sentinel for "same language" and rejects "auto"', async () => {
    providers.rewrite.mockResolvedValue('Better text')
    const ok = await invoke('translate:rewrite', { ...baseRewrite, lang: 'the same language as the input text' })
    expect(ok).toEqual({ success: true, translatedText: 'Better text' })
    const auto = await invoke('translate:rewrite', { ...baseRewrite, lang: 'auto' })
    expect(auto.errorCode).toBe('INVALID_INPUT')
  })

  it('gives unchunked rewrites a signal and retries transient failures', async () => {
    vi.useFakeTimers()
    providers.rewrite
      .mockRejectedValueOnce(Object.assign(new Error('overloaded'), { status: 529 }))
      .mockResolvedValueOnce('Better text')
    const pending = invoke('translate:rewrite', baseRewrite)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(await pending).toEqual({ success: true, translatedText: 'Better text' })
    expect(providers.rewrite).toHaveBeenCalledTimes(2)
    expect(providers.rewrite.mock.calls[1][5].signal).toBeInstanceOf(AbortSignal)
  })

  it('does not wrap rewrite chunks with the translate-only instruction', async () => {
    const paragraph = 'word '.repeat(Math.floor(CHUNK_CHAR_LIMIT / 10))
    const text = [paragraph, paragraph, paragraph].join('\n\n')
    const seen: string[] = []
    providers.rewrite.mockImplementation(async (_k: string, _m: string, chunk: string) => {
      seen.push(chunk)
      return 'rewritten'
    })
    const result = await invoke('translate:rewrite', { ...baseRewrite, text })
    expect(result.success).toBe(true)
    expect(seen.length).toBeGreaterThan(1)
    for (const chunk of seen) {
      expect(chunk).not.toMatch(/Translate ONLY|Translate only/)
      expect(chunk).toContain('rewritten')
    }
  })

  it('classifies failures with the structured status', async () => {
    providers.rewrite.mockRejectedValue(Object.assign(new Error('nope'), { status: 401 }))
    expect((await invoke('translate:rewrite', baseRewrite)).errorCode).toBe('INVALID_KEY')
  })
})

describe('translate:detect-lang', () => {
  const baseDetect = { provider: 'openai', model: 'gpt-4o', text: 'Xin chào' }

  it('returns the normalized language', async () => {
    providers.detect.mockResolvedValue('Vietnamese')
    expect(await invoke('translate:detect-lang', baseDetect)).toEqual({ success: true, lang: 'vi' })
    expect(providers.detect.mock.calls[0][3].signal).toBeInstanceOf(AbortSignal)
  })

  it('classifies the real provider error instead of swallowing it', async () => {
    providers.detect.mockRejectedValueOnce(Object.assign(new Error('Incorrect API key'), { status: 401 }))
    expect(await invoke('translate:detect-lang', baseDetect)).toMatchObject({ success: false, errorCode: 'INVALID_KEY' })
    providers.detect.mockRejectedValueOnce(Object.assign(new Error('slow down'), { status: 429 }))
    expect(await invoke('translate:detect-lang', baseDetect)).toMatchObject({ success: false, errorCode: 'RATE_LIMIT' })
    providers.detect.mockRejectedValueOnce(new Error('weird failure'))
    const generic = await invoke('translate:detect-lang', baseDetect)
    expect(generic.success).toBe(false)
    expect(generic.error).toContain('weird failure')
  })

  it('reports an unrecognized answer instead of guessing a language', async () => {
    providers.detect.mockResolvedValue('a')
    const result = await invoke('translate:detect-lang', baseDetect)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unrecognized language code')
  })
})

describe('translate — provider-aware deadlines', () => {
  const hang = () => providers.translate.mockImplementation(() => new Promise(() => {}))

  it('does not time out a local provider at 90 s, only at its long deadline', async () => {
    vi.useFakeTimers()
    hang()
    let done = false
    const pending = invoke('translate', { ...baseTranslate, provider: 'local', model: 'local-auto' }).then((r: unknown) => {
      done = true
      return r
    })
    await vi.advanceTimersByTimeAsync(TRANSLATE_CHUNK_TIMEOUT_MS * 5)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(TRANSLATE_LOCAL_TIMEOUT_MS)
    expect(await pending).toMatchObject({ success: false, errorCode: 'TIMEOUT' })
  })

  it('gives a longer cloud paragraph more than the 90 s base', async () => {
    vi.useFakeTimers()
    hang()
    let done = false
    const sourceText = 'word '.repeat(600) // 3 000 chars
    const pending = invoke('translate', { ...baseTranslate, sourceText }).then((r: unknown) => {
      done = true
      return r
    })
    await vi.advanceTimersByTimeAsync(getTranslateTimeoutMs('openai', sourceText.length) - 1)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    expect(await pending).toMatchObject({ success: false, errorCode: 'TIMEOUT' })
  })

  it('allows more time for high reasoning effort', async () => {
    vi.useFakeTimers()
    hang()
    let done = false
    const pending = invoke('translate', { ...baseTranslate, reasoningEffort: 'high' }).then((r: unknown) => {
      done = true
      return r
    })
    await vi.advanceTimersByTimeAsync(TRANSLATE_CHUNK_TIMEOUT_MS + 1)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(getTranslateTimeoutMs('openai', 5, 'high'))
    expect(await pending).toMatchObject({ errorCode: 'TIMEOUT' })
  })

  it('does not time out a local rewrite at 90 s', async () => {
    vi.useFakeTimers()
    providers.rewrite.mockImplementation(() => new Promise(() => {}))
    let done = false
    const pending = invoke('translate:rewrite', { provider: 'local', model: 'local-auto', text: 'Some text', lang: 'en' }).then((r: unknown) => {
      done = true
      return r
    })
    await vi.advanceTimersByTimeAsync(TRANSLATE_CHUNK_TIMEOUT_MS * 5)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(TRANSLATE_LOCAL_TIMEOUT_MS)
    expect(await pending).toMatchObject({ errorCode: 'TIMEOUT' })
  })
})

describe('translate — OUTPUT_TRUNCATED fallback to chunked translation', () => {
  const body = (text: string) => (text.includes(']\n\n') ? text.slice(text.lastIndexOf(']\n\n') + 3) : text)
  const sourceText = 'Alpha one. Beta two. Gamma three. Delta four. Epsilon five. Zeta six.'

  it('translates the same text in smaller pieces when the whole text truncates', async () => {
    providers.translate.mockImplementation(async (_k: string, _m: string, text: string) => {
      if (body(text).length > 40) throw truncatedOutputError('openai')
      return `[${body(text)}]`
    })
    const result = await invoke('translate', { ...baseTranslate, sourceText })
    expect(result.success).toBe(true)
    expect(result.translatedText.replace(/[[\]]/g, '').replace(/\s+/g, ' ')).toBe(sourceText)
    expect(providers.translate.mock.calls.length).toBeGreaterThan(2)
  })

  it('still reports OUTPUT_TRUNCATED when even small pieces truncate', async () => {
    providers.translate.mockRejectedValue(truncatedOutputError('openai'))
    expect((await invoke('translate', { ...baseTranslate, sourceText })).errorCode).toBe('OUTPUT_TRUNCATED')
  })

  it('does not chunk phonetic-only requests (the chunk note would corrupt them)', async () => {
    providers.translate.mockRejectedValue(truncatedOutputError('openai'))
    const result = await invoke('translate', { ...baseTranslate, sourceText, phoneticOnly: true })
    expect(result.errorCode).toBe('OUTPUT_TRUNCATED')
    expect(providers.translate).toHaveBeenCalledTimes(1)
  })

  it('applies the same fallback to rewrite', async () => {
    providers.rewrite.mockImplementation(async (_k: string, _m: string, text: string) => {
      if (body(text).length > 40) throw truncatedOutputError('openai')
      return `[${body(text)}]`
    })
    const result = await invoke('translate:rewrite', { provider: 'openai', model: 'gpt-4o', text: sourceText, lang: 'en' })
    expect(result.success).toBe(true)
    expect(result.translatedText.replace(/[[\]]/g, '').replace(/\s+/g, ' ')).toBe(sourceText)
  })
})

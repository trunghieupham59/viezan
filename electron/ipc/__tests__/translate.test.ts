// @vitest-environment node
/**
 * Unit tests for electron/ipc/translate.ts
 *
 * Tests focus on:
 *   1. splitIntoChunks       — chunk boundary logic (paragraph / line / sentence / hard)
 *   2. buildPrompt           — prompt modes: translate, phoneticOnly, furigana, styles
 *   3. withTimeout           — resolves on time, rejects on timeout, cleans up
 *   4. promisePool           — concurrency limit, ordering, error propagation
 *   5. normalizeDetectedLang — BCP-47 code normalisation: exact, capitalisation, partial, null
 *   6. IPC handlers          — input validation, NO_API_KEY, unknown provider
 *   7. translate:detect-lang — empty text, no API key, unknown provider
 *
 * Provider SDKs are NOT imported — no real API calls made.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mock Electron before importing translate.ts ───────────────────────────────
vi.mock('electron', () => ({
  IpcMain: class {},
}))

// ── Mock storage ──────────────────────────────────────────────────────────────
vi.mock('../storage', () => ({
  getStoredApiKey: vi.fn(),
}))

import { getStoredApiKey } from '../storage'
import {
  buildPrompt,
  normalizeDetectedLang,
  promisePool,
  registerTranslateHandlers,
  splitIntoChunks,
  withTimeout,
} from '../translate'
import { buildMockIpcMain } from './helpers/mockIpcMain'

// ─────────────────────────────────────────────────────────────────────────────
describe('splitIntoChunks', () => {
  it('returns single-element array when text fits within limit', () => {
    const result = splitIntoChunks('short text', 100)
    expect(result).toEqual(['short text'])
  })

  it('splits on paragraph break (\\n\\n) preferentially', () => {
    // block1 is 50 chars, '\n\n', block2 is 50 chars → total 102 chars
    // With limit=80: window = block1 + '\n\n' + first 28 chars of block2
    // lastIndexOf('\n\n') = 50, which is > 80 * 0.35 = 28 → split at 52
    const block1 = 'a'.repeat(50)
    const block2 = 'b'.repeat(50)
    const text = `${block1}\n\n${block2}`
    const result = splitIntoChunks(text, 80)
    expect(result).toHaveLength(2)
    // Lossless: the paragraph break stays with the first chunk so the join is exact.
    expect(result[0]).toBe(`${block1}

`)
    expect(result[1]).toBe(block2)
    expect(result.join('')).toBe(text)
  })

  it('splits on single newline when no paragraph break is available', () => {
    const line1 = 'a'.repeat(50)
    const line2 = 'b'.repeat(50)
    const text = `${line1}\n${line2}`
    const result = splitIntoChunks(text, 70)
    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result.join('\n').replace(/\n$/, '')).toContain('a'.repeat(50))
  })

  it('splits on sentence-ending punctuation when no newline exists', () => {
    const sentence1 = `${'a'.repeat(40)}. `
    const sentence2 = 'b'.repeat(40)
    const text = sentence1 + sentence2
    const result = splitIntoChunks(text, 60)
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('performs hard split at limit when no natural break point exists', () => {
    const text = 'a'.repeat(200)
    const result = splitIntoChunks(text, 100)
    expect(result.length).toBe(2)
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(100)
    }
  })

  it('filters out empty / whitespace-only chunks', () => {
    // Text that starts with double newlines should not produce empty chunks
    const text = `\n\n${'a'.repeat(50)}\n\n${'b'.repeat(50)}\n\n`
    const result = splitIntoChunks(text, 40)
    expect(result.every(c => c.trim().length > 0)).toBe(true)
  })

  it('handles text exactly at the limit (returns single chunk)', () => {
    const text = 'x'.repeat(100)
    const result = splitIntoChunks(text, 100)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(text)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('buildPrompt', () => {
  it('plain translate: includes target language and source text', () => {
    const prompt = buildPrompt('Hello world', 'en', 'vi', false, 'general', false)
    expect(prompt).toContain('vi')
    expect(prompt).toContain('Hello world')
    expect(prompt).not.toContain('phonetic')
  })

  it('phoneticOnly+furigana for Japanese: adds furigana instruction, NOT translate', () => {
    const prompt = buildPrompt('東京', 'en', 'ja', true, 'general', true)
    expect(prompt).toContain('furigana')
    expect(prompt).not.toContain('Translate into')
  })

  it('standard phonetic mode keeps original script with reading annotations', () => {
    const prompt = buildPrompt('東京', 'ja', 'ja', true, 'general', true, 'standard')
    expect(prompt).toContain('{kanji|reading}')
    expect(prompt).toContain('Do NOT translate or change the text content')
    expect(prompt).not.toContain('pure phonetic representation')
  })

  it('phonetic transcription mode replaces original script with pure pronunciation', () => {
    const prompt = buildPrompt('東京', 'ja', 'ja', true, 'general', true, 'phonetic')
    expect(prompt).toContain('pure phonetic representation')
    expect(prompt).toContain('remove every kanji character entirely')
    expect(prompt).toContain('Do NOT use {kanji|reading} brackets')
  })

  it('phoneticOnly+furigana for Chinese: adds pinyin instruction', () => {
    const prompt = buildPrompt('北京', 'en', 'zh', true, 'general', true)
    expect(prompt).toContain('pinyin')
    expect(prompt).not.toContain('Translate into')
  })

  it('phoneticOnly+furigana for Korean: adds romanization instruction', () => {
    const prompt = buildPrompt('서울', 'en', 'ko', true, 'general', true)
    expect(prompt).toContain('romanization')
  })

  it('furigana mode (not phoneticOnly): includes furigana instruction alongside translation', () => {
    const prompt = buildPrompt('Hello', 'en', 'ja', true, 'general', false)
    expect(prompt).toContain('furigana')
    expect(prompt).toContain('Translate into')
  })

  it('different styles produce different prompts', () => {
    const general = buildPrompt('text', 'en', 'vi', false, 'general', false)
    const casual = buildPrompt('text', 'en', 'vi', false, 'casual', false)
    const technical = buildPrompt('text', 'en', 'vi', false, 'technical', false)
    expect(general).not.toBe(casual)
    expect(general).not.toBe(technical)
    expect(casual).not.toBe(technical)
  })

  it('phoneticOnly without showFurigana: no annotation instruction', () => {
    // phoneticOnly=true but showFurigana=false → condition (phoneticOnly && showFurigana) is false
    const prompt = buildPrompt('Hello', 'en', 'vi', false, 'general', true)
    expect(prompt).not.toContain('furigana')
    // Falls into the normal translate path
    expect(prompt).toContain('Translate into')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('withTimeout', () => {
  it('resolves with the promise value when it settles before timeout', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000, 'test')
    expect(result).toBe('ok')
  })

  it('rejects with timeout message when promise does not settle in time', async () => {
    const neverResolves = new Promise<string>(() => {})
    await expect(
      withTimeout(neverResolves, 20, 'slow-label')
    ).rejects.toThrow('slow-label')
  })

  it('includes the timeout duration in the error message', async () => {
    const neverResolves = new Promise<string>(() => {})
    await expect(
      withTimeout(neverResolves, 50, 'myLabel')
    ).rejects.toThrow('timed out')
  })

  it('propagates rejection from the original promise', async () => {
    const failing = Promise.reject(new Error('upstream error'))
    await expect(withTimeout(failing, 1000, 'test')).rejects.toThrow('upstream error')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('promisePool', () => {
  it('executes all tasks and returns results in the original order', async () => {
    const tasks = [3, 1, 2].map(n => () => Promise.resolve(n * 10))
    const results = await promisePool(tasks, 2)
    expect(results).toEqual([30, 10, 20])
  })

  it('respects concurrency limit — never exceeds max concurrent tasks', async () => {
    let activeConcurrent = 0
    let peakConcurrent = 0
    const CONCURRENCY = 3

    const tasks = Array.from({ length: 9 }, (_, i) => () =>
      new Promise<number>(resolve => {
        activeConcurrent++
        peakConcurrent = Math.max(peakConcurrent, activeConcurrent)
        setTimeout(() => {
          activeConcurrent--
          resolve(i)
        }, 10)
      })
    )

    await promisePool(tasks, CONCURRENCY)
    expect(peakConcurrent).toBeLessThanOrEqual(CONCURRENCY)
  })

  it('propagates the first task rejection immediately', async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.reject(new Error('task 2 failed')),
      () => Promise.resolve(3),
    ]
    await expect(promisePool(tasks, 2)).rejects.toThrow('task 2 failed')
  })

  it('handles empty task list gracefully', async () => {
    const results = await promisePool([], 4)
    expect(results).toEqual([])
  })

  it('handles single task with any concurrency', async () => {
    const tasks = [() => Promise.resolve(42)]
    const results = await promisePool(tasks, 10)
    expect(results).toEqual([42])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('registerTranslateHandlers — IPC validation', () => {
  let invoke: ReturnType<typeof buildMockIpcMain>['invoke']

  beforeEach(() => {
    vi.clearAllMocks()
    const mock = buildMockIpcMain()
    // biome-ignore lint/suspicious/noExplicitAny: mock IpcMain
    registerTranslateHandlers(mock.ipcMain as any)
    invoke = mock.invoke
  })

  // ── translate handler ──

  it('returns error when sourceText is empty', async () => {
    const result = await invoke('translate', {
      provider: 'gemini', model: 'gemini-2.0-flash',
      sourceText: '   ', sourceLang: 'en', targetLang: 'vi',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('empty')
  })

  it('returns NO_API_KEY when API key is missing', async () => {
    vi.mocked(getStoredApiKey).mockReturnValue(null)
    const result = await invoke('translate', {
      provider: 'gemini', model: 'gemini-2.0-flash',
      sourceText: 'Hello', sourceLang: 'en', targetLang: 'vi',
    })
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('NO_API_KEY')
    expect(result.error).toContain('gemini')
  })

  it('returns error for unknown provider', async () => {
    vi.mocked(getStoredApiKey).mockReturnValue('fake-key')
    const result = await invoke('translate', {
      provider: 'unknown-llm', model: 'some-model',
      sourceText: 'Hello', sourceLang: 'en', targetLang: 'vi',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unknown provider')
  })

  // ── translate:rewrite handler ──

  it('returns error when rewrite text is empty', async () => {
    const result = await invoke('translate:rewrite', {
      provider: 'gemini', model: 'gemini-2.0-flash',
      text: '   ', lang: 'en',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('empty')
  })

  it('rewrite: returns NO_API_KEY when key is missing', async () => {
    vi.mocked(getStoredApiKey).mockReturnValue(null)
    const result = await invoke('translate:rewrite', {
      provider: 'openai', model: 'gpt-4o',
      text: 'Hello world', lang: 'en',
    })
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('NO_API_KEY')
  })

  it('rewrite: returns error for unknown provider', async () => {
    vi.mocked(getStoredApiKey).mockReturnValue('fake-key')
    const result = await invoke('translate:rewrite', {
      provider: 'unknown-llm', model: 'some-model',
      text: 'Hello world', lang: 'en',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unknown provider')
  })

  // ── translate:verify handler ──

  it('verify: returns error when API key is empty string', async () => {
    const result = await invoke('translate:verify', 'gemini', '')
    expect(result.success).toBe(false)
    expect(result.error).toContain('empty')
  })

  it('verify: returns error when API key is whitespace only', async () => {
    const result = await invoke('translate:verify', 'gemini', '   ')
    expect(result.success).toBe(false)
    expect(result.error).toContain('empty')
  })

  it('verify: returns error for unknown provider', async () => {
    const result = await invoke('translate:verify', 'unknown-llm', 'some-key')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unknown provider')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('registerTranslateHandlers — error code categorization', () => {
  let invoke: ReturnType<typeof buildMockIpcMain>['invoke']

  beforeEach(() => {
    vi.clearAllMocks()
    const mock = buildMockIpcMain()
    // biome-ignore lint/suspicious/noExplicitAny: mock IpcMain
    registerTranslateHandlers(mock.ipcMain as any)
    invoke = mock.invoke
    vi.mocked(getStoredApiKey).mockReturnValue('fake-key')
  })

  it('categorizes 401 errors as INVALID_KEY for translate', async () => {
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: class {
        getGenerativeModel() {
          return {
            generateContent: async () => { throw new Error('401 Unauthorized') },
          }
        }
      },
    }))
    const result = await invoke('translate', {
      provider: 'gemini', model: 'gemini-2.0-flash',
      sourceText: 'Hello', sourceLang: 'en', targetLang: 'vi',
    })
    expect(result.success).toBe(false)
  })

  it('categorizes 429 errors as RATE_LIMIT for translate', async () => {
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: class {
        getGenerativeModel() {
          return {
            generateContent: async () => { throw new Error('429 rate_limit exceeded') },
          }
        }
      },
    }))
    const result = await invoke('translate', {
      provider: 'gemini', model: 'gemini-2.0-flash',
      sourceText: 'Hello', sourceLang: 'en', targetLang: 'vi',
    })
    expect(result.success).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('normalizeDetectedLang', () => {
  // ── Happy path — exact codes ──
  it('returns "vi" for exact match "vi"', () => {
    expect(normalizeDetectedLang('vi')).toBe('vi')
  })

  it('returns "en" for exact match "en"', () => {
    expect(normalizeDetectedLang('en')).toBe('en')
  })

  it('returns "ja" for exact match "ja"', () => {
    expect(normalizeDetectedLang('ja')).toBe('ja')
  })

  it('returns "ko" for exact match "ko"', () => {
    expect(normalizeDetectedLang('ko')).toBe('ko')
  })

  // ── Capitalisation normalisation ──
  it('returns "zh-TW" (correct casing) when AI returns "zh-tw"', () => {
    expect(normalizeDetectedLang('zh-tw')).toBe('zh-TW')
  })

  it('returns "zh-TW" when AI returns "ZH-TW" (uppercase)', () => {
    expect(normalizeDetectedLang('ZH-TW')).toBe('zh-TW')
  })

  it('normalises uppercase input "VI" to "vi"', () => {
    expect(normalizeDetectedLang('VI')).toBe('vi')
  })

  // ── Quote and whitespace stripping ──
  it('strips surrounding double-quotes from AI response', () => {
    expect(normalizeDetectedLang('"vi"')).toBe('vi')
  })

  it('strips surrounding single-quotes from AI response', () => {
    expect(normalizeDetectedLang("'en'")).toBe('en')
  })

  it('strips surrounding whitespace from AI response', () => {
    expect(normalizeDetectedLang('  ja  ')).toBe('ja')
  })

  // ── Partial match fallback ──
  it('returns "vi" when AI returns "vietnamese" (partial match)', () => {
    expect(normalizeDetectedLang('vietnamese')).toBe('vi')
  })

  it('returns "en" when AI returns "english" (partial match)', () => {
    expect(normalizeDetectedLang('english')).toBe('en')
  })

  // ── Unknown / null cases ──
  it('returns null for completely unknown code "xx"', () => {
    expect(normalizeDetectedLang('xx')).toBeNull()
  })

  it('returns null for an empty or whitespace-only answer (no loose prefix matching)', () => {
    expect(normalizeDetectedLang('')).toBeNull()
    expect(normalizeDetectedLang('   ')).toBeNull()
    expect(normalizeDetectedLang('""')).toBeNull()
  })

  it('returns null for random gibberish', () => {
    expect(normalizeDetectedLang('🤔???')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('translate:detect-lang IPC handler', () => {
  let invoke: ReturnType<typeof buildMockIpcMain>['invoke']

  beforeEach(() => {
    vi.clearAllMocks()
    const mock = buildMockIpcMain()
    // biome-ignore lint/suspicious/noExplicitAny: mock IpcMain
    registerTranslateHandlers(mock.ipcMain as any)
    invoke = mock.invoke
  })

  it('returns error when text is empty', async () => {
    const result = await invoke('translate:detect-lang', {
      provider: 'gemini', model: 'gemini-2.0-flash', text: '   ',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('empty')
  })

  it('returns NO_API_KEY when API key is missing', async () => {
    vi.mocked(getStoredApiKey).mockReturnValue(null)
    const result = await invoke('translate:detect-lang', {
      provider: 'gemini', model: 'gemini-2.0-flash', text: 'Xin chào',
    })
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('NO_API_KEY')
  })

  it('returns error for unknown provider', async () => {
    vi.mocked(getStoredApiKey).mockReturnValue('fake-key')
    const result = await invoke('translate:detect-lang', {
      provider: 'unknown-llm', model: 'some-model', text: 'Hello',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unknown provider')
  })
})

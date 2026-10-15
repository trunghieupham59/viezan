// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../storage', () => ({
  getStoredApiKey: vi.fn(),
}))
vi.mock('../localAi', () => ({
  discoverLocalAiRuntimes: vi.fn(),
  getLocalAiStaticModels: vi.fn(() => []),
  isLocalProvider: (provider: string) => provider === 'local',
}))
const openAiList = vi.fn()
vi.mock('openai', () => ({
  default: class {
    models = { list: openAiList }
  },
}))

import {
  isGeminiTextTranslationModel,
  isLatestAlias,
  parseModelVersion,
  registerModelsHandlers,
  scoreModelForTranslation,
  selectTopModels,
} from '../models'
import { getStoredApiKey } from '../storage'
import { buildMockIpcMain } from './helpers/mockIpcMain'

const ids = (models: Array<{ id: string }>) => models.map((m) => m.id)
const model = (id: string) => ({ id })

describe('parseModelVersion', () => {
  it('parses Claude versions in both naming schemes', () => {
    expect(parseModelVersion('claude-3-5-haiku-20241022')).toBe(3.5)
    expect(parseModelVersion('claude-3-haiku-20240307')).toBe(3)
    expect(parseModelVersion('claude-haiku-4-5')).toBe(4.5)
    expect(parseModelVersion('claude-haiku-4-5-20251001')).toBe(4.5)
    expect(parseModelVersion('claude-sonnet-4-20250514')).toBe(4)
    expect(parseModelVersion('claude-opus-4-1-20250805')).toBe(4.1)
  })

  it('parses Gemini and GPT versions and ignores snapshot dates', () => {
    expect(parseModelVersion('gemini-2.5-flash')).toBe(2.5)
    expect(parseModelVersion('gemini-3-pro-preview')).toBe(3)
    expect(parseModelVersion('gpt-4o-2024-08-06')).toBe(4)
    expect(parseModelVersion('gpt-4.1-mini-2025-04-14')).toBe(4.1)
    expect(parseModelVersion('gpt-5-mini-2025-08-07')).toBe(5)
    expect(parseModelVersion('gpt-4-0613')).toBe(4)
    expect(parseModelVersion('gemini-flash-latest')).toBe(0)
  })
})

describe('scoreModelForTranslation', () => {
  it('scores new-style claude-haiku-4-5 above claude-3-5-haiku', () => {
    const next = scoreModelForTranslation('claude', 'claude-haiku-4-5-20251001')
    const old = scoreModelForTranslation('claude', 'claude-3-5-haiku-20241022')
    expect(next).toBeGreaterThan(old)
  })

  it('scores claude-sonnet-4-5 above claude-3-5-sonnet and keeps haiku above sonnet', () => {
    expect(scoreModelForTranslation('claude', 'claude-sonnet-4-5')).toBeGreaterThan(
      scoreModelForTranslation('claude', 'claude-3-5-sonnet-20241022'),
    )
    expect(scoreModelForTranslation('claude', 'claude-haiku-4-5')).toBeGreaterThan(
      scoreModelForTranslation('claude', 'claude-sonnet-4-5'),
    )
  })

  it('does not let a dated snapshot ("-2025-04-14") earn the GPT-4 family bonus', () => {
    const snapshot = scoreModelForTranslation('openai', 'gpt-5-2025-04-14')
    const plain = scoreModelForTranslation('openai', 'gpt-5')
    expect(snapshot).toBe(plain)
    expect(scoreModelForTranslation('openai', 'gpt-5-mini-2025-04-14')).toBe(
      scoreModelForTranslation('openai', 'gpt-5-mini'),
    )
  })

  it('keeps the existing OpenAI tiers', () => {
    expect(scoreModelForTranslation('openai', 'gpt-4o-mini')).toBeGreaterThan(scoreModelForTranslation('openai', 'gpt-4o'))
    expect(scoreModelForTranslation('openai', 'gpt-4o')).toBeGreaterThan(scoreModelForTranslation('openai', 'gpt-4-turbo'))
    expect(scoreModelForTranslation('openai', 'gpt-4-turbo')).toBeGreaterThan(scoreModelForTranslation('openai', 'gpt-3.5-turbo'))
    expect(scoreModelForTranslation('openai', 'o3-mini')).toBe(0)
  })

  it('keeps Gemini flash above pro and penalises lite', () => {
    expect(scoreModelForTranslation('gemini', 'gemini-2.5-flash')).toBeGreaterThan(scoreModelForTranslation('gemini', 'gemini-2.5-pro'))
    expect(scoreModelForTranslation('gemini', 'gemini-2.5-flash')).toBeGreaterThan(scoreModelForTranslation('gemini', 'gemini-2.5-flash-lite'))
  })
})

describe('Gemini text-translation filter', () => {
  it('excludes image, TTS, embedding and experimental models', () => {
    expect(isGeminiTextTranslationModel('gemini-2.5-flash-image')).toBe(false)
    expect(isGeminiTextTranslationModel('gemini-3-pro-image-preview')).toBe(false)
    expect(isGeminiTextTranslationModel('gemini-2.5-flash-preview-tts')).toBe(false)
    expect(isGeminiTextTranslationModel('gemini-embedding-001')).toBe(false)
    expect(isGeminiTextTranslationModel('gemini-2.0-flash-exp')).toBe(false)
    expect(isGeminiTextTranslationModel('imagen-4')).toBe(false)
  })

  it('keeps regular and preview text models', () => {
    expect(isGeminiTextTranslationModel('gemini-2.5-flash')).toBe(true)
    expect(isGeminiTextTranslationModel('gemini-2.5-flash-lite')).toBe(true)
    expect(isGeminiTextTranslationModel('gemini-3-pro-preview')).toBe(true)
  })
})

describe('selectTopModels', () => {
  it('detects -latest aliases', () => {
    expect(isLatestAlias('gemini-flash-latest')).toBe(true)
    expect(isLatestAlias('gpt-5-chat-latest')).toBe(true)
    expect(isLatestAlias('gemini-2.5-flash')).toBe(false)
  })

  it('orders by parsed version then id, not lexicographically', () => {
    const picked = selectTopModels(
      ['gpt-4o', 'gpt-5', 'gpt-4.1', 'gpt-4-turbo', 'gpt-5.1', 'gpt-3.5-turbo'].map(model),
      6,
    )
    expect(ids(picked)).toEqual(['gpt-5.1', 'gpt-5', 'gpt-4o', 'gpt-4.1', 'gpt-4-turbo', 'gpt-3.5-turbo'].sort((a, b) => parseModelVersion(b) - parseModelVersion(a) || b.localeCompare(a)))
    expect(ids(picked)[0]).toBe('gpt-5.1')
  })

  it('does not let -latest aliases take slots from numbered models', () => {
    const numbered = Array.from({ length: 10 }, (_, i) => model(`gemini-2.${i}-flash`))
    const picked = selectTopModels([model('gemini-flash-latest'), model('gemini-pro-latest'), ...numbered], 10)
    expect(picked).toHaveLength(10)
    expect(ids(picked).some(isLatestAlias)).toBe(false)
  })

  it('keeps aliases only when room remains, after the numbered models', () => {
    const picked = selectTopModels([model('gemini-flash-latest'), model('gemini-2.5-flash'), model('gemini-2.5-pro')], 10)
    expect(ids(picked).slice(0, 2).every((id) => !isLatestAlias(id))).toBe(true)
    expect(ids(picked)[2]).toBe('gemini-flash-latest')
  })

  it('respects the limit', () => {
    expect(selectTopModels(Array.from({ length: 30 }, (_, i) => model(`gpt-4.${i}`)), 12)).toHaveLength(12)
  })
})

describe('models:fetch handler', () => {
  let invoke: ReturnType<typeof buildMockIpcMain>['invoke']
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    const mock = buildMockIpcMain()
    // biome-ignore lint/suspicious/noExplicitAny: mock IpcMain
    registerModelsHandlers(mock.ipcMain as any)
    invoke = mock.invoke
    vi.mocked(getStoredApiKey).mockReturnValue('SECRET-KEY')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  function geminiList(names: string[]) {
    return {
      ok: true,
      json: async () => ({
        models: names.map((name) => ({ name: `models/${name}`, displayName: name, supportedGenerationMethods: ['generateContent'] })),
      }),
    }
  }

  it('sends the Gemini key in x-goog-api-key, never in the URL, with an abort signal', async () => {
    fetchMock.mockResolvedValue(geminiList(['gemini-2.5-flash']))
    const result = await invoke('models:fetch', 'gemini')
    expect(result.success).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).not.toContain('SECRET-KEY')
    expect(String(url)).not.toContain('key=')
    expect(init.headers['x-goog-api-key']).toBe('SECRET-KEY')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('filters image models, caps at 10 and keeps numbered models ahead of -latest aliases', async () => {
    fetchMock.mockResolvedValue(geminiList([
      'gemini-flash-latest',
      'gemini-pro-latest',
      'gemini-2.5-flash-image',
      'gemini-3-pro-image-preview',
      ...Array.from({ length: 12 }, (_, i) => `gemini-${i + 1}-flash`),
    ]))
    const result = await invoke('models:fetch', 'gemini')
    expect(result.models).toHaveLength(10)
    const returned = ids(result.models)
    expect(returned.some((id: string) => id.includes('-image'))).toBe(false)
    expect(returned.some(isLatestAlias)).toBe(false)
    expect(returned[0]).toBe('gemini-12-flash')
  })

  it('times out a stalled Gemini request and reports an error instead of hanging', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })))
      }),
    )
    const pending = invoke('models:fetch', 'gemini')
    await vi.advanceTimersByTimeAsync(10_001)
    const result = await pending
    expect(result.success).toBe(false)
    expect(result.error).toContain('timed out')
    expect(result.models).toEqual([])
  })

  it('caps OpenAI models at 12 using version order', async () => {
    openAiList.mockResolvedValue({
      data: [
        ...Array.from({ length: 14 }, (_, i) => ({ id: `gpt-4.${i}` })),
        { id: 'gpt-5.2' },
        { id: 'gpt-5-chat-latest' },
        { id: 'gpt-image-1' },
        { id: 'text-embedding-3-small' },
      ],
    })
    const result = await invoke('models:fetch', 'openai')
    expect(result.models).toHaveLength(12)
    const returned = ids(result.models)
    expect(returned[0]).toBe('gpt-5.2')
    expect(returned).not.toContain('gpt-5-chat-latest')
    expect(returned).not.toContain('gpt-image-1')
  })
})

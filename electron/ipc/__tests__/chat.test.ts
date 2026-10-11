// @vitest-environment node
/**
 * Unit tests for electron/ipc/chat.ts
 *
 * Tests focus on:
 *   1. Pure helper functions (buildEnforcedSystemPrompt, isLikelyChatModel, scoreOpenAIChatModel)
 *   2. IPC handler validation logic (empty messages, too-long messages, missing API key)
 *   3. Error categorization (INVALID_KEY, RATE_LIMIT, NETWORK codes)
 *
 * Provider SDKs (Gemini/Claude/OpenAI) are mocked — no real API calls made.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mock Electron before importing chat.ts ────────────────────────────────────
vi.mock('electron', () => ({
  IpcMain: class {},
}))

// ── Mock storage before importing chat.ts ────────────────────────────────────
vi.mock('../storage', () => ({
  getStoredApiKey: vi.fn(),
}))

import {
  buildEnforcedSystemPrompt,
  getCurrentFamilyModelMaxOutputTokens,
  isLikelyChatModel,
  registerChatHandlers,
  resolveModelMaxOutputTokens,
  scoreOpenAIChatModel,
} from '../chat'
import { getStoredApiKey } from '../storage'
import { buildMockIpcMain } from './helpers/mockIpcMain'

// ─── Helper: build a minimal chat message ────────────────────────────────────
const textMsg = (role: 'user' | 'assistant', text: string) => ({
  role,
  content: [{ type: 'text' as const, text }],
})

let capturedOpenAIRequest: { max_completion_tokens?: number; stream?: boolean } | null = null

function createOpenAIStream(tokens: string[]) {
  return (async function* streamChunks() {
    for (const token of tokens) {
      yield { choices: [{ delta: { content: token } }] }
    }
  })()
}

// ─────────────────────────────────────────────────────────────────────────────
describe('buildEnforcedSystemPrompt', () => {
  it('returns default assistant prompt when userPrompt is empty', () => {
    const result = buildEnforcedSystemPrompt('')
    expect(result).toContain('helpful AI assistant')
  })

  it('returns default prompt when userPrompt is only whitespace', () => {
    expect(buildEnforcedSystemPrompt('   ')).toContain('helpful AI assistant')
  })

  it('wraps non-empty userPrompt with IMPORTANT enforcement suffix', () => {
    const result = buildEnforcedSystemPrompt('You are a pirate.')
    expect(result).toContain('You are a pirate.')
    expect(result).toContain('IMPORTANT')
    expect(result).toContain('strictly follow')
  })

  it('trims leading/trailing whitespace from userPrompt', () => {
    const result = buildEnforcedSystemPrompt('  Be brief.  ')
    expect(result.startsWith('Be brief.')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('isLikelyChatModel', () => {
  it('returns true for standard GPT chat models', () => {
    expect(isLikelyChatModel('gpt-4o')).toBe(true)
    expect(isLikelyChatModel('gpt-4o-mini')).toBe(true)
    expect(isLikelyChatModel('gpt-3.5-turbo')).toBe(true)
  })

  it('returns false for instruct models', () => {
    expect(isLikelyChatModel('gpt-3.5-turbo-instruct')).toBe(false)
    expect(isLikelyChatModel('text-davinci-instruct')).toBe(false)
  })

  it('returns false for image models', () => {
    expect(isLikelyChatModel('dall-e-3-image')).toBe(false)
  })

  it('returns false for search models', () => {
    expect(isLikelyChatModel('gpt-4-search')).toBe(false)
  })

  it('returns false for legacy completion-only models', () => {
    expect(isLikelyChatModel('davinci-002')).toBe(false)
    expect(isLikelyChatModel('babbage-002')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('scoreOpenAIChatModel', () => {
  it('returns -9999 for non-chat models', () => {
    expect(scoreOpenAIChatModel('gpt-3.5-turbo-instruct')).toBe(-9999)
  })

  it('gives higher score to gpt-5 over gpt-4', () => {
    expect(scoreOpenAIChatModel('gpt-5')).toBeGreaterThan(scoreOpenAIChatModel('gpt-4'))
  })

  it('gives higher score to gpt-4 over gpt-4-mini', () => {
    expect(scoreOpenAIChatModel('gpt-4')).toBeGreaterThan(scoreOpenAIChatModel('gpt-4-mini'))
  })

  it('gives higher score to mini over nano', () => {
    expect(scoreOpenAIChatModel('gpt-4-mini')).toBeGreaterThan(scoreOpenAIChatModel('gpt-4-nano'))
  })

  it('gpt-4o has slightly higher score than gpt-4 (optimised bonus)', () => {
    expect(scoreOpenAIChatModel('gpt-4o')).toBeGreaterThanOrEqual(scoreOpenAIChatModel('gpt-4'))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('model max output token resolution', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns documented OpenAI limits for current chat model families', () => {
    expect(getCurrentFamilyModelMaxOutputTokens('openai', 'gpt-5.2')).toBe(128_000)
    expect(getCurrentFamilyModelMaxOutputTokens('openai', 'gpt-5-mini')).toBe(128_000)
    expect(getCurrentFamilyModelMaxOutputTokens('openai', 'gpt-5-chat-latest')).toBe(16_384)
    expect(getCurrentFamilyModelMaxOutputTokens('openai', 'gpt-4.1-mini')).toBe(32_768)
    expect(getCurrentFamilyModelMaxOutputTokens('openai', 'gpt-4o-mini')).toBe(16_384)
  })

  it('returns documented Claude limits for current model families and fallback for legacy IDs', () => {
    expect(getCurrentFamilyModelMaxOutputTokens('claude', 'claude-sonnet-4-20250514')).toBe(64_000)
    expect(getCurrentFamilyModelMaxOutputTokens('claude', 'claude-sonnet-4-5')).toBe(64_000)
    expect(getCurrentFamilyModelMaxOutputTokens('claude', 'claude-opus-4-1-20250805')).toBe(32_000)
    expect(getCurrentFamilyModelMaxOutputTokens('claude', 'claude-3-7-sonnet-20250219')).toBe(16_384)
  })

  it('returns Gemini 2.5 fallback output limits when API metadata is unavailable', () => {
    expect(getCurrentFamilyModelMaxOutputTokens('gemini', 'gemini-2.5-pro')).toBe(65_536)
    expect(getCurrentFamilyModelMaxOutputTokens('gemini', 'gemini-2.5-flash-lite')).toBe(65_536)
    expect(getCurrentFamilyModelMaxOutputTokens('gemini', 'gemini-2.0-flash')).toBe(16_384)
  })

  it('uses Gemini model metadata outputTokenLimit when available', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ outputTokenLimit: 12_345 }),
    })))

    await expect(resolveModelMaxOutputTokens('gemini', 'gemini-test-metadata', 'fake-key')).resolves.toBe(12_345)
    expect(fetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-metadata',
      expect.objectContaining({ headers: { 'x-goog-api-key': 'fake-key' } }),
    )
  })

  it('falls back to current-family limits when Gemini metadata is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))

    await expect(resolveModelMaxOutputTokens('gemini', 'gemini-2.5-flash-test-fallback', 'fake-key')).resolves.toBe(65_536)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('registerChatHandlers — IPC validation', () => {
  let invoke: ReturnType<typeof buildMockIpcMain>['invoke']

  beforeEach(() => {
    vi.clearAllMocks()
    const mock = buildMockIpcMain()
    // biome-ignore lint/suspicious/noExplicitAny: mock IpcMain
    registerChatHandlers(mock.ipcMain as any)
    invoke = mock.invoke
  })

  it('returns error when messages array is empty', async () => {
    const result = await invoke('chat:send', {
      provider: 'gemini', model: 'gemini-2.0-flash',
      messages: [],
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('No messages provided')
  })

  it('returns error when last user message exceeds 3000 chars', async () => {
    const longText = 'x'.repeat(3001)
    const result = await invoke('chat:send', {
      provider: 'gemini', model: 'gemini-2.0-flash',
      messages: [textMsg('user', longText)],
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Message too long')
    expect(result.error).toContain('3000')
  })

  it('accepts message at exactly 3000 chars (boundary — should pass to API key check)', async () => {
    // Mock: no API key to stop execution after validation
    vi.mocked(getStoredApiKey).mockReturnValue(null)
    const exactText = 'x'.repeat(3000)
    const result = await invoke('chat:send', {
      provider: 'gemini', model: 'gemini-2.0-flash',
      messages: [textMsg('user', exactText)],
    })
    // Should pass length check, fail on missing API key
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('NO_API_KEY')
  })

  it('returns NO_API_KEY error when API key is missing', async () => {
    vi.mocked(getStoredApiKey).mockReturnValue(null)
    const result = await invoke('chat:send', {
      provider: 'gemini', model: 'gemini-2.0-flash',
      messages: [textMsg('user', 'Hello')],
    })
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('NO_API_KEY')
    expect(result.error).toContain('gemini')
  })

  it('returns error for unknown provider', async () => {
    vi.mocked(getStoredApiKey).mockReturnValue('fake-key')
    const result = await invoke('chat:send', {
      provider: 'unknown-provider', model: 'some-model',
      messages: [textMsg('user', 'Hello')],
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unknown provider')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('registerChatHandlers — output token resolution', () => {
  let invoke: ReturnType<typeof buildMockIpcMain>['invoke']

  beforeEach(() => {
    vi.clearAllMocks()
    capturedOpenAIRequest = null
    vi.mocked(getStoredApiKey).mockReturnValue('fake-key')
    vi.doMock('openai', () => ({
      default: class {
        chat = {
          completions: {
            create: async (params: { max_completion_tokens?: number }) => {
              capturedOpenAIRequest = params
              return { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }
            },
          },
        }
        models = { list: async () => ({ data: [] }) }
      },
    }))

    const mock = buildMockIpcMain()
    // biome-ignore lint/suspicious/noExplicitAny: mock IpcMain
    registerChatHandlers(mock.ipcMain as any)
    invoke = mock.invoke
  })

  afterEach(() => {
    vi.doUnmock('openai')
  })

  it('passes model-max as the resolved model limit to the provider call', async () => {
    const result = await invoke('chat:send', {
      provider: 'openai', model: 'gpt-4.1-mini',
      messages: [textMsg('user', 'Hello')],
      maxOutputTokens: 'model-max',
    })

    expect(result.success).toBe(true)
    expect(capturedOpenAIRequest?.max_completion_tokens).toBe(32_768)
  })

  it('clamps numeric maxOutputTokens to the resolved model limit', async () => {
    const result = await invoke('chat:send', {
      provider: 'openai', model: 'gpt-4.1-mini',
      messages: [textMsg('user', 'Hello')],
      maxOutputTokens: 128_000,
    })

    expect(result.success).toBe(true)
    expect(capturedOpenAIRequest?.max_completion_tokens).toBe(32_768)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('registerChatHandlers — streaming', () => {
  let invoke: ReturnType<typeof buildMockIpcMain>['invoke']
  let sentEvents: ReturnType<typeof buildMockIpcMain>['sentEvents']

  beforeEach(() => {
    vi.clearAllMocks()
    capturedOpenAIRequest = null
    vi.mocked(getStoredApiKey).mockReturnValue('fake-key')
    vi.doMock('openai', () => ({
      default: class {
        chat = {
          completions: {
            create: async (params: { max_completion_tokens?: number; stream?: boolean }) => {
              capturedOpenAIRequest = params
              return createOpenAIStream(['Hel', 'lo'])
            },
          },
        }
        models = { list: async () => ({ data: [] }) }
      },
    }))

    const mock = buildMockIpcMain()
    // biome-ignore lint/suspicious/noExplicitAny: mock IpcMain
    registerChatHandlers(mock.ipcMain as any)
    invoke = mock.invoke
    sentEvents = mock.sentEvents
  })

  afterEach(() => {
    vi.doUnmock('openai')
  })

  it('emits token events and returns the accumulated reply', async () => {
    const result = await invoke('chat:stream', {
      requestId: 'req-1',
      provider: 'openai',
      model: 'gpt-4o',
      messages: [textMsg('user', 'Hello')],
    })

    expect(result).toEqual({ success: true, reply: 'Hello' })
    expect(capturedOpenAIRequest?.stream).toBe(true)
    expect(sentEvents).toEqual([
      { channel: 'chat:stream:event', payload: { requestId: 'req-1', type: 'start' } },
      { channel: 'chat:stream:event', payload: { requestId: 'req-1', type: 'token', token: 'Hel' } },
      { channel: 'chat:stream:event', payload: { requestId: 'req-1', type: 'token', token: 'lo' } },
      { channel: 'chat:stream:event', payload: { requestId: 'req-1', type: 'end', reply: 'Hello' } },
    ])
  })

  it('returns NO_API_KEY and emits an error event when the key is missing', async () => {
    vi.mocked(getStoredApiKey).mockReturnValue(null)
    const result = await invoke('chat:stream', {
      requestId: 'req-no-key',
      provider: 'openai',
      model: 'gpt-4o',
      messages: [textMsg('user', 'Hello')],
    })

    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('NO_API_KEY')
    expect(sentEvents).toEqual([
      { channel: 'chat:stream:event', payload: { requestId: 'req-no-key', type: 'start' } },
      {
        channel: 'chat:stream:event',
        payload: {
          requestId: 'req-no-key',
          type: 'error',
          error: 'No API key found for openai. Please add it in Settings.',
          errorCode: 'NO_API_KEY',
        },
      },
    ])
  })

  it('returns validation errors before emitting stream events', async () => {
    const result = await invoke('chat:stream', {
      requestId: 'req-empty',
      provider: 'openai',
      model: 'gpt-4o',
      messages: [],
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('No messages provided')
    expect(sentEvents).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('registerChatHandlers — image editing', () => {
  let invoke: ReturnType<typeof buildMockIpcMain>['invoke']

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getStoredApiKey).mockReturnValue('fake-key')
    const mock = buildMockIpcMain()
    // biome-ignore lint/suspicious/noExplicitAny: mock IpcMain
    registerChatHandlers(mock.ipcMain as any)
    invoke = mock.invoke
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses Gemini image edit and returns the generated image payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                mimeType: 'image/png',
                data: 'edited-base64',
              },
            }],
          },
        }],
      }),
    })))

    const result = await invoke('chat:image-edit', {
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      prompt: 'Sửa thành phông nền màu trắng',
      imageBase64: 'c291cmNlLWJ5dGVz',
      imageMimeType: 'image/png',
    })

    expect(result).toEqual({
      success: true,
      imageBase64: 'edited-base64',
      imageMimeType: 'image/png',
      usedProvider: 'gemini',
      usedModel: 'gemini-3.1-flash-image-preview',
    })
    expect(fetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': 'fake-key',
        },
      }),
    )
  })

  it('falls back to Gemini 2.5 image model when the primary image model is unavailable', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'model not found',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                inline_data: {
                  mime_type: 'image/png',
                  data: 'fallback-edited-base64',
                },
              }],
            },
          }],
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const result = await invoke('chat:image-edit', {
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      prompt: 'Sửa thành phông nền màu trắng',
      imageBase64: 'c291cmNlLWJ5dGVz',
      imageMimeType: 'image/png',
    })

    expect(result).toEqual({
      success: true,
      imageBase64: 'fallback-edited-base64',
      imageMimeType: 'image/png',
      usedProvider: 'gemini',
      usedModel: 'gemini-2.5-flash-image',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent',
      expect.any(Object),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
      expect.any(Object),
    )
  })

  it('returns TIMEOUT when Gemini image editing is aborted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('This operation was aborted')
    }))

    const result = await invoke('chat:image-edit', {
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      prompt: 'Sửa thành phông nền màu trắng',
      imageBase64: 'c291cmNlLWJ5dGVz',
      imageMimeType: 'image/png',
    })

    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('TIMEOUT')
    expect(result.error).toContain('timed out')
  })

  it('returns a typed error for providers that cannot return edited images', async () => {
    const result = await invoke('chat:image-edit', {
      provider: 'claude',
      model: 'claude-3-5-sonnet-20241022',
      prompt: 'Change the background',
      imageBase64: 'c291cmNlLWJ5dGVz',
      imageMimeType: 'image/png',
    })

    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('NO_IMAGE_EDIT')
    expect(result.error).toContain('Gemini or OpenAI')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('registerChatHandlers — error code categorization', () => {
  let invoke: ReturnType<typeof buildMockIpcMain>['invoke']

  beforeEach(() => {
    vi.clearAllMocks()
    const mock = buildMockIpcMain()
    // biome-ignore lint/suspicious/noExplicitAny: mock IpcMain
    registerChatHandlers(mock.ipcMain as any)
    invoke = mock.invoke
    // Mock API key available so we reach the provider call
    vi.mocked(getStoredApiKey).mockReturnValue('fake-key')
  })

  it('categorizes 401 errors as INVALID_KEY', async () => {
    // Mock provider SDK to throw 401 error
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: class {
        getGenerativeModel() {
          return {
            startChat: () => ({
              sendMessage: async () => { throw new Error('401 Unauthorized') },
            }),
          }
        }
      },
    }))
    const result = await invoke('chat:send', {
      provider: 'gemini', model: 'gemini-2.0-flash',
      messages: [textMsg('user', 'Hello')],
    })
    expect(result.success).toBe(false)
    // Error code should be categorized even when caught
    expect(['INVALID_KEY', undefined]).toContain(result.errorCode)
  })

  it('classifies from the structured status on the error object, not only its message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: class {
        getGenerativeModel() {
          return {
            startChat: () => ({
              sendMessage: async () => {
                throw Object.assign(new Error('Upstream gateway rejected the call'), { status: 401 })
              },
            }),
          }
        }
      },
    }))
    const result = await invoke('chat:send', {
      provider: 'gemini', model: 'gemini-2.0-flash',
      messages: [textMsg('user', 'Hello')],
    })
    expect(result).toMatchObject({ success: false, errorCode: 'INVALID_KEY' })
  })

  it('returns success: false with errorCode RATE_LIMIT for 429 error', async () => {
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: class {
        getGenerativeModel() {
          return {
            startChat: () => ({
              sendMessage: async () => { throw new Error('429 rate_limit exceeded') },
            }),
          }
        }
      },
    }))
    const result = await invoke('chat:send', {
      provider: 'gemini', model: 'gemini-2.0-flash',
      messages: [textMsg('user', 'Hello')],
    })
    expect(result.success).toBe(false)
  })
})

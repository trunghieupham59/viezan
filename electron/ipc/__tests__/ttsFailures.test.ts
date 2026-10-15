// @vitest-environment node
/**
 * TTS failure classification, Edge truncation handling, and provider timeouts.
 * Providers are mocked; no network calls are made.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  speechCreate: vi.fn(),
  fetch: vi.fn(),
  // Scripts how the fake Edge WebSocket behaves for the next connection.
  // biome-ignore lint/suspicious/noExplicitAny: scripted test double
  edgeScript: { run: (_ws: any) => {} } as { run: (ws: any) => void },
}))

vi.mock('electron', () => ({ IpcMain: class {} }))
vi.mock('../storage', () => ({ getStoredApiKey: vi.fn() }))
vi.mock('openai', () => ({
  default: class MockOpenAI {
    audio = { speech: { create: mocks.speechCreate } }
  },
}))
vi.mock('ws', () => ({
  default: class MockWebSocket {
    // biome-ignore lint/suspicious/noExplicitAny: scripted test double
    handlers: Record<string, Array<(...args: any[]) => void>> = {}
    constructor() {
      queueMicrotask(() => mocks.edgeScript.run(this))
    }
    // biome-ignore lint/suspicious/noExplicitAny: scripted test double
    on(event: string, cb: (...args: any[]) => void) {
      const list = this.handlers[event] ?? []
      list.push(cb)
      this.handlers[event] = list
    }
    // biome-ignore lint/suspicious/noExplicitAny: scripted test double
    emit(event: string, ...args: any[]) {
      for (const cb of this.handlers[event] ?? []) cb(...args)
    }
    send() {}
    terminate() {}
    close() {
      this.emit('close')
    }
  },
}))

import { getStoredApiKey } from '../storage'
import { classifyTtsProviderFailure, parseTtsParams, registerTtsHandlers } from '../tts'
import { buildMockIpcMain } from './helpers/mockIpcMain'

function audioFrame(): Buffer {
  // 2-byte header length (0) + 3 bytes of "audio"
  return Buffer.concat([Buffer.from([0, 0]), Buffer.from([1, 2, 3])])
}

describe('classifyTtsProviderFailure', () => {
  it('never treats Edge failures as hard failures', () => {
    expect(classifyTtsProviderFailure('edge', new Error('Unexpected server response: 403'))).toBeNull()
    expect(classifyTtsProviderFailure('edge', new Error('Unexpected server response: 429'))).toBeNull()
    expect(classifyTtsProviderFailure('edge', Object.assign(new Error('x'), { code: 'INVALID_KEY' }))).toBeNull()
  })

  it('uses structured codes/status for paid providers', () => {
    expect(classifyTtsProviderFailure('openai', Object.assign(new Error('x'), { status: 401 }))).toBe('INVALID_KEY')
    expect(classifyTtsProviderFailure('gemini', Object.assign(new Error('x'), { code: 'RATE_LIMIT' }))).toBe('RATE_LIMIT')
    expect(classifyTtsProviderFailure('elevenlabs', Object.assign(new Error('x'), { status: 500 }))).toBeNull()
  })

  it('does not match status numbers embedded in other text', () => {
    expect(classifyTtsProviderFailure('openai', new Error('payload 14290 bytes'))).toBeNull()
  })
})

describe('parseTtsParams', () => {
  it('enforces the text length cap and language validation', () => {
    expect(parseTtsParams({ text: 'a'.repeat(5_001) })).toMatchObject({ ok: false })
    expect(parseTtsParams({ text: 'hi', lang: '../etc' })).toMatchObject({ ok: false })
    expect(parseTtsParams({ text: 'hi', lang: 'en' })).toMatchObject({ ok: true })
  })
})

describe('TTS provider handling', () => {
  let invoke: ReturnType<typeof buildMockIpcMain>['invoke']

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mocks.fetch)
    const mock = buildMockIpcMain()
    // biome-ignore lint/suspicious/noExplicitAny: mock IpcMain
    registerTtsHandlers(mock.ipcMain as any)
    invoke = mock.invoke
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('falls through to the next provider when Edge is rejected with 403', async () => {
    vi.mocked(getStoredApiKey).mockImplementation(provider => provider === 'openai' ? 'openai-key' : null)
    mocks.edgeScript.run = ws => ws.emit('error', new Error('Unexpected server response: 403'))
    mocks.speechCreate.mockResolvedValue({ arrayBuffer: async () => new Uint8Array([9, 9]).buffer })

    const result = await invoke('audio:tts', { text: 'Hello', mode: 'auto' })

    expect(result).toMatchObject({ success: true, provider: 'openai' })
  })

  it('does not report an Edge 429 as a rate limit in free mode', async () => {
    vi.mocked(getStoredApiKey).mockReturnValue(null)
    mocks.edgeScript.run = ws => ws.emit('error', new Error('Unexpected server response: 429'))

    const result = await invoke('audio:tts', { text: 'Hello', mode: 'free' })

    expect(result).toMatchObject({ success: false, errorCode: 'NETWORK' })
  })

  it('fails when the Edge socket closes after partial audio without turn.end', async () => {
    vi.mocked(getStoredApiKey).mockReturnValue(null)
    mocks.edgeScript.run = ws => {
      ws.emit('message', audioFrame(), true)
      ws.emit('close')
    }

    const result = await invoke('audio:tts', { text: 'Hello', mode: 'free' })

    expect(result).toMatchObject({ success: false, errorCode: 'NETWORK' })
    expect(result).not.toHaveProperty('audioBase64')
  })

  it('succeeds when Edge audio completes with turn.end', async () => {
    vi.mocked(getStoredApiKey).mockReturnValue(null)
    mocks.edgeScript.run = ws => {
      ws.emit('message', audioFrame(), true)
      ws.emit('message', 'X-RequestId:1\r\nPath:turn.end\r\n\r\n{}', false)
    }

    const result = await invoke('audio:tts', { text: 'Hello', mode: 'free' })

    expect(result).toMatchObject({ success: true, provider: 'edge', mimeType: 'audio/mpeg' })
    expect(Buffer.from(result.audioBase64, 'base64')).toEqual(Buffer.from([1, 2, 3]))
  })

  it('sends the Gemini key in a header, not the URL', async () => {
    vi.mocked(getStoredApiKey).mockImplementation(provider => provider === 'gemini' ? 'gemini-secret' : null)
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: 'QUJD', mimeType: 'audio/wav' } }] } }] }),
    })

    const result = await invoke('audio:tts', { text: 'Hello', mode: 'premium' })

    expect(result).toMatchObject({ success: true, provider: 'gemini' })
    const [url, options] = mocks.fetch.mock.calls[0]
    expect(String(url)).not.toContain('gemini-secret')
    expect(String(url)).not.toContain('key=')
    expect(options.headers['x-goog-api-key']).toBe('gemini-secret')
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  it('aborts a hung paid-provider request after the timeout and falls back softly', async () => {
    vi.useFakeTimers()
    vi.mocked(getStoredApiKey).mockImplementation(provider => provider === 'elevenlabs' ? 'xi-key' : null)
    mocks.fetch.mockImplementation((_url: string, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      }))
    mocks.edgeScript.run = ws => ws.emit('error', new Error('edge down'))

    const pending = invoke('audio:tts', { text: 'Hello', mode: 'premium' })
    await vi.advanceTimersByTimeAsync(30_001)
    const result = await pending

    expect(result).toMatchObject({ success: false, errorCode: 'NETWORK' })
    expect(mocks.fetch).toHaveBeenCalledOnce()
  })

  it('gives Gemini TTS up to 60 s before aborting, unlike the 30 s default', async () => {
    vi.useFakeTimers()
    vi.mocked(getStoredApiKey).mockImplementation(provider => provider === 'gemini' ? 'gemini-key' : null)
    mocks.fetch.mockImplementation((_url: string, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      }))
    mocks.edgeScript.run = ws => ws.emit('error', new Error('edge down'))

    let settled = false
    const pending = invoke('audio:tts', { text: 'x'.repeat(5_000), mode: 'premium' })
    void pending.then(() => { settled = true })

    await vi.advanceTimersByTimeAsync(45_000)
    expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(false)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(15_001)
    expect(await pending).toMatchObject({ success: false, errorCode: 'NETWORK' })
    expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(true)
  })
})

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TranscribeAudioParams } from '../../../shared/audioTranscription'

const providerMocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  groqCreate: vi.fn(),
  openAiCreate: vi.fn(),
}))

vi.mock('electron', () => ({ IpcMain: class {} }))

vi.mock('../storage', () => ({
  getStoredApiKey: vi.fn(),
  hasStoredApiKey: vi.fn(),
}))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    audio: { transcriptions: { create: typeof providerMocks.openAiCreate } }

    // biome-ignore lint/suspicious/noExplicitAny: provider SDK constructor test double
    constructor(options: any) {
      this.audio = {
        transcriptions: {
          create: options.baseURL ? providerMocks.groqCreate : providerMocks.openAiCreate,
        },
      }
    }
  },
}))

import { getStoredApiKey, hasStoredApiKey } from '../storage'
import {
  classifySttBan,
  classifyTranscriptionError,
  getSttSessionStateForTests,
  MAX_TRANSCRIPTION_AUDIO_BYTES,
  registerTranscribeHandlers,
  resetSttSessionStateForTests,
} from '../transcribe'
import { buildMockIpcMain } from './helpers/mockIpcMain'

function makeParams(overrides: Partial<TranscribeAudioParams> = {}): TranscribeAudioParams {
  return {
    requestId: 'voice-request-1',
    purpose: 'dictation',
    audioData: new ArrayBuffer(1_000),
    mimeType: 'audio/webm;codecs=opus',
    language: undefined,
    previousText: undefined,
    sttProvider: 'auto',
    ...overrides,
  }
}

describe('audio transcription IPC', () => {
  let invoke: ReturnType<typeof buildMockIpcMain>['invoke']

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', providerMocks.fetch)
    vi.mocked(getStoredApiKey).mockReturnValue(null)
    vi.mocked(hasStoredApiKey).mockReturnValue(false)
    providerMocks.openAiCreate.mockResolvedValue({ text: 'hello', segments: [] })
    providerMocks.groqCreate.mockResolvedValue({ text: 'hello from Groq', segments: [] })
    providerMocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'hello from Gemini' }] } }] }),
    })

    const mock = buildMockIpcMain()
    // biome-ignore lint/suspicious/noExplicitAny: focused IPC test helper
    registerTranscribeHandlers(mock.ipcMain as any)
    invoke = mock.invoke
  })

  it('rejects malformed request IDs at the main-process boundary', async () => {
    const result = await invoke('audio:transcribe', makeParams({ requestId: '../unsafe' }))

    expect(result).toEqual({ success: false, errorCode: 'INVALID_INPUT', retryable: false })
  })

  it('rejects unsupported normalized audio MIME types', async () => {
    const result = await invoke('audio:transcribe', makeParams({ mimeType: 'audio/x-unknown' }))

    expect(result).toEqual({ success: false, errorCode: 'UNSUPPORTED_FORMAT', retryable: false })
  })

  it('rejects dictation recordings below the minimum payload size', async () => {
    const result = await invoke('audio:transcribe', makeParams({ audioData: new ArrayBuffer(999) }))

    expect(result).toEqual({ success: false, errorCode: 'AUDIO_TOO_SHORT', retryable: false })
  })

  it('rejects audio payloads above the 10 MiB hard cap', async () => {
    const result = await invoke('audio:transcribe', makeParams({
      audioData: new ArrayBuffer(MAX_TRANSCRIPTION_AUDIO_BYTES + 1),
    }))

    expect(result).toEqual({ success: false, errorCode: 'AUDIO_TOO_LARGE', retryable: false })
  })

  it('normalizes codec MIME suffixes and returns a discriminated success result', async () => {
    vi.mocked(getStoredApiKey).mockImplementation(provider => provider === 'openai' ? 'openai-key' : null)

    const result = await invoke('audio:transcribe', makeParams({ sttProvider: 'whisper' }))

    expect(result).toMatchObject({ success: true, text: 'hello', usedProvider: 'whisper' })
    expect(providerMocks.openAiCreate).toHaveBeenCalledOnce()
  })

  it('uses sequential dictation fallback and sends the Gemini key in a header', async () => {
    vi.mocked(getStoredApiKey).mockImplementation(provider => {
      if (provider === 'openai') return 'openai-key'
      if (provider === 'gemini') return 'gemini-key'
      if (provider === 'groq') return 'groq-key'
      return null
    })
    providerMocks.openAiCreate.mockRejectedValueOnce(new Error('401 invalid_api_key raw detail'))

    const result = await invoke('audio:transcribe', makeParams())

    expect(result).toEqual({ success: true, text: 'hello from Gemini', usedProvider: 'gemini' })
    expect(providerMocks.openAiCreate).toHaveBeenCalledOnce()
    expect(providerMocks.fetch).toHaveBeenCalledOnce()
    expect(providerMocks.groqCreate).not.toHaveBeenCalled()
    const [url, options] = providerMocks.fetch.mock.calls[0]
    expect(url).not.toContain('gemini-key')
    expect(options.headers).toMatchObject({ 'x-goog-api-key': 'gemini-key' })
  })

  it('never exposes raw provider error messages to the renderer', async () => {
    vi.mocked(getStoredApiKey).mockImplementation(provider => provider === 'openai' ? 'bad-key' : null)
    providerMocks.openAiCreate.mockRejectedValueOnce(new Error('401 raw-secret-provider-detail'))

    const result = await invoke('audio:transcribe', makeParams({ sttProvider: 'whisper' }))

    expect(result).toEqual({ success: false, errorCode: 'INVALID_KEY', retryable: false })
    expect(result).not.toHaveProperty('error')
    expect(JSON.stringify(result)).not.toContain('raw-secret-provider-detail')
  })

  it('distinguishes an unconfigured auto route from provider failures', async () => {
    const result = await invoke('audio:transcribe', makeParams())

    expect(result).toEqual({
      success: false,
      errorCode: 'ALL_PROVIDERS_EXHAUSTED',
      retryable: false,
    })
  })

  it('cancels an in-flight provider request by request ID', async () => {
    vi.mocked(getStoredApiKey).mockImplementation(provider => provider === 'openai' ? 'openai-key' : null)
    providerMocks.openAiCreate.mockImplementation((_body, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        const rejectAsAborted = () => {
          const error = new Error('request aborted')
          error.name = 'AbortError'
          reject(error)
        }
        if (options.signal.aborted) rejectAsAborted()
        else options.signal.addEventListener('abort', rejectAsAborted, { once: true })
      }))

    const pendingResult = invoke('audio:transcribe', makeParams({ sttProvider: 'whisper' }))
    await vi.waitFor(() => expect(providerMocks.openAiCreate).toHaveBeenCalledOnce())

    const cancelResult = await invoke('audio:cancelTranscription', { requestId: 'voice-request-1' })

    expect(cancelResult).toEqual({ success: true, cancelled: true })
    await expect(pendingResult).resolves.toEqual({
      success: false,
      errorCode: 'CANCELLED',
      retryable: false,
    })
  })
})

describe('live economy routing', () => {
  let invoke: ReturnType<typeof buildMockIpcMain>['invoke']
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    resetSttSessionStateForTests()
    vi.stubGlobal('fetch', providerMocks.fetch)
    vi.mocked(getStoredApiKey).mockReturnValue('test-only-key')
    const mock = buildMockIpcMain()
    registerTranscribeHandlers(mock.ipcMain as Parameters<typeof registerTranscribeHandlers>[0])
    invoke = mock.invoke
  })
  afterEach(() => { resetSttSessionStateForTests(); vi.useRealTimers(); vi.unstubAllGlobals() })

  it('does not hedge a slow successful recognizer or invent a decoder prompt', async () => {
    let finish!: (value: unknown) => void
    providerMocks.openAiCreate.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = invoke('audio:transcribe', makeParams({ purpose: 'live', liveRouting: 'economy', language: 'vi' }))
    await vi.advanceTimersByTimeAsync(1500)
    expect(providerMocks.fetch).not.toHaveBeenCalled()
    expect(providerMocks.groqCreate).not.toHaveBeenCalled()
    expect(providerMocks.openAiCreate.mock.calls[0][0].prompt).toBe('')
    finish({ text: 'Quyển sách này.', segments: [] })
    await expect(pending).resolves.toMatchObject({ success: true, usedProvider: 'whisper' })
  })

  it('falls back only after failure, filters Gemini thoughts and schedules no paid silence probe', async () => {
    providerMocks.openAiCreate.mockRejectedValue(Object.assign(new Error('rate limited'), { status: 429 }))
    providerMocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'Reasoning' }, { text: 'Quyển ' }, { text: 'sách này.' }] } }] }) })
    await expect(invoke('audio:transcribe', makeParams({ purpose: 'live', liveRouting: 'economy' }))).resolves.toMatchObject({ text: 'Quyển sách này.', usedProvider: 'gemini' })
    expect(providerMocks.openAiCreate).toHaveBeenCalledOnce()
    expect(providerMocks.fetch.mock.calls[0][0]).toContain('gemini-3.1-flash-lite')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(providerMocks.openAiCreate).toHaveBeenCalledOnce()
    expect(providerMocks.fetch).toHaveBeenCalledOnce()
    expect(providerMocks.groqCreate).not.toHaveBeenCalled()
  })

  it('does not interpret silent successful audio as a reason to pay another provider', async () => {
    providerMocks.openAiCreate.mockResolvedValue({ text: '', segments: [] })
    await expect(invoke('audio:transcribe', makeParams({ purpose: 'live', liveRouting: 'economy' }))).resolves.toMatchObject({ success: true, text: '' })
    expect(providerMocks.fetch).not.toHaveBeenCalled()
    expect(providerMocks.groqCreate).not.toHaveBeenCalled()
  })

  it('reports exhaustion when no configured provider can accept audio', async () => {
    vi.mocked(getStoredApiKey).mockReturnValue(null)
    await expect(invoke('audio:transcribe', makeParams({ purpose: 'live', liveRouting: 'economy' }))).resolves.toMatchObject({ success: false, errorCode: 'ALL_PROVIDERS_EXHAUSTED' })
    expect(providerMocks.openAiCreate).not.toHaveBeenCalled()
    expect(providerMocks.fetch).not.toHaveBeenCalled()
    expect(providerMocks.groqCreate).not.toHaveBeenCalled()
  })
})

describe('STT ban classification', () => {
  it('bans only missing/invalid keys permanently', () => {
    expect(classifySttBan('NO_API_KEY').permanent).toBe(true)
    expect(classifySttBan('INVALID_KEY').permanent).toBe(true)
    for (const code of ['TIMEOUT', 'CONNECTION_ERROR', 'RATE_LIMIT', 'CONSECUTIVE_FAIL', 'UNKNOWN']) {
      const ban = classifySttBan(code)
      expect(ban.permanent).toBe(false)
      expect(Number.isFinite(ban.banMs)).toBe(true)
    }
  })

  it('classifies structured status and code before message text', () => {
    expect(classifyTranscriptionError(Object.assign(new Error('boom'), { status: 401 }), 'X').errorCode)
      .toBe('INVALID_KEY')
    expect(classifyTranscriptionError(Object.assign(new Error('boom'), { status: 429 }), 'X').errorCode)
      .toBe('RATE_LIMIT')
    expect(classifyTranscriptionError(Object.assign(new Error('boom'), { status: 503 }), 'X').errorCode)
      .toBe('CONNECTION_ERROR')
    expect(classifyTranscriptionError(
      Object.assign(new Error('fetch failed'), { cause: { code: 'ETIMEDOUT' } }), 'X',
    ).errorCode).toBe('TIMEOUT')
  })

  it('does not mistake numbers embedded in text for HTTP statuses', () => {
    expect(classifyTranscriptionError(new Error('took 14012 ms for port 24290'), 'X').errorCode).toBe('UNKNOWN')
    expect(classifyTranscriptionError(new Error('HTTP 401 from provider'), 'X').errorCode).toBe('INVALID_KEY')
    expect(classifyTranscriptionError(new Error('request timed out'), 'X').errorCode).toBe('TIMEOUT')
  })
})

describe('live auto routing bans', () => {
  let invoke: ReturnType<typeof buildMockIpcMain>['invoke']

  beforeEach(() => {
    vi.clearAllMocks()
    resetSttSessionStateForTests()
    vi.stubGlobal('fetch', providerMocks.fetch)
    vi.mocked(getStoredApiKey).mockImplementation(provider => {
      if (provider === 'openai') return 'openai-key'
      if (provider === 'gemini') return 'gemini-key'
      return null
    })
    vi.mocked(hasStoredApiKey).mockReturnValue(true)
    const mock = buildMockIpcMain()
    // biome-ignore lint/suspicious/noExplicitAny: focused IPC test helper
    registerTranscribeHandlers(mock.ipcMain as any)
    invoke = mock.invoke
  })

  afterEach(() => {
    vi.useRealTimers()
    resetSttSessionStateForTests()
  })

  const liveParams = () => makeParams({ purpose: 'live', audioData: new ArrayBuffer(4_000) })

  it('does not permanently ban Gemini after a single timeout (single-provider path)', async () => {
    vi.mocked(getStoredApiKey).mockImplementation(provider => provider === 'gemini' ? 'gemini-key' : null)
    resetSttSessionStateForTests()
    providerMocks.fetch.mockResolvedValue({ ok: false, status: 504, statusText: 'Gateway Timeout', json: async () => ({}) })

    const result = await invoke('audio:transcribe', liveParams())
    // Whisper has no key in this scenario, so Gemini-only ran and then Groq has none.
    expect(result).toMatchObject({ success: false })
    expect(providerMocks.fetch).toHaveBeenCalledOnce()
    expect(getSttSessionStateForTests().geminiAvailable).toBe(false)

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 10 * 60_000)
    expect(getSttSessionStateForTests().geminiAvailable).toBe(true)
  })

  it('bans each hedged provider by its own failure code', async () => {
    providerMocks.openAiCreate.mockRejectedValue(Object.assign(new Error('bad key'), { status: 401 }))
    providerMocks.fetch.mockResolvedValue({ ok: false, status: 504, statusText: 'Gateway Timeout', json: async () => ({}) })

    const result = await invoke('audio:transcribe', liveParams())
    expect(result).toMatchObject({ success: false, errorCode: 'ALL_PROVIDERS_EXHAUSTED' })
    expect(providerMocks.openAiCreate).toHaveBeenCalledOnce()
    expect(providerMocks.fetch).toHaveBeenCalledOnce()

    // Whisper: invalid key (permanent). Gemini: timeout (timed ban only).
    expect(getSttSessionStateForTests()).toEqual({ whisperAvailable: false, geminiAvailable: false })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 10 * 60_000)
    expect(getSttSessionStateForTests()).toEqual({ whisperAvailable: false, geminiAvailable: true })
  })

  it('does not ban Gemini permanently because Whisper hit a rate limit', async () => {
    providerMocks.openAiCreate.mockRejectedValue(Object.assign(new Error('slow down'), { status: 429 }))
    providerMocks.fetch.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({}) })

    await invoke('audio:transcribe', liveParams())

    // Whisper: rate limit (timed). Gemini: invalid key (permanent).
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 10 * 60_000)
    expect(getSttSessionStateForTests()).toEqual({ whisperAvailable: true, geminiAvailable: false })
  })

  const geminiOk = () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: 'hello from Gemini' }] } }] }),
  })
  const geminiFail = (status: number) => ({ ok: false, status, statusText: 'err', json: async () => ({}) })

  it('permanently bans Whisper when it fails with an invalid key but Gemini wins the hedge', async () => {
    providerMocks.openAiCreate.mockRejectedValue(Object.assign(new Error('bad key'), { status: 401 }))
    providerMocks.fetch.mockResolvedValue(geminiOk())

    const first = await invoke('audio:transcribe', liveParams())
    expect(first).toMatchObject({ success: true, usedProvider: 'gemini' })
    expect(providerMocks.openAiCreate).toHaveBeenCalledOnce()
    expect(getSttSessionStateForTests()).toEqual({ whisperAvailable: false, geminiAvailable: true })

    // Later chunks no longer send a doomed Whisper request.
    const second = await invoke('audio:transcribe', liveParams())
    expect(second).toMatchObject({ success: true, usedProvider: 'gemini' })
    expect(providerMocks.openAiCreate).toHaveBeenCalledOnce()

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 10 * 60_000)
    expect(getSttSessionStateForTests().whisperAvailable).toBe(false)
  })

  it('applies a timed Whisper ban when Whisper errors and Gemini wins', async () => {
    providerMocks.openAiCreate.mockRejectedValue(Object.assign(new Error('slow down'), { status: 429 }))
    providerMocks.fetch.mockResolvedValue(geminiOk())

    const result = await invoke('audio:transcribe', liveParams())
    expect(result).toMatchObject({ success: true, usedProvider: 'gemini' })
    expect(getSttSessionStateForTests()).toEqual({ whisperAvailable: false, geminiAvailable: true })

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 10 * 60_000)
    expect(getSttSessionStateForTests().whisperAvailable).toBe(true)
  })

  it('does not ban Whisper merely because Gemini was faster', async () => {
    providerMocks.openAiCreate.mockImplementation((_body, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })
      }))
    providerMocks.fetch.mockResolvedValue(geminiOk())
    vi.useFakeTimers()

    const pending = invoke('audio:transcribe', liveParams())
    await vi.advanceTimersByTimeAsync(1_500)
    await expect(pending).resolves.toMatchObject({ success: true, usedProvider: 'gemini' })

    expect(getSttSessionStateForTests()).toEqual({ whisperAvailable: true, geminiAvailable: true })
  })

  describe('background recovery probes', () => {
    const PROBE_DELAY_MS = 60_000

    /** Whisper RATE/CONNECTION failure + permanently failing Gemini => timed Whisper ban + probe. */
    async function banWhisperTemporarily(status = 503) {
      providerMocks.openAiCreate.mockRejectedValue(Object.assign(new Error('down'), { status }))
      providerMocks.fetch.mockResolvedValue(geminiFail(401))
      await invoke('audio:transcribe', liveParams())
      expect(getSttSessionStateForTests().whisperAvailable).toBe(false)
    }

    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('recovers a timed Whisper ban when the probe gets a non-failure answer', async () => {
      await banWhisperTemporarily(429) // 90 s ban
      providerMocks.openAiCreate.mockResolvedValue({ text: '', segments: [] })

      await vi.advanceTimersByTimeAsync(PROBE_DELAY_MS + 100)

      expect(getSttSessionStateForTests().whisperAvailable).toBe(true)
    })

    it('does not treat an invalid-key probe answer as recovery', async () => {
      await banWhisperTemporarily(429) // 90 s ban, probe at 60 s
      providerMocks.openAiCreate.mockRejectedValue(Object.assign(new Error('bad key'), { status: 401 }))

      await vi.advanceTimersByTimeAsync(PROBE_DELAY_MS + 100)

      expect(providerMocks.openAiCreate).toHaveBeenCalledTimes(2) // chunk + probe
      expect(getSttSessionStateForTests().whisperAvailable).toBe(false)
    })

    it('never lets a probe for an earlier ban clear a newer permanent ban', async () => {
      await banWhisperTemporarily(503) // 30 s ban, probe scheduled for t=60 s

      await vi.advanceTimersByTimeAsync(31_000) // ban expired naturally
      providerMocks.openAiCreate.mockRejectedValue(Object.assign(new Error('bad key'), { status: 401 }))
      await invoke('audio:transcribe', liveParams()) // Whisper-only chunk: now a permanent ban
      expect(getSttSessionStateForTests().whisperAvailable).toBe(false)
      const callsBeforeProbe = providerMocks.openAiCreate.mock.calls.length

      // The old probe fires: it must neither call Whisper nor reset the permanent ban.
      providerMocks.openAiCreate.mockResolvedValue({ text: 'ok', segments: [] })
      await vi.advanceTimersByTimeAsync(PROBE_DELAY_MS)

      expect(providerMocks.openAiCreate).toHaveBeenCalledTimes(callsBeforeProbe)
      expect(getSttSessionStateForTests().whisperAvailable).toBe(false)
    })

    it('replaces the pending probe when a newer ban supersedes it', async () => {
      await banWhisperTemporarily(503) // ban #1 (30 s), probe due at t=60 s

      await vi.advanceTimersByTimeAsync(31_000) // t=31 s, ban #1 expired
      providerMocks.openAiCreate.mockRejectedValue(Object.assign(new Error('slow down'), { status: 429 }))
      await invoke('audio:transcribe', liveParams()) // ban #2 (90 s) -> probe due at t=91 s
      const callsAfterSecondBan = providerMocks.openAiCreate.mock.calls.length

      await vi.advanceTimersByTimeAsync(30_000) // t=61 s: the stale probe must not fire
      expect(providerMocks.openAiCreate).toHaveBeenCalledTimes(callsAfterSecondBan)

      providerMocks.openAiCreate.mockResolvedValue({ text: 'ok', segments: [] })
      await vi.advanceTimersByTimeAsync(31_000) // t=92 s: probe for ban #2 fires and recovers
      expect(providerMocks.openAiCreate).toHaveBeenCalledTimes(callsAfterSecondBan + 1)
      expect(getSttSessionStateForTests().whisperAvailable).toBe(true)
    })
  })
})

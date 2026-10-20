// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import type { TranscribeAudioParams } from '../../../shared/audioTranscription'
import { buildMockIpcMain } from './helpers/mockIpcMain'

const sdk = vi.hoisted(() => ({ release: undefined as undefined | (() => void), create: vi.fn() }))
vi.mock('../storage', () => ({ getStoredApiKey: () => 'test-key', hasStoredApiKey: () => true }))
vi.mock('openai', async () => {
  await new Promise<void>(resolve => { sdk.release = resolve })
  return { default: class { audio = { transcriptions: { create: sdk.create } } } }
})
afterEach(() => { vi.useRealTimers(); vi.resetModules() })

it('excludes a cold SDK load from the STT deadline and does not pay for an utterance cancelled during that load', async () => {
  vi.useFakeTimers()
  const { registerTranscribeHandlers } = await import('../transcribe.js')
  const { ipcMain, invoke } = buildMockIpcMain()
  registerTranscribeHandlers(ipcMain as Parameters<typeof registerTranscribeHandlers>[0])
  sdk.create.mockImplementation((_body, { signal }: { signal: AbortSignal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('request aborted')), { once: true })
    setTimeout(() => resolve({ text: 'はい', segments: [] }), 2_000)
  }))
  const params: TranscribeAudioParams = { requestId: 'cold', purpose: 'live', liveRouting: 'economy', audioData: new ArrayBuffer(1000), mimeType: 'audio/wav', sttProvider: 'whisper' }
  const first = invoke('audio:transcribe', params)
  const cancelled = invoke('audio:transcribe', { ...params, requestId: 'cancelled-cold' })
  await vi.advanceTimersByTimeAsync(6_800) // Measured pre-fetch delay in the Windows repro.
  expect(sdk.create).not.toHaveBeenCalled()
  await invoke('audio:cancelTranscription', { requestId: 'cancelled-cold' })
  expect(sdk.release).toBeTypeOf('function')
  sdk.release?.()
  await vi.advanceTimersByTimeAsync(2_000)
  await expect(first).resolves.toMatchObject({ success: true, text: 'はい' })
  await expect(cancelled).resolves.toMatchObject({ success: false, errorCode: 'CANCELLED' })
  expect(sdk.create).toHaveBeenCalledOnce()
})

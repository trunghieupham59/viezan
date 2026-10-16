import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../store/useAppStore'
import { useLiveTranslate } from '../useLiveTranslate'

class Recorder {
  static latest: Recorder
  static isTypeSupported() { return true }
  state = 'inactive'
  onstop: (() => void) | null = null
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  constructor() { Recorder.latest = this }
  start() { this.state = 'recording' }
  stop() { this.state = 'inactive' } // Test controls delivery of the final stop event.
  finish() {
    this.ondataavailable?.({ data: new Blob(['x'.repeat(20000)], { type: 'audio/webm' }) })
    this.onstop?.()
  }
}
const track = { stop: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }
const stream = { getTracks: () => [track], getAudioTracks: () => [track], addTrack: vi.fn() }
class AudioContextMock {
  state = 'running'
  createAnalyser() { return { fftSize: 512, getByteTimeDomainData: (data: Uint8Array) => data.fill(180), disconnect: vi.fn() } }
  createMediaStreamSource() { return { connect: vi.fn() } }
  createGain() { return { gain: { value: 1 }, connect: vi.fn() } }
  createMediaStreamDestination() { return { stream } }
  close() { return Promise.resolve() }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('MediaRecorder', Recorder)
  vi.stubGlobal('AudioContext', AudioContextMock)
  vi.stubGlobal('Blob', class TestBlob extends Blob { async arrayBuffer() { return new ArrayBuffer(this.size) } })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(stream) } })
  useAppStore.setState({ sourceLang: 'ja', targetLang: 'en', liveSourceLang: 'vi', liveTargetLang: 'ja', liveLanguagesLocked: false, liveSessions: [], viewingLiveSessionId: null })
  for (const key of ['onStart', 'onStop', 'onSetProvider', 'onSetModel', 'onSetAudioMode', 'onSetTargetLang', 'onStyleUpdate', 'onClear']) Object.assign(window.api.subtitle, { [key]: vi.fn(() => () => {}) })
  vi.mocked(window.api.transcribeAudio).mockReset()
  vi.mocked(window.api.translate).mockReset()
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('live language session boundary', () => {
  it('keeps the pair locked through recorder stop, final recognition and translation, then saves the original pair', async () => {
    let finishStt!: (value: Awaited<ReturnType<typeof window.api.transcribeAudio>>) => void
    let finishTranslation!: (value: Awaited<ReturnType<typeof window.api.translate>>) => void
    vi.mocked(window.api.transcribeAudio).mockImplementation(() => new Promise(resolve => { finishStt = resolve }))
    vi.mocked(window.api.translate).mockImplementation(() => new Promise(resolve => { finishTranslation = resolve }))
    const { result, unmount } = renderHook(() => useLiveTranslate())
    act(() => result.current.setAudioMode('mic'))
    await act(async () => { await result.current.handleStart() })
    expect(result.current.isActive).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    act(() => result.current.handleStop())
    expect(useAppStore.getState().liveLanguagesLocked).toBe(true)
    act(() => useAppStore.getState().setLanguagePair('live', { source: 'en', target: 'vi' }))
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(window.api.transcribeAudio).toHaveBeenCalledWith(expect.objectContaining({ language: 'vi' }))
    expect(useAppStore.getState().liveLanguagesLocked).toBe(true)
    await act(async () => { finishStt({ success: true, usedProvider: 'whisper', text: 'Chúng ta sẽ hoàn thành công việc hôm nay.' }); await vi.advanceTimersByTimeAsync(0) })
    expect(window.api.translate).toHaveBeenCalledWith(expect.objectContaining({ sourceLang: 'vi', targetLang: 'ja' }))
    expect(useAppStore.getState().liveLanguagesLocked).toBe(true)
    await act(async () => { finishTranslation({ success: true, translatedText: '今日中に仕事を終えます。' }); await vi.advanceTimersByTimeAsync(0) })
    expect(useAppStore.getState().liveLanguagesLocked).toBe(false)
    expect(useAppStore.getState().liveSessions[0]).toMatchObject({ sourceLang: 'vi', targetLang: 'ja', translation: '今日中に仕事を終えます。' })
    act(() => useAppStore.getState().setLanguagePair('live', { source: 'en', target: 'vi' }))
    expect(useAppStore.getState().liveSessions[0].targetLang).toBe('ja')
    unmount()
  })
  it('releases the lock when capture permission fails', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new Error('NotAllowedError'))
    const { result, unmount } = renderHook(() => useLiveTranslate())
    act(() => result.current.setAudioMode('mic'))
    await act(async () => { await result.current.handleStart() })
    expect(result.current.isActive).toBe(false)
    expect(useAppStore.getState().liveLanguagesLocked).toBe(false)
    unmount()
  })
})

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../store/useAppStore'
import { useLiveTranslate } from '../useLiveTranslate'

const vad = vi.hoisted(() => ({ create: vi.fn(), start: vi.fn(), destroy: vi.fn() }))
vi.mock('@ricky0123/vad-web', () => ({ MicVAD: { new: vad.create } }))

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
  vi.mocked(window.api.liveInterpretation.translate).mockReset()
  vad.create.mockReset().mockResolvedValue({ start: vad.start, destroy: vad.destroy })
  vad.start.mockReset().mockResolvedValue(undefined)
  vad.destroy.mockReset().mockResolvedValue(undefined)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('live language session boundary', () => {
  const translated = (text = '本はこちらです。') => ({ success: true as const, translatedText: text, usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60, estimated: false }, cached: false, attempts: 1 })

  it('drains recognition already in flight and translates the unpunctuated tail when Stop records silence', async () => {
    let finishStt!: (value: Awaited<ReturnType<typeof window.api.transcribeAudio>>) => void
    vi.mocked(window.api.transcribeAudio).mockImplementationOnce(() => new Promise(resolve => { finishStt = resolve }))
    vi.mocked(window.api.liveInterpretation.translate).mockResolvedValue(translated())
    const { result, unmount } = renderHook(() => useLiveTranslate())
    act(() => result.current.setAudioMode('mic'))
    await act(async () => { await result.current.handleStart(); await vi.advanceTimersByTimeAsync(1000) })
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(window.api.transcribeAudio).toHaveBeenCalledOnce()
    act(() => result.current.handleStop())
    act(() => result.current.handleStop()) // Repeated Stop must join the same drain.
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(useAppStore.getState().liveLanguagesLocked).toBe(true)
    await act(async () => {
      finishStt({ success: true, usedProvider: 'whisper', text: 'Quyển sách này' })
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(window.api.liveInterpretation.translate).toHaveBeenCalledWith(expect.objectContaining({ sourceText: 'Quyển sách này', context: '' }))
    expect(useAppStore.getState().liveSessions[0]).toMatchObject({ rawTranscript: 'Quyển sách này', translation: '本はこちらです。' })
    expect(useAppStore.getState().liveLanguagesLocked).toBe(false)
    unmount()
  })

  it('retains queued speech older than four seconds and drains it after Stop', async () => {
    let finishFirst!: (value: Awaited<ReturnType<typeof window.api.transcribeAudio>>) => void
    vi.mocked(window.api.transcribeAudio)
      .mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve }))
      .mockResolvedValueOnce({ success: true, usedProvider: 'whisper', text: 'Đoạn thứ hai.' })
    vi.mocked(window.api.liveInterpretation.translate).mockResolvedValue(translated())
    const { result, unmount } = renderHook(() => useLiveTranslate())
    act(() => result.current.setAudioMode('mic'))
    await act(async () => { await result.current.handleStart(); await vi.advanceTimersByTimeAsync(1000) })
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(1000); Recorder.latest.finish() })
    act(() => result.current.handleStop())
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(5000) })
    await act(async () => { finishFirst({ success: true, usedProvider: 'whisper', text: 'Đoạn thứ nhất.' }); await vi.advanceTimersByTimeAsync(0) })
    expect(window.api.transcribeAudio).toHaveBeenCalledTimes(2)
    expect(useAppStore.getState().liveSessions[0].rawTranscript).toBe('Đoạn thứ nhất. Đoạn thứ hai.')
    expect(useAppStore.getState().liveSessions[0].segments).toHaveLength(2)
    unmount()
  })

  it('waits for translations launched before Stop instead of leaving their rows empty', async () => {
    let finishTranslation!: (value: Awaited<ReturnType<typeof window.api.liveInterpretation.translate>>) => void
    vi.mocked(window.api.transcribeAudio).mockResolvedValue({ success: true, usedProvider: 'whisper', text: 'Đây là sách.' })
    vi.mocked(window.api.liveInterpretation.translate).mockImplementation(() => new Promise(resolve => { finishTranslation = resolve }))
    const { result, unmount } = renderHook(() => useLiveTranslate())
    act(() => result.current.setAudioMode('mic'))
    await act(async () => { await result.current.handleStart(); await vi.advanceTimersByTimeAsync(1000); Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    act(() => result.current.handleStop())
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(useAppStore.getState().liveLanguagesLocked).toBe(true)
    await act(async () => { finishTranslation(translated()); await vi.advanceTimersByTimeAsync(0) })
    expect(useAppStore.getState().liveSessions[0].segments?.[0].translation).toBe('本はこちらです。')
    unmount()
  })

  it('does not resurrect cleared text when an old recognizer resolves late', async () => {
    let finishStt!: (value: Awaited<ReturnType<typeof window.api.transcribeAudio>>) => void
    vi.mocked(window.api.transcribeAudio).mockImplementation(() => new Promise(resolve => { finishStt = resolve }))
    const { result, unmount } = renderHook(() => useLiveTranslate())
    act(() => result.current.setAudioMode('mic'))
    await act(async () => { await result.current.handleStart(); await vi.advanceTimersByTimeAsync(1000); Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    act(() => result.current.handleClear())
    await act(async () => { finishStt({ success: true, usedProvider: 'whisper', text: 'Old sentence.' }); await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.rawTranscript).toBe('')
    expect(window.api.liveInterpretation.translate).not.toHaveBeenCalled()
    unmount()
  })

  it('drains the last neural VAD utterance on Stop using its real duration', async () => {
    vi.mocked(window.api.transcribeAudio).mockResolvedValue({ success: true, usedProvider: 'whisper', text: '' })
    vi.mocked(window.api.liveInterpretation.translate).mockResolvedValue(translated())
    const { result, unmount } = renderHook(() => useLiveTranslate())
    act(() => result.current.setAudioMode('mic'))
    await act(async () => { await result.current.handleStart() })
    for (let i = 0; i < 6; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    }
    expect(vad.create).toHaveBeenCalledOnce()
    const options = vad.create.mock.calls[0][0]
    expect(options.submitUserSpeechOnPause).toBe(true)
    // Deliver the energy recorder's queued stop event after the VAD upgrade.
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    const speech = `${Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ')}.`
    vi.mocked(window.api.transcribeAudio).mockResolvedValue({ success: true, usedProvider: 'whisper', text: speech })
    act(() => options.onSpeechStart())
    vad.destroy.mockImplementation(async () => { await Promise.resolve(); options.onSpeechEnd(new Float32Array(160_000)) })
    await act(async () => { result.current.handleStop(); await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.rawTranscript).toBe(speech)
    expect(useAppStore.getState().liveSessions[0].rawTranscript).toBe(speech)
    expect(useAppStore.getState().liveLanguagesLocked).toBe(false)
    unmount()
  })

  it('keeps the pair locked through recorder stop, final recognition and translation, then saves the original pair', async () => {
    let finishStt!: (value: Awaited<ReturnType<typeof window.api.transcribeAudio>>) => void
    let finishTranslation!: (value: Awaited<ReturnType<typeof window.api.liveInterpretation.translate>>) => void
    vi.mocked(window.api.transcribeAudio).mockImplementation(() => new Promise(resolve => { finishStt = resolve }))
    vi.mocked(window.api.liveInterpretation.translate).mockImplementation(() => new Promise(resolve => { finishTranslation = resolve }))
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
    expect(window.api.liveInterpretation.translate).toHaveBeenCalledWith(expect.objectContaining({ sourceLang: 'vi', targetLang: 'ja' }))
    expect(useAppStore.getState().liveLanguagesLocked).toBe(true)
    await act(async () => { finishTranslation({ success: true, translatedText: '今日中に仕事を終えます。', usage: { inputTokens: 30, outputTokens: 10, totalTokens: 40, estimated: false }, attempts: 1, cached: false }); await vi.advanceTimersByTimeAsync(0) })
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

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveSentenceAssembly } from '../../../electron/services/liveSentenceAssembly'
import { useAppStore } from '../../store/useAppStore'
import recorded from '../live/__tests__/fixtures/quiet-hai.json'
import { prepareSpeechAudio } from '../live/prepareSpeechAudio'
import { useLiveTranslate } from '../useLiveTranslate'

vi.mock('../live/prepareSpeechAudio', () => ({ prepareSpeechAudio: vi.fn(async (blob: Blob) => blob) }))

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
const stream = { getTracks: () => [track], getAudioTracks: () => [track], getVideoTracks: () => [], addTrack: vi.fn() }
let audioSamples: number[] = []
let defaultSample = 180
let sampleIndex = 0
class AudioContextMock {
  state = 'running'
  sampleRate = 48000
  createAnalyser() { return { fftSize: 512,
    getByteTimeDomainData: (data: Uint8Array) => data.fill(defaultSample),
    getFloatTimeDomainData: (data: Float32Array) => {
      const sample = audioSamples.shift()
      // Speech fixtures need an envelope; a constant DC level is background,
      // not evidence that a microphone contains a voice.
      const envelope = sample === undefined && defaultSample === 180 ? [0.05, 0.15, 0.3, 1, 0.5, 0.1][sampleIndex++ % 6] : 1
      data.fill(((sample ?? defaultSample) - 128) / 128 * envelope)
    },
    disconnect: vi.fn() } }
  createMediaStreamSource() { return { connect: vi.fn() } }
  createGain() { return { gain: { value: 1 }, connect: vi.fn() } }
  createMediaStreamDestination() { return { stream } }
  close() { return Promise.resolve() }
}
beforeEach(() => {
  vi.useFakeTimers()
  audioSamples = []
  defaultSample = 180
  sampleIndex = 0
  vi.stubGlobal('MediaRecorder', Recorder)
  vi.stubGlobal('AudioContext', AudioContextMock)
  vi.stubGlobal('MediaStream', class { getTracks() { return [track] } getAudioTracks() { return [track] } })
  vi.stubGlobal('Blob', class TestBlob extends Blob { async arrayBuffer() { return new ArrayBuffer(this.size) } })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(stream), getDisplayMedia: vi.fn().mockResolvedValue(stream) } })
  useAppStore.setState({ sourceLang: 'ja', targetLang: 'en', liveSourceLang: 'vi', liveTargetLang: 'ja', liveLanguagesLocked: false, liveSessions: [], viewingLiveSessionId: null })
  for (const key of ['onStart', 'onStop', 'onSetProvider', 'onSetModel', 'onSetAudioMode', 'onSetTargetLang', 'onStyleUpdate', 'onClear']) Object.assign(window.api.subtitle, { [key]: vi.fn(() => () => {}) })
  vi.mocked(window.api.transcribeAudio).mockReset()
  vi.mocked(window.api.liveInterpretation.translate).mockReset()
  let assembly = new LiveSentenceAssembly()
  vi.mocked(window.api.liveInterpretation.begin).mockImplementation(async () => { assembly = new LiveSentenceAssembly() })
  vi.mocked(window.api.liveInterpretation.assemble).mockReset().mockImplementation(async request => ({
    success: true, updates: assembly.accept(request), hasOpen: assembly.hasOpen,
  }))
  vad.create.mockReset().mockResolvedValue({ start: vad.start, destroy: vad.destroy })
  vad.start.mockReset().mockResolvedValue(undefined)
  vad.destroy.mockReset().mockResolvedValue(undefined)
  vi.mocked(prepareSpeechAudio).mockReset().mockImplementation(async blob => blob)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('live language session boundary', () => {
  const translated = (text = '本はこちらです。') => ({ success: true as const, translatedText: text, usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60, estimated: false }, cached: false, attempts: 1 })

  it('updates one provisional row across four windows and saves only its final revision on double Stop', async () => {
    const parts = ['Tôi đồng ý ký hợp đồng', 'chỉ khi bên bán bổ sung', 'điều khoản bảo hành', 'cho toàn bộ thiết bị.']
    for (const text of parts) vi.mocked(window.api.transcribeAudio).mockResolvedValueOnce({ success: true, text, usedProvider: 'whisper' })
    vi.mocked(window.api.liveInterpretation.translate)
      .mockResolvedValueOnce(translated('暫定訳'))
      .mockResolvedValueOnce(translated('保証がある場合にのみ同意します。'))
    const { result, unmount } = renderHook(() => useLiveTranslate())
    await act(async () => { await result.current.handleStart() })
    for (let i = 0; i < parts.length; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(6000); Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    }
    expect(window.api.liveInterpretation.translate).toHaveBeenCalledOnce()
    expect(result.current.segments).toHaveLength(1)
    expect(result.current.segments[0]).toMatchObject({ state: 'provisional', rawText: parts.join(' '), translation: '暫定訳' })
    act(() => { result.current.handleStop(); result.current.handleStop() })
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(window.api.liveInterpretation.translate).toHaveBeenCalledTimes(2)
    expect(result.current.segments[0]).toMatchObject({ state: 'final', translation: '保証がある場合にのみ同意します。' })
    expect(result.current.latestSubtitle).toBe('保証がある場合にのみ同意します。')
    const saved = useAppStore.getState().liveSessions[0]
    expect(saved.segments).toEqual(result.current.segments)
    expect(saved.translation).not.toContain('暫定訳')
    expect(useAppStore.getState().liveLanguagesLocked).toBe(false)
    unmount()
  })

  it('ignores a late provisional response after the final revision has already arrived', async () => {
    let previewDone!: (value: ReturnType<typeof translated>) => void
    vi.mocked(window.api.transcribeAudio)
      .mockResolvedValueOnce({ success: true, text: 'Tôi đồng ý ký', usedProvider: 'whisper' })
      .mockResolvedValueOnce({ success: true, text: 'hợp đồng', usedProvider: 'whisper' })
      .mockResolvedValueOnce({ success: true, text: 'chỉ khi có bảo hành.', usedProvider: 'whisper' })
    vi.mocked(window.api.liveInterpretation.translate)
      .mockImplementationOnce(() => new Promise(resolve => { previewDone = resolve }))
      .mockResolvedValueOnce(translated('条件付きで同意します。'))
    const { result, unmount } = renderHook(() => useLiveTranslate())
    await act(async () => { await result.current.handleStart() })
    for (let i = 0; i < 3; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(6000); Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    }
    act(() => result.current.handleStop())
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.translation).toBe('条件付きで同意します。')
    await act(async () => { previewDone(translated('同意します。')); await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.translation).toBe('条件付きで同意します。')
    expect(useAppStore.getState().liveSessions[0].translation).toBe('条件付きで同意します。')
    expect(result.current.latestSubtitle).toBe('条件付きで同意します。')
    unmount()
  })

  it('preserves an unfinished source and its label in history after Stop', async () => {
    vi.mocked(window.api.transcribeAudio).mockResolvedValue({ success: true, text: 'Tôi chỉ ký nếu', usedProvider: 'whisper' })
    vi.mocked(window.api.liveInterpretation.translate).mockResolvedValue(translated('署名するのは、もし'))
    const { result, unmount } = renderHook(() => useLiveTranslate())
    await act(async () => { await result.current.handleStart(); await vi.advanceTimersByTimeAsync(1000) })
    act(() => result.current.handleStop())
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(useAppStore.getState().liveSessions[0].segments?.[0]).toMatchObject({
      rawText: 'Tôi chỉ ký nếu', state: 'incomplete', translation: '署名するのは、もし',
    })
    unmount()
  })

  it('drains quiet mic speech once on double Stop without enabling call processing', async () => {
    defaultSample = 128
    audioSamples = [0.1, 0.1, 0.4, 0.7, 1.2, 1.3, 0.7, 0.4].map(rms => rms + 128)
    vi.mocked(window.api.transcribeAudio).mockResolvedValue({ success: true, text: 'Tôi chỉ đồng ý ký hợp đồng nếu', usedProvider: 'whisper' })
    vi.mocked(window.api.liveInterpretation.translate).mockResolvedValue(translated('…の場合に限り、契約書に署名することに同意します。'))
    const { result, unmount } = renderHook(() => useLiveTranslate())
    act(() => result.current.setAudioMode('mic'))
    await act(async () => { await result.current.handleStart(); await vi.advanceTimersByTimeAsync(640) })
    act(() => { result.current.handleStop(); result.current.handleStop() })
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 } }, video: false,
    })
    expect(window.api.transcribeAudio).toHaveBeenCalledOnce()
    expect(window.api.liveInterpretation.translate).toHaveBeenCalledOnce()
    expect(useAppStore.getState().liveSessions[0].segments).toEqual([
      expect.objectContaining({ rawText: 'Tôi chỉ đồng ý ký hợp đồng nếu', state: 'incomplete', translation: '…の場合に限り、契約書に署名することに同意します。' }),
    ])
    expect(useAppStore.getState().liveLanguagesLocked).toBe(false)
    unmount()
  })

  it.each(['mic', 'both'] as const)('does not upload steady low noise when stopping %s capture', async mode => {
    defaultSample = 129
    vi.mocked(prepareSpeechAudio).mockResolvedValueOnce(null)
    const { result, unmount } = renderHook(() => useLiveTranslate())
    act(() => result.current.setAudioMode(mode))
    await act(async () => { await result.current.handleStart(); await vi.advanceTimersByTimeAsync(1000) })
    act(() => result.current.handleStop())
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(window.api.transcribeAudio).not.toHaveBeenCalled()
    expect(prepareSpeechAudio).toHaveBeenCalledWith(expect.any(Blob), true, expect.any(Function))
    expect(useAppStore.getState().liveLanguagesLocked).toBe(false)
    if (mode === 'both') expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({
      audio: expect.objectContaining({ echoCancellation: true, noiseSuppression: false, autoGainControl: false }),
    }))
    unmount()
  })

  it('rechecks the full mic noise floor instead of keeping a device-open transient latched as speech', async () => {
    defaultSample = 130.2
    audioSamples = [128, 128.55, 133, 130.05, 130.07]
    vi.mocked(prepareSpeechAudio).mockResolvedValueOnce(null)
    const { result, unmount } = renderHook(() => useLiveTranslate())
    act(() => result.current.setAudioMode('mic'))
    await act(async () => { await result.current.handleStart(); await vi.advanceTimersByTimeAsync(2500) })
    act(() => result.current.handleStop())
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(window.api.transcribeAudio).not.toHaveBeenCalled()
    expect(useAppStore.getState().liveLanguagesLocked).toBe(false)
    unmount()
  })

  it('inspects the recorded mic even when renderer polling missed its syllable before Stop', async () => {
    defaultSample = 128
    vi.mocked(window.api.transcribeAudio).mockResolvedValue({ success: true, text: 'Tôi ký nếu', usedProvider: 'whisper' })
    vi.mocked(window.api.liveInterpretation.translate).mockResolvedValue(translated('もし…なら、署名します。'))
    const { result, unmount } = renderHook(() => useLiveTranslate())
    act(() => result.current.setAudioMode('mic'))
    await act(async () => { await result.current.handleStart(); await vi.advanceTimersByTimeAsync(500) })
    act(() => { result.current.handleStop(); result.current.handleStop() })
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(prepareSpeechAudio).toHaveBeenCalledWith(expect.any(Blob), true, expect.any(Function))
    expect(window.api.transcribeAudio).toHaveBeenCalledOnce()
    expect(useAppStore.getState().liveSessions[0].segments?.[0]).toMatchObject({ rawText: 'Tôi ký nếu', state: 'incomplete' })
    unmount()
  })

  it.each(recorded.cases)('drains recorded $name once on double Stop and stores its complete translation', async ({ trace }) => {
    defaultSample = 128
    audioSamples = trace.map(rms => 128 + rms)
    vi.mocked(window.api.transcribeAudio).mockResolvedValue({ success: true, usedProvider: 'whisper', ...recorded.recognition })
    vi.mocked(window.api.liveInterpretation.translate).mockResolvedValue(translated('Vâng.'))
    const { result, unmount } = renderHook(() => useLiveTranslate())
    act(() => result.current.setAudioMode('system'))
    await act(async () => { await result.current.handleStart(); await vi.advanceTimersByTimeAsync(trace.length * 80) })
    act(() => { result.current.handleStop(); result.current.handleStop() })
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
    expect(window.api.transcribeAudio).toHaveBeenCalledOnce()
    expect(window.api.liveInterpretation.translate).toHaveBeenCalledOnce()
    expect(useAppStore.getState().liveSessions[0]).toMatchObject({ rawTranscript: 'はい', translation: 'Vâng.' })
    expect(useAppStore.getState().liveLanguagesLocked).toBe(false)
    expect(result.current.pendingText).toBe('')
    unmount()
  })

  it('recovers on the next queued utterance after a retryable STT timeout without retrying the failed audio', async () => {
    vi.mocked(window.api.transcribeAudio).mockResolvedValueOnce({ success: false, errorCode: 'TIMEOUT', retryable: true })
      .mockResolvedValueOnce({ success: true, usedProvider: 'whisper', text: 'Mã tiếp theo.' })
    vi.mocked(window.api.liveInterpretation.translate).mockResolvedValue(translated('次のコード。'))
    const { result, unmount } = renderHook(() => useLiveTranslate())
    await act(async () => { await result.current.handleStart(); await vi.advanceTimersByTimeAsync(1000); Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.isActive).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    act(() => result.current.handleStop())
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(window.api.transcribeAudio).toHaveBeenCalledTimes(2)
    expect(useAppStore.getState().liveSessions[0]).toMatchObject({ rawTranscript: 'Mã tiếp theo.', translation: '次のコード。' })
    unmount()
  })

  it('keeps the measured quiet system はい on Stop and submits only once', async () => {
    defaultSample = 128
    audioSamples = [0, 0, 0, 0.7578, 1.3058, 1.9385, 0.8053, 0.8615].map(rms => 128 + rms)
    vi.mocked(window.api.transcribeAudio).mockResolvedValue({ success: true, usedProvider: 'whisper', text: 'はい' })
    vi.mocked(window.api.liveInterpretation.translate).mockResolvedValue(translated('Có'))
    const { result, unmount } = renderHook(() => useLiveTranslate())
    await act(async () => { await result.current.handleStart(); await vi.advanceTimersByTimeAsync(640) })
    act(() => { result.current.handleStop(); result.current.handleStop() })
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(window.api.transcribeAudio).toHaveBeenCalledOnce()
    expect(useAppStore.getState().liveSessions[0]).toMatchObject({ rawTranscript: 'はい', translation: 'Có' })
    unmount()
  })

  it('waits through a breath, then translates an unpunctuated utterance after sustained silence', async () => {
    defaultSample = 128
    audioSamples = [148, 144, 140, 128, 128, 128, 128, 128, 128]
    vi.mocked(window.api.transcribeAudio).mockResolvedValue({ success: true, usedProvider: 'whisper', text: 'Mã cuối cùng là 1 2 3 4 5' })
    vi.mocked(window.api.liveInterpretation.translate).mockResolvedValue(translated())
    const { result, unmount } = renderHook(() => useLiveTranslate())
    await act(async () => { await result.current.handleStart(); await vi.advanceTimersByTimeAsync(720); Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.isActive).toBe(true)
    expect(window.api.liveInterpretation.translate).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1800) })
    expect(window.api.liveInterpretation.translate).toHaveBeenCalledWith(expect.objectContaining({ sourceText: 'Mã cuối cùng là 1 2 3 4 5' }))
    expect(result.current.pendingText).toBe('')
    unmount()
  })

  it('never seeds a new recognition with the previous possibly wrong sentence', async () => {
    vi.mocked(window.api.transcribeAudio).mockResolvedValueOnce({ success: true, usedProvider: 'whisper', text: 'Má cuối cùng.' })
      .mockResolvedValueOnce({ success: true, usedProvider: 'whisper', text: 'Mã tiếp theo.' })
    vi.mocked(window.api.liveInterpretation.translate).mockResolvedValue(translated())
    const { result, unmount } = renderHook(() => useLiveTranslate())
    await act(async () => { await result.current.handleStart(); await vi.advanceTimersByTimeAsync(1000); Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(window.api.transcribeAudio).toHaveBeenCalledTimes(2)
    expect(window.api.transcribeAudio).toHaveBeenLastCalledWith(expect.objectContaining({ previousText: undefined }))
    unmount()
  })

  it('does not submit decoded audio after Clear supersedes the asynchronous preparation', async () => {
    let decoded!: (blob: Blob) => void
    vi.mocked(prepareSpeechAudio).mockImplementationOnce(() => new Promise(resolve => { decoded = resolve }))
    const { result, unmount } = renderHook(() => useLiveTranslate())
    await act(async () => { await result.current.handleStart(); await vi.advanceTimersByTimeAsync(1000) })
    act(() => result.current.handleStop())
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    act(() => result.current.handleClear())
    await act(async () => { decoded(new Blob(['audio'])); await vi.advanceTimersByTimeAsync(0) })
    expect(window.api.transcribeAudio).not.toHaveBeenCalled()
    expect(useAppStore.getState().liveSessions).toHaveLength(0)
    unmount()
  })

  it('flushes two-frame Japanese speech on double Stop, including a transcript shorter than four characters', async () => {
    defaultSample = 128
    audioSamples = [128, 146, 138, 128, 128]
    vi.mocked(window.api.transcribeAudio).mockResolvedValue({ success: true, usedProvider: 'whisper', text: 'どうぞ', noSpeechProb: 0.1 })
    vi.mocked(window.api.liveInterpretation.translate).mockResolvedValue(translated('Xin mời.'))
    useAppStore.setState({ liveSourceLang: 'ja', liveTargetLang: 'vi' })
    const { result, unmount } = renderHook(() => useLiveTranslate())
    act(() => result.current.setAudioMode('system'))
    await act(async () => { await result.current.handleStart(); await vi.advanceTimersByTimeAsync(400) })
    expect(window.api.transcribeAudio).not.toHaveBeenCalled()
    act(() => { result.current.handleStop(); result.current.handleStop() })
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(window.api.transcribeAudio).toHaveBeenCalledOnce()
    expect(window.api.liveInterpretation.translate).toHaveBeenCalledWith(expect.objectContaining({ sourceText: 'どうぞ', sourceLang: 'ja', targetLang: 'vi' }))
    expect(useAppStore.getState().liveSessions[0]).toMatchObject({ rawTranscript: 'どうぞ', translation: 'Xin mời.' })
    expect(useAppStore.getState().liveLanguagesLocked).toBe(false)
    unmount()
  })

  it.each([[128, 128, 128, 128, 128], [128, 180, 128, 128, 128]])('does not submit silence or a single click on Stop: %j', async (...samples) => {
    defaultSample = 128
    audioSamples = samples
    const { result, unmount } = renderHook(() => useLiveTranslate())
    act(() => result.current.setAudioMode('system'))
    await act(async () => { await result.current.handleStart(); await vi.advanceTimersByTimeAsync(400) })
    act(() => result.current.handleStop())
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(window.api.transcribeAudio).not.toHaveBeenCalled()
    expect(window.api.liveInterpretation.translate).not.toHaveBeenCalled()
    expect(useAppStore.getState().liveLanguagesLocked).toBe(false)
    unmount()
  })

  it('does not submit a short final recording after Clear invalidates its Stop', async () => {
    defaultSample = 128
    audioSamples = [128, 146, 138, 128, 128]
    const { result, unmount } = renderHook(() => useLiveTranslate())
    act(() => result.current.setAudioMode('system'))
    await act(async () => { await result.current.handleStart(); await vi.advanceTimersByTimeAsync(400) })
    act(() => { result.current.handleStop(); result.current.handleClear() })
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(window.api.transcribeAudio).not.toHaveBeenCalled()
    expect(window.api.liveInterpretation.translate).not.toHaveBeenCalled()
    expect(useAppStore.getState().liveSessions).toHaveLength(0)
    unmount()
  })

  it('rejects the measured mic hallucination before translation or context reuse, without retrying', async () => {
    vi.mocked(window.api.transcribeAudio)
      .mockResolvedValueOnce({ success: true, usedProvider: 'whisper', text: 'Hãy đăng kí cho kênh lalaschool Để không bỏ lỡ những video hấp dẫn', noSpeechProb: 0.798154, avgLogprob: -0.36053, compressionRatio: 0.934 })
      .mockResolvedValueOnce({ success: true, usedProvider: 'whisper', text: 'Mã cuối cùng là một hai ba bốn năm.', noSpeechProb: 0.1 })
    vi.mocked(window.api.liveInterpretation.translate).mockResolvedValue(translated())
    const { result, unmount } = renderHook(() => useLiveTranslate())
    act(() => result.current.setAudioMode('mic'))
    await act(async () => { await result.current.handleStart(); await vi.advanceTimersByTimeAsync(1000); Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(window.api.transcribeAudio).toHaveBeenCalledOnce()
    expect(window.api.liveInterpretation.translate).not.toHaveBeenCalled()
    expect(result.current.rawTranscript).toBe('')
    expect(result.current.pipelineError).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(window.api.transcribeAudio).toHaveBeenLastCalledWith(expect.objectContaining({ previousText: undefined }))
    act(() => result.current.handleStop())
    await act(async () => { Recorder.latest.finish(); await vi.advanceTimersByTimeAsync(0) })
    expect(window.api.liveInterpretation.translate).toHaveBeenCalledOnce()
    expect(window.api.liveInterpretation.translate).toHaveBeenCalledWith(expect.objectContaining({ context: '', sourceText: 'Mã cuối cùng là một hai ba bốn năm.' }))
    unmount()
  })

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
    vi.mocked(prepareSpeechAudio)
      .mockImplementationOnce(async blob => blob)
      .mockImplementationOnce(async blob => blob)
      .mockResolvedValueOnce(null) // Stop's just-started recorder contains no speech.
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
    expect(useAppStore.getState().liveSessions[0].segments).toHaveLength(1)
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

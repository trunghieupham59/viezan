import { describe, expect, it } from 'vitest'
import { liveMicrophoneConstraints, localVadWasmPaths } from '../microphonePolicy'

describe('live microphone capture', () => {
  it('preserves nearby speaker audio without call filters or a mandatory hardware sample rate', () => {
    expect(liveMicrophoneConstraints('mic')).toEqual({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 } },
      video: false,
    })
  })
  it('retains echo cancellation for mixed input without suppressing quiet syllables with noise reduction', () => {
    expect(liveMicrophoneConstraints('both').audio).toMatchObject({
      echoCancellation: true, noiseSuppression: false, autoGainControl: false,
    })
  })
  it('resolves both VAD runtime assets locally in development and packaged windows', () => {
    for (const base of ['http://localhost:5173/index.html', 'file:///D:/Viezan/dist/index.html']) {
      const paths = localVadWasmPaths(base)
      expect(new URL(paths.mjs).protocol).toBe(new URL(base).protocol)
      expect(new URL(paths.mjs).host).toBe(new URL(base).host)
      expect(paths.mjs).toContain('ort-wasm-simd-threaded')
      expect(paths.wasm).toBe(new URL('./vad/ort-wasm-simd-threaded.wasm', base).href)
    }
  })
})

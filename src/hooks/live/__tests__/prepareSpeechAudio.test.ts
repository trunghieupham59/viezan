import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeSpeechSamples, prepareSpeechAudio } from '../prepareSpeechAudio'
import mic from './fixtures/quiet-mic.json'

const quietSpeech = vi.hoisted(() => vi.fn(async () => false))
afterEach(() => { vi.unstubAllGlobals(); quietSpeech.mockReset().mockResolvedValue(false) })

describe('live PCM preparation', () => {
  it('recovers ambiguous mic PCM with the bundled VAD before normalization, without a second decode', async () => {
    const samples = Float32Array.from({ length: 3200 }, (_, i) => 0.02 * Math.sin(i / 20))
    const decode = vi.fn(async () => ({ length: samples.length, sampleRate: 16000, numberOfChannels: 1, getChannelData: () => samples }))
    vi.stubGlobal('OfflineAudioContext', class { decodeAudioData = decode })
    quietSpeech.mockResolvedValueOnce(true)
    const result = await prepareSpeechAudio({ arrayBuffer: async () => new ArrayBuffer(100) } as Blob, true, quietSpeech)
    expect(result?.type).toBe('audio/wav')
    expect(decode).toHaveBeenCalledOnce()
    expect(quietSpeech).toHaveBeenCalledWith(samples, 16000)
  })
  it.each([...mic.cases.map(c => ({ ...c, speech: true })), ...mic.negatives.map(c => ({ ...c, speech: false }))])(
    'checks all PCM for $name before gain or a paid request', async ({ trace, speech }) => {
      // Reconstruct per-frame energy from the real captures at the decode rate.
      // Alternating signs avoid introducing artificial DC.
      const samples = Float32Array.from({ length: trace.length * 320 }, (_, i) => trace[Math.floor(i / 320)] / 128 * (i % 2 ? 1 : -1))
      vi.stubGlobal('OfflineAudioContext', class {
        async decodeAudioData() { return { length: samples.length, sampleRate: 16000, numberOfChannels: 1, getChannelData: () => samples } }
      })
      const result = await prepareSpeechAudio({ arrayBuffer: async () => new ArrayBuffer(100) } as Blob, true)
      expect(result !== null).toBe(speech)
    },
  )
  it('preserves a quiet waveform and duration while bounding gain and keeping headroom', () => {
    const input = new Float32Array([0, 0.03, -0.03, 0.06, -0.06, 0])
    const output = normalizeSpeechSamples(input)
    expect([...output]).toEqual([...input].map(value => Math.fround(value * 8)))
    expect(input[1]).toBeCloseTo(0.03)
    expect(output.length).toBe(input.length)
  })
  it('does not amplify near-silence and removes constant DC', () => {
    expect([...normalizeSpeechSamples(new Float32Array(480).fill(0.4))].every(value => Math.abs(value) < 1e-6)).toBe(true)
    expect([...normalizeSpeechSamples(new Float32Array([0.001, -0.001]))]).toEqual([...new Float32Array([0.001, -0.001])])
  })
  it('handles the measured Opus overshoot without saturating the PCM encoder', () => {
    const result = normalizeSpeechSamples(new Float32Array([1.0167, -1.0167]))
    expect(Math.max(...result.map(Math.abs))).toBeCloseTo(0.9)
  })
  it('rejects corrupt samples instead of producing a paid noise request', () => {
    expect(() => normalizeSpeechSamples(new Float32Array([Number.NaN]))).toThrow('Invalid audio sample')
  })
  it('decodes without a live device and outputs 16 kHz mono PCM with unchanged duration', async () => {
    const decode = vi.fn().mockResolvedValue({ length: 16000, sampleRate: 16000, numberOfChannels: 2,
      getChannelData: (channel: number) => Float32Array.from({ length: 16000 }, (_, i) => Math.sin(i / 20) * (channel ? 0.08 : 0.04)) })
    const constructed = vi.fn()
    vi.stubGlobal('OfflineAudioContext', class { constructor(...args: unknown[]) { constructed(...args) } decodeAudioData = decode })
    const prepared = await prepareSpeechAudio({ arrayBuffer: async () => new ArrayBuffer(100) } as Blob)
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = reject; reader.readAsArrayBuffer(prepared) })
    const view = new DataView(buffer)
    expect(constructed).toHaveBeenCalledWith(1, 1, 16000)
    expect(prepared.type).toBe('audio/wav')
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint32(40, true)).toBe(32000)
  })
})

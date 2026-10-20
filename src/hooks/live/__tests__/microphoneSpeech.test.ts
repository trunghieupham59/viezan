import { Tensor } from 'onnxruntime-web/wasm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasQuietMicrophoneSpeech } from '../microphoneSpeech'

const runtime = vi.hoisted(() => ({
  run: vi.fn(), release: vi.fn(), create: vi.fn(),
  tensors: [] as { dispose: ReturnType<typeof vi.fn> }[],
}))
vi.mock('onnxruntime-web/wasm', () => ({
  env: { wasm: {} },
  InferenceSession: { create: runtime.create },
  Tensor: class {
    dispose = vi.fn()
    constructor(public type: string, public data: ArrayLike<number | bigint>, public dims?: number[]) {
      runtime.tensors.push(this)
    }
  },
}))
beforeEach(() => {
  runtime.tensors = []
  runtime.create.mockResolvedValue(runtime)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }))
})
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals() })

function scores(probabilities: number[]) {
  let index = 0
  runtime.run.mockImplementation(async () => ({
    output: new Tensor('float32', [probabilities[index++]], [1, 1]),
    stateN: new Tensor('float32', new Float32Array(256), [2, 1, 128]),
  }))
}

describe('quiet microphone neural fallback', () => {
  it.each([
    [new Float32Array(16000), 16000],
    [new Float32Array(100).fill(0.1), 16000],
    [new Float32Array(16000).fill(Number.NaN), 16000],
    [new Float32Array(16000).fill(0.1), 48000],
  ])('does not load a model for silence, invalid PCM or an unsupported sample rate', async (samples, rate) => {
    expect(await hasQuietMicrophoneSpeech(samples, rate)).toBe(false)
    expect(runtime.create).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([
    [[0.1, 0.91, 0.8, 0.7], true],
    [[0.1, 0.99, 0.1, 0.1], false],
    [[0.2, 0.6, 0.6, 0.6], false],
    [[0.99, 0.1, 0.6, 0.6, 0.6], false],
  ])('requires confidence within one sustained speech run and releases every tensor (%j)', async (probabilities, expected) => {
    scores(probabilities)
    expect(await hasQuietMicrophoneSpeech(new Float32Array(probabilities.length * 512).fill(0.02), 16000)).toBe(expected)
    expect(runtime.release).toHaveBeenCalledOnce()
    expect(runtime.tensors.every(tensor => tensor.dispose.mock.calls.length === 1)).toBe(true)
    expect(fetch).toHaveBeenCalledWith(new URL('./vad/silero_vad_v5.onnx', window.location.href))
  })
  it('preserves frame boundaries and recurrent state without leaking them into the next recording', async () => {
    const samples = Float32Array.from({ length: 1600 }, (_, i) => i / 1600)
    scores([0.1, 0.1, 0.1, 0.1])
    expect(await hasQuietMicrophoneSpeech(samples, 16000)).toBe(false)
    const first = runtime.run.mock.calls[0][0]
    const second = runtime.run.mock.calls[1][0]
    expect(first.input.dims).toEqual([1, 512])
    expect(Array.from(first.input.data)).toEqual(Array.from(samples.slice(0, 512)))
    expect(Array.from(second.input.data)).toEqual(Array.from(samples.slice(512, 1024)))
    expect(second.state).not.toBe(first.state)
    expect(Array.from(runtime.run.mock.calls[3][0].input.data).slice(64)).toEqual(Array(448).fill(0))
    runtime.run.mockClear()
    scores([0.1, 0.1, 0.1, 0.1])
    await hasQuietMicrophoneSpeech(samples, 16000)
    expect(Array.from(runtime.run.mock.calls[0][0].state.data)).toEqual(Array(256).fill(0))
    expect(runtime.run.mock.calls[0][0].state).not.toBe(first.state)
  })
  it('releases a failed inference without accepting unclassified noise', async () => {
    runtime.run.mockRejectedValue(new Error('Inference failed'))
    await expect(hasQuietMicrophoneSpeech(new Float32Array(1600).fill(0.02), 16000)).rejects.toThrow('Inference failed')
    expect(runtime.release).toHaveBeenCalledOnce()
    expect(runtime.tensors.every(tensor => tensor.dispose.mock.calls.length === 1)).toBe(true)
  })
  it('rejects malformed model output and disposes its returned tensors', async () => {
    scores([Number.NaN])
    await expect(hasQuietMicrophoneSpeech(new Float32Array(1600).fill(0.02), 16000)).rejects.toThrow('Invalid microphone VAD output')
    expect(runtime.release).toHaveBeenCalledOnce()
    expect(runtime.tensors.every(tensor => tensor.dispose.mock.calls.length === 1)).toBe(true)
  })
  it('does not create an inference session when the bundled model is unavailable', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    await expect(hasQuietMicrophoneSpeech(new Float32Array(1600).fill(0.02), 16000)).rejects.toThrow('Bundled microphone VAD is unavailable')
    expect(runtime.create).not.toHaveBeenCalled()
  })
})

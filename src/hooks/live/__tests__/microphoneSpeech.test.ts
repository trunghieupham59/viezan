import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasQuietMicrophoneSpeech } from '../microphoneSpeech'

const model = vi.hoisted(() => ({ process: vi.fn(), release: vi.fn(), create: vi.fn() }))
vi.mock('@ricky0123/vad-web/dist/models/v5', () => ({ SileroV5: { new: model.create } }))
vi.mock('onnxruntime-web/wasm', () => ({ env: { wasm: {} } }))
afterEach(() => vi.resetAllMocks())

describe('quiet microphone neural fallback', () => {
  it.each([
    [new Float32Array(16000), 16000],
    [new Float32Array(100).fill(0.1), 16000],
    [new Float32Array(16000).fill(Number.NaN), 16000],
    [new Float32Array(16000).fill(0.1), 48000],
  ])('does not load a model for silence, invalid PCM or an unsupported sample rate', async (samples, rate) => {
    expect(await hasQuietMicrophoneSpeech(samples, rate)).toBe(false)
    expect(model.create).not.toHaveBeenCalled()
  })
  it.each([
    [[0.1, 0.91, 0.8, 0.7], true],
    [[0.1, 0.99, 0.1, 0.1], false],
    [[0.2, 0.6, 0.6, 0.6], false],
  ])('requires sustained confident speech and releases local model state (%j)', async (probabilities, expected) => {
    model.create.mockResolvedValue(model)
    for (const isSpeech of probabilities) model.process.mockResolvedValueOnce({ isSpeech })
    expect(await hasQuietMicrophoneSpeech(new Float32Array(probabilities.length * 512).fill(0.02), 16000)).toBe(expected)
    expect(model.release).toHaveBeenCalledOnce()
  })
  it('releases a failed inference without accepting unclassified noise', async () => {
    model.create.mockResolvedValue(model)
    model.process.mockRejectedValue(new Error('Inference failed'))
    await expect(hasQuietMicrophoneSpeech(new Float32Array(1600).fill(0.02), 16000)).rejects.toThrow('Inference failed')
    expect(model.release).toHaveBeenCalledOnce()
  })
})

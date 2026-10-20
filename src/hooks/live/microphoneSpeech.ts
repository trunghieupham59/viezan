import { localVadWasmPaths } from './microphonePolicy'

/** Quiet speech near a physical microphone's noise floor needs more than RMS.
 * Use the already-bundled Silero v5 only when the cheap PCM gate is uncertain.
 * Each call owns its recurrent state and releases the session, so Clear/new
 * sessions cannot inherit another speaker's VAD state. No remote fallback.
 */
export async function hasQuietMicrophoneSpeech(samples: Float32Array, sampleRate: number): Promise<boolean> {
  if (sampleRate !== 16_000 || samples.length < 1_536) return false
  let peak = 0
  for (const value of samples) {
    if (!Number.isFinite(value)) return false
    peak = Math.max(peak, Math.abs(value))
  }
  if (peak < 0.005) return false
  const [{ SileroV5 }, ort] = await Promise.all([
    import('@ricky0123/vad-web/dist/models/v5'),
    import('onnxruntime-web/wasm'),
  ])
  ort.env.logLevel = 'error'
  ort.env.wasm.wasmPaths = localVadWasmPaths(window.location.href)
  const model = await SileroV5.new(ort, async () => {
    const response = await fetch(new URL('./vad/silero_vad_v5.onnx', window.location.href))
    if (!response.ok) throw new Error('Bundled microphone VAD is unavailable')
    return response.arrayBuffer()
  })
  try {
    let consecutive = 0
    let confident = false
    for (let offset = 0; offset < samples.length; offset += 512) {
      const frame = new Float32Array(512)
      frame.set(samples.subarray(offset, offset + 512))
      const { isSpeech } = await model.process(frame)
      consecutive = isSpeech >= 0.5 ? consecutive + 1 : 0
      confident ||= isSpeech >= 0.8
      if (consecutive >= 3 && confident) return true
    }
    return false
  } finally {
    await model.release()
  }
}

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
  // Use the public ONNX API: vad-web renamed its private v5 module in 0.0.31.
  // Preserve the 512-sample frame contract used to calibrate this quiet gate.
  const ort = await import('onnxruntime-web/wasm')
  ort.env.logLevel = 'error'
  ort.env.wasm.wasmPaths = localVadWasmPaths(window.location.href)
  const response = await fetch(new URL('./vad/silero_vad_v5.onnx', window.location.href))
  if (!response.ok) throw new Error('Bundled microphone VAD is unavailable')
  const model = await ort.InferenceSession.create(await response.arrayBuffer())
  let state: import('onnxruntime-web/wasm').Tensor = new ort.Tensor('float32', new Float32Array(256), [2, 1, 128])
  const rate = new ort.Tensor('int64', [16000n])
  try {
    let consecutive = 0
    let confident = false
    for (let offset = 0; offset < samples.length; offset += 512) {
      const frame = new Float32Array(512)
      frame.set(samples.subarray(offset, offset + 512))
      const input = new ort.Tensor('float32', frame, [1, frame.length])
      let outputs: Awaited<ReturnType<typeof model.run>> = {}
      let isSpeech: number
      try {
        outputs = await model.run({ input, state, sr: rate })
        const score = outputs.output?.data[0]
        if (outputs.stateN?.type !== 'float32' || typeof score !== 'number'
          || !Number.isFinite(score) || score < 0 || score > 1) throw new Error('Invalid microphone VAD output')
        state.dispose()
        state = outputs.stateN
        isSpeech = score
      } finally {
        input.dispose()
        for (const tensor of Object.values(outputs)) if (tensor !== state) tensor.dispose()
      }
      consecutive = isSpeech >= 0.5 ? consecutive + 1 : 0
      confident = isSpeech >= 0.5 && (confident || isSpeech >= 0.8)
      if (consecutive >= 3 && confident) return true
    }
    return false
  } finally {
    try { await model.release() } finally { state.dispose(); rate.dispose() }
  }
}

import vadLoaderUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url'
import type { LiveAudioMode } from './vadPolicy'

/** Bundle the matching JS loader from the existing runtime dependency.
 * Importing a public .mjs directly is blocked by Vite in development; assuming
 * that copying only its .wasm is enough also breaks the packaged fallback.
 */
export function localVadWasmPaths(baseUrl: string): { mjs: string; wasm: string } {
  return {
    mjs: new URL(vadLoaderUrl, baseUrl).href,
    wasm: new URL('./vad/ort-wasm-simd-threaded.wasm', baseUrl).href,
  }
}

/** Mic-only interpretation may intentionally listen to a nearby speaker.
 * Browser call processing can cancel that speech before VAD ever sees it.
 * In mixed mode keep AEC: playback is already present in the loopback track.
 * Resampling/normalization happens once in prepareSpeechAudio, after capture.
 */
export function liveMicrophoneConstraints(mode: LiveAudioMode): MediaStreamConstraints {
  return {
    audio: {
      echoCancellation: mode === 'both',
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 1 },
    },
    video: false,
  }
}

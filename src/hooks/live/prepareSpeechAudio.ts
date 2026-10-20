import { float32ToWav } from '../../utils/wav-encoder'
import { quietMicSpeechThreshold } from './vadPolicy'

/** Remove DC and apply one bounded gain to the whole utterance. Do not compress
 * syllables independently or amplify near-silence; that can distort recognition.
 */
export function normalizeSpeechSamples(input: Float32Array): Float32Array {
  const samples = new Float32Array(input.length)
  if (!input.length) return samples
  let mean = 0
  for (const value of input) {
    if (!Number.isFinite(value)) throw new Error('Invalid audio sample')
    mean += value / input.length
  }
  let peak = 0
  for (let i = 0; i < input.length; i++) {
    samples[i] = input[i] - mean
    peak = Math.max(peak, Math.abs(samples[i]))
  }
  const gain = peak < 0.01 ? 1 : Math.min(8, 0.9 / peak)
  for (let i = 0; i < samples.length; i++) samples[i] *= gain
  return samples
}

/** Decode locally once, preserving duration and sending deterministic mono PCM.
 * OfflineAudioContext survives orderly Stop closing the capture AudioContext and
 * does not open a device. A decoding error surfaces without a second API request.
 */
export function prepareSpeechAudio(blob: Blob): Promise<Blob>
export function prepareSpeechAudio(blob: Blob, microphone: boolean, detectQuietSpeech?: (samples: Float32Array, sampleRate: number) => Promise<boolean>): Promise<Blob | null>
export async function prepareSpeechAudio(blob: Blob, microphone = false, detectQuietSpeech?: (samples: Float32Array, sampleRate: number) => Promise<boolean>): Promise<Blob | null> {
  const decoder = new OfflineAudioContext(1, 1, 16_000)
  const audio = await decoder.decodeAudioData(await blob.arrayBuffer())
  const mono = new Float32Array(audio.length)
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const samples = audio.getChannelData(channel)
    for (let i = 0; i < samples.length; i++) mono[i] += samples[i] / audio.numberOfChannels
  }
  if (microphone) {
    // Timers/analyser snapshots can miss a quiet syllable under renderer load.
    // Decide from ALL recorded PCM before gain, not a latched startup peak.
    // Returning null keeps silence/noise local without a recognition request.
    const frames: number[] = []
    const frameSize = Math.max(1, Math.round(audio.sampleRate * 0.02))
    for (let offset = 0; offset + frameSize <= mono.length; offset += frameSize) {
      let energy = 0
      for (let i = offset; i < offset + frameSize; i++) energy += mono[i] * mono[i]
      frames.push(128 * Math.sqrt(energy / frameSize))
    }
    if (quietMicSpeechThreshold(frames, 20) === null
      && !await detectQuietSpeech?.(mono, audio.sampleRate)) return null
  }
  return float32ToWav(normalizeSpeechSamples(mono), audio.sampleRate)
}

export interface VadParams {
  speechRmsThreshold: number
  peakRmsThreshold: number
  minSpeechSamples: number
  hangoverSamples: number
}

export type LiveAudioMode = 'mic' | 'system' | 'both'

export function getInitialVadPolicy(mode: LiveAudioMode): VadParams {
  switch (mode) {
    case 'system':
      return { speechRmsThreshold: 5, peakRmsThreshold: 9, minSpeechSamples: 3, hangoverSamples: 6 }
    case 'both':
      return { speechRmsThreshold: 2, peakRmsThreshold: 4, minSpeechSamples: 2, hangoverSamples: 6 }
    default:
      return { speechRmsThreshold: 2, peakRmsThreshold: 4, minSpeechSamples: 2, hangoverSamples: 6 }
  }
}

export const VAD_SAMPLE_INTERVAL = 80
export const VAD_MAX_HANGOVER_SAMPLES = 8
export const VAD_FLIP_RATE_HIGH = 10
export const VAD_FLIP_RATE_LOW = 3

export const MIN_CHUNK_RECORD_MS = 300
export const MAX_WORDS_PER_SEC = 15
export const SILENCE_RESET_CHUNKS = 10

// Live audio can contain noise that produces fluent but invented captions.
// Treat the provider's no-speech score as evidence, not text fluency.
export const NO_SPEECH_PROB_MAX = 0.60
export const AVG_LOGPROB_MIN = -2.0
export const COMPRESSION_RATIO_MAX = 3.5

/** Stop may interrupt the normal consecutive-frame trigger. Require two
 * speech frames and a real peak, so silence and one-frame clicks stay local.
 */
export function shouldFlushShortSpeech(policy: VadParams, speechSamples: number, peakRms: number, durationMs: number): boolean {
  return durationMs >= MIN_CHUNK_RECORD_MS && speechSamples >= 2 && peakRms >= policy.peakRmsThreshold
}

/** Inspect all PCM in the last polling interval, in non-overlapping 20 ms
 * frames. One 80 ms average makes a short vowel depend on timer alignment.
 * Exclude the analyser's overlapping prefix so clicks aren't counted twice.
 */
export function quietSpeechFrames(samples: Float32Array, sampleRate: number): number[] {
  const frameSize = Math.max(1, Math.round(sampleRate * 0.02))
  const start = Math.max(0, samples.length - Math.round(sampleRate * VAD_SAMPLE_INTERVAL / 1_000))
  const frames: number[] = []
  for (let offset = start; offset + frameSize <= samples.length; offset += frameSize) {
    let energy = 0
    for (let i = offset; i < offset + frameSize; i++) energy += samples[i] * samples[i]
    frames.push(128 * Math.sqrt(energy / frameSize))
  }
  return frames
}

/** A second, relative gate for quiet loopback speech. RMS uses the same 0–128
 * scale as the normal gate, but is measured from float PCM (no 8-bit noise floor).
 * Require multiple active frames AND modulation above the background: lowering
 * the fixed threshold alone would submit steady hum and isolated clicks to STT.
 * The caller bounds the 20 ms trace to the current six-second recording window.
 */
export function quietSystemSpeechThreshold(trace: readonly number[], frameMs = VAD_SAMPLE_INTERVAL): number | null {
  return relativeSpeechThreshold(trace, frameMs, false)
}

/** The microphone has a physical noise floor. Require sustained activity and
 * a voiced envelope above it; don't simply lower its fixed RMS gate.
 */
export function quietMicSpeechThreshold(trace: readonly number[], frameMs = VAD_SAMPLE_INTERVAL): number | null {
  return relativeSpeechThreshold(trace, frameMs, true)
}

function relativeSpeechThreshold(trace: readonly number[], frameMs: number, microphone: boolean): number | null {
  if (trace.length < 4 || trace.some(value => !Number.isFinite(value) || value < 0)) return null
  const sorted = [...trace].sort((a, b) => a - b)
  const floor = sorted[Math.floor((sorted.length - 1) * 0.2)]
  const threshold = Math.max(microphone ? 0.3 : 0.15, floor * (microphone ? 2 : 2.5))
  const speech = sorted.filter(value => value > threshold)
  const minFrames = Math.max(3, Math.ceil((microphone ? 120 : 80) / frameMs))
  if (speech.length < minFrames) return null
  if (microphone) {
    let consecutive = 0
    let longest = 0
    for (const value of trace) {
      consecutive = value > threshold ? consecutive + 1 : 0
      longest = Math.max(longest, consecutive)
    }
    // Quiet consonants can interrupt a syllable. Still require an 80 ms run
    // plus 120 ms total activity, so separated clicks cannot accumulate a pass.
    if (longest < Math.max(3, Math.ceil(80 / frameMs))) return null
  }
  const peak = speech[speech.length - 1]
  const median = speech[Math.floor((speech.length - 1) / 2)]
  const minPeak = Math.max(microphone ? 1 : 0.75, floor * (microphone ? 3 : 4))
  if (peak < minPeak) return null
  if (peak >= median * (microphone ? 1.4 : 1.6)) return threshold
  // A short vowel has a plateau, so its median can be nearly its peak. Require
  // a contiguous, bounded onset/vowel/release envelope instead. Unlike a click
  // or steady hum, it lasts >=80 ms and has both a rise and a fall.
  let run: number[] = []
  for (const value of [...trace, 0]) {
    if (value > threshold) { run.push(value); continue }
    if (run.length >= minFrames && run.length * frameMs <= 500) {
      const runPeak = Math.max(...run)
      if (runPeak >= minPeak && run[0] < runPeak * 0.65 && run[run.length - 1] < runPeak * 0.8) return threshold
    }
    run = []
  }
  return null
}

/** Missing scores are supported by some backends; non-finite supplied scores
 * cannot establish confidence. This gate never retries or invokes another AI.
 */
export function hasUnreliableTranscription(scores: { noSpeechProb?: number; avgLogprob?: number; compressionRatio?: number }): boolean {
  return [scores.noSpeechProb, scores.avgLogprob, scores.compressionRatio].some(value => value !== undefined && !Number.isFinite(value))
    || (scores.noSpeechProb !== undefined && scores.noSpeechProb > NO_SPEECH_PROB_MAX)
    || (scores.avgLogprob !== undefined && scores.avgLogprob < AVG_LOGPROB_MIN)
    || (scores.compressionRatio !== undefined && scores.compressionRatio > COMPRESSION_RATIO_MAX)
}


export const MAX_RAW_TRANSCRIPT_CHARS = 50_000
export const MAX_QUEUED_AUDIO_MS = 60_000

/** Never assume a neural VAD utterance has the recorder's fixed window length. */
export function exceedsSpeechRate(text: string, durationMs: number): boolean {
  return text.trim().split(/\s+/).filter(Boolean).length / Math.max(durationMs / 1_000, 0.3) > MAX_WORDS_PER_SEC
}

export const ADAPTIVE_VAD_MIN_CHUNKS = 6
export const ADAPTIVE_VAD_DISCARD_THRESHOLD = 0.40
export const ADAPTIVE_VAD_EVAL_WINDOW = 12


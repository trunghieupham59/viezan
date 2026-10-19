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

export const NO_SPEECH_PROB_MAX = 0.90
export const AVG_LOGPROB_MIN = -2.0
export const COMPRESSION_RATIO_MAX = 3.5


export const MAX_RAW_TRANSCRIPT_CHARS = 50_000
export const MAX_QUEUED_AUDIO_MS = 60_000

/** Never assume a neural VAD utterance has the recorder's fixed window length. */
export function exceedsSpeechRate(text: string, durationMs: number): boolean {
  return text.trim().split(/\s+/).filter(Boolean).length / Math.max(durationMs / 1_000, 0.3) > MAX_WORDS_PER_SEC
}

export const ADAPTIVE_VAD_MIN_CHUNKS = 6
export const ADAPTIVE_VAD_DISCARD_THRESHOLD = 0.40
export const ADAPTIVE_VAD_EVAL_WINDOW = 12


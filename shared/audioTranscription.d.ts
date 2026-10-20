export type SttProvider = 'auto' | 'whisper' | 'google' | 'groq'

export type SttBackend = 'whisper' | 'gemini' | 'groq'

export type AudioTranscriptionPurpose = 'dictation' | 'live'

export type AudioTranscriptionErrorCode =
  | 'INVALID_INPUT'
  | 'PERMISSION_DENIED'
  | 'RECORDING_FAILED'
  | 'AUDIO_TOO_SHORT'
  | 'NO_SPEECH'
  | 'AUDIO_TOO_LARGE'
  | 'UNSUPPORTED_FORMAT'
  | 'NO_API_KEY'
  | 'INVALID_KEY'
  | 'RATE_LIMIT'
  | 'CONNECTION_ERROR'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'ALL_PROVIDERS_FAILED'
  | 'ALL_PROVIDERS_EXHAUSTED'
  | 'UNKNOWN'

export interface TranscribeAudioParams {
  requestId: string
  purpose: AudioTranscriptionPurpose
  audioData: ArrayBuffer
  mimeType: string
  language?: string
  previousText?: string
  sttProvider: SttProvider
  /** Live economy routing waits for a provider failure before trying another. */
  liveRouting?: 'economy' | 'latency'
}

export interface TranscribeSuccess {
  success: true
  text: string
  usedProvider: SttBackend
  noSpeechProb?: number
  avgLogprob?: number
  compressionRatio?: number
  segmentTexts?: string[]
}

export interface TranscribeFailure {
  success: false
  errorCode: AudioTranscriptionErrorCode
  retryable: boolean
}

export type TranscribeResult = TranscribeSuccess | TranscribeFailure

export interface SttProviderCheckResult {
  primary: SttBackend | 'none'
  available: SttBackend[]
}

export interface CancelAudioTranscriptionParams {
  requestId: string
}

export type CancelAudioTranscriptionResult =
  | { success: true; cancelled: boolean }
  | {
      success: false
      errorCode: 'INVALID_INPUT'
      retryable: false
    }

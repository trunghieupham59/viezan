/**
 * Audio API — live interpretation, speech-to-text and text-to-speech. These members sit
 * directly on `window.api`. Single source for their shape; see `electron/preload/audio.ts`,
 * `electron/ipc/transcribe.ts`, `electron/ipc/tts.ts` and `electron/ipc/liveInterpretation.ts`.
 */
import type {
  CancelAudioTranscriptionParams,
  CancelAudioTranscriptionResult,
  SttProviderCheckResult,
  TranscribeAudioParams,
  TranscribeResult,
} from './audioTranscription'
import type { LiveInterpretationApi } from './liveInterpretation'

export type TtsVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
/** `free` = Edge TTS first; `premium` = paid providers only; `auto` = best available. */
export type TtsMode = 'free' | 'auto' | 'premium'

export interface SpeakTextParams {
  text: string
  voice?: TtsVoice
  mode?: TtsMode
  lang?: string
}

export interface TtsResult {
  success: boolean
  /** base64-encoded audio (avoids IPC ArrayBuffer serialization issues). */
  audioBase64?: string
  /** 'audio/mpeg' (OpenAI / Edge / ElevenLabs) or 'audio/wav' (Gemini). */
  mimeType?: string
  /** Which provider produced the audio: 'openai' | 'gemini' | 'edge' | 'elevenlabs'. */
  provider?: string
  error?: string
  errorCode?: 'NO_API_KEY' | 'INVALID_KEY' | 'RATE_LIMIT' | (string & {})
}

export interface AudioApi {
  liveInterpretation: LiveInterpretationApi
  /** Routes to the STT backend chosen by `sttProvider` (auto / whisper / google / groq). */
  transcribeAudio: (params: TranscribeAudioParams) => Promise<TranscribeResult>
  /** Cancel an in-flight transcription by its renderer-generated request id. */
  cancelAudioTranscription: (params: CancelAudioTranscriptionParams) => Promise<CancelAudioTranscriptionResult>
  /** Pre-flight STT availability check before a live session; warms the backend cache. */
  checkSttProviders: () => Promise<SttProviderCheckResult>
  /** Text-to-speech; free-first unless `mode` asks for paid providers. */
  speakText: (params: SpeakTextParams) => Promise<TtsResult>
}

/**
 * Audio preload API — Text-to-Speech and audio transcription (STT).
 *
 * STT routing is purpose-aware in the main process:
 *   dictation — sequential OpenAI → Gemini → Groq fallback
 *   live      — low-latency routing with provider availability caching
 *
 * Provider priority is configured in Settings → Speech-to-Text. Recorded audio
 * always crosses the typed preload boundary and is processed in the main process.
 */
import { ipcRenderer } from 'electron'
import type {
  CancelAudioTranscriptionParams,
  CancelAudioTranscriptionResult,
  SttProviderCheckResult,
  TranscribeAudioParams,
  TranscribeResult,
} from '../../shared/audioTranscription'
import type { LiveInterpretationApi } from '../../shared/liveInterpretation'

type TtsMode = 'free' | 'auto' | 'premium'

export const audioSection = {
  liveInterpretation: {
    begin: (sessionId) => ipcRenderer.invoke('live:begin', sessionId),
    translate: (request) => ipcRenderer.invoke('live:translate', request),
    assemble: (request) => ipcRenderer.invoke('live:assemble', request),
    cancel: (sessionId) => ipcRenderer.invoke('live:cancel', sessionId),
  } satisfies LiveInterpretationApi,
  /**
   * Audio transcription — routes to the appropriate STT backend based on `sttProvider`.
   *
   * Provider routing (handled in the main process):
   *   'auto'      — purpose-aware OpenAI → Gemini → Groq routing
   *   'whisper'   — OpenAI Whisper only (highest accuracy, requires OpenAI key)
   *   'google'    — Gemini STT only (uses Gemini API key, no extra GCP setup needed)
   */
  transcribeAudio: (params: TranscribeAudioParams): Promise<TranscribeResult> =>
    ipcRenderer.invoke('audio:transcribe', params),

  /** Cancel an in-flight transcription by its renderer-generated request ID. */
  cancelAudioTranscription: (
    params: CancelAudioTranscriptionParams,
  ): Promise<CancelAudioTranscriptionResult> =>
    ipcRenderer.invoke('audio:cancelTranscription', params),

  /**
   * Pre-flight STT availability check — call before starting a Live Translate session.
   *
   * Checks which STT keys are configured (instant, no API call, no decryption) and
   * pre-warms the session cache so the very first audio chunk goes directly to the
   * best available backend — zero wasted attempts on unavailable providers.
   *
   * Returns the best available provider and the full ordered list.
   */
  checkSttProviders: (): Promise<SttProviderCheckResult> =>
    ipcRenderer.invoke('audio:checkSttProviders'),

  // AI Text-to-Speech — default free-first; paid providers are used only when requested by mode.
  speakText: (params: {
    text: string
    voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
    mode?: TtsMode
    lang?: string
  }) => ipcRenderer.invoke('audio:tts', params) as Promise<{
    success: boolean
    audioBase64?: string
    /** 'audio/mpeg' (OpenAI / Edge / ElevenLabs) | 'audio/wav' (Gemini) */
    mimeType?: string
    /** Which provider produced the audio */
    provider?: string
    error?: string
    errorCode?: string
  }>,
}

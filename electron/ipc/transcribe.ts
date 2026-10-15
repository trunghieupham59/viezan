import type { IpcMain } from 'electron'
import type {
  AudioTranscriptionErrorCode,
  AudioTranscriptionPurpose,
  CancelAudioTranscriptionParams,
  CancelAudioTranscriptionResult,
  SttProvider,
  SttProviderCheckResult,
  TranscribeAudioParams,
  TranscribeFailure,
  TranscribeResult,
  TranscribeSuccess,
} from '../../shared/audioTranscription'
import {
  GEMINI_API_BASE, GEMINI_STT_MODEL,
  GROQ_API_BASE, GROQ_STT_MODEL,
  STT_CONNECTION_ERROR_BAN_MS, STT_HEDGE_DELAY_MS,
  STT_RECOVERY_PROBE_DELAY_MS,
  WHISPER_CONSECUTIVE_FAIL_BAN_MS, WHISPER_MODEL,
  WHISPER_RATE_LIMIT_BAN_MS, WHISPER_TIMEOUT_MS,
} from './ipcConstants'
import { isOptionalString, isRecord, isSafeLanguageCode } from './ipcValidation'
import { withRetry } from './retry'
import { getStoredApiKey, hasStoredApiKey } from './storage'

// ─── Session-level availability cache ────────────────────────────────────────
//
// Problem: In live meetings, speech is continuous. If a provider is unavailable
// (no key, rate-limited, connection error), the 'auto' fallback logic MUST skip
// that provider immediately on every subsequent chunk — not retry it.
//
// Design:
//   • Each provider has its own session availability flag + expiry timestamp.
//   • First failure → mark unavailable + ban for N seconds.
//   • All subsequent chunks → cache hit → skip instantly (zero overhead).
//   • Background probe → after STT_RECOVERY_PROBE_DELAY_MS, silently test the
//     banned provider. Success → reset ban early so the next real chunk uses it.
//   • Ban expiry → natural retry without background probe.
//
// Pre-flight (checkSttProviders) pre-warms Whisper cache on session open.

// ── Whisper cache ─────────────────────────────────────────────────────────────
let whisperSessionAvailable = true
let whisperUnavailableUntilMs = 0
// Bumped on every new Whisper/Gemini ban so a recovery probe can tell whether the ban
// it was scheduled for is still the current one.
let whisperBanGeneration = 0
let geminiBanGeneration = 0

// Counts consecutive Whisper failures with unrecognised error codes (no errorCode).
// After WHISPER_CONSECUTIVE_FAIL_LIMIT failures the session is switched away from
// Whisper for WHISPER_CONSECUTIVE_FAIL_BAN_MS to stop hammering a broken endpoint.
let whisperConsecutiveFailures = 0
const WHISPER_CONSECUTIVE_FAIL_LIMIT = 3

function isWhisperAvailableNow(): boolean {
  if (whisperSessionAvailable) return true
  if (Date.now() >= whisperUnavailableUntilMs) {
    whisperSessionAvailable = true
    whisperUnavailableUntilMs = 0
    console.log('[transcribe] Whisper session ban expired — will retry Whisper on next chunk')
  }
  return whisperSessionAvailable
}

// Provider session ban policy shared by Whisper and Gemini.
//   NO_API_KEY / INVALID_KEY → permanent until app restart, key change or pre-flight
//   RATE_LIMIT               → WHISPER_RATE_LIMIT_BAN_MS timed ban
//   TIMEOUT / CONNECTION_ERROR → STT_CONNECTION_ERROR_BAN_MS short ban (transient)
//   CONSECUTIVE_FAIL         → WHISPER_CONSECUTIVE_FAIL_BAN_MS short ban
//   anything else            → short timed ban (never permanent: live chunks have a
//                              3 s timeout, so one slow response must not disable a
//                              provider for the whole session)
const PERMANENT_BAN_CODES = new Set(['NO_API_KEY', 'INVALID_KEY'])

/** Pure ban classification. `banMs === Infinity` means "permanent for the session". */
export function classifySttBan(errorCode: string): { permanent: boolean; banMs: number } {
  if (PERMANENT_BAN_CODES.has(errorCode)) return { permanent: true, banMs: Number.POSITIVE_INFINITY }
  if (errorCode === 'RATE_LIMIT') return { permanent: false, banMs: WHISPER_RATE_LIMIT_BAN_MS }
  if (errorCode === 'CONSECUTIVE_FAIL') return { permanent: false, banMs: WHISPER_CONSECUTIVE_FAIL_BAN_MS }
  return { permanent: false, banMs: STT_CONNECTION_ERROR_BAN_MS }
}

function banExpiryMs(errorCode: string): number {
  const { permanent, banMs } = classifySttBan(errorCode)
  return permanent ? Number.MAX_SAFE_INTEGER : Date.now() + banMs
}

/** Mark Whisper as unavailable for this session (or a timed window). */
function markWhisperUnavailable(errorCode: string): void {
  whisperBanGeneration++
  whisperSessionAvailable = false
  whisperUnavailableUntilMs = banExpiryMs(errorCode)
  const { permanent, banMs } = classifySttBan(errorCode)
  console.log(permanent
    ? `[transcribe] Whisper marked unavailable for session (${errorCode})`
    : `[transcribe] Whisper marked unavailable for ${banMs / 1000} s (${errorCode})`)
}

// ── Gemini cache ──────────────────────────────────────────────────────────────
// Mirrors Whisper's session cache so Gemini rate-limit / connection errors also
// skip subsequent chunks instantly instead of retrying on every chunk.

let geminiSessionAvailable = true
let geminiUnavailableUntilMs = 0

function isGeminiAvailableNow(): boolean {
  if (geminiSessionAvailable) return true
  if (Date.now() >= geminiUnavailableUntilMs) {
    geminiSessionAvailable = true
    geminiUnavailableUntilMs = 0
    console.log('[transcribe] Gemini session ban expired — will retry Gemini on next chunk')
  }
  return geminiSessionAvailable
}

/** Mark Gemini STT as unavailable for this session (or a timed window). */
function markGeminiUnavailable(errorCode: string): void {
  geminiBanGeneration++
  geminiSessionAvailable = false
  geminiUnavailableUntilMs = banExpiryMs(errorCode)
  const { permanent, banMs } = classifySttBan(errorCode)
  console.log(permanent
    ? `[transcribe] Gemini marked unavailable for session (${errorCode})`
    : `[transcribe] Gemini marked unavailable for ${banMs / 1000} s (${errorCode})`)
}

/** Test-only: restore the module-level provider session caches. */
export function resetSttSessionStateForTests(): void {
  whisperSessionAvailable = true
  whisperUnavailableUntilMs = 0
  whisperConsecutiveFailures = 0
  geminiSessionAvailable = true
  geminiUnavailableUntilMs = 0
  whisperBanGeneration = 0
  geminiBanGeneration = 0
  for (const { timer } of pendingProbes.values()) clearTimeout(timer)
  pendingProbes.clear()
}

/** Test-only: read the provider session caches. */
export function getSttSessionStateForTests(): { whisperAvailable: boolean; geminiAvailable: boolean } {
  return { whisperAvailable: isWhisperAvailableNow(), geminiAvailable: isGeminiAvailableNow() }
}

// ─── Error codes that trigger fallback behaviour ──────────────────────────────
// All codes that trigger next-provider fallback on this chunk
const FALLBACK_CODES = new Set(['NO_API_KEY', 'INVALID_KEY', 'RATE_LIMIT', 'CONNECTION_ERROR', 'TIMEOUT'])

// ─── Background recovery probe ────────────────────────────────────────────────
//
// When a provider is banned, we schedule a silent background probe after
// STT_RECOVERY_PROBE_DELAY_MS.  The probe sends a minimal silence WAV — cheap
// enough that it won't consume significant API quota.
//
// If the probe succeeds (or returns any error other than the banning one) the
// session cache is reset so the next real chunk uses that provider again.
// This allows early recovery without blocking live transcription.

/** Generate a minimal WAV buffer of 100 ms of silence at 16 kHz (mono 16-bit). */
function createSilenceWav(): ArrayBuffer {
  const sampleRate = 16_000
  const numSamples = sampleRate / 10   // 100 ms
  const dataSize   = numSamples * 2    // 16-bit PCM = 2 bytes per sample
  const buf        = Buffer.alloc(44 + dataSize, 0)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8); buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)               // PCM chunk size
  buf.writeUInt16LE(1, 20)                // format = PCM
  buf.writeUInt16LE(1, 22)                // channels = 1
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)   // byte rate
  buf.writeUInt16LE(2, 32)                // block align
  buf.writeUInt16LE(16, 34)               // bits/sample
  buf.write('data', 36); buf.writeUInt32LE(dataSize, 40)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

/**
 * Schedule a background recovery probe for a banned provider.
 *
 * The probe runs in a setTimeout so it never blocks the calling audio chunk.
 * If the provider responds (success OR an error that is neither connectivity-related
 * nor a permanent key failure), the session cache is cleared so the very next real
 * chunk can use that provider.
 *
 * A probe is bound to the ban generation it was scheduled for: a newer ban replaces
 * the pending probe, and a probe never clears a ban that is newer than its own (or a
 * permanent one).
 */
interface PendingProbe {
  generation: number
  timer: NodeJS.Timeout
}
const pendingProbes = new Map<'whisper' | 'gemini', PendingProbe>()

/** Codes that mean "this provider will keep failing" - never evidence of recovery. */
function isUnrecoveredProbeCode(errorCode: string | undefined): boolean {
  return errorCode === 'CONNECTION_ERROR'
    || errorCode === 'TIMEOUT'
    || errorCode === 'RATE_LIMIT'
    || errorCode === 'CANCELLED'
    || (errorCode !== undefined && PERMANENT_BAN_CODES.has(errorCode))
}

function currentBanGeneration(provider: 'whisper' | 'gemini'): number {
  return provider === 'whisper' ? whisperBanGeneration : geminiBanGeneration
}

/** True while the ban the probe was scheduled for is still the live, timed ban. */
function isProbeBanCurrent(provider: 'whisper' | 'gemini', generation: number): boolean {
  if (currentBanGeneration(provider) !== generation) return false
  const unavailableUntil = provider === 'whisper' ? whisperUnavailableUntilMs : geminiUnavailableUntilMs
  const available = provider === 'whisper' ? isWhisperAvailableNow() : isGeminiAvailableNow()
  return !available && unavailableUntil !== Number.MAX_SAFE_INTEGER
}

function scheduleRecoveryProbe(provider: 'whisper' | 'gemini', afterMs: number): void {
  const generation = currentBanGeneration(provider)
  const existing = pendingProbes.get(provider)
  // One probe per ban at a time - repeated failures must not stack timers.
  if (existing?.generation === generation) return
  if (existing) clearTimeout(existing.timer)

  const timer = setTimeout(async () => {
    if (pendingProbes.get(provider)?.timer === timer) pendingProbes.delete(provider)
    if (!isProbeBanCurrent(provider, generation)) return  // recovered, expired or superseded
    const silenceWav = createSilenceWav()
    try {
      if (provider === 'whisper') {
        const result = await transcribeWithWhisper(silenceWav, 'audio/wav', undefined, undefined, false)
        // The ban may have been replaced (or made permanent) while the probe was in flight.
        if (!isProbeBanCurrent('whisper', generation)) return
        if (result.success || !isUnrecoveredProbeCode(result.errorCode)) {
          whisperSessionAvailable   = true
          whisperUnavailableUntilMs = 0
          console.log('[transcribe] Background probe: Whisper recovered → session ban reset')
        }
      } else {
        const geminiKey = await getStoredApiKey('gemini')
        if (!geminiKey) return
        const result = await transcribeWithGeminiSTT(silenceWav, 'audio/wav', undefined, geminiKey)
        if (!isProbeBanCurrent('gemini', generation)) return
        if (result.success || !isUnrecoveredProbeCode(result.errorCode)) {
          geminiSessionAvailable   = true
          geminiUnavailableUntilMs = 0
          console.log('[transcribe] Background probe: Gemini recovered → session ban reset')
        }
      }
    } catch {
      // Probe errors are silently swallowed — never block live transcription
    }
  }, afterMs)
  pendingProbes.set(provider, { generation, timer })
  // Never keep the process alive just for a background probe.
  timer.unref?.()
}

// ─── Shared IPC contract and validation ───────────────────────────────────────

type ParsedTranscribeParams =
  | { ok: true; value: TranscribeAudioParams }
  | { ok: false; response: TranscribeFailure }

const STT_PROVIDERS = new Set<SttProvider>(['auto', 'whisper', 'google', 'groq'])
const TRANSCRIPTION_PURPOSES = new Set<AudioTranscriptionPurpose>(['dictation', 'live'])
const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/aac',
  'audio/aiff',
  'audio/flac',
  'audio/mp3',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-m4a',
])
const MAX_REQUEST_ID_CHARS = 100
const MAX_PREVIOUS_TEXT_CHARS = 20_000
const MIN_DICTATION_AUDIO_BYTES = 1_000
export const MAX_TRANSCRIPTION_AUDIO_BYTES = 10 * 1024 * 1024
const DICTATION_PROVIDER_TIMEOUT_MS = 15_000

const activeTranscriptions = new Map<string, AbortController>()

type InternalTranscribeFailure = TranscribeFailure & { internalError?: string }
type InternalTranscribeResult = TranscribeSuccess | InternalTranscribeFailure

function transcriptionFailure(
  errorCode: AudioTranscriptionErrorCode,
  retryable: boolean,
): TranscribeFailure {
  return { success: false, errorCode, retryable }
}

function internalTranscriptionFailure(
  errorCode: AudioTranscriptionErrorCode,
  retryable: boolean,
  internalError?: string,
): InternalTranscribeFailure {
  return { success: false, errorCode, retryable, ...(internalError ? { internalError } : {}) }
}

function invalidInput(): TranscribeFailure {
  return transcriptionFailure('INVALID_INPUT', false)
}

function toExternalTranscribeResult(result: InternalTranscribeResult): TranscribeResult {
  if (result.success) return result
  return transcriptionFailure(result.errorCode, result.retryable)
}

function normalizeAudioMimeType(mimeType: string): string {
  return mimeType.split(';', 1)[0].trim().toLowerCase()
}

function isSafeRequestId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_REQUEST_ID_CHARS
    && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
}

function parseTranscribeParams(rawParams: unknown): ParsedTranscribeParams {
  if (!isRecord(rawParams)) {
    return { ok: false, response: invalidInput() }
  }
  if (!isSafeRequestId(rawParams.requestId)) {
    return { ok: false, response: invalidInput() }
  }
  if (typeof rawParams.purpose !== 'string'
      || !TRANSCRIPTION_PURPOSES.has(rawParams.purpose as AudioTranscriptionPurpose)) {
    return { ok: false, response: invalidInput() }
  }
  if (!(rawParams.audioData instanceof ArrayBuffer) || rawParams.audioData.byteLength === 0) {
    return { ok: false, response: invalidInput() }
  }
  if (rawParams.audioData.byteLength > MAX_TRANSCRIPTION_AUDIO_BYTES) {
    return {
      ok: false,
      response: transcriptionFailure('AUDIO_TOO_LARGE', false),
    }
  }
  if (rawParams.purpose === 'dictation'
      && rawParams.audioData.byteLength < MIN_DICTATION_AUDIO_BYTES) {
    return {
      ok: false,
      response: transcriptionFailure('AUDIO_TOO_SHORT', false),
    }
  }
  if (typeof rawParams.mimeType !== 'string') {
    return { ok: false, response: invalidInput() }
  }
  const mimeType = normalizeAudioMimeType(rawParams.mimeType)
  if (!ALLOWED_AUDIO_MIME_TYPES.has(mimeType)) {
    return {
      ok: false,
      response: transcriptionFailure('UNSUPPORTED_FORMAT', false),
    }
  }
  if (rawParams.language !== undefined && !isSafeLanguageCode(rawParams.language)) {
    return { ok: false, response: invalidInput() }
  }
  if (!isOptionalString(rawParams.previousText)
      || (rawParams.previousText?.length ?? 0) > MAX_PREVIOUS_TEXT_CHARS) {
    return { ok: false, response: invalidInput() }
  }
  if (typeof rawParams.sttProvider !== 'string'
      || !STT_PROVIDERS.has(rawParams.sttProvider as SttProvider)) {
    return { ok: false, response: invalidInput() }
  }

  return {
    ok: true,
    value: {
      requestId: rawParams.requestId,
      purpose: rawParams.purpose as AudioTranscriptionPurpose,
      audioData: rawParams.audioData,
      mimeType,
      language: rawParams.language as string | undefined,
      previousText: rawParams.previousText,
      sttProvider: rawParams.sttProvider as SttProvider,
    },
  }
}

function parseCancelParams(rawParams: unknown): CancelAudioTranscriptionParams | null {
  if (!isRecord(rawParams) || !isSafeRequestId(rawParams.requestId)) return null
  return { requestId: rawParams.requestId }
}

function isCancellationError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return error.name === 'AbortError' || message.includes('aborted') || message.includes('cancelled')
}

function readNumericStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined
  const direct = error.status ?? error.statusCode
  if (typeof direct === 'number') return direct
  const response = error.response
  if (isRecord(response) && typeof response.status === 'number') return response.status
  return undefined
}

function readErrorCodes(error: unknown): string[] {
  if (!isRecord(error)) return []
  const codes: string[] = []
  for (const value of [error.code, error.type, isRecord(error.cause) ? error.cause.code : undefined]) {
    if (typeof value === 'string') codes.push(value.toLowerCase())
  }
  return codes
}

export function classifyTranscriptionError(error: unknown, providerName: string): InternalTranscribeFailure {
  if (isCancellationError(error)) {
    return internalTranscriptionFailure('CANCELLED', false)
  }

  const message = error instanceof Error ? error.message : String(error)

  // 1. Structured signals first: HTTP status, then provider/Node error codes.
  const status = readNumericStatus(error)
  const codes = readErrorCodes(error)
  if (status === 401 || codes.includes('invalid_api_key')) {
    return internalTranscriptionFailure('INVALID_KEY', false, message)
  }
  if (status === 429 || codes.some(code => code === 'rate_limit_exceeded' || code === 'insufficient_quota')) {
    return internalTranscriptionFailure('RATE_LIMIT', true, message)
  }
  if (status === 408 || status === 504
      || codes.some(code => code === 'etimedout' || code === 'und_err_connect_timeout' || code === 'und_err_headers_timeout')) {
    return internalTranscriptionFailure('TIMEOUT', true, message)
  }
  if ((status !== undefined && status >= 500)
      || codes.some(code => ['enotfound', 'econnrefused', 'econnreset', 'eai_again', 'und_err_socket'].includes(code))) {
    return internalTranscriptionFailure('CONNECTION_ERROR', true, message)
  }

  // 2. Message text fallback — word-boundary matches so "4012 ms" or "port 4290"
  //    is not mistaken for an HTTP status.
  if (/\b401\b/.test(message) || /\binvalid_api_key\b|\bunauthorized\b/i.test(message)) {
    return internalTranscriptionFailure('INVALID_KEY', false, message)
  }
  if (/\b429\b/.test(message) || /\brate[_ ]limit(?:ed|_exceeded)?\b|\bquota\b/i.test(message)) {
    return internalTranscriptionFailure('RATE_LIMIT', true, message)
  }
  if (/\btime(?:d[ -]?)?out\b/i.test(message)) {
    return internalTranscriptionFailure('TIMEOUT', true, message)
  }
  if (/\b(?:enotfound|econnrefused)\b|failed to fetch|fetch failed|connection error/i.test(message)) {
    return internalTranscriptionFailure('CONNECTION_ERROR', true, message)
  }
  return internalTranscriptionFailure('UNKNOWN', false, `${providerName}: ${message}`)
}

function createAbortScope(parentSignal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController()
  let timedOut = false
  const handleParentAbort = () => controller.abort()
  if (parentSignal?.aborted) controller.abort()
  else parentSignal?.addEventListener('abort', handleParentAbort, { once: true })

  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timeoutId)
      parentSignal?.removeEventListener('abort', handleParentAbort)
    },
  }
}

function audioFileExtension(mimeType: string): string {
  switch (mimeType) {
    case 'audio/aac': return 'aac'
    case 'audio/aiff': return 'aiff'
    case 'audio/flac': return 'flac'
    case 'audio/mp3':
    case 'audio/mpeg': return 'mp3'
    case 'audio/mp4':
    case 'audio/x-m4a': return 'm4a'
    case 'audio/ogg': return 'ogg'
    case 'audio/wav': return 'wav'
    default: return 'webm'
  }
}

interface VerboseSegment {
  text:              string
  avg_logprob:       number
  compression_ratio: number
  no_speech_prob:    number
}

interface VerboseResponse {
  text:      string
  segments?: VerboseSegment[]
}

// ─── Language code map (Gemini STT prompt localisation) ───────────────────────
// Maps app language codes → BCP-47 locale strings for the Gemini STT prompt.
// These help Gemini focus on the correct language/dialect.
// Kept as a local constant because this is a main-process file and cannot import
// from the renderer-side src/constants/audio.ts (different bundle).
const LANG_TO_BCP47: Record<string, string> = {
  vi: 'vi-VN', en: 'en-US', zh: 'zh-CN', 'zh-TW': 'zh-TW',
  ja: 'ja-JP', ko: 'ko-KR', fr: 'fr-FR', de: 'de-DE',
  es: 'es-ES', pt: 'pt-BR', ru: 'ru-RU', ar: 'ar-SA',
  th: 'th-TH', id: 'id-ID', it: 'it-IT', nl: 'nl-NL',
  pl: 'pl-PL', tr: 'tr-TR', hi: 'hi-IN',
}

// ─── Whisper prompt builder ───────────────────────────────────────────────────

function buildWhisperPrompt(language: string | undefined, previousText?: string): string {
  const opener = (() => {
    switch (language) {
      case 'vi': return 'Xin chào, hôm nay chúng ta sẽ nói về'
      case 'ja': return 'はい、えーと、今日は'
      case 'ko': return '안녕하세요, 오늘은'
      case 'zh': return '好的，今天我们来讨论'
      default:   return 'Um, so,'
    }
  })()

  if (previousText) {
    const ctx = previousText.trim().slice(-200)
    return `${opener} ${ctx}`
  }
  return opener
}

// ─── Confidence aggregation (Whisper verbose_json segments) ──────────────────

function aggregateSegments(segments: VerboseSegment[]): {
  noSpeechProb: number
  avgLogprob: number
  compressionRatio: number
} {
  if (segments.length === 0) {
    return { noSpeechProb: 0, avgLogprob: 0, compressionRatio: 1 }
  }
  return {
    noSpeechProb:     Math.max(...segments.map(s => s.no_speech_prob)),
    avgLogprob:       Math.min(...segments.map(s => s.avg_logprob)),
    compressionRatio: Math.max(...segments.map(s => s.compression_ratio)),
  }
}

// ─── Whisper (OpenAI) ─────────────────────────────────────────────────────────

/**
 * Call OpenAI Whisper for transcription.
 *
 * @param useRetry — When true, wraps the call with exponential-backoff retry
 *   (suitable for 'whisper' mode where the user explicitly chose Whisper and
 *   transient errors should be recovered automatically).
 *   When false (used in 'auto' mode), a single attempt is made — any failure
 *   triggers immediate fallback to the next provider.
 */
async function transcribeWithWhisper(
  audioData: ArrayBuffer,
  mimeType: string,
  language?: string,
  previousText?: string,
  useRetry = true,
  signal?: AbortSignal,
  timeoutMs = WHISPER_TIMEOUT_MS,
): Promise<InternalTranscribeResult> {
  const apiKey = await getStoredApiKey('openai')
  if (!apiKey) {
    return internalTranscriptionFailure('NO_API_KEY', false)
  }

  const abortScope = createAbortScope(signal, timeoutMs)
  try {
    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey, maxRetries: 0, timeout: timeoutMs })

    const buffer = Buffer.from(audioData)
    const ext = audioFileExtension(mimeType)
    const file = new File([buffer], `audio.${ext}`, { type: mimeType })
    const whisperLang = language && language !== 'auto' ? language.split('-')[0] : undefined

    const createCall = () => client.audio.transcriptions.create(
      {
        file,
        model: WHISPER_MODEL,
        language: whisperLang,
        response_format: 'verbose_json',
        temperature: 0,
        prompt: buildWhisperPrompt(whisperLang, previousText),
      },
      { signal: abortScope.signal, timeout: timeoutMs, maxRetries: 0 },
    )

    const apiCall = useRetry ? withRetry(createCall) : createCall()

    const rawResponse = await (apiCall as unknown) as VerboseResponse
    const text = rawResponse.text?.trim() ?? ''

    if (!text || /^\s*$/.test(text)) {
      return { success: true, text: '', usedProvider: 'whisper' }
    }

    const segments = rawResponse.segments ?? []
    const { noSpeechProb, avgLogprob, compressionRatio } = aggregateSegments(segments)
    const segmentTexts = segments.map(s => s.text?.trim()).filter(Boolean) as string[]

    return {
      success: true, text, noSpeechProb, avgLogprob, compressionRatio,
      usedProvider: 'whisper',
      ...(segmentTexts.length > 1 ? { segmentTexts } : {}),
    }
  } catch (error) {
    const failure = abortScope.didTimeOut()
      ? internalTranscriptionFailure('TIMEOUT', true)
      : classifyTranscriptionError(error, 'OpenAI')
    console.error('[transcribe] Whisper failed:', failure.errorCode)
    return failure
  } finally {
    abortScope.cleanup()
  }
}

// ─── Gemini STT ───────────────────────────────────────────────────────────────

/**
 * Transcribe audio using the Gemini generateContent API with audio inline_data.
 *
 * WHY Gemini instead of Google Cloud Speech-to-Text:
 *   Cloud STT requires enabling a separate GCP API in the Google Cloud Console.
 *   Gemini's generateContent endpoint accepts audio directly using the same API key
 *   already configured for translation — zero additional setup.
 *
 * Supported audio formats (Gemini native):
 *   audio/wav, audio/webm, audio/ogg, audio/mp3, audio/flac, audio/aac, audio/aiff
 *
 * The codec parameter is stripped before sending (e.g. 'audio/webm;codecs=opus' → 'audio/webm')
 * since Gemini does not accept the codec suffix in inline_data.mime_type.
 */
async function transcribeWithGeminiSTT(
  audioData: ArrayBuffer,
  mimeType: string,
  language?: string,
  apiKey?: string | null,
  signal?: AbortSignal,
  timeoutMs = WHISPER_TIMEOUT_MS,
): Promise<InternalTranscribeResult> {
  if (!apiKey) {
    return internalTranscriptionFailure('NO_API_KEY', false)
  }

  const normalizedMime = mimeType.split(';')[0].trim()
  const base64Audio = Buffer.from(audioData).toString('base64')

  const langCode = language && language !== 'auto' ? language : null
  const bcp47 = langCode ? (LANG_TO_BCP47[langCode] ?? langCode) : null
  const langHint = bcp47 ? ` Language: ${bcp47}.` : ''
  const prompt =
    `Transcribe the audio accurately.${langHint} ` +
    'Output ONLY the transcription text — no timestamps, no speaker labels, no markdown, no explanations.'

  const url = `${GEMINI_API_BASE}/models/${GEMINI_STT_MODEL}:generateContent`
  const abortScope = createAbortScope(signal, timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      signal: abortScope.signal,
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: normalizedMime, data: base64Audio } },
            { text: prompt },
          ],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 1024 },
      }),
    })

    if (!response.ok) {
      // biome-ignore lint/suspicious/noExplicitAny: dynamic JSON error shape
      const errData: any = await response.json().catch(() => ({}))
      const msg: string = errData?.error?.message ?? response.statusText
      let failure: InternalTranscribeFailure
      if ((response.status === 400 && msg.includes('API key not valid'))
          || response.status === 401 || response.status === 403) {
        failure = internalTranscriptionFailure('INVALID_KEY', false, msg)
      } else if (response.status === 429) {
        failure = internalTranscriptionFailure('RATE_LIMIT', true, msg)
      } else if (response.status === 408 || response.status === 504) {
        failure = internalTranscriptionFailure('TIMEOUT', true, msg)
      } else if (response.status >= 500) {
        failure = internalTranscriptionFailure('CONNECTION_ERROR', true, msg)
      } else {
        failure = internalTranscriptionFailure('UNKNOWN', false, msg)
      }
      console.error('[transcribe] Gemini STT failed:', response.status, failure.errorCode)
      return failure
    }

    // biome-ignore lint/suspicious/noExplicitAny: dynamic Gemini response shape
    const data: any = await response.json()
    const text: string = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
    if (!text) return { success: true, text: '', usedProvider: 'gemini' }
    return { success: true, text, usedProvider: 'gemini' }
  } catch (error) {
    const failure = abortScope.didTimeOut()
      ? internalTranscriptionFailure('TIMEOUT', true)
      : classifyTranscriptionError(error, 'Gemini')
    console.error('[transcribe] Gemini STT failed:', failure.errorCode)
    return failure
  } finally {
    abortScope.cleanup()
  }
}

// ─── Groq STT (free fallback — OpenAI-compatible) ────────────────────────────

/**
 * Transcribe audio using the Groq API (Whisper-compatible endpoint).
 *
 * Groq uses the exact same OpenAI SDK format — only the baseURL and model differ.
 * No new SDK needed: we reuse the openai package already bundled with the app.
 *
 * Free tier: ~28,800 audio seconds / day.  No credit card required.
 * Register at console.groq.com and add the key in Settings → STT.
 *
 * verbose_json is supported and returns the same confidence signals as OpenAI Whisper,
 * so the same confidence gates in processChunk apply without any changes.
 */
async function transcribeWithGroq(
  audioData: ArrayBuffer,
  mimeType: string,
  language?: string,
  previousText?: string,
  signal?: AbortSignal,
  timeoutMs = WHISPER_TIMEOUT_MS,
): Promise<InternalTranscribeResult> {
  const apiKey = await getStoredApiKey('groq')
  if (!apiKey) {
    return internalTranscriptionFailure('NO_API_KEY', false)
  }

  const abortScope = createAbortScope(signal, timeoutMs)
  try {
    const OpenAI = (await import('openai')).default
    // Reuse the OpenAI SDK — only the baseURL changes.
    // apiKey is required by the SDK constructor even though Groq uses bearer auth;
    // the SDK passes it as Authorization: Bearer <apiKey> which Groq accepts.
    const client = new OpenAI({
      apiKey,
      baseURL: GROQ_API_BASE,
      maxRetries: 0,
      timeout: timeoutMs,
    })

    const buffer = Buffer.from(audioData)
    const ext = audioFileExtension(mimeType)
    const file = new File([buffer], `audio.${ext}`, { type: mimeType })
    const groqLang = language && language !== 'auto' ? language.split('-')[0] : undefined

    // Single attempt, no retry — used as a fallback, want fast response.
    const rawResponse = await client.audio.transcriptions.create(
      {
        file,
        model: GROQ_STT_MODEL,
        language: groqLang,
        response_format: 'verbose_json',
        temperature: 0,
        prompt: buildWhisperPrompt(groqLang, previousText),
      },
      { signal: abortScope.signal, timeout: timeoutMs, maxRetries: 0 },
    ) as unknown as VerboseResponse

    const text: string = (rawResponse.text ?? '').trim()
    if (!text || /^\s*$/.test(text)) {
      return { success: true, text: '', usedProvider: 'groq' }
    }

    const segments: VerboseSegment[] = rawResponse.segments ?? []
    const { noSpeechProb, avgLogprob, compressionRatio } = aggregateSegments(segments)
    const segmentTexts = segments.map((s: VerboseSegment) => s.text?.trim()).filter(Boolean) as string[]

    return {
      success: true, text, noSpeechProb, avgLogprob, compressionRatio,
      usedProvider: 'groq',
      ...(segmentTexts.length > 1 ? { segmentTexts } : {}),
    }
  } catch (error) {
    const failure = abortScope.didTimeOut()
      ? internalTranscriptionFailure('TIMEOUT', true)
      : classifyTranscriptionError(error, 'Groq')
    console.error('[transcribe] Groq STT failed:', failure.errorCode)
    return failure
  } finally {
    abortScope.cleanup()
  }
}

// ─── Hedged request (Whisper + Gemini in parallel) ────────────────────────────
//
// "Hedged request" pattern: start Whisper immediately, then after STT_HEDGE_DELAY_MS
// start Gemini in parallel if Whisper hasn't responded yet.  Use whichever succeeds
// first.  If Whisper fails early, Gemini starts immediately without waiting for the
// hedge timer.
//
// This guarantees that any single slow/failing provider cannot block the pipeline
// for more than ~WHISPER_TIMEOUT_MS (2 s) even in the worst case.
//
// Returns { result, fromWhisper } so the caller can update caches appropriately.

interface HedgedOutcome {
  result: InternalTranscribeResult
  fromWhisper: boolean
  /**
   * Each provider's OWN failure. Both are set when both failed; only whisperFailure is
   * set when Whisper failed early and Gemini then won the race.
   */
  whisperFailure?: InternalTranscribeFailure
  geminiFailure?: InternalTranscribeFailure
}

async function transcribeHedged(
  audioData: ArrayBuffer,
  mimeType: string,
  language: string | undefined,
  previousText: string | undefined,
  geminiKey: string,
  signal?: AbortSignal,
): Promise<HedgedOutcome> {
  return new Promise(resolve => {
    let settled = false
    let geminiLaunched = false
    let whisperFailure: InternalTranscribeFailure | null = null
    let geminiFailure: InternalTranscribeFailure | null = null
    const whisperController = new AbortController()
    const geminiController = new AbortController()

    const abortChildren = () => {
      whisperController.abort()
      geminiController.abort()
    }
    if (signal?.aborted) abortChildren()
    else signal?.addEventListener('abort', abortChildren, { once: true })

    const finish = (
      result: InternalTranscribeResult,
      fromWhisper: boolean,
      failures?: { whisper?: InternalTranscribeFailure; gemini?: InternalTranscribeFailure },
    ) => {
      if (settled) return
      settled = true
      clearTimeout(hedgeTimer)
      signal?.removeEventListener('abort', abortChildren)
      if (fromWhisper) geminiController.abort()
      else whisperController.abort()
      resolve({
        result,
        fromWhisper,
        ...(failures?.whisper ? { whisperFailure: failures.whisper } : {}),
        ...(failures?.gemini ? { geminiFailure: failures.gemini } : {}),
      })
    }

    const finishIfBothFailed = () => {
      if (whisperFailure && geminiFailure) {
        finish(geminiFailure, false, { whisper: whisperFailure, gemini: geminiFailure })
      }
    }

    const launchGemini = () => {
      if (geminiLaunched || settled) return
      geminiLaunched = true
      void transcribeWithGeminiSTT(
        audioData,
        mimeType,
        language,
        geminiKey,
        geminiController.signal,
        WHISPER_TIMEOUT_MS,
      ).then(result => {
        // Report Whisper's own early failure too, so the caller can ban it.
        if (result.success) finish(result, false, whisperFailure ? { whisper: whisperFailure } : undefined)
        else {
          geminiFailure = result
          finishIfBothFailed()
        }
      })
    }

    const hedgeTimer = setTimeout(() => {
      if (!settled) {
        console.log('[transcribe] hedge: Whisper slow — starting Gemini in parallel')
        launchGemini()
      }
    }, STT_HEDGE_DELAY_MS)

    void transcribeWithWhisper(
      audioData,
      mimeType,
      language,
      previousText,
      false,
      whisperController.signal,
      WHISPER_TIMEOUT_MS,
    ).then(result => {
      if (result.success) finish(result, true)
      else {
        whisperFailure = result
        launchGemini()
        finishIfBothFailed()
      }
    })
  })
}

// ─── Failure → ban + recovery probe ───────────────────────────────────────────

/**
 * Record a Whisper failure from the auto route: ban per classifySttBan, schedule a
 * recovery probe for timed bans, and count unrecognised codes towards the
 * consecutive-failure ban.
 */
function applyWhisperFailure(code: string): void {
  if (code === 'CANCELLED') return
  if (FALLBACK_CODES.has(code)) {
    markWhisperUnavailable(code)
    whisperConsecutiveFailures = 0
    if (!classifySttBan(code).permanent) scheduleRecoveryProbe('whisper', STT_RECOVERY_PROBE_DELAY_MS)
    return
  }
  whisperConsecutiveFailures++
  if (whisperConsecutiveFailures >= WHISPER_CONSECUTIVE_FAIL_LIMIT) {
    markWhisperUnavailable('CONSECUTIVE_FAIL')
    whisperConsecutiveFailures = 0
    scheduleRecoveryProbe('whisper', STT_RECOVERY_PROBE_DELAY_MS)
  }
}

/** Record a Gemini failure from the auto route (see applyWhisperFailure). */
function applyGeminiFailure(code: string): void {
  if (!FALLBACK_CODES.has(code)) return
  markGeminiUnavailable(code)
  if (!classifySttBan(code).permanent) scheduleRecoveryProbe('gemini', STT_RECOVERY_PROBE_DELAY_MS)
}

// ─── Auto mode: smart routing with session cache ───────────────────────────────

/**
 * Smart routing for 'auto' mode: Whisper → Gemini STT → Groq STT.
 *
 * When both Whisper and Gemini are available, uses a hedged-request strategy:
 *   • Whisper starts immediately.
 *   • After STT_HEDGE_DELAY_MS, Gemini starts in parallel if Whisper is still pending.
 *   • Whichever succeeds first wins — no sequential blocking.
 *
 * When only one provider is available, falls through to that provider directly.
 * Session caches ensure providers that failed previously are skipped instantly.
 */
async function transcribeAuto(
  audioData: ArrayBuffer,
  mimeType: string,
  language?: string,
  previousText?: string,
  signal?: AbortSignal,
): Promise<InternalTranscribeResult> {

  const whisperAvail = isWhisperAvailableNow()
  const geminiAvail  = isGeminiAvailableNow()
  const geminiKey    = (geminiAvail) ? await getStoredApiKey('gemini') : null

  // ── Hedged mode: both Whisper and Gemini are available ───────────────────────
  //
  // Fire them in a hedged race — fastest success wins.  This eliminates the
  // sequential Whisper-timeout → fall-to-Gemini delay that breaks real-time
  // performance when Whisper is slow or flaky.
  if (whisperAvail && geminiAvail && geminiKey) {
    const hedged = await transcribeHedged(
      audioData, mimeType, language, previousText, geminiKey, signal,
    )
    const { result, fromWhisper } = hedged

    if (result.success) {
      if (fromWhisper) {
        // Whisper won the race → reset consecutive-fail counter + session recovery
        whisperConsecutiveFailures = 0
        if (!whisperSessionAvailable) {
          whisperSessionAvailable   = true
          whisperUnavailableUntilMs = 0
          console.log('[transcribe] auto: Whisper recovered (hedged) — session cache reset')
        }
      } else {
        // Gemini won the hedge race.
        //
        // Important: Gemini winning does NOT mean Whisper is broken — Whisper may
        // simply have been slightly slower (e.g. 1.2 s vs Gemini's 1.0 s).  We must
        // NOT ban Whisper here, otherwise a small latency variance causes Whisper to
        // be excluded from the hedge for 90 s, which defeats the purpose of hedging.
        //
        // The hedge continues on every subsequent chunk and will naturally prefer
        // whichever provider is faster.  Whisper is only banned when it actually
        // returns an error: either it failed before Gemini won (below) or both failed
        // (the branch after this one).
        if (hedged.whisperFailure) {
          // Whisper errored (e.g. INVALID_KEY) and Gemini rescued the chunk: still apply
          // Whisper's ban so later chunks stop sending doomed Whisper requests.
          applyWhisperFailure(hedged.whisperFailure.errorCode)
        } else {
          console.log('[transcribe] auto: Gemini won hedge race (Whisper was slower) — keeping both in hedge')
        }
        if (!geminiSessionAvailable) {
          geminiSessionAvailable   = true
          geminiUnavailableUntilMs = 0
          console.log('[transcribe] auto: Gemini recovered (hedged) — session cache reset')
        }
      }
      return result
    }
    if (result.errorCode === 'CANCELLED') return result

    // Both Whisper and Gemini failed in the hedged race → ban each by its OWN
    // failure code (never pass one provider's code to the other), then fall to Groq.
    console.log(`[transcribe] auto: Hedged race failed (${result.errorCode}) → Groq STT`)
    if (hedged.whisperFailure) applyWhisperFailure(hedged.whisperFailure.errorCode)
    if (hedged.geminiFailure) applyGeminiFailure(hedged.geminiFailure.errorCode)
    // Fall through to Groq
  }

  // ── Single provider: Whisper only ────────────────────────────────────────────
  else if (whisperAvail) {
    const whisperResult = await transcribeWithWhisper(
      audioData,
      mimeType,
      language,
      previousText,
      false,
      signal,
      WHISPER_TIMEOUT_MS,
    )

    if (whisperResult.success) {
      whisperConsecutiveFailures = 0
      if (!whisperSessionAvailable) {
        whisperSessionAvailable = true; whisperUnavailableUntilMs = 0
        console.log('[transcribe] auto: Whisper recovered — session cache reset')
      }
      return whisperResult
    }
    if (whisperResult.errorCode === 'CANCELLED') return whisperResult

    const code = whisperResult.errorCode
    applyWhisperFailure(code)
    console.log(`[transcribe] auto: Whisper-only failed (${code || 'unknown'}) → Groq STT`)
    // Fall through to Groq (no Gemini key)
  }

  // ── Single provider: Gemini only ─────────────────────────────────────────────
  else if (geminiAvail && geminiKey) {
    const geminiResult = await transcribeWithGeminiSTT(
      audioData,
      mimeType,
      language,
      geminiKey,
      signal,
      WHISPER_TIMEOUT_MS,
    )

    if (geminiResult.success) {
      if (!geminiSessionAvailable) {
        geminiSessionAvailable = true; geminiUnavailableUntilMs = 0
        console.log('[transcribe] auto: Gemini recovered — session cache reset')
      }
      return geminiResult
    }

    const geminiCode = geminiResult.errorCode
    if (FALLBACK_CODES.has(geminiCode)) {
      applyGeminiFailure(geminiCode)
      console.log(`[transcribe] auto: Gemini-only failed (${geminiCode}) → Groq STT`)
    } else {
      return geminiResult  // non-recoverable error
    }
    // Fall through to Groq
  }

  // ── Neither Whisper nor Gemini: log and fall through ─────────────────────────
  else {
    console.log('[transcribe] auto: Whisper + Gemini both unavailable → Groq STT')
  }

  // ── Step 3: Groq STT (free fallback) ─────────────────────────────────────────
  //
  // Groq is the last resort.  If it is also unavailable or fails, there is no
  // further fallback — the session cannot continue and should be stopped so the
  // user sees a clear error rather than silent audio drops.
  const groqKey = await getStoredApiKey('groq')

  if (!groqKey) {
    return internalTranscriptionFailure('ALL_PROVIDERS_EXHAUSTED', false)
  }

  const groqResult = await transcribeWithGroq(
    audioData,
    mimeType,
    language,
    previousText,
    signal,
    WHISPER_TIMEOUT_MS,
  )

  if (!groqResult.success) {
    // Groq also failed → no more fallbacks → signal the UI to stop the session
    console.error('[transcribe] auto: Groq STT also failed — all providers exhausted:', groqResult.errorCode)
    return internalTranscriptionFailure('ALL_PROVIDERS_EXHAUSTED', groqResult.retryable)
  }

  return groqResult
}

async function transcribeWithSelectedProvider(
  sttProvider: Exclude<SttProvider, 'auto'>,
  params: TranscribeAudioParams,
  signal: AbortSignal,
  timeoutMs: number,
  useRetry: boolean,
): Promise<InternalTranscribeResult> {
  const { audioData, mimeType, language, previousText } = params
  if (sttProvider === 'whisper') {
    return transcribeWithWhisper(
      audioData,
      mimeType,
      language,
      previousText,
      useRetry,
      signal,
      timeoutMs,
    )
  }
  if (sttProvider === 'google') {
    const geminiKey = await getStoredApiKey('gemini')
    return transcribeWithGeminiSTT(
      audioData,
      mimeType,
      language,
      geminiKey,
      signal,
      timeoutMs,
    )
  }
  return transcribeWithGroq(
    audioData,
    mimeType,
    language,
    previousText,
    signal,
    timeoutMs,
  )
}

function normalizeDictationSuccess(result: InternalTranscribeResult): InternalTranscribeResult {
  if (result.success && result.text.trim().length === 0) {
    return internalTranscriptionFailure('NO_SPEECH', false)
  }
  return result
}

async function transcribeDictation(
  params: TranscribeAudioParams,
  signal: AbortSignal,
): Promise<InternalTranscribeResult> {
  if (params.sttProvider !== 'auto') {
    const result = await transcribeWithSelectedProvider(
      params.sttProvider,
      params,
      signal,
      DICTATION_PROVIDER_TIMEOUT_MS,
      true,
    )
    return normalizeDictationSuccess(result)
  }

  const providers: Array<Exclude<SttProvider, 'auto'>> = ['whisper', 'google', 'groq']
  let attemptedProvider = false
  let retryable = false

  for (const provider of providers) {
    if (signal.aborted) return internalTranscriptionFailure('CANCELLED', false)
    const result = normalizeDictationSuccess(await transcribeWithSelectedProvider(
      provider,
      params,
      signal,
      DICTATION_PROVIDER_TIMEOUT_MS,
      false,
    ))

    if (result.success || result.errorCode === 'NO_SPEECH' || result.errorCode === 'CANCELLED') {
      return result
    }
    if (result.errorCode !== 'NO_API_KEY') attemptedProvider = true
    retryable ||= result.retryable
  }

  return internalTranscriptionFailure(
    attemptedProvider ? 'ALL_PROVIDERS_FAILED' : 'ALL_PROVIDERS_EXHAUSTED',
    retryable,
  )
}

async function transcribeLive(
  params: TranscribeAudioParams,
  signal: AbortSignal,
): Promise<InternalTranscribeResult> {
  if (params.sttProvider === 'auto') {
    return transcribeAuto(
      params.audioData,
      params.mimeType,
      params.language,
      params.previousText,
      signal,
    )
  }
  return transcribeWithSelectedProvider(
    params.sttProvider,
    params,
    signal,
    WHISPER_TIMEOUT_MS,
    params.sttProvider === 'whisper',
  )
}

// ─── Pre-flight: check provider availability ──────────────────────────────────

/**
 * Check which STT providers are configured and pre-warm the session cache.
 *
 * Called before opening a Live Translate session so the pipeline knows
 * immediately which provider to use on the first audio chunk.
 *
 * Uses `hasStoredApiKey` (checks key existence in keychain metadata without
 * decryption — instant, no API calls, no cost) rather than live API probes.
 * Key validity is discovered naturally on first real transcription call.
 *
 * Side effect: pre-warms `whisperSessionAvailable` so the first audio chunk
 * goes directly to the best available provider without any Whisper attempt.
 */
async function checkSttProviders(): Promise<SttProviderCheckResult> {
  const hasOpenAI = hasStoredApiKey('openai')
  const hasGemini = hasStoredApiKey('gemini')
  const hasGroq   = hasStoredApiKey('groq')

  const available: Array<'whisper' | 'gemini' | 'groq'> = []
  if (hasOpenAI) available.push('whisper')
  if (hasGemini) available.push('gemini')
  if (hasGroq)   available.push('groq')

  const primary = available[0] ?? 'none'

  // ── Pre-warm session caches ───────────────────────────────────────────────
  // If a provider is not configured, mark it unavailable so the first real
  // audio chunk goes directly to the next available provider.
  // If a key was added since the last check, reset the ban so it is retried.

  if (!hasOpenAI && whisperSessionAvailable) {
    whisperSessionAvailable   = false
    whisperUnavailableUntilMs = Number.MAX_SAFE_INTEGER
    console.log('[transcribe] pre-flight: no OpenAI key → Whisper pre-marked unavailable for session')
  } else if (hasOpenAI && !whisperSessionAvailable) {
    whisperSessionAvailable   = true
    whisperUnavailableUntilMs = 0
    console.log('[transcribe] pre-flight: OpenAI key present → Whisper session cache reset to available')
  }

  if (!hasGemini && geminiSessionAvailable) {
    geminiSessionAvailable   = false
    geminiUnavailableUntilMs = Number.MAX_SAFE_INTEGER
    console.log('[transcribe] pre-flight: no Gemini key → Gemini pre-marked unavailable for session')
  } else if (hasGemini && !geminiSessionAvailable) {
    // Key was added or a previous ban expired — reset so Gemini is tried next chunk
    geminiSessionAvailable   = true
    geminiUnavailableUntilMs = 0
    console.log('[transcribe] pre-flight: Gemini key present → Gemini session cache reset to available')
  }

  console.log(`[transcribe] pre-flight: primary=${primary} available=[${available.join(', ')}]`)
  return { primary, available }
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

export function registerTranscribeHandlers(ipcMain: IpcMain) {
  ipcMain.handle('audio:transcribe', async (_event, rawParams: unknown): Promise<TranscribeResult> => {
    const parsed = parseTranscribeParams(rawParams)
    if (!parsed.ok) return parsed.response
    const params = parsed.value
    if (activeTranscriptions.has(params.requestId)) return invalidInput()

    const controller = new AbortController()
    activeTranscriptions.set(params.requestId, controller)
    try {
      const result = params.purpose === 'dictation'
        ? await transcribeDictation(params, controller.signal)
        : await transcribeLive(params, controller.signal)
      return toExternalTranscribeResult(result)
    } catch (error) {
      return toExternalTranscribeResult(classifyTranscriptionError(error, 'Audio'))
    } finally {
      if (activeTranscriptions.get(params.requestId) === controller) {
        activeTranscriptions.delete(params.requestId)
      }
    }
  })

  ipcMain.handle(
    'audio:cancelTranscription',
    async (_event, rawParams: unknown): Promise<CancelAudioTranscriptionResult> => {
      const params = parseCancelParams(rawParams)
      if (!params) {
        return { success: false, errorCode: 'INVALID_INPUT', retryable: false }
      }
      const controller = activeTranscriptions.get(params.requestId)
      controller?.abort()
      return { success: true, cancelled: Boolean(controller) }
    },
  )

  ipcMain.handle('audio:checkSttProviders', async (): Promise<SttProviderCheckResult> => {
    return checkSttProviders()
  })
}

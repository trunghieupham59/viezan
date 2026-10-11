/**
 * useLiveTranslate — encapsulates all business logic for the Live Translate pipeline.
 *
 * Extracted from LiveTranslatePage to separate concerns:
 *  - Audio capture (mic / system) & VAD (Voice Activity Detection, three-gate)
 *  - STT → Whisper confidence gates → hallucination filters
 *  - Translation pipeline with sentence-boundary buffering + context
 *  - Subtitle overlay IPC integration
 *  - AI summarization
 *  - Session auto-save to history
 *
 * The page component owns only UI-copy state (`copiedRaw`, `copiedTx`,
 * `copiedSummary`) and pure render logic.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createAudioTranscriptionRequestId, getSupportedAudioMimeType } from '../constants/audio'
import { LANG_NAMES_FOR_AI } from '../constants/langNames'
import { MIN_AUDIO_BLOB_BYTES } from '../constants/ui'
import { useAppStore, useT } from '../store/useAppStore'
import type { AIModelSelection, Provider, SttBackend, SubtitleSettings, UsageCost } from '../types'
import { createClientId } from '../utils/id'
import { countWords, isHallucination } from '../utils/live-translate'
import { combineUsageCosts, estimateUsageCost } from '../utils/usageCost'
import { float32ToWav } from '../utils/wav-encoder'
import { createLiveAIModelSelectionBoundary } from './live/aiModelSelectionBoundary'
import {
  checkDuplicateChunk,
  isFlushGenerationValid,
  joinTranslationsInOrder,
  releaseCaptureResources,
  resolveLiveSessionSave,
} from './live/liveSessionHelpers'
import {
  DEFAULT_SPEAKER_DIARIZATION_POLICY,
  INITIAL_SPEAKER_DIARIZATION_STATE,
  resolveSpeakerForCompletedChunk,
} from './live/speakerDiarization'
import { appendRawTranscript, assembleCompletedSentences, getWhisperParts } from './live/transcriptAssembly'
import { useLiveAiActions } from './live/useLiveAiActions'
import {
  ADAPTIVE_VAD_DISCARD_THRESHOLD,
  ADAPTIVE_VAD_EVAL_WINDOW,
  ADAPTIVE_VAD_MIN_CHUNKS,
  AVG_LOGPROB_MIN,
  CHUNK_MAX_QUEUE_AGE_MS,
  COMPRESSION_RATIO_MAX,
  getInitialVadPolicy,
  MAX_RAW_TRANSCRIPT_CHARS,
  MAX_WORDS_PER_CHUNK,
  MAX_WORDS_PER_SEC,
  MIC_GAIN,
  MIN_CHUNK_RECORD_MS,
  NO_SPEECH_PROB_MAX,
  SILENCE_RESET_CHUNKS,
  SYSTEM_AUD_GAIN,
  VAD_FLIP_RATE_HIGH,
  VAD_FLIP_RATE_LOW,
  VAD_MAX_HANGOVER_SAMPLES,
  VAD_SAMPLE_INTERVAL,
  type VadParams,
} from './live/vadPolicy'

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * Maximum recording window per chunk.
 *
 * 2000 ms gives Whisper enough audio context to decode words accurately.
 * Combined with VAD early-stop (below), typical chunks finish in 800-1600 ms.
 * Whisper performs better with slightly longer chunks — 2 s is a safe floor.
 */
const CHUNK_DURATION_MS    = 2000

/**
 * STT chunks accumulate into a pending buffer until a sentence boundary is
 * detected (. ! ? 。 ！ ？ etc.).  Only complete sentences are translated —
 * they are then locked and never re-translated.
 *
 * FALLBACK: if MAX_PENDING_CHUNKS STT results arrive with no punctuation
 * (common with Japanese / Whisper), the whole buffer is force-translated so
 * the user is never stuck waiting indefinitely.
 *
 * Reduced from 3 to 2 — force-translate after 3 s of incomplete sentences
 * instead of 4.5 s.
 */
const MAX_PENDING_CHUNKS   = 2

/**
 * Number of recently-completed sentences to send as translation CONTEXT.
 * Gives the AI enough background to understand names, terms, and topic flow
 * without growing the prompt indefinitely.
 */
const CONTEXT_SENTENCES    = 2

/**
 * A single translated segment with speaker label.
 * Segments are built in real-time as speech is transcribed + translated.
 * Speaker labels are inferred from silence pauses between speakers (VAD-based diarization).
 */
export interface LiveSegment {
  id: string
  rawText: string
  translation: string
  speaker: string    // e.g. 'Speaker 1', 'Speaker 2'
  timestamp: number
}

/** Default subtitle appearance settings — also used by reset button in LiveTranslatePage */
export const DEFAULT_SUBTITLE_SETTINGS = {
  textColor: '#ffffff',
  fontSize:  18,
  bgOpacity: 84,
} as const satisfies SubtitleSettings

/**
 * Maximum characters sent to the AI for summarization / action items / decisions.
 * Keeps the last N chars of each section (most recent & relevant content).
 * Avoids token-limit errors on long sessions while giving the model enough context.
 */
const MAX_SUMMARIZE_SECTION_CHARS = 10_000

/** How long (ms) a pipeline error toast is shown before auto-dismissing. */
const PIPELINE_ERROR_DISPLAY_MS = 4_000

/**
 * Maximum chars of `previousText` passed to Whisper as decoder prompt.
 * Whisper's prompt window is ~224 tokens; keep well under to avoid truncation.
 */
const MAX_PREVIOUS_TEXT_CHARS = 200

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLiveTranslate() {
  const t = useT()
  const {
    sourceLang, targetLang, selectedProvider, selectedModels, keyStatus,
    sttProvider, locale,
    addLiveSession, updateLiveSession,
    viewingLiveSessionId, liveSessions, setViewingLiveSession,
    setSelectedProvider, setSelectedModel, setTargetLang,
    recordUsageCost,
  } = useAppStore()

  // 'mic'    = microphone only (getUserMedia)
  // 'system' = system audio only (getDisplayMedia), no microphone
  // 'both'   = system audio (getDisplayMedia) + microphone — mixed
  const [audioMode,      setAudioMode]      = useState<'mic' | 'system' | 'both'>('system')

  // macOS Screen Recording permission: null = not checked yet
  const [screenPermission, setScreenPermission] = useState<string | null>(null)

  const [isActive,       setIsActive]       = useState(false)
  const [rawTranscript,  setRawTranscript]  = useState('')
  const [translation,    setTranslation]    = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isTranslating,  setIsTranslating]  = useState(false)
  const [micError,       setMicError]       = useState<string | null>(null)
  const [pipelineError,  setPipelineError]  = useState<string | null>(null)
  /** 'energy' (default) or 'silero' (auto-upgraded when noisy). Exposed for UI indicator. */
  const [vadMode,        setVadMode]        = useState<'energy' | 'silero'>('energy')
  /**
   * Active STT backend for this session — set by pre-flight check on mount and
   * whenever keyStatus changes. Exposed to the UI to show a provider badge so
   * the user always knows which backend will handle their audio.
   */
  const [activeSttProvider, setActiveSttProvider] = useState<SttBackend | 'none'>('none')

  // ── Subtitle overlay state ─────────────────────────────────────────────────
  const [showSubtitles,      setShowSubtitles]      = useState(false)
  const [latestSubtitle,     setLatestSubtitle]     = useState('')
  const [showSubtitleConfig, setShowSubtitleConfig] = useState(false)
  const [subtitleSettings,   setSubtitleSettings]   = useState<SubtitleSettings>({ ...DEFAULT_SUBTITLE_SETTINGS })
  // Ref so processChunk (a stable useCallback) can read current subtitle state
  const showSubtitlesRef = useRef(false)
  useEffect(() => { showSubtitlesRef.current = showSubtitles }, [showSubtitles])

  // ── Realtime segments (speaker-labeled transcript) ─────────────────────────
  const [segments,    setSegments]    = useState<LiveSegment[]>([])
  // Interim text: accumulated but not yet sentence-complete (shown in gray)
  const [pendingText, setPendingText] = useState('')

  // Speaker tracking refs — stable refs readable in processChunk useCallback.
  const currentSpeakerRef        = useRef(INITIAL_SPEAKER_DIARIZATION_STATE.currentSpeaker)
  const speakerCountRef          = useRef(INITIAL_SPEAKER_DIARIZATION_STATE.speakerCount)
  const silenceBeforeChunkRef    = useRef(0)   // silent chunks captured before last speech chunk
  const lastSpeakerChangeTimeRef = useRef(INITIAL_SPEAKER_DIARIZATION_STATE.lastSpeakerChangeTime)
  const speakerTurnHistoryRef    = useRef<string[]>([...INITIAL_SPEAKER_DIARIZATION_STATE.turnHistory])

  // ── Summary + Speaker analysis state ──────────────────────────────────────
  const [showSummaryBtn,       setShowSummaryBtn]       = useState(false)
  const [summary,              setSummary]              = useState<string | null>(null)
  const [isSummarizing,        setIsSummarizing]        = useState(false)
  const [speakerAnalysis,      setSpeakerAnalysis]      = useState<string | null>(null)
  const [isAnalyzingSpeakers,  setIsAnalyzingSpeakers]  = useState(false)

  // ── Action Items + Decisions state ────────────────────────────────────────
  const [actionItems,             setActionItems]             = useState<string | null>(null)
  const [decisions,               setDecisions]               = useState<string | null>(null)
  const [isExtractingActionItems, setIsExtractingActionItems] = useState(false)
  const [isExtractingDecisions,   setIsExtractingDecisions]   = useState(false)

  // ── Speaker name map + session start time ─────────────────────────────────
  /** Maps original speaker labels (e.g. 'Speaker 1') to user-assigned names */
  const [speakerNameMap,   setSpeakerNameMap]   = useState<Record<string, string>>({})
  const [sessionStartTime, setSessionStartTime] = useState<number>(0)

  // Stable ref so audio callbacks always read fresh params
  const paramsRef = useRef({ sourceLang, targetLang, selectedProvider, selectedModels, sttProvider })
  useEffect(() => {
    paramsRef.current = { sourceLang, targetLang, selectedProvider, selectedModels, sttProvider }
  }, [sourceLang, targetLang, selectedProvider, selectedModels, sttProvider])
  const aiModelBoundaryRef = useRef(createLiveAIModelSelectionBoundary())
  const getConfiguredAIModel = useCallback((): AIModelSelection => {
    const { selectedProvider: provider, selectedModels: models } = paramsRef.current
    return { provider, model: models[provider] }
  }, [])
  const getSessionAIModel = useCallback(() => (
    aiModelBoundaryRef.current.resolve(getConfiguredAIModel())
  ), [getConfiguredAIModel])

  const pendingBufferRef     = useRef('')
  const pendingChunkCountRef = useRef(0)
  const recentSentencesRef   = useRef<string[]>([])
  const fullRawForSummaryRef = useRef('')
  const fullTxForSummaryRef  = useRef('')
  const lastChunkTextRef     = useRef('')
  /** Wall-clock time lastChunkTextRef was accepted — bounds the exact-duplicate window. */
  const lastChunkAtRef       = useRef(0)
  /**
   * Segment ids in creation order + their finished translations. The aggregate
   * translation (UI + history/summary) is rebuilt from this order, because
   * concurrent translation streams complete out of order.
   */
  const segmentOrderRef      = useRef<string[]>([])
  const segmentTranslationsRef = useRef(new Map<string, string>())
  const liveCostRef         = useRef<UsageCost | undefined>(undefined)

  const streamRef      = useRef<MediaStream | null>(null)
  const recorderRef    = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const activeRef      = useRef(false)
  const queueRef       = useRef<Promise<void>>(Promise.resolve())
  /** Main-process STT requests that still belong to this mounted live session. */
  const activeSttRequestIdsRef = useRef(new Set<string>())
  /**
   * Generation token — bumped on every handleStart/handleClear/handleStop.
   * In-flight processChunk callbacks compare their captured generation with
   * the current ref; if mismatched, they skip all setState/ref writes to
   * prevent ghost transcript/translation appearing after the user clears or
   * starts a new session while old chunks are still resolving.
   */
  const generationRef  = useRef(0)
  /** setTimeout handle for the per-chunk hard-stop fallback; cleared on stop. */
  const chunkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /**
   * Session sequence — bumped on every handleStart and every teardown (unlike
   * generationRef it is NOT bumped by handleClear). Async setup steps (screen
   * picker, mic prompt, Silero import) capture it and bail out when it changed,
   * so a Stop/restart during an await can never leave a live resource behind.
   */
  const sessionSeqRef = useRef(0)
  /**
   * Every MediaStream acquired for the running session (display stream incl. its
   * video tracks, raw mic stream, destination streams). teardown() stops them all;
   * streamRef alone only covers the MediaRecorder source.
   */
  const captureStreamsRef = useRef<MediaStream[]>([])
  /** True only while an orderly Stop destroys Silero VAD, so its final onSpeechEnd chunk is still processed. */
  const finalFlushingRef = useRef(false)
  /** Recorder whose last chunk must still be transcribed (set by an orderly Stop only). */
  const finalFlushRecorderRef = useRef<MediaRecorder | null>(null)
  /**
   * Generation captured right AFTER an orderly Stop bumped it (null otherwise).
   * A final-flush chunk is only valid while generationRef still equals this —
   * any later Clear/Start/unmount bumps the generation and invalidates it.
   */
  const flushGenerationRef = useRef<number | null>(null)

  /**
   * mountedRef — set to false on component unmount.
   * Guards all async setState calls in processChunk and background translation
   * to prevent "setState on unmounted component" errors and memory leaks
   * when a live session is stopped while translation/STT calls are in-flight.
   */
  const mountedRef = useRef(true)

  const cancelActiveSttRequests = useCallback(() => {
    const requestIds = [...activeSttRequestIdsRef.current]
    activeSttRequestIdsRef.current.clear()
    for (const requestId of requestIds) {
      void window.api.cancelAudioTranscription({ requestId }).catch(() => undefined)
    }
  }, [])

  const addLiveUsageCost = useCallback((cost: UsageCost) => {
    recordUsageCost(cost)
    liveCostRef.current = combineUsageCosts([liveCostRef.current, cost], 'live')
  }, [recordUsageCost])

  const audioCtxRef        = useRef<AudioContext | null>(null)
  const analyserRef        = useRef<AnalyserNode | null>(null)
  const hasSpeechRef       = useRef(false)
  const speechCountRef     = useRef(0)
  const vadTimerRef        = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Silero VAD (mic mode) ─────────────────────────────────────────────────
  // micVadRef       — active MicVAD instance; null when using system/both mode.
  // lastSpeechEndTimeRef — wall-clock timestamp of the last onSpeechEnd event;
  //   used to compute inter-utterance silence for speaker diarization without
  //   a polling timer.
  // biome-ignore lint/suspicious/noExplicitAny: MicVAD type is not re-exported by the library
  const micVadRef            = useRef<any>(null)
  const lastSpeechEndTimeRef = useRef<number>(0)

  // ── Adaptive VAD quality monitor ──────────────────────────────────────────
  const vadModeStateRef    = useRef<'energy' | 'silero'>('energy')
  const adaptiveChunksRef  = useRef(0)
  const adaptiveDiscardRef = useRef(0)
  const upgradeVADRef      = useRef<(() => Promise<void>) | null>(null)

  // Counts consecutive chunks where VAD detected no speech.
  // When it hits SILENCE_RESET_CHUNKS, the decoder context is wiped so stale
  // transcript from before a long pause cannot bias the next decode cycle.
  const silentChunkCountRef = useRef(0)

  // ── VAD policy engine ──────────────────────────────────────────────────────
  // vadPolicyRef: active VAD parameters, adapted online after each chunk.
  //   Initialised from getInitialVadPolicy(audioMode) on session start.
  // vadModeRef:   stores the current audio mode so the policy can reset to
  //   its source-appropriate default when relaxing after a stable period.
  const vadPolicyRef = useRef<VadParams>(getInitialVadPolicy('mic'))
  const vadModeRef   = useRef<'mic' | 'system' | 'both'>('mic')

  // Timer ref for auto-clearing pipelineError — avoids stale closures in processChunk
  const pipelineErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const rawEndRef        = useRef<HTMLDivElement>(null)
  const txEndRef         = useRef<HTMLDivElement>(null)
  const sessionIdRef     = useRef<string | null>(null)
  const sessionStartRef  = useRef<number>(0)
  // Mirror refs for segments + speakerNameMap — readable from stable useCallbacks
  const segmentsRef       = useRef<LiveSegment[]>([])
  const speakerNameMapRef = useRef<Record<string, string>>({})

  const hasOpenAIKey = keyStatus.openai
  // Object.values(...).some() is cheap enough that useMemo overhead dwarfs
  // the saving on every render.
  const hasAnyKey    = Object.values(keyStatus).some(Boolean)
  const isMac        = window.api?.platform === 'darwin'

  // ── Check Screen Recording permission ────────────────────────────────────────
  const checkScreenPermission = useCallback(async () => {
    if (!isMac) { setScreenPermission('granted'); return }
    try {
      const status = await window.api?.checkScreenPermission()
      setScreenPermission(status)
    } catch {
      setScreenPermission('unknown')
    }
  }, [isMac])

  // Check permission when switching to system / both mode, and re-check when window regains focus
  useEffect(() => {
    if (audioMode === 'system' || audioMode === 'both') {
      checkScreenPermission()
    }
  }, [audioMode, checkScreenPermission])

  useEffect(() => {
    if ((audioMode !== 'system' && audioMode !== 'both') || !isMac) return
    const onFocus = () => checkScreenPermission()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [audioMode, isMac, checkScreenPermission])

  // Keep mirror refs in sync for stable useCallback access
  useEffect(() => { segmentsRef.current = segments }, [segments])
  useEffect(() => { speakerNameMapRef.current = speakerNameMap }, [speakerNameMap])

  // biome-ignore lint/correctness/useExhaustiveDependencies: rawTranscript.length is the intentional trigger
  useEffect(() => { rawEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [rawTranscript.length])
  // biome-ignore lint/correctness/useExhaustiveDependencies: translation.length is the intentional trigger
  useEffect(() => { txEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [translation.length])

  // ── Restore historical session when navigating from history ───────────────
  // When the user clicks "Xem" on a live history item, viewingLiveSessionId is
  // set in the store before navigating here.  This effect detects that change,
  // finds the matching session, and pre-populates the UI state so the user can
  // read the transcript, translation, and summary without starting a new recording.
  // biome-ignore lint/correctness/useExhaustiveDependencies: liveSessions intentionally omitted — only re-run when the target session ID changes
  useEffect(() => {
    if (!viewingLiveSessionId) return
    const session = liveSessions.find((s) => s.id === viewingLiveSessionId)
    if (!session) return

    setRawTranscript(session.rawTranscript)
    setTranslation(session.translation)
    setSummary(session.summary ?? null)
    setSpeakerAnalysis(session.speakerAnalysis ?? null)
    setActionItems(session.actionItems ?? null)
    setDecisions(session.decisions ?? null)
    setSpeakerNameMap(session.speakerNameMap ?? {})
    if (session.segments?.length) setSegments(session.segments)
    setShowSummaryBtn(!!session.rawTranscript)
    aiModelBoundaryRef.current.restore({
      provider: session.provider,
      model: session.model,
    })
    fullRawForSummaryRef.current = session.rawTranscript
    fullTxForSummaryRef.current  = session.translation
    sessionIdRef.current         = session.id
  }, [viewingLiveSessionId])

  // Centralised pipeline-error display: clears any prior timer before scheduling
  // the next auto-dismiss so back-to-back errors don't truncate each other.
  const showPipelineError = useCallback((msg: string) => {
    if (!mountedRef.current) return
    setPipelineError(msg)
    if (pipelineErrorTimerRef.current) clearTimeout(pipelineErrorTimerRef.current)
    pipelineErrorTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setPipelineError(null)
    }, PIPELINE_ERROR_DISPLAY_MS)
  }, [])

  // ── Teardown (single, idempotent release path) ──────────────────────────────
  /**
   * Releases every capture resource: recorder, Silero VAD, timers, ALL acquired
   * media streams (mic + display + destination), analyser and AudioContext.
   * Used by Stop, unmount, pipeline errors and STT exhaustion. Safe to call
   * repeatedly. `flush: true` (orderly Stop only) lets the last VAD/recorder
   * chunk still be transcribed — it never allows new capture.
   */
  const teardown = useCallback((opts?: { flush?: boolean }) => {
    const flush = opts?.flush === true
    activeRef.current = false
    sessionSeqRef.current += 1

    if (vadTimerRef.current) { clearInterval(vadTimerRef.current); vadTimerRef.current = null }
    if (chunkTimeoutRef.current) { clearTimeout(chunkTimeoutRef.current); chunkTimeoutRef.current = null }

    // ── Silero VAD cleanup (mic mode) ───────────────────────────────────────
    // destroy() stops the AudioWorklet and releases the internal MediaStream.
    // It is async: pause() emits the in-progress utterance through onSpeechEnd
    // only after awaiting, so the final-flush flag stays up until it settles.
    // Must be called BEFORE stopping stream tracks to avoid double-stop errors.
    const vad = micVadRef.current
    micVadRef.current = null
    if (vad) {
      finalFlushingRef.current = flush
      const clearFlush = () => { finalFlushingRef.current = false }
      try {
        void Promise.resolve(vad.destroy()).catch(() => undefined).then(clearFlush)
      } catch {
        clearFlush()
      }
    }
    lastSpeechEndTimeRef.current = 0
    upgradeVADRef.current        = null
    adaptiveChunksRef.current    = 0
    adaptiveDiscardRef.current   = 0

    const recorder = recorderRef.current
    recorderRef.current = null
    if (recorder && recorder.state !== 'inactive') {
      if (flush) finalFlushRecorderRef.current = recorder
      try { recorder.stop() } catch { /* recorder already inactive */ }
    }

    const streams = [...captureStreamsRef.current, streamRef.current]
    captureStreamsRef.current = []
    streamRef.current = null
    const audioCtx = audioCtxRef.current
    const analyser = analyserRef.current
    audioCtxRef.current = null
    analyserRef.current = null
    releaseCaptureResources({ streams, analyser, audioCtx })
  }, [])

  /**
   * Writes the accumulated session to history (no-op without transcript/session id).
   * Upsert: a session id that is already in history is updated (keeping its
   * createdAt, summary, action items…), never added twice.
   */
  const saveSession = useCallback(() => {
    const raw = fullRawForSummaryRef.current.trim()
    const id = sessionIdRef.current
    if (!raw || !id) return
    const { sourceLang, targetLang } = paramsRef.current
    const aiModel = getSessionAIModel()
    const fields = {
      sourceLang,
      targetLang,
      provider: aiModel.provider,
      model: aiModel.model,
      rawTranscript: raw,
      translation: fullTxForSummaryRef.current.trim(),
      wordCount: countWords(raw),
      cost: liveCostRef.current,
      segments: segmentsRef.current,
      speakerNameMap: Object.keys(speakerNameMapRef.current).length > 0
        ? speakerNameMapRef.current
        : undefined,
    }
    const existingIds = useAppStore.getState().liveSessions.map((s) => s.id)
    if (resolveLiveSessionSave(existingIds, id) === 'update') {
      updateLiveSession(id, fields)
    } else {
      addLiveSession({ id, createdAt: sessionStartRef.current || Date.now(), ...fields })
    }
  }, [addLiveSession, updateLiveSession, getSessionAIModel])
  // Unmount cleanup reads the latest saver through a ref so its effect never re-runs
  // (a re-run would tear down a live session).
  const saveSessionRef = useRef(saveSession)
  useEffect(() => { saveSessionRef.current = saveSession }, [saveSession])

  /** Orderly end of a session: teardown + UI reset + auto-save to history. */
  const stopSession = useCallback((opts: { flush: boolean }) => {
    // Bump generation so any STT/translation already in flight stops writing
    // back into the now-stopped session's state.
    generationRef.current += 1
    // The flush chunk is valid only for THIS generation: a later Clear/Start
    // bumps it, so the old recorder/VAD flush can never reach a fresh session.
    flushGenerationRef.current = opts.flush ? generationRef.current : null
    cancelActiveSttRequests()
    setIsActive(false)
    setIsTranscribing(false)
    setIsTranslating(false)
    teardown({ flush: opts.flush })

    if (fullRawForSummaryRef.current.trim()) {
      setShowSummaryBtn(true)
      // Auto-save session to history
      saveSession()
    }
  }, [cancelActiveSttRequests, teardown, saveSession])

  // ── Core pipeline ───────────────────────────────────────────────────────────
  const processChunk = useCallback(async (blob: Blob, mimeType: string, opts?: { finalFlush?: boolean }) => {
    if (blob.size < MIN_AUDIO_BLOB_BYTES) return
    // Session/clear-aware guards: skip stale chunks left over from a previous
    // session whose API requests resolved late. The one exception is the final
    // chunk flushed by an orderly Stop (VAD/recorder end-of-utterance).
    if (!activeRef.current && !opts?.finalFlush) return
    const chunkGeneration = generationRef.current

    // ── Adaptive VAD: count chunk in rolling evaluation window ────────────
    adaptiveChunksRef.current += 1

    const { sourceLang, targetLang, sttProvider } = paramsRef.current
    const aiModel = getSessionAIModel()

    // ── STT call — keep reference to full result for confidence gate ──────
    if (mountedRef.current) setIsTranscribing(true)
    let stt: Awaited<ReturnType<typeof window.api.transcribeAudio>> | null = null
    const requestId = createAudioTranscriptionRequestId()
    activeSttRequestIdsRef.current.add(requestId)
    try {
      const buf = await blob.arrayBuffer()
      // Cap previousText so it never approaches Whisper's ~224-token prompt window.
      const prev = lastChunkTextRef.current
      const cappedPrev = prev && prev.length > MAX_PREVIOUS_TEXT_CHARS
        ? prev.slice(-MAX_PREVIOUS_TEXT_CHARS)
        : prev
      stt = await window.api?.transcribeAudio({
        requestId,
        purpose:     'live',
        audioData:    buf,
        mimeType,
        language:     sourceLang === 'auto' ? undefined : sourceLang,
        // Pass the last successfully transcribed text as Whisper's prompt
        // context.  Whisper treats it as "speech already in progress",
        // maintaining terminology consistency across chunks and preventing
        // the decoder from drifting to a YouTube-caption style opening.
        previousText: cappedPrev || undefined,
        sttProvider,
      })
    } catch {
      showPipelineError(t.live_error_stt_failed)
    }
    finally {
      activeSttRequestIdsRef.current.delete(requestId)
      if (mountedRef.current) setIsTranscribing(false)
    }

    // Drop result if user stopped/cleared/restarted while STT was in flight —
    // continuing would push old text into the new session's transcript.
    if (chunkGeneration !== generationRef.current) return

    // In 'auto' mode, update the badge to reflect the provider that actually
    // handled this chunk — Whisper may have been skipped (session cache) or
    // fallen back to Gemini/Groq due to an error.  usedProvider tells us
    // the truth; without this the badge stays on the pre-flight default forever.
    if (mountedRef.current && stt?.success && stt.usedProvider
        && paramsRef.current.sttProvider === 'auto') {
      setActiveSttProvider(stt.usedProvider as SttBackend)
    }

    // ── All-providers-exhausted guard ────────────────────────────────────────
    // If every STT provider in the chain failed (Whisper → Gemini → Groq all
    // down or misconfigured), continue transcribing is impossible.  Stop the
    // session immediately and surface a persistent error so the user knows
    // why recording halted — silent audio drops with no feedback are confusing.
    if (stt && !stt.success && stt.errorCode === 'ALL_PROVIDERS_EXHAUSTED') {
      if (mountedRef.current) {
        // Stop the live pipeline without waiting for the user to click Stop:
        // same teardown + auto-save as Stop, so recorder/stream/AudioContext/VAD
        // are released and a later Start cannot leak them. An already-stopped
        // session (final-flush chunk) was saved by Stop, so don't save twice.
        if (activeRef.current) stopSession({ flush: false })
        setIsActive(false)
        setIsTranscribing(false)
        setIsTranslating(false)
        // Show a persistent error (micError, not pipelineError) — it doesn't
        // auto-dismiss so the user must acknowledge before retrying.
        setMicError(t.live_error_all_stt_exhausted)
      }
      return
    }

    if (!stt?.success) {
      if (stt?.errorCode !== 'CANCELLED') showPipelineError(t.live_error_stt_failed)
      return
    }

    const newText = stt.text.trim()
    if (!newText || isHallucination(newText)) {
      // ── Adaptive VAD: noise-discard (empty / hallucinated output) ────────
      adaptiveDiscardRef.current += 1
      if (vadModeStateRef.current === 'energy') {
        if (adaptiveChunksRef.current >= ADAPTIVE_VAD_MIN_CHUNKS &&
            adaptiveDiscardRef.current / adaptiveChunksRef.current > ADAPTIVE_VAD_DISCARD_THRESHOLD) {
          void upgradeVADRef.current?.()
          adaptiveChunksRef.current  = 0
          adaptiveDiscardRef.current = 0
        } else if (adaptiveChunksRef.current >= ADAPTIVE_VAD_EVAL_WINDOW) {
          adaptiveChunksRef.current  = 0
          adaptiveDiscardRef.current = 0
        }
      }
      return
    }

    // ── Whisper confidence gate (verbose_json segment signals) ────────────
    // These are Whisper's own internal estimates returned via verbose_json.
    // They are the most reliable hallucination indicators available from
    // the OpenAI API and should be treated as mandatory gates.
    //
    //  noSpeechProb    > NO_SPEECH_PROB_MAX    → model is ≥65% sure no speech
    //  avgLogprob      < AVG_LOGPROB_MIN       → model is not confident in tokens
    //  compressionRatio > COMPRESSION_RATIO_MAX → output is anomalously repetitive
    if (typeof stt.noSpeechProb === 'number' && stt.noSpeechProb > NO_SPEECH_PROB_MAX) {
      // ── Adaptive VAD: Whisper says no speech detected ────────────────────
      adaptiveDiscardRef.current += 1
      if (vadModeStateRef.current === 'energy') {
        if (adaptiveChunksRef.current >= ADAPTIVE_VAD_MIN_CHUNKS &&
            adaptiveDiscardRef.current / adaptiveChunksRef.current > ADAPTIVE_VAD_DISCARD_THRESHOLD) {
          void upgradeVADRef.current?.()
          adaptiveChunksRef.current  = 0
          adaptiveDiscardRef.current = 0
        } else if (adaptiveChunksRef.current >= ADAPTIVE_VAD_EVAL_WINDOW) {
          adaptiveChunksRef.current  = 0
          adaptiveDiscardRef.current = 0
        }
      }
      return
    }
    if (typeof stt.avgLogprob === 'number'      && stt.avgLogprob      < AVG_LOGPROB_MIN)       return
    if (typeof stt.compressionRatio === 'number' && stt.compressionRatio > COMPRESSION_RATIO_MAX) return

    // ── Max-words-per-chunk guard ─────────────────────────────────────────
    const wordCountGuard = newText.split(/\s+/).filter(Boolean).length
    if (wordCountGuard > MAX_WORDS_PER_CHUNK) return

    // ── Words-per-second rate guard ───────────────────────────────────────
    const wordsPerSec = wordCountGuard / (CHUNK_DURATION_MS / 1000)
    if (wordsPerSec > MAX_WORDS_PER_SEC) return

    // ── Duplicate / near-duplicate detection (enhanced) ───────────────────
    // 1. Exact match of the immediately previous chunk within a short window → drop
    // 2. New is fully a substring of last AND long (>= ~20 chars) → drop (Whisper
    //    re-emitted the same or shorter content). Short repeats such as "yes"
    //    after "yes, I think so" are legitimate and kept, as are continuations
    //    like "Hello" → "Hello, how are you?".
    // 3. Jaccard similarity on word bags (long text only) catches paraphrase-style duplicates.
    const acceptedAt = Date.now()
    const dup = checkDuplicateChunk(newText, lastChunkTextRef.current, lastChunkAtRef.current, acceptedAt)
    // An exact duplicate that is dropped still refreshes the window, so a looping
    // hallucination can't slip through every ~8 s.
    lastChunkAtRef.current = dup.lastAt
    if (dup.duplicate) return
    lastChunkTextRef.current = newText
    lastChunkAtRef.current   = acceptedAt

    fullRawForSummaryRef.current = appendRawTranscript(
      fullRawForSummaryRef.current,
      newText,
      MAX_RAW_TRANSCRIPT_CHARS,
    )
    if (mountedRef.current) setRawTranscript(fullRawForSummaryRef.current)

    const assembly = assembleCompletedSentences(
      getWhisperParts(newText, stt.segmentTexts),
      {
        pendingBuffer: pendingBufferRef.current,
        pendingChunkCount: pendingChunkCountRef.current,
      },
      MAX_PENDING_CHUNKS,
    )
    pendingBufferRef.current = assembly.pendingBuffer
    pendingChunkCountRef.current = assembly.pendingChunkCount
    if (mountedRef.current) setPendingText(assembly.pendingText)
    const { completedSentences } = assembly

    // Orderly Stop saves the session synchronously, BEFORE this last chunk was
    // transcribed/translated. Once the flush chunk (and its translations) settle
    // and no Clear/Start happened since, persist again (upsert) so it isn't lost.
    const flushTranslations: Promise<void>[] = []
    const persistFlushedChunk = () => {
      if (!opts?.finalFlush || chunkGeneration !== generationRef.current) return
      if (mountedRef.current) setShowSummaryBtn(true)
      saveSession()
    }
    if (completedSentences.length === 0) { persistFlushedChunk(); return }

    // ── VAD-based speaker diarization (smart cycling) ─────────────────────
    // Runs once per chunk — the same speaker label is assigned to all sentences
    // completed within this audio window.
    //
    // Algorithm:
    //   1 known speaker  → any qualifying silence → introduce Speaker 2
    //   2 known speakers → short/medium silence   → alternate between them
    //                    → long silence (≥LONG_SILENCE_CHUNKS) → introduce Speaker 3
    //   3+ speakers      → short/medium gap → return to most-recent other speaker
    //                    → long gap         → introduce new speaker (up to MAX_SPEAKERS)
    //   MAX_SPEAKERS hit → always recycle Least-Recently-Used label
    //
    // This fixes the "speaker count only ever goes up" bug:
    //   Before: Speaker 1 → 2 → 3 → 4 → 5 …  (wrong for 1-on-1 meetings)
    //   After:  Speaker 1 → 2 → 1 → 2 → 1 …  (correct alternating pattern)
    const silenceBefore = silenceBeforeChunkRef.current
    silenceBeforeChunkRef.current = 0  // consume once

    const speakerState = resolveSpeakerForCompletedChunk(
      {
        currentSpeaker: currentSpeakerRef.current,
        speakerCount: speakerCountRef.current,
        lastSpeakerChangeTime: lastSpeakerChangeTimeRef.current,
        turnHistory: speakerTurnHistoryRef.current,
      },
      silenceBefore,
      Date.now(),
      DEFAULT_SPEAKER_DIARIZATION_POLICY,
    )
    currentSpeakerRef.current = speakerState.currentSpeaker
    speakerCountRef.current = speakerState.speakerCount
    lastSpeakerChangeTimeRef.current = speakerState.lastSpeakerChangeTime
    speakerTurnHistoryRef.current = speakerState.turnHistory
    const currentSpeaker = speakerState.currentSpeaker

    // ── Create one segment per completed sentence ─────────────────────────────
    // Each sentence from completedSentences gets its own row, segment ID, and
    // background translation — no more merged multi-sentence rows.
    for (const sentenceText of completedSentences) {
      // Add segment immediately so it shows in the left panel while translating.
      // Translation runs in the background — the queue is NOT blocked so the next
      // audio chunk can be STT'd immediately without waiting for translation.
      const segId = createClientId('seg')
      segmentOrderRef.current.push(segId)
      if (mountedRef.current) {
        const newSegment: LiveSegment = {
          id: segId,
          rawText: sentenceText,
          translation: '',   // will be filled in when background translation finishes
          speaker: currentSpeaker,
          timestamp: Date.now(),
        }
        // Mirror synchronously: the segmentsRef effect only catches up after the
        // next render, and the post-Stop flush save below reads this ref.
        segmentsRef.current = [...segmentsRef.current, newSegment]
        setSegments(prev => [...prev, newSegment])
      }

      // Update context BEFORE launching background translation so the next sentence
      // has the correct context even while this sentence is still being translated.
      recentSentencesRef.current.push(sentenceText)
      if (recentSentencesRef.current.length > CONTEXT_SENTENCES) recentSentencesRef.current.shift()

      // Fire translation in background (NOT awaited) — allows the STT queue to
      // continue processing the next audio chunk immediately.
      // Capture per-sentence values in IIFE params to avoid closure-over-loop bugs.
      const contextText = recentSentencesRef.current.slice(0, -1).join(' ') // context = previous sentences
      const sourceText  = contextText
        ? `[Context — for reference only, already translated. Do NOT retranslate]:\n"${contextText}"\n\n[Translate to ${targetLang}]:\n${sentenceText}`
        : sentenceText

      // Push the raw sentence to subtitle window so it can show the source text above translation.
      // Also pass segId so the subtitle window can create the entry immediately with a placeholder.
      if (showSubtitlesRef.current) {
        void window.api?.subtitle?.setSourceText(sentenceText, segId)
      }

      // Capture the chunk's generation so we can skip writing translation
      // results back into a session that has since been cleared/restarted.
      const capturedGeneration = chunkGeneration
      const translationTask = (async (capturedSegId: string, capturedSourceText: string) => {
        // Guard: skip all setState calls if component was unmounted while this
        // background translation was queued (e.g. user navigated away quickly).
        if (!mountedRef.current) return
        if (capturedGeneration !== generationRef.current) return
        setIsTranslating(true)
        try {
          const batchParams = {
            provider: aiModel.provider,
            model: aiModel.model,
            sourceText: capturedSourceText,
            sourceLang,
            targetLang,
            translationStyle: 'general' as const,
            showFurigana: false,
          }

          let txResult: { success: boolean; translatedText?: string }

          if (showSubtitlesRef.current) {
            try {
              txResult = await window.api?.translateStream({
                provider: aiModel.provider,
                model: aiModel.model,
                sourceText: capturedSourceText,
                sourceLang,
                targetLang,
                translationStyle: 'general',
                segId: capturedSegId,
              })
            } catch {
              txResult = { success: false }
            }
            if (!txResult.success) {
              txResult = await window.api?.translate(batchParams)
            }
          } else {
            txResult = await window.api?.translate(batchParams)
          }

          // Re-check mounted AND generation after awaited API calls (can take
          // 1–3 s). Generation mismatch means the user cleared/restarted the
          // session — silently drop the result so it doesn't bleed into the
          // new transcript.
          if (!mountedRef.current) return
          if (capturedGeneration !== generationRef.current) return
          if (txResult.success && txResult.translatedText) {
            const newTx = txResult.translatedText.trim()
            addLiveUsageCost(estimateUsageCost({
              feature: 'live',
              provider: aiModel.provider,
              model: aiModel.model,
              inputText: capturedSourceText,
              outputText: newTx,
            }))
            // Streams finish out of order — rebuild the aggregate from segment order.
            segmentTranslationsRef.current.set(capturedSegId, newTx)
            const orderedTx = joinTranslationsInOrder(segmentOrderRef.current, segmentTranslationsRef.current)
            setTranslation(orderedTx)
            setLatestSubtitle(newTx)
            fullTxForSummaryRef.current = orderedTx
            segmentsRef.current = segmentsRef.current.map(seg =>
              seg.id === capturedSegId ? { ...seg, translation: newTx } : seg
            )
            setSegments(prev => prev.map(seg =>
              seg.id === capturedSegId ? { ...seg, translation: newTx } : seg
            ))
          }
        } catch {
          // Translation failed silently — segment stays with empty translation
        } finally {
          // Guard the finally block: mountedRef may have flipped during the API call
          if (mountedRef.current && capturedGeneration === generationRef.current) {
            setIsTranslating(false)
          }
        }
      })(segId, sourceText)
      if (opts?.finalFlush) flushTranslations.push(translationTask)
    }
    if (opts?.finalFlush) void Promise.allSettled(flushTranslations).then(persistFlushedChunk)
  }, [addLiveUsageCost, getSessionAIModel, saveSession, showPipelineError, stopSession, t])

  // ── Recorder cycling with VAD ─────────────────────────────────────────────────
  const startChunk = useCallback(() => {
    const captureStream = streamRef.current
    if (!captureStream || !activeRef.current) return
    // Use the shared audio MIME type helper from constants/audio — single source of truth
    const mimeType = getSupportedAudioMimeType()
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(captureStream, mimeType ? { mimeType } : undefined)
    } catch {
      try {
        recorder = new MediaRecorder(captureStream)
      } catch (recorderErr) {
        // startChunk also runs from recorder.onstop, where a throw would be
        // swallowed and silently halt recording. End the session explicitly and
        // surface the failure through the persistent micError path.
        console.error('[live] MediaRecorder could not be created — stopping session:', recorderErr)
        stopSession({ flush: false })
        if (mountedRef.current) {
          setMicError(recorderErr instanceof Error ? recorderErr.message : String(recorderErr))
        }
        return
      }
    }
    audioChunksRef.current = []
    recorderRef.current = recorder

    hasSpeechRef.current   = false
    speechCountRef.current = 0

    // ── Capture active policy for this chunk ─────────────────────────────────
    // Read once at chunk start so the policy is stable for the entire chunk
    // even if adaptation fires mid-chunk in a future concurrent scenario.
    const policy = vadPolicyRef.current

    // Peak RMS tracker — tracks the highest RMS seen in this chunk.
    // Required to fire at least once above policy.peakRmsThreshold before speech
    // is confirmed, ruling out constant-level AC hum.
    let chunkPeakRms = 0

    // ── VAD state machine (WebRTC-style hysteresis) ──────────────────────────
    //
    //   consecutiveSpeechSamples — RESETS to 0 on any silence frame.
    //     Only N consecutive speech frames transition SILENCE → SPEECH.
    //
    //   postSpeechSilenceSamples — RESETS to 0 on any speech frame.
    //     Only M consecutive silence frames after confirmed speech trigger
    //     the hangover early-stop.
    //
    //   vadFlipCount — counts total SPEECH ↔ SILENCE state transitions.
    //     Passed to the online quality monitor in recorder.onstop to
    //     detect instability (high flip rate = noisy/music environment).
    let consecutiveSpeechSamples = 0   // consecutive speech frames (start trigger)
    let postSpeechSilenceSamples = 0   // consecutive silence frames after speech (hangover)
    let vadFlipCount = 0               // state transitions this chunk (for adaptation)
    let prevWasSpeech = false          // last frame's speech/silence classification
    const recordStartTime = Date.now()
    if (vadTimerRef.current) clearInterval(vadTimerRef.current)
    vadTimerRef.current = setInterval(() => {
      const analyser = analyserRef.current
      if (!analyser) return
      const data = new Uint8Array(analyser.fftSize)
      analyser.getByteTimeDomainData(data)
      const rms = Math.sqrt(data.reduce((sum, v) => sum + (v - 128) ** 2, 0) / data.length)
      if (rms > chunkPeakRms) chunkPeakRms = rms

      const isSpeechFrame = rms > policy.speechRmsThreshold
      // Count every SPEECH ↔ SILENCE transition for the quality monitor
      if (isSpeechFrame !== prevWasSpeech) { vadFlipCount++; prevWasSpeech = isSpeechFrame }

      if (isSpeechFrame) {
        // ── Speech frame ────────────────────────────────────────────────────
        consecutiveSpeechSamples += 1
        speechCountRef.current   += 1   // cumulative speech activity
        postSpeechSilenceSamples  = 0   // reset hangover counter

        // Start trigger: N consecutive frames above threshold AND peak confirms
        // genuine speech (not constant-level hum).
        if (
          !hasSpeechRef.current &&
          consecutiveSpeechSamples >= policy.minSpeechSamples &&
          chunkPeakRms >= policy.peakRmsThreshold
        ) {
          hasSpeechRef.current = true
        }
      } else {
        // ── Silence frame ───────────────────────────────────────────────────
        consecutiveSpeechSamples = 0   // RESET — start trigger requires consecutive frames

        if (hasSpeechRef.current) {
          // Hangover: count consecutive silence frames after confirmed speech
          postSpeechSilenceSamples += 1
          if (
            postSpeechSilenceSamples >= policy.hangoverSamples &&
            Date.now() - recordStartTime >= MIN_CHUNK_RECORD_MS &&
            recorder.state === 'recording'
          ) {
            // Sustained post-speech silence → send chunk to Whisper now
            recorder.stop()
          }
        }
      }
    }, VAD_SAMPLE_INTERVAL)

    recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }

    recorder.onstop = () => {
      // Does this recorder still belong to the live session? After Stop/teardown
      // (or a newer Start) recorderRef no longer points at it, so a late onstop
      // must not restart capture or touch the new session's VAD timer.
      const ownsSession = recorderRef.current === recorder
      if (ownsSession && vadTimerRef.current) { clearInterval(vadTimerRef.current); vadTimerRef.current = null }

      const hadSpeech = hasSpeechRef.current
      const recMime   = recorder.mimeType || mimeType || 'audio/webm'
      const blob      = new Blob(audioChunksRef.current, { type: recMime })

      // ── Online VAD quality monitoring & policy adaptation ─────────────────
      // Measure stability via flip rate (SPEECH↔SILENCE transitions per chunk).
      //
      // High flip rate → unstable VAD (music, noise bursts, clipping):
      //   Increase hangover by 1 sample (capped at VAD_MAX_HANGOVER_SAMPLES) so
      //   the state machine becomes less reactive until conditions improve.
      //
      // Low flip rate after instability → audio is stable again:
      //   Relax hangover by 1 sample toward the source-appropriate default.
      //
      // Only the hangover is adapted here; speechRmsThreshold and peakRmsThreshold
      // stay at the source policy default — adapting them online risks masking
      // legitimate quiet speech.
      const defaultHangover = getInitialVadPolicy(vadModeRef.current).hangoverSamples
      if (vadFlipCount > VAD_FLIP_RATE_HIGH) {
        vadPolicyRef.current = {
          ...vadPolicyRef.current,
          hangoverSamples: Math.min(vadPolicyRef.current.hangoverSamples + 1, VAD_MAX_HANGOVER_SAMPLES),
        }
      } else if (vadFlipCount < VAD_FLIP_RATE_LOW && vadPolicyRef.current.hangoverSamples > defaultHangover) {
        vadPolicyRef.current = {
          ...vadPolicyRef.current,
          hangoverSamples: Math.max(vadPolicyRef.current.hangoverSamples - 1, defaultHangover),
        }
      }

      if (hadSpeech) {
        // Capture silence count before reset — used by processChunk for speaker detection
        if (silentChunkCountRef.current > 0) {
          silenceBeforeChunkRef.current = silentChunkCountRef.current
        }
        // Speech detected — reset silence counter and queue the chunk.
        // Capture the enqueue timestamp so stale chunks can be discarded if the
        // queue falls behind — prevents latency stacking during slow API responses.
        silentChunkCountRef.current = 0
        const queuedAt = Date.now()
        // Orderly Stop stopped this recorder mid-utterance: its last chunk must
        // still be transcribed even though activeRef is already false.
        const isFlushRecorder = finalFlushRecorderRef.current === recorder
        if (isFlushRecorder) finalFlushRecorderRef.current = null
        // Valid only if no Clear/Start bumped the generation since Stop recorded it.
        const finalFlush = !activeRef.current && isFlushRecorder
          && isFlushGenerationValid(flushGenerationRef.current, generationRef.current)
        const flushGeneration = flushGenerationRef.current
        // A stale recorder (not the live one and not a valid flush) never queues.
        if (ownsSession || finalFlush) {
          queueRef.current = queueRef.current.then(async () => {
            if (Date.now() - queuedAt > CHUNK_MAX_QUEUE_AGE_MS) return // discard stale chunk
            if (finalFlush && !isFlushGenerationValid(flushGeneration, generationRef.current)) return // cleared/restarted since Stop
            await processChunk(blob, recMime, finalFlush ? { finalFlush: true } : undefined)
          })
        }
      } else {
        // No speech — increment counter; reset decoder context on long silence
        silentChunkCountRef.current += 1
        if (silentChunkCountRef.current >= SILENCE_RESET_CHUNKS) {
          // ≥15 s of consecutive silence: wipe all context so the next
          // decode cycle starts fresh and can't drift on stale text.
          silentChunkCountRef.current  = 0
          lastChunkTextRef.current     = ''
          pendingBufferRef.current     = ''
          pendingChunkCountRef.current = 0
          recentSentencesRef.current   = []
        }
      }

      // Guard: do NOT restart energy VAD if we upgraded to Silero mid-chunk.
      // Also skip when this recorder was superseded (Stop → Start finished before
      // this async onstop fired) — otherwise two recorder loops would run.
      if (ownsSession && activeRef.current && vadModeStateRef.current === 'energy') startChunk()
    }

    recorder.start()
    // Hard-stop fallback: if VAD never fires `recorder.stop()` (e.g. continuous
    // speech with no hangover hit), enforce CHUNK_DURATION_MS upper bound.
    // Track the handle so handleStop can cancel it; otherwise it can fire
    // after stop() and trigger an extra stop() on a recorder we already tore down.
    if (chunkTimeoutRef.current) clearTimeout(chunkTimeoutRef.current)
    chunkTimeoutRef.current = setTimeout(() => {
      chunkTimeoutRef.current = null
      if (recorder.state === 'recording') recorder.stop()
    }, CHUNK_DURATION_MS)
  }, [processChunk, stopSession])

  // ── Session start / stop ────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    // Release anything a previous session left behind (idempotent) so a new
    // Start can never overwrite refs and leak the first stream/AudioContext.
    teardown()
    const sessionSeq = ++sessionSeqRef.current
    // Bump generation so any in-flight chunks from a previous session resolve
    // into a no-op instead of polluting the fresh transcript.
    generationRef.current += 1
    // An old orderly-Stop flush must never be processed into this new session.
    finalFlushRecorderRef.current = null
    finalFlushingRef.current      = false
    flushGenerationRef.current    = null
    cancelActiveSttRequests()
    // Clear any historical session being viewed — start fresh
    setViewingLiveSession(null)
    setRawTranscript('')
    setTranslation('')
    pendingBufferRef.current     = ''
    pendingChunkCountRef.current = 0
    recentSentencesRef.current   = []
    fullRawForSummaryRef.current = ''
    fullTxForSummaryRef.current  = ''
    segmentOrderRef.current      = []
    segmentTranslationsRef.current.clear()
    lastChunkTextRef.current     = ''
    lastChunkAtRef.current       = 0
    liveCostRef.current          = undefined

    setMicError(null)
    setVadMode('energy')
    vadModeStateRef.current    = 'energy'
    adaptiveChunksRef.current  = 0
    adaptiveDiscardRef.current = 0
    upgradeVADRef.current      = null
    setShowSummaryBtn(false)
    setSummary(null)
    setSpeakerAnalysis(null)
    setIsAnalyzingSpeakers(false)
    setActionItems(null)
    setDecisions(null)
    setIsExtractingActionItems(false)
    setIsExtractingDecisions(false)
    setSpeakerNameMap({})
    setSegments([])
    setPendingText('')
    currentSpeakerRef.current        = INITIAL_SPEAKER_DIARIZATION_STATE.currentSpeaker
    speakerCountRef.current          = INITIAL_SPEAKER_DIARIZATION_STATE.speakerCount
    silenceBeforeChunkRef.current    = 0
    lastSpeakerChangeTimeRef.current = INITIAL_SPEAKER_DIARIZATION_STATE.lastSpeakerChangeTime
    speakerTurnHistoryRef.current    = [...INITIAL_SPEAKER_DIARIZATION_STATE.turnHistory]
    const now = Date.now()
    sessionIdRef.current    = createClientId('live', now)
    sessionStartRef.current = now
    setSessionStartTime(now)

    // Resources acquired by THIS attempt. If setup fails or is superseded before
    // the session goes live, `finally` releases them (denied mic permission,
    // cancelled screen picker, Stop/restart during an await). Once live they are
    // owned by the refs and released by teardown().
    const acquiredStreams: MediaStream[] = []
    let pendingAudioCtx: AudioContext | null = null
    let pendingAnalyser: AnalyserNode | null = null
    let sessionLive = false
    try {
      const audioCtx = new AudioContext()
      pendingAudioCtx = audioCtx
      const analyser = audioCtx.createAnalyser()
      pendingAnalyser = analyser
      analyser.fftSize = 512

      let captureStream: MediaStream

      if (audioMode === 'system' || audioMode === 'both') {
        // Request screen share + system audio via getDisplayMedia.
        // On macOS the user MUST check "Share audio" in the screen picker.
        // Note: Electron's setDisplayMediaRequestHandler overrides the source,
        // so we keep video constraints minimal (just `true`) to avoid
        // "Invalid capture constraints" errors from Chromium's constraint validator.
        const displayStream = await (navigator.mediaDevices as MediaDevices).getDisplayMedia({
          video: true,
          audio: true,
        } as DisplayMediaStreamOptions)
        // Keep the whole display stream so Stop/unmount/error can stop every track.
        acquiredStreams.push(displayStream)

        // Stop video tracks — only need audio
        for (const track of displayStream.getVideoTracks()) track.stop()

        const sysAudioTracks = displayStream.getAudioTracks()

        const dest = audioCtx.createMediaStreamDestination()

        if (sysAudioTracks.length > 0) {
          // Apply software gain to system audio — remote call audio is quieter than mic
          const sysGain = audioCtx.createGain()
          sysGain.gain.value = SYSTEM_AUD_GAIN
          const sysSource = audioCtx.createMediaStreamSource(new MediaStream(sysAudioTracks))
          // ── High-pass filter: cut low-frequency noise ───────────────────
          // Removes AC hum, fan rumble, and wind noise below 80 Hz.
          // These low-frequency components raise the RMS without contributing
          // speech information, causing false-positive VAD frames.
          const highPass = audioCtx.createBiquadFilter()
          highPass.type = 'highpass'
          highPass.frequency.value = 80
          sysSource.connect(highPass)
          highPass.connect(sysGain)
          sysGain.connect(analyser)   // VAD reads filtered + boosted signal
          sysGain.connect(dest)       // Whisper receives filtered + boosted signal
        } else {
          // A superseded attempt must not overwrite the newer session's error state.
          if (sessionSeqRef.current === sessionSeq) setMicError(t.live_error_system_audio_unavailable)
          return   // `finally` stops the display stream and closes the AudioContext
        }

        // 'both' mode: also mix in microphone so both speakers are captured
        if (audioMode === 'both') {
          try {
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
            acquiredStreams.push(micStream)
            const micSource = audioCtx.createMediaStreamSource(micStream)
            micSource.connect(dest)
            for (const track of micStream.getTracks()) dest.stream.addTrack(track)
          } catch { /* mic optional in both mode */ }
        }

        captureStream = dest.stream
        acquiredStreams.push(captureStream)
      } else {
        // ── Mic-only mode: Adaptive VAD ───────────────────────────────────────
        //
        // Stage 1 (default) — Energy-based VAD (WebRTC-style RMS detector)
        //   • Zero startup latency, works well in quiet environments
        // Stage 2 (auto-upgrade) — Silero ML VAD
        //   • Triggered when noise-discard rate > ADAPTIVE_VAD_DISCARD_THRESHOLD
        //   • One-way (energy → Silero, never back); reuses the existing mic stream
        const rawMicStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl:  true,
            sampleRate:       { ideal: 16_000 },
            channelCount:     { exact: 1 },
          },
          video: false,
        })
        acquiredStreams.push(rawMicStream)
        // Superseded while the permission prompt was open — don't install this
        // attempt's VAD-upgrade hook over a newer session's (`finally` releases us).
        if (sessionSeqRef.current !== sessionSeq) return
        const rawSource = audioCtx.createMediaStreamSource(rawMicStream)
        const gainNode  = audioCtx.createGain()
        gainNode.gain.value = MIC_GAIN
        rawSource.connect(gainNode)
        gainNode.connect(analyser)
        const micDest = audioCtx.createMediaStreamDestination()
        gainNode.connect(micDest)
        for (const track of rawMicStream.getTracks()) micDest.stream.addTrack(track)
        captureStream = micDest.stream
        acquiredStreams.push(captureStream)

        // ── Adaptive VAD upgrade function (called by processChunk) ─────────
        upgradeVADRef.current = async () => {
          if (vadModeStateRef.current === 'silero') return
          if (!activeRef.current || sessionSeqRef.current !== sessionSeq) return
          vadModeStateRef.current = 'silero'
          if (mountedRef.current) setVadMode('silero')
          // Stop energy VAD; onstop guard prevents startChunk() from restarting
          if (vadTimerRef.current) { clearInterval(vadTimerRef.current); vadTimerRef.current = null }
          if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
          // Reuse existing stream — avoids a second getUserMedia permission prompt
          const existingStream = streamRef.current
          try {
            const { MicVAD } = await import('@ricky0123/vad-web')
            // Stop (or a newer Start) during the import: don't even build a VAD.
            if (!activeRef.current || sessionSeqRef.current !== sessionSeq) return
            const micVad = await MicVAD.new({
              baseAssetPath:    './vad/',
              onnxWASMBasePath: './vad/',
              model: 'v5',
              getStream: async () => existingStream
                ?? navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true,
                             autoGainControl: true, sampleRate: { ideal: 16_000 },
                             channelCount: { exact: 1 } },
                    video: false,
                  }),
              positiveSpeechThreshold: 0.50,
              negativeSpeechThreshold: 0.35,
              minSpeechMs:    384,
              preSpeechPadMs: 960,
              redemptionMs:   600,
              onSpeechStart: () => { if (!activeRef.current) return; hasSpeechRef.current = true },
              onSpeechEnd: (samples: Float32Array) => {
                // An orderly Stop destroys the VAD, which emits the in-progress
                // utterance here after activeRef is already false — still process it.
                // Valid only while no Clear/Start bumped the generation since Stop.
                const finalFlush = !activeRef.current && finalFlushingRef.current
                  && isFlushGenerationValid(flushGenerationRef.current, generationRef.current)
                if (!activeRef.current && !finalFlush) return
                hasSpeechRef.current = false
                const now = Date.now()
                if (lastSpeechEndTimeRef.current > 0) {
                  const gapMs     = now - lastSpeechEndTimeRef.current
                  const gapChunks = Math.floor(gapMs / CHUNK_DURATION_MS)
                  silenceBeforeChunkRef.current = gapChunks
                  if (gapChunks >= SILENCE_RESET_CHUNKS) {
                    silentChunkCountRef.current  = 0
                    lastChunkTextRef.current     = ''
                    pendingBufferRef.current     = ''
                    pendingChunkCountRef.current = 0
                    recentSentencesRef.current   = []
                  }
                }
                lastSpeechEndTimeRef.current = now
                silentChunkCountRef.current  = 0
                const blob = float32ToWav(samples, 16_000)
                const queuedAt = Date.now()
                const flushGeneration = flushGenerationRef.current
                queueRef.current = queueRef.current.then(async () => {
                  if (Date.now() - queuedAt > CHUNK_MAX_QUEUE_AGE_MS) return
                  if (finalFlush && !isFlushGenerationValid(flushGeneration, generationRef.current)) return // cleared/restarted since Stop
                  await processChunk(blob, 'audio/wav', finalFlush ? { finalFlush: true } : undefined)
                })
              },
              onVADMisfire: () => { silentChunkCountRef.current += 1 },
            })
            // Stop (or a newer Start) while MicVAD was loading: destroy it now
            // instead of keeping a running VAD that nothing will ever tear down.
            if (!activeRef.current || sessionSeqRef.current !== sessionSeq) {
              void Promise.resolve(micVad.destroy()).catch(() => undefined)
              return
            }
            micVad.start()
            micVadRef.current = micVad
          } catch (upgradeErr) {
            if (sessionSeqRef.current !== sessionSeq) return // stale session — nothing to revert
            console.error('[adaptive-vad] Silero upgrade failed — reverting:', upgradeErr)
            vadModeStateRef.current = 'energy'
            if (mountedRef.current) setVadMode('energy')
            if (activeRef.current) startChunk()
          }
        }
      }

      // A Stop/teardown or a newer Start happened while we awaited the screen
      // picker / mic prompt — abandon this attempt (`finally` releases it).
      if (sessionSeqRef.current !== sessionSeq) return

      // ── Shared setup: all audio modes (system / both / mic-energy) ───────
      streamRef.current    = captureStream
      captureStreamsRef.current = acquiredStreams
      audioCtxRef.current  = audioCtx
      analyserRef.current  = analyser
      sessionLive          = true

      // Set the source-appropriate policy before starting the first chunk so
      // every chunk uses the correct thresholds from the very beginning.
      // vadModeRef is kept in sync so the adaptation logic can relax the hangover
      // back to the source default after a period of stability.
      vadModeRef.current   = audioMode
      vadPolicyRef.current = getInitialVadPolicy(audioMode)

      aiModelBoundaryRef.current.begin(getConfiguredAIModel())
      activeRef.current    = true
      setIsActive(true)
      startChunk()
    } catch (err) {
      // A superseded attempt must not surface errors over the newer session.
      if (sessionSeqRef.current !== sessionSeq) return
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Permission denied') || msg.includes('NotAllowedError')) {
        setMicError(audioMode === 'system'
          ? t.live_error_screen_permission_denied
          : t.live_error_mic_denied)
      } else if (!msg.includes('cancelled') && !msg.includes('AbortError')) {
        setMicError(msg)
      }
    } finally {
      // Setup never reached the live state (error, cancelled picker, no system
      // audio, or superseded): stop every acquired track and close the context.
      if (!sessionLive) {
        releaseCaptureResources({ streams: acquiredStreams, analyser: pendingAnalyser, audioCtx: pendingAudioCtx })
      }
    }
  }, [startChunk, audioMode, setViewingLiveSession, processChunk, t, cancelActiveSttRequests, getConfiguredAIModel, teardown])

  const handleStop = useCallback(() => {
    stopSession({ flush: true })
  }, [stopSession])

  const handleClear = useCallback(() => {
    // Bump generation so any in-flight chunks from before clear resolve into
    // a no-op instead of repopulating the just-cleared transcript.
    generationRef.current += 1
    // Drop any pending orderly-Stop flush so it can never repopulate the cleared UI.
    finalFlushRecorderRef.current = null
    finalFlushingRef.current      = false
    flushGenerationRef.current    = null
    cancelActiveSttRequests()
    pendingBufferRef.current     = ''
    pendingChunkCountRef.current = 0
    recentSentencesRef.current   = []
    fullRawForSummaryRef.current = ''
    fullTxForSummaryRef.current  = ''
    segmentOrderRef.current      = []
    segmentTranslationsRef.current.clear()
    lastChunkTextRef.current     = ''
    lastChunkAtRef.current       = 0
    liveCostRef.current          = undefined
    // In-flight translations skip their own reset once the generation changed.
    setIsTranslating(false)
    setRawTranscript('')
    setTranslation('')
    setSummary(null)
    setShowSummaryBtn(false)
    setSpeakerAnalysis(null)
    setIsAnalyzingSpeakers(false)
    setActionItems(null)
    setDecisions(null)
    setIsExtractingActionItems(false)
    setIsExtractingDecisions(false)
    setSpeakerNameMap({})
    setSegments([])
    setPendingText('')
    if (!activeRef.current) aiModelBoundaryRef.current.clear()
    currentSpeakerRef.current        = INITIAL_SPEAKER_DIARIZATION_STATE.currentSpeaker
    speakerCountRef.current          = INITIAL_SPEAKER_DIARIZATION_STATE.speakerCount
    silenceBeforeChunkRef.current    = 0
    lastSpeakerChangeTimeRef.current = INITIAL_SPEAKER_DIARIZATION_STATE.lastSpeakerChangeTime
    speakerTurnHistoryRef.current    = [...INITIAL_SPEAKER_DIARIZATION_STATE.turnHistory]
  }, [cancelActiveSttRequests])

  /**
   * handleNewSession — triggered by the "Mới" button in the subtitle overlay.
   *
   * Saves the current session to history BEFORE resetting, so the user never
   * loses data when starting a new recording.
   *
   * Behaviour:
   *   • If recording is active → handleStop() auto-saves to history, then clear
   *   • If stopped but has data → save manually to history, then clear
   *   • If no data → just clear (nothing to save)
   */
  const handleNewSession = useCallback(() => {
    if (activeRef.current) {
      // Recording is active → stop it; handleStop auto-saves to history
      handleStop()
    } else {
      // Not recording — save any accumulated data manually before clearing
      // Shared upsert: Stop may already have saved this session id.
      saveSession()
    }
    // Reset UI state for a fresh session
    handleClear()
  }, [handleStop, handleClear, saveSession])

  const getCurrentSessionId = useCallback(() => sessionIdRef.current, [])
  const runLiveAiAction = useLiveAiActions(updateLiveSession, getCurrentSessionId)

  // ── AI Summarize ────────────────────────────────────────────────────────────
  const handleSummarize = useCallback(async () => {
    let raw = fullRawForSummaryRef.current
    let tx  = fullTxForSummaryRef.current
    if (!raw) return

    const { targetLang } = paramsRef.current
    const aiModel = getSessionAIModel()

    // Truncate each section to the last N chars so the AI receives the most recent,
    // relevant content without exceeding model context / cost limits.
    const wasTruncated = raw.length > MAX_SUMMARIZE_SECTION_CHARS || tx.length > MAX_SUMMARIZE_SECTION_CHARS
    if (raw.length > MAX_SUMMARIZE_SECTION_CHARS) {
      raw = `[…truncated for length]\n${raw.slice(-MAX_SUMMARIZE_SECTION_CHARS)}`
    }
    if (tx.length > MAX_SUMMARIZE_SECTION_CHARS) {
      tx = `[…truncated for length]\n${tx.slice(-MAX_SUMMARIZE_SECTION_CHARS)}`
    }
    if (wasTruncated) {
      console.log('[summarize] Input truncated to last', MAX_SUMMARIZE_SECTION_CHARS, 'chars per section')
    }

    await runLiveAiAction({
      setLoading: setIsSummarizing,
      setOutput: setSummary,
      historyField: 'summary',
      logLabel: 'summarize',
      fallbackError: 'Summarization failed. Please try again.',
      request: {
        provider: aiModel.provider,
        model: aiModel.model,
        // Bypass the chat UI 3k-char limit — summarize needs to send full transcripts.
        bypassLengthCheck: true,
        systemPrompt: `You are a professional meeting summarizer. Write clear, concise summaries in ${targetLang} using bullet points.`,
        messages: [{
          role: 'user',
          content: [{
            type: 'text',
            text: [
              `Summarize the following live meeting transcript in ${targetLang}.`,
              'Include: key topics, important decisions, and action items (if any).',
              'Be concise. Use bullet points.',
              '',
              '[Original Speech]:',
              raw,
              '',
              '[Translation]:',
              tx,
            ].join('\n'),
          }],
        }],
      },
    })
  }, [getSessionAIModel, runLiveAiAction])

  // ── AI Speaker Analysis ─────────────────────────────────────────────────────
  /**
   * Post-session speaker diarization via LLM.
   * Sends the transcript to the AI which labels each speaking turn as
   * [Speaker 1], [Speaker 2], etc. based on conversation patterns.
   * Follows the approach recommended in docs/tts.md: LLM-based analysis
   * is practical for turn-taking meetings (people speaking in turns).
   */
  const handleAnalyzeSpeakers = useCallback(async () => {
    let raw = fullRawForSummaryRef.current
    if (!raw) return

    const { targetLang } = paramsRef.current
    const aiModel = getSessionAIModel()

    // Truncate to prevent token limit errors
    const MAX_SPEAKER_INPUT_CHARS = 8_000
    if (raw.length > MAX_SPEAKER_INPUT_CHARS) {
      raw = `[…truncated for length]\n${raw.slice(-MAX_SPEAKER_INPUT_CHARS)}`
    }

    await runLiveAiAction({
      setLoading: setIsAnalyzingSpeakers,
      setOutput: setSpeakerAnalysis,
      historyField: 'speakerAnalysis',
      logLabel: 'speaker-analysis',
      fallbackError: 'Speaker analysis failed. Please try again.',
      request: {
        provider: aiModel.provider,
        model: aiModel.model,
        bypassLengthCheck: true,
        systemPrompt: [
          'You are a meeting transcript analyst specializing in speaker diarization.',
          'Analyze conversation patterns to identify distinct speakers.',
          'Label each speaking turn clearly as [Speaker 1], [Speaker 2], etc.',
          `Output language: ${targetLang}`,
        ].join(' '),
        messages: [{
          role: 'user',
          content: [{
            type: 'text',
            text: [
              'Analyze the following meeting transcript and label each distinct speaker.',
              '',
              'Rules:',
              '- Identify speaker changes based on: conversation turn-taking, topic shifts, question/answer patterns',
              '- Use labels: [Speaker 1], [Speaker 2], [Speaker 3], etc.',
              '- Keep the original text intact, only add speaker labels',
              '- If the entire transcript is one person, label everything as [Speaker 1]',
              '',
              'Format exactly as:',
              '[Speaker 1]: <their text>',
              '[Speaker 2]: <their text>',
              '[Speaker 1]: <their text>',
              '...',
              '',
              '[Transcript]:',
              raw,
            ].join('\n'),
          }],
        }],
      },
    })
  }, [getSessionAIModel, runLiveAiAction])

  // ── AI Action Items extraction ──────────────────────────────────────────────
  const handleExtractActionItems = useCallback(async () => {
    let raw = fullRawForSummaryRef.current
    if (!raw) return

    const { targetLang } = paramsRef.current
    const aiModel = getSessionAIModel()
    const langName = LANG_NAMES_FOR_AI[targetLang] ?? targetLang

    const MAX_AI_INPUT_CHARS = 10_000
    if (raw.length > MAX_AI_INPUT_CHARS) {
      raw = `[…truncated]\n${raw.slice(-MAX_AI_INPUT_CHARS)}`
    }

    await runLiveAiAction({
      setLoading: setIsExtractingActionItems,
      setOutput: setActionItems,
      historyField: 'actionItems',
      logLabel: 'action-items',
      fallbackError: 'Failed to extract action items.',
      request: {
        provider: aiModel.provider,
        model: aiModel.model,
        bypassLengthCheck: true,
        systemPrompt: `You are a meeting assistant. Extract action items from meeting transcripts. IMPORTANT: Always respond in ${langName}, regardless of the transcript language.`,
        messages: [{
          role: 'user',
          content: [{
            type: 'text',
            text: [
              `Extract all action items from the following meeting transcript.`,
              `IMPORTANT: Write your response in ${langName} only. Do NOT use the language of the transcript.`,
              'Rules:',
              '- List each action item as a numbered point',
              '- Include: responsible person (if mentioned), task description, deadline (if mentioned)',
              '- If no action items are found, say so clearly',
              '- Be concise and direct',
              '',
              '[Transcript]:',
              raw,
            ].join('\n'),
          }],
        }],
      },
    })
  }, [getSessionAIModel, runLiveAiAction])

  // ── AI Decisions extraction ─────────────────────────────────────────────────
  const handleExtractDecisions = useCallback(async () => {
    let raw = fullRawForSummaryRef.current
    if (!raw) return

    const { targetLang } = paramsRef.current
    const aiModel = getSessionAIModel()
    const langName = LANG_NAMES_FOR_AI[targetLang] ?? targetLang

    const MAX_AI_INPUT_CHARS = 10_000
    if (raw.length > MAX_AI_INPUT_CHARS) {
      raw = `[…truncated]\n${raw.slice(-MAX_AI_INPUT_CHARS)}`
    }

    await runLiveAiAction({
      setLoading: setIsExtractingDecisions,
      setOutput: setDecisions,
      historyField: 'decisions',
      logLabel: 'decisions',
      fallbackError: 'Failed to extract decisions.',
      request: {
        provider: aiModel.provider,
        model: aiModel.model,
        bypassLengthCheck: true,
        systemPrompt: `You are a meeting assistant. Extract key decisions made during meetings. IMPORTANT: Always respond in ${langName}, regardless of the transcript language.`,
        messages: [{
          role: 'user',
          content: [{
            type: 'text',
            text: [
              `Extract all key decisions made in the following meeting transcript.`,
              `IMPORTANT: Write your response in ${langName} only. Do NOT use the language of the transcript.`,
              'Rules:',
              '- List each decision as a numbered point',
              '- Include context for each decision (why it was made, if mentioned)',
              '- If no clear decisions are found, say so clearly',
              '- Be concise and direct',
              '',
              '[Transcript]:',
              raw,
            ].join('\n'),
          }],
        }],
      },
    })
  }, [getSessionAIModel, runLiveAiAction])

  // ── Speaker rename ─────────────────────────────────────────────────────────
  /** Maps a speaker's original label to a user-assigned display name. */
  const handleRenameSpeaker = useCallback((originalLabel: string, newName: string) => {
    if (!newName.trim()) return
    setSpeakerNameMap(prev => ({ ...prev, [originalLabel]: newName.trim() }))
  }, [])

  // ── Subtitle IPC integration ───────────────────────────────────────────────
  // Register onClosed listener once so the button syncs when user clicks ✕ in the OS window
  useEffect(() => {
    const cleanup = window.api?.subtitle?.onClosed(() => setShowSubtitles(false))
    return () => cleanup?.()
  }, [])

  // Open / close the OS subtitle window whenever the toggle changes
  useEffect(() => {
    if (showSubtitles) {
      window.api?.subtitle?.show()
    } else {
      window.api?.subtitle?.hide()
    }
  }, [showSubtitles])

  // Push latest translation text to the subtitle window whenever it changes
  useEffect(() => {
    if (showSubtitles) {
      window.api?.subtitle?.update(latestSubtitle, isTranslating)
    }
  }, [latestSubtitle, isTranslating, showSubtitles])

  // Apply appearance settings to the subtitle window whenever they change
  useEffect(() => {
    if (showSubtitles) {
      window.api?.subtitle?.setStyle(subtitleSettings)
    }
  }, [subtitleSettings, showSubtitles])

  // ── Subtitle state push ────────────────────────────────────────────────────
  // cachedSubtitleModelsRef: avoids re-fetching models on every isTranscribing/isTranslating
  // toggle (which happens very frequently). Models are only re-fetched when provider/model
  // selection changes — which is infrequent.
  const cachedSubtitleModelsRef = useRef<{ id: string; name: string }[]>([])

  // Push full state (including model list from API) when stable fields change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedModels reference changes with provider — intentional full sync
  useEffect(() => {
    if (!showSubtitles) return
    const provider  = selectedProvider
    const model     = selectedModels[provider] ?? ''
    const mode = audioMode
    const lang = targetLang
    window.api?.fetchModels(provider)
      .then((result) => {
        const availableModels = (result?.models ?? []) as { id: string; name: string }[]
        cachedSubtitleModelsRef.current = availableModels
        void window.api?.subtitle?.pushState({ selectedProvider: provider, selectedModel: model, isActive, isTranscribing, isTranslating, availableModels, audioMode: mode, targetLang: lang, locale })
      })
      .catch(() => {
        void window.api?.subtitle?.pushState({ selectedProvider: provider, selectedModel: model, isActive, isTranscribing, isTranslating, availableModels: cachedSubtitleModelsRef.current, audioMode: mode, targetLang: lang, locale })
      })
  }, [showSubtitles, selectedProvider, selectedModels, audioMode, targetLang])

  // Push lightweight status updates without re-fetching models.
  // biome-ignore lint/correctness/useExhaustiveDependencies: stable fields read directly, only status changes trigger this
  useEffect(() => {
    if (!showSubtitles) return
    void window.api?.subtitle?.pushState({
      selectedProvider,
      selectedModel: selectedModels[selectedProvider] ?? '',
      isActive,
      isTranscribing,
      isTranslating,
      availableModels: cachedSubtitleModelsRef.current,
      audioMode,
      targetLang,
      locale,
    })
  }, [showSubtitles, isActive, isTranscribing, isTranslating])

  // Listen for actions sent FROM the subtitle window (start/stop, provider/model/style changes)
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedProvider needed for setSelectedModel scope
  useEffect(() => {
    const cleanupStart    = window.api?.subtitle?.onStart(() => { if (!activeRef.current) void handleStart() })
    const cleanupStop     = window.api?.subtitle?.onStop(() => { if (activeRef.current) handleStop() })
    const cleanupProvider = window.api?.subtitle?.onSetProvider((provider) => {
      setSelectedProvider(provider as Provider)
    })
    const cleanupModel    = window.api?.subtitle?.onSetModel((model) => {
      setSelectedModel(selectedProvider as Provider, model)
    })
    const cleanupAudioMode = window.api?.subtitle?.onSetAudioMode((mode) => {
      setAudioMode(mode as 'mic' | 'system' | 'both')
    })
    const cleanupTargetLang = window.api?.subtitle?.onSetTargetLang((lang) => {
      setTargetLang(lang)
    })
    const cleanupStyle    = window.api?.subtitle?.onStyleUpdate((style) => {
      setSubtitleSettings(style)
    })
    // "Mới" button → save current session to history, then reset for a new one
    const cleanupClear    = window.api?.subtitle?.onClear(() => { handleNewSession() })
    return () => {
      cleanupStart?.()
      cleanupStop?.()
      cleanupProvider?.()
      cleanupModel?.()
      cleanupAudioMode?.()
      cleanupTargetLang?.()
      cleanupStyle?.()
      cleanupClear?.()
    }
  }, [handleStart, handleStop, handleClear, handleNewSession, setSelectedProvider, setSelectedModel, selectedProvider, setTargetLang])

  // ── Pre-flight STT provider check ─────────────────────────────────────────
  // Runs on mount and whenever keyStatus changes (e.g. user adds/removes a key in Settings).
  // This achieves two goals:
  //   1. Updates activeSttProvider so the UI badge reflects the current best backend.
  //   2. Pre-warms the session-level cache in the main process so the VERY FIRST audio
  //      chunk of a new session goes directly to the best available provider — zero
  //      wasted attempts on unavailable backends.
  //
  // keyStatus is the intentional trigger: it changes only when the user saves or deletes
  // an API key, which is exactly when we need to re-evaluate the fallback chain.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyStatus is the intentional dependency
  useEffect(() => {
    if (!window.api?.checkSttProviders) return  // guard: running in tests / web builds
    window.api.checkSttProviders()
      .then((result) => {
        if (mountedRef.current) setActiveSttProvider(result.primary)
      })
      .catch(() => { /* ignore — activeSttProvider stays 'none' */ })
  }, [keyStatus])

  // Cleanup on unmount — stop audio pipeline, mark component as unmounted, close subtitle window.
  // mountedRef.current = false prevents in-flight async callbacks (STT, translation) from
  // calling setState after the component has been removed from the tree.
  useEffect(() => {
    mountedRef.current = true  // reset to true on mount (handles StrictMode double-invoke)
    return () => {
      mountedRef.current = false  // ← guards processChunk + background translation setState calls
      const wasActive = activeRef.current
      generationRef.current += 1
      cancelActiveSttRequests()
      if (pipelineErrorTimerRef.current) clearTimeout(pipelineErrorTimerRef.current)
      // Same release path as Stop (recorder, Silero VAD, every stream, AudioContext).
      teardown()
      // Stop saves the session; if the page unmounts mid-recording nobody else will.
      // Only when still active, so an already-stopped (already-saved) session is not duplicated.
      if (wasActive) saveSessionRef.current()
      // Close the OS subtitle window when leaving the page
      window.api?.subtitle?.hide()
    }
  }, [cancelActiveSttRequests, teardown])

  // ── Computed ──────────────────────────────────────────────────────────────
  // useMemo: rawTranscript can be large (50k chars) — only recount when the
  // transcript actually changes, not on every render triggered by audio/translation state.
  const wordCount = useMemo(() => countWords(rawTranscript), [rawTranscript])

  return {
    // Audio mode
    audioMode,
    setAudioMode,
    screenPermission,
    // Core state
    isActive,
    rawTranscript,
    translation,
    isTranscribing,
    isTranslating,
    micError,
    pipelineError,
    // Subtitle state
    showSubtitles,
    setShowSubtitles,
    latestSubtitle,
    showSubtitleConfig,
    setShowSubtitleConfig,
    subtitleSettings,
    setSubtitleSettings,
    // Realtime segments + interim text
    segments,
    pendingText,
    // Summary state
    showSummaryBtn,
    summary,
    isSummarizing,
    // Speaker analysis state
    speakerAnalysis,
    isAnalyzingSpeakers,
    // Action items + decisions
    actionItems,
    isExtractingActionItems,
    decisions,
    isExtractingDecisions,
    // Speaker name map + session start time
    speakerNameMap,
    sessionStartTime,
    // Handlers
    handleStart,
    handleStop,
    handleClear,
    handleSummarize,
    handleAnalyzeSpeakers,
    handleExtractActionItems,
    handleExtractDecisions,
    handleRenameSpeaker,
    // DOM refs
    rawEndRef,
    txEndRef,
    // Computed
    wordCount,
    isMac,
    hasOpenAIKey,
    hasAnyKey,
    // Adaptive VAD mode — 'energy' (default) or 'silero' (auto-upgraded when noisy)
    vadMode,
    // Active STT backend for the UI badge.
    // • 'auto'                → use the pre-flight-determined best provider
    // • explicit choice       → always reflect exactly what the user selected
    //   (store uses 'google' for Gemini STT; map to 'gemini' for display)
    activeSttProvider: (
      sttProvider === 'whisper' ? 'whisper' :
      sttProvider === 'google'  ? 'gemini'  :
      sttProvider === 'groq'    ? 'groq'    :
      activeSttProvider  // 'auto'
    ) as typeof activeSttProvider,
  }
}

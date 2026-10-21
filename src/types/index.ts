import type {
  CancelAudioTranscriptionParams,
  CancelAudioTranscriptionResult,
  SttProviderCheckResult,
  TranscribeAudioParams,
  TranscribeResult,
} from '../../shared/audioTranscription'
import type { UpdateNotificationPreferences } from '../../shared/updateNotification'
import type { UpdateStatus } from '../../shared/updater'

export type {
  AudioTranscriptionErrorCode,
  AudioTranscriptionPurpose,
  CancelAudioTranscriptionParams,
  CancelAudioTranscriptionResult,
  SttBackend,
  SttProvider,
  SttProviderCheckResult,
  TranscribeAudioParams,
  TranscribeFailure,
  TranscribeResult,
  TranscribeSuccess,
} from '../../shared/audioTranscription'

export type Provider = 'gemini' | 'claude' | 'openai' | 'local'

/** Canonical provider/model identity used by every AI feature. */
export interface AIModelSelection {
  provider: Provider
  /** Stable provider model ID; never replace this with a display label. */
  model: string
}

/** @deprecated Prefer AIModelSelection for new cross-feature contracts. */
export type TranslationModelSelection = AIModelSelection

export type TranslationComparisonStatus = 'idle' | 'loading' | 'success' | 'error'

/** Renderer-owned state for one independently retryable comparison result. */
export interface TranslationComparisonResult extends AIModelSelection {
  key: string
  status: TranslationComparisonStatus
  translatedText: string
  error: string | null
  errorCode: string | null
  durationMs: number | null
}
export type LocalAiEngine = 'ollama' | 'lmstudio' | 'llamacpp'
export type LocalAiHardwareTier = 'low' | 'balanced' | 'powerful' | 'max'

export type TranslationStyle = 'general' | 'formal' | 'casual' | 'business' | 'technical' | 'natural'

/**
 * Phonetic annotation mode:
 *  - 'off'      — no phonetic annotations
 *  - 'standard' — add {word|reading} ruby annotations (furigana/pinyin/romanization above original script)
 *  - 'phonetic' — replace original script with pure phonetics (hiragana-only, pinyin-only, romanization-only, IPA)
 */
export type PhoneticMode = 'off' | 'standard' | 'phonetic'

export type TtsVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
export type SpeakPanel = 'source' | 'translated' | `comparison:${string}`

/**
 * TTS routing preference:
 *  - 'free'    — free Edge TTS only; never uses local system voices or paid API keys
 *  - 'auto'    — Edge TTS first, then paid providers only if free TTS fails
 *  - 'premium' — paid providers first for quality, then free fallback
 */
export type TtsMode = 'free' | 'auto' | 'premium'

export type UsageCurrency = 'USD' | 'VND' | 'JPY' | 'EUR' | 'GBP'
export type UsageFeature = 'chat' | 'translate' | 'live' | 'dictionary'

export interface UsageCost {
  id: string
  feature: UsageFeature
  provider: Provider
  model: string
  amountUsd: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimated: boolean
  createdAt: number
}

export interface UsageTotal {
  amountUsd: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  requestCount: number
  updatedAt: number
  /** Per-feature breakdown (chat/translate/live/dictionary). Optional for back-compat. */
  byFeature?: Partial<Record<UsageFeature, UsageFeatureTotal>>
}

export interface UsageFeatureTotal {
  amountUsd: number
  requestCount: number
  totalTokens: number
}

export type AppPage = 'translate' | 'history' | 'chat' | 'live' | 'dictionary'

export interface ProviderConfig {
  id: Provider
  name: string
  color: string
  keyPrefix: string
  docsUrl: string
  models: ModelConfig[]
  requiresApiKey?: boolean
  localEngines?: LocalAiEngine[]
}

export interface ModelConfig {
  id: string
  name: string
  description: string
  /**
   * 'recommended' = best balance of speed + quality for translation (auto-selected as default)
   * 'balanced'    = good quality, moderate speed
   * 'powerful'    = highest quality, slower/costlier
   */
  tag?: 'recommended' | 'balanced' | 'powerful'
}

export interface Language {
  code: string
  name: string
  nativeName: string
}

/** Provider-default reasoning, or a portable explicit effort level. */
export type TranslationReasoningEffort = 'auto' | 'low' | 'medium' | 'high'

export interface TranslateParams {
  provider: Provider
  model: string
  requestId?: string
  sourceText: string
  sourceLang: string
  targetLang: string
  showFurigana?: boolean
  /** Explicit phonetic mode — overrides showFurigana when present */
  phoneticMode?: PhoneticMode
  translationStyle?: TranslationStyle
  reasoningEffort?: TranslationReasoningEffort
  /** When true, skip translation — only add phonetic annotations to the already-translated sourceText */
  phoneticOnly?: boolean
}

export interface TranslateResult {
  success: boolean
  translatedText?: string
  error?: string
  errorCode?: 'NO_API_KEY' | 'INVALID_KEY' | 'RATE_LIMIT' | 'NETWORK' | string
}

export interface KeychainResult {
  success?: boolean
  exists?: boolean
  masked?: string | null
  error?: string
}

export interface VerifyResult {
  success: boolean
  error?: string
  errorCode?: 'INVALID_KEY' | 'BILLING' | 'PERMISSION' | 'RATE_LIMIT' | 'NETWORK' | string
  valid?: boolean
}

export interface FetchedModel {
  id: string
  name: string
  description: string
  downloadModel?: string
  recommendedTier?: LocalAiHardwareTier
  installed?: boolean
  supportsVision?: boolean
  estimatedSizeGb?: number
}

export interface LocalAiHardwareProfile {
  platform: string
  arch: string
  cpuCount: number
  totalMemoryGb: number
  tier: LocalAiHardwareTier
  gpuName?: string
  /** Model-usable accelerator memory in GB; 0 = CPU-only, undefined = unknown. */
  vramGb?: number
  gpuMemoryKind?: 'dedicated' | 'unified'
}

export interface LocalAiDiscoveryResult {
  success: boolean
  available: boolean
  engine?: LocalAiEngine
  endpoint?: string
  models: FetchedModel[]
  suggestedModels: FetchedModel[]
  recommendedModel?: string
  hardware: LocalAiHardwareProfile
  error?: string
}

export type { LocalAiExecutionMode, LocalAiPerformanceComparison, LocalAiPerformanceMeasurement, LocalAiPerformanceProfile, LocalAiPerformanceState } from '../../shared/localAiPerformance'

export interface LocalAiBenchmarkResult {
  hardware: LocalAiHardwareProfile
  suggestedModels: FetchedModel[]
  recommendedModel?: string
  metrics?: {
    cpuScore: number
    memoryScore: number
    combinedScore: number
    durationMs: number
    runtimeModel?: string
    runtimeLatencyMs?: number
    runtimeLoadMs?: number
    runtimeTokensPerSecond?: number
    /** Share of the loaded model resident in GPU memory (100 = fully on GPU). */
    runtimeGpuPercent?: number
    runtimeVramGb?: number
  }
}

export interface LocalAiDownloadResult {
  success: boolean
  model: string
  error?: string
}

export interface LocalAiModelActionResult {
  success: boolean
  model: string
  error?: string
}

export interface LocalAiModelDownloadProgress {
  model: string
  status: 'running' | 'success' | 'error'
  percent: number
  message: string
  completedBytes?: number
  totalBytes?: number
}

export interface LocalAiInstallResult {
  success: boolean
  error?: string
  message?: string
  output?: string
  manual?: boolean
}

export interface TtsResult {
  success: boolean
  /** base64-encoded audio (avoids IPC ArrayBuffer serialization issues) */
  audioBase64?: string
  /** MIME type of the audio: 'audio/mpeg' (OpenAI / Edge / ElevenLabs) or 'audio/wav' (Gemini) */
  mimeType?: string
  /** Which provider produced the audio: 'openai' | 'gemini' | 'edge' | 'elevenlabs' */
  provider?: string
  error?: string
  errorCode?: 'NO_API_KEY' | 'INVALID_KEY' | 'RATE_LIMIT' | string
}

export interface ImageTextRegion {
  x: number        // 0.0–1.0 fraction of image width
  y: number        // 0.0–1.0 fraction of image height
  width: number    // 0.0–1.0 fraction of image width
  height: number   // 0.0–1.0 fraction of image height
  originalText: string
  translatedText: string
  fontSize: number  // 0.0–1.0 fraction of image height
  bgColor: string
  textColor: string
}

export interface ImageTranslateResult {
  success: boolean
  regions?: ImageTextRegion[]
  /** base64 of the fully edited image (returned when Gemini image-edit is used) */
  editedImageBase64?: string
  /** MIME type of `editedImageBase64` as returned by the model (may differ from the source image). */
  editedImageMimeType?: string
  /** Providers with a stored key that were not tried because provider fallback was off (NO_VISION). */
  fallbackProviders?: string[]
  error?: string
  errorCode?: 'NO_API_KEY' | 'INVALID_KEY' | 'RATE_LIMIT' | 'NO_VISION' | string
  /**
   * Set when a different model was automatically used due to vision-capability fallback.
   * Only present when the effective model differs from what the user selected.
   */
  usedModel?: string
  /**
   * Set when a different provider was automatically used due to vision-capability fallback.
   * Only present when the effective provider differs from what the user selected.
   */
  usedProvider?: string
}

export interface FetchModelsResult {
  success: boolean
  models: FetchedModel[]
  /** Best model for translation auto-selected by scoring algorithm */
  recommendedModel?: string
  error?: string
  errorCode?: 'NO_API_KEY' | string
}

// ─── Chat types ───────────────────────────────────────────────────────────────

export interface SystemPromptPreset {
  id: string
  name: string
  content: string
  isDefault?: boolean
}

export type ChatSendShortcut = 'enter' | 'modEnter'

export interface ChatMessageContent {
  type: 'text' | 'image'
  text?: string
  imageBase64?: string
  imageMimeType?: string
  /** Preview URL for display only (not sent to API) */
  imagePreviewUrl?: string
  imageFileName?: string
  /**
   * Key of this image's pixel data in the IndexedDB chat image store. Persisted
   * with the session (unlike `imageBase64`, which is stripped) so an AI-produced
   * image can be restored after a restart.
   */
  imageStoreKey?: string
}

/**
 * Logical phase a Deep-Research step belongs to. Used by `ResearchStepsPanel`
 * to collapse multiple consecutive steps of the same phase (e.g. 4 "survey"
 * aspects, 6 "deep dive" follow-ups) into a single compact pill, mirroring
 * the Cursor / ChatGPT tool-call pattern. The label shown to the user is a
 * short phase name (e.g. "Khảo sát · 4 khía cạnh") and the per-aspect detail
 * lives behind a hover-info popover instead of being rendered inline.
 */
export type ResearchStepPhase = 'analyze' | 'survey' | 'gap' | 'deep' | 'cross' | 'synth'

export interface ChatRequestConfiguration {
  provider: Provider
  model: string
  systemPrompt?: string
  task: import('./chatTask').ChatTaskStarterState | null
  imageMode: boolean
  deepResearchMode: boolean
  webSearchMode: boolean
  imagePlan?: { prompt: string; editPrevious: boolean; rewritten: boolean }
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: ChatMessageContent[]
  /** Immutable task instruction captured at send time; reused when retrying this turn. */
  taskInstruction?: string
  requestConfiguration?: ChatRequestConfiguration
  timestamp: number
  isLoading?: boolean
  error?: string
  /** Deep Research mode — intermediate step bubble (collapsible, gray) */
  isResearchStep?: boolean
  /** Label shown in the research step header, e.g. "Phân tích câu hỏi" */
  researchStepLabel?: string
  /**
   * Phase this research step belongs to. Drives the pill icon/title in
   * `ResearchStepsPanel` and lets multiple steps of the same phase be
   * collapsed into one row. Optional for back-compat with older messages.
   */
  researchStepPhase?: ResearchStepPhase
  /**
   * Free-text descriptor for the specific aspect / sub-question this step
   * focuses on (e.g. the aspect name for a Survey step or the gap label for
   * a Deep-dive step). Surfaced inside the hover-info popover so users can
   * see what each grouped step actually researched without the row title
   * itself becoming long.
   */
  researchStepAspect?: string
  /** Deep Research mode — final synthesis bubble (highlighted, indigo) */
  isResearchFinal?: boolean
  /**
   * Smart Thinking — lightweight indicator bubble shown while AI decides
   * whether to web-search. Renders as a minimal "Smart Thinking..." pill
   * (no inner content, no sources list, no expand/collapse).
   */
  isSmartThinkingStep?: boolean
  /** Estimated provider API cost for this assistant response. */
  cost?: UsageCost
  /** Set when the provider answered with a different model than the one selected (fallback). */
  usedModel?: string
}

/**
 * Snapshot of the Deep Research pipeline state — persisted on the session
 * so a Stop / interruption can be resumed from the last completed phase
 * instead of restarting from scratch (and re-paying for already-finished
 * provider calls).
 *
 * The renderer writes this whenever a phase completes, and clears it once
 * the synthesis phase finishes (or the user starts a brand-new question).
 * The ChatPage composer shows a "Tiếp tục nghiên cứu" primary action while
 * this snapshot exists and no draft prompt is being edited.
 */
export interface DeepResearchResumeState {
  requestConfiguration?: ChatRequestConfiguration
  /** Original user question that kicked off the pipeline. */
  question: string
  /** Aspects discovered in Phase 1 — drives the survey loop. */
  aspects: string[]
  /** All accumulated findings to date. */
  knowledgeBase: Array<{ label: string; content: string }>
  /**
   * Survey aspects that finished cleanly. Kept separately from `knowledgeBase`
   * so a Stop during the next aspect can retry that unfinished request instead
   * of treating the whole survey phase as complete.
   */
  surveyCompletedAspects?: string[]
  /**
   * Numbered survey jobs that finished cleanly. This is the canonical survey
   * checkpoint because AI-generated aspect labels can repeat.
   */
  surveyCompletedIndexes?: number[]
  /** Image context extracted in Phase 1 (when an image was attached). */
  imageContext: string
  /** Image-derived search terms (Phase 1, image attachments only). */
  imageSearchTerms: string[]
  /** Whether any web search succeeded — controls synthesis prompt tone. */
  anyWebSearch: boolean
  /**
   * Every web source cited so far, in global citation order: findings refer to
   * them as [1], [2], … so resume must keep the numbering stable.
   */
  sources?: Array<{ title: string; url: string }>
  /** Cross-reference output (only set after Phase 4 completes). */
  crossContent?: string
  /**
   * Gap/deep-dive work currently being chased. When the user stops in the
   * middle of a deep-dive query, resume uses this to retry the unfinished
   * query instead of advancing to the next gap-analysis round.
   */
  activeGapRound?: {
    iteration: number
    gaps: string[]
    queries: string[]
    completedQueryIndexes: number[]
  }
  /** Last phase that finished cleanly — pipeline resumes from the next one. */
  lastCompletedPhase: 'analyze' | 'survey' | 'gap' | 'deep' | 'cross' | 'synth'
  /**
   * Last completed gap-analysis iteration (1-based). Used by the resume
   * orchestration to skip already-run gap rounds. 0 = no gap round done yet.
   */
  lastGapIteration: number
  /** Whether attached images were included in the original run. */
  hasImages: boolean
  /**
   * Original carefulReasoning toggle — preserved so resume produces the same
   * synthesis behaviour the user expected.
   */
  carefulReasoning?: boolean
}

export interface ChatSession extends AIModelSelection {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
  /** Estimated total provider API cost for this chat thread. */
  cost?: UsageCost
  /**
   * Persisted Deep Research pipeline state. Set when the user stops the
   * pipeline mid-run; cleared when synthesis completes or the user starts a
   * new question. Drives the "Tiếp tục nghiên cứu" UX in `ResearchStepsPanel`.
   */
  deepResearchResumeState?: DeepResearchResumeState
  /**
   * Per-session composer draft — preserves text the user typed but hasn't
   * sent yet across page navigation (Chat → Translate → Chat). Matches the
   * ChatGPT/Claude pattern. Attachments are intentionally NOT persisted.
   */
  draftInput?: string
  taskState?: import('./chatTask').ChatTaskStarterState | null
  /**
   * Per-session Deep Research toggle state — preserves the mode across page
   * navigation within the same session. Resets to off for new sessions.
   */
  deepResearchMode?: boolean
  /**
   * Per-session Web Search toggle state — always forces a web search before
   * answering. Mutually exclusive with deepResearchMode and imageMode.
   */
  webSearchMode?: boolean
  /**
   * Per-session Image Mode toggle — routes messages to image generation
   * (text-only) or image editing (with attachment). Mutually exclusive with
   * webSearchMode and deepResearchMode.
   */
  imageMode?: boolean
}


export interface ChatResult {
  success: boolean
  reply?: string
  /** Model that actually answered when the provider fell back from the requested one. */
  usedModel?: string
  error?: string
  errorCode?: 'NO_API_KEY' | 'INVALID_KEY' | 'RATE_LIMIT' | 'NETWORK' | 'TIMEOUT' | 'EMPTY_RESPONSE' | 'BLOCKED_RECITATION' | 'BLOCKED_SAFETY' | string
}

export interface ChatImageEditResult {
  success: boolean
  imageBase64?: string
  imageMimeType?: string
  usedProvider?: string
  usedModel?: string
  error?: string
  errorCode?: 'NO_API_KEY' | 'INVALID_KEY' | 'RATE_LIMIT' | 'NETWORK' | 'TIMEOUT' | 'EMPTY_RESPONSE' | 'BLOCKED_RECITATION' | 'BLOCKED_SAFETY' | 'NO_IMAGE_EDIT' | string
}

export interface ChatStreamEvent {
  requestId: string
  type: 'start' | 'token' | 'end' | 'error'
  token?: string
  reply?: string
  usedModel?: string
  error?: string
  errorCode?: 'NO_API_KEY' | 'INVALID_KEY' | 'RATE_LIMIT' | 'NETWORK' | 'TIMEOUT' | 'EMPTY_RESPONSE' | 'BLOCKED_RECITATION' | 'BLOCKED_SAFETY' | string
}

export interface QuickChatSeedPayload {
  question: string
  response?: string
  provider: string
  model: string
}

// ─── Dictionary types ────────────────────────────────────────────────────────

export interface DictionaryLookupParams {
  term: string
  context?: string
  sourceLang: string
  targetLang: string
  provider: Provider
  model: string
}

export interface DictionaryResult {
  headword: string
  pronunciation: string
  partOfSpeech: string[]
  meaning: string
  translations: DictionaryTranslation[]
  examples: string[]
  notes: string[]
}

export interface DictionaryTranslation {
  text: string
  pronunciation: string
  partOfSpeech?: string
  meaning?: string
  usage?: string
  nuance?: string
  example?: string
  examples?: string[]
  collocations?: string[]
  notes?: string[]
}

export interface DictionaryEntry {
  id: string
  term: string
  normalizedTerm: string
  context?: string
  sourceLang: string
  targetLang: string
  provider: Provider
  model: string
  createdAt: number
  favorite: boolean
  result: DictionaryResult
  /** Estimated provider API cost for this lookup. */
  cost?: UsageCost
}

export interface DictionaryLookupResult {
  success: boolean
  result?: DictionaryResult
  error?: string
  errorCode?:
    | 'INVALID_INPUT'
    | 'INVALID_RESPONSE'
    | 'TRUNCATED_RESPONSE'
    | 'SAME_LANGUAGE'
    | 'CANCELLED'
    | 'NO_API_KEY'
    | 'INVALID_KEY'
    | 'RATE_LIMIT'
    | 'NETWORK'
    | 'TIMEOUT'
    | 'EMPTY_RESPONSE'
    | 'BLOCKED_RECITATION'
    | 'BLOCKED_SAFETY'
    | string
}

// ─── Live Session History ─────────────────────────────────────────────────────

export interface LiveSession extends AIModelSelection {
  id: string
  createdAt: number
  sourceLang: string
  targetLang: string
  rawTranscript: string
  translation: string
  summary?: string
  /** Speaker-labeled transcript produced by AI diarization analysis */
  speakerAnalysis?: string
  /** Action items extracted from the meeting by AI */
  actionItems?: string
  /** Key decisions extracted from the meeting by AI */
  decisions?: string
  wordCount: number
  /** Estimated provider API cost for this interpretation session. */
  cost?: UsageCost
  /** Timestamped segments for SRT/TXT export and history playback */
  segments?: Array<{
    id: string
    rawText: string
    translation: string
    speaker: string
    timestamp: number
    revision?: number
    state?: import('../../shared/liveInterpretation').LiveSegmentState
  }>
  /** User-assigned speaker display names, e.g. { 'Speaker 1': 'Alice' } */
  speakerNameMap?: Record<string, string>
}

// ─── History ──────────────────────────────────────────────────────────────────

export interface HistoryItem {
  id: string
  timestamp: number
  provider: Provider
  model: string
  sourceLang: string
  targetLang: string
  translationStyle?: TranslationStyle
  sourceText: string
  translatedText: string
  /** Estimated provider API cost for this translation run. */
  cost?: UsageCost
}

// ─── Subtitle appearance settings ────────────────────────────────────────────

export interface SubtitleSettings {
  /** Hex color for subtitle text, e.g. '#ffffff' */
  textColor: string
  /** Font size in pixels (12–40) */
  fontSize: number
  /** Background opacity percentage (0–100) */
  bgOpacity: number
}

// ─── Window API (exposed via contextBridge) ───────────────────────────────────

export interface WindowApi {
  liveInterpretation: import('../../shared/liveInterpretation').LiveInterpretationApi
  keychain: {
    save: (provider: string, key: string) => Promise<KeychainResult>
    get: (provider: string) => Promise<KeychainResult>
    delete: (provider: string) => Promise<KeychainResult>
    hasKey: (provider: string) => Promise<{ exists: boolean }>
  }
  fetchModels: (provider: string) => Promise<FetchModelsResult>
  discoverLocalAi: (force?: boolean) => Promise<LocalAiDiscoveryResult>
  ensureLocalAiRuntime: () => Promise<LocalAiDiscoveryResult>
  benchmarkLocalAi: () => Promise<LocalAiBenchmarkResult>
  getLocalAiPerformance: (model: string) => Promise<import('../../shared/localAiPerformance').LocalAiPerformanceState>
  compareLocalAiPerformance: (request: import('../../shared/localAiPerformance').LocalAiPerformanceRequest) => Promise<import('../../shared/localAiPerformance').LocalAiPerformanceState>
  selectLocalAiPerformance: (model: string, mode: import('../../shared/localAiPerformance').LocalAiExecutionMode | 'auto') => Promise<import('../../shared/localAiPerformance').LocalAiPerformanceState>
  cancelLocalAiPerformance: () => Promise<void>
  downloadLocalAiModel: (modelId: string) => Promise<LocalAiDownloadResult>
  uninstallLocalAiModel: (modelId: string) => Promise<LocalAiModelActionResult>
  onLocalAiModelDownloadProgress: (cb: (progress: LocalAiModelDownloadProgress) => void) => () => void
  /** Model pulls still running in the main process (they outlive the Settings view). */
  getLocalAiActiveDownloads?: () => Promise<LocalAiModelDownloadProgress[]>
  /** Opens the local runtime's download page in the browser (nothing is installed by the app). */
  installOllama: () => Promise<LocalAiInstallResult>
  cancelModelDownload?: (modelId: string) => Promise<{ success: boolean; cancelled?: boolean }>
  verifyKey: (provider: string, apiKey: string) => Promise<VerifyResult>
  translate: (params: TranslateParams) => Promise<TranslateResult>
  cancelTranslate?: (params: { requestId: string }) => Promise<{ success: boolean; error?: string }>
  rewriteText: (params: {
    provider: string
    model: string
    text: string
    lang: string
    translationStyle?: TranslationStyle
  }) => Promise<TranslateResult>
  /** Detect the BCP-47 language code of source text (e.g. "vi", "en", "ja"). */
  detectLanguage: (params: {
    provider: string
    model: string
    text: string
  }) => Promise<{ success: boolean; lang?: string; error?: string }>
  transcribeAudio: (params: TranscribeAudioParams) => Promise<TranscribeResult>
  cancelAudioTranscription: (
    params: CancelAudioTranscriptionParams,
  ) => Promise<CancelAudioTranscriptionResult>
  speakText: (params: {
    text: string
    voice?: TtsVoice
    mode?: TtsMode
    lang?: string
  }) => Promise<TtsResult>
  translateImage: (params: {
    provider: string
    model: string
    requestId?: string
    imageBase64: string
    imageMimeType: string
    sourceLang: string
    targetLang: string
    /** Opt-in: allow uploading the image to another provider that has a stored key. */
    allowProviderFallback?: boolean
  }) => Promise<ImageTranslateResult>
  /**
   * Subscribe to model/provider switch events pushed during image translation fallback.
   * Fired immediately when the system decides to try a different model (before translation completes).
   * Returns a cleanup function — call it to unsubscribe.
   */
  onImageModelSwitched: (cb: (data: { model: string; provider: string }) => void) => () => void
  /** Web search via Tavily → Brave → Jina fallback chain */
  webSearch: (params: {
    query: string
    maxResults?: number
  }) => Promise<{
    success: boolean
    results?: Array<{ title: string; url: string; content: string; score: number }>
    answer?: string
    error?: string
    errorCode?: string
    /** Which provider actually served the request */
    provider?: 'tavily' | 'brave' | 'jina'
    /** Present when a configured provider failed and a lower-priority one answered. */
    fallback?: { from: 'tavily' | 'brave'; reason: 'auth' | 'quota' | 'error' }
  }>
  /**
   * Verify a web search API key by making a real minimal request.
   * Must be called BEFORE saving to keychain so the user gets immediate feedback.
   */
  webSearchVerify: (params: {
    provider: 'tavily' | 'brave'
    apiKey: string
  }) => Promise<{ valid: boolean; error?: string }>
  chat: (params: {
    provider: string
    model: string
    messages: Array<{
      role: 'user' | 'assistant'
      content: Array<{
        type: 'text' | 'image'
        text?: string
        imageBase64?: string
        imageMimeType?: string
      }>
    }>
    systemPrompt?: string
    /** Bypass the 3k char limit — only set true for AI Summarize on long transcripts */
    bypassLengthCheck?: boolean
    /** Optional larger output budget for long-form synthesis calls */
    maxOutputTokens?: number | 'model-max'
    /**
     * When true, the main process injects the "REASONING DISCIPLINE" directive
     * into the system prompt so the provider walks through math step-by-step
     * and self-checks the answer against every stated constraint. Used by the
     * Chat composer's "Careful Reasoning" toggle.
     */
    carefulReasoning?: boolean
  }) => Promise<ChatResult>
  editChatImage?: (params: {
    requestId?: string
    provider: string
    model: string
    prompt: string
    imageBase64: string
    imageMimeType: string
  }) => Promise<ChatImageEditResult>
  generateChatImage?: (params: {
    requestId?: string
    provider: string
    model: string
    prompt: string
  }) => Promise<ChatImageEditResult>
  chatStream: (params: {
    requestId: string
    provider: string
    model: string
    messages: Array<{
      role: 'user' | 'assistant'
      content: Array<{
        type: 'text' | 'image'
        text?: string
        imageBase64?: string
        imageMimeType?: string
      }>
    }>
    systemPrompt?: string
    /** Bypass the 3k char limit — only set true for AI Summarize on long transcripts */
    bypassLengthCheck?: boolean
    /** Optional larger output budget for long-form synthesis calls */
    maxOutputTokens?: number | 'model-max'
    /**
     * When true, the main process injects the "REASONING DISCIPLINE" directive
     * into the system prompt so the provider walks through math step-by-step
     * and self-checks the answer against every stated constraint. Used by the
     * Chat composer's "Careful Reasoning" toggle.
     */
    carefulReasoning?: boolean
  }) => Promise<ChatResult>
  /**
   * Cancel an in-flight chat stream by `requestId`. The renderer calls this

   * when the user clicks the Stop button in chat input. The main-process
   * handler aborts the underlying provider request, so token streaming halts
   * almost immediately. Resolves with `{ success: true }` when the cancel
   * signal was delivered, or `{ success: false, error }` when the requestId
   * was not found (e.g. stream already finished).
   */
  chatStreamCancel?: (params: { requestId: string }) => Promise<{ success: boolean; error?: string }>
  onChatStreamEvent: (requestId: string, cb: (event: ChatStreamEvent) => void) => () => void
  checkScreenPermission: () => Promise<string>
  openExternal: (url: string) => Promise<void>
  relaunchApp: () => Promise<void>
  /** Aligns native window chrome (title bar overlay, window background) with the in-app theme. */
  setWindowTheme?: (theme: 'light' | 'dark' | 'system') => Promise<void>
  /**
   * Pre-flight STT availability check — call before starting a Live Translate session.
   * Checks which STT keys are configured (instant, no API call, no decryption) and
   * pre-warms the session cache so the very first audio chunk goes to the right backend.
   *
   * Returns the best available provider and the full ordered list of available backends.
   */
  checkSttProviders: () => Promise<SttProviderCheckResult>
  /**
   * Streaming translation — each AI token is pushed directly to the subtitle
   * window in real-time. Returns the full translated text when complete.
   */
  translateStream: (params: {
    provider: string
    model: string
    sourceText: string
    sourceLang: string
    targetLang: string
    translationStyle?: string
    /** Segment ID — used by subtitle window to correlate streaming tokens */
    segId?: string
  }) => Promise<TranslateResult>
  /** Floating subtitle overlay — runs in a separate always-on-top OS window */
  subtitle: {
    show: () => Promise<void>
    hide: () => Promise<void>
    update: (text: string, isTranslating: boolean) => Promise<void>
    setStyle: (style: SubtitleSettings) => Promise<void>
    /** Push the latest raw (source) text to show above the translation */
    setSourceText: (text: string, segId?: string) => Promise<void>
    /** Push current session state to subtitle window */
    pushState: (state: {
      selectedProvider: string
      selectedModel: string
      isActive: boolean
      isTranscribing: boolean
      isTranslating: boolean
      availableModels: { id: string; name: string }[]
      audioMode: string
      targetLang: string
      locale?: string
    }) => Promise<void>
    /** Returns a cleanup function that removes the listener */
    onClosed: (callback: () => void) => () => void
    /** Listen for Start action from subtitle window. Returns cleanup fn. */
    onStart: (callback: () => void) => () => void
    /** Listen for Stop action from subtitle window. Returns cleanup fn. */
    onStop: (callback: () => void) => () => void
    /** Listen for provider change from subtitle window. Returns cleanup fn. */
    onSetProvider: (callback: (provider: string) => void) => () => void
    /** Listen for model change from subtitle window. Returns cleanup fn. */
    onSetModel: (callback: (model: string) => void) => () => void
    /** Listen for audio mode change from subtitle window. Returns cleanup fn. */
    onSetAudioMode: (callback: (mode: string) => void) => () => void
    /** Listen for target language change from subtitle window. Returns cleanup fn. */
    onSetTargetLang: (callback: (lang: string) => void) => () => void
    /** Listen for style changes from subtitle window. Returns cleanup fn. */
    onStyleUpdate: (callback: (style: SubtitleSettings) => void) => () => void
    /** Listen for "new session / clear" action from subtitle window. Returns cleanup fn. */
    onClear: (callback: () => void) => () => void
  }
  platform: string
  version: string

  /** Global hotkey — translate selected text in any OS application */
  hotkey: {
    update: (settings: {
      hotkey?: string
      enabled?: boolean
      provider?: string
      model?: string
      sourceLang?: string
      targetLang?: string
      /** UI language for the floating hotkey indicator strings. */
      uiLanguage?: 'vi' | 'en' | 'ja'
    }) => Promise<{ success: boolean; settings?: Record<string, unknown>; error?: string; errorCode?: 'INVALID' | 'IN_USE' | 'CONFLICT' | string }>
    get: () => Promise<{ success: boolean; settings?: Record<string, unknown> }>
    disable: () => Promise<{ success: boolean }>
    onTranslating: (cb: (data: { text: string }) => void) => () => void
    onTranslated: (cb: (data: { original: string; translated: string }) => void) => () => void
    onError: (cb: (data: { error: string }) => void) => () => void
    /** AI Chat quick-ask hotkey — opens a popup in the renderer */
    chat: {
      update: (settings: { hotkey?: string; enabled?: boolean }) =>
        Promise<{ success: boolean; settings?: Record<string, unknown>; error?: string; errorCode?: 'INVALID' | 'IN_USE' | 'CONFLICT' | string }>
      get: () => Promise<{ success: boolean; settings?: Record<string, unknown> }>
      /** Listen for the chat-open event. Returns a cleanup function. */
      onOpen: (cb: () => void) => () => void
    }
  }

  /** Standalone Raycast-style AI Chat quick window */
  quickChat: {
    setLayout: (layout: 'compact' | 'expanded', contentHeight?: number) => Promise<{ success: boolean }>
    launcher: import('../../shared/launcher').LauncherApi
    hide: () => Promise<{ success: boolean; error?: string }>
    openSettings: () => Promise<{ success: boolean; error?: string }>
    openInChat: (payload?: QuickChatSeedPayload) => Promise<{ success: boolean; error?: string }>
    onShow: (cb: () => void) => () => void
    onOpenSettings: (cb: () => void) => () => void
    onOpenInChat: (cb: (payload: QuickChatSeedPayload | null) => void) => () => void
  }

  /** Legacy Assistant — floating icon injected into browsers without an extension */
  legacyAssistant: {
    get: () => Promise<{ success: boolean; settings?: Record<string, unknown> }>
    update: (settings: { enabled?: boolean; targetLang?: string }) => Promise<{ success: boolean }>
    getBookmarklet: () => Promise<{ success: boolean; bookmarklet?: string; error?: string }>
    injectNow: () => Promise<{ success: boolean }>
  }

  /** Auto-updater — check and install updates from GitHub Releases */
  updater: {
    consumeOpenSettings?: () => Promise<boolean>
    getNotificationPreferences?: () => Promise<UpdateNotificationPreferences | null>
    setNotificationPreferences?: (patch: Partial<UpdateNotificationPreferences>) => Promise<UpdateNotificationPreferences | null>
    onOpenSettings?: (callback: () => void) => () => void
    getStatus?: () => Promise<UpdateStatus | null>
    check: () => Promise<{ success: boolean; error?: string }>
    /** In-app download. macOS downloads the unsigned DMG without opening Finder. */
    download: () => Promise<{ success: boolean; error?: string; errorCode?: string; filePath?: string; verified?: boolean }>
    /** Quit and install, or delegate to the platform updater. */
    install: () => Promise<{ success: boolean; error?: string }>
    /** Manual fallback for macOS: open the downloaded DMG in Finder. */
    openInstaller: () => Promise<{ success: boolean; error?: string }>
    getVersion: () => Promise<{ version: string }>
    /**
     * Open the download URL in the system browser.
     * Fallback only — falls back to GitHub Releases page.
     */
    openDownload: (url?: string) => Promise<{ success: boolean }>
    onStatus: (cb: (status: UpdateStatus) => void) => () => void
  }

  /** Local HTTP server — Chrome Extension bridge (multi-API-key) */
  localServer: {
    createToken: (p: { name: string; ttlDays: number }) => Promise<{
      success: boolean; token?: string; id?: string; name?: string
      createdAt?: number; expiresAt?: number; error?: string
    }>
    listTokens: () => Promise<{
      success: boolean; port: number
      tokens: Array<{ id: string; name: string; createdAt: number; expiresAt: number }>
    }>
    deleteToken: (p: { id: string }) => Promise<{ success: boolean; error?: string }>
    regenerateToken: (p: { id: string; ttlDays?: number }) => Promise<{
      success: boolean; token?: string; id?: string; name?: string
      createdAt?: number; expiresAt?: number; error?: string
    }>
    /** Sync the currently selected provider/model and TTS prefs so local extension APIs reflect the app's state. */
    syncConfig: (p: {
      provider: string
      model: string
      ttsMode?: TtsMode
      ttsVoice?: TtsVoice
    }) => Promise<{ success: boolean }>
  }
}

declare global {
  interface Window {
    api: WindowApi
  }
}

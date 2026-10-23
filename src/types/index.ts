import type { AudioApi } from '../../shared/audioApi'
import type { ChatApi } from '../../shared/chatApi'
import type { SystemApi } from '../../shared/systemApi'
import type {
  LocalAiEngine,
  PhoneticMode,
  TranslateApi,
  TranslationReasoningEffort,
  TranslationStyle,
} from '../../shared/translateApi'
import type { WebSearchApi } from '../../shared/webSearchApi'

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

/** How the multi-model comparison lays out finished translations on wide layouts. */
export type TranslateComparisonView = 'columns' | 'sentences'


/**
 * Phonetic annotation mode:
 *  - 'off'      — no phonetic annotations
 *  - 'standard' — add {word|reading} ruby annotations (furigana/pinyin/romanization above original script)
 *  - 'phonetic' — replace original script with pure phonetics (hiragana-only, pinyin-only, romanization-only, IPA)
 */

export type SpeakPanel = 'source' | 'translated' | `comparison:${string}`

/**
 * TTS routing preference:
 *  - 'free'    — free Edge TTS only; never uses local system voices or paid API keys
 *  - 'auto'    — Edge TTS first, then paid providers only if free TTS fails
 *  - 'premium' — paid providers first for quality, then free fallback
 */

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

export type {
  CapabilitiesApi,
  CapabilityId,
  CapabilityPermission,
  CapabilityStatus,
} from '../../shared/capabilitiesApi'
export type {
  HotkeyApi,
  HotkeyErrorEvent,
  HotkeySettingsPatch,
  HotkeyTranslatedEvent,
  HotkeyTranslatingEvent,
  SystemShortcutOwner,
} from '../../shared/hotkeyApi'

/** Workspace pages are feature modules; see `shared/modules.d.ts` and `src/modules/catalog.ts`. */
export type AppPage = import('../../shared/modules').ModuleId

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

export type { AudioApi, SpeakTextParams, TtsMode, TtsResult, TtsVoice } from '../../shared/audioApi'
export type {
  ChatApi,
  ChatContentPart,
  ChatErrorCode,
  ChatImageEditParams,
  ChatImageEditResult,
  ChatImageGenerateParams,
  ChatParams,
  ChatRequestMessage,
  ChatResult,
  ChatStreamEvent,
  ChatStreamParams,
  ImageModelSwitchedEvent,
  ImageTextRegion,
  ImageTranslateParams,
  ImageTranslateResult,
} from '../../shared/chatApi'
export type { KeychainApi, KeychainResult } from '../../shared/keychainApi'
export type { LegacyAssistantApi } from '../../shared/legacyAssistantApi'
export type { LocalAiExecutionMode, LocalAiPerformanceComparison, LocalAiPerformanceMeasurement, LocalAiPerformanceProfile, LocalAiPerformanceState } from '../../shared/localAiPerformance'
export type { LocalServerApi, LocalServerTokenResult, LocalServerTokenSummary } from '../../shared/localServerApi'
export type { SubtitleApi, SubtitleSessionState, SubtitleStyle } from '../../shared/subtitleApi'
export type {
  DetectLanguageRequest,
  FetchedModel,
  FetchModelsResult,
  LocalAiBenchmarkResult,
  LocalAiDiscoveryResult,
  LocalAiDownloadResult,
  LocalAiEngine,
  LocalAiHardwareProfile,
  LocalAiHardwareTier,
  LocalAiInstallResult,
  LocalAiModelActionResult,
  LocalAiModelDownloadProgress,
  PhoneticMode,
  RewriteTextRequest,
  TranslateApi,
  TranslateErrorCode,
  TranslateRequest,
  TranslateResult,
  TranslateStreamRequest,
  TranslationReasoningEffort,
  TranslationStyle,
  VerifyResult,
} from '../../shared/translateApi'
export type { UpdaterApi, UpdaterDownloadResult } from '../../shared/updaterApi'
export type { WebSearchApi, WebSearchHit, WebSearchParams, WebSearchResult } from '../../shared/webSearchApi'

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


export type { QuickChatApi, QuickChatLayout, QuickChatSeedPayload } from '../../shared/quickChatApi'

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

/** One model's finished translation inside a multi-model comparison entry. */
export interface HistoryTranslationResult extends AIModelSelection {
  translatedText: string
  durationMs?: number | null
  /** Estimated provider API cost for this model's run. */
  cost?: UsageCost
}

/**
 * One translation run. A single-model run stores its result in the top-level
 * fields. A multi-model comparison also keeps every successful result in
 * `results`, so the run can be reopened with all of its models; the top-level
 * fields then hold the representative translation — the one the user picked,
 * or the first successful model until they pick.
 */
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
  /** Estimated provider API cost for the representative translation. */
  cost?: UsageCost
  /** Every successful result of a comparison run, in model order. Absent for single-model runs. */
  results?: HistoryTranslationResult[]
  /**
   * Key of the result the user picked: `provider:model`, or `assembled` for a
   * translation assembled sentence by sentence. Absent until they pick.
   */
  selectedKey?: string
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

/** `SystemApi` members (platform, version, openExternal, ...) sit directly on `window.api`; shape: shared/systemApi.d.ts. */
export interface WindowApi extends SystemApi, WebSearchApi, AudioApi, ChatApi, TranslateApi {
  /** Secure API key storage; shape: shared/keychainApi.d.ts. */
  keychain: import('../../shared/keychainApi').KeychainApi
  /** Floating subtitle overlay — runs in a separate always-on-top OS window */
  /** Floating subtitle overlay for live interpretation; shape: shared/subtitleApi.d.ts. */
  subtitle: import('../../shared/subtitleApi').SubtitleApi
  /** Capabilities — what this machine can do and whether the user allowed it. Shape: shared/capabilitiesApi.d.ts. */
  capabilities: import('../../shared/capabilitiesApi').CapabilitiesApi

  /** Global hotkeys — Quick Translate and the Launcher shortcut. Shape: shared/hotkeyApi.d.ts. */
  hotkey: import('../../shared/hotkeyApi').HotkeyApi

  /** Standalone Raycast-style Launcher / quick chat window; shape: shared/quickChatApi.d.ts. */
  quickChat: import('../../shared/quickChatApi').QuickChatApi<UsageCost>

  /** Legacy Assistant — floating icon injected into browsers without an extension; shape: shared/legacyAssistantApi.d.ts. */
  legacyAssistant: import('../../shared/legacyAssistantApi').LegacyAssistantApi

  /** Auto-updater — check and install updates from GitHub Releases; shape: shared/updaterApi.d.ts. */
  updater: import('../../shared/updaterApi').UpdaterApi

  /** Local HTTP server — Chrome Extension bridge (multi-API-key); shape: shared/localServerApi.d.ts. */
  localServer: import('../../shared/localServerApi').LocalServerApi
}

declare global {
  interface Window {
    api: WindowApi
  }
}

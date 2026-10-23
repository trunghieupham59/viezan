/**
 * Translate and model API — text translation, rewrite, language detection, streaming
 * translation to the subtitle window, provider model lists, API key verification and
 * the local AI runtime (discovery, benchmark, model downloads, performance profiles).
 * These members sit directly on `window.api`. Single source for their shape; see
 * `electron/preload/translate.ts`, `electron/ipc/translate.ts`, `models.ts`, `localAi.ts`.
 */
import type { LocalAiExecutionMode, LocalAiPerformanceRequest, LocalAiPerformanceState } from './localAiPerformance'

export type TranslationStyle = 'general' | 'formal' | 'casual' | 'business' | 'technical' | 'natural'
export type PhoneticMode = 'off' | 'standard' | 'phonetic'
/** Provider-default reasoning, or a portable explicit effort level. */
export type TranslationReasoningEffort = 'auto' | 'low' | 'medium' | 'high'
export type LocalAiEngine = 'ollama' | 'lmstudio' | 'llamacpp'
export type LocalAiHardwareTier = 'low' | 'balanced' | 'powerful' | 'max'

export type TranslateErrorCode = 'NO_API_KEY' | 'INVALID_KEY' | 'RATE_LIMIT' | 'NETWORK' | (string & {})

export interface TranslateRequest {
  provider: string
  model: string
  requestId?: string
  sourceText: string
  sourceLang: string
  targetLang: string
  showFurigana?: boolean
  /** Explicit phonetic mode; overrides `showFurigana` when present. */
  phoneticMode?: PhoneticMode
  translationStyle?: TranslationStyle
  reasoningEffort?: TranslationReasoningEffort
  /** Skip translation and only add phonetic annotations to the already-translated text. */
  phoneticOnly?: boolean
}

export interface TranslateResult {
  success: boolean
  translatedText?: string
  error?: string
  errorCode?: TranslateErrorCode
}

export interface RewriteTextRequest {
  provider: string
  model: string
  text: string
  lang: string
  translationStyle?: TranslationStyle
}

export interface DetectLanguageRequest {
  provider: string
  model: string
  text: string
}

export interface TranslateStreamRequest {
  provider: string
  model: string
  sourceText: string
  sourceLang: string
  targetLang: string
  translationStyle?: string
  /** Segment id the subtitle window uses to correlate streamed tokens. */
  segId?: string
}

export interface VerifyResult {
  success: boolean
  error?: string
  errorCode?: 'INVALID_KEY' | 'BILLING' | 'PERMISSION' | 'RATE_LIMIT' | 'NETWORK' | (string & {})
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

export interface FetchModelsResult {
  success: boolean
  models: FetchedModel[]
  /** Best model for translation, picked by the scoring algorithm. */
  recommendedModel?: string
  error?: string
  errorCode?: 'NO_API_KEY' | (string & {})
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

export interface TranslateApi {
  fetchModels: (provider: string) => Promise<FetchModelsResult>
  /** Discover a running local AI runtime (Ollama, LM Studio, llama.cpp). */
  discoverLocalAi: (force?: boolean) => Promise<LocalAiDiscoveryResult>
  /** Ensure a local runtime is available, starting the managed one when possible. */
  ensureLocalAiRuntime: () => Promise<LocalAiDiscoveryResult>
  benchmarkLocalAi: () => Promise<LocalAiBenchmarkResult>
  getLocalAiPerformance: (model: string) => Promise<LocalAiPerformanceState>
  compareLocalAiPerformance: (request: LocalAiPerformanceRequest) => Promise<LocalAiPerformanceState>
  selectLocalAiPerformance: (model: string, mode: LocalAiExecutionMode | 'auto') => Promise<LocalAiPerformanceState>
  cancelLocalAiPerformance: () => Promise<void>
  downloadLocalAiModel: (modelId: string) => Promise<LocalAiDownloadResult>
  uninstallLocalAiModel: (modelId: string) => Promise<LocalAiModelActionResult>
  onLocalAiModelDownloadProgress: (cb: (progress: LocalAiModelDownloadProgress) => void) => () => void
  /** Model pulls still running in main (they outlive the Settings view). */
  getLocalAiActiveDownloads: () => Promise<LocalAiModelDownloadProgress[]>
  /** Opens the runtime's download page; nothing is installed by the app. */
  installOllama: () => Promise<LocalAiInstallResult>
  cancelModelDownload: (modelId: string) => Promise<{ success: boolean; cancelled?: boolean }>
  verifyKey: (provider: string, apiKey: string) => Promise<VerifyResult>
  translate: (params: TranslateRequest) => Promise<TranslateResult>
  /** Cancel an in-flight text or image translation by its renderer requestId. */
  cancelTranslate: (params: { requestId: string }) => Promise<{ success: boolean; error?: string }>
  /** Rewrite text to read naturally in its own language, preserving meaning and tone. */
  rewriteText: (params: RewriteTextRequest) => Promise<TranslateResult>
  /** BCP-47 code of the text's language (e.g. "vi", "en", "ja"). */
  detectLanguage: (params: DetectLanguageRequest) => Promise<{ success: boolean; lang?: string; error?: string }>
  /** Streams tokens straight to the subtitle window; resolves with the full translation. */
  translateStream: (params: TranslateStreamRequest) => Promise<TranslateResult>
}

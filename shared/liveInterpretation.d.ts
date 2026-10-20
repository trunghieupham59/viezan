export interface LiveTranslationRequest {
  sessionId: string
  segmentId: string
  provider: 'openai' | 'gemini' | 'claude' | 'local'
  model: string
  sourceLang: string
  targetLang: string
  sourceText: string
  context: string
  subtitles: boolean
  /** Source revision issued by the session assembler; omitted for legacy callers. */
  revision?: number
}

export type LiveSegmentState = 'pending' | 'provisional' | 'final' | 'incomplete'

export interface LiveAssemblyRequest {
  sessionId: string
  action: 'append' | 'silence' | 'stop'
  sourceLang: string
  targetLang: string
  /** Strictly increasing per session; duplicate/late chunks are rejected. */
  sequence: number
  sourceText: string
  durationMs: number
  /** A capture pause is only a hint; a hard recording-window cut is false. */
  pause: boolean
  speaker: string
  timestamp: number
}

export interface LiveAssemblyUpdate {
  segmentId: string
  revision: number
  sourceText: string
  context: string
  speaker: string
  timestamp: number
  state: LiveSegmentState
  translate: boolean
}

export type LiveAssemblyResult = {
  success: true
  updates: LiveAssemblyUpdate[]
  hasOpen: boolean
} | { success: false; errorCode: string }

export interface LiveTokenUsage {
  inputTokens: number
  outputTokens: number
  /** Includes hidden reasoning where the provider reports it. */
  totalTokens: number
  estimated: boolean
}

export type LiveTranslationResult = {
  success: true
  translatedText: string
  usage: LiveTokenUsage
  cached: boolean
  attempts: number
  /** Measured service stages, excluding renderer capture/STT latency. */
  timing?: { queueMs: number; providerMs: number }
} | { success: false; errorCode: string; usage?: LiveTokenUsage }

export interface LiveInterpretationApi {
  begin: (sessionId: string) => Promise<void>
  translate: (request: LiveTranslationRequest) => Promise<LiveTranslationResult>
  assemble: (request: LiveAssemblyRequest) => Promise<LiveAssemblyResult>
  cancel: (sessionId: string) => Promise<void>
}

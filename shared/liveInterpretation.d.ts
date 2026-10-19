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
}

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
} | { success: false; errorCode: string; usage?: LiveTokenUsage }

export interface LiveInterpretationApi {
  begin: (sessionId: string) => Promise<void>
  translate: (request: LiveTranslationRequest) => Promise<LiveTranslationResult>
  cancel: (sessionId: string) => Promise<void>
}

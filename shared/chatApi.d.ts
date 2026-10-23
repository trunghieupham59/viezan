/**
 * Chat and image-translation API — multi-turn AI chat (plain and streaming), chat image
 * edit/generation, and OCR + translation of images. These members sit directly on
 * `window.api`. Single source for their shape; see `electron/preload/chat.ts`,
 * `electron/ipc/chat.ts` and `electron/ipc/imageTranslate.ts`.
 */

export type ChatErrorCode =
  | 'NO_API_KEY'
  | 'INVALID_KEY'
  | 'RATE_LIMIT'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'EMPTY_RESPONSE'
  | 'BLOCKED_RECITATION'
  | 'BLOCKED_SAFETY'
  | 'MODEL_REFUSAL'
  | (string & {})

export interface ChatContentPart {
  type: 'text' | 'image'
  text?: string
  imageBase64?: string
  imageMimeType?: string
}

export interface ChatRequestMessage {
  role: 'user' | 'assistant'
  content: ChatContentPart[]
}

export interface ChatParams {
  provider: string
  model: string
  messages: ChatRequestMessage[]
  systemPrompt?: string
  /** Bypass the input length limit; only for AI Summarize on long transcripts. */
  bypassLengthCheck?: boolean
  /** Larger output budget for long-form synthesis calls. */
  maxOutputTokens?: number | 'model-max'
  /**
   * Main injects the "REASONING DISCIPLINE" directive so the provider works step by step
   * and checks its answer against every stated constraint (Chat's "Careful Reasoning").
   */
  carefulReasoning?: boolean
}

export interface ChatStreamParams extends ChatParams {
  requestId: string
}

export interface ChatResult {
  success: boolean
  reply?: string
  /** Model that actually answered when the provider fell back from the requested one. */
  usedModel?: string
  error?: string
  errorCode?: ChatErrorCode
}

export interface ChatImageEditParams {
  requestId?: string
  provider: string
  model: string
  prompt: string
  imageBase64: string
  imageMimeType: string
}

export interface ChatImageGenerateParams {
  requestId?: string
  provider: string
  model: string
  prompt: string
}

export interface ChatImageEditResult {
  success: boolean
  imageBase64?: string
  imageMimeType?: string
  usedProvider?: string
  usedModel?: string
  error?: string
  errorCode?: ChatErrorCode | 'NO_IMAGE_EDIT'
}

export interface ChatStreamEvent {
  requestId: string
  type: 'start' | 'token' | 'end' | 'error'
  token?: string
  reply?: string
  usedModel?: string
  error?: string
  errorCode?: ChatErrorCode
}

export interface ImageTextRegion {
  /** 0.0–1.0 fraction of image width. */
  x: number
  /** 0.0–1.0 fraction of image height. */
  y: number
  /** 0.0–1.0 fraction of image width. */
  width: number
  /** 0.0–1.0 fraction of image height. */
  height: number
  originalText: string
  translatedText: string
  /** 0.0–1.0 fraction of image height. */
  fontSize: number
  bgColor: string
  textColor: string
}

export interface ImageTranslateParams {
  provider: string
  model: string
  requestId?: string
  imageBase64: string
  imageMimeType: string
  sourceLang: string
  targetLang: string
  /** Opt-in: allow uploading the image to another provider that has a stored key. */
  allowProviderFallback?: boolean
}

export interface ImageTranslateResult {
  success: boolean
  regions?: ImageTextRegion[]
  /** base64 of the fully edited image (returned when Gemini image-edit is used). */
  editedImageBase64?: string
  /** MIME type of `editedImageBase64` as returned by the model (may differ from the source image). */
  editedImageMimeType?: string
  /** Providers with a stored key that were not tried because provider fallback was off (NO_VISION). */
  fallbackProviders?: string[]
  error?: string
  errorCode?: 'NO_API_KEY' | 'INVALID_KEY' | 'RATE_LIMIT' | 'NO_VISION' | (string & {})
  /** Set when a different model was used due to vision-capability fallback. */
  usedModel?: string
  /** Set when a different provider was used due to vision-capability fallback. */
  usedProvider?: string
}

export interface ImageModelSwitchedEvent {
  model: string
  provider: string
}

export interface ChatApi {
  translateImage: (params: ImageTranslateParams) => Promise<ImageTranslateResult>
  /** Fired as soon as image translation decides to try a different model, before it completes. */
  onImageModelSwitched: (cb: (data: ImageModelSwitchedEvent) => void) => () => void
  chat: (params: ChatParams) => Promise<ChatResult>
  editChatImage: (params: ChatImageEditParams) => Promise<ChatImageEditResult>
  generateChatImage: (params: ChatImageGenerateParams) => Promise<ChatImageEditResult>
  chatStream: (params: ChatStreamParams) => Promise<ChatResult>
  /** Abort an in-flight stream; `{ success: false }` when the request already finished. */
  chatStreamCancel: (params: { requestId: string }) => Promise<{ success: boolean; error?: string }>
  /** Events for one `requestId` only; other streams' events are filtered out. */
  onChatStreamEvent: (requestId: string, cb: (event: ChatStreamEvent) => void) => () => void
}

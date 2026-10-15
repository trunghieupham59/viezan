/**
 * Chat & image-translate preload API — multi-turn AI chat and image OCR+translation.
 */
import { ipcRenderer } from 'electron'

type ChatStreamEvent = {
  requestId: string
  type: 'start' | 'token' | 'end' | 'error'
  token?: string
  reply?: string
  usedModel?: string
  error?: string
  errorCode?: string
}

type ChatParams = {
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
  /** Bypass the char limit — only set true for AI Summarize on long transcripts */
  bypassLengthCheck?: boolean
  /** Optional larger output budget for long-form synthesis calls */
  maxOutputTokens?: number | 'model-max'
  /**
   * When true, the main process injects the "REASONING DISCIPLINE" directive
   * into the system prompt so the provider walks through math step-by-step
   * and self-checks the answer against every stated constraint.
   */
  carefulReasoning?: boolean
}


type ChatImageEditParams = {
  provider: string
  model: string
  prompt: string
  imageBase64: string
  imageMimeType: string
}

export const chatSection = {
  // Image translation — extracts text regions from image and returns translated regions
  translateImage: (params: {
    provider: string
    model: string
    requestId?: string
    imageBase64: string
    imageMimeType: string
    sourceLang: string
    targetLang: string
    allowProviderFallback?: boolean
  }) => ipcRenderer.invoke('image:translate', params),

  /**
   * Subscribe to model/provider switch events pushed during image translation fallback.
   * Fired immediately when the system decides to try a different model, before translation completes.
   * Returns a cleanup function — call it to unsubscribe.
   */
  onImageModelSwitched: (cb: (data: { model: string; provider: string }) => void) => {
    const handler = (_: unknown, data: { model: string; provider: string }) => cb(data)
    ipcRenderer.on('image:model-switched', handler)
    return () => ipcRenderer.removeListener('image:model-switched', handler)
  },

  // AI Chat — supports text + image messages, multi-turn conversation
  chat: (params: ChatParams) => ipcRenderer.invoke('chat:send', params),

  // AI Chat image editing — returns an edited image for image+edit prompts.
  editChatImage: (params: ChatImageEditParams) =>
    ipcRenderer.invoke('chat:image-edit', params),

  // AI Chat image generation — generates a new image from a text prompt.
  generateChatImage: (params: { provider: string; model: string; prompt: string }) =>
    ipcRenderer.invoke('chat:image-generate', params),

  chatStream: (params: ChatParams & { requestId: string }) =>
    ipcRenderer.invoke('chat:stream', params),

  // Cancel an in-flight chat stream so the user can interrupt long answers.
  chatStreamCancel: (params: { requestId: string }) =>
    ipcRenderer.invoke('chat:stream:cancel', params),

  onChatStreamEvent: (requestId: string, cb: (event: ChatStreamEvent) => void) => {
    const handler = (_: unknown, event: ChatStreamEvent) => {
      if (event?.requestId === requestId) cb(event)
    }
    ipcRenderer.on('chat:stream:event', handler)
    return () => ipcRenderer.removeListener('chat:stream:event', handler)
  },
}

/**
 * Chat service — thin wrapper over window.api.chat IPC call.
 *
 * Centralizes all chat-related API calls, decoupling ChatPage from the
 * IPC interface directly. If the IPC protocol changes, only this file
 * needs to be updated.
 *
 * Usage:
 *   import { chatService } from '../services/chatService'
 *   const result = await chatService.send({ ... })
 */
// DUP-07: ChatMessageContent is the canonical definition in src/types/index.ts.
// It has extra renderer-only fields (imagePreviewUrl, imageFileName) compared to the
// main-process version in electron/ipc/chat.ts, but the IPC layer ignores unknown fields,
// so using the richer type here is safe.
import type { ChatImageEditResult, ChatMessageContent, ChatResult, ChatStreamEvent } from '../types'
import { createClientId } from '../utils/id'

// Re-export for any consumers that import ChatMessageContent from chatService
export type { ChatMessageContent }

/**
 * IPC-format ChatMessage — contains only fields transmitted over the IPC boundary.
 * Intentionally does NOT include UI-only fields (id, timestamp, isLoading, error)
 * that exist in the full ChatMessage type in src/types/index.ts.
 * These are two different concepts: the store type vs the API transport type.
 */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: ChatMessageContent[]
}

interface ChatParams {
  provider: string
  model: string
  messages: ChatMessage[]
  systemPrompt?: string
  /** Bypass the 3k char limit — used for Deep Research synthesis with long context */
  bypassLengthCheck?: boolean
  /** Optional larger output budget for long-form synthesis calls */
  maxOutputTokens?: number | 'model-max'
  /**
   * When true, the IPC handler asks the provider to apply the
   * "REASONING DISCIPLINE" directive (restate assumptions, show step-by-step
   * math, self-check the answer against every stated constraint). Used for
   * finance/tax/quantitative questions where silent miscalculation is the
   * dominant failure mode of base-tier chat models.
   */
  carefulReasoning?: boolean
}


interface ChatImageEditParams {
  provider: string
  model: string
  prompt: string
  imageBase64: string
  imageMimeType: string
}

interface ChatStreamCallbacks {
  onStart?: () => void
  onToken?: (token: string) => void
  /**
   * `meta.usedModel` is set when the provider answered with a different model
   * than the one requested (silent fallback), so the UI can disclose it.
   */
  onEnd?: (reply: string, meta?: { usedModel?: string }) => void
  onError?: (error: string, errorCode?: string) => void
  /**
   * AbortSignal for user-initiated cancellation. When the signal aborts mid
   * stream, chatService forwards a cancel IPC to the main process so the
   * provider request is closed and no further tokens are streamed.
   */
  signal?: AbortSignal
  /**
   * Optional buffer interval in ms. When set (e.g. 60), `onToken` is invoked
   * with batched tokens at most once per `bufferIntervalMs` instead of for
   * every individual provider token. The renderer therefore commits ~16
   * store updates per second instead of ~50–100, eliminating most of the
   * re-render cost during long replies.
   *
   * Defaults to 0 (no buffering) for backward compatibility — Smart Thinking
   * and Deep Research callers that build their own UI on top of `onToken`
   * keep their existing behaviour. ChatPage / Quick Chat opt in to 60 ms.
   */
  bufferIntervalMs?: number
}


function createChatStreamRequestId() {
  return createClientId('chat-stream')
}

/**
 * Sentinel error codes recognised across the chat pipeline. Renderers can use
 * these to suppress visible error UI on user-initiated cancellation.
 */
export const CHAT_STREAM_CANCELLED_ERROR_CODE = 'CANCELLED'

/**
 * Renderer-side fallback message used when the user aborts an in-flight
 * `sendAbortable` call before the IPC layer has finalised. Mirrors the
 * sentinel string the main process emits so localisers can map both paths
 * to the same translation.
 */
const CHAT_STREAM_CANCELLED_MESSAGE = 'Stream cancelled'


/** Cancel an in-flight chat stream by `requestId`. Safe to call multiple times. */
export function cancelChatStream(requestId: string): void {
  try {
    window.api.chatStreamCancel?.({ requestId })
  } catch {
    /* ignore — backend will GC orphaned streams when finished */
  }
}

export const chatService = {
  /** Send a conversational message — supports text + image content, multi-turn. */
  send: (params: ChatParams): Promise<ChatResult> =>
    window.api.chat(params),

  /**
   * Abortable variant of `send`. Uses the streaming IPC under the hood (which
   * already supports cancellation via `chatStreamCancel`) and returns the full
   * concatenated reply once the stream ends — i.e. the caller gets the same
   * "send" semantics but can cancel mid-flight.
   *
   * Used by Deep Research so that clicking Stop kills the in-flight provider
   * call within ~milliseconds instead of waiting for the current step's HTTP
   * response to land. We don't care about per-token streaming here, just the
   * abort pathway, so token callbacks are intentionally not exposed.
   *
   * Falls back gracefully to `window.api.chat` when the streaming IPC is
   * missing (older Electron preload bundle) — in that case cancellation is
   * best-effort: the renderer-side signal handler still rejects immediately,
   * but the background HTTP call cannot be aborted.
   */
  sendAbortable: async (
    params: ChatParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<ChatResult> => {
    const { signal } = options
    if (!signal) return window.api.chat(params)
    if (signal.aborted) {
      return { success: false, error: CHAT_STREAM_CANCELLED_MESSAGE, errorCode: CHAT_STREAM_CANCELLED_ERROR_CODE }
    }
    if (
      typeof window.api.chatStream !== 'function' ||
      typeof window.api.onChatStreamEvent !== 'function'
    ) {
      // Older preload — no streaming IPC. The signal still rejects from the
      // renderer's perspective so the UI doesn't deadlock, but the background
      // HTTP request will continue until natural completion.
      return Promise.race([
        window.api.chat(params),
        new Promise<ChatResult>((resolve) => {
          signal.addEventListener('abort', () => {
            resolve({
              success: false,
              error: CHAT_STREAM_CANCELLED_MESSAGE,
              errorCode: CHAT_STREAM_CANCELLED_ERROR_CODE,
            })
          }, { once: true })
        }),
      ])
    }
    // Streaming IPC available — let the existing stream() pipeline handle the
    // cancel-IPC plumbing. We pass through the signal but ignore tokens.
    return chatService.stream(params, { signal })
  },


  /**
   * Edit an attached image and return the generated image result.
   *
   * The English `error` string is a defensive fallback — it is normally not
   * surfaced to the user because the renderer maps `errorCode === 'PRELOAD_OUTDATED'`
   * to `t.chat_error_image_edit_reload_required` via `localizeChatError`.
   * It is only shown if a future caller bypasses that mapper.
   */
  editImage: (params: ChatImageEditParams): Promise<ChatImageEditResult> =>
    window.api.editChatImage?.(params) ?? Promise.resolve({
      success: false,
      error: 'Image editing bridge is unavailable. Restart Viezan and try again.',
      errorCode: 'PRELOAD_OUTDATED',
    }),

  generateImage: (params: { provider: string; model: string; prompt: string }): Promise<ChatImageEditResult> =>
    window.api.generateChatImage?.(params) ?? Promise.resolve({
      success: false,
      error: 'Image generation bridge is unavailable. Restart Viezan and try again.',
      errorCode: 'PRELOAD_OUTDATED',
    }),

  /** Stream a conversational message and receive provider tokens as they arrive. */
  stream: async (params: ChatParams, callbacks: ChatStreamCallbacks = {}): Promise<ChatResult> => {
    if (
      typeof window.api.chatStream !== 'function' ||
      typeof window.api.onChatStreamEvent !== 'function'
    ) {
      return window.api.chat(params)
    }

    // ── Token buffering ─────────────────────────────────────────────────────
    // When `bufferIntervalMs` is set, we accumulate tokens in `pendingBuffer`
    // and flush them as a single concatenated token at most once per interval.
    // This caps store-update frequency to ~16 Hz (60 ms) for typical use,
    // skipping ~70% of re-renders during long streamed responses.
    const bufferMs = callbacks.bufferIntervalMs ?? 0
    let pendingBuffer = ''
    let flushTimer: ReturnType<typeof setTimeout> | null = null

    const flushNow = () => {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      if (pendingBuffer && callbacks.onToken) {
        const out = pendingBuffer
        pendingBuffer = ''
        callbacks.onToken(out)
      }
    }

    const scheduleFlush = () => {
      if (flushTimer) return
      flushTimer = setTimeout(() => {
        flushTimer = null
        flushNow()
      }, bufferMs)
    }

    const requestId = createChatStreamRequestId()
    const cleanup = window.api.onChatStreamEvent(requestId, (event: ChatStreamEvent) => {
      if (event.type === 'start') callbacks.onStart?.()
      if (event.type === 'token' && event.token) {
        if (bufferMs > 0 && callbacks.onToken) {
          pendingBuffer += event.token
          scheduleFlush()
        } else {
          callbacks.onToken?.(event.token)
        }
      }
      if (event.type === 'end' && event.reply !== undefined) {
        // Drain the buffer before announcing the end so the renderer doesn't
        // see a stale partial reply.
        flushNow()
        callbacks.onEnd?.(event.reply, event.usedModel ? { usedModel: event.usedModel } : undefined)
      }
      if (event.type === 'error' && event.error) {
        flushNow()
        callbacks.onError?.(event.error, event.errorCode)
      }
    })

    // When the caller aborts mid stream, fire-and-forget the cancel IPC so the
    // backend AbortController halts the underlying provider request.
    const onAbort = () => cancelChatStream(requestId)
    if (callbacks.signal) {
      if (callbacks.signal.aborted) {
        cancelChatStream(requestId)
      } else {
        callbacks.signal.addEventListener('abort', onAbort, { once: true })
      }
    }

    try {
      return await window.api.chatStream({ ...params, requestId })
    } finally {
      // Ensure we never leak a pending flush timer or unflushed tokens.
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      callbacks.signal?.removeEventListener('abort', onAbort)
      cleanup()
    }
  },
}


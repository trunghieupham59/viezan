/**
 * Shared types & helpers for the chat provider layer.
 *
 * These primitives are consumed by every provider implementation
 * (Gemini / Claude / OpenAI / Local) and by the chat IPC handler.
 *
 * Kept intentionally small: only cross-provider concepts live here;
 * provider-specific SDK wiring belongs in the per-provider modules.
 */

import type { ChatMessage } from '../chatValidation'

// ── Streaming primitives ─────────────────────────────────────────────────────

/** Callback invoked once per provider-emitted token during streaming. */
export type ChatStreamTokenHandler = (token: string) => void

/**
 * Sentinel error message used by provider stream functions to signal that the
 * user (renderer) explicitly aborted the stream. The IPC stream handler
 * recognises this string and emits a typed `CANCELLED` error code so the
 * renderer can suppress it from showing as a real error.
 */
export const CHAT_STREAM_CANCELLED_MESSAGE = 'chat-stream-cancelled'

/**
 * Sentinel family used across IPC modules (`chat-stream-cancelled`,
 * `translate-cancelled`, `image-translate-cancelled`, ...). Matched exactly so
 * arbitrary provider error text that merely mentions "cancelled" is not treated
 * as a user cancellation.
 */
const CANCEL_SENTINEL_PATTERN = /^[a-z]+(?:-[a-z]+)*-cancelled$/

/** Exact message the Anthropic/OpenAI SDKs use for `APIUserAbortError`. */
const SDK_USER_ABORT_MESSAGE = 'Request was aborted.'

/**
 * Detect whether an error represents a user-initiated abort. Only structured
 * signals are trusted:
 *   - the controller's `signal.aborted` (when a signal is supplied)
 *   - the exact cancel sentinel messages (CHAT_STREAM_CANCELLED_MESSAGE & co.)
 *   - `error.name === 'AbortError'` (fetch/DOMException) or the SDKs'
 *     `APIUserAbortError` (matched by constructor name or its exact message
 *     `Request was aborted.`, since `name` stays `Error`)
 *   - Node's `ABORT_ERR` code
 *
 * Free-text matches ("aborted", "cancelled") and `ECONNRESET` are deliberately
 * NOT treated as cancellation: they are real network/provider failures.
 */
export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  if (!error || typeof error !== 'object') return false
  const anyError = error as { name?: unknown; code?: unknown; message?: unknown }
  if (anyError.name === 'AbortError' || anyError.name === 'APIUserAbortError') return true
  // The SDKs keep `name === 'Error'` on APIUserAbortError, so the class name
  // (and its fixed message) is the reliable structured signal.
  if (error.constructor?.name === 'APIUserAbortError') return true
  if (anyError.code === 'ABORT_ERR') return true
  const message = typeof anyError.message === 'string' ? anyError.message : ''
  return (
    message === CHAT_STREAM_CANCELLED_MESSAGE ||
    message === SDK_USER_ABORT_MESSAGE ||
    CANCEL_SENTINEL_PATTERN.test(message)
  )
}

// ── Provider function signatures ─────────────────────────────────────────────

/**
 * Per-request behaviour flags that providers must respect when present.
 * Kept as a single options bag so adding a new behaviour (e.g. `webSearch`,
 * `reasoningEffort`) does not break every provider's signature.
 */
export interface ChatProviderOptions {
  /**
   * When true, the system prompt is augmented with the
   * "REASONING DISCIPLINE" directive (see `chatPrompts.ts`). Providers
   * forward this into `buildEnforcedSystemPrompt(systemPrompt, { carefulReasoning })`.
   */
  carefulReasoning?: boolean
  /**
   * Invoked when a provider silently switched to a different model than the one
   * requested (e.g. OpenAI chat-endpoint fallback), so the IPC layer can tell
   * the renderer which model actually answered.
   */
  onModelFallback?: (usedModel: string) => void
}

/** Non-streaming chat function — every provider implements this shape. */
export type ChatFn = (
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  systemPrompt?: string,
  maxOutputTokens?: number,
  options?: ChatProviderOptions,
) => Promise<string>

/** Streaming chat function — every provider implements this shape. */
export type ChatStreamFn = (
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  systemPrompt: string | undefined,
  maxOutputTokens: number,
  onToken: ChatStreamTokenHandler,
  signal?: AbortSignal,
  options?: ChatProviderOptions,
) => Promise<string>


// ── Image edit primitives ────────────────────────────────────────────────────

/** Outcome of an image-edit call, normalised across providers. */
export interface ChatImageEditResultPayload {
  imageBase64: string
  imageMimeType: string
  usedModel: string
}

/** Image-edit function — only providers that support it implement this. */
export type ChatImageEditFn = (
  apiKey: string,
  model: string,
  prompt: string,
  imageBase64: string,
  imageMimeType: string,
) => Promise<ChatImageEditResultPayload>

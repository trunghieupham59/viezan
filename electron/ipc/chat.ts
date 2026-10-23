/**
 * Chat IPC entry point.
 *
 * Hosts the four IPC channels the renderer talks to, but delegates all
 * provider-specific work to focused sibling modules:
 *
 *   - providers/chatProvider{Gemini,Claude,OpenAI,Local}.ts — per-provider
 *     non-streaming + streaming implementations.
 *   - providers/chatProviderRegistry.ts — provider lookup tables.
 *   - chatTokenResolver.ts — max-output-token resolution (incl. Gemini meta).
 *   - chatImageEdit.ts — image edit validation + provider implementations.
 *   - chatValidation.ts — Zod-style payload parsing for `chat:send` /
 *     `chat:stream`.
 *
 * Channels registered:
 *   - `chat:send`         → non-streaming chat
 *   - `chat:stream`       → streaming chat (token events on `chat:stream:event`)
 *   - `chat:stream:cancel`→ abort an in-flight stream
 *   - `chat:image-edit`   → edit an attached image
 *
 * Cross-cutting concerns:
 *   - API keys are read from the OS Keychain via `getStoredApiKey` — never
 *     forwarded from the renderer.
 *   - Errors are categorised by `classifyProviderError` into typed
 *     `errorCode` values (`NO_API_KEY`, `INVALID_KEY`, `RATE_LIMIT`, `NETWORK`,
 *     `TIMEOUT`, …) so the renderer can present localised messages.
 *   - Transient network errors are retried via `withRetry` (exponential
 *     backoff). User cancellation is never retried.
 */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { CHAT_CHANNELS } from './channels'
import {
  CHAT_IMAGE_EDIT_PROVIDERS,
  CHAT_IMAGE_GENERATE_PROVIDERS,
  parseChatImageEditParams,
  parseChatImageGenerateParams,
} from './chatImageEdit'
import { CHAT_LOG_MESSAGES, CHAT_RUNTIME_MESSAGES } from './chatMessages'
import { resolveChatOutputTokens } from './chatTokenResolver'
import { MAX_CHAT_REQUEST_ID_CHARS, parseChatParams } from './chatValidation'
import { classifyProviderError, noApiKeyResponse } from './errorUtils'
import { isNonEmptyString, isRecord } from './ipcValidation'
import { isLocalProvider, LOCAL_AI_PLACEHOLDER_KEY } from './localAi'
import {
  CHAT_PROVIDERS,
  CHAT_STREAM_PROVIDERS,
} from './providers/chatProviderRegistry'
import {
  CHAT_STREAM_CANCELLED_MESSAGE,
  isAbortError,
} from './providers/chatProviderTypes'
import { unknownProviderError } from './providers/types'
import { withRetry } from './retry'
import { getStoredApiKey } from './storage'

// ── Re-exports for tests & legacy import sites ───────────────────────────────
//
// These re-exports keep `import { … } from './chat'` working for unit tests
// and any other consumers that historically reached into chat.ts directly.
// Production code should import from the dedicated modules.

export { buildEnforcedSystemPrompt } from './chatPrompts'
export {
  getCurrentFamilyModelMaxOutputTokens,
  resolveModelMaxOutputTokens,
} from './chatTokenResolver'
export {
  isLikelyChatModel,
  scoreOpenAIChatModel,
} from './providers/chatProviderOpenAI'

// ── Stream cancellation registry ─────────────────────────────────────────────
//
// Module-scoped map of in-flight stream `requestId` → AbortController (plus the
// owning webContents id, so only the window that started a stream can cancel
// it). The renderer cancels via `chat:stream:cancel` (which calls
// `controller.abort()`), and the stream handler converts the resulting
// rejection into a typed `CANCELLED` event the renderer can suppress.
interface ActiveChatStream {
  controller: AbortController
  ownerId: number | undefined
}

const activeStreams = new Map<string, ActiveChatStream>()

/** Image requests share the owner-scoped cancellation channel used by chat streams. */
async function runImageRequest(
  event: IpcMainInvokeEvent,
  rawParams: unknown,
  operation: (signal: AbortSignal) => Promise<Record<string, unknown>>,
) {
  const rawId = isRecord(rawParams) ? rawParams.requestId : undefined
  if (rawId !== undefined && (!isNonEmptyString(rawId) || rawId.length > MAX_CHAT_REQUEST_ID_CHARS)) {
    return { success: false, error: 'Invalid requestId', errorCode: 'INVALID_INPUT' }
  }
  const requestId = typeof rawId === 'string' ? rawId.trim() : undefined
  if (requestId && activeStreams.has(requestId)) {
    return { success: false, error: CHAT_RUNTIME_MESSAGES.streamRequestIdInUse, errorCode: 'INVALID_INPUT' }
  }
  const controller = new AbortController()
  const ownerId = event.sender?.id
  const entry = { controller, ownerId }
  if (requestId) {
    activeStreams.set(requestId, entry)
    const earlyCancel = pendingCancels.get(requestId)
    if (earlyCancel) {
      pendingCancels.delete(requestId)
      if (earlyCancel.expiresAt > Date.now() && earlyCancel.ownerId === ownerId) controller.abort()
    }
  }
  const onDestroyed = () => controller.abort()
  event.sender?.once?.('destroyed', onDestroyed)
  const cancelled = () => ({ success: false, error: CHAT_STREAM_CANCELLED_MESSAGE, errorCode: 'CANCELLED' })
  try {
    if (controller.signal.aborted) return cancelled()
    const result = await operation(controller.signal)
    return controller.signal.aborted ? cancelled() : result
  } catch (error) {
    return controller.signal.aborted ? cancelled() : toChatFailure(error)
  } finally {
    event.sender?.removeListener?.('destroyed', onDestroyed)
    if (requestId && activeStreams.get(requestId) === entry) activeStreams.delete(requestId)
  }
}

// A cancel can arrive before the stream handler has registered its controller
// (IPC ordering is not guaranteed across channels). Remember such cancels for a
// short time so cancel-before-start still takes effect.
const CANCEL_BEFORE_START_TTL_MS = 30_000
const MAX_PENDING_CANCELS = 200
const pendingCancels = new Map<string, { ownerId: number | undefined; expiresAt: number }>()

function prunePendingCancels(now: number) {
  for (const [id, entry] of pendingCancels) {
    if (entry.expiresAt <= now) pendingCancels.delete(id)
  }
  while (pendingCancels.size >= MAX_PENDING_CANCELS) {
    const oldest = pendingCancels.keys().next().value
    if (oldest === undefined) break
    pendingCancels.delete(oldest)
  }
}

// ── Stream event typing ──────────────────────────────────────────────────────

type ChatStreamEventPayload =
  | { type: 'start' }
  | { type: 'token'; token: string }
  | { type: 'end'; reply: string; usedModel?: string }
  | { type: 'error'; error: string; errorCode?: string }

type ChatStreamEvent = { requestId: string } & ChatStreamEventPayload

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Local providers do not require a key, so we substitute a placeholder string
 * to satisfy SDK constructors. For cloud providers we fetch from Keychain.
 */
function getProviderCredential(provider: string): string | null {
  return isLocalProvider(provider) ? LOCAL_AI_PLACEHOLDER_KEY : getStoredApiKey(provider)
}

/**
 * Convert any provider error into the IPC error response shape, attaching a
 * typed `errorCode` when one can be inferred from the message (auth, rate
 * limit, network, timeout, …).
 */
function toChatFailure(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error)
  // Pass the error object (not just its message) so structured `status` /
  // `errorCode` fields on SDK errors drive classification.
  const classified = classifyProviderError(error)
  return { ...classified, error: classified.errorCode ? classified.error : CHAT_RUNTIME_MESSAGES.chatFailed(msg) }
}

function isSenderDestroyed(event: IpcMainInvokeEvent): boolean {
  const sender = event.sender as { isDestroyed?: () => boolean }
  return typeof sender.isDestroyed === 'function' && sender.isDestroyed()
}

/**
 * Deliver a stream event to the owning renderer. Returns false (and never
 * throws) when the sender is gone, so a closed window cannot crash the handler
 * or its error path.
 */
function sendChatStreamEvent(event: IpcMainInvokeEvent, payload: ChatStreamEvent): boolean {
  if (isSenderDestroyed(event)) return false
  try {
    event.sender.send(CHAT_CHANNELS.event.streamEvent, payload)
    return true
  } catch {
    return false
  }
}

// ── IPC registration ─────────────────────────────────────────────────────────

/**
 * Register every chat-related IPC handler with Electron's main process.
 *
 * The function is idempotent for a given `ipcMain` instance — main.ts calls it
 * exactly once at startup.
 */
export function registerChatHandlers(ipcMain: IpcMain) {
  registerChatSendHandler(ipcMain)
  registerChatImageEditHandler(ipcMain)
  registerChatImageGenerateHandler(ipcMain)
  registerChatStreamHandler(ipcMain)
  registerChatStreamCancelHandler(ipcMain)
}

// ── chat:send ────────────────────────────────────────────────────────────────

function registerChatSendHandler(ipcMain: IpcMain) {
  ipcMain.handle(CHAT_CHANNELS.invoke.send, async (_event, rawParams: unknown) => {
    const parsed = parseChatParams(rawParams)
    if (!parsed.ok) return parsed.response
    const {
      provider, model, messages, systemPrompt, maxOutputTokens: requested, carefulReasoning,
    } = parsed.value

    const apiKey = getProviderCredential(provider)
    if (!apiKey) return noApiKeyResponse(provider)
    const maxOutputTokens = await resolveChatOutputTokens(provider, model, apiKey, requested)

    let usedModel: string | undefined
    try {
      // Registry lookup — `unknownProviderError` returns a typed response with
      // a hint listing supported providers.
      const chatFn = CHAT_PROVIDERS[provider]
      if (!chatFn) return unknownProviderError(provider)

      // withRetry adds exponential backoff for transient network errors.
      // Hard failures (auth, rate limit) are surfaced immediately.
      const reply = await withRetry(() => chatFn(
        apiKey, model, messages, systemPrompt, maxOutputTokens, {
          carefulReasoning,
          onModelFallback: (fallbackModel) => { usedModel = fallbackModel },
        },
      ))
      return usedModel ? { success: true, reply, usedModel } : { success: true, reply }
    } catch (error: unknown) {
      console.error(CHAT_LOG_MESSAGES.providerError(provider), error)
      return toChatFailure(error)
    }
  })
}


// ── chat:image-edit ──────────────────────────────────────────────────────────

function registerChatImageEditHandler(ipcMain: IpcMain) {
  ipcMain.handle(CHAT_CHANNELS.invoke.imageEdit, async (event, rawParams: unknown) => {
    const parsed = parseChatImageEditParams(rawParams)
    if (!parsed.ok) return parsed.response
    const { provider, model, prompt, imageBase64, imageMimeType } = parsed.value

    const editFn = CHAT_IMAGE_EDIT_PROVIDERS[provider]
    if (!editFn) {
      return {
        success: false,
        error: CHAT_RUNTIME_MESSAGES.imageEditUnsupportedProvider,
        errorCode: 'NO_IMAGE_EDIT',
      }
    }

    const apiKey = getProviderCredential(provider)
    if (!apiKey) return noApiKeyResponse(provider)

    return runImageRequest(event, rawParams, async (signal) => {
      const result = await withRetry(() => editFn(apiKey, model, prompt, imageBase64, imageMimeType, signal), { signal })
      return {
        success: true,
        imageBase64: result.imageBase64,
        imageMimeType: result.imageMimeType,
        usedProvider: provider,
        usedModel: result.usedModel,
      }
    })
  })
}

// ── chat:image-generate ───────────────────────────────────────────────────────

function registerChatImageGenerateHandler(ipcMain: IpcMain) {
  ipcMain.handle(CHAT_CHANNELS.invoke.imageGenerate, async (event, rawParams: unknown) => {
    const parsed = parseChatImageGenerateParams(rawParams)
    if (!parsed.ok) return parsed.response
    const { provider, model, prompt } = parsed.value

    const generateFn = CHAT_IMAGE_GENERATE_PROVIDERS[provider]
    if (!generateFn) {
      return {
        success: false,
        error: CHAT_RUNTIME_MESSAGES.imageEditUnsupportedProvider,
        errorCode: 'NO_IMAGE_EDIT',
      }
    }

    const apiKey = getProviderCredential(provider)
    if (!apiKey) return noApiKeyResponse(provider)

    return runImageRequest(event, rawParams, async (signal) => {
      const result = await withRetry(() => generateFn(apiKey, model, prompt, signal), { signal })
      return {
        success: true,
        imageBase64: result.imageBase64,
        imageMimeType: result.imageMimeType,
        usedProvider: provider,
        usedModel: result.usedModel,
      }
    })
  })
}

// ── chat:stream ──────────────────────────────────────────────────────────────

function registerChatStreamHandler(ipcMain: IpcMain) {
  ipcMain.handle(CHAT_CHANNELS.invoke.stream, async (event, rawParams: unknown) => {
    const parsed = parseChatParams(rawParams)
    if (!parsed.ok) return parsed.response
    const {
      provider, model, messages, systemPrompt, requestId,
      maxOutputTokens: requested, carefulReasoning,
    } = parsed.value

    if (!requestId) {
      return {
        success: false,
        error: CHAT_RUNTIME_MESSAGES.streamRequestIdRequired,
        errorCode: 'INVALID_INPUT',
      }
    }

    // A second stream with the same id would clobber the first one's controller
    // (making it uncancellable) and interleave events on the same requestId.
    // Reject it without touching the existing stream or emitting events.
    if (activeStreams.has(requestId)) {
      return {
        success: false,
        error: CHAT_RUNTIME_MESSAGES.streamRequestIdInUse,
        errorCode: 'INVALID_INPUT',
      }
    }

    // Register the AbortController BEFORE any await so a cancel that arrives
    // while we resolve the token budget (or the key) finds it. The signal is
    // passed into every async step and into the provider; the entry is removed
    // in `finally`.
    const controller = new AbortController()
    const ownerId = event.sender?.id
    const entry: ActiveChatStream = { controller, ownerId }
    activeStreams.set(requestId, entry)

    // Honour a cancel that raced ahead of this handler.
    const earlyCancel = pendingCancels.get(requestId)
    if (earlyCancel) {
      pendingCancels.delete(requestId)
      if (earlyCancel.expiresAt > Date.now() && earlyCancel.ownerId === ownerId) controller.abort()
    }

    // A destroyed window can no longer receive tokens - stop the provider call.
    const sender = event.sender as {
      once?: (name: string, listener: () => void) => void
      removeListener?: (name: string, listener: () => void) => void
    }
    const onSenderDestroyed = () => controller.abort()
    sender.once?.('destroyed', onSenderDestroyed)

    const emit = (payload: ChatStreamEventPayload) => {
      if (!sendChatStreamEvent(event, { requestId, ...payload }) && isSenderDestroyed(event)) {
        controller.abort()
      }
    }

    const cancelled = () => {
      emit({ type: 'error', error: CHAT_STREAM_CANCELLED_MESSAGE, errorCode: 'CANCELLED' })
      return { success: false, error: CHAT_STREAM_CANCELLED_MESSAGE, errorCode: 'CANCELLED' }
    }

    try {
      emit({ type: 'start' })

      const apiKey = getProviderCredential(provider)
      if (!apiKey) {
        const response = noApiKeyResponse(provider)
        emit({ type: 'error', error: response.error, errorCode: response.errorCode })
        return response
      }

      if (controller.signal.aborted) return cancelled()
      const maxOutputTokens = await resolveChatOutputTokens(provider, model, apiKey, requested, controller.signal)
      if (controller.signal.aborted) return cancelled()

      const chatFn = CHAT_STREAM_PROVIDERS[provider]
      if (!chatFn) {
        const response = unknownProviderError(provider)
        emit({ type: 'error', error: response.error })
        return response
      }

      let usedModel: string | undefined
      const reply = await chatFn(
        apiKey, model, messages, systemPrompt, maxOutputTokens,
        (token) => { emit({ type: 'token', token }) },
        controller.signal,
        {
          carefulReasoning,
          onModelFallback: (fallbackModel) => { usedModel = fallbackModel },
        },
      )

      // Nobody is listening any more: report cancellation instead of a reply
      // that can never be delivered (providers may swallow the abort).
      if (isSenderDestroyed(event)) return cancelled()

      if (usedModel) {
        emit({ type: 'end', reply, usedModel })
        return { success: true, reply, usedModel }
      }
      emit({ type: 'end', reply })
      return { success: true, reply }
    } catch (error: unknown) {
      // User-initiated cancellation: emit a typed `CANCELLED` error code so
      // the renderer can suppress the visible error bubble; partial tokens
      // already streamed remain visible.
      if (isAbortError(error, controller.signal)) return cancelled()
      console.error(CHAT_LOG_MESSAGES.streamProviderError(provider), error)
      const response = toChatFailure(error)
      emit({ type: 'error', error: response.error, errorCode: response.errorCode })
      return response
    } finally {
      sender.removeListener?.('destroyed', onSenderDestroyed)
      // Idempotent: a late cancel may have already removed the entry.
      if (activeStreams.get(requestId) === entry) {
        activeStreams.delete(requestId)
      }
    }
  })
}

// ── chat:stream:cancel ───────────────────────────────────────────────────────

function registerChatStreamCancelHandler(ipcMain: IpcMain) {
  ipcMain.handle(CHAT_CHANNELS.invoke.streamCancel, async (event, rawParams: unknown) => {
    if (!isRecord(rawParams) || !isNonEmptyString(rawParams.requestId)) {
      return { success: false, error: 'INVALID_INPUT' }
    }
    // Same normalisation as parseChatParams (trimmed id) so cancel matches the
    // key the stream registered under and the pending-cancel set.
    const requestId = rawParams.requestId.trim()
    if (!requestId) return { success: false, error: 'INVALID_INPUT' }
    const ownerId = event.sender?.id
    const active = activeStreams.get(requestId)

    if (!active) {
      // The stream may not have registered yet - remember the cancel briefly.
      const now = Date.now()
      prunePendingCancels(now)
      pendingCancels.set(requestId, { ownerId, expiresAt: now + CANCEL_BEFORE_START_TTL_MS })
      return { success: false, error: 'NOT_FOUND' }
    }

    // Only the window that owns the stream may cancel it.
    if (active.ownerId !== ownerId) return { success: false, error: 'NOT_FOUND' }

    try {
      active.controller.abort()
    } catch {
      /* abort cannot throw in normal cases - swallow defensively */
    }
    activeStreams.delete(requestId)
    return { success: true }
  })
}

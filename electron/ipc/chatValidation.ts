import { MAX_CHAT_PAYLOAD_BYTES, MAX_CHAT_REQUEST_CHARS } from './ipcConstants'
import { invalidIpcInput, isNonEmptyString, isRecord, parseProviderModel } from './ipcValidation'


export type MaxOutputTokensRequest = number | 'model-max'

export interface ChatMessageContent {
  type: 'text' | 'image'
  text?: string
  imageBase64?: string
  imageMimeType?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: ChatMessageContent[]
}

export interface ChatParams {
  provider: string
  model: string
  messages: ChatMessage[]
  systemPrompt?: string
  bypassLengthCheck?: boolean
  maxOutputTokens?: MaxOutputTokensRequest
  requestId?: string
  /**
   * When true, the system prompt is augmented with the "REASONING DISCIPLINE"
   * directive (see `chatPrompts.ts`) so the model restates assumptions and
   * walks through math step-by-step before answering. Used for finance/tax/
   * quantitative questions where silent miscalculation is the failure mode.
   */
  carefulReasoning?: boolean
}


export type ParsedChatParams =
  | { ok: true; value: ChatParams }
  | { ok: false; response: { success: false; error: string; errorCode?: string } }

const CHAT_CONTENT_TYPES = new Set(['text', 'image'])
const CHAT_ROLES = new Set(['user', 'assistant'])
const CHAT_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_CHAT_MODEL_ID_CHARS = 200
const MAX_SYSTEM_PROMPT_CHARS = 20_000
export const MAX_CHAT_REQUEST_ID_CHARS = 100
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/

/**
 * Strict-enough base64 check for image payloads: standard alphabet, optional
 * trailing padding, no data-URI prefix, no whitespace. Exported so
 * `chat:image-edit` shares the exact same rule as `chat:send`.
 */
export function isValidBase64Payload(value: unknown): value is string {
  return typeof value === 'string' && value.length % 4 !== 1 && BASE64_PATTERN.test(value)
}

export const CHAT_IMAGE_MIME_TYPE_ALLOWLIST: ReadonlySet<string> = CHAT_IMAGE_MIME_TYPES

/** Standard `PAYLOAD_TOO_LARGE` rejection shared by chat and image-edit payloads. */
export function payloadTooLargeResponse(payloadBytes: number) {
  const mb = (payloadBytes / (1024 * 1024)).toFixed(1)
  const limitMb = (MAX_CHAT_PAYLOAD_BYTES / (1024 * 1024)).toFixed(0)
  return {
    success: false as const,
    error: `Chat payload too large (${mb} MB). Maximum is ${limitMb} MB. Try removing an image attachment.`,
    errorCode: 'PAYLOAD_TOO_LARGE',
  }
}

function hasUsableContent(content: ChatMessageContent): boolean {
  return content.type === 'image' || (typeof content.text === 'string' && content.text.trim().length > 0)
}

/**
 * Drop messages with no usable content (e.g. the empty assistant bubble left by
 * a cancelled/failed stream), strip leading/trailing assistant turns so the
 * conversation starts and ends with a user turn, and merge adjacent same-role
 * turns. Real content is never reordered.
 */
function normalizeChatMessages(messages: ChatMessage[]): ChatMessage[] {
  const usable = messages
    .map((message) => ({ ...message, content: message.content.filter(hasUsableContent) }))
    .filter((message) => message.content.length > 0)

  while (usable.length > 0 && usable[0].role !== 'user') usable.shift()
  while (usable.length > 0 && usable[usable.length - 1].role !== 'user') usable.pop()

  return usable
}

function mergeAdjacentSameRole(messages: ChatMessage[]): ChatMessage[] {
  const merged: ChatMessage[] = []
  for (const message of messages) {
    const previous = merged[merged.length - 1]
    if (previous && previous.role === message.role) {
      previous.content = [...previous.content, ...message.content]
    } else {
      merged.push({ role: message.role, content: [...message.content] })
    }
  }
  return merged
}

/**
 * Cheaply estimate the IPC payload size by counting the base64 and text
 * lengths inside `messages`. We deliberately avoid `JSON.stringify` on the
 * raw payload because for very large requests (50+ MB) the stringify itself
 * costs hundreds of milliseconds; the per-field length sum is within ~5%
 * of the JSON byte count and is sufficient for cap enforcement.
 */
function estimateChatPayloadBytes(rawParams: Record<string, unknown>): number {
  let bytes = 0
  if (typeof rawParams.systemPrompt === 'string') bytes += rawParams.systemPrompt.length
  const messages = rawParams.messages
  if (Array.isArray(messages)) {
    for (const m of messages) {
      if (!isRecord(m) || !Array.isArray(m.content)) continue
      for (const c of m.content) {
        if (!isRecord(c)) continue
        if (typeof c.text === 'string') bytes += c.text.length
        if (typeof c.imageBase64 === 'string') bytes += c.imageBase64.length
      }
    }
  }
  return bytes
}

export function parseChatParams(rawParams: unknown): ParsedChatParams {
  const providerModel = parseProviderModel(rawParams, {
    payloadName: 'Chat',
    maxModelChars: MAX_CHAT_MODEL_ID_CHARS,
  })
  if (!providerModel.ok) return providerModel
  const { provider, model } = providerModel.value
  const params = providerModel.params

  // Cap total payload size — protects RAM from runaway image+history payloads.
  // The renderer should never reach this in normal use (image resize caps at
  // ~1.5 MB), so a violation indicates either a bug or a hostile caller.
  const payloadBytes = estimateChatPayloadBytes(params)
  if (payloadBytes > MAX_CHAT_PAYLOAD_BYTES) {
    return { ok: false, response: payloadTooLargeResponse(payloadBytes) }
  }


  if (!Array.isArray(params.messages)) {
    return { ok: false, response: invalidIpcInput('Messages are required') }
  }
  if (params.messages.length === 0) {
    return { ok: false, response: invalidIpcInput('No messages provided') }
  }

  const messages: ChatMessage[] = []
  for (const message of params.messages) {
    if (!isRecord(message) || typeof message.role !== 'string' || !CHAT_ROLES.has(message.role) || !Array.isArray(message.content)) {
      return { ok: false, response: invalidIpcInput('Invalid chat message') }
    }

    const content: ChatMessageContent[] = []
    for (const item of message.content) {
      if (!isRecord(item) || typeof item.type !== 'string' || !CHAT_CONTENT_TYPES.has(item.type)) {
        return { ok: false, response: invalidIpcInput('Invalid chat message content') }
      }

      if (item.type === 'text') {
        if (item.text !== undefined && typeof item.text !== 'string') {
          return { ok: false, response: invalidIpcInput('Invalid chat text content') }
        }
        content.push({ type: 'text', text: item.text })
      } else {
        if (
          !isNonEmptyString(item.imageBase64) ||
          !isNonEmptyString(item.imageMimeType) ||
          !CHAT_IMAGE_MIME_TYPES.has(item.imageMimeType) ||
          !isValidBase64Payload(item.imageBase64)
        ) {
          return { ok: false, response: invalidIpcInput('Invalid chat image content') }
        }
        content.push({ type: 'image', imageBase64: item.imageBase64, imageMimeType: item.imageMimeType })
      }
    }

    messages.push({ role: message.role as ChatMessage['role'], content })
  }

  if (params.systemPrompt !== undefined && (typeof params.systemPrompt !== 'string' || params.systemPrompt.length > MAX_SYSTEM_PROMPT_CHARS)) {
    return { ok: false, response: invalidIpcInput('Invalid system prompt') }
  }
  if (params.bypassLengthCheck !== undefined && typeof params.bypassLengthCheck !== 'boolean') {
    return { ok: false, response: invalidIpcInput('Invalid bypass flag') }
  }
  if (params.carefulReasoning !== undefined && typeof params.carefulReasoning !== 'boolean') {
    return { ok: false, response: invalidIpcInput('Invalid careful-reasoning flag') }
  }

  if (
    params.maxOutputTokens !== undefined &&
    params.maxOutputTokens !== 'model-max' &&
    (typeof params.maxOutputTokens !== 'number' || !Number.isFinite(params.maxOutputTokens))
  ) {
    return { ok: false, response: invalidIpcInput('Invalid max output tokens') }
  }
  if (params.requestId !== undefined) {
    if (!isNonEmptyString(params.requestId) || params.requestId.length > MAX_CHAT_REQUEST_ID_CHARS) {
      return { ok: false, response: invalidIpcInput('Invalid chat stream request id') }
    }
  }

  // Merge adjacent same-role turns BEFORE any length check: the provider sees
  // the merged turn, so the cap must apply to what is actually sent.
  const normalized = mergeAdjacentSameRole(normalizeChatMessages(messages))
  if (normalized.length === 0) {
    return { ok: false, response: invalidIpcInput('No user message with content provided') }
  }

  if (!params.bypassLengthCheck) {
    const lastMsg = normalized[normalized.length - 1]
    if (lastMsg.role === 'user') {
      const lastMsgTextChars = lastMsg.content.reduce((sum, c) => sum + (c.text?.length ?? 0), 0)
      if (lastMsgTextChars > MAX_CHAT_REQUEST_CHARS) {
        return {
          ok: false,
          response: {
            success: false,
            error: `Message too long (${lastMsgTextChars} chars). Maximum is ${MAX_CHAT_REQUEST_CHARS} characters.`,
          },
        }
      }
    }
  }

  return {
    ok: true,
    value: {
      provider,
      model,
      messages: normalized,
      systemPrompt: params.systemPrompt,
      bypassLengthCheck: params.bypassLengthCheck,
      maxOutputTokens: params.maxOutputTokens as MaxOutputTokensRequest | undefined,
      requestId: typeof params.requestId === 'string' ? params.requestId.trim() : undefined,
      carefulReasoning: params.carefulReasoning as boolean | undefined,
    },
  }
}


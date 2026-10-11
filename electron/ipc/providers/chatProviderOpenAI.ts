/**
 * OpenAI chat provider — non-streaming + streaming implementations,
 * plus the model-scoring fallback used when the requested model is not a
 * chat-completion model (e.g. completions-only legacy IDs).
 *
 * Multimodal: text + base64 images mapped into OpenAI content parts using
 * `image_url` data URIs.
 *
 * Cancellation: the OpenAI SDK accepts a `signal` request-option that
 * propagates through to fetch; the streaming loop additionally polls
 * `signal.aborted` between SSE chunks. User-initiated aborts are bubbled as
 * the shared CHAT_STREAM_CANCELLED_MESSAGE sentinel — never replaced by a
 * model-fallback retry.
 */
import type {
  ChatCompletionContentPartImage,
  ChatCompletionContentPartText,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions'
import {
  OPENAI_CHAT_ENDPOINT_ERROR_MARKERS,
  OPENAI_CHAT_IMAGE_DETAIL,
  OPENAI_CHAT_MODEL_HARD_EXCLUDES,
  OPENAI_CHAT_MODEL_PREFIX,
  OPENAI_CHAT_MODEL_SCORE,
  OPENAI_DEFAULT_CHAT_FALLBACK_MODEL,
  OPENAI_NON_CHAT_MODEL_PATTERNS,
} from '../chatConfig'
import { CHAT_LOG_MESSAGES, CHAT_RUNTIME_MESSAGES } from '../chatMessages'
import { buildEnforcedSystemPrompt } from '../chatPrompts'
import type { ChatMessage } from '../chatValidation'
import { MAX_CHAT_OUTPUT_TOKENS } from '../ipcConstants'
import {
  CHAT_STREAM_CANCELLED_MESSAGE,
  type ChatProviderOptions,
  type ChatStreamTokenHandler,
  isAbortError,
} from './chatProviderTypes'


// ── Model classification & scoring ───────────────────────────────────────────

/** Heuristic — true when `id` looks like a chat completion model. */
export function isLikelyChatModel(id: string): boolean {
  return !OPENAI_NON_CHAT_MODEL_PATTERNS.some((p) => p.test(id))
}

/**
 * Score OpenAI chat model for fallback selection.
 *
 * Strategy: parse major.minor version number for primary sort,
 * use variant qualifiers (mini, nano) for secondary sort.
 * Higher score = prefer for fallback.
 */
export function scoreOpenAIChatModel(id: string): number {
  const lower = id.toLowerCase()

  // Hard exclude non-chat models
  if (!isLikelyChatModel(lower)) return OPENAI_CHAT_MODEL_SCORE.nonChat

  let score = 0

  // Extract version number from model family IDs; the major version dominates.
  const versionMatch = lower.match(/gpt-(\d+)(?:\.(\d+))?/)
  if (versionMatch) {
    const major = parseInt(versionMatch[1], 10)
    const minor = parseInt(versionMatch[2] ?? '0', 10)
    // Major version dominates: gpt-5 >> gpt-4
    score += major * OPENAI_CHAT_MODEL_SCORE.majorMultiplier +
      minor * OPENAI_CHAT_MODEL_SCORE.minorMultiplier
  }

  // Prefer full model over nano/mini variants (full = higher capability)
  // But mini is still better than nothing
  if (lower.includes('nano')) score -= OPENAI_CHAT_MODEL_SCORE.nanoPenalty
  else if (lower.includes('mini')) score -= OPENAI_CHAT_MODEL_SCORE.miniPenalty
  // Optimised suffix gets a small bonus.
  if (lower.match(/gpt-\d+o\b/)) score += OPENAI_CHAT_MODEL_SCORE.optimizedSuffixBonus

  // Prefer models with a date (more recent release)
  const dateMatch = lower.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (dateMatch) {
    const dateNum = parseInt(dateMatch[1] + dateMatch[2] + dateMatch[3], 10)
    score += Math.min(
      dateNum - OPENAI_CHAT_MODEL_SCORE.dateBaseline,
      OPENAI_CHAT_MODEL_SCORE.dateMaxBonus,
    ) / OPENAI_CHAT_MODEL_SCORE.dateBonusDivisor
  }

  return score
}

/**
 * Fetch the best chat-capable OpenAI model from the API.
 * Falls back to OPENAI_DEFAULT_CHAT_FALLBACK_MODEL only if the API call itself fails.
 */
export async function fetchBestOpenAIChatModel(apiKey: string): Promise<string> {
  try {
    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey })
    const response = await client.models.list()

    const chatModels = response.data
      .filter((m) => {
        const id = m.id.toLowerCase()
        return (
          id.startsWith(OPENAI_CHAT_MODEL_PREFIX) &&
          isLikelyChatModel(id) &&
          !OPENAI_CHAT_MODEL_HARD_EXCLUDES.some((e) => id.includes(e))
        )
      })
      .sort((a, b) => scoreOpenAIChatModel(b.id) - scoreOpenAIChatModel(a.id))

    if (chatModels.length > 0) {
      console.log(CHAT_LOG_MESSAGES.openAiFallbackModelSelected(chatModels[0].id))
      return chatModels[0].id
    }
  } catch (e) {
    console.warn(CHAT_LOG_MESSAGES.openAiFallbackModelsFetchFailed, e)
  }
  // Hard fallback — only reached when models API itself fails
  return OPENAI_DEFAULT_CHAT_FALLBACK_MODEL
}

// ── Message formatting ───────────────────────────────────────────────────────

/**
 * Convert IPC chat messages into the OpenAI Chat Completions format.
 *
 * - Always prepends an enforced system message.
 * - Single-text user messages are sent as a string (smaller payload + better
 *   compatibility with older OpenAI-compatible servers).
 * - Mixed content (text + image) is sent as an array of typed parts.
 *
 * Exported so the Local provider (which speaks the same OpenAI-compatible API)
 * can reuse the formatter.
 */
export function formatOpenAIChatMessages(
  messages: ChatMessage[],
  systemPrompt?: string,
  options: ChatProviderOptions = {},
): ChatCompletionMessageParam[] {
  const formattedMessages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: buildEnforcedSystemPrompt(systemPrompt || '', {
        carefulReasoning: options.carefulReasoning,
      }),
    },
  ]


  for (const msg of messages) {
    const content: Array<ChatCompletionContentPartText | ChatCompletionContentPartImage> = []
    for (const c of msg.content) {
      if (c.type === 'text' && c.text) {
        content.push({ type: 'text', text: c.text })
      } else if (c.type === 'image' && c.imageBase64 && c.imageMimeType) {
        content.push({
          type: 'image_url',
          image_url: {
            url: `data:${c.imageMimeType};base64,${c.imageBase64}`,
            detail: OPENAI_CHAT_IMAGE_DETAIL,
          },
        })
      }
    }
    // If only one text content, send as string for better compatibility
    if (content.length === 1 && content[0].type === 'text') {
      formattedMessages.push({ role: msg.role, content: content[0].text })
    } else {
      // Cast required: SDK types split user/assistant content arrays into separate
      // discriminated variants; at runtime only user messages carry image parts.
      formattedMessages.push({ role: msg.role, content } as ChatCompletionMessageParam)
    }
  }
  return formattedMessages
}

/**
 * Detect "this model isn't a chat-completion model" error patterns from OpenAI.
 * Used to decide whether to fall back to a different model.
 */
export function isOpenAIChatEndpointError(error: unknown): boolean {
  const errMsg = error instanceof Error ? error.message : String(error)
  return (
    errMsg.includes(OPENAI_CHAT_ENDPOINT_ERROR_MARKERS.notChatModel) ||
    errMsg.includes(OPENAI_CHAT_ENDPOINT_ERROR_MARKERS.completionsPath) ||
    (
      errMsg.includes(OPENAI_CHAT_ENDPOINT_ERROR_MARKERS.notFoundStatus) &&
      errMsg.includes(OPENAI_CHAT_ENDPOINT_ERROR_MARKERS.completionsResource)
    )
  )
}

// ── Provider implementations ─────────────────────────────────────────────────

/** Non-streaming OpenAI chat — with model fallback when the model isn't chat. */
export async function chatWithOpenAI(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  systemPrompt?: string,
  maxOutputTokens = MAX_CHAT_OUTPUT_TOKENS,
  options: ChatProviderOptions = {},
): Promise<string> {
  const OpenAI = (await import('openai')).default
  const client = new OpenAI({ apiKey })
  const formattedMessages = formatOpenAIChatMessages(messages, systemPrompt, options)


  const tryChat = async (m: string) => {
    const completion = await client.chat.completions.create({
      model: m,
      messages: formattedMessages,
      max_completion_tokens: maxOutputTokens,  // HC-02
    })
    const choice = completion.choices[0]
    const text = (choice?.message?.content ?? '').trim()
    if (!text) {
      const finishReason = choice?.finish_reason ?? 'unknown'
      const refusal = choice?.message && 'refusal' in choice.message
        ? choice.message.refusal
        : undefined
      throw new Error(CHAT_RUNTIME_MESSAGES.openAiEmptyResponse(finishReason, refusal))
    }
    return text
  }

  try {
    return await tryChat(model)
  } catch (err: unknown) {
    if (isOpenAIChatEndpointError(err)) {
      // Fetch the best actual chat-capable model from the API
      const bestModel = await fetchBestOpenAIChatModel(apiKey)
      if (bestModel !== model) {
        // Tell the caller which model actually answered (silent fallback otherwise).
        options.onModelFallback?.(bestModel)
        return await tryChat(bestModel)
      }
    }
    throw err
  }
}

/** Streaming OpenAI chat — fallback only happens before any token is emitted. */
export async function streamChatWithOpenAI(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  systemPrompt: string | undefined,
  maxOutputTokens: number,
  onToken: ChatStreamTokenHandler,
  signal?: AbortSignal,
  options: ChatProviderOptions = {},
): Promise<string> {
  if (signal?.aborted) throw new Error(CHAT_STREAM_CANCELLED_MESSAGE)
  const OpenAI = (await import('openai')).default
  const client = new OpenAI({ apiKey })
  const formattedMessages = formatOpenAIChatMessages(messages, systemPrompt, options)

  let emittedToken = false

  const tryChat = async (m: string) => {
    let fullText = ''
    // OpenAI SDK accepts a request-options bag whose `signal` propagates to fetch.
    const stream = await client.chat.completions.create(
      {
        model: m,
        messages: formattedMessages,
        stream: true,
        max_completion_tokens: maxOutputTokens,
      },
      signal ? { signal } : undefined,
    )

    for await (const chunk of stream) {
      if (signal?.aborted) throw new Error(CHAT_STREAM_CANCELLED_MESSAGE)
      const token = chunk.choices[0]?.delta?.content ?? ''
      if (token) {
        emittedToken = true
        fullText += token
        onToken(token)
      }
    }

    const text = fullText.trim()
    if (!text) throw new Error(CHAT_RUNTIME_MESSAGES.openAiStreamEmptyResponse)
    return text
  }

  try {
    return await tryChat(model)
  } catch (err: unknown) {
    // Bubble user cancellation as-is — never fall back to a different model.
    if (isAbortError(err, signal)) {
      throw new Error(CHAT_STREAM_CANCELLED_MESSAGE)
    }
    if (!emittedToken && isOpenAIChatEndpointError(err)) {
      const bestModel = await fetchBestOpenAIChatModel(apiKey)
      if (bestModel !== model) {
        options.onModelFallback?.(bestModel)
        return await tryChat(bestModel)
      }
    }
    throw err
  }
}

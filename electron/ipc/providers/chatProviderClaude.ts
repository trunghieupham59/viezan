/**
 * Claude (Anthropic) chat provider — non-streaming + streaming implementations.
 *
 * Uses the official `@anthropic-ai/sdk` lazily imported at runtime.
 *
 * Multimodal: text + base64 images mapped into Anthropic content blocks.
 *
 * Cancellation: the Anthropic SDK accepts a `signal` request-option that wires
 * through to fetch, closing the SSE connection cleanly. We additionally call
 * `stream.controller?.abort()` from the abort listener as a defensive belt-and-
 * braces and poll between events.
 */
import type { ImageBlockParam, TextBlockParam } from '@anthropic-ai/sdk/resources/messages'
import type { ClaudeImageMimeType } from '../chatConfig'
import { CHAT_RUNTIME_MESSAGES } from '../chatMessages'
import { buildEnforcedSystemPrompt } from '../chatPrompts'
import type { ChatMessage } from '../chatValidation'
import { MAX_CHAT_OUTPUT_TOKENS } from '../ipcConstants'
import {
  CHAT_STREAM_CANCELLED_MESSAGE,
  type ChatProviderOptions,
  type ChatStreamTokenHandler,
} from './chatProviderTypes'


/** Map IPC chat messages → Anthropic SDK message blocks (text + image). */
function formatClaudeMessages(messages: ChatMessage[]) {
  return messages.map((msg) => {
    const content: Array<TextBlockParam | ImageBlockParam> = []
    for (const c of msg.content) {
      if (c.type === 'text' && c.text) {
        content.push({ type: 'text', text: c.text })
      } else if (c.type === 'image' && c.imageBase64 && c.imageMimeType) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: c.imageMimeType as ClaudeImageMimeType,
            data: c.imageBase64,
          },
        })
      }
    }
    return { role: msg.role, content }
  })
}

/** Non-streaming Claude chat — returns the trimmed reply text. */
export async function chatWithClaude(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  systemPrompt?: string,
  maxOutputTokens = MAX_CHAT_OUTPUT_TOKENS,
  options: ChatProviderOptions = {},
): Promise<string> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey })

  const formattedMessages = formatClaudeMessages(messages)

  const request = {
    model,
    max_tokens: maxOutputTokens,  // HC-02
    system: buildEnforcedSystemPrompt(systemPrompt || '', {
      carefulReasoning: options.carefulReasoning,
    }),
    messages: formattedMessages,
  }

  // Always stream and await the final message: the SDK refuses non-streaming
  // `create()` calls above a per-model token cap (e.g. 8192 for Opus 4/4.1),
  // which a fixed threshold cannot predict.
  const message = await client.messages.stream(request).finalMessage()

  // The first block may be `thinking` (or content may be empty), so look for
  // the first text block instead of trusting content[0].
  const block = message.content.find((candidate) => candidate.type === 'text')
  if (block && block.type === 'text') {
    const text = block.text.trim()
    if (!text) {
      throw new Error(CHAT_RUNTIME_MESSAGES.claudeEmptyResponse(message.stop_reason ?? 'unknown'))
    }
    return text
  }
  if (message.content.length === 0) {
    throw new Error(CHAT_RUNTIME_MESSAGES.claudeEmptyResponse(message.stop_reason ?? 'unknown'))
  }
  throw new Error(CHAT_RUNTIME_MESSAGES.claudeUnexpectedResponseType)
}

/** Streaming Claude chat — emits tokens through `onToken`. */
export async function streamChatWithClaude(
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
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey })
  let fullText = ''
  const stream = client.messages.stream(
    {
      model,
      max_tokens: maxOutputTokens,
      system: buildEnforcedSystemPrompt(systemPrompt || '', {
        carefulReasoning: options.carefulReasoning,
      }),
      messages: formatClaudeMessages(messages),
    },

    // Anthropic SDK accepts a request-options object whose `signal` field
    // wires through to the underlying fetch — aborting here closes the SSE
    // connection cleanly.
    signal ? { signal } : undefined,
  )

  // Defensive: also poll the signal between events in case the SDK does not
  // surface the abort fast enough.
  const onAbort = () => {
    try {
      stream.controller?.abort?.()
    } catch {
      /* ignore — we still throw below */
    }
  }
  signal?.addEventListener('abort', onAbort, { once: true })

  let finished = false
  try {
    for await (const event of stream) {
      if (signal?.aborted) throw new Error(CHAT_STREAM_CANCELLED_MESSAGE)
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const token = event.delta.text
        if (token) {
          fullText += token
          onToken(token)
        }
      }
    }
    finished = true
  } finally {
    signal?.removeEventListener('abort', onAbort)
    // If the loop exited early (onToken threw, abort, SDK error) make sure the
    // SSE connection is not left running in the background.
    if (!finished) onAbort()
  }

  const text = fullText.trim()
  if (!text) throw new Error(CHAT_RUNTIME_MESSAGES.claudeStreamEmptyResponse)
  return text
}

/**
 * Local chat provider — backs onto Ollama / LM Studio / llama.cpp via the
 * OpenAI-compatible Chat Completions API exposed by every supported runtime.
 *
 * The discovery layer (`localAi.ts`) resolves a base URL + model name at
 * runtime, after which we reuse the OpenAI SDK with a placeholder API key.
 *
 * Cancellation: identical to the OpenAI provider — the SDK's `signal` request
 * option propagates abort to fetch, and we additionally poll between SSE
 * chunks. No model fallback is attempted (the user picked a local model
 * explicitly; failing fast surfaces config issues).
 */
import { CHAT_RUNTIME_MESSAGES } from '../chatMessages'
import type { ChatMessage } from '../chatValidation'
import { MAX_CHAT_OUTPUT_TOKENS } from '../ipcConstants'
import { LOCAL_AI_PLACEHOLDER_KEY, resolveLocalAiRequestModel } from '../localAi'
import { formatOpenAIChatMessages } from './chatProviderOpenAI'
import {
  CHAT_STREAM_CANCELLED_MESSAGE,
  type ChatProviderOptions,
  type ChatStreamTokenHandler,
} from './chatProviderTypes'


/**
 * Non-streaming local chat. The first parameter (`_apiKey`) is ignored —
 * the local runtime does not require authentication; the placeholder key is
 * sent to the SDK to satisfy its constructor.
 */
export async function chatWithLocal(
  _apiKey: string,
  model: string,
  messages: ChatMessage[],
  systemPrompt?: string,
  maxOutputTokens = MAX_CHAT_OUTPUT_TOKENS,
  options: ChatProviderOptions = {},
): Promise<string> {
  const OpenAI = (await import('openai')).default
  const local = await resolveLocalAiRequestModel(model)
  const client = new OpenAI({ apiKey: LOCAL_AI_PLACEHOLDER_KEY, baseURL: local.baseURL })
  const completion = await client.chat.completions.create({
    model: local.model,
    messages: formatOpenAIChatMessages(messages, systemPrompt, options),
    max_tokens: maxOutputTokens,
  })

  const choice = completion.choices[0]
  const text = (choice?.message?.content ?? '').trim()
  if (!text) {
    throw new Error(CHAT_RUNTIME_MESSAGES.localAiEmptyResponse(choice?.finish_reason ?? 'unknown'))
  }
  return text
}

/** Streaming local chat — emits tokens through `onToken`. */
export async function streamChatWithLocal(
  _apiKey: string,
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
  const local = await resolveLocalAiRequestModel(model)
  const client = new OpenAI({ apiKey: LOCAL_AI_PLACEHOLDER_KEY, baseURL: local.baseURL })
  let fullText = ''
  const stream = await client.chat.completions.create(
    {
      model: local.model,
      messages: formatOpenAIChatMessages(messages, systemPrompt, options),
      stream: true,
      max_tokens: maxOutputTokens,
    },
    signal ? { signal } : undefined,
  )


  for await (const chunk of stream) {
    if (signal?.aborted) throw new Error(CHAT_STREAM_CANCELLED_MESSAGE)
    const token = chunk.choices[0]?.delta?.content ?? ''
    if (token) {
      fullText += token
      onToken(token)
    }
  }

  const text = fullText.trim()
  if (!text) throw new Error(CHAT_RUNTIME_MESSAGES.localAiStreamEmptyResponse)
  return text
}

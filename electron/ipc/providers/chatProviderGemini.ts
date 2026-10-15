/**
 * Gemini chat provider — non-streaming + streaming implementations.
 *
 * Uses the official `@google/generative-ai` SDK lazily imported at runtime
 * (keeps the cold-start of the main process unaffected when only other
 * providers are in use).
 *
 * Multimodal: text + inline base64 images are mapped into Gemini `Part`s.
 *
 * Cancellation: `sendMessageStream(parts, { signal })` forwards the AbortSignal
 * to fetch, so the HTTP request (and body read) is torn down on abort. The
 * stream loop additionally checks `signal.aborted` at chunk boundaries and
 * raises the shared CHAT_STREAM_CANCELLED_MESSAGE sentinel that the IPC handler
 * translates into a typed `CANCELLED` event.
 */
import type { Content, Part } from '@google/generative-ai'
import { GEMINI_SUCCESS_FINISH_REASON } from '../chatConfig'
import { CHAT_RUNTIME_MESSAGES } from '../chatMessages'
import { buildEnforcedSystemPrompt } from '../chatPrompts'
import type { ChatMessage } from '../chatValidation'
import { MAX_CHAT_OUTPUT_TOKENS } from '../ipcConstants'
import {
  CHAT_STREAM_CANCELLED_MESSAGE,
  type ChatProviderOptions,
  type ChatStreamTokenHandler,
} from './chatProviderTypes'


/**
 * Convert the IPC chat history into the Gemini SDK shape.
 *
 * The last message is held back as `parts` to feed `chat.sendMessage(...)`
 * directly; everything before it becomes the `history` for `startChat({history})`.
 */
function buildGeminiChatPayload(messages: ChatMessage[]) {
  const history: Content[] = messages.slice(0, -1).map((msg) => {
    const parts: Part[] = []
    for (const c of msg.content) {
      if (c.type === 'text' && c.text) {
        parts.push({ text: c.text })
      } else if (c.type === 'image' && c.imageBase64 && c.imageMimeType) {
        parts.push({ inlineData: { data: c.imageBase64, mimeType: c.imageMimeType } })
      }
    }
    return { role: msg.role === 'user' ? 'user' : 'model', parts }
  })

  const lastMsg = messages[messages.length - 1]
  const parts: Array<string | Part> = []
  for (const c of lastMsg.content) {
    if (c.type === 'text' && c.text) {
      parts.push(c.text)
    } else if (c.type === 'image' && c.imageBase64 && c.imageMimeType) {
      parts.push({ inlineData: { data: c.imageBase64, mimeType: c.imageMimeType } })
    }
  }

  return { history, parts }
}

/** Build the Gemini chat session (model + enforced system prompt + history) shared by both paths. */
async function startGeminiChat(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  systemPrompt: string | undefined,
  maxOutputTokens: number,
  options: ChatProviderOptions,
) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const genModel = genAI.getGenerativeModel({
    model,
    systemInstruction: buildEnforcedSystemPrompt(systemPrompt || '', {
      carefulReasoning: options.carefulReasoning,
    }),
    generationConfig: { maxOutputTokens },
  })
  const { history, parts } = buildGeminiChatPayload(messages)
  return { chat: genModel.startChat({ history }), parts }
}

/** Non-streaming Gemini chat — returns the trimmed reply text. */
export async function chatWithGemini(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  systemPrompt?: string,
  maxOutputTokens = MAX_CHAT_OUTPUT_TOKENS,
  options: ChatProviderOptions = {},
): Promise<string> {
  const { chat, parts } = await startGeminiChat(apiKey, model, messages, systemPrompt, maxOutputTokens, options)
  const result = await chat.sendMessage(parts)
  const text = result.response.text().trim()
  if (!text) {
    const finishReason = result.response.candidates?.[0]?.finishReason
    throw new Error(
      finishReason
        ? CHAT_RUNTIME_MESSAGES.geminiEmptyResponseWithFinishReason(finishReason)
        : CHAT_RUNTIME_MESSAGES.geminiEmptyResponse
    )
  }
  return text
}

/** Streaming Gemini chat — emits tokens through `onToken`, returns the full text. */
export async function streamChatWithGemini(
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
  const { chat, parts } = await startGeminiChat(apiKey, model, messages, systemPrompt, maxOutputTokens, options)
  const result = await chat.sendMessageStream(parts, signal ? { signal } : undefined)
  let fullText = ''
  let lastFinishReason: string | undefined

  for await (const chunk of result.stream) {
    // Belt and braces: the signal is wired into the request above, but also
    // stop promptly at chunk boundaries.
    if (signal?.aborted) throw new Error(CHAT_STREAM_CANCELLED_MESSAGE)
    // Capture finishReason from each chunk; Gemini sets it (e.g. RECITATION, SAFETY)
    // even when the chunk yields no text, so the SDK's chunk.text() may throw.
    const candidateFinishReason = chunk.candidates?.[0]?.finishReason
    if (candidateFinishReason) lastFinishReason = candidateFinishReason
    let token = ''
    try {
      token = chunk.text()
    } catch {
      // chunk.text() throws when the candidate was blocked (RECITATION/SAFETY).
      // Swallow here — we surface a typed error below from finishReason.
    }
    if (token) {
      fullText += token
      onToken(token)
    }
  }

  if (signal?.aborted) throw new Error(CHAT_STREAM_CANCELLED_MESSAGE)

  if (!fullText.trim()) {
    try {
      const response = await result.response
      const responseFinishReason = response.candidates?.[0]?.finishReason
      if (responseFinishReason) lastFinishReason = responseFinishReason
      const responseText = response.text().trim()
      if (responseText) {
        fullText = responseText
        onToken(responseText)
      }
    } catch {
      // Keep the typed empty-response handling below.
    }
  }

  const text = fullText.trim()
  if (!text) {
    if (lastFinishReason && lastFinishReason !== GEMINI_SUCCESS_FINISH_REASON) {
      throw new Error(CHAT_RUNTIME_MESSAGES.geminiEmptyResponseWithFinishReason(lastFinishReason))
    }
    throw new Error(CHAT_RUNTIME_MESSAGES.geminiEmptyResponse)
  }
  return text
}

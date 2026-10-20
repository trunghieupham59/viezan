import { blockedSafetyError } from './errorUtils'
import { clampMaxOutputTokens, MAX_OUTPUT_TOKENS_CLAUDE } from './ipcConstants'
import { buildLivePrompt, buildLiveSystemPrompt, liveOutputBudget } from './liveTranslationPolicy'
import { buildPrompt, buildRewritePrompt, REWRITE_SYSTEM_PROMPT, SYSTEM_PROMPT } from './translatePrompts'
import { finalizeProviderText, joinClaudeText, nonEmptyProviderText } from './translateProviderOutput'
import type { DetectFn, RewriteFn, StreamFn, TranslateFn, TranslateRequestOptions, VerifyFn } from './translateProviderTypes'
import { getClaudeReasoningConfig } from './translationReasoning'

/** Single retry layer: `withRetry` handles transient failures, so the SDK must not retry on its own. */
const CLIENT_OPTIONS = { maxRetries: 0 } as const

/** Claude text answer; `stop_reason: "refusal"` is a safety block, `max_tokens` a truncation. */
function messageText(message: { content: ReadonlyArray<{ type: string; text?: string }>; stop_reason?: string | null }): string {
  if (message.stop_reason === 'refusal') throw blockedSafetyError('claude', 'stop_reason=refusal')
  return finalizeProviderText('claude', joinClaudeText(message.content), message.stop_reason === 'max_tokens')
}

function requestOptions(options: TranslateRequestOptions = {}) {
  return options.signal ? { signal: options.signal } : undefined
}

export const translateWithClaude: TranslateFn = async (
  apiKey,
  model,
  sourceText,
  sourceLang,
  targetLang,
  showFurigana,
  style,
  phoneticOnly,
  phoneticMode,
  reasoningEffort,
  options: TranslateRequestOptions = {},
) => {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey, ...CLIENT_OPTIONS })
  const message = await client.messages.create(
    {
      model,
      max_tokens: clampMaxOutputTokens('claude', model, options.live ? liveOutputBudget(sourceText) : MAX_OUTPUT_TOKENS_CLAUDE),
      system: options.live ? buildLiveSystemPrompt(sourceLang, targetLang) : SYSTEM_PROMPT,
      messages: [{ role: 'user', content: options.live ? buildLivePrompt(sourceText, sourceLang, targetLang, options.live.context) : buildPrompt(sourceText, sourceLang, targetLang, showFurigana, style, phoneticOnly, phoneticMode) }],
      ...(options.live ? {} : getClaudeReasoningConfig(model, reasoningEffort)),
    },
    requestOptions(options),
  )
  if (message.usage) options.onUsage?.({ inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens, totalTokens: message.usage.input_tokens + message.usage.output_tokens, estimated: false })
  return messageText(message)
}

export const rewriteWithClaude: RewriteFn = async (apiKey, model, text, lang, style, options = {}) => {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey, ...CLIENT_OPTIONS })
  const message = await client.messages.create(
    {
      model,
      max_tokens: clampMaxOutputTokens('claude', model, MAX_OUTPUT_TOKENS_CLAUDE),
      system: REWRITE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildRewritePrompt(text, lang, style) }],
    },
    requestOptions(options),
  )
  return messageText(message)
}

export const detectWithClaude: DetectFn = async (apiKey, model, prompt, options = {}) => {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey, ...CLIENT_OPTIONS })
  const message = await client.messages.create(
    {
      model,
      max_tokens: 10,
      messages: [{ role: 'user', content: prompt }],
    },
    requestOptions(options),
  )
  if (message.stop_reason === 'refusal') throw blockedSafetyError('claude', 'stop_reason=refusal')
  return nonEmptyProviderText('claude', joinClaudeText(message.content))
}

export const verifyClaudeKey: VerifyFn = async (apiKey, options = {}) => {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey, ...CLIENT_OPTIONS })
  // Authentication must not depend on a particular Messages model. A valid
  // key can outlive any fixed model ID, while the Models API is explicitly
  // intended to report the models available to the authenticated workspace.
  await client.models.list({ limit: 1 }, requestOptions(options))
}

export const streamWithClaude: StreamFn = async (apiKey, model, prompt, onToken, options = {}) => {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  // Streaming is not wrapped by withRetry, so it keeps the SDK's own connection retries.
  const client = new Anthropic({ apiKey })
  let fullText = ''
  let stopReason: string | null | undefined
  const stream = client.messages.stream(
    {
      model,
      max_tokens: clampMaxOutputTokens('claude', model, MAX_OUTPUT_TOKENS_CLAUDE),
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    },
    requestOptions(options),
  )
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      const token = event.delta.text
      if (token) {
        fullText += token
        onToken(token)
      }
    } else if (event.type === 'message_delta' && event.delta.stop_reason) {
      stopReason = event.delta.stop_reason
    }
  }
  if (stopReason === 'refusal') throw blockedSafetyError('claude', 'stop_reason=refusal')
  finalizeProviderText('claude', fullText, stopReason === 'max_tokens')
  return fullText
}

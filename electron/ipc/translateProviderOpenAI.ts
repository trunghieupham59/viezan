import { blockedSafetyError } from './errorUtils'
import { clampMaxOutputTokens, MAX_OUTPUT_TOKENS_OPENAI, VERIFY_MAX_TOKENS, VERIFY_MODEL_OPENAI } from './ipcConstants'
import { buildPrompt, buildRewritePrompt, REWRITE_SYSTEM_PROMPT, SYSTEM_PROMPT } from './translatePrompts'
import { finalizeProviderText, nonEmptyProviderText } from './translateProviderOutput'
import type { DetectFn, RewriteFn, StreamFn, TranslateFn, TranslateRequestOptions, VerifyFn } from './translateProviderTypes'
import { getOpenAIReasoningEffort } from './translationReasoning'

/** Max completion tokens for language detection. Reasoning models spend hidden tokens before the answer. */
const DETECT_MAX_COMPLETION_TOKENS = 64

function requestOptions(options: TranslateRequestOptions = {}) {
  return options.signal ? { signal: options.signal } : undefined
}

/** Single retry layer: `withRetry` handles transient failures, so the SDK must not retry on its own. */
const CLIENT_OPTIONS = { maxRetries: 0 } as const

interface OpenAIChoiceLike {
  finish_reason?: string | null
  message?: { content?: string | null; refusal?: string | null }
}

/** Read the first choice and fail on content filtering / refusal / truncation / empty output. */
function completionText(completion: { choices: OpenAIChoiceLike[] }): string {
  const choice = completion.choices[0]
  if (choice?.finish_reason === 'content_filter') throw blockedSafetyError('openai', 'finish_reason=content_filter')
  if (typeof choice?.message?.refusal === 'string' && choice.message.refusal.trim()) {
    throw blockedSafetyError('openai', 'refusal')
  }
  return finalizeProviderText('openai', choice?.message?.content, choice?.finish_reason === 'length')
}

export const translateWithOpenAI: TranslateFn = async (
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
  const OpenAI = (await import('openai')).default
  const client = new OpenAI({ apiKey, ...CLIENT_OPTIONS })
  const completion = await client.chat.completions.create(
    {
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(sourceText, sourceLang, targetLang, showFurigana, style, phoneticOnly, phoneticMode) },
      ],
      max_completion_tokens: clampMaxOutputTokens('openai', model, MAX_OUTPUT_TOKENS_OPENAI),
      reasoning_effort: getOpenAIReasoningEffort(model, reasoningEffort),
    },
    requestOptions(options),
  )
  return completionText(completion)
}

export const rewriteWithOpenAI: RewriteFn = async (apiKey, model, text, lang, style, options = {}) => {
  const OpenAI = (await import('openai')).default
  const client = new OpenAI({ apiKey, ...CLIENT_OPTIONS })
  const completion = await client.chat.completions.create(
    {
      model,
      messages: [
        { role: 'system', content: REWRITE_SYSTEM_PROMPT },
        { role: 'user', content: buildRewritePrompt(text, lang, style) },
      ],
      max_completion_tokens: clampMaxOutputTokens('openai', model, MAX_OUTPUT_TOKENS_OPENAI),
    },
    requestOptions(options),
  )
  return completionText(completion)
}

export const detectWithOpenAI: DetectFn = async (apiKey, model, prompt, options = {}) => {
  const OpenAI = (await import('openai')).default
  const client = new OpenAI({ apiKey, ...CLIENT_OPTIONS })
  const completion = await client.chat.completions.create(
    {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: DETECT_MAX_COMPLETION_TOKENS,
    },
    requestOptions(options),
  )
  return nonEmptyProviderText('openai', completion.choices[0]?.message?.content)
}

export const verifyOpenAIKey: VerifyFn = async (apiKey, options = {}) => {
  const OpenAI = (await import('openai')).default
  const client = new OpenAI({ apiKey, ...CLIENT_OPTIONS })
  const completion = await client.chat.completions.create(
    {
      model: VERIFY_MODEL_OPENAI,
      messages: [{ role: 'user', content: 'Say "ok".' }],
      max_completion_tokens: VERIFY_MAX_TOKENS,
    },
    requestOptions(options),
  )
  if (!completion.choices[0]) throw new Error('No response from OpenAI')
}

export const streamWithOpenAI: StreamFn = async (apiKey, model, prompt, onToken, options = {}) => {
  const OpenAI = (await import('openai')).default
  // Streaming is not wrapped by withRetry, so it keeps the SDK's own connection retries.
  const client = new OpenAI({ apiKey })
  let fullText = ''
  let truncated = false
  const stream = await client.chat.completions.create(
    {
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      stream: true,
      max_completion_tokens: clampMaxOutputTokens('openai', model, MAX_OUTPUT_TOKENS_OPENAI),
    },
    requestOptions(options),
  )
  for await (const chunk of stream) {
    const choice = chunk.choices[0]
    if (choice?.finish_reason === 'length') truncated = true
    if (choice?.finish_reason === 'content_filter') throw blockedSafetyError('openai', 'finish_reason=content_filter')
    const token = choice?.delta?.content ?? ''
    if (token) {
      fullText += token
      onToken(token)
    }
  }
  finalizeProviderText('openai', fullText, truncated)
  return fullText
}

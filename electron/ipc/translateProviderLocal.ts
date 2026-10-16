import { blockedSafetyError } from './errorUtils'
import { MAX_OUTPUT_TOKENS_OPENAI } from './ipcConstants'
import { discoverLocalAiRuntimes, LOCAL_AI_PLACEHOLDER_KEY, resolveLocalAiRequestModel } from './localAi'
import { buildPrompt, buildRewritePrompt, REWRITE_SYSTEM_PROMPT, SYSTEM_PROMPT } from './translatePrompts'
import { finalizeProviderText, nonEmptyProviderText } from './translateProviderOutput'
import type { DetectFn, RewriteFn, StreamFn, TranslateFn, TranslateRequestOptions, VerifyFn } from './translateProviderTypes'

async function getLocalOpenAIClient(model: string) {
  const OpenAI = (await import('openai')).default
  const local = await resolveLocalAiRequestModel(model)
  return {
    // maxRetries 0: `withRetry` is the single retry layer.
    client: new OpenAI({ apiKey: LOCAL_AI_PLACEHOLDER_KEY, baseURL: local.baseURL, maxRetries: 0, fetch: local.fetch }),
    model: local.model,
  }
}

function requestOptions(options: TranslateRequestOptions = {}) {
  return options.signal ? { signal: options.signal } : undefined
}

function completionText(completion: { choices: Array<{ finish_reason?: string | null; message?: { content?: string | null; refusal?: string | null } }> }): string {
  const choice = completion.choices[0]
  if (typeof choice?.message?.refusal === 'string' && choice.message.refusal.trim()) {
    throw blockedSafetyError('local', 'refusal')
  }
  return finalizeProviderText('local', choice?.message?.content, choice?.finish_reason === 'length')
}

export const translateWithLocal: TranslateFn = async (
  _apiKey,
  model,
  sourceText,
  sourceLang,
  targetLang,
  showFurigana,
  style,
  phoneticOnly,
  phoneticMode,
  _reasoningEffort,
  options: TranslateRequestOptions = {},
) => {
  const { client, model: resolvedModel } = await getLocalOpenAIClient(model)
  const completion = await client.chat.completions.create(
    {
      model: resolvedModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(sourceText, sourceLang, targetLang, showFurigana, style, phoneticOnly, phoneticMode) },
      ],
      max_tokens: MAX_OUTPUT_TOKENS_OPENAI,
    },
    requestOptions(options),
  )
  return completionText(completion)
}

export const rewriteWithLocal: RewriteFn = async (_apiKey, model, text, lang, style, options = {}) => {
  const { client, model: resolvedModel } = await getLocalOpenAIClient(model)
  const completion = await client.chat.completions.create(
    {
      model: resolvedModel,
      messages: [
        { role: 'system', content: REWRITE_SYSTEM_PROMPT },
        { role: 'user', content: buildRewritePrompt(text, lang, style) },
      ],
      max_tokens: MAX_OUTPUT_TOKENS_OPENAI,
    },
    requestOptions(options),
  )
  return completionText(completion)
}

export const detectWithLocal: DetectFn = async (_apiKey, model, prompt, options = {}) => {
  const { client, model: resolvedModel } = await getLocalOpenAIClient(model)
  const completion = await client.chat.completions.create(
    {
      model: resolvedModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 10,
    },
    requestOptions(options),
  )
  return nonEmptyProviderText('local', completion.choices[0]?.message?.content)
}

/**
 * Verify only checks that a local runtime is already reachable. It must not use
 * `resolveLocalAiRequestModel` / `ensureLocalAiRuntime`, which may spawn Ollama and take minutes,
 * far longer than the short verify deadline.
 */
export const verifyLocalRuntime: VerifyFn = async () => {
  const discovery = await discoverLocalAiRuntimes(true)
  if (!discovery.available) throw new Error(discovery.error ?? 'Local AI runtime is not running')
}

export const streamWithLocal: StreamFn = async (_apiKey, model, prompt, onToken, options = {}) => {
  const { client, model: resolvedModel } = await getLocalOpenAIClient(model)
  let fullText = ''
  let truncated = false
  const stream = await client.chat.completions.create(
    {
      model: resolvedModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      stream: true,
      max_tokens: MAX_OUTPUT_TOKENS_OPENAI,
    },
    requestOptions(options),
  )

  for await (const chunk of stream) {
    const choice = chunk.choices[0]
    if (choice?.finish_reason === 'length') truncated = true
    const token = choice?.delta?.content ?? ''
    if (token) {
      fullText += token
      onToken(token)
    }
  }

  finalizeProviderText('local', fullText, truncated)
  return fullText
}

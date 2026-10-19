import { blockedSafetyError } from './errorUtils'
import { VERIFY_MODEL_GEMINI } from './ipcConstants'
import { buildLivePrompt, LIVE_SYSTEM_PROMPT, liveOutputBudget } from './liveTranslationPolicy'
import { buildPrompt, buildRewritePrompt, REWRITE_SYSTEM_PROMPT, SYSTEM_PROMPT } from './translatePrompts'
import { finalizeProviderText, nonEmptyProviderText } from './translateProviderOutput'
import type { DetectFn, RewriteFn, StreamFn, TranslateFn, TranslateRequestOptions, VerifyFn } from './translateProviderTypes'
import { getGeminiMaxOutputTokens, getGeminiThinkingConfig } from './translationReasoning'

const TRANSLATE_CANCELLED_MESSAGE = 'translate-cancelled'

function requestOptions(options: TranslateRequestOptions = {}) {
  return options.signal ? { signal: options.signal } : undefined
}

interface GeminiResponseLike {
  text(): string
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ thought?: boolean; text?: string }> } }>
  promptFeedback?: { blockReason?: string }
}

/** Finish reasons where Gemini returns no text because the content was filtered (text() does not throw). */
const SAFETY_FINISH_REASONS = new Set(['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'])

/** Throw BLOCKED_SAFETY when the prompt or the candidate was filtered by Gemini. */
function assertNotBlocked(response: GeminiResponseLike): void {
  const blockReason = response.promptFeedback?.blockReason
  if (blockReason) throw blockedSafetyError('gemini', `blockReason=${blockReason}`)
  const finishReason = response.candidates?.[0]?.finishReason
  if (finishReason && SAFETY_FINISH_REASONS.has(finishReason)) {
    throw blockedSafetyError('gemini', `finishReason=${finishReason}`)
  }
}

/** Read Gemini text; MAX_TOKENS is a truncation error, filtering is BLOCKED_SAFETY, empty text is an empty-response error. */
function geminiText(response: GeminiResponseLike): string {
  assertNotBlocked(response)
  const truncated = response.candidates?.[0]?.finishReason === 'MAX_TOKENS'
  let text = ''
  try {
    const parts = response.candidates?.[0]?.content?.parts
    text = parts ? parts.filter(part => !part.thought).map(part => part.text ?? '').join('') : response.text()
  } catch (error) {
    // text() throws for blocked candidates; a truncated answer should surface as truncation instead.
    if (!truncated) throw error
  }
  return finalizeProviderText('gemini', text, truncated)
}

export const translateWithGemini: TranslateFn = async (
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
  if (options.signal?.aborted) throw new Error(TRANSLATE_CANCELLED_MESSAGE)
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const thinkingConfig = options.live && /^gemini-2\.5-flash/.test(model)
    ? { thinkingBudget: 0 }
    : getGeminiThinkingConfig(model, reasoningEffort)
  const generationConfig = {
    maxOutputTokens: options.live ? liveOutputBudget(sourceText) + (thinkingConfig && !('thinkingBudget' in thinkingConfig && thinkingConfig.thinkingBudget === 0) ? 1_024 : 0) : getGeminiMaxOutputTokens(model),
    ...(thinkingConfig === undefined ? {} : { thinkingConfig }),
  }
  const genModel = genAI.getGenerativeModel({
    model,
    systemInstruction: options.live ? LIVE_SYSTEM_PROMPT : SYSTEM_PROMPT,
    // The legacy SDK forwards generationConfig verbatim but predates this API field in its types.
    generationConfig: generationConfig as never,
  })
  const result = await genModel.generateContent(
    options.live ? buildLivePrompt(sourceText, sourceLang, targetLang, options.live.context) : buildPrompt(sourceText, sourceLang, targetLang, showFurigana, style, phoneticOnly, phoneticMode),
    requestOptions(options),
  )
  const usage = result.response.usageMetadata
  if (usage) options.onUsage?.({ inputTokens: usage.promptTokenCount, outputTokens: Math.max(usage.candidatesTokenCount, usage.totalTokenCount - usage.promptTokenCount), totalTokens: usage.totalTokenCount, estimated: false })
  if (options.signal?.aborted) throw new Error(TRANSLATE_CANCELLED_MESSAGE)
  return geminiText(result.response)
}

export const rewriteWithGemini: RewriteFn = async (apiKey, model, text, lang, style, options = {}) => {
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const genModel = genAI.getGenerativeModel({
    model,
    systemInstruction: REWRITE_SYSTEM_PROMPT,
    generationConfig: { maxOutputTokens: getGeminiMaxOutputTokens(model) },
  })
  const result = await genModel.generateContent(buildRewritePrompt(text, lang, style), requestOptions(options))
  return geminiText(result.response)
}

export const detectWithGemini: DetectFn = async (apiKey, model, prompt, options = {}) => {
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const genModel = genAI.getGenerativeModel({ model })
  const result = await genModel.generateContent(prompt, requestOptions(options))
  assertNotBlocked(result.response)
  return nonEmptyProviderText('gemini', result.response.text())
}

export const verifyGeminiKey: VerifyFn = async (apiKey, options = {}) => {
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: VERIFY_MODEL_GEMINI })
  const result = await model.generateContent('Say "ok" in one word.', requestOptions(options))
  const text = result.response.text()
  if (!text) throw new Error('No response from Gemini')
}

export const streamWithGemini: StreamFn = async (apiKey, model, prompt, onToken, options = {}) => {
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const genModel = genAI.getGenerativeModel({
    model,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: { maxOutputTokens: getGeminiMaxOutputTokens(model) },
  })
  let fullText = ''
  const result = await genModel.generateContentStream(prompt, requestOptions(options))
  for await (const chunk of result.stream) {
    const token = chunk.text()
    if (token) {
      fullText += token
      onToken(token)
    }
  }
  // The aggregated response carries the final finishReason (MAX_TOKENS / safety filters).
  const final = await result.response
  assertNotBlocked(final)
  finalizeProviderText('gemini', fullText, final.candidates?.[0]?.finishReason === 'MAX_TOKENS')
  return fullText
}

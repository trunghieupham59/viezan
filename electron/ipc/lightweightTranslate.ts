import { blockedSafetyError, classifyProviderError, emptyResponseError, truncatedOutputError } from './errorUtils'
import {
  clampMaxOutputTokens,
  EXT_DEFAULT_CLAUDE_MODEL,
  EXT_DEFAULT_GEMINI_MODEL,
  EXT_DEFAULT_OPENAI_MODEL,
  getLightweightMaxOutputTokens,
  getLightweightTranslateTimeoutMs,
  LIGHTWEIGHT_TRANSLATOR_PROMPT,
  MAX_LIGHTWEIGHT_TRANSLATE_CHARS,
} from './ipcConstants'
import { hasOwnKey, isSafeTargetLanguageCode } from './ipcValidation'
import { isLocalProvider, LOCAL_AI_PLACEHOLDER_KEY, resolveLocalAiRequestModel } from './localAi'
import { isValidProvider } from './providers/types'
import { getStoredApiKey } from './storage'
import { runWithTimeout } from './translateChunking'
import { getStyleTone, STYLE_TONE } from './translatePrompts'
import { joinClaudeText } from './translateProviderOutput'
import type { TranslationStyle } from './translateValidation'
import { getGeminiMaxOutputTokens } from './translationReasoning'

const MAX_MODEL_ID_CHARS = 200

export interface LightweightTranslateParams {
  text: string
  targetLang: string
  provider?: string
  model?: string
  translationStyle?: TranslationStyle
}

export interface LightweightTranslateResult {
  success: boolean
  translatedText?: string
  error?: string
  errorCode?: string
}

function invalid(error: string): LightweightTranslateResult {
  return { success: false, error, errorCode: 'INVALID_INPUT' }
}

/**
 * Lightweight translation — dùng cho global hotkey và browser extension.
 * Hỗ trợ translationStyle để phù hợp với màn hình AI Dịch.
 *
 * The params may come straight from an HTTP body (browser extension), so every field is validated
 * here rather than trusted.
 */
export async function lightweightTranslate(params: LightweightTranslateParams): Promise<LightweightTranslateResult> {
  const input = (typeof params === 'object' && params !== null ? params : {}) as Record<string, unknown>
  const { text, targetLang } = input
  const provider = input.provider ?? 'gemini'
  const translationStyle = input.translationStyle ?? 'general'

  if (typeof text !== 'string' || !text.trim()) return invalid('Text is empty')
  if (text.length > MAX_LIGHTWEIGHT_TRANSLATE_CHARS) {
    return {
      success: false,
      error: `Text exceeds maximum length (${MAX_LIGHTWEIGHT_TRANSLATE_CHARS} characters)`,
      errorCode: 'PAYLOAD_TOO_LARGE',
    }
  }
  if (!isSafeTargetLanguageCode(targetLang)) return invalid('Invalid target language')
  if (typeof provider !== 'string' || !isValidProvider(provider)) return invalid(`Unknown provider: ${String(provider).slice(0, 40)}`)
  if (typeof translationStyle !== 'string' || !hasOwnKey(STYLE_TONE, translationStyle)) return invalid('Invalid translation style')
  if (input.model !== undefined && (typeof input.model !== 'string' || input.model.length > MAX_MODEL_ID_CHARS)) {
    return invalid('Invalid model')
  }

  // An empty model means "use the provider default".
  const resolvedModel = (typeof input.model === 'string' && input.model.trim() ? input.model.trim() : undefined) ?? (
    provider === 'gemini' ? EXT_DEFAULT_GEMINI_MODEL
    : provider === 'openai' ? EXT_DEFAULT_OPENAI_MODEL
    : provider === 'local' ? 'local-auto'
    : EXT_DEFAULT_CLAUDE_MODEL
  )

  const apiKey = isLocalProvider(provider) ? LOCAL_AI_PLACEHOLDER_KEY : await getStoredApiKey(provider)
  if (!apiKey) return { success: false, error: `No API key configured for ${provider}`, errorCode: 'NO_API_KEY' }

  const tone = getStyleTone(translationStyle, targetLang)
  const prompt = `Translate into ${targetLang}. Tone: ${tone}. Output only the translation.\n\n${text}`

  try {
    const translatedText = await runWithTimeout(
      (signal) => callProvider(provider, apiKey, resolvedModel, prompt, signal, getLightweightMaxOutputTokens(text.length)),
      getLightweightTranslateTimeoutMs(provider, text.length),
      'lightweight translation',
    )
    return { success: true, translatedText }
  } catch (e) {
    // Log only the message on the server (SDK error objects can carry request URLs/headers).
    // Do not propagate stack-trace or low-level SDK error details back to the caller — they
    // can travel through the local HTTP server to browser extension/web
    // pages and may leak implementation details (CWE-209/497).
    console.error('[lightweightTranslate] Translation failed:', e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200))
    const classified = classifyProviderError(e)
    // Classified errors carry a fixed, user-facing message; anything else stays generic.
    return classified.errorCode
      ? { success: false, error: classified.error, errorCode: classified.errorCode }
      : { success: false, error: 'Translation failed' }
  }
}

async function callProvider(
  provider: string,
  apiKey: string,
  model: string,
  prompt: string,
  signal: AbortSignal,
  maxOutputTokens: number,
): Promise<string> {
  // These clients keep the SDK's default connection retries: unlike the main translate path there is no
  // withRetry layer around lightweight translation, so they are the only retry layer.
  if (provider === 'gemini') {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(apiKey)
    const genModel = genAI.getGenerativeModel({
      model,
      systemInstruction: LIGHTWEIGHT_TRANSLATOR_PROMPT,
      generationConfig: { maxOutputTokens: getGeminiMaxOutputTokens(model) },
    })
    const result = await genModel.generateContent(prompt, { signal })
    const finishReason = result.response.candidates?.[0]?.finishReason
    if (finishReason === 'MAX_TOKENS') throw truncatedOutputError('gemini')
    if (finishReason && ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'].includes(finishReason)) {
      throw blockedSafetyError('gemini', `finishReason=${finishReason}`)
    }
    const out = result.response.text().trim()
    if (!out) throw emptyResponseError('gemini')
    return out
  }
  if (provider === 'openai') {
    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey })
    const completion = await client.chat.completions.create(
      {
        model,
        messages: [{ role: 'system', content: LIGHTWEIGHT_TRANSLATOR_PROMPT }, { role: 'user', content: prompt }],
        max_completion_tokens: clampMaxOutputTokens('openai', model, maxOutputTokens),
      },
      { signal },
    )
    return openAiText('openai', completion.choices[0])
  }
  if (provider === 'local') {
    const OpenAI = (await import('openai')).default
    const local = await resolveLocalAiRequestModel(model)
    const client = new OpenAI({ apiKey: LOCAL_AI_PLACEHOLDER_KEY, baseURL: local.baseURL })
    const completion = await client.chat.completions.create(
      {
        model: local.model,
        messages: [{ role: 'system', content: LIGHTWEIGHT_TRANSLATOR_PROMPT }, { role: 'user', content: prompt }],
        max_tokens: maxOutputTokens,
      },
      { signal },
    )
    return openAiText('local', completion.choices[0])
  }
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create(
    {
      model,
      max_tokens: clampMaxOutputTokens('claude', model, maxOutputTokens),
      system: LIGHTWEIGHT_TRANSLATOR_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    },
    { signal },
  )
  if (msg.stop_reason === 'refusal') throw blockedSafetyError('claude', 'stop_reason=refusal')
  if (msg.stop_reason === 'max_tokens') throw truncatedOutputError('claude')
  const out = joinClaudeText(msg.content).trim()
  if (!out) throw emptyResponseError('claude')
  return out
}

function openAiText(
  provider: string,
  choice: { finish_reason?: string | null; message?: { content?: string | null; refusal?: string | null } } | undefined,
): string {
  if (choice?.finish_reason === 'content_filter' || choice?.message?.refusal?.trim()) {
    throw blockedSafetyError(provider, choice.finish_reason === 'content_filter' ? 'finish_reason=content_filter' : 'refusal')
  }
  if (choice?.finish_reason === 'length') throw truncatedOutputError(provider)
  const out = (choice?.message?.content ?? '').trim()
  if (!out) throw emptyResponseError(provider)
  return out
}

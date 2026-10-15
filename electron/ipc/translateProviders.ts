import { getTranslateTimeoutMs } from './ipcConstants'
import { runWithTimeout } from './translateChunking'
import { buildPrompt } from './translatePrompts'
import { detectWithClaude, rewriteWithClaude, streamWithClaude, translateWithClaude, verifyClaudeKey } from './translateProviderClaude'
import { detectWithGemini, rewriteWithGemini, streamWithGemini, translateWithGemini, verifyGeminiKey } from './translateProviderGemini'
import { detectWithLocal, rewriteWithLocal, streamWithLocal, translateWithLocal, verifyLocalRuntime } from './translateProviderLocal'
import { detectWithOpenAI, rewriteWithOpenAI, streamWithOpenAI, translateWithOpenAI, verifyOpenAIKey } from './translateProviderOpenAI'
import type { DetectFn, RewriteFn, StreamFn, TranslateFn, TranslateRequestOptions, VerifyFn } from './translateProviderTypes'
import type { TranslationStyle } from './translateValidation'

export const TRANSLATE_PROVIDERS: Record<string, TranslateFn> = {
  gemini: translateWithGemini,
  claude: translateWithClaude,
  openai: translateWithOpenAI,
  local: translateWithLocal,
}

export const REWRITE_PROVIDERS: Record<string, RewriteFn> = {
  gemini: rewriteWithGemini,
  claude: rewriteWithClaude,
  openai: rewriteWithOpenAI,
  local: rewriteWithLocal,
}

export const DETECT_PROVIDERS: Record<string, DetectFn> = {
  gemini: detectWithGemini,
  claude: detectWithClaude,
  openai: detectWithOpenAI,
  local: detectWithLocal,
}

export const VERIFY_PROVIDERS: Record<string, VerifyFn> = {
  gemini: verifyGeminiKey,
  claude: verifyClaudeKey,
  openai: verifyOpenAIKey,
  local: verifyLocalRuntime,
}

const STREAM_PROVIDERS: Record<string, StreamFn> = {
  openai: streamWithOpenAI,
  gemini: streamWithGemini,
  claude: streamWithClaude,
  local: streamWithLocal,
}

export interface StreamTranslationOptions extends TranslateRequestOptions {
  /** Overall deadline in ms. Default: scaled by provider and input size (`getTranslateTimeoutMs`). */
  timeoutMs?: number
}

/**
 * Stream a translation token by token. Resolves with the full text.
 *
 * Optional `options.signal` cancels the request; the stream is also aborted after `timeoutMs`.
 * Like the non-streaming path, an empty answer (EMPTY_RESPONSE), a cut-off answer (OUTPUT_TRUNCATED)
 * or a safety block (BLOCKED_SAFETY) rejects with a structured error after the tokens already emitted.
 */
export async function streamTranslation(
  provider: string,
  apiKey: string,
  model: string,
  sourceText: string,
  sourceLang: string,
  targetLang: string,
  style: TranslationStyle = 'general',
  onToken: (token: string) => void,
  options: StreamTranslationOptions = {},
): Promise<string> {
  const prompt = buildPrompt(sourceText, sourceLang, targetLang, false, style, false)
  const timeoutMs = options.timeoutMs ?? getTranslateTimeoutMs(provider, sourceText.length)

  const streamFn = STREAM_PROVIDERS[provider]
  if (!streamFn) {
    return runWithTimeout(async (signal) => {
      const fullText = await translateWithOpenAI(apiKey, model, sourceText, sourceLang, targetLang, false, style, false, 'off', 'auto', { signal })
      onToken(fullText)
      return fullText
    }, timeoutMs, 'stream translation', options.signal)
  }

  return runWithTimeout((signal) => streamFn(apiKey, model, prompt, onToken, { signal }), timeoutMs, 'stream translation', options.signal)
}

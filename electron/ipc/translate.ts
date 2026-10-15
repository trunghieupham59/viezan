import type { IpcMain } from 'electron'
import { classifyProviderError, getErrorStatus, getStatusFromMessage, noApiKeyResponse } from './errorUtils'
import { DETECT_LANG_MAX_CHARS, getTranslateTimeoutMs, TRANSLATE_AUX_TIMEOUT_MS } from './ipcConstants'
import { invalidIpcInput, isNonEmptyString, isRecord } from './ipcValidation'
import { isLocalProvider, LOCAL_AI_PLACEHOLDER_KEY } from './localAi'
import { isAbortError } from './providers/chatProviderTypes'
import { isValidProvider, unknownProviderError } from './providers/types'
import { withRetry } from './retry'
import { getStoredApiKey } from './storage'
import { CHUNK_CHAR_LIMIT, promisePool, runWithTimeout, splitIntoChunks, translateChunked, withTimeout } from './translateChunking'
import { normalizeDetectedLang } from './translateLanguage'
import { buildDetectLanguagePrompt, buildPrompt, buildRewritePrompt } from './translatePrompts'
import {
  DETECT_PROVIDERS,
  REWRITE_PROVIDERS,
  streamTranslation,
  TRANSLATE_PROVIDERS,
  VERIFY_PROVIDERS,
} from './translateProviders'
import {
  type PhoneticMode,
  parseDetectLanguageParams,
  parseRewriteParams,
  parseTranslateParams,
} from './translateValidation'

export {
  buildPrompt,
  buildRewritePrompt,
  normalizeDetectedLang,
  promisePool,
  splitIntoChunks,
  streamTranslation,
  withTimeout,
}

function getProviderCredential(provider: string) {
  return isLocalProvider(provider) ? LOCAL_AI_PLACEHOLDER_KEY : getStoredApiKey(provider)
}

const TRANSLATE_CANCELLED_MESSAGE = 'translate-cancelled'

function isOutputTruncated(error: unknown): boolean {
  return (error as { errorCode?: string } | null)?.errorCode === 'OUTPUT_TRUNCATED'
}

/** Chunk size that splits a `length`-char text into (at least) two pieces. */
function halfChunkLimit(length: number): number {
  return Math.max(1, Math.ceil(length / 2))
}
const MAX_API_KEY_CHARS = 2_048

/** Abort-like error that is a real cancellation, not a dropped connection (ECONNRESET). */
function isUserAbort(error: unknown): boolean {
  return isAbortError(error) && (error as { code?: string }).code !== 'ECONNRESET'
}
const activeTranslateControllers = new Map<string, AbortController>()

export function registerTranslateHandlers(ipcMain: IpcMain) {
  ipcMain.handle('translate:cancel', async (_event, rawParams: unknown) => {
    if (!isRecord(rawParams) || !isNonEmptyString(rawParams.requestId)) {
      return { success: false, error: 'INVALID_INPUT' }
    }
    const controller = activeTranslateControllers.get(rawParams.requestId)
    if (!controller) return { success: false, error: 'NOT_FOUND' }
    controller.abort()
    activeTranslateControllers.delete(rawParams.requestId)
    return { success: true }
  })

  ipcMain.handle('translate:verify', async (_event, rawProvider: unknown, rawApiKey: unknown) => {
    if (typeof rawProvider !== 'string' || !rawProvider.trim()) return invalidIpcInput('Provider is required')
    const provider = rawProvider.trim()
    const local = isLocalProvider(provider)
    if (!local) {
      if (typeof rawApiKey !== 'string') return invalidIpcInput('API key must be a string')
      if (!rawApiKey.trim()) return { success: false, error: 'API key is empty' }
      if (rawApiKey.length > MAX_API_KEY_CHARS) return invalidIpcInput('API key is too long')
    }
    if (!isValidProvider(provider)) return unknownProviderError(provider)

    try {
      const verifyFn = VERIFY_PROVIDERS[provider]
      if (!verifyFn) return unknownProviderError(provider)
      const apiKey = local ? LOCAL_AI_PLACEHOLDER_KEY : (rawApiKey as string).trim()
      await runWithTimeout((signal) => verifyFn(apiKey, { signal }), TRANSLATE_AUX_TIMEOUT_MS, 'verify key')
      return { success: true }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      const status = getErrorStatus(error) ?? getStatusFromMessage(msg)
      const classified = classifyProviderError(error)
      if (status === 401) {
        return { success: false, error: 'Invalid API key', errorCode: 'INVALID_KEY' }
      }
      if (status === 402) {
        return {
          success: false,
          error: 'The API key is valid, but provider billing requires attention.',
          errorCode: 'BILLING',
          valid: true,
        }
      }
      if (status === 403) {
        return {
          success: false,
          error: 'The API key is valid, but it does not have permission to access this resource.',
          errorCode: 'PERMISSION',
          valid: true,
        }
      }
      if (status === 429) {
        return { success: false, error: 'Rate limit hit, but key is valid!', errorCode: 'RATE_LIMIT', valid: true }
      }
      // Some providers report invalid keys or rate limits through a nonstandard
      // status/body combination, so retain the shared text-based fallback after
      // the authoritative HTTP statuses above have been handled.
      if (classified.errorCode === 'INVALID_KEY') {
        return { success: false, error: 'Invalid API key', errorCode: 'INVALID_KEY' }
      }
      if (classified.errorCode === 'RATE_LIMIT') {
        return { success: false, error: 'Rate limit hit, but key is valid!', errorCode: 'RATE_LIMIT', valid: true }
      }
      if (classified.errorCode === 'NETWORK' || msg.toLowerCase().includes('network')) {
        return { success: false, error: 'No internet connection', errorCode: 'NETWORK' }
      }
      if (classified.errorCode) return classified
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('translate', async (_event, rawParams: unknown) => {
    const parsed = parseTranslateParams(rawParams)
    if (!parsed.ok) return parsed.response
    const params = parsed.value
    const { provider, model, requestId, sourceText, sourceLang, targetLang, showFurigana, translationStyle, reasoningEffort, phoneticOnly, phoneticMode } = params
    const effectivePhoneticMode: PhoneticMode = phoneticMode ?? (showFurigana ? 'standard' : 'off')

    if (!sourceText.trim()) return { success: false, error: 'Source text is empty' }
    if (!model?.trim()) return { success: false, error: 'Model is required' }

    const apiKey = getProviderCredential(provider)
    if (!apiKey) return noApiKeyResponse(provider)

    let controller: AbortController | null = null
    try {
      const translateFn = TRANSLATE_PROVIDERS[provider]
      if (!translateFn) return unknownProviderError(provider)

      controller = requestId ? new AbortController() : null
      if (requestId && controller) activeTranslateControllers.set(requestId, controller)
      const parentSignal = controller?.signal
      const callProvider = (text: string, signal: AbortSignal | undefined, phoneticOnlyCall: boolean) =>
        translateFn(apiKey, model, text, sourceLang, targetLang, !!showFurigana, translationStyle ?? 'general', phoneticOnlyCall, effectivePhoneticMode, reasoningEffort ?? 'auto', signal ? { signal } : undefined)
      const needsChunking = !phoneticOnly && sourceText.length > CHUNK_CHAR_LIMIT
      try {
        const chunkOptions = {
          signal: parentSignal,
          getTimeoutMs: (text: string) => getTranslateTimeoutMs(provider, text.length, reasoningEffort),
        }
        const runChunked = (limit: number) =>
          translateChunked((text, signal) => callProvider(text, signal, false), sourceText, limit, chunkOptions)
        let translatedText: string
        if (needsChunking) {
          translatedText = await runChunked(CHUNK_CHAR_LIMIT)
        } else {
          try {
            translatedText = await withRetry(
              () => runWithTimeout(
                (signal) => callProvider(sourceText, signal, !!phoneticOnly),
                getTranslateTimeoutMs(provider, sourceText.length, reasoningEffort),
                'translation',
                parentSignal,
              ),
              { signal: parentSignal },
            )
          } catch (error) {
            // The output hit the provider's ceiling: translate the same text in smaller pieces instead of failing.
            if (!isOutputTruncated(error) || phoneticOnly) throw error
            translatedText = await runChunked(halfChunkLimit(sourceText.length))
          }
        }

        return { success: true, translatedText }
      } finally {
        if (requestId && activeTranslateControllers.get(requestId) === controller) {
          activeTranslateControllers.delete(requestId)
        }
      }
    } catch (error: unknown) {
      if (controller?.signal.aborted || isUserAbort(error)) {
        return { success: false, error: TRANSLATE_CANCELLED_MESSAGE, errorCode: 'CANCELLED' }
      }
      const msg = error instanceof Error ? error.message : String(error)
      // Log only the message — full error objects may include request URLs/headers containing API keys.
      console.error(`Translation error with ${provider}: ${msg.slice(0, 200)}`)
      const classified = classifyProviderError(error)
      return { ...classified, error: classified.errorCode ? classified.error : `Translation failed: ${msg}` }
    }
  })

  ipcMain.handle('translate:rewrite', async (_event, rawParams: unknown) => {
    const parsed = parseRewriteParams(rawParams)
    if (!parsed.ok) return parsed.response
    const { provider, model, text, lang, translationStyle } = parsed.value

    if (!text.trim()) return { success: false, error: 'Text is empty' }
    if (!model?.trim()) return { success: false, error: 'Model is required' }

    const apiKey = getProviderCredential(provider)
    if (!apiKey) return noApiKeyResponse(provider)

    try {
      const rewriteFn = REWRITE_PROVIDERS[provider]
      if (!rewriteFn) return unknownProviderError(provider)

      const callProvider = (input: string, signal: AbortSignal | undefined) =>
        rewriteFn(apiKey, model, input, lang, translationStyle, signal ? { signal } : undefined)
      const chunkOptions = {
        mode: 'rewrite' as const,
        getTimeoutMs: (input: string) => getTranslateTimeoutMs(provider, input.length),
      }
      let rewrittenText: string
      if (text.length > CHUNK_CHAR_LIMIT) {
        rewrittenText = await translateChunked(callProvider, text, CHUNK_CHAR_LIMIT, chunkOptions)
      } else {
        try {
          rewrittenText = await withRetry(() => runWithTimeout(
            (signal) => callProvider(text, signal),
            getTranslateTimeoutMs(provider, text.length),
            'rewrite',
          ))
        } catch (error) {
          if (!isOutputTruncated(error)) throw error
          rewrittenText = await translateChunked(callProvider, text, halfChunkLimit(text.length), chunkOptions)
        }
      }

      return { success: true, translatedText: rewrittenText }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`Rewrite error with ${provider}: ${msg.slice(0, 200)}`)
      const classified = classifyProviderError(error)
      return { ...classified, error: classified.errorCode ? classified.error : `Rewrite failed: ${msg}` }
    }
  })

  ipcMain.handle('translate:detect-lang', async (_event, rawParams: unknown) => {
    const parsed = parseDetectLanguageParams(rawParams)
    if (!parsed.ok) return parsed.response
    const { provider, model, text } = parsed.value
    if (!text.trim()) return { success: false, error: 'Text is empty' }

    const apiKey = getProviderCredential(provider)
    if (!apiKey) return noApiKeyResponse(provider)

    const snippet = text.slice(0, DETECT_LANG_MAX_CHARS)
    const prompt = buildDetectLanguagePrompt(snippet)

    try {
      const detectFn = DETECT_PROVIDERS[provider]
      if (!detectFn) return unknownProviderError(provider)

      const raw = await runWithTimeout(
        (signal) => detectFn(apiKey, model, prompt, { signal }),
        TRANSLATE_AUX_TIMEOUT_MS,
        'language detection',
      )

      const lang = normalizeDetectedLang(raw)
      if (!lang) return { success: false, error: `Unrecognized language code: "${raw}"` }

      return { success: true, lang }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`Language detection error with ${provider}: ${msg.slice(0, 200)}`)
      const classified = classifyProviderError(error)
      return { ...classified, error: classified.errorCode ? classified.error : `Language detection failed: ${msg}` }
    }
  })
}

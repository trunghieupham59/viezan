import { MAX_TRANSLATE_SOURCE_CHARS } from './ipcConstants'
import { invalidIpcInput, isNonEmptyString, isOptionalBoolean, isRecord, isSafeLanguageCode, isSafeTargetLanguageCode } from './ipcValidation'
import { isValidProvider, unknownProviderError } from './providers/types'

export type TranslationStyle = 'general' | 'formal' | 'casual' | 'business' | 'technical' | 'natural'
export type PhoneticMode = 'off' | 'standard' | 'phonetic'
export type TranslationReasoningEffort = 'auto' | 'low' | 'medium' | 'high'

export interface TranslateParams {
  provider: string
  model: string
  requestId?: string
  sourceText: string
  sourceLang: string
  targetLang: string
  showFurigana?: boolean
  phoneticMode?: PhoneticMode
  translationStyle?: TranslationStyle
  reasoningEffort?: TranslationReasoningEffort
  phoneticOnly?: boolean
}

export interface RewriteParams {
  provider: string
  model: string
  text: string
  lang: string
  translationStyle?: TranslationStyle
}

export type ParsedParams<T> =
  | { ok: true; value: T }
  | { ok: false; response: { success: false; error: string; errorCode?: string } }

const TRANSLATION_STYLES = new Set<TranslationStyle>([
  'general',
  'formal',
  'casual',
  'business',
  'technical',
  'natural',
])

const PHONETIC_MODES = new Set<PhoneticMode>(['off', 'standard', 'phonetic'])
const REASONING_EFFORTS = new Set<TranslationReasoningEffort>(['auto', 'low', 'medium', 'high'])
const MAX_MODEL_ID_CHARS = 200
/** Sentinel the renderer sends to rewrite text in its own language when the source language is 'auto'. */
const REWRITE_SAME_LANGUAGE = 'the same language as the input text'

function parseProvider(value: unknown): ParsedParams<string> {
  if (!isNonEmptyString(value)) {
    return { ok: false, response: invalidIpcInput('Provider is required') }
  }
  const provider = value.trim()
  if (!isValidProvider(provider)) {
    return { ok: false, response: unknownProviderError(provider) }
  }
  return { ok: true, value: provider }
}

function parseModel(value: unknown): ParsedParams<string> {
  if (!isNonEmptyString(value)) {
    return { ok: false, response: invalidIpcInput('Model is required') }
  }
  const model = value.trim()
  if (model.length > MAX_MODEL_ID_CHARS) {
    return { ok: false, response: invalidIpcInput('Model is too long') }
  }
  return { ok: true, value: model }
}

function parseTranslationStyle(value: unknown): ParsedParams<TranslationStyle | undefined> {
  if (value === undefined) return { ok: true, value: undefined }
  if (typeof value !== 'string' || !TRANSLATION_STYLES.has(value as TranslationStyle)) {
    return { ok: false, response: invalidIpcInput('Invalid translation style') }
  }
  return { ok: true, value: value as TranslationStyle }
}

export function parseTranslateParams(rawParams: unknown): ParsedParams<TranslateParams> {
  if (!isRecord(rawParams)) {
    return { ok: false, response: invalidIpcInput('Translate payload must be an object') }
  }

  const provider = parseProvider(rawParams.provider)
  if (!provider.ok) return provider
  const model = parseModel(rawParams.model)
  if (!model.ok) return model
  if (typeof rawParams.sourceText !== 'string') {
    return { ok: false, response: invalidIpcInput('Source text is required') }
  }
  if (rawParams.sourceText.length > MAX_TRANSLATE_SOURCE_CHARS) {
    return {
      ok: false,
      response: {
        success: false,
        error: `Source text exceeds maximum length (${MAX_TRANSLATE_SOURCE_CHARS} characters)`,
        errorCode: 'PAYLOAD_TOO_LARGE',
      },
    }
  }
  if (rawParams.requestId !== undefined && !isNonEmptyString(rawParams.requestId)) {
    return { ok: false, response: invalidIpcInput('Invalid request id') }
  }
  if (!isSafeLanguageCode(rawParams.sourceLang)) {
    return { ok: false, response: invalidIpcInput('Invalid source language') }
  }
  if (!isSafeTargetLanguageCode(rawParams.targetLang)) {
    return { ok: false, response: invalidIpcInput('Invalid target language') }
  }
  if (!isOptionalBoolean(rawParams.showFurigana) || !isOptionalBoolean(rawParams.phoneticOnly)) {
    return { ok: false, response: invalidIpcInput('Invalid boolean option') }
  }
  if (rawParams.phoneticMode !== undefined && (typeof rawParams.phoneticMode !== 'string' || !PHONETIC_MODES.has(rawParams.phoneticMode as PhoneticMode))) {
    return { ok: false, response: invalidIpcInput('Invalid phonetic mode') }
  }
  const translationStyle = parseTranslationStyle(rawParams.translationStyle)
  if (!translationStyle.ok) return translationStyle
  if (
    rawParams.reasoningEffort !== undefined
    && (
      typeof rawParams.reasoningEffort !== 'string'
      || !REASONING_EFFORTS.has(rawParams.reasoningEffort as TranslationReasoningEffort)
    )
  ) {
    return { ok: false, response: invalidIpcInput('Invalid reasoning effort') }
  }

  return {
    ok: true,
    value: {
      provider: provider.value,
      model: model.value,
      requestId: typeof rawParams.requestId === 'string' ? rawParams.requestId : undefined,
      sourceText: rawParams.sourceText,
      sourceLang: rawParams.sourceLang,
      targetLang: rawParams.targetLang,
      showFurigana: rawParams.showFurigana,
      phoneticMode: rawParams.phoneticMode as PhoneticMode | undefined,
      translationStyle: translationStyle.value,
      reasoningEffort: rawParams.reasoningEffort as TranslationReasoningEffort | undefined,
      phoneticOnly: rawParams.phoneticOnly,
    },
  }
}

export function parseRewriteParams(rawParams: unknown): ParsedParams<RewriteParams> {
  if (!isRecord(rawParams)) {
    return { ok: false, response: invalidIpcInput('Rewrite payload must be an object') }
  }

  const provider = parseProvider(rawParams.provider)
  if (!provider.ok) return provider
  const model = parseModel(rawParams.model)
  if (!model.ok) return model
  if (typeof rawParams.text !== 'string') {
    return { ok: false, response: invalidIpcInput('Text is required') }
  }
  if (rawParams.text.length > MAX_TRANSLATE_SOURCE_CHARS) {
    return {
      ok: false,
      response: {
        success: false,
        error: `Text exceeds maximum length (${MAX_TRANSLATE_SOURCE_CHARS} characters)`,
        errorCode: 'PAYLOAD_TOO_LARGE',
      },
    }
  }
  if (typeof rawParams.lang !== 'string' || (!isSafeTargetLanguageCode(rawParams.lang) && rawParams.lang !== REWRITE_SAME_LANGUAGE)) {
    return { ok: false, response: invalidIpcInput('Invalid language') }
  }
  const translationStyle = parseTranslationStyle(rawParams.translationStyle)
  if (!translationStyle.ok) return translationStyle

  return {
    ok: true,
    value: {
      provider: provider.value,
      model: model.value,
      text: rawParams.text,
      lang: rawParams.lang,
      translationStyle: translationStyle.value,
    },
  }
}

export function parseDetectLanguageParams(rawParams: unknown): ParsedParams<{ provider: string; model: string; text: string; requestId?: string }> {
  if (!isRecord(rawParams)) {
    return { ok: false, response: invalidIpcInput('Detect language payload must be an object') }
  }

  const provider = parseProvider(rawParams.provider)
  if (!provider.ok) return provider
  const model = parseModel(rawParams.model)
  if (!model.ok) return model
  if (typeof rawParams.text !== 'string') {
    return { ok: false, response: invalidIpcInput('Text is required') }
  }
  if (rawParams.requestId !== undefined && !isNonEmptyString(rawParams.requestId)) {
    return { ok: false, response: invalidIpcInput('Invalid request id') }
  }

  return {
    ok: true,
    value: {
      provider: provider.value,
      model: model.value,
      text: rawParams.text,
      requestId: typeof rawParams.requestId === 'string' ? rawParams.requestId : undefined,
    },
  }
}

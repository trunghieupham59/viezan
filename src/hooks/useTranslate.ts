/**
 * useTranslate — encapsulates all business logic for the Translate page.
 *
 * Extracted from TranslatePage to separate concerns:
 *  - Text & image translation (including streaming phonetic pass)
 *  - Image attachment management (file pick, paste, drag-drop)
 *  - Auto-translate debounce + re-translate on lang/model/style change
 *  - Background language detection for swap button
 *  - Rewrite and copy actions
 *  - TTS and voice input integration
 *
 * TranslatePage composes the presentation layer and routes these handlers.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ImageAttachment } from '../components/translate/ImageTranslator'
import type { VoiceRecordingState } from '../components/VoiceRecorder'
import { MAX_TRANSLATE_IMAGE_DIMENSION } from '../constants/image'
import { DETECT_LANG_MAX_CHARS } from '../constants/providers'
import { COPY_FEEDBACK_DURATION_MS, IMAGE_AUTO_TRANSLATE_DELAY_MS } from '../constants/ui'
import { translationService } from '../services/translationService'
import { useAppStore, useT } from '../store/useAppStore'
import type {
  HistoryItem,
  ImageTextRegion,
  PhoneticMode,
  TranslationComparisonResult,
  TranslationModelSelection,
  TranslationStyle,
} from '../types'
import { renderTranslatedRegions } from '../utils/canvas'
import { localizeChatError, localizeChatException } from '../utils/chatErrors'
import { createClientId } from '../utils/id'
import { extractImageFromClipboard, resizeImageFile } from '../utils/imageUtils'
import { estimateUsageCost } from '../utils/usageCost'
import { useTTS } from './useTTS'
import { useVoiceInput } from './useVoiceInput'

/**
 * Sentinel value set on translatedText when a Gemini image-edit result is shown.
 * Non-empty so action buttons conditionally appear, but those buttons check
 * `editedImageUrl` first — so the user cannot actually copy or speak this value.
 */
export const IMAGE_TRANSLATED_SENTINEL = '✓'

const AUTO_HISTORY_IDLE_MS = 60_000

type TranslateTrigger = 'manual' | 'auto'

interface AutoHistoryDraft {
  id: string
  contextKey: string
  sourceText: string
  timestamp: number
}

interface TranslationResultContext {
  sourceText: string
  imageAttachment: ImageAttachment | null
  sourceLang: string
  targetLang: string
  modelsKey: string
  translationStyle: string
  reasoningEffort: string
}

function translationModelKey({ provider, model }: TranslationModelSelection) {
  return `${provider}:${model}`
}

function normalizeComparisonErrorCode(
  errorCode: string | null | undefined,
  error: string | null | undefined,
) {
  const normalizedCode = errorCode?.trim().toUpperCase()
  if (normalizedCode === 'NO_API_KEY'
    || normalizedCode === 'INVALID_KEY'
    || normalizedCode === 'RATE_LIMIT'
    || normalizedCode === 'NETWORK') return normalizedCode
  if (normalizedCode?.includes('MODEL')
    && (normalizedCode.includes('NOT_FOUND') || normalizedCode.includes('UNAVAILABLE'))) {
    return 'MODEL_UNAVAILABLE'
  }

  const normalizedError = error?.trim().toLowerCase() ?? ''
  if (normalizedError.includes('api key') && normalizedError.includes('missing')) return 'NO_API_KEY'
  if (normalizedError.includes('api key') && (
    normalizedError.includes('invalid')
    || normalizedError.includes('unauthorized')
    || normalizedError.includes('401')
  )) return 'INVALID_KEY'
  if (normalizedError.includes('429')
    || normalizedError.includes('rate limit')
    || normalizedError.includes('quota')) return 'RATE_LIMIT'
  if (normalizedError.includes('network')
    || normalizedError.includes('enotfound')
    || normalizedError.includes('econn')
    || normalizedError.includes('fetch failed')) return 'NETWORK'
  const modelUnavailable = normalizedError.includes('model') && (
    normalizedError.includes('404')
    || normalizedError.includes('not found')
    || normalizedError.includes('not_found')
    || normalizedError.includes('unavailable')
    || normalizedError.includes('does not exist')
  )
  if (modelUnavailable) return 'MODEL_UNAVAILABLE'
  if (normalizedCode && [
    'TIMEOUT',
    'EMPTY_RESPONSE',
    'BLOCKED_CONTENT',
    'BLOCKED_SAFETY',
    'BLOCKED_RECITATION',
    'OUTPUT_TRUNCATED',
    'INVALID_RESPONSE',
    'CANCELLED',
  ].includes(normalizedCode)) return normalizedCode
  return 'UNKNOWN'
}

function createComparisonResult(
  selection: TranslationModelSelection,
  status: TranslationComparisonResult['status'] = 'idle',
): TranslationComparisonResult {
  return {
    ...selection,
    key: translationModelKey(selection),
    status,
    translatedText: '',
    error: null,
    errorCode: null,
    durationMs: null,
  }
}

interface ComparisonHistoryInput {
  id: string
  timestamp: number
  sourceText: string
  sourceLang: string
  targetLang: string
  translationStyle: TranslationStyle
  /** Successful results of the run, in model order. */
  results: TranslationComparisonResult[]
  /** The result the user picked, if any; `null` keeps the first result as representative. */
  picked: Pick<TranslationComparisonResult, 'key' | 'provider' | 'model' | 'translatedText'> | null
}

/**
 * One comparison run is one history entry that keeps every successful model
 * result, so it can be reopened with all of its models. The top-level fields
 * carry the representative translation: the picked one, else the first result.
 */
function buildComparisonHistoryItem(input: ComparisonHistoryInput): HistoryItem | null {
  const { results, picked } = input
  const representative = picked ?? results[0]
  if (!representative) return null
  const estimate = (selection: TranslationModelSelection, outputText: string) => estimateUsageCost({
    feature: 'translate',
    provider: selection.provider,
    model: selection.model,
    inputText: input.sourceText,
    outputText,
  })
  return {
    id: input.id,
    timestamp: input.timestamp,
    provider: representative.provider,
    model: representative.model,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    translationStyle: input.translationStyle,
    sourceText: input.sourceText,
    translatedText: representative.translatedText,
    cost: estimate(representative, representative.translatedText),
    results: results.map((result) => ({
      provider: result.provider,
      model: result.model,
      translatedText: result.translatedText,
      durationMs: result.durationMs,
      cost: estimate(result, result.translatedText),
    })),
    ...(picked ? { selectedKey: picked.key } : {}),
  }
}

function isSameResultContext(
  previous: TranslationResultContext,
  current: TranslationResultContext,
) {
  return previous.sourceText === current.sourceText
    && previous.imageAttachment === current.imageAttachment
    && previous.sourceLang === current.sourceLang
    && previous.targetLang === current.targetLang
    && previous.modelsKey === current.modelsKey
    && previous.translationStyle === current.translationStyle
    && previous.reasoningEffort === current.reasoningEffort
}

function localizeTranslationError(
  t: ReturnType<typeof useT>,
  error: string | undefined,
  errorCode: string | undefined,
  fallback: string,
) {
  if (errorCode === 'NO_API_KEY') return t.translate_error_no_key
  if (errorCode === 'OUTPUT_TRUNCATED') return t.translate_error_output_truncated
  if (errorCode === 'INVALID_RESPONSE') return t.translate_error_invalid_response
  const localized = localizeChatError(t, { error, errorCode }, fallback)
  if (localized === t.chat_error_empty_response) return t.translate_error_empty_response
  if (localized === t.chat_error_blocked_recitation) return t.translate_error_blocked_recitation
  if (localized === t.chat_error_blocked_safety) return t.translate_error_blocked_safety
  return error && localized === error ? fallback : localized
}

function localizeTranslationException(
  t: ReturnType<typeof useT>,
  error: unknown,
  fallback: string,
) {
  const rawMessage = error instanceof Error ? error.message : String(error ?? '')
  const localized = localizeChatException(t, error, fallback)
  if (localized === t.chat_error_blocked_recitation) return t.translate_error_blocked_recitation
  if (localized === t.chat_error_blocked_safety) return t.translate_error_blocked_safety
  return rawMessage && localized === rawMessage ? fallback : localized
}

function createHistoryId(timestamp = Date.now()) {
  return createClientId('history', timestamp)
}

function getCommonPrefixLength(a: string, b: string) {
  let index = 0
  while (index < a.length && index < b.length && a[index] === b[index]) index++
  return index
}

function isLikelySameSourceDraft(previousText: string, nextText: string) {
  const previous = previousText.trim()
  const next = nextText.trim()
  if (!previous || !next) return false
  if (previous === next || previous.startsWith(next) || next.startsWith(previous)) return true

  const shorterLength = Math.min(previous.length, next.length)
  if (shorterLength < 12) return false

  return getCommonPrefixLength(previous, next) / shorterLength >= 0.6
}

function buildHistoryContextKey(
  provider: string,
  model: string,
  sourceLang: string,
  targetLang: string,
  style: string
) {
  return `${provider}|${model}|${sourceLang}|${targetLang}|${style}`
}

function shouldReuseAutoHistoryDraft(
  draft: AutoHistoryDraft,
  nextSourceText: string,
  nextContextKey: string,
  timestamp: number
) {
  if (timestamp - draft.timestamp > AUTO_HISTORY_IDLE_MS) return false
  if (draft.sourceText.trim() === nextSourceText.trim()) return true
  if (draft.contextKey !== nextContextKey) return false
  return isLikelySameSourceDraft(draft.sourceText, nextSourceText)
}

export function useTranslate() {
  const {
    sourceText, translatedText, phoneticText, sourceLang, targetLang,
    isTranslating, translateError, translateErrorCode,
    selectedProvider: legacySelectedProvider,
    selectedModels: legacySelectedModels,
    translationModels,
    autoTranslate: storedAutoTranslate,
    autoTranslateDelay, keyStatus, phoneticMode, translationStyle, translationReasoningEffort,
    imageProviderFallback,
    ttsMode, ttsVoice,
    setSourceText, setTranslatedText, setPhoneticText, setTargetLang,
    setIsTranslating, setTranslateError, setActivePage, setPhoneticMode, setTranslationStyle, setTranslationReasoningEffort, setAutoTranslate, addHistory, upsertHistory,
    recordUsageCost, setTranslationModels,
    setLanguagePair,
    pendingTranslateRestoreId, setPendingTranslateRestore,
  } = useAppStore()
  const t = useT()

  const activeTranslationModels = useMemo<TranslationModelSelection[]>(() => {
    if (translationModels?.length) return translationModels
    return [{
      provider: legacySelectedProvider,
      model: legacySelectedModels[legacySelectedProvider],
    }]
  }, [legacySelectedModels, legacySelectedProvider, translationModels])
  const primaryTranslationModel = activeTranslationModels[0] ?? {
    provider: legacySelectedProvider,
    model: legacySelectedModels[legacySelectedProvider],
  }
  const selectedProvider = primaryTranslationModel.provider
  const selectedModel = primaryTranslationModel.model
  const translationModelsKey = activeTranslationModels.map(translationModelKey).join('|')
  const isComparisonMode = activeTranslationModels.length > 1
  // Comparison always runs manually, but the stored preference is left untouched
  // so automatic translation resumes as soon as a single model is selected again.
  const autoTranslate = storedAutoTranslate && !isComparisonMode

  // Keep the legacy app-wide selection as a compatibility mirror for callers
  // not migrated to the canonical AI Translate selection set yet.
  useEffect(() => {
    const state = useAppStore.getState()
    if (state.selectedProvider !== selectedProvider) {
      state.setSelectedProvider(selectedProvider)
    }
    if (state.selectedModels[selectedProvider] !== selectedModel) {
      state.setSelectedModel(selectedProvider, selectedModel)
    }
  }, [selectedModel, selectedProvider])

  // Derived boolean — true when any phonetic mode is active
  const showFurigana = phoneticMode !== 'off'

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeTranslateRequestIdRef = useRef<string | null>(null)
  const activeComparisonRequestIdsRef = useRef(new Map<string, string>())
  const activePhoneticRequestIdRef = useRef<string | null>(null)
  /**
   * Monotonically-increasing counter that identifies the "current" translation job.
   * Incremented each time a new job starts OR when the user cancels (clears content/image).
   * Every async step checks its captured generation against the current value before
   * touching state — if they differ the job was cancelled and results are silently dropped.
   */
  const translateGenerationRef = useRef(0)
  const phoneticRequestRef = useRef(0)
  const rewriteGenerationRef = useRef(0)
  const imageProcessGenerationRef = useRef(0)
  const autoHistoryDraftRef = useRef<AutoHistoryDraft | null>(null)
  const hasKey = selectedProvider === 'local' || keyStatus[selectedProvider]
  const charCount = sourceText.length

  /**
   * True when the current error is due to a missing or invalid API key.
   * Prefer the structured errorCode coming from IPC; fall back to the
   * "no stored key" heuristic only when the backend did not return a code
   * (e.g. the error was set client-side before any IPC call).
   */
  const isApiKeyError = !!(
    translateError && (
      translateErrorCode === 'NO_API_KEY' ||
      translateErrorCode === 'INVALID_KEY' ||
      (!translateErrorCode && !hasKey)
    )
  )

  const cancelActiveTranslation = useCallback(() => {
    const requestId = activeTranslateRequestIdRef.current
    if (requestId) {
      void window.api.cancelTranslate?.({ requestId })
      activeTranslateRequestIdRef.current = null
    }

    const phoneticRequestId = activePhoneticRequestIdRef.current
    if (phoneticRequestId) {
      void window.api.cancelTranslate?.({ requestId: phoneticRequestId })
      activePhoneticRequestIdRef.current = null
    }

    for (const requestId of activeComparisonRequestIdsRef.current.values()) {
      void window.api.cancelTranslate?.({ requestId })
    }
    activeComparisonRequestIdsRef.current.clear()
  }, [])

  const [copied, setCopied] = useState(false)
  const [copiedComparisonKey, setCopiedComparisonKey] = useState<string | null>(null)
  const [comparisonResults, setComparisonResults] = useState<TranslationComparisonResult[]>([])
  /** The translation the user picked as the outcome of the current comparison run. */
  const [selectedComparisonKey, setSelectedComparisonKey] = useState<string | null>(null)
  const selectedComparisonKeyRef = useRef(selectedComparisonKey)
  selectedComparisonKeyRef.current = selectedComparisonKey
  /** History entry owned by the current comparison run; re-picking replaces it instead of adding. */
  const comparisonHistoryIdRef = useRef<string | null>(null)
  /** Latest comparison results, readable from async completions and pick handlers without stale closures. */
  const comparisonResultsRef = useRef(comparisonResults)
  comparisonResultsRef.current = comparisonResults
  const [isRewriting, setIsRewriting] = useState<'source' | 'translated' | null>(null)
  /** Shown when image translation silently switched to a different model/provider */
  const [imageSwitchNotice, setImageSwitchNotice] = useState<{ model: string; provider: string } | null>(null)
  /** Language detected by AI from the last source text — drives the swap button */
  const [detectedSourceLang, setDetectedSourceLang] = useState<string | null>(null)
  /** True while background language detection is in progress */
  const [isDetectingLang, setIsDetectingLang] = useState(false)

  // TTS — delegated to useTTS hook (Web Audio API + OS synthesis fallback, no console.log)
  const { speakingPanel, speakLoading, handleSpeak, stopSpeak } = useTTS({ ttsMode, ttsVoice })

  // ── Real-time model-switch notice from main process ──
  // Subscribe once on mount — main process emits 'image:model-switched' immediately
  // before the fallback translation starts, so the user sees the warning right away.
  useEffect(() => {
    if (!window.api?.onImageModelSwitched) return
    const cleanup = window.api.onImageModelSwitched(({ model: m, provider: p }) => {
      setImageSwitchNotice({ model: m, provider: p })
    })
    return cleanup
  }, [])

  // Image attachment state
  const [imageAttachment, setImageAttachment] = useState<ImageAttachment | null>(null)
  // Regions returned by AI when translating an image (fallback approach)
  const [imageRegions, setImageRegions] = useState<ImageTextRegion[] | null>(null)
  // Edited image returned directly by Gemini image-edit model
  const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null)
  // Snapshot that produced the visible result. A mismatched draft is explicitly stale.
  const [resultContext, setResultContext] = useState<TranslationResultContext | null>(() => (
    translatedText && translatedText !== IMAGE_TRANSLATED_SENTINEL
      ? {
          sourceText,
          imageAttachment: null,
          sourceLang,
          targetLang,
          modelsKey: translationModelsKey,
          translationStyle,
          reasoningEffort: translationReasoningEffort,
        }
      : null
  ))
  // Drag-over state for source panel drop zone visual feedback
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  // Ref to hidden file input — triggered when user clicks the image icon
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Stable ref so lang-change effect can check imageAttachment without re-subscribing
  const imageAttachmentRef = useRef(imageAttachment)
  const translatedTextRef = useRef(translatedText)
  const isTranslatingRef = useRef(isTranslating)
  const phoneticModeRef = useRef(phoneticMode)
  imageAttachmentRef.current = imageAttachment
  translatedTextRef.current = translatedText
  isTranslatingRef.current = isTranslating
  phoneticModeRef.current = phoneticMode

  const currentResultContext = useMemo<TranslationResultContext>(() => ({
    sourceText,
    imageAttachment,
    sourceLang,
    targetLang,
    modelsKey: translationModelsKey,
    translationStyle,
    reasoningEffort: imageAttachment ? 'auto' : translationReasoningEffort,
  }), [
    sourceText,
    imageAttachment,
    sourceLang,
    targetLang,
    translationModelsKey,
    translationStyle,
    translationReasoningEffort,
  ])
  const hasVisibleResult = Boolean(
    translatedText
    || editedImageUrl
    || (isComparisonMode && comparisonResults.some((result) => result.status === 'success')),
  )
  const isResultStale = Boolean(
    hasVisibleResult
    && resultContext
    && !isSameResultContext(resultContext, currentResultContext),
  )

  const markResultCurrent = useCallback(() => {
    setResultContext(currentResultContext)
  }, [currentResultContext])

  const invalidateRewrite = useCallback(() => {
    rewriteGenerationRef.current++
    setIsRewriting(null)
  }, [])

  const invalidateActiveTranslation = useCallback(() => {
    translateGenerationRef.current++
    phoneticRequestRef.current++
    imageProcessGenerationRef.current++
    invalidateRewrite()
    cancelActiveTranslation()
    setIsTranslating(false)
    setDetectedSourceLang(null)
    setIsDetectingLang(false)
    stopSpeak()
  }, [cancelActiveTranslation, invalidateRewrite, setIsTranslating, stopSpeak])

  const handleTranslationModelsChange = useCallback((nextModels: TranslationModelSelection[]) => {
    const previousSingleKey = activeTranslationModels[0]
      ? translationModelKey(activeTranslationModels[0])
      : null
    const nextModelsKey = nextModels.map(translationModelKey).join('|')
    const nextResults = nextModels.map((selection) => {
      const key = translationModelKey(selection)
      const existing = comparisonResults.find((result) => result.key === key)
      if (existing) return existing
      if (
        key === previousSingleKey
        && !isResultStale
        && translatedText
        && translatedText !== IMAGE_TRANSLATED_SENTINEL
      ) {
        return {
          ...createComparisonResult(selection, 'success'),
          translatedText,
        }
      }
      return createComparisonResult(selection)
    })

    invalidateActiveTranslation()
    setTranslationModels(nextModels)
    setComparisonResults(nextResults)
    if (selectedComparisonKey && !nextModels.some((selection) => translationModelKey(selection) === selectedComparisonKey)) {
      setSelectedComparisonKey(null)
    }

    if (!imageAttachment) {
      const singleResult = nextModels.length === 1 ? nextResults[0] : null
      const nextText = singleResult?.status === 'success' ? singleResult.translatedText : ''
      const hasRetainedResult = nextResults.some((result) => (
        result.status === 'success' && Boolean(result.translatedText)
      ))
      setTranslatedText(nextText)
      setPhoneticText('')
      setResultContext(hasRetainedResult
        ? { ...currentResultContext, modelsKey: nextModelsKey }
        : null)
    }
  }, [
    activeTranslationModels,
    comparisonResults,
    currentResultContext,
    imageAttachment,
    invalidateActiveTranslation,
    isResultStale,
    selectedComparisonKey,
    setPhoneticText,
    setTranslatedText,
    setTranslationModels,
    translatedText,
  ])

  /** Process an image File: resize, convert to base64, attach to translate area */
  const processImageFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setTranslateError(t.image_translate_type_error)
      return
    }
    invalidateActiveTranslation()
    const processGeneration = ++imageProcessGenerationRef.current
    try {
      const result = await resizeImageFile(file, MAX_TRANSLATE_IMAGE_DIMENSION, { useQualityLoop: true })
      if (imageProcessGenerationRef.current !== processGeneration) return
      const attachment: ImageAttachment = {
        base64:         result.base64,
        mimeType:       result.mimeType,
        width:          result.width,
        height:         result.height,
        previewDataUrl: result.previewUrl,
        fileName:       result.fileName,
      }
      setImageAttachment(attachment)
      setImageRegions(null)
      setEditedImageUrl(null)
      setComparisonResults([])
      setSelectedComparisonKey(null)
      setTranslatedText('')
      setPhoneticText('')
      setResultContext(null)
      setTranslateError(null)
    } catch (err) {
      if (imageProcessGenerationRef.current !== processGeneration) return
      setTranslateError(localizeTranslationException(t, err, t.image_translate_error_failed))
    }
  }, [invalidateActiveTranslation, setTranslateError, setTranslatedText, setPhoneticText, t])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processImageFile(file)
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }, [processImageFile])

  // ── Paste image from clipboard into the source panel ──
  const handleSourcePanelPaste = useCallback((e: React.ClipboardEvent<HTMLElement>) => {
    const file = extractImageFromClipboard(e.clipboardData)
    if (!file) return
    e.preventDefault()
    processImageFile(file)
  }, [processImageFile])

  const handleSourcePanelDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    setIsDraggingOver(true)
  }, [])

  const handleSourcePanelDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
    // Only clear when leaving the panel itself, not a child element
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDraggingOver(false)
    }
  }, [])

  const handleSourcePanelDrop = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    setIsDraggingOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processImageFile(file)
  }, [processImageFile])

  const handleVoiceTextChange = useCallback((text: string) => {
    invalidateActiveTranslation()
    setSourceText(text)
  }, [invalidateActiveTranslation, setSourceText])

  // ── Voice input — shared hook (same logic as ChatPage) ──
  const [voiceRecordingState, setVoiceRecordingState] = useState<VoiceRecordingState>('idle')
  const {
    isVoiceActive: isVoiceRecordingActive,
    isVoiceInterim,
    handleVoiceRecordingChange,
    handleVoiceTranscript,
    cancelVoiceInput,
    resetVoicePrefix,
  } = useVoiceInput({ currentText: sourceText, onTextChange: handleVoiceTextChange })
  const isVoiceActive = isVoiceRecordingActive
    || (voiceRecordingState !== 'idle' && voiceRecordingState !== 'error')
  const handleVoiceStateChange = useCallback((state: VoiceRecordingState) => {
    setVoiceRecordingState(state)
  }, [])

  /**
   * Triggers background language detection for `text` (best-effort, non-blocking).
   * On success → sets `detectedSourceLang`; on failure → degrades gracefully.
   * The swap button remains functional either way — it just won't auto-set target
   * language if detection fails.
   *
   * All values are passed as parameters (not closed over) so this callback never
   * needs to be recreated — stable empty-dep memoisation is safe here.
   */
  const detectLanguageInBackground = useCallback((
    text: string,
    generation: number,
    provider: string,
    model: string,
  ) => {
    setIsDetectingLang(true)
    Promise.resolve()
      .then(() => translationService.detectLanguage({
        provider,
        model,
        text: text.slice(0, DETECT_LANG_MAX_CHARS),
      }))
      .then((res) => {
        if (translateGenerationRef.current !== generation) return
        if (res.success && res.lang) setDetectedSourceLang(res.lang)
      })
      .catch(() => {
        // Detection is best-effort — a failure here means the swap button won't
        // automatically change the target language, but it will still move the
        // translated text into the source panel correctly.
      })
      .finally(() => {
        if (translateGenerationRef.current === generation) setIsDetectingLang(false)
      })
  }, []) // All values are passed as params → no external deps needed

  const recordTranslationOutcome = useCallback((
    trigger: TranslateTrigger,
    plainText: string,
    selection: TranslationModelSelection,
    options: { recordCost?: boolean; recordHistory?: boolean } = {},
  ) => {
    const timestamp = Date.now()
    const { recordCost = true, recordHistory = true } = options
    const contextKey = buildHistoryContextKey(
      selection.provider,
      selection.model,
      sourceLang,
      targetLang,
      translationStyle,
    )
    const cost = estimateUsageCost({
      feature: 'translate',
      provider: selection.provider,
      model: selection.model,
      inputText: sourceText,
      outputText: plainText,
    })
    if (recordCost) recordUsageCost(cost)
    if (!recordHistory) return
    const baseItem = {
      timestamp,
      provider: selection.provider,
      model: selection.model,
      sourceLang,
      targetLang,
      translationStyle,
      sourceText,
      translatedText: plainText,
      cost,
    }

    if (trigger === 'auto') {
      const existingDraft = autoHistoryDraftRef.current
      const id = existingDraft && shouldReuseAutoHistoryDraft(existingDraft, sourceText, contextKey, timestamp)
        ? existingDraft.id
        : createHistoryId(timestamp)

      upsertHistory({ ...baseItem, id })
      autoHistoryDraftRef.current = { id, contextKey, sourceText, timestamp }
      return
    }

    addHistory({ ...baseItem, id: createHistoryId(timestamp) })
    autoHistoryDraftRef.current = null
  }, [addHistory, upsertHistory, recordUsageCost, sourceLang, targetLang, translationStyle, sourceText])

  const generatePhoneticText = useCallback((
    text: string,
    mode: PhoneticMode,
    ownerGeneration?: number,
  ) => {
    const localRequestId = ++phoneticRequestRef.current

    if (mode === 'off' || !text.trim() || text === IMAGE_TRANSLATED_SENTINEL) {
      setPhoneticText('')
      return
    }

    if (!hasKey) {
      setTranslateError(t.translate_error_no_key, 'NO_API_KEY')
      return
    }

    // Cancel any phonetic pass that is still in flight before starting a new one.
    const previousPhoneticRequestId = activePhoneticRequestIdRef.current
    if (previousPhoneticRequestId) {
      void window.api.cancelTranslate?.({ requestId: previousPhoneticRequestId })
    }
    const ipcRequestId = createClientId('phonetic')
    activePhoneticRequestIdRef.current = ipcRequestId

    setPhoneticText('')
    void translationService.translate({
      provider: selectedProvider,
      model: selectedModel,
      requestId: ipcRequestId,
      sourceText: text,
      sourceLang: targetLang,
      targetLang,
      translationStyle,
      showFurigana: true,
      phoneticOnly: true,
      phoneticMode: mode,
    })
      .then((res) => {
        if (phoneticRequestRef.current !== localRequestId) return
        if (ownerGeneration !== undefined && translateGenerationRef.current !== ownerGeneration) return
        if (res.success && res.translatedText) setPhoneticText(res.translatedText)
      })
      .catch(() => {})
      .finally(() => {
        if (activePhoneticRequestIdRef.current === ipcRequestId) {
          activePhoneticRequestIdRef.current = null
        }
      })
  }, [
    hasKey,
    selectedProvider,
    selectedModel,
    targetLang,
    translationStyle,
    setPhoneticText,
    setTranslateError,
    t.translate_error_no_key,
  ])

  const handlePhoneticModeChange = useCallback((mode: PhoneticMode) => {
    phoneticModeRef.current = mode
    setPhoneticMode(mode)

    if (mode === 'off') {
      phoneticRequestRef.current++
      setPhoneticText('')
      return
    }

    if (isTranslatingRef.current) {
      setPhoneticText('')
      return
    }

    const currentTranslation = translatedTextRef.current
    // Allow phonetic for OCR-region image translations (translatedText holds the joined
    // region text). Only skip when the image was edited directly (sentinel) — there is
    // no text to apply furigana/romanisation to in that case.
    if (!currentTranslation || currentTranslation === IMAGE_TRANSLATED_SENTINEL) {
      setPhoneticText('')
      return
    }

    generatePhoneticText(currentTranslation, mode)
  }, [generatePhoneticText, setPhoneticMode, setPhoneticText])

  const runTranslate = useCallback(async (
    trigger: TranslateTrigger,
    onlyModel?: TranslationModelSelection,
  ) => {
    if ((imageAttachment || !isComparisonMode) && !hasKey) {
      setTranslateError(t.translate_error_no_key, 'NO_API_KEY')
      return
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    imageProcessGenerationRef.current++
    invalidateRewrite()
    cancelActiveTranslation()
    const generation = ++translateGenerationRef.current
    const requestId = createClientId('translate')
    activeTranslateRequestIdRef.current = requestId
    setIsTranslating(true)
    setTranslateError(null)
    setImageSwitchNotice(null)

    // ── IMAGE mode: translate the attached image ──────────────────────────
    if (imageAttachment) {
      try {
        const result = await window.api.translateImage({
          provider: selectedProvider,
          model: selectedModel,
          requestId,
          imageBase64: imageAttachment.base64,
          imageMimeType: imageAttachment.mimeType,
          sourceLang,
          targetLang,
          allowProviderFallback: imageProviderFallback,
        })
        // Bail out silently if the user cancelled while we were waiting
        if (translateGenerationRef.current !== generation) return
        if (result.success && result.editedImageBase64) {
          // ── Gemini image-edit: show the directly edited image ──
          const mimeType = result.editedImageMimeType ?? imageAttachment.mimeType
          setEditedImageUrl(`data:${mimeType};base64,${result.editedImageBase64}`)
          setTranslatedText(IMAGE_TRANSLATED_SENTINEL) // non-empty so conditional buttons render
          setImageRegions(null)
          markResultCurrent()
        } else if (result.success && result.regions && result.regions.length > 0) {
          // ── Fallback (Claude/OpenAI): compile translated text from regions ──
          const text = result.regions.map(r => r.translatedText).filter(Boolean).join('\n')
          setTranslatedText(text)
          setImageRegions(result.regions)
          setEditedImageUrl(null)
          markResultCurrent()
          // Generate phonetic pass for the compiled region text — image translations
          // also benefit from furigana/romanisation when target is JA/ZH/KO etc.
          const modeAtCompletion = phoneticModeRef.current
          if (modeAtCompletion !== 'off' && text) {
            generatePhoneticText(text, modeAtCompletion, generation)
          } else {
            setPhoneticText('')
          }
        } else if (result.success) {
          setTranslatedText('')
          setResultContext(null)
          setTranslateError(t.image_translate_no_text)
        } else {
          setTranslateError(
            localizeTranslationError(
              t,
              result.error,
              result.errorCode,
              t.image_translate_error_failed,
            ),
            result.errorCode,
          )
        }

        // Show notice if system auto-switched to a different model/provider
        if (result.success && (result.usedModel || result.usedProvider)) {
          setImageSwitchNotice({
            model: result.usedModel ?? selectedModel,
            provider: result.usedProvider ?? selectedProvider,
          })
        } else {
          setImageSwitchNotice(null)
        }
      } catch (err) {
        if (translateGenerationRef.current !== generation) return
        setTranslateError(localizeTranslationException(t, err, t.translate_error_unexpected))
      } finally {
        if (translateGenerationRef.current === generation) setIsTranslating(false)
        if (translateGenerationRef.current === generation) activeTranslateRequestIdRef.current = null
      }
      return
    }

    // ── TEXT mode: normal translation ─────────────────────────────────────
    // Clear stale detection result whenever a new translation starts
    setDetectedSourceLang(null)
    setIsDetectingLang(false)
    if (!sourceText.trim()) {
      activeTranslateRequestIdRef.current = null
      setIsTranslating(false)
      return
    }

    if (isComparisonMode) {
      activeTranslateRequestIdRef.current = null
      // A single-model retry is only meaningful while every card still reflects
      // the current source; once the input changed, rerun the whole set so the
      // cards never mix translations of different texts.
      const retryOnly = onlyModel && !isResultStale ? onlyModel : null
      const runsAllModels = retryOnly === null
      const selectionsToRun = retryOnly ? [retryOnly] : activeTranslationModels
      const keysToRun = new Set(selectionsToRun.map(translationModelKey))
      const outcomes = new Map<string, TranslationComparisonResult>()

      setComparisonResults((current) => {
        const currentByKey = new Map(current.map((result) => [result.key, result]))
        return activeTranslationModels.map((selection) => {
          const key = translationModelKey(selection)
          if (!keysToRun.has(key)) return currentByKey.get(key) ?? createComparisonResult(selection)
          return createComparisonResult(selection, 'loading')
        })
      })
      if (runsAllModels) {
        setTranslatedText('')
        setPhoneticText('')
        setResultContext(null)
        setSelectedComparisonKey(null)
        comparisonHistoryIdRef.current = null
      }

      const updateResult = (nextResult: TranslationComparisonResult) => {
        outcomes.set(nextResult.key, nextResult)
        setComparisonResults((current) => {
          const currentByKey = new Map(current.map((result) => [result.key, result]))
          currentByKey.set(nextResult.key, nextResult)
          return activeTranslationModels.map((selection) => (
            currentByKey.get(translationModelKey(selection)) ?? createComparisonResult(selection)
          ))
        })
      }

      await Promise.all(selectionsToRun.map(async (selection) => {
        const key = translationModelKey(selection)
        const startedAt = Date.now()
        const providerHasKey = selection.provider === 'local' || keyStatus[selection.provider]
        if (!providerHasKey) {
          updateResult({
            ...createComparisonResult(selection, 'error'),
            error: t.translate_error_no_key,
            errorCode: 'NO_API_KEY',
            durationMs: 0,
          })
          return
        }

        const comparisonRequestId = createClientId('translate-compare')
        activeComparisonRequestIdsRef.current.set(key, comparisonRequestId)
        try {
          const result = await translationService.translate({
            provider: selection.provider,
            model: selection.model,
            requestId: comparisonRequestId,
            sourceText,
            sourceLang,
            targetLang,
            translationStyle,
            reasoningEffort: translationReasoningEffort,
            showFurigana: false,
          })
          if (translateGenerationRef.current !== generation) return

          if (result.success && result.translatedText) {
            const nextResult = {
              ...createComparisonResult(selection, 'success'),
              translatedText: result.translatedText,
              durationMs: Date.now() - startedAt,
            }
            updateResult(nextResult)
            recordTranslationOutcome(trigger, result.translatedText, selection, { recordHistory: false })
          } else {
            const normalizedErrorCode = normalizeComparisonErrorCode(result.errorCode, result.error)
            updateResult({
              ...createComparisonResult(selection, 'error'),
              error: localizeTranslationError(t, result.error, normalizedErrorCode, t.translate_error_generic),
              errorCode: normalizedErrorCode,
              durationMs: Date.now() - startedAt,
            })
          }
        } catch (error) {
          if (translateGenerationRef.current !== generation) return
          const rawError = error instanceof Error ? error.message : String(error ?? '')
          updateResult({
            ...createComparisonResult(selection, 'error'),
            error: localizeTranslationException(t, error, t.translate_error_unexpected),
            errorCode: normalizeComparisonErrorCode(null, rawError),
            durationMs: Date.now() - startedAt,
          })
        } finally {
          if (activeComparisonRequestIdsRef.current.get(key) === comparisonRequestId) {
            activeComparisonRequestIdsRef.current.delete(key)
          }
        }
      }))

      if (translateGenerationRef.current !== generation) return
      const successfulResults = selectionsToRun
        .map((selection) => outcomes.get(translationModelKey(selection)))
        .filter((result): result is TranslationComparisonResult => result?.status === 'success')

      if (successfulResults.length > 0) {
        setTranslatedText('')
        setPhoneticText('')
        markResultCurrent()
        // Costs were recorded per model above. The run is one history entry that
        // keeps every finished model; a later pick re-attributes the same entry.
        const previousByKey = new Map(comparisonResultsRef.current.map((result) => [result.key, result]))
        const finishedResults = activeTranslationModels
          .map((selection) => {
            const key = translationModelKey(selection)
            return outcomes.get(key) ?? previousByKey.get(key)
          })
          .filter((result): result is TranslationComparisonResult => result?.status === 'success')
        const timestamp = Date.now()
        const historyId = comparisonHistoryIdRef.current ?? createHistoryId(timestamp)
        comparisonHistoryIdRef.current = historyId
        const pickedKey = selectedComparisonKeyRef.current
        const historyItem = buildComparisonHistoryItem({
          id: historyId,
          timestamp,
          sourceText,
          sourceLang,
          targetLang,
          translationStyle,
          results: finishedResults,
          picked: pickedKey ? finishedResults.find((result) => result.key === pickedKey) ?? null : null,
        })
        if (historyItem) upsertHistory(historyItem)
        const detectionResult = successfulResults[0]
        detectLanguageInBackground(
          sourceText,
          generation,
          detectionResult.provider,
          detectionResult.model,
        )
      }
      setIsTranslating(false)
      return
    }

    try {
      const baseParams = {
        provider: selectedProvider,
        model: selectedModel,
        requestId,
        sourceText,
        sourceLang,
        targetLang,
        translationStyle,
        reasoningEffort: translationReasoningEffort,
      }

      const plainResult = await translationService.translate({ ...baseParams, showFurigana: false })

      // Bail out silently if the user cancelled while we were waiting
      if (translateGenerationRef.current !== generation) return

      if (plainResult.success && plainResult.translatedText) {
        const plainText = plainResult.translatedText
        setTranslatedText(plainText)
        setPhoneticText('')   // clear stale phonetic — phonetic pass below will repopulate it
        markResultCurrent()
        setIsTranslating(false)

        recordTranslationOutcome(trigger, plainText, {
          provider: selectedProvider,
          model: selectedModel,
        })

        // Second pass: add phonetic output for the mode that is active when the
        // translation finishes. This also supports toggling phonetic on while a
        // translation request is still in flight.
        const modeAtCompletion = phoneticModeRef.current
        if (modeAtCompletion !== 'off') generatePhoneticText(plainText, modeAtCompletion, generation)

        // Background language detection — runs in parallel with phonetic pass.
        // Identifies the source language so the swap button can set the correct target.
        detectLanguageInBackground(sourceText, generation, selectedProvider, selectedModel)
      } else {
        setTranslateError(
          localizeTranslationError(
            t,
            plainResult.error,
            plainResult.errorCode,
            t.translate_error_generic,
          ),
          plainResult.errorCode,
        )
      }
    } catch (err) {
      if (translateGenerationRef.current !== generation) return
      setTranslateError(localizeTranslationException(t, err, t.translate_error_unexpected))
    } finally {
      if (translateGenerationRef.current === generation) setIsTranslating(false)
      if (translateGenerationRef.current === generation) activeTranslateRequestIdRef.current = null
    }
  }, [imageAttachment, sourceText, sourceLang, targetLang, selectedProvider, selectedModel,
       activeTranslationModels, isComparisonMode, isResultStale, keyStatus,
       hasKey, translationStyle, translationReasoningEffort, imageProviderFallback,
       setIsTranslating, setTranslateError, setTranslatedText, setPhoneticText, t,
       detectLanguageInBackground, recordTranslationOutcome, generatePhoneticText,
       cancelActiveTranslation, invalidateRewrite, markResultCurrent, upsertHistory])

  const handleTranslate = useCallback(() => runTranslate('manual'), [runTranslate])

  const handleRetryComparison = useCallback((selection: TranslationModelSelection) => {
    void runTranslate('manual', selection)
  }, [runTranslate])

  /**
   * Records the picked translation as the one history entry of this comparison.
   * A result assembled sentence by sentence arrives under ASSEMBLED_TRANSLATION_KEY
   * (see utils/sentenceSegments) carrying the provider and model that contributed
   * the most sentences, so the entry and its cost estimate go to that dominant model.
   */
  const handleSelectComparison = useCallback((result: TranslationComparisonResult) => {
    if (result.status !== 'success' || !result.translatedText) return
    setSelectedComparisonKey(result.key)
    const timestamp = Date.now()
    const id = comparisonHistoryIdRef.current ?? createHistoryId(timestamp)
    comparisonHistoryIdRef.current = id
    const historyItem = buildComparisonHistoryItem({
      id,
      timestamp,
      sourceText,
      sourceLang,
      targetLang,
      translationStyle,
      results: comparisonResultsRef.current.filter((candidate) => (
        candidate.status === 'success' && Boolean(candidate.translatedText)
      )),
      picked: result,
    })
    if (historyItem) upsertHistory(historyItem)
  }, [sourceLang, sourceText, targetLang, translationStyle, upsertHistory])

  const handleCopyComparison = useCallback(async (result: TranslationComparisonResult) => {
    if (!result.translatedText) return
    try {
      await navigator.clipboard.writeText(result.translatedText)
      setCopiedComparisonKey(result.key)
      setTimeout(() => setCopiedComparisonKey(null), COPY_FEEDBACK_DURATION_MS)
    } catch (_error) {
      setTranslateError(t.translate_error_copy)
    }
  }, [setTranslateError, t.translate_error_copy])

  /** Download the translated image (original + text regions overlaid) */
  const handleDownloadTranslatedImage = useCallback(async () => {
    if (!imageAttachment || !imageRegions) return
    try {
      const canvas  = document.createElement('canvas')
      canvas.width  = imageAttachment.width
      canvas.height = imageAttachment.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const img = new Image()
      img.src = imageAttachment.previewDataUrl
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load image'))
      })
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      renderTranslatedRegions(ctx, imageRegions, canvas.width, canvas.height)
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `translated_${Date.now()}.png`
      a.click()
    } catch (err) {
      setTranslateError(localizeTranslationException(t, err, t.translate_error_download))
    }
  }, [imageAttachment, imageRegions, setTranslateError, t])

  /** Download the Gemini-edited image directly */
  const handleDownloadEditedImage = useCallback(() => {
    if (!editedImageUrl) return
    const a = document.createElement('a')
    a.href = editedImageUrl
    a.download = `translated_${Date.now()}.png`
    a.click()
  }, [editedImageUrl])

  // Stable refs for effects below (avoids stale closures without re-triggering effects)
  const styleInitRef = useRef(false)
  const reasoningInitRef = useRef(false)
  const langInitRef = useRef(false)
  const modelInitRef = useRef(false)
  const runTranslateRef = useRef(runTranslate)
  const sourceTextRef = useRef(sourceText)
  const autoTranslateRef = useRef(autoTranslate)
  runTranslateRef.current = runTranslate
  sourceTextRef.current = sourceText
  autoTranslateRef.current = autoTranslate

  useLayoutEffect(() => {
    styleInitRef.current = false
    reasoningInitRef.current = false
    langInitRef.current = false
    modelInitRef.current = false
  }, [])

  useEffect(() => {
    if (!autoTranslate || !sourceText.trim()) autoHistoryDraftRef.current = null
  }, [autoTranslate, sourceText])

  // Auto-translate debounce (only when autoTranslate is enabled)
  // Skip while voice is recording — interim results would spam the API.
  // Use runTranslateRef to avoid the infinite loop caused by runTranslate changing when
  // isTranslating flips true→false after each translation.
  useEffect(() => {
    if (!autoTranslate || !sourceText.trim() || isVoiceActive) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { runTranslateRef.current('auto') }, autoTranslateDelay)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [autoTranslate, autoTranslateDelay, sourceText, isVoiceActive])

  // Auto-translate when an image is attached — image has no text to debounce on
  useEffect(() => {
    if (!autoTranslate || !imageAttachment) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { runTranslateRef.current('auto') }, IMAGE_AUTO_TRANSLATE_DELAY_MS)  // HC-03
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [autoTranslate, imageAttachment])

  // Re-translate when style changes (skip first render, skip manual mode)
  // biome-ignore lint/correctness/useExhaustiveDependencies: translationStyle is the intentional trigger; runTranslate is accessed via a stable ref
  useEffect(() => {
    if (!styleInitRef.current) { styleInitRef.current = true; return }
    invalidateRewrite()
    if (!sourceTextRef.current.trim() && !imageAttachmentRef.current) return
    if (isTranslatingRef.current) {
      runTranslateRef.current(autoTranslateRef.current ? 'auto' : 'manual')
      return
    }
    if (!autoTranslateRef.current) return
    runTranslateRef.current('auto')
  }, [translationStyle])

  // Re-translate when reasoning effort changes (skip first render, skip manual mode).
  // biome-ignore lint/correctness/useExhaustiveDependencies: reasoning effort is the intentional trigger; runTranslate is accessed via a stable ref
  useEffect(() => {
    if (!reasoningInitRef.current) { reasoningInitRef.current = true; return }
    invalidateRewrite()
    if (!sourceTextRef.current.trim() || imageAttachmentRef.current) return
    if (isTranslatingRef.current) {
      runTranslateRef.current(autoTranslateRef.current ? 'auto' : 'manual')
      return
    }
    if (!autoTranslateRef.current) return
    runTranslateRef.current('auto')
  }, [translationReasoningEffort])

  const restartForLanguageRef = useRef(false)
  const handleLanguagePairChange = useCallback((pair: { source: string; target: string }) => {
    if (pair.source === sourceLang && pair.target === targetLang) return
    restartForLanguageRef.current = isTranslatingRef.current
    invalidateActiveTranslation()
    setLanguagePair('translate', pair)
  }, [sourceLang, targetLang, invalidateActiveTranslation, setLanguagePair])

  // Re-translate when target or source language changes (skip first render, skip manual mode).
  // Special case: if a translation is already in flight, restart it with the new lang pair so
  // the stale result (targeting the old language) does not surface — this is intentional and
  // preserves user expectations when they bump the language picker mid-translation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: lang changes are the triggers; sourceText/imageAttachment/runTranslate accessed via stable refs
  useEffect(() => {
    if (!langInitRef.current) { langInitRef.current = true; return }
    setDetectedSourceLang(null)
    setIsDetectingLang(false)
    invalidateRewrite()
    if (!sourceTextRef.current.trim() && !imageAttachmentRef.current) return
    if (restartForLanguageRef.current || isTranslatingRef.current) {
      restartForLanguageRef.current = false
      runTranslateRef.current(autoTranslateRef.current ? 'auto' : 'manual')
      return
    }
    if (!autoTranslateRef.current) return
    runTranslateRef.current('auto')
  }, [targetLang, sourceLang])

  // Re-translate when provider or model changes (skip first render, skip manual mode)
  // biome-ignore lint/correctness/useExhaustiveDependencies: provider/model changes are the triggers; runTranslate via stable ref
  useEffect(() => {
    if (!modelInitRef.current) { modelInitRef.current = true; return }
    invalidateRewrite()
    if (!sourceTextRef.current.trim() && !imageAttachmentRef.current) return
    if (isTranslatingRef.current) {
      runTranslateRef.current(autoTranslateRef.current ? 'auto' : 'manual')
      return
    }
    if (!autoTranslateRef.current) return
    runTranslateRef.current('auto')
  }, [selectedProvider, selectedModel])

  const handleUseAsSource = useCallback((text: string) => {
    if (!text || isResultStale || isTranslating || imageAttachment) return
    const resolvedSource = sourceLang === 'auto' ? detectedSourceLang : sourceLang
    invalidateActiveTranslation()
    setSourceText(text)
    setLanguagePair('translate', { source: targetLang, target: resolvedSource ?? targetLang })
    setTranslatedText('')
    setPhoneticText('')
    setComparisonResults([])
    setSelectedComparisonKey(null)
    setResultContext(null)
  }, [sourceLang, targetLang, detectedSourceLang, imageAttachment, isResultStale, isTranslating,
    invalidateActiveTranslation, setLanguagePair, setSourceText, setTranslatedText, setPhoneticText])

  const handleCopy = async () => {
    const textToCopy = showFurigana && phoneticText ? phoneticText : translatedText
    if (!textToCopy) return
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS)  // HC-03
    } catch (_err) {
      setTranslateError(t.translate_error_copy)
    }
  }

  // Rewrite: make text more natural in its own language without changing meaning
  const handleRewrite = useCallback(async (panel: 'source' | 'translated') => {
    if (isRewriting) return
    if (!hasKey) { setTranslateError(t.translate_error_no_key, 'NO_API_KEY'); return }
    const text = panel === 'source' ? sourceText : translatedText
    const lang = panel === 'source'
      ? (sourceLang === 'auto' ? 'the same language as the input text' : sourceLang)
      : targetLang
    if (!text.trim()) return
    const rewriteGeneration = ++rewriteGenerationRef.current
    setIsRewriting(panel)
    try {
      const result = await translationService.rewriteText({
        provider: selectedProvider,
        model: selectedModel,
        text,
        lang,
        translationStyle,
      })
      if (rewriteGenerationRef.current !== rewriteGeneration) return
      if (result.success && result.translatedText) {
        if (panel === 'source') {
          invalidateActiveTranslation()
          setSourceText(result.translatedText)
          // Clear stale phonetic immediately — auto-translate will regenerate it after the
          // new source text is translated; prevents old phonetic showing for new content.
          setPhoneticText('')
        } else {
          const rewrittenText = result.translatedText
          setTranslatedText(rewrittenText)
          setPhoneticText('')
          const modeAtRewrite = phoneticModeRef.current
          if (modeAtRewrite !== 'off') generatePhoneticText(rewrittenText, modeAtRewrite)
        }
      }
    } catch (err) {
      if (rewriteGenerationRef.current !== rewriteGeneration) return
      setTranslateError(localizeTranslationException(t, err, t.translate_error_rewrite))
    } finally {
      if (rewriteGenerationRef.current === rewriteGeneration) setIsRewriting(null)
    }
  }, [isRewriting, hasKey, sourceText, translatedText, sourceLang, targetLang, translationStyle,
      selectedProvider, selectedModel, generatePhoneticText,
      invalidateActiveTranslation, setSourceText, setTranslatedText, setPhoneticText, setTranslateError, t])

  /** Handles MarkdownEditor source text changes */
  const handleSourceChange = useCallback((val: string) => {
    if (val !== sourceText) invalidateActiveTranslation()
    setSourceText(val)
    if (!val.trim()) {
      setTranslatedText('')
      setPhoneticText('')
      setResultContext(null)
    }
    // User edited manually while voice is active — reset prefix so next
    // transcript chunk replaces the field content, not appends to stale prefix
    if (isVoiceActive) resetVoicePrefix()
  }, [sourceText, invalidateActiveTranslation, setSourceText, setTranslatedText, setPhoneticText, isVoiceActive, resetVoicePrefix])

  /** Clears the source panel (ClearButton) — cancels any in-flight translation */
  const handleClearSource = useCallback(() => {
    invalidateActiveTranslation()
    setSourceText('')
    setImageAttachment(null)
    setImageRegions(null)
    setEditedImageUrl(null)
    setTranslatedText('')
    setPhoneticText('')
    setComparisonResults([])
    setCopiedComparisonKey(null)
    setSelectedComparisonKey(null)
    setResultContext(null)
    setTranslateError(null)
    setDetectedSourceLang(null)
    setIsDetectingLang(false)
    setImageSwitchNotice(null)
  }, [invalidateActiveTranslation, setSourceText, setTranslatedText, setPhoneticText, setTranslateError])

  /** Dismisses the current error banner — clears translateError in store */
  const handleDismissError = useCallback(() => {
    setTranslateError(null)
  }, [setTranslateError])

  /** Removes the attached image (ImageAttachmentPreview onRemove) — cancels in-flight job */
  const handleRemoveImage = useCallback(() => {
    invalidateActiveTranslation()
    setImageAttachment(null)
    setImageRegions(null)
    setEditedImageUrl(null)
    setTranslatedText('')
    setPhoneticText('')
    setComparisonResults([])
    setSelectedComparisonKey(null)
    setResultContext(null)
    setTranslateError(null)
    setImageSwitchNotice(null)
  }, [invalidateActiveTranslation, setTranslatedText, setPhoneticText, setTranslateError])

  useEffect(() => () => {
    translateGenerationRef.current++
    phoneticRequestRef.current++
    rewriteGenerationRef.current++
    imageProcessGenerationRef.current++
    cancelActiveTranslation()
    setIsTranslating(false)
  }, [cancelActiveTranslation, setIsTranslating])

  // ── Reopen a history entry ─────────────────────────────────────────────────
  // "Use this" in history writes the entry's text, languages, style and models
  // to the store, sets pendingTranslateRestoreId and navigates here. Everything
  // the store holds is already in place when this mounts; what remains is the
  // comparison state that lives in this hook: every saved model result, the
  // pick, and the entry id so a new pick updates that same entry.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per restore request and reads the rest at that moment
  useEffect(() => {
    if (!pendingTranslateRestoreId) return
    const item = useAppStore.getState().history.find((entry) => entry.id === pendingTranslateRestoreId)
    setPendingTranslateRestore(null)
    if (!item) return
    invalidateActiveTranslation()
    const savedResults = item.results ?? []
    if (savedResults.length > 1) {
      const restoredResults = savedResults.map((saved) => ({
        ...createComparisonResult(saved, 'success'),
        translatedText: saved.translatedText,
        durationMs: saved.durationMs ?? null,
      }))
      setComparisonResults(restoredResults)
      // An assembled pick has no column of its own; its text stays in the entry.
      const pickedKey = item.selectedKey ?? null
      setSelectedComparisonKey(
        restoredResults.some((result) => result.key === pickedKey) ? pickedKey : null,
      )
      comparisonHistoryIdRef.current = item.id
      setTranslatedText('')
      setPhoneticText('')
    } else {
      setComparisonResults([])
      setSelectedComparisonKey(null)
      comparisonHistoryIdRef.current = null
    }
    setResultContext(currentResultContext)
  }, [pendingTranslateRestoreId])

  const visibleComparisonResults = useMemo(() => {
    const resultsByKey = new Map(comparisonResults.map((result) => [result.key, result]))
    return activeTranslationModels.map((selection) => (
      resultsByKey.get(translationModelKey(selection)) ?? createComparisonResult(selection)
    ))
  }, [activeTranslationModels, comparisonResults])

  return {
    // ── Store state (needed by JSX) ─────────────────────────────────────────
    sourceText,
    translatedText,
    phoneticText,
    sourceLang,
    targetLang,
    isTranslating,
    translateError,
    autoTranslate,
    phoneticMode,
    translationStyle,
    translationReasoningEffort,
    keyStatus,
    selectedProvider,
    translationModels: activeTranslationModels,
    // ── Store setters (used directly in JSX) ───────────────────────────────
    setTargetLang,
    setActivePage,
    setPhoneticMode: handlePhoneticModeChange,
    setTranslationStyle,
    setTranslationReasoningEffort,
    setAutoTranslate,
    setTranslationModels: handleTranslationModelsChange,
    // ── Local state ────────────────────────────────────────────────────────
    copied,
    isRewriting,
    imageSwitchNotice,
    detectedSourceLang,
    isDetectingLang,
    imageAttachment,
    imageRegions,
    editedImageUrl,
    isDraggingOver,
    setImageSwitchNotice,
    // ── Computed ───────────────────────────────────────────────────────────
    charCount,
    isApiKeyError,
    isResultStale,
    isComparisonMode: isComparisonMode && !imageAttachment,
    comparisonResults: visibleComparisonResults,
    /** Source the current results were produced from, so sentence rows stay aligned while the draft changes. */
    comparisonSourceText: resultContext?.sourceText ?? sourceText,
    copiedComparisonKey,
    selectedComparisonKey,
    // ── TTS ────────────────────────────────────────────────────────────────
    speakingPanel,
    speakLoading,
    handleSpeak,
    // ── Voice ──────────────────────────────────────────────────────────────
    isVoiceActive,
    isVoiceInterim,
    handleVoiceRecordingChange,
    handleVoiceStateChange,
    handleVoiceTranscript,
    cancelVoiceInput,
    // ── Refs ───────────────────────────────────────────────────────────────
    fileInputRef,
    // ── Handlers ───────────────────────────────────────────────────────────
    handleTranslate,
    handleRewrite,
    handleUseAsSource,
    handleLanguagePairChange,
    handleCopy,
    handleCopyComparison,
    handleRetryComparison,
    handleSelectComparison,
    handleDismissError,
    handleDownloadTranslatedImage,
    handleDownloadEditedImage,
    handleSourceChange,
    handleClearSource,
    handleRemoveImage,
    handleFileInputChange,
    handleSourcePanelPaste,
    handleSourcePanelDragOver,
    handleSourcePanelDragLeave,
    handleSourcePanelDrop,
  }
}

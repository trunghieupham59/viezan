/**
 * useDictionaryLookup — encapsulates the business logic of the Dictionary page.
 *
 * Extracted from DictionaryPage to separate concerns:
 *  - Term/context input state and the command-palette hand-off
 *  - Two-phase lookup (preview, then detail enrichment) with abort + staleness guards
 *  - Cache reuse, cost estimation and history persistence
 *  - Selection lookup (a second entry looked up from highlighted result text)
 *  - Copy and "use in AI Translate" actions
 *
 * DictionaryPage composes the presentation layer and routes these handlers.
 */
import { useEffect, useRef, useState } from 'react'
import {
  dictionaryService,
  MAX_DICTIONARY_CONTEXT_CHARS,
  MAX_DICTIONARY_TERM_CHARS,
  normalizeDictionaryTerm,
} from '../services/dictionaryService'
import { useAppStore, useT } from '../store/useAppStore'
import type {
  DictionaryEntry,
  DictionaryLookupParams,
  DictionaryLookupResult,
  DictionaryResult,
} from '../types'
import { localizeChatError } from '../utils/chatErrors'
import { normalizeContextKey } from '../utils/dictionary'
import { createClientId } from '../utils/id'
import { combineUsageCosts, estimateUsageCost } from '../utils/usageCost'

export type DictionaryListTab = 'recent' | 'favorites'

export interface DictionarySelectionLookupState {
  term: string
  loading: boolean
  result: DictionaryResult | null
  error: string | null
}

/** How long the copy button shows its confirmation state. */
const COPY_CONFIRMATION_MS = 1200

function createDictionaryEntryId(): string {
  return createClientId('dict')
}

/** Plain-text rendering of an entry, used for the clipboard and cost estimates. */
export function formatDictionaryEntry(entry: DictionaryEntry): string {
  const translations = entry.result.translations
    .map((item) => item.pronunciation ? `${item.text} /${item.pronunciation.replace(/^\/|\/$/g, '')}/` : item.text)
    .join(', ')
  const lines = [
    entry.result.headword,
    entry.result.pronunciation ? `${entry.result.pronunciation}` : '',
    entry.result.meaning,
    translations,
    ...entry.result.examples,
    ...entry.result.notes,
  ]
  return lines.filter(Boolean).join('\n')
}

function sameDictionaryLookup(
  entry: DictionaryEntry,
  normalizedTerm: string,
  sourceLang: string,
  targetLang: string,
  context: string,
): boolean {
  return (
    entry.normalizedTerm === normalizedTerm &&
    entry.sourceLang === sourceLang &&
    entry.targetLang === targetLang &&
    normalizeContextKey(entry.context) === normalizeContextKey(context)
  )
}

function hasDictionaryDetails(entry: DictionaryEntry): boolean {
  return entry.result.translations.some((item) =>
    Boolean(
      item.meaning ||
        item.usage ||
        item.nuance ||
        item.examples?.length ||
        item.collocations?.length ||
        item.notes?.length,
    )
  )
}

function selectionLookupContext(entry: DictionaryEntry): string {
  return `Selected inside dictionary entry "${entry.term}". Entry meaning: ${entry.result.meaning}`
}

export function useDictionaryLookup() {
  const t = useT()
  const {
    dictionaryEntries,
    addDictionaryEntry,
    deleteDictionaryEntry,
    pendingDictionaryTerm,
    setPendingDictionaryTerm,
    sourceLang,
    targetLang,
    setLanguagePair,
    selectedProvider,
    selectedModels,
    setSourceText,
    setTranslatedText,
    setPhoneticText,
    setActivePage,
    recordUsageCost,
  } = useAppStore()

  const [term, setTerm] = useState('')
  const [context, setContext] = useState('')
  /** Term handed over by another feature (command palette), looked up once `term` reflects it. */
  const [handoffTerm, setHandoffTerm] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isEnriching, setIsEnriching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorRecoverable, setErrorRecoverable] = useState(false)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(
    dictionaryEntries[0]?.id ?? null,
  )
  const [activeListTab, setActiveListTab] = useState<DictionaryListTab>('recent')
  const [copied, setCopied] = useState(false)
  const [selectionLookup, setSelectionLookup] = useState<DictionarySelectionLookupState | null>(null)

  const lookupRequestRef = useRef(0)
  const lookupAbortRef = useRef<AbortController | null>(null)
  const selectionRequestRef = useRef(0)
  const selectionAbortRef = useRef<AbortController | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const cleanTerm = term.trim()
    if (!cleanTerm) return
    const matchedEntry = dictionaryEntries.find((entry) =>
      sameDictionaryLookup(
        entry,
        normalizeDictionaryTerm(cleanTerm),
        sourceLang,
        targetLang,
        context.trim(),
      ),
    )
    if (matchedEntry) setSelectedEntryId(matchedEntry.id)
  }, [context, dictionaryEntries, sourceLang, targetLang, term])

  // Reset selection when the language pair changes — the old entry belongs to a
  // different language context and showing it alongside new-pair search settings
  // is confusing. We skip the initial render by storing the mount-time pair in
  // a ref; only genuine changes trigger the reset.
  const langPairRef = useRef(`${sourceLang}:${targetLang}`)
  useEffect(() => {
    const current = `${sourceLang}:${targetLang}`
    if (langPairRef.current === current) return
    langPairRef.current = current
    setSelectedEntryId(null)
  }, [sourceLang, targetLang])

  // Cancel in-flight lookups and clear the copy timer when the page unmounts.
  useEffect(() => {
    return () => {
      lookupAbortRef.current?.abort()
      lookupAbortRef.current = null
      selectionAbortRef.current?.abort()
      selectionAbortRef.current = null
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current)
    }
  }, [])

  // selectedEntryId is either an explicit selection or the initial default
  // (set in useState). After deletion we set it to null intentionally — drop the
  // dictionaryEntries[0] fallback so the result panel shows the empty state
  // rather than auto-jumping to an unrelated entry.
  const selectedEntry = selectedEntryId
    ? (dictionaryEntries.find((entry) => entry.id === selectedEntryId) ?? null)
    : null
  const model = selectedModels[selectedProvider] ?? ''

  const localizeError = (code?: string, fallback?: string): string => {
    if (code === 'INVALID_RESPONSE') return t.dictionary_error_invalid_response
    if (code === 'TRUNCATED_RESPONSE') return t.dictionary_error_truncated
    if (code === 'SAME_LANGUAGE') return t.dictionary_error_same_lang
    if (code === 'INVALID_INPUT') return fallback || t.dictionary_error_failed
    if (code === 'CANCELLED') return ''
    return localizeChatError(t, { error: fallback, errorCode: code }, fallback || t.dictionary_error_failed)
  }

  const createLookupEntry = ({
    id,
    favorite,
    result,
    normalizedTerm,
    cleanTerm,
    cleanContext,
  }: {
    id: string
    favorite: boolean
    result: DictionaryResult
    normalizedTerm: string
    cleanTerm: string
    cleanContext: string
  }): DictionaryEntry => ({
    id,
    term: cleanTerm,
    normalizedTerm,
    context: cleanContext || undefined,
    sourceLang,
    targetLang,
    provider: selectedProvider,
    model,
    createdAt: Date.now(),
    favorite,
    result,
  })

  useEffect(() => {
    if (!pendingDictionaryTerm) return
    setTerm(pendingDictionaryTerm)
    setContext('')
    setHandoffTerm(pendingDictionaryTerm)
    setPendingDictionaryTerm(null)
  }, [pendingDictionaryTerm, setPendingDictionaryTerm])

  const clearError = () => {
    setError(null)
    setErrorRecoverable(false)
  }

  /** Typing clears a stale validation message so the field never fights the user. */
  const updateTerm = (value: string) => {
    setTerm(value)
    if (error) setError(null)
    setErrorRecoverable(false)
  }

  const runLookup = async () => {
    const cleanTerm = term.trim()
    const cleanContext = context.trim()
    if (!cleanTerm) {
      setErrorRecoverable(false)
      setError(t.dictionary_error_required)
      return
    }
    if (cleanTerm.length > MAX_DICTIONARY_TERM_CHARS) {
      setErrorRecoverable(false)
      setError(t.dictionary_error_too_long)
      return
    }
    if (cleanContext.length > MAX_DICTIONARY_CONTEXT_CHARS) {
      setErrorRecoverable(false)
      setError(t.dictionary_error_context_too_long)
      return
    }
    if (sourceLang && targetLang && sourceLang !== 'auto' && sourceLang === targetLang) {
      setErrorRecoverable(false)
      setError(t.dictionary_error_same_lang)
      return
    }

    // Cancel any previous in-flight lookup before starting a new one. We still
    // bump requestId so any stragglers that escape the abort signal are
    // filtered out by the staleness check below.
    lookupAbortRef.current?.abort()
    const controller = new AbortController()
    lookupAbortRef.current = controller
    const requestId = lookupRequestRef.current + 1
    lookupRequestRef.current = requestId

    const normalizedTerm = normalizeDictionaryTerm(cleanTerm)
    const cachedEntry = dictionaryEntries.find((entry) =>
      sameDictionaryLookup(entry, normalizedTerm, sourceLang, targetLang, cleanContext),
    )
    // If the cached entry was produced by a different provider/model, treat it
    // as stale — the user explicitly switched models, so a refresh is expected.
    const cacheIsCurrent = Boolean(
      cachedEntry && cachedEntry.provider === selectedProvider && cachedEntry.model === model,
    )
    const usableCache = cacheIsCurrent ? cachedEntry : null

    setError(null)
    setErrorRecoverable(false)
    if (usableCache && hasDictionaryDetails(usableCache)) {
      // Fully cached, current model — just promote it to the top of "Recent".
      const refreshed = createLookupEntry({
        id: usableCache.id,
        favorite: usableCache.favorite,
        result: usableCache.result,
        normalizedTerm,
        cleanTerm,
        cleanContext,
      })
      refreshed.cost = usableCache.cost
      addDictionaryEntry(refreshed)
      setSelectedEntryId(refreshed.id)
      setActiveListTab('recent')
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const lookupParams: DictionaryLookupParams = {
        term: cleanTerm,
        context: cleanContext,
        sourceLang,
        targetLang,
        provider: selectedProvider,
        model,
      }
      const preview: DictionaryLookupResult = usableCache
        ? { success: true as const, result: usableCache.result }
        : await dictionaryService.lookupPreview(lookupParams, { signal: controller.signal })

      if (requestId !== lookupRequestRef.current || controller.signal.aborted) return

      if (!preview.success || !preview.result) {
        if (preview.errorCode !== 'CANCELLED') {
          setErrorRecoverable(true)
          setError(localizeError(preview.errorCode, preview.error))
        }
        return
      }

      const entryId = usableCache?.id ?? createDictionaryEntryId()
      const favorite = usableCache?.favorite ?? false
      const previewEntry = createLookupEntry({
        id: entryId,
        favorite,
        result: preview.result,
        normalizedTerm,
        cleanTerm,
        cleanContext,
      })
      const previewCost = usableCache?.cost ?? estimateUsageCost({
        feature: 'dictionary',
        provider: selectedProvider,
        model,
        inputText: `${cleanTerm}\n${cleanContext}`,
        outputText: formatDictionaryEntry(previewEntry),
      })
      if (!usableCache) recordUsageCost(previewCost)
      previewEntry.cost = previewCost

      addDictionaryEntry(previewEntry)
      setSelectedEntryId(previewEntry.id)
      setActiveListTab('recent')
      setIsLoading(false)
      setIsEnriching(true)

      // Inner try/finally ensures the enriching indicator is cleared regardless
      // of whether lookupDetails succeeds, fails softly, or returns early due to
      // a stale request check. The outer try/catch/finally handles isLoading and
      // the abort ref — this only owns isEnriching.
      try {
        const detailed = await dictionaryService.lookupDetails(
          lookupParams,
          preview.result,
          { signal: controller.signal },
        )
        if (requestId !== lookupRequestRef.current || controller.signal.aborted) return
        if (!detailed.success || !detailed.result) {
          // Preview already shown — only surface a hard error for non-cancel cases.
          if (
            detailed.errorCode &&
            detailed.errorCode !== 'CANCELLED' &&
            detailed.errorCode !== 'INVALID_RESPONSE' &&
            detailed.errorCode !== 'TRUNCATED_RESPONSE'
          ) {
            setErrorRecoverable(true)
            setError(localizeError(detailed.errorCode, detailed.error))
          }
          return
        }
        const detailedEntry = createLookupEntry({
          id: entryId,
          favorite,
          result: detailed.result,
          normalizedTerm,
          cleanTerm,
          cleanContext,
        })
        const detailedCost = estimateUsageCost({
          feature: 'dictionary',
          provider: selectedProvider,
          model,
          inputText: `${cleanTerm}\n${cleanContext}\n${formatDictionaryEntry(previewEntry)}`,
          outputText: formatDictionaryEntry(detailedEntry),
        })
        recordUsageCost(detailedCost)
        detailedEntry.cost = combineUsageCosts([previewCost, detailedCost], 'dictionary')

        addDictionaryEntry(detailedEntry)
      } finally {
        if (requestId === lookupRequestRef.current) setIsEnriching(false)
      }
    } catch (err) {
      if (controller.signal.aborted) return
      if (requestId !== lookupRequestRef.current) return
      const message = err instanceof Error ? err.message : String(err ?? '')
      setErrorRecoverable(true)
      setError(message || t.dictionary_error_failed)
    } finally {
      if (requestId === lookupRequestRef.current) {
        setIsLoading(false)
        lookupAbortRef.current = null
      }
    }
  }

  // Runs after the render in which `term` already holds the handed-over word, so `runLookup` sees it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runLookup is recreated every render; only a new handoff should trigger it.
  useEffect(() => {
    if (handoffTerm === null || term !== handoffTerm) return
    setHandoffTerm(null)
    void runLookup()
  }, [handoffTerm, term])

  const copyEntry = async () => {
    if (!selectedEntry) return
    await navigator.clipboard?.writeText?.(formatDictionaryEntry(selectedEntry))
    setCopied(true)
    if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => { setCopied(false) }, COPY_CONFIRMATION_MS)
  }

  const reuseInTranslate = () => {
    if (!selectedEntry) return
    setLanguagePair('translate', { source: selectedEntry.sourceLang, target: selectedEntry.targetLang })
    setSourceText(selectedEntry.term)
    setTranslatedText('')
    setPhoneticText('')
    setActivePage('translate')
  }

  const deleteSelectedEntry = () => {
    if (!selectedEntry) return
    deleteDictionaryEntry(selectedEntry.id)
    setSelectedEntryId(null)
  }

  const closeSelectionLookup = () => {
    selectionAbortRef.current?.abort()
    selectionAbortRef.current = null
    setSelectionLookup(null)
  }

  /**
   * Look up text highlighted inside the current entry. The entry's target
   * language is kept so the user's preferred output language stays, but the
   * source is `auto` to bypass the same-language guard — the selected text may
   * be in either language depending on which section was highlighted.
   */
  const runSelectionLookup = async (text: string) => {
    const entry = selectedEntry
    const lookupTerm = text.trim()
    if (!entry || !lookupTerm) return

    // Cancel any prior selection lookup before kicking off a new one.
    selectionAbortRef.current?.abort()
    const controller = new AbortController()
    selectionAbortRef.current = controller
    const requestId = selectionRequestRef.current + 1
    selectionRequestRef.current = requestId

    setSelectionLookup({ term: lookupTerm, loading: true, result: null, error: null })

    const lookupContext = selectionLookupContext(entry)
    let lookup: DictionaryLookupResult
    try {
      lookup = await dictionaryService.lookup(
        {
          term: lookupTerm,
          context: lookupContext,
          sourceLang: 'auto',
          targetLang: entry.targetLang,
          provider: entry.provider,
          model: entry.model,
        },
        { signal: controller.signal },
      )
    } catch (err) {
      if (requestId !== selectionRequestRef.current || controller.signal.aborted) return
      const message = err instanceof Error ? err.message : String(err ?? '')
      setSelectionLookup({ term: lookupTerm, loading: false, result: null, error: message || t.dictionary_error_failed })
      return
    }

    if (requestId !== selectionRequestRef.current || controller.signal.aborted) return

    if (!lookup.success || !lookup.result) {
      if (lookup.errorCode === 'CANCELLED') return
      setSelectionLookup({
        term: lookupTerm,
        loading: false,
        result: null,
        error: lookup.error ?? t.dictionary_error_failed,
      })
      return
    }

    setSelectionLookup({ term: lookupTerm, loading: false, result: lookup.result, error: null })

    // Persist the result to history and record its cost.
    const saved: DictionaryEntry = {
      id: createDictionaryEntryId(),
      term: lookupTerm,
      normalizedTerm: normalizeDictionaryTerm(lookupTerm),
      context: lookupContext || undefined,
      sourceLang: 'auto',
      targetLang: entry.targetLang,
      provider: entry.provider,
      model: entry.model,
      createdAt: Date.now(),
      favorite: false,
      result: lookup.result,
    }
    const cost = estimateUsageCost({
      feature: 'dictionary',
      provider: entry.provider,
      model: entry.model,
      inputText: lookupTerm,
      outputText: formatDictionaryEntry(saved),
    })
    recordUsageCost(cost)
    saved.cost = cost
    addDictionaryEntry(saved)
  }

  return {
    // Input
    term,
    setTerm: updateTerm,
    context,
    setContext,
    maxTermChars: MAX_DICTIONARY_TERM_CHARS,
    maxContextChars: MAX_DICTIONARY_CONTEXT_CHARS,
    // Lookup state
    isLoading,
    isEnriching,
    error,
    errorRecoverable,
    clearError,
    runLookup,
    model,
    canSubmit: Boolean(model),
    // Selection
    selectedEntry,
    selectedEntryId,
    setSelectedEntryId,
    activeListTab,
    setActiveListTab,
    deleteSelectedEntry,
    // Actions
    copied,
    copyEntry,
    reuseInTranslate,
    // Selection lookup pop-up
    selectionLookup,
    runSelectionLookup,
    closeSelectionLookup,
  }
}

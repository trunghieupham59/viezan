import { useEffect, useRef, useState } from 'react'
import { DictionaryHistoryPanel, type DictionaryListTab } from '../components/dictionary/DictionaryHistoryPanel'
import { DictionaryResultPanel, type SelectionLookupSaveParams } from '../components/dictionary/DictionaryResultPanel'
import { DictionarySearchPanel } from '../components/dictionary/DictionarySearchPanel'
import { ModelSelector } from '../components/ModelSelector'
import { DictionaryWorkbenchTemplate } from '../components/templates'
import { Button } from '../components/ui/atoms'
import { GearIcon } from '../components/ui/icons'
import { RecoverableError } from '../components/ui/molecules'
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
import { formatModelName, getProviderDisplayName } from '../utils/modelDisplay'
import { combineUsageCosts, estimateUsageCost } from '../utils/usageCost'

function createDictionaryEntryId(): string {
  return createClientId('dict')
}

function formatDictionaryEntry(entry: DictionaryEntry): string {
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

export function DictionaryPage() {
  const t = useT()
  const {
    dictionaryEntries,
    addDictionaryEntry,
    toggleDictionaryFavorite,
    deleteDictionaryEntry,
    clearDictionaryHistory,
    sourceLang,
    targetLang,
    setSourceLang,
    setTargetLang,
    selectedProvider,
    selectedModels,
    setSourceText,
    setTranslatedText,
    setPhoneticText,
    setActivePage,
    openSettings,
    recordUsageCost,
  } = useAppStore()

  const [term, setTerm] = useState('')
  const [context, setContext] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isEnriching, setIsEnriching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorRecoverable, setErrorRecoverable] = useState(false)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(
    dictionaryEntries[0]?.id ?? null,
  )
  const [activeListTab, setActiveListTab] = useState<DictionaryListTab>('recent')
  const [copied, setCopied] = useState(false)
  const lookupRequestRef = useRef(0)
  const lookupAbortRef = useRef<AbortController | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Controls visibility of the AI config popup — mirrors TranslatePage. */
  const [showAIConfig, setShowAIConfig] = useState(false)
  const aiConfigRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showAIConfig) return
    const handleOutside = (e: MouseEvent) => {
      if (aiConfigRef.current && !aiConfigRef.current.contains(e.target as Node)) {
        setShowAIConfig(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [showAIConfig])

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

  // Cancel any in-flight lookup and clear the copy timer when the page unmounts.
  useEffect(() => {
    return () => {
      lookupAbortRef.current?.abort()
      lookupAbortRef.current = null
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

  const handleCopy = async () => {
    if (!selectedEntry) return
    await navigator.clipboard?.writeText?.(formatDictionaryEntry(selectedEntry))
    setCopied(true)
    if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => { setCopied(false) }, 1200)
  }

  const handleSelectionLookupComplete = ({ term: lookupTerm, context: lookupContext, sourceLang: src, targetLang: tgt, provider, model: mdl, result }: SelectionLookupSaveParams) => {
    const cleanTerm = lookupTerm.trim()
    const id = createDictionaryEntryId()
    const entry: DictionaryEntry = {
      id,
      term: cleanTerm,
      normalizedTerm: normalizeDictionaryTerm(cleanTerm),
      context: lookupContext || undefined,
      sourceLang: src,
      targetLang: tgt,
      provider,
      model: mdl,
      createdAt: Date.now(),
      favorite: false,
      result,
    }
    const cost = estimateUsageCost({
      feature: 'dictionary',
      provider,
      model: mdl,
      inputText: cleanTerm,
      outputText: formatDictionaryEntry(entry),
    })
    recordUsageCost(cost)
    entry.cost = cost
    addDictionaryEntry(entry)
  }

  const handleReuse = () => {
    if (!selectedEntry) return
    setSourceLang(selectedEntry.sourceLang)
    setTargetLang(selectedEntry.targetLang)
    setSourceText(selectedEntry.term)
    setTranslatedText('')
    setPhoneticText('')
    setActivePage('translate')
  }

  const dictionaryErrorContext = model
    ? t.translate_error_context(
        getProviderDisplayName(selectedProvider),
        formatModelName(selectedProvider, model),
      )
    : ''

  return (
    <DictionaryWorkbenchTemplate
      header={(
        <div className="page-section-header">
            <div className="flex-1 min-w-0">
              <h1 className="reliability-page-title text-base font-bold">{t.dictionary_title}</h1>
              <p className="reliability-page-subtitle mt-0.5 text-xs">{t.dictionary_subtitle}</p>
            </div>
            <div className="relative flex-shrink-0" ref={aiConfigRef}>
              <Button
                size="md"
                shape="icon"
                variant={showAIConfig ? 'primary' : 'neutral'}
                appearance={showAIConfig ? 'soft' : 'ghost'}
                onClick={() => setShowAIConfig((visible) => !visible)}
                title={t.translate_ai_config_title}
                aria-expanded={showAIConfig}
                aria-haspopup="dialog"
              >
                <GearIcon className="h-3.5 w-3.5"/>
              </Button>
              {showAIConfig && (
                <div
                  className="dictionary-ai-config-panel floating-panel ai-config-panel absolute top-full right-0 mt-2 z-50 p-4 flex flex-col gap-3"
                  role="dialog"
                  aria-label={t.translate_ai_config_title}
                >
                  <h2 className="popover-title">{t.translate_ai_config_title}</h2>
                  <ModelSelector/>
                </div>
              )}
            </div>
          </div>
      )}
      search={(
        <>
            <DictionarySearchPanel
              term={term}
              onTermChange={(value) => {
                setTerm(value)
                if (error) setError(null)
                setErrorRecoverable(false)
              }}
              context={context}
              onContextChange={setContext}
              sourceLang={sourceLang}
              onSourceLangChange={setSourceLang}
              targetLang={targetLang}
              onTargetLangChange={setTargetLang}
              isLoading={isLoading}
              canSubmit={Boolean(model)}
              error={errorRecoverable ? null : error}
              maxTermChars={MAX_DICTIONARY_TERM_CHARS}
              maxContextChars={MAX_DICTIONARY_CONTEXT_CHARS}
              onSubmit={()=>void runLookup()}
              t={t}
            />
            {error && errorRecoverable && (
              <div className="mt-2">
                <RecoverableError
                  message={error}
                  context={dictionaryErrorContext}
                  retryAction={{
                    label: t.dictionary_error_retry,
                    onClick: () => void runLookup(),
                    disabled: !term.trim() || !model || isLoading,
                  }}
                  alternativeAction={{
                    label: t.translate_error_choose_model,
                    onClick: () => setShowAIConfig(true),
                  }}
                  settingsAction={{
                    label: t.translate_error_open_settings,
                    onClick: openSettings,
                  }}
                  dismissLabel={t.translate_error_dismiss}
                  onDismiss={() => {
                    setError(null)
                    setErrorRecoverable(false)
                  }}
                />
              </div>
            )}
        </>
      )}
      result={(
              <DictionaryResultPanel
                entry={selectedEntry}
                copied={copied}
                isEnriching={isEnriching}
                onCopy={()=>void handleCopy()}
                onFavorite={()=>{if(selectedEntry)toggleDictionaryFavorite(selectedEntry.id)}}
                onReuse={handleReuse}
                onSelectionLookupComplete={handleSelectionLookupComplete}
                t={t}
              />
      )}
      resultLabel={t.dictionary_title}
      history={(
              <DictionaryHistoryPanel
                entries={dictionaryEntries}
                selectedEntryId={selectedEntry?.id??null}
                activeTab={activeListTab}
                onTabChange={setActiveListTab}
                onSelect={setSelectedEntryId}
                onToggleFavorite={toggleDictionaryFavorite}
                onDeleteSelected={()=>{if(!selectedEntry)return;deleteDictionaryEntry(selectedEntry.id);setSelectedEntryId(null)}}
                onClearHistory={clearDictionaryHistory}
                t={t}
              />
      )}
    />
  )
}

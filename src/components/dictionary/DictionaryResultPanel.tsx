import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/atoms'
import type { Translations } from '../../i18n'
import { dictionaryService } from '../../services/dictionaryService'
import type { DictionaryEntry, DictionaryResult, DictionaryTranslation, Provider } from '../../types'
import { CheckIcon, CopyIcon, ReuseIcon, SearchIcon, StarIcon, XIcon } from '../ui/icons'
import { DictionaryEmptyState } from './DictionaryEmptyState'

export interface SelectionLookupSaveParams {
  term: string
  context: string
  sourceLang: string
  targetLang: string
  provider: Provider
  model: string
  result: DictionaryResult
}

interface DictionaryResultPanelProps {
  entry: DictionaryEntry | null
  copied: boolean
  isEnriching?: boolean
  onCopy: () => void
  onFavorite: () => void
  onReuse: () => void
  /** Called after a successful selection lookup so the page can persist the result. */
  onSelectionLookupComplete?: (params: SelectionLookupSaveParams) => void
  t: Translations
}

function normalizeTranslationItem(item: DictionaryTranslation): DictionaryTranslation {
  return item
}

/**
 * Detect whether a pronunciation string is IPA-like (Latin + IPA extensions)
 * versus a native script reading (kana, hangul, han, devanagari, thai, …).
 * Only IPA-like values are wrapped in `/.../` slashes; native scripts are
 * shown as-is, which matches the convention dictionaries use.
 */
function isIpaLikePronunciation(value: string): boolean {
  if (!value) return false
  // If any non-Latin/Common character appears, treat as native script.
  try {
    return !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Hangul}\p{Script=Thai}\p{Script=Devanagari}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Cyrillic}]/u.test(value)
  } catch {
    // Older engines without Unicode property escapes — fall back to slashes.
    return true
  }
}

function formatPronunciation(value: string): string {
  const stripped = value.replace(/^\/|\/$/g, '').trim()
  if (!stripped) return ''
  return isIpaLikePronunciation(stripped) ? `/${stripped}/` : stripped
}

function getTranslationKey(item: DictionaryTranslation): string {
  return [
    item.text,
    item.pronunciation,
    item.partOfSpeech ?? '',
    item.meaning ?? '',
    item.usage ?? '',
    item.nuance ?? '',
    item.example ?? '',
    ...(item.examples ?? []),
    ...(item.collocations ?? []),
    ...(item.notes ?? []),
  ].join('\u001f')
}

function uniqueText(items: Array<string | undefined>): string[] {
  return [...new Set(items.map((item) => item?.trim()).filter((item): item is string => Boolean(item)))]
}

/**
 * Pair each text item with a unique, order-independent key (the text, plus an occurrence
 * counter for repeats) so list rows don't depend on the array index.
 */
function withStableKeys(items: string[], prefix: string): Array<{ key: string; item: string; position: number }> {
  const seen = new Map<string, number>()
  return items.map((item, position) => {
    const occurrence = (seen.get(item) ?? 0) + 1
    seen.set(item, occurrence)
    return { key: `${prefix}-${item}-${occurrence}`, item, position }
  })
}

function cleanSelectionText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 80)
}

/**
 * Renders the AI dictionary entry — headword + pronunciation +
 * part-of-speech chips, then a compact body of titled sections.
 *
 * Visual rhythm intentionally aligns with the rest of the app:
 * `surface-panel` + `section-label` + `toolbar-icon-button`.
 */
export function DictionaryResultPanel({
  entry,
  copied,
  isEnriching = false,
  onCopy,
  onFavorite,
  onReuse,
  onSelectionLookupComplete,
  t,
}: DictionaryResultPanelProps) {
  const resultBodyRef = useRef<HTMLDivElement>(null)
  const selectionRequestRef = useRef(0)
  const selectionAbortRef = useRef<AbortController | null>(null)
  const selectionTimerRef = useRef<number | null>(null)
  const [selectedTranslation, setSelectedTranslation] = useState<{
    entryId: string
    key: string
  } | null>(null)
  const [selectionAction, setSelectionAction] = useState<{
    text: string
    x: number
    y: number
  } | null>(null)
  const [selectionLookup, setSelectionLookup] = useState<{
    term: string
    loading: boolean
    result: DictionaryResult | null
    error: string | null
  } | null>(null)

  useEffect(() => {
    const handleResultSelection = () => {
      // Coalesce a burst of mouseup/keyup events into a single deferred check.
      if (selectionTimerRef.current !== null) {
        window.clearTimeout(selectionTimerRef.current)
      }
      selectionTimerRef.current = window.setTimeout(() => {
        selectionTimerRef.current = null
        const selection = window.getSelection()
        const text = cleanSelectionText(selection?.toString() ?? '')
        const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
        const container = range?.commonAncestorContainer
        const selectionNode = container?.nodeType === Node.TEXT_NODE ? container.parentElement : container
        const isInsideResult = Boolean(selectionNode && resultBodyRef.current?.contains(selectionNode))

        if (!text || !range || !isInsideResult) {
          setSelectionAction(null)
          return
        }

        const rect = typeof range.getBoundingClientRect === 'function'
          ? range.getBoundingClientRect()
          : { left: 24, top: 24, width: 0, height: 0 }
        setSelectionAction({
          text,
          x: Math.min(Math.max(rect.left + rect.width / 2, 24), window.innerWidth - 56),
          y: Math.min(Math.max(rect.top - 42, 24), window.innerHeight - 56),
        })
      })
    }

    document.addEventListener('mouseup', handleResultSelection)
    document.addEventListener('keyup', handleResultSelection)
    return () => {
      document.removeEventListener('mouseup', handleResultSelection)
      document.removeEventListener('keyup', handleResultSelection)
      if (selectionTimerRef.current !== null) {
        window.clearTimeout(selectionTimerRef.current)
        selectionTimerRef.current = null
      }
    }
  }, [])

  // Abort any in-flight selection lookup on unmount.
  useEffect(() => {
    return () => {
      selectionAbortRef.current?.abort()
      selectionAbortRef.current = null
    }
  }, [])

  if (!entry) {
    return <DictionaryEmptyState t={t} />
  }

  const result: DictionaryResult = entry.result
  const translations = result.translations.map(normalizeTranslationItem)
  const selectedTranslationKey = selectedTranslation?.entryId === entry.id ? selectedTranslation.key : null
  const activeTranslation =
    selectedTranslationKey === null
      ? null
      : translations.find((item) => getTranslationKey(item) === selectedTranslationKey) ?? null

  const closeSelectionLookup = () => {
    selectionAbortRef.current?.abort()
    selectionAbortRef.current = null
    setSelectionLookup(null)
  }

  const runSelectionLookup = async () => {
    if (!selectionAction) return
    const lookupTerm = selectionAction.text
    setSelectionAction(null)
    window.getSelection()?.removeAllRanges()

    // Cancel any prior selection lookup before kicking off a new one.
    selectionAbortRef.current?.abort()
    const controller = new AbortController()
    selectionAbortRef.current = controller
    const requestId = selectionRequestRef.current + 1
    selectionRequestRef.current = requestId

    setSelectionLookup({ term: lookupTerm, loading: true, result: null, error: null })

    // Use the entry's target language as the lookup target so we keep the
    // user's preferred output language, but mark the source as `auto` to
    // bypass the same-language guard — the selected text may be in either
    // language depending on which section the user highlighted.
    const lookup = await dictionaryService.lookup(
      {
        term: lookupTerm,
        context: `Selected inside dictionary entry "${entry.term}". Entry meaning: ${result.meaning}`,
        sourceLang: 'auto',
        targetLang: entry.targetLang,
        provider: entry.provider,
        model: entry.model,
      },
      { signal: controller.signal },
    )

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

    // Persist the result to history and record its cost via the page callback.
    const lookupContext = `Selected inside dictionary entry "${entry.term}". Entry meaning: ${result.meaning}`
    onSelectionLookupComplete?.({
      term: lookupTerm,
      context: lookupContext,
      sourceLang: 'auto',
      targetLang: entry.targetLang,
      provider: entry.provider,
      model: entry.model,
      result: lookup.result,
    })
  }

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-gray-200/90 px-5 pt-4 pb-3 dark:border-neutral-800">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-2xl font-semibold leading-tight text-gray-950 select-text dark:text-gray-50">
                {result.headword}
              </h2>
              {result.pronunciation && (
                <span className="font-mono text-sm text-gray-500 select-text dark:text-gray-400">
                  {formatPronunciation(result.pronunciation)}
                </span>
              )}
              {result.partOfSpeech.map((item) => (
                <span
                  key={item}
                  className="ui-token-badge"
                >
                  {item}
                </span>
              ))}
              {isEnriching && (
                <span
                  role="img"
                  aria-label={t.dictionary_enriching}
                  title={t.dictionary_enriching}
                  className="inline-flex h-2 w-2 flex-shrink-0 rounded-full bg-gray-400/60 dark:bg-gray-500/60"
                  style={{ animation: 'thinkingDot 1.2s ease-in-out infinite both' }}
                />
              )}
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1">
            <Button
              size="sm"
              shape="icon"
              aria-pressed={entry.favorite}
              variant={entry.favorite ? 'primary' : 'neutral'}
              appearance={entry.favorite ? 'soft' : 'ghost'}
              aria-label={entry.favorite ? t.dictionary_unfavorite : t.dictionary_favorite}
              type="button"
              onClick={onFavorite}
              title={entry.favorite ? t.dictionary_unfavorite : t.dictionary_favorite}
            >
              <StarIcon className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              shape="icon"
              variant={copied ? 'primary' : 'neutral'}
              appearance={copied ? 'soft' : 'ghost'}
              aria-label={copied ? t.dictionary_copied : t.dictionary_copy}
              type="button"
              onClick={onCopy}
              title={copied ? t.dictionary_copied : t.dictionary_copy}
            >
              {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
            </Button>
            <Button
              size="sm"
              shape="icon"
              variant="neutral"
              appearance="ghost"
              aria-label={t.dictionary_reuse_translate}
              type="button"
              onClick={onReuse}
              title={t.dictionary_reuse_translate}
            >
              <ReuseIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div
        ref={resultBodyRef}
        className="flex-1 space-y-5 overflow-auto px-5 py-4"
      >
        {/* Meaning — primary highlight, large readable type */}
        <section>
          <h3 className="section-label mb-1.5">{t.dictionary_meaning}</h3>
          <p className="ui-reader-text border-l-2 border-gray-500 pl-3 leading-7 select-text dark:border-gray-400 dark:text-gray-100">
            {result.meaning}
          </p>
        </section>

        {/* Translations — chip cluster */}
        {translations.length > 0 && (
          <section>
            <h3 className="section-label mb-2">{t.dictionary_translations}</h3>
            <div className="flex flex-wrap gap-1.5">
              {translations.map((item) => {
                const translationKey = getTranslationKey(item)
                const isSelected = selectedTranslationKey === translationKey
                const pronunciation = formatPronunciation(item.pronunciation)
                return (
                  <button
                    key={translationKey}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={`${t.dictionary_translation_detail}: ${item.text} ${pronunciation}`}
                    onClick={() => setSelectedTranslation(isSelected ? null : { entryId: entry.id, key: translationKey })}
                    className={`btn-secondary btn-stack-option ${
                      isSelected
                        ? 'btn-active'
                        : ''
                    }`}
                  >
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{item.text}</span>
                    {pronunciation && (
                      <span className="ui-meta mt-0.5 font-mono leading-none">
                        {pronunciation}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {activeTranslation && (() => {
              const translationExamples = uniqueText([
                ...(activeTranslation.examples ?? []),
                activeTranslation.example,
                ...((activeTranslation.examples?.length || activeTranslation.example)
                  ? []
                  : result.examples.slice(0, 3)),
              ])
              const translationNotes = uniqueText([
                ...(activeTranslation.notes ?? []),
                ...((activeTranslation.notes?.length ?? 0) > 0 ? [] : result.notes),
              ])
              return (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/25 px-6 py-8 backdrop-blur-[1px]">
                <button
                  type="button"
                  aria-label={t.dictionary_translation_close}
                  data-testid="dictionary-translation-backdrop"
                  onClick={() => setSelectedTranslation(null)}
                  className="absolute inset-0 cursor-default"
                />
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label={t.dictionary_translation_detail}
                  className="relative z-10 max-h-[82vh] w-full max-w-2xl overflow-hidden rounded-xl border border-gray-100 bg-white shadow-2xl shadow-gray-950/20 dark:border-gray-900/60 dark:bg-neutral-950 dark:shadow-black/45"
                >
                  <div className="flex items-start justify-between gap-4 border-b border-gray-200/90 px-5 py-4 dark:border-neutral-800">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <h4 className="text-xl font-semibold text-gray-950 select-text dark:text-gray-50">
                          {activeTranslation.text}
                        </h4>
                        <span className="font-mono text-sm text-gray-500 select-text dark:text-gray-400">
                          {formatPronunciation(activeTranslation.pronunciation)}
                        </span>
                        {activeTranslation.partOfSpeech && (
                          <span className="ui-token-badge">
                            {activeTranslation.partOfSpeech}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        {t.dictionary_translation_detail}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      shape="icon"
                      variant="neutral"
                      appearance="ghost"
                      type="button"
                      title={t.dictionary_translation_close}
                      aria-label={t.dictionary_translation_close}
                      onClick={() => setSelectedTranslation(null)}
                      className="flex-shrink-0"
                    >
                      <XIcon className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="max-h-[calc(82vh-84px)] space-y-4 overflow-auto px-5 py-4 text-sm leading-6 text-gray-700 dark:text-gray-300">
                    <section>
                      <h5 className="section-label mb-1.5">{t.dictionary_meaning}</h5>
                      <p className="ui-reader-text border-l-2 border-gray-500 pl-3 leading-7 select-text dark:border-gray-400 dark:text-gray-100">
                        {activeTranslation.meaning || result.meaning}
                      </p>
                    </section>

                    {(activeTranslation.usage || activeTranslation.nuance || result.notes[0]) && (
                      <section>
                        <h5 className="section-label mb-1.5">{t.dictionary_translation_usage}</h5>
                        <p className="select-text">
                          {activeTranslation.usage || activeTranslation.nuance || result.notes[0]}
                        </p>
                      </section>
                    )}

                    {activeTranslation.usage && activeTranslation.nuance && (
                      <section>
                        <h5 className="section-label mb-1.5">{t.dictionary_translation_nuance}</h5>
                        <p className="select-text">{activeTranslation.nuance}</p>
                      </section>
                    )}

                    {translationExamples.length > 0 && (
                      <section>
                        <h5 className="section-label mb-2">{t.dictionary_translation_example}</h5>
                        <ol className="space-y-1.5">
                          {translationExamples.map((item, idx) => (
                            <li key={`translation-example-${item}`} className="flex items-start gap-2.5 select-text">
                              <span
                                aria-hidden
                                className="ui-index-dot"
                              >
                                {idx + 1}
                              </span>
                              <span className="min-w-0 flex-1">{item}</span>
                            </li>
                          ))}
                        </ol>
                      </section>
                    )}

                    {activeTranslation.collocations && activeTranslation.collocations.length > 0 && (
                      <section>
                        <h5 className="section-label mb-2">{t.dictionary_translation_collocations}</h5>
                        <div className="flex flex-wrap gap-1.5">
                          {activeTranslation.collocations.map((item) => (
                            <span
                              key={`translation-collocation-${item}`}
                              className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 select-text dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-300"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </section>
                    )}

                    {translationNotes.length > 0 && (
                      <section>
                        <h5 className="section-label mb-2">{t.dictionary_notes}</h5>
                        <ul className="space-y-1.5">
                          {translationNotes.map((item) => (
                            <li key={`translation-note-${item}`} className="flex items-start gap-2.5 select-text">
                              <span
                                aria-hidden
                                className="mt-2 inline-block h-1 w-1 flex-shrink-0 rounded-full bg-gray-500 dark:bg-gray-400"
                              />
                              <span className="min-w-0 flex-1">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </div>
                </div>
              </div>
              )
            })()}
          </section>
        )}

        {/* Examples — clean numbered list */}
        {result.examples.length > 0 && (
          <section>
            <h3 className="section-label mb-2">{t.dictionary_examples}</h3>
            <ol className="space-y-1.5">
              {withStableKeys(result.examples, 'ex').map(({ key, item, position }) => (
                <li
                  key={key}
                  className="flex items-start gap-2.5 text-sm leading-6 text-gray-700 select-text dark:text-gray-300"
                >
                  <span
                    aria-hidden
                    className="ui-index-dot"
                  >
                    {position + 1}
                  </span>
                  <span className="min-w-0 flex-1">{item}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Notes */}
        {result.notes.length > 0 && (
          <section>
            <h3 className="section-label mb-2">{t.dictionary_notes}</h3>
            <ul className="space-y-1.5">
              {withStableKeys(result.notes, 'note').map(({ key, item }) => (
                <li
                  key={key}
                  className="flex items-start gap-2.5 text-sm leading-6 text-gray-700 select-text dark:text-gray-300"
                >
                  <span
                    aria-hidden
                    className="mt-2 inline-block h-1 w-1 flex-shrink-0 rounded-full bg-gray-500 dark:bg-gray-400"
                  />
                  <span className="min-w-0 flex-1">{item}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {selectionAction && (
        <Button
          size="lg"
          shape="icon"
          variant="neutral"
          appearance="ghost"
          type="button"
          title={t.dictionary_selection_lookup}
          aria-label={`${t.dictionary_selection_lookup}: ${selectionAction.text}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            void runSelectionLookup()
          }}
          className="fixed z-50"
          style={{ left: selectionAction.x, top: selectionAction.y }}
        >
          <SearchIcon className="h-4 w-4" />
        </Button>
      )}

      {selectionLookup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/25 px-6 py-8 backdrop-blur-[1px]">
          <button
            type="button"
            aria-label={t.dictionary_translation_close}
            data-testid="dictionary-selection-backdrop"
            onClick={closeSelectionLookup}
            className="absolute inset-0 cursor-default"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t.dictionary_selection_lookup}
            className="relative z-10 max-h-[82vh] w-full max-w-2xl overflow-hidden rounded-xl border border-gray-100 bg-white shadow-2xl shadow-gray-950/20 dark:border-gray-900/60 dark:bg-neutral-950 dark:shadow-black/45"
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-200/90 px-5 py-4 dark:border-neutral-800">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h4 className="text-xl font-semibold text-gray-950 select-text dark:text-gray-50">
                    {selectionLookup.result?.headword ?? selectionLookup.term}
                  </h4>
                  {selectionLookup.result?.pronunciation && (
                    <span className="font-mono text-sm text-gray-500 select-text dark:text-gray-400">
                      {formatPronunciation(selectionLookup.result.pronunciation)}
                    </span>
                  )}
                  {selectionLookup.result?.partOfSpeech.map((item) => (
                    <span
                      key={`selection-pos-${item}`}
                      className="ui-token-badge"
                    >
                      {item}
                    </span>
                  ))}
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                  {selectionLookup.loading && (
                    <span
                      aria-hidden
                      className="inline-flex h-2 w-2 flex-shrink-0 rounded-full bg-gray-500/80 dark:bg-gray-400/80"
                      style={{ animation: 'thinkingDot 1.2s ease-in-out infinite both' }}
                    />
                  )}
                  <span>
                    {selectionLookup.loading ? t.dictionary_selection_lookup_loading : t.dictionary_selection_lookup}
                  </span>
                </p>
              </div>
              <Button
                size="sm"
                shape="icon"
                variant="neutral"
                appearance="ghost"
                type="button"
                title={t.dictionary_translation_close}
                aria-label={t.dictionary_translation_close}
                onClick={closeSelectionLookup}
                className="flex-shrink-0"
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>

            <div className="max-h-[calc(82vh-84px)] space-y-5 overflow-auto px-5 py-4 text-sm leading-6 text-gray-700 dark:text-gray-300">
              {selectionLookup.loading && (
                <div aria-busy="true" aria-live="polite" className="space-y-5">
                  {/* Meaning skeleton — mirrors the real "border-l + paragraph" block */}
                  <section>
                    <div className="mb-2 h-3 w-16 rounded-full skeleton-shimmer" />
                    <div className="space-y-2 border-l-2 border-gray-500/40 pl-3 dark:border-gray-400/40">
                      <div className="h-3 w-11/12 rounded-full skeleton-shimmer" />
                      <div className="h-3 w-3/4 rounded-full skeleton-shimmer" />
                    </div>
                  </section>

                  {/* Translations skeleton — chip cluster matching real chips */}
                  <section>
                    <div className="mb-2 h-3 w-20 rounded-full skeleton-shimmer" />
                    <div className="flex flex-wrap gap-1.5">
                      <div className="h-9 w-20 rounded-md skeleton-shimmer" />
                      <div className="h-9 w-24 rounded-md skeleton-shimmer" />
                      <div className="h-9 w-16 rounded-md skeleton-shimmer" />
                    </div>
                  </section>
                </div>
              )}

              {selectionLookup.error && (
                <p className="ui-error-box skeleton-fade-in">
                  {selectionLookup.error}
                </p>
              )}

              {selectionLookup.result && (
                <div className="skeleton-fade-in space-y-5">
                  <section>
                    <h5 className="section-label mb-1.5">{t.dictionary_meaning}</h5>
                    <p className="ui-reader-text border-l-2 border-gray-500 pl-3 leading-7 select-text dark:border-gray-400 dark:text-gray-100">
                      {selectionLookup.result.meaning}
                    </p>
                  </section>

                  {selectionLookup.result.translations.length > 0 && (
                    <section>
                      <h5 className="section-label mb-2">{t.dictionary_translations}</h5>
                      <div className="flex flex-wrap gap-1.5">
                        {selectionLookup.result.translations.map((item) => (
                          <span
                            key={`selection-translation-${item.text}-${item.pronunciation}`}
                            className="inline-flex flex-col rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-left shadow-sm shadow-gray-900/5 select-text dark:border-neutral-800 dark:bg-neutral-900"
                          >
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{item.text}</span>
                            <span className="ui-meta mt-0.5 font-mono leading-none">
                              {formatPronunciation(item.pronunciation)}
                            </span>
                          </span>
                        ))}
                      </div>
                    </section>
                  )}

                  {selectionLookup.result.examples.length > 0 && (
                    <section>
                      <h5 className="section-label mb-2">{t.dictionary_examples}</h5>
                      <ol className="space-y-1.5">
                        {withStableKeys(selectionLookup.result.examples, 'selection-example').map(({ key, item, position }) => (
                          <li key={key} className="flex items-start gap-2.5 select-text">
                            <span
                              aria-hidden
                              className="ui-index-dot"
                            >
                              {position + 1}
                            </span>
                            <span className="min-w-0 flex-1">{item}</span>
                          </li>
                        ))}
                      </ol>
                    </section>
                  )}

                  {selectionLookup.result.notes.length > 0 && (
                    <section>
                      <h5 className="section-label mb-2">{t.dictionary_notes}</h5>
                      <ul className="space-y-1.5">
                        {withStableKeys(selectionLookup.result.notes, 'selection-note').map(({ key, item }) => (
                          <li key={key} className="flex items-start gap-2.5 select-text">
                            <span
                              aria-hidden
                              className="mt-2 inline-block h-1 w-1 flex-shrink-0 rounded-full bg-gray-500 dark:bg-gray-400"
                            />
                            <span className="min-w-0 flex-1">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

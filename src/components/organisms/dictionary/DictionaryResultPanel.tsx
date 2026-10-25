import { useEffect, useRef, useState } from 'react'
import type { DictionarySelectionLookupState } from '../../../hooks/useDictionaryLookup'
import type { Translations } from '../../../i18n'
import type { DictionaryEntry, DictionaryResult, DictionaryTranslation } from '../../../types'
import { formatDictionaryPronunciation } from '../../../utils/dictionary'
import { tpl } from '../../../utils/tpl'
import { Button, SkeletonBlock } from '../../ui/atoms'
import { CheckIcon, CopyIcon, ReuseIcon, SearchIcon, StarIcon } from '../../ui/icons'
import {
  DialogShell,
  type DictionaryEntryChip,
  DictionaryEntrySections,
  ThinkingDots,
} from '../../ui/molecules'
import { DictionaryEmptyState } from './DictionaryEmptyState'

export interface DictionaryResultPanelProps {
  entry: DictionaryEntry | null
  copied: boolean
  isEnriching?: boolean
  /** A main lookup is in flight: show a skeleton shaped like the entry instead of the previous one. */
  isLoading?: boolean
  /** Bumped after a lookup finishes so keyboard focus moves to the new headword. */
  focusRequest?: number
  onCopy: () => void
  onFavorite: () => void
  onReuse: () => void
  /** Fills the term field from an empty-state sample chip. */
  onHintSelect?: (hint: string) => void
  /** State of the pop-up that looks up highlighted result text; `null` when closed. */
  selectionLookup: DictionarySelectionLookupState | null
  /** Called with the highlighted text when the user asks to look it up. */
  onSelectionLookup: (text: string) => void
  onCloseSelectionLookup: () => void
  t: Translations
}

/** Where the floating selection button may sit, in viewport pixels. */
const SELECTION_BUTTON_MARGIN = 24
const SELECTION_BUTTON_CLEARANCE = 56
const SELECTION_BUTTON_LIFT = 42
const SELECTION_TEXT_MAX_CHARS = 80

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

function cleanSelectionText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, SELECTION_TEXT_MAX_CHARS)
}

function toChips(translations: DictionaryTranslation[]): DictionaryEntryChip[] {
  return translations.map((item) => ({
    key: getTranslationKey(item),
    text: item.text,
    pronunciation: formatDictionaryPronunciation(item.pronunciation),
  }))
}

function EntryHeadline({ result, isEnriching, enrichingLabel }: {
  result: Pick<DictionaryResult, 'headword' | 'pronunciation' | 'partOfSpeech'>
  isEnriching?: boolean
  enrichingLabel?: string
}) {
  const pronunciation = formatDictionaryPronunciation(result.pronunciation)
  return (
    <>
      <span className="dictionary-headword">{result.headword}</span>
      {pronunciation && <span className="dictionary-pronunciation">{pronunciation}</span>}
      {result.partOfSpeech.map((item) => (
        <span key={item} className="dictionary-pos">{item}</span>
      ))}
      {isEnriching && enrichingLabel && (
        <span role="img" aria-label={enrichingLabel} title={enrichingLabel} className="dictionary-enriching">
          <ThinkingDots tone="muted" />
        </span>
      )}
    </>
  )
}

/** Placeholder shaped like an entry: the meaning quote, then the chip row. */
function DictionarySkeleton({ label }: { label?: string }) {
  return (
    <div aria-busy="true" className="dictionary-skeleton">
      {label && <span className="sr-only" role="status">{label}</span>}
      <div className="dictionary-skeleton-section">
        <SkeletonBlock shape="line" className="dictionary-skeleton-label" />
        <div className="dictionary-skeleton-quote">
          <SkeletonBlock shape="line" className="dictionary-skeleton-wide" />
          <SkeletonBlock shape="line" className="dictionary-skeleton-narrow" />
        </div>
      </div>
      <div className="dictionary-skeleton-section">
        <SkeletonBlock shape="line" className="dictionary-skeleton-label" />
        <div className="dictionary-skeleton-chips">
          <SkeletonBlock shape="control" />
          <SkeletonBlock shape="control" />
          <SkeletonBlock shape="control" />
        </div>
      </div>
    </div>
  )
}

/**
 * Renders the AI dictionary entry — headword, pronunciation and part-of-speech
 * tokens, a toolbar, then the shared entry sections. Highlighting text inside
 * the body offers a secondary lookup; translation chips open a detail pop-up.
 */
/** At most this many translations get an inline nuance paragraph. */
const NUANCE_PARAGRAPHS_MAX = 3

export function DictionaryResultPanel({
  entry,
  copied,
  isEnriching = false,
  isLoading = false,
  focusRequest = 0,
  onCopy,
  onFavorite,
  onReuse,
  onHintSelect,
  selectionLookup,
  onSelectionLookup,
  onCloseSelectionLookup,
  t,
}: DictionaryResultPanelProps) {
  const resultBodyRef = useRef<HTMLDivElement>(null)
  const headwordRef = useRef<HTMLHeadingElement>(null)
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
          : { left: SELECTION_BUTTON_MARGIN, top: SELECTION_BUTTON_MARGIN, width: 0, height: 0 }
        setSelectionAction({
          text,
          x: Math.min(
            Math.max(rect.left + rect.width / 2, SELECTION_BUTTON_MARGIN),
            window.innerWidth - SELECTION_BUTTON_CLEARANCE,
          ),
          y: Math.min(
            Math.max(rect.top - SELECTION_BUTTON_LIFT, SELECTION_BUTTON_MARGIN),
            window.innerHeight - SELECTION_BUTTON_CLEARANCE,
          ),
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

  // Focus only when a new request arrives.
  useEffect(() => {
    if (focusRequest > 0) headwordRef.current?.focus()
  }, [focusRequest])

  // The headword is announced politely when a new entry arrives (not while loading).
  const announcement = !isLoading && entry ? entry.result.headword : ''
  const announcer = <p className="sr-only" aria-live="polite" data-testid="dictionary-result-announcer">{announcement}</p>

  if (isLoading) {
    return (
      <>
        {announcer}
        <div className="dictionary-result-body">
          <DictionarySkeleton label={t.dictionary_lookup_loading} />
        </div>
      </>
    )
  }

  if (!entry) {
    return (
      <>
        {announcer}
        <DictionaryEmptyState t={t} onHintSelect={onHintSelect} />
      </>
    )
  }

  const result = entry.result
  const chips = toChips(result.translations)
  const selectedTranslationKey = selectedTranslation?.entryId === entry.id ? selectedTranslation.key : null
  const activeTranslation =
    selectedTranslationKey === null
      ? null
      : result.translations.find((item) => getTranslationKey(item) === selectedTranslationKey) ?? null

  const requestSelectionLookup = () => {
    if (!selectionAction) return
    const text = selectionAction.text
    setSelectionAction(null)
    window.getSelection()?.removeAllRanges()
    onSelectionLookup(text)
  }

  const activeTranslationExamples = activeTranslation
    ? uniqueText([
        ...(activeTranslation.examples ?? []),
        activeTranslation.example,
        ...((activeTranslation.examples?.length || activeTranslation.example)
          ? []
          : result.examples.slice(0, 3)),
      ])
    : []
  const activeTranslationNotes = activeTranslation
    ? uniqueText([
        ...(activeTranslation.notes ?? []),
        ...((activeTranslation.notes?.length ?? 0) > 0 ? [] : result.notes),
      ])
    : []
  const activeTranslationParagraphs = activeTranslation
    ? [
        {
          key: 'usage',
          label: t.dictionary_translation_usage,
          text: activeTranslation.usage || activeTranslation.nuance || result.notes[0] || '',
        },
        {
          key: 'nuance',
          label: t.dictionary_translation_nuance,
          text: activeTranslation.usage && activeTranslation.nuance ? activeTranslation.nuance : '',
        },
      ].filter((paragraph) => paragraph.text)
    : []

  // How each translation differs, read inline; the chip pop-up keeps the full detail.
  const nuanceParagraphs = result.translations
    .filter((translation) => translation.nuance || translation.usage)
    .slice(0, NUANCE_PARAGRAPHS_MAX)
    .map((translation, index) => ({
      key: `nuance-${index}-${translation.text}`,
      label: tpl(t.dictionary_translation_nuance_of, { text: translation.text }),
      text: translation.nuance || translation.usage || '',
    }))

  return (
    <>
      {announcer}
      <header className="dictionary-result-header">
        <h2 ref={headwordRef} tabIndex={-1} className="dictionary-result-title">
          <EntryHeadline result={result} isEnriching={isEnriching} enrichingLabel={t.dictionary_enriching} />
        </h2>
        <div className="dictionary-result-actions">
          <Button
            size="sm"
            shape="icon"
            aria-pressed={entry.favorite}
            variant={entry.favorite ? 'primary' : 'neutral'}
            appearance={entry.favorite ? 'soft' : 'ghost'}
            aria-label={entry.favorite ? t.dictionary_unfavorite : t.dictionary_favorite}
            onClick={onFavorite}
            title={entry.favorite ? t.dictionary_unfavorite : t.dictionary_favorite}
          >
            <StarIcon />
          </Button>
          <Button
            size="sm"
            shape="icon"
            variant={copied ? 'primary' : 'neutral'}
            appearance={copied ? 'soft' : 'ghost'}
            aria-label={copied ? t.dictionary_copied : t.dictionary_copy}
            onClick={onCopy}
            title={copied ? t.dictionary_copied : t.dictionary_copy}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </Button>
          <Button
            size="sm"
            shape="icon"
            variant="neutral"
            appearance="ghost"
            aria-label={t.dictionary_reuse_translate}
            onClick={onReuse}
            title={t.dictionary_reuse_translate}
          >
            <ReuseIcon />
          </Button>
        </div>
      </header>

      <div ref={resultBodyRef} className="dictionary-result-body">
        <DictionaryEntrySections
          meaningLabel={entry.context?.trim() ? t.dictionary_meaning_in_context : t.dictionary_meaning}
          meaning={result.meaning}
          translationsLabel={t.dictionary_translations}
          translations={chips}
          selectedTranslationKey={selectedTranslationKey}
          onTranslationToggle={(key) =>
            setSelectedTranslation(selectedTranslationKey === key ? null : { entryId: entry.id, key })}
          translationChipLabel={(chip) =>
            `${t.dictionary_translation_detail}: ${chip.text} ${chip.pronunciation ?? ''}`.trimEnd()}
          paragraphs={nuanceParagraphs}
          examplesLabel={t.dictionary_examples}
          examples={result.examples}
          notesLabel={t.dictionary_notes}
          notes={result.notes}
        />
      </div>

      {selectionAction && (
        <Button
          size="lg"
          shape="icon"
          variant="neutral"
          appearance="outline"
          title={t.dictionary_selection_lookup}
          aria-label={`${t.dictionary_selection_lookup}: ${selectionAction.text}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={requestSelectionLookup}
          className="dictionary-selection-action"
          // Computed viewport position of the floating action; the only inline style in the feature.
          style={{ left: selectionAction.x, top: selectionAction.y }}
        >
          <SearchIcon />
        </Button>
      )}

      {activeTranslation && (
        <DialogShell
          size="lg"
          label={t.dictionary_translation_detail}
          title={(
            <EntryHeadline
              result={{
                headword: activeTranslation.text,
                pronunciation: activeTranslation.pronunciation,
                partOfSpeech: activeTranslation.partOfSpeech ? [activeTranslation.partOfSpeech] : [],
              }}
            />
          )}
          subtitle={t.dictionary_translation_detail}
          closeLabel={t.dictionary_translation_close}
          onClose={() => setSelectedTranslation(null)}
          backdropTestId="dictionary-translation-backdrop"
        >
          <DictionaryEntrySections
            meaningLabel={t.dictionary_meaning}
            meaning={activeTranslation.meaning || result.meaning}
            paragraphs={activeTranslationParagraphs}
            examplesLabel={t.dictionary_translation_example}
            examples={activeTranslationExamples}
            phrasesLabel={t.dictionary_translation_collocations}
            phrases={activeTranslation.collocations ?? []}
            notesLabel={t.dictionary_notes}
            notes={activeTranslationNotes}
          />
        </DialogShell>
      )}

      {selectionLookup && (
        <DialogShell
          size="lg"
          label={t.dictionary_selection_lookup}
          title={(
            <EntryHeadline
              result={selectionLookup.result ?? { headword: selectionLookup.term, pronunciation: '', partOfSpeech: [] }}
            />
          )}
          subtitle={(
            <>
              {selectionLookup.loading && <ThinkingDots tone="muted" />}
              <span>{selectionLookup.loading ? t.dictionary_selection_lookup_loading : t.dictionary_selection_lookup}</span>
            </>
          )}
          closeLabel={t.dictionary_translation_close}
          onClose={onCloseSelectionLookup}
          backdropTestId="dictionary-selection-backdrop"
        >
          {selectionLookup.loading && <DictionarySkeleton />}

          {selectionLookup.result && (
            <div className="dictionary-fade-in">
              <DictionaryEntrySections
                meaningLabel={t.dictionary_meaning}
                meaning={selectionLookup.result.meaning}
                translationsLabel={t.dictionary_translations}
                translations={toChips(selectionLookup.result.translations)}
                examplesLabel={t.dictionary_examples}
                examples={selectionLookup.result.examples}
                notesLabel={t.dictionary_notes}
                notes={selectionLookup.result.notes}
              />
            </div>
          )}
        </DialogShell>
      )}
    </>
  )
}

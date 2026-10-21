import { useEffect, useRef, useState } from 'react'
import type { Translations } from '../../../i18n'
import { Button, Textarea } from '../../ui/atoms'
import { BookIcon, ChevronDownIcon, PlusIcon, RefreshIcon } from '../../ui/icons'
import { FilterInput } from '../../ui/molecules'
import { LanguagePairBar } from '../LanguagePairBar'

export interface DictionarySearchPanelProps {
  term: string
  onTermChange: (value: string) => void
  context: string
  onContextChange: (value: string) => void
  /** Both sides change together so a recent-pair chip is one update. */
  onLanguagePairChange: (pair: { source: string; target: string }) => void
  isLoading: boolean
  canSubmit: boolean
  /** Tooltip explaining a disabled submit, e.g. no model selected. */
  cannotSubmitReason?: string
  maxTermChars: number
  maxContextChars: number
  onSubmit: () => void
  t: Translations
}

/**
 * Command-bar style search for the Dictionary screen: language pair → search
 * field → submit on one row, with an optional context box that opens as a
 * low-key disclosure underneath.
 */
export function DictionarySearchPanel({
  term,
  onTermChange,
  context,
  onContextChange,
  onLanguagePairChange,
  isLoading,
  canSubmit,
  cannotSubmitReason,
  maxTermChars,
  maxContextChars,
  onSubmit,
  t,
}: DictionarySearchPanelProps) {
  const [contextOpen, setContextOpen] = useState(Boolean(context))
  const inputRef = useRef<HTMLInputElement>(null)

  // Initial focus — explicit + scoped (passes biome a11y/noAutofocus).
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Auto-open the context box when context becomes non-empty from the outside
  // (e.g. when a history entry with context is selected).
  useEffect(() => {
    if (context) setContextOpen(true)
  }, [context])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit()
  }

  const termLength = term.length
  const termOver = termLength > maxTermChars
  const contextLength = context.length
  const contextOver = contextLength > maxContextChars
  const submitDisabled = isLoading || !canSubmit

  return (
    <form onSubmit={handleSubmit} className="dictionary-search">
      <div className="dictionary-command-bar">
        <LanguagePairBar scope="dictionary" density="field" onPairChange={onLanguagePairChange} />

        <FilterInput
          ref={inputRef}
          size="md"
          value={term}
          onValueChange={onTermChange}
          placeholder={t.dictionary_term_placeholder}
          aria-label={t.dictionary_term_label}
          clearLabel={t.history_search_clear}
          invalid={termOver}
          wrapperClassName="dictionary-term-field"
          trailing={termLength > 0 ? (
            <span data-invalid={termOver || undefined}>{termLength}/{maxTermChars}</span>
          ) : undefined}
        />

        <Button
          size="md"
          shape="rect"
          variant="primary"
          appearance="solid"
          type="submit"
          disabled={submitDisabled}
          title={!canSubmit && !isLoading ? cannotSubmitReason : undefined}
          // The visible label hides at narrow widths; the name must survive that.
          aria-label={isLoading ? t.dictionary_lookup_loading : t.dictionary_lookup}
          className="dictionary-submit"
        >
          {isLoading ? <RefreshIcon className="dictionary-submit-spinner" /> : <BookIcon />}
          <span className="dictionary-submit-label">
            {isLoading ? t.dictionary_lookup_loading : t.dictionary_lookup}
          </span>
        </Button>
      </div>

      <div className="dictionary-context-row">
        <Button
          size="sm"
          shape="rect"
          variant="neutral"
          appearance="ghost"
          onClick={() => setContextOpen((open) => !open)}
          aria-expanded={contextOpen}
        >
          {contextOpen ? <ChevronDownIcon /> : <PlusIcon />}
          <span>{t.dictionary_context_label}</span>
          {context.trim() && <span className="dictionary-context-count">{context.trim().length}</span>}
        </Button>
      </div>

      {contextOpen && (
        <div className="dictionary-context">
          <Textarea
            value={context}
            onChange={(event) => onContextChange(event.target.value)}
            placeholder={t.dictionary_context_placeholder}
            aria-label={t.dictionary_context_label}
            aria-invalid={contextOver || undefined}
            className="dictionary-context-field"
          />
          {contextLength > 0 && (
            <span className="dictionary-context-meta" data-invalid={contextOver || undefined}>
              {contextLength}/{maxContextChars}
            </span>
          )}
        </div>
      )}

    </form>
  )
}

import { useEffect, useId, useRef } from 'react'
import type { Translations } from '../../../i18n'
import { Button, Textarea } from '../../ui/atoms'
import { BookIcon, RefreshIcon } from '../../ui/icons'
import { FilterInput } from '../../ui/molecules'

export interface DictionarySearchPanelProps {
  term: string
  onTermChange: (value: string) => void
  context: string
  onContextChange: (value: string) => void
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
 * The Dictionary lookup column: the term, an always-visible optional context
 * (the sentence or field the word came from), then one full-width Look up.
 * The language pair lives in the page header.
 */
export function DictionarySearchPanel({
  term,
  onTermChange,
  context,
  onContextChange,
  isLoading,
  canSubmit,
  cannotSubmitReason,
  maxTermChars,
  maxContextChars,
  onSubmit,
  t,
}: DictionarySearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const contextLabelId = useId()
  const termLabelId = useId()

  // Initial focus — explicit + scoped (passes biome a11y/noAutofocus).
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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
      <span id={termLabelId} className="dictionary-term-label">{t.dictionary_term_label}</span>
      <FilterInput
        ref={inputRef}
        size="md"
        value={term}
        onValueChange={onTermChange}
        placeholder={t.dictionary_term_placeholder}
        aria-labelledby={termLabelId}
        clearLabel={t.history_search_clear}
        invalid={termOver}
        wrapperClassName="dictionary-term-field"
        trailing={termLength > 0 ? (
          <span data-invalid={termOver || undefined}>{termLength}/{maxTermChars}</span>
        ) : undefined}
      />

      <div className="dictionary-context">
        <span id={contextLabelId} className="dictionary-context-label">
          {t.dictionary_context_label} <span className="dictionary-context-optional">{t.dictionary_context_optional}</span>
        </span>
        <Textarea
          value={context}
          onChange={(event) => onContextChange(event.target.value)}
          placeholder={t.dictionary_context_placeholder}
          aria-labelledby={contextLabelId}
          aria-invalid={contextOver || undefined}
          className="dictionary-context-field"
        />
        {contextLength > 0 && (
          <span className="dictionary-context-meta" data-invalid={contextOver || undefined}>
            {contextLength}/{maxContextChars}
          </span>
        )}
      </div>

      <Button
        size="md"
        shape="rect"
        variant="primary"
        appearance="solid"
        type="submit"
        disabled={submitDisabled}
        title={!canSubmit && !isLoading ? cannotSubmitReason : undefined}
        aria-label={isLoading ? t.dictionary_lookup_loading : t.dictionary_lookup}
        className="dictionary-submit"
      >
        {isLoading ? <RefreshIcon className="dictionary-submit-spinner" /> : <BookIcon />}
        <span className="dictionary-submit-label">
          {isLoading ? t.dictionary_lookup_loading : t.dictionary_lookup}
        </span>
      </Button>
    </form>
  )
}

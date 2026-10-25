import { type ReactNode, useEffect, useId, useRef } from 'react'
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
  /** Validation message shown under the term field (sets aria-invalid). */
  termError?: string
  /** Validation message shown under the context field (sets aria-invalid). */
  contextError?: string
  /** A row above Look up explaining why it cannot run yet (e.g. no model), with its fix. */
  notice?: ReactNode
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
  termError,
  contextError,
  notice,
  onSubmit,
  t,
}: DictionarySearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const contextLabelId = useId()
  const termLabelId = useId()
  const termErrorId = useId()
  const contextErrorId = useId()

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
        invalid={termOver || Boolean(termError)}
        aria-describedby={termError ? termErrorId : undefined}
        wrapperClassName="dictionary-term-field"
        trailing={termLength > 0 ? (
          <span data-invalid={termOver || undefined}>{termLength}/{maxTermChars}</span>
        ) : undefined}
      />
      {termError && <p id={termErrorId} className="dictionary-field-error" role="alert">{termError}</p>}

      <div className="dictionary-context">
        <span id={contextLabelId} className="dictionary-context-label">
          {t.dictionary_context_label} <span className="dictionary-context-optional">{t.dictionary_context_optional}</span>
        </span>
        <Textarea
          value={context}
          onChange={(event) => onContextChange(event.target.value)}
          placeholder={t.dictionary_context_placeholder}
          aria-labelledby={contextLabelId}
          aria-invalid={contextOver || Boolean(contextError) || undefined}
          aria-describedby={contextError ? contextErrorId : undefined}
          className="dictionary-context-field"
        />
        {contextLength > 0 && (
          <span className="dictionary-context-meta" data-invalid={contextOver || undefined}>
            {contextLength}/{maxContextChars}
          </span>
        )}
        {contextError && <p id={contextErrorId} className="dictionary-field-error" role="alert">{contextError}</p>}
      </div>

      {notice}

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

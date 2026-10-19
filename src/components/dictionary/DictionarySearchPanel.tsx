import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/atoms'
import type { Translations } from '../../i18n'
import { LanguagePairBar } from '../organisms'
import {
  AlertTriangleIcon,
  BookIcon,
  ChevronDownIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  XIcon,
} from '../ui/icons'

interface DictionarySearchPanelProps {
  term: string
  onTermChange: (value: string) => void
  context: string
  onContextChange: (value: string) => void
  /** Both sides change together so a recent-pair chip is one update. */
  onLanguagePairChange: (pair: { source: string; target: string }) => void
  isLoading: boolean
  canSubmit: boolean
  error: string | null
  maxTermChars: number
  maxContextChars: number
  onSubmit: () => void
  t: Translations
}

/**
 * Compact "command-bar" style search for the Dictionary screen.
 *
 * Visually it reads as a single elevated input row containing every
 * primary control: language pair → search field → submit.  An optional
 * context box opens inline as a single-row disclosure underneath, keeping
 * the panel quiet by default.
 */
export function DictionarySearchPanel({
  term,
  onTermChange,
  context,
  onContextChange,
  onLanguagePairChange,
  isLoading,
  canSubmit,
  error,
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

  const charLength = term.length
  const isCharOver = charLength > maxTermChars

  return (
    <form onSubmit={handleSubmit} className="flex-shrink-0 space-y-2">
      {/* ── Hero command bar ───────────────────────────────────────────── */}
      <div className="surface-panel surface-panel-focus">
        <div className="flex items-center gap-1.5 p-1.5">
          {/* Language pair — one connected inline control, shared with Translate and Live */}
          <LanguagePairBar scope="dictionary" density="inline" onPairChange={onLanguagePairChange} />

          <span aria-hidden className="h-5 w-px flex-shrink-0 bg-gray-200 dark:bg-neutral-800" />

          {/* Search input */}
          <div className="relative flex-1 min-w-0">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              ref={inputRef}
              value={term}
              onChange={(e) => onTermChange(e.target.value)}
              placeholder={t.dictionary_term_placeholder}
              aria-label={t.dictionary_term_label ?? t.dictionary_term_placeholder}
              aria-invalid={isCharOver || undefined}
              className="h-9 w-full rounded-md border-0 bg-transparent pl-8 pr-16 text-sm text-gray-900 outline-none placeholder:text-gray-400 select-text dark:text-gray-50 dark:placeholder:text-gray-600"
            />
            {/* Char counter inside input — only shown when typing */}
            {charLength > 0 && (
              <span
                className={`ui-micro pointer-events-none absolute top-1/2 -translate-y-1/2 font-medium tabular-nums ${
                  isCharOver ? 'ui-error-text' : 'text-gray-300 dark:text-gray-600'
                }`}
                style={{ right: '2rem' }}
              >
                {charLength}/{maxTermChars}
              </span>
            )}
            {term && (
              <Button
                size="xs"
                shape="icon"
                variant="neutral"
                appearance="ghost"
                aria-label={t.history_search_clear}
                type="button"
                onClick={() => onTermChange('')}
                title={t.history_search_clear}
                className="absolute right-1.5 top-1/2 -translate-y-1/2"
              >
                <XIcon className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Submit */}
          <Button
            size="md"
            shape="rect"
            variant="primary"
            appearance="solid"
            type="submit"
            disabled={isLoading || !canSubmit}
            className="flex-shrink-0"
          >
            {isLoading ? (
              <RefreshIcon className="h-3.5 w-3.5 spinner" />
            ) : (
              <BookIcon className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {isLoading ? t.dictionary_lookup_loading : t.dictionary_lookup}
            </span>
          </Button>
        </div>
      </div>

      {/* ── Context disclosure (inline, low-key) ──────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-1">
        <Button
          size="sm"
          shape="rect"
          variant="neutral"
          appearance="ghost"
          type="button"
          onClick={() => setContextOpen((v) => !v)}
          aria-expanded={contextOpen}
        >
          {contextOpen ? (
            <ChevronDownIcon className="h-3 w-3" />
          ) : (
            <PlusIcon className="h-3 w-3" />
          )}
          <span>{t.dictionary_context_label}</span>
          {context.trim() && (
            <span className="ui-badge-xs">
              {context.trim().length}
            </span>
          )}
        </Button>
      </div>

      {contextOpen && (
        <div className="surface-panel relative">
          <textarea
            value={context}
            onChange={(e) => onContextChange(e.target.value)}
            placeholder={t.dictionary_context_placeholder}
            aria-label={t.dictionary_context_label}
            aria-invalid={context.length > maxContextChars || undefined}
            className="h-16 w-full resize-none rounded-lg bg-transparent px-3 py-2 text-sm text-gray-800 outline-none placeholder:text-gray-400 select-text dark:text-gray-100 dark:placeholder:text-gray-600"
          />
          {context.length > 0 && (
            <span
              className={`ui-micro pointer-events-none absolute bottom-1.5 right-2 font-medium tabular-nums ${
                context.length > maxContextChars ? 'ui-error-text' : 'text-gray-300 dark:text-gray-600'
              }`}
            >
              {context.length}/{maxContextChars}
            </span>
          )}
        </div>
      )}

      {/* ── Inline error ───────────────────────────────────────────────── */}
      {error && (
        <div className="ui-error-box flex items-start gap-2">
          <AlertTriangleIcon className="ui-error-icon mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </form>
  )
}

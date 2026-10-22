import { useId, useState } from 'react'
import type { Translations } from '../../../i18n'
import type { HistoryItem } from '../../../types'
import { formatModelName } from '../../../utils/modelDisplay'
import { formatRelativeTime } from '../../../utils/relativeTime'
import { tpl } from '../../../utils/tpl'
import { Button } from '../../ui/atoms'
import { ClockIcon, TrashIcon } from '../../ui/icons'
import { DialogShell, EmptyPanelState, FilterInput, ProviderIcon } from '../../ui/molecules'
import '../../../styles/history-panel.css'

export interface TranslationHistoryPanelProps {
  entries: HistoryItem[]
  /** Entry currently open on the workbench, if any. */
  activeEntryId: string | null
  onReuse: (item: HistoryItem) => void
  onDelete: (id: string) => void
  onClearHistory: () => void
  /**
   * `panel` draws its own heading beside the workbench; `overlay` is hosted by
   * a dialog that already shows the title and close control.
   */
  variant?: 'panel' | 'overlay'
  t: Translations
}

/** Rows below this count do not need a filter field. */
const FILTER_THRESHOLD = 4

function languageLabel(code: string, t: Translations): string {
  if (code === 'auto') return t.lang_auto
  return t.lang_names[code] ?? code
}

function entryMatches(entry: HistoryItem, query: string): boolean {
  const haystack = [
    entry.sourceText,
    entry.translatedText,
    entry.provider,
    entry.model,
    ...(entry.results ?? []).flatMap((result) => [result.translatedText, result.provider, result.model]),
  ]
  return haystack.some((text) => text.toLowerCase().includes(query))
}

/**
 * Saved translations beside the AI Translate workbench. A row reopens its run
 * in place: a single-model entry restores the text, and a comparison entry
 * brings back every model it kept and the pick, so the user never rebuilds a
 * multi-model setup by hand.
 */
export function TranslationHistoryPanel({
  entries,
  activeEntryId,
  onReuse,
  onDelete,
  onClearHistory,
  variant = 'panel',
  t,
}: TranslationHistoryPanelProps) {
  const [filter, setFilter] = useState('')
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const headingId = useId()

  const lowerFilter = filter.trim().toLowerCase()
  const visibleEntries = lowerFilter
    ? entries.filter((entry) => entryMatches(entry, lowerFilter))
    : entries

  return (
    <section
      className="history-panel"
      data-variant={variant}
      aria-labelledby={variant === 'panel' ? headingId : undefined}
      aria-label={variant === 'overlay' ? t.translate_history_title : undefined}
    >
      <header className="history-panel-toolbar">
        {variant === 'panel' && (
          <div className="history-panel-heading">
            <h2 id={headingId} className="history-panel-title">
              <ClockIcon className="history-panel-title-icon" />
              <span>{t.translate_history_title}</span>
            </h2>
            <span className="history-panel-count">
              {tpl(t.history_translate_count, { n: entries.length })}
            </span>
          </div>
        )}
        {entries.length > FILTER_THRESHOLD && (
          <FilterInput
            size="sm"
            value={filter}
            onValueChange={setFilter}
            placeholder={t.history_search_placeholder}
            aria-label={t.history_search_placeholder}
            clearLabel={t.history_search_clear}
          />
        )}
      </header>

      <div className="history-panel-list">
        {visibleEntries.length === 0 ? (
          <EmptyPanelState
            icon={<ClockIcon />}
            description={filter ? t.history_no_results : t.translate_history_empty}
          />
        ) : (
          <ul className="history-panel-rows">
            {visibleEntries.map((entry) => {
              const isActive = entry.id === activeEntryId
              const modelCount = entry.results?.length ?? 0
              const languagePair = `${languageLabel(entry.sourceLang, t)} → ${languageLabel(entry.targetLang, t)}`
              return (
                <li key={entry.id} className="history-panel-row" data-active={isActive || undefined}>
                  {/* Native exception: a multi-line, content-driven list row rather than a toolbar control. */}
                  <button
                    type="button"
                    className="history-panel-reopen"
                    aria-current={isActive || undefined}
                    aria-label={`${t.history_reuse}: ${entry.sourceText}`}
                    onClick={() => onReuse(entry)}
                  >
                    <span className="history-panel-source">{entry.sourceText}</span>
                    <span className="history-panel-result">{entry.translatedText}</span>
                    <span className="history-panel-meta">
                      <span className="history-panel-model">
                        <ProviderIcon provider={entry.provider} size={12} />
                        <span>{formatModelName(entry.provider, entry.model)}</span>
                      </span>
                      {modelCount > 1 && (
                        <span className="history-panel-chip">{t.history_models_count(modelCount)}</span>
                      )}
                      <span className="history-panel-pair">{languagePair}</span>
                      <span className="history-panel-time">{formatRelativeTime(entry.timestamp)}</span>
                    </span>
                  </button>
                  <Button
                    size="xs"
                    shape="icon"
                    variant="danger"
                    appearance="ghost"
                    aria-label={`${t.history_delete}: ${entry.sourceText}`}
                    title={t.history_delete}
                    onClick={() => onDelete(entry.id)}
                    className="history-panel-delete"
                  >
                    <TrashIcon />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {entries.length > 0 && (
        <footer className="history-panel-footer">
          <Button
            size="sm"
            shape="pill"
            variant="danger"
            appearance="outline"
            onClick={() => setConfirmClearOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={confirmClearOpen}
          >
            <TrashIcon />
            <span>{t.translate_history_clear}</span>
          </Button>
        </footer>
      )}

      {confirmClearOpen && (
        <DialogShell
          size="sm"
          label={t.translate_history_clear}
          title={t.translate_history_clear}
          closeLabel={t.dictionary_clear_history_cancel}
          onClose={() => setConfirmClearOpen(false)}
          backdropTestId="translate-history-clear-backdrop"
          footer={(
            <>
              <Button
                size="md"
                shape="rect"
                variant="neutral"
                appearance="outline"
                onClick={() => setConfirmClearOpen(false)}
              >
                {t.dictionary_clear_history_cancel}
              </Button>
              <Button
                size="md"
                shape="rect"
                variant="danger"
                appearance="solid"
                onClick={() => {
                  setConfirmClearOpen(false)
                  onClearHistory()
                }}
              >
                <TrashIcon />
                <span>{t.translate_history_clear}</span>
              </Button>
            </>
          )}
        >
          <p className="history-panel-confirm-copy">{t.translate_history_clear_confirm}</p>
        </DialogShell>
      )}
    </section>
  )
}

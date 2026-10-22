import { useId, useState } from 'react'
import type { DictionaryListTab } from '../../../hooks/useDictionaryLookup'
import type { Translations } from '../../../i18n'
import type { DictionaryEntry, UsageCurrency } from '../../../types'
import { formatDictionaryPronunciation } from '../../../utils/dictionary'
import { formatRelativeTime } from '../../../utils/relativeTime'
import { Button } from '../../ui/atoms'
import { BookIcon, StarIcon, TrashIcon } from '../../ui/icons'
import { DialogShell, EmptyPanelState, FilterInput, TabBar, UsageCostBadge } from '../../ui/molecules'

export interface DictionaryHistoryPanelProps {
  entries: DictionaryEntry[]
  selectedEntryId: string | null
  activeTab: DictionaryListTab
  costCurrency: UsageCurrency
  onTabChange: (tab: DictionaryListTab) => void
  onSelect: (id: string) => void
  onToggleFavorite: (id: string) => void
  onDeleteSelected: () => void
  onClearHistory: () => void
  t: Translations
}

/** Rows below this count do not need a filter field. */
const FILTER_THRESHOLD = 4

/** Recent / favourite lookups with a filter, selectable rows and destructive footer actions. */
export function DictionaryHistoryPanel({
  entries,
  selectedEntryId,
  activeTab,
  costCurrency,
  onTabChange,
  onSelect,
  onToggleFavorite,
  onDeleteSelected,
  onClearHistory,
  t,
}: DictionaryHistoryPanelProps) {
  const [filter, setFilter] = useState('')
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const panelId = useId()

  const favorites = entries.filter((entry) => entry.favorite)
  const baseEntries = activeTab === 'favorites' ? favorites : entries

  const lowerFilter = filter.trim().toLowerCase()
  const visibleEntries = lowerFilter
    ? baseEntries.filter((entry) =>
        entry.result.headword.toLowerCase().includes(lowerFilter) ||
        entry.result.meaning.toLowerCase().includes(lowerFilter) ||
        entry.term.toLowerCase().includes(lowerFilter),
      )
    : baseEntries

  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? null
  const currentTabCount = activeTab === 'favorites' ? favorites.length : entries.length
  const canClear = entries.some((entry) => !entry.favorite)

  const emptyMessage = filter
    ? t.dictionary_no_matches
    : activeTab === 'favorites'
      ? t.dictionary_no_favorites
      : t.dictionary_no_recent

  return (
    <div className="dictionary-panel dictionary-history">
      <div className="dictionary-history-toolbar">
        <TabBar<DictionaryListTab>
          label={t.dictionary_history_label}
          activeId={activeTab}
          onChange={onTabChange}
          tabs={[
            { id: 'recent', label: t.dictionary_recent, count: entries.length, panelId },
            { id: 'favorites', label: t.dictionary_favorites, count: favorites.length, panelId },
          ]}
        />
        {currentTabCount > FILTER_THRESHOLD && (
          <FilterInput
            size="sm"
            value={filter}
            onValueChange={setFilter}
            placeholder={t.history_search_placeholder}
            aria-label={t.history_search_placeholder}
            clearLabel={t.history_search_clear}
          />
        )}
      </div>

      <div id={panelId} role="tabpanel" className="dictionary-history-list">
        {visibleEntries.length === 0 ? (
          <EmptyPanelState icon={<BookIcon />} description={emptyMessage} />
        ) : (
          <ul className="dictionary-history-rows">
            {visibleEntries.map((entry) => {
              const isSelected = selectedEntry?.id === entry.id
              const pronunciation = formatDictionaryPronunciation(entry.result.pronunciation)
              return (
                <li key={entry.id} className="dictionary-history-row" data-selected={isSelected || undefined}>
                  {/* Native exception: a multi-line, content-driven list row rather than a toolbar control. */}
                  <button
                    type="button"
                    onClick={() => onSelect(entry.id)}
                    aria-current={isSelected || undefined}
                    className="dictionary-history-select"
                  >
                    <span className="dictionary-history-headline">
                      <span className="dictionary-history-headword">{entry.result.headword}</span>
                      {pronunciation && (
                        <span className="dictionary-history-pronunciation">{pronunciation}</span>
                      )}
                      <span className="dictionary-history-time">{formatRelativeTime(entry.createdAt)}</span>
                    </span>
                    {entry.cost && (
                      <span className="dictionary-history-cost">
                        <UsageCostBadge cost={entry.cost} currency={costCurrency} />
                      </span>
                    )}
                    <span className="dictionary-history-meaning">{entry.result.meaning}</span>
                  </button>

                  <Button
                    size="xs"
                    shape="icon"
                    variant={entry.favorite ? 'primary' : 'neutral'}
                    appearance={entry.favorite ? 'soft' : 'ghost'}
                    aria-pressed={entry.favorite}
                    aria-label={entry.favorite ? t.dictionary_unfavorite : t.dictionary_favorite}
                    onClick={() => onToggleFavorite(entry.id)}
                    className="dictionary-history-star"
                  >
                    <StarIcon />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {entries.length > 0 && (
        <div className="dictionary-panel-footer">
          <Button
            size="sm"
            shape="pill"
            variant="danger"
            onClick={() => setConfirmClearOpen(true)}
            disabled={!canClear}
            title={t.dictionary_clear_history}
            aria-haspopup="dialog"
            aria-expanded={confirmClearOpen}
          >
            <TrashIcon />
            <span>{t.dictionary_clear_history}</span>
          </Button>
          {selectedEntry && (
            <Button
              size="sm"
              shape="pill"
              variant="danger"
              onClick={onDeleteSelected}
              title={t.dictionary_delete}
            >
              <TrashIcon />
              <span>{t.dictionary_delete}</span>
            </Button>
          )}
        </div>
      )}

      {confirmClearOpen && (
        <DialogShell
          size="sm"
          label={t.dictionary_clear_history}
          title={t.dictionary_clear_history}
          closeLabel={t.dictionary_clear_history_cancel}
          onClose={() => setConfirmClearOpen(false)}
          backdropTestId="dictionary-clear-backdrop"
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
                <span>{t.dictionary_clear_history}</span>
              </Button>
            </>
          )}
        >
          <p className="dictionary-confirm-copy">{t.dictionary_clear_history_confirm}</p>
        </DialogShell>
      )}
    </div>
  )
}

import { useState } from 'react'
import type { Translations } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import type { DictionaryEntry } from '../../types'
import { Button } from '../ui/atoms'
import { BookIcon, SearchIcon, StarIcon, TrashIcon, XIcon } from '../ui/icons'
import { UsageCostBadge } from '../ui/UsageCostBadge'

type DictionaryListTab = 'recent' | 'favorites'

interface DictionaryHistoryPanelProps {
  entries: DictionaryEntry[]
  selectedEntryId: string | null
  activeTab: DictionaryListTab
  onTabChange: (tab: DictionaryListTab) => void
  onSelect: (id: string) => void
  onToggleFavorite: (id: string) => void
  onDeleteSelected: () => void
  onClearHistory: () => void
  t: Translations
}

/**
 * Wrap the pronunciation in `/.../` only for IPA-like (Latin-script) values.
 * Native-script readings (kana/hangul/han/…) are shown as-is.
 */
function formatPronunciationForList(value: string): string {
  const stripped = value.replace(/^\/|\/$/g, '').trim()
  if (!stripped) return ''
  try {
    const hasNativeScript = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Hangul}\p{Script=Thai}\p{Script=Devanagari}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Cyrillic}]/u.test(stripped)
    return hasNativeScript ? stripped : `/${stripped}/`
  } catch {
    return `/${stripped}/`
  }
}

/**
 * Format a timestamp as a relative time string in Vietnamese-friendly
 * shorthand (e.g. "vừa xong", "5p", "2g", "3n").  Stays locale-neutral by
 * using single-character suffixes.
 */
function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const sec = Math.floor(diff / 1000)
  if (sec < 30) return '·'
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  const wk = Math.floor(day / 7)
  if (wk < 4) return `${wk}w`
  const mo = Math.floor(day / 30)
  return `${mo}mo`
}

export function DictionaryHistoryPanel({
  entries,
  selectedEntryId,
  activeTab,
  onTabChange,
  onSelect,
  onToggleFavorite,
  onDeleteSelected,
  onClearHistory,
  t,
}: DictionaryHistoryPanelProps) {
  const [filter, setFilter] = useState('')
  const costCurrency = useAppStore((state) => state.costCurrency)

  const totalCount = entries.length
  const favorites = entries.filter((entry) => entry.favorite)
  const favoriteCount = favorites.length

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

  const currentTabCount = activeTab === 'favorites' ? favoriteCount : totalCount

  const tabs: Array<{ id: DictionaryListTab; label: string; count: number }> = [
    { id: 'recent', label: t.dictionary_recent, count: totalCount },
    { id: 'favorites', label: t.dictionary_favorites, count: favoriteCount },
  ]

  return (
    <div className="surface-panel min-h-0 h-full">
      {/* ── Tabs + filter (mirrors HistoryPage) ─────────────────────────── */}
      <div className="flex-shrink-0 space-y-2 border-b border-gray-200/90 p-3 dark:border-neutral-800">
        <div className="grid grid-cols-2 gap-2" role="tablist">
          {tabs.map(({ id, label, count }) => {
            const isActive = activeTab === id
            return (
              <Button
                size="md"
                shape="rect"
                variant={isActive ? 'primary' : 'neutral'}
                appearance={isActive ? 'soft' : 'ghost'}
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onTabChange(id)}
              >
                <span className="truncate">{label}</span>
                <span
                  className={[
                    'ui-badge-xs min-w-[18px] justify-center px-1 tabular-nums',
                    isActive
                      ? 'bg-gray-100 text-gray-600 dark:bg-gray-950 dark:text-gray-300'
                      : 'bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
                  ].join(' ')}
                >
                  {count}
                </span>
              </Button>
            )
          })}
        </div>

        {/* Filter input — only shown when the current tab has enough items */}
        {currentTabCount > 4 && (
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-300 dark:text-gray-600" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t.history_search_placeholder}
              className="h-7 w-full rounded-md border border-gray-200 bg-gray-50/60 pl-7 pr-7 text-xs text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:bg-white dark:border-neutral-800 dark:bg-neutral-950/45 dark:text-gray-200 dark:placeholder:text-gray-600 dark:focus:bg-neutral-900"
            />
            {filter && (
              <Button
                size="xs"
                shape="icon"
                variant="neutral"
                appearance="ghost"
                aria-label={t.history_search_clear}
                type="button"
                onClick={() => setFilter('')}
                title={t.history_search_clear}
                className="absolute right-1 top-1/2 -translate-y-1/2"
              >
                <XIcon className="h-2.5 w-2.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── List ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {visibleEntries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-10 text-center text-xs text-gray-400 dark:text-gray-500">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-300 dark:bg-neutral-800 dark:text-gray-600">
              <BookIcon className="h-4 w-4" />
            </div>
            <span>
              {filter
                ? t.dictionary_no_matches
                : activeTab === 'favorites'
                  ? t.dictionary_no_favorites
                  : t.dictionary_no_recent}
            </span>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-neutral-800/70">
            {visibleEntries.map((entry) => {
              const isSelected = selectedEntry?.id === entry.id
              return (
                <li key={entry.id}>
                  <div
                    className={[
                      'group relative flex cursor-pointer items-start gap-2.5 px-3 py-2.5 transition-colors',
                      isSelected
                        ? 'bg-gray-50 dark:bg-gray-950/35'
                        : 'hover:bg-gray-50 dark:hover:bg-neutral-950/40',
                    ].join(' ')}
                  >
                    {/* Active indicator bar */}
                    <span
                      aria-hidden
                      className={[
                        'absolute left-0 top-2 bottom-2 w-0.5 rounded-r',
                        isSelected ? 'bg-gray-500' : 'bg-transparent',
                      ].join(' ')}
                    />

                    <button
                      type="button"
                      onClick={() => onSelect(entry.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-baseline gap-2">
                        <span
                          className={[
                            'truncate text-sm font-semibold',
                            isSelected
                              ? 'text-gray-950 dark:text-gray-100'
                              : 'text-gray-900 dark:text-gray-100',
                          ].join(' ')}
                        >
                          {entry.result.headword}
                        </span>
                        {entry.result.pronunciation && (
                          <span className="ui-meta truncate font-mono">
                            {formatPronunciationForList(entry.result.pronunciation)}
                          </span>
                        )}
                        <span className="ui-micro ml-auto flex-shrink-0 tabular-nums">
                          {formatRelativeTime(entry.createdAt)}
                        </span>
                      </div>
                      <div className="mt-1">
                        <UsageCostBadge cost={entry.cost} currency={costCurrency} />
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                        {entry.result.meaning}
                      </p>
                    </button>

                    <Button
                      size="xs"
                      shape="icon"
                      variant={entry.favorite ? 'primary' : 'neutral'}
                      appearance={entry.favorite ? 'soft' : 'ghost'}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleFavorite(entry.id)
                      }}
                      aria-label={entry.favorite ? t.dictionary_unfavorite : t.dictionary_favorite}
                      className={["flex-shrink-0", entry.favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"].join(' ')}
                    >
                      <StarIcon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      {entries.length > 0 && (
        <div className="surface-footer">
          <Button
            size="sm"
            shape="pill"
            variant="danger"
            onClick={() => {
              if (window.confirm(t.dictionary_clear_history_confirm)) onClearHistory()
            }}
            disabled={!entries.some((entry) => !entry.favorite)}
            title={t.dictionary_clear_history}
          >
            <TrashIcon className="h-3.5 w-3.5" />
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
              <TrashIcon className="h-3.5 w-3.5" />
              <span>{t.dictionary_delete}</span>
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export type { DictionaryListTab }

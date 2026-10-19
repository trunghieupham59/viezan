import { useState } from 'react'
import { Button } from '@/components/ui/atoms'
import { HistoryBulkHeader } from '../../components/ui/HistoryBulkHeader'
import { HistoryDeleteButton } from '../../components/ui/HistoryDeleteButton'
import { HistoryEmptyState } from '../../components/ui/HistoryEmptyState'
import { ClockIcon, ReuseIcon } from '../../components/ui/icons'
import { UsageCostBadge } from '../../components/ui/molecules/UsageCostBadge'
import { useAppStore, useT } from '../../store/useAppStore'
import type { HistoryItem } from '../../types'
import { tpl } from '../../utils/tpl'
import { HistorySelectableRow } from './HistorySelectableRow'
import { formatTime, historyMatches, langLabel, normalizeHistoryQuery, ProviderBadge } from './historyUtils'
import { useHistoryBulkSelection } from './useHistoryBulkSelection'

interface TranslationHistoryTabProps {
  query: string
}

export function TranslationHistoryTab({ query }: TranslationHistoryTabProps) {
  const {
    history,
    deleteHistoryItem,
    setActivePage,
    setSourceText,
    setTranslatedText,
    setSourceLang,
    setTargetLang,
    setTranslationModels,
    setTranslationStyle,
    costCurrency,
  } = useAppStore()
  const t = useT()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const normalizedQuery = normalizeHistoryQuery(query)
  const filteredHistory = history.filter((item) => historyMatches(normalizedQuery, [
    item.sourceText,
    item.translatedText,
    item.sourceLang,
    item.targetLang,
    langLabel(item.sourceLang),
    langLabel(item.targetLang),
    item.provider,
    item.model,
  ]))
  const filteredIds = filteredHistory.map((item) => item.id)
  const { selectedIds, selectedCount, toggleSelect, handleSelectAll, handleDeleteSelected } =
    useHistoryBulkSelection(filteredIds, deleteHistoryItem)

  const handleReuse = (item: HistoryItem) => {
    setSourceText(item.sourceText)
    setTranslatedText(item.translatedText)
    setSourceLang(item.sourceLang)
    setTargetLang(item.targetLang)
    setTranslationModels([{ provider: item.provider, model: item.model }])
    if (item.translationStyle) setTranslationStyle(item.translationStyle)
    setActivePage('translate')
  }

  return (
    <div className="flex flex-col h-full">
      {history.length > 0 && (
        <HistoryBulkHeader
          countLabel={tpl(t.history_translate_count, { n: filteredHistory.length })}
          totalCount={filteredHistory.length}
          selectedCount={selectedCount}
          labelSelectAll={t.history_select_all}
          labelSelected={tpl(t.history_selected_count, { n: selectedCount })}
          labelDeleteSelected={t.history_delete_selected}
          onSelectAll={handleSelectAll}
          onDeleteSelected={handleDeleteSelected}
        />
      )}

      <div className="flex-1 overflow-y-auto">
        {history.length === 0 ? (
          <HistoryEmptyState
            icon={<ClockIcon className="w-7 h-7 text-gray-300 dark:text-gray-600" />}
            title={t.history_empty}
            desc={t.history_empty_desc}
            tone="neutral"
          />
        ) : filteredHistory.length === 0 ? (
          <HistoryEmptyState
            icon={<ClockIcon className="w-7 h-7" />}
            title={t.history_no_results}
            desc={t.history_no_results_desc}
            tone="muted"
          />
        ) : (
          <ul className="p-3 space-y-2">
            {filteredHistory.map((item) => {
              const isExpanded = expandedId === item.id
              const isSelected = selectedIds.has(item.id)
              return (
                <HistorySelectableRow
                  key={item.id}
                  id={item.id}
                  isSelected={isSelected}
                  isExpanded={isExpanded}
                  onToggleSelect={toggleSelect}
                  onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                  preview={(
                    <>
                      <p className="text-sm text-gray-800 dark:text-gray-100 leading-snug line-clamp-2 font-medium">
                        {item.sourceText}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug mt-1 line-clamp-1">
                        {item.translatedText}
                      </p>
                    </>
                  )}
                  meta={(
                    <>
                      <ProviderBadge provider={item.provider} />
                      <span className="ui-micro">
                        {langLabel(item.sourceLang)} → {langLabel(item.targetLang)}
                      </span>
                      <UsageCostBadge cost={item.cost} currency={costCurrency} />
                      <span className="ui-micro ml-auto">
                        {formatTime(item.timestamp, t)}
                      </span>
                    </>
                  )}
                  expandedContent={(
                    <div className="px-4 pb-3 pl-11 fade-in">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 text-xs">
                        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-lg">
                          <p className="ui-kicker mb-1">
                            {langLabel(item.sourceLang)} · {item.sourceText.length.toLocaleString()} {t.history_chars_source}
                          </p>
                          <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                            {item.sourceText}
                          </p>
                        </div>
                        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-lg">
                          <p className="ui-kicker mb-1">
                            {langLabel(item.targetLang)} · {item.translatedText.length.toLocaleString()} {t.history_chars_result}
                          </p>
                          <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                            {item.translatedText}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          size="sm"
                          shape="rect"
                          variant="neutral"
                          appearance="outline"
                          type="button"
                          onClick={() => handleReuse(item)}
                        >
                          <ReuseIcon className="w-3.5 h-3.5" />
                          {t.history_reuse}
                        </Button>
                        <HistoryDeleteButton onClick={() => deleteHistoryItem(item.id)} label={t.history_delete} />
                      </div>
                    </div>
                  )}
                />
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

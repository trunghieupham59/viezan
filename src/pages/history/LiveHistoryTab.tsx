import { useState } from 'react'
import { Button } from '@/components/ui/atoms'
import { MarkdownText } from '../../components/MarkdownText'
import { HistoryBulkHeader } from '../../components/ui/HistoryBulkHeader'
import { HistoryDeleteButton } from '../../components/ui/HistoryDeleteButton'
import { HistoryEmptyState } from '../../components/ui/HistoryEmptyState'
import { MicrophoneIcon } from '../../components/ui/icons'
import { UsageCostBadge } from '../../components/ui/molecules/UsageCostBadge'
import { useAppStore, useT } from '../../store/useAppStore'
import { tpl } from '../../utils/tpl'
import { HistorySelectableRow } from './HistorySelectableRow'
import { formatTime, historyMatches, langLabel, normalizeHistoryQuery, ProviderBadge } from './historyUtils'
import { useHistoryBulkSelection } from './useHistoryBulkSelection'

/** Số ký tự preview hiển thị trong danh sách live session history */
const LIVE_HISTORY_PREVIEW_CHARS = 120

interface LiveHistoryTabProps {
  query: string
}

export function LiveHistoryTab({ query }: LiveHistoryTabProps) {
  const { liveSessions, deleteLiveSession, setActivePage, setViewingLiveSession, costCurrency } = useAppStore()
  const t = useT()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const normalizedQuery = normalizeHistoryQuery(query)
  const filteredSessions = liveSessions.filter((session) => historyMatches(normalizedQuery, [
    session.rawTranscript,
    session.translation,
    session.summary,
    session.actionItems,
    session.decisions,
    session.speakerAnalysis,
    session.sourceLang,
    session.targetLang,
    langLabel(session.sourceLang),
    langLabel(session.targetLang),
    session.provider,
    session.model,
  ]))
  const filteredIds = filteredSessions.map((session) => session.id)
  const { selectedIds, selectedCount, toggleSelect, handleSelectAll, handleDeleteSelected } =
    useHistoryBulkSelection(filteredIds, deleteLiveSession)

  // Open the live page and restore the selected session's content for viewing.
  const handleOpenLive = (sessionId: string) => {
    setViewingLiveSession(sessionId)
    setActivePage('live')
  }

  return (
    <div className="flex flex-col h-full">
      {liveSessions.length > 0 && (
        <HistoryBulkHeader
          countLabel={tpl(t.history_live_count, { n: filteredSessions.length })}
          totalCount={filteredSessions.length}
          selectedCount={selectedCount}
          labelSelectAll={t.history_select_all}
          labelSelected={tpl(t.history_selected_count, { n: selectedCount })}
          labelDeleteSelected={t.history_delete_selected}
          onSelectAll={handleSelectAll}
          onDeleteSelected={handleDeleteSelected}
        />
      )}

      <div className="flex-1 overflow-y-auto">
        {liveSessions.length === 0 ? (
          <HistoryEmptyState
            icon={<MicrophoneIcon className="w-7 h-7 text-gray-300 dark:text-gray-700" />}
            title={t.history_live_empty}
            desc={t.history_live_empty_desc}
            tone="muted"
          />
        ) : filteredSessions.length === 0 ? (
          <HistoryEmptyState
            icon={<MicrophoneIcon className="w-7 h-7" />}
            title={t.history_no_results}
            desc={t.history_no_results_desc}
            tone="muted"
          />
        ) : (
          <ul className="p-3 space-y-2">
            {filteredSessions.map((session) => {
              const isExpanded = expandedId === session.id
              const isSelected = selectedIds.has(session.id)
              const previewRaw = session.rawTranscript.slice(0, LIVE_HISTORY_PREVIEW_CHARS)
              const previewTx  = session.translation.slice(0, LIVE_HISTORY_PREVIEW_CHARS)

              return (
                <HistorySelectableRow
                  key={session.id}
                  id={session.id}
                  isSelected={isSelected}
                  isExpanded={isExpanded}
                  tone="muted"
                  onToggleSelect={toggleSelect}
                  onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                  preview={(
                    <>
                      <p className="text-sm text-gray-800 dark:text-gray-100 leading-snug line-clamp-2 font-medium">
                        {previewRaw}{session.rawTranscript.length > LIVE_HISTORY_PREVIEW_CHARS ? '…' : ''}
                      </p>
                      {previewTx && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug mt-1 line-clamp-1">
                          {previewTx}{session.translation.length > LIVE_HISTORY_PREVIEW_CHARS ? '…' : ''}
                        </p>
                      )}
                    </>
                  )}
                  meta={(
                    <>
                      <ProviderBadge provider={session.provider} />
                      <span className="ui-micro">
                        {langLabel(session.sourceLang)} → {langLabel(session.targetLang)}
                      </span>
                      <span className="ui-micro">
                        {session.wordCount.toLocaleString()} {t.history_live_words}
                      </span>
                      <UsageCostBadge cost={session.cost} currency={costCurrency} />
                      <span className="ui-micro ml-auto">
                        {formatTime(session.createdAt, t)}
                      </span>
                    </>
                  )}
                  expandedContent={(
                    <div className="px-4 pb-3 pl-11 fade-in space-y-2">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 text-xs">
                        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-lg">
                          <p className="ui-kicker mb-1">
                            {langLabel(session.sourceLang)} · {t.live_panel_original}
                          </p>
                          <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap line-clamp-4">
                            {session.rawTranscript}
                          </p>
                        </div>
                        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-lg">
                          <p className="ui-kicker mb-1">
                            {langLabel(session.targetLang)} · {t.live_panel_translation}
                          </p>
                          <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap line-clamp-4">
                            {session.translation}
                          </p>
                        </div>
                      </div>

                      {/* Summary (if any) */}
                      {session.summary && (
                        <div className="rounded-lg border border-gray-100 dark:border-gray-900/40
                                        bg-gray-50/50 dark:bg-gray-950/10 px-3 py-2 text-xs">
                          <p className="ui-kicker mb-1.5 text-gray-500 dark:text-gray-400">
                            {t.live_summary_title}
                          </p>
                          <MarkdownText
                            text={session.summary}
                            className="text-gray-800 dark:text-gray-200"
                          />
                        </div>
                      )}

                      {/* Action Items (if any) */}
                      {session.actionItems && (
                        <div className="rounded-lg border border-gray-100 dark:border-gray-900/40
                                        bg-gray-50/50 dark:bg-gray-950/10 px-3 py-2 text-xs">
                          <p className="ui-kicker mb-1.5 text-gray-600 dark:text-gray-400">
                            {t.live_action_items}
                          </p>
                          <MarkdownText
                            text={session.actionItems}
                            className="text-gray-800 dark:text-gray-200"
                          />
                        </div>
                      )}

                      {/* Decisions (if any) */}
                      {session.decisions && (
                        <div className="rounded-lg border border-gray-100 dark:border-gray-900/40
                                        bg-gray-50/50 dark:bg-gray-950/10 px-3 py-2 text-xs">
                          <p className="ui-kicker mb-1.5 text-gray-600 dark:text-gray-400">
                            {t.live_decisions}
                          </p>
                          <MarkdownText
                            text={session.decisions}
                            className="text-gray-800 dark:text-gray-200"
                          />
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          shape="rect"
                          variant="neutral"
                          appearance="outline"
                          type="button"
                          onClick={() => handleOpenLive(session.id)}
                        >
                          <MicrophoneIcon className="w-3.5 h-3.5" />
                          {t.history_live_view}
                        </Button>
                        <HistoryDeleteButton onClick={() => deleteLiveSession(session.id)} label={t.history_live_delete} />
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

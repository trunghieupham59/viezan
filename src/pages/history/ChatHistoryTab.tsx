import { useState } from 'react'
import { Button } from '@/components/ui/atoms'
import { HistoryBulkHeader } from '../../components/ui/HistoryBulkHeader'
import { HistoryDeleteButton } from '../../components/ui/HistoryDeleteButton'
import { HistoryEmptyState } from '../../components/ui/HistoryEmptyState'
import { ChatBubbleIcon } from '../../components/ui/icons'
import { UsageCostBadge } from '../../components/ui/UsageCostBadge'
import { useAppStore, useT } from '../../store/useAppStore'
import type { ChatSession } from '../../types'
import { tpl } from '../../utils/tpl'
import { HistorySelectableRow } from './HistorySelectableRow'
import { formatTime, historyMatches, normalizeHistoryQuery, ProviderBadge } from './historyUtils'
import { useHistoryBulkSelection } from './useHistoryBulkSelection'

interface ChatHistoryTabProps {
  query: string
}

function chatSessionText(session: ChatSession): string {
  return session.messages
    .flatMap((msg) => msg.content.map((content) => content.text ?? content.imageFileName ?? ''))
    .join(' ')
}

export function ChatHistoryTab({ query }: ChatHistoryTabProps) {
  const { chatSessions, deleteChatSession, setActiveChatSession, setActivePage, costCurrency } = useAppStore()
  const t = useT()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const sortedSessions = [...chatSessions].sort((a, b) => b.updatedAt - a.updatedAt)
  const normalizedQuery = normalizeHistoryQuery(query)
  const filteredSessions = sortedSessions.filter((session) => historyMatches(normalizedQuery, [
    session.title,
    session.provider,
    session.model,
    chatSessionText(session),
  ]))
  const filteredIds = filteredSessions.map((session) => session.id)
  const { selectedIds, selectedCount, toggleSelect, handleSelectAll, handleDeleteSelected } =
    useHistoryBulkSelection(filteredIds, deleteChatSession)

  const handleOpen = (session: ChatSession) => {
    setActiveChatSession(session.id)
    setActivePage('chat')
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto">
      {sortedSessions.length === 0 ? (
        <HistoryEmptyState
          icon={<ChatBubbleIcon className="w-7 h-7 text-gray-300 dark:text-gray-600" />}
          title={t.history_chat_empty}
          desc={t.history_chat_empty_desc}
        />
      ) : (
        <>
          <HistoryBulkHeader
            countLabel={tpl(t.history_total_count, { n: filteredSessions.length })}
            totalCount={filteredSessions.length}
            selectedCount={selectedCount}
            labelSelectAll={t.history_select_all}
            labelSelected={tpl(t.history_selected_count, { n: selectedCount })}
            labelDeleteSelected={t.history_delete_selected}
            onSelectAll={handleSelectAll}
            onDeleteSelected={handleDeleteSelected}
          />

          {filteredSessions.length === 0 ? (
            <HistoryEmptyState
              icon={<ChatBubbleIcon className="w-7 h-7" />}
              title={t.history_no_results}
              desc={t.history_no_results_desc}
              tone="muted"
            />
          ) : (
            <ul className="p-3 space-y-2">
              {filteredSessions.map((session) => {
                const isExpanded = expandedId === session.id
                const isSelected = selectedIds.has(session.id)
                const msgCount = session.messages.filter((m) => !m.isLoading && !m.error).length
                const lastMsg = [...session.messages].reverse().find((m) => !m.isLoading && !m.error)
                const preview = lastMsg?.content.find((c) => c.type === 'text')?.text ?? ''

                return (
                  <HistorySelectableRow
                    key={session.id}
                    id={session.id}
                    isSelected={isSelected}
                    isExpanded={isExpanded}
                    onToggleSelect={toggleSelect}
                    onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                    preview={(
                      <>
                        <p className="text-sm text-gray-800 dark:text-gray-100 leading-snug line-clamp-1 font-medium">
                          {session.title}
                        </p>
                        {preview && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug mt-1 line-clamp-2">
                            {preview}
                          </p>
                        )}
                      </>
                    )}
                    meta={(
                      <>
                        <ProviderBadge provider={session.provider} />
                        <span className="ui-micro">
                          {msgCount} {t.history_chat_messages}
                        </span>
                        <UsageCostBadge cost={session.cost} currency={costCurrency} />
                        <span className="ui-micro ml-auto">
                          {formatTime(session.updatedAt, t)}
                        </span>
                      </>
                    )}
                    expandedContent={(
                      <div className="px-4 pb-3 pl-11 fade-in">
                        {session.messages.filter((m) => !m.isLoading && !m.error).length > 0 && (
                          <div className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden text-xs mb-2 max-h-40 overflow-y-auto">
                            {session.messages.filter((m) => !m.isLoading && !m.error).slice(-4).map((msg) => {
                              const text = msg.content.find((c) => c.type === 'text')?.text ?? ''
                              if (!text) return null
                              return (
                                <div
                                  key={msg.id}
                                  className={`px-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0
                                            ${msg.role === 'user'
                                              ? 'bg-gray-50 dark:bg-gray-950/20'
                                              : 'bg-white dark:bg-gray-900'}`}
                                >
                                  <p className="ui-micro mb-0.5 font-semibold">
                                    {msg.role === 'user' ? t.history_chat_role_user : t.history_chat_role_ai}
                                  </p>
                                  <p className="text-gray-700 dark:text-gray-300 line-clamp-2">{text}</p>
                                </div>
                              )
                            })}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            shape="rect"
                            variant="neutral"
                            appearance="outline"
                            type="button"
                            onClick={() => handleOpen(session)}
                          >
                            <ChatBubbleIcon className="w-3.5 h-3.5" />
                            {t.history_chat_open}
                          </Button>
                          <HistoryDeleteButton onClick={() => deleteChatSession(session.id)} label={t.history_chat_delete} />
                        </div>
                      </div>
                    )}
                  />
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

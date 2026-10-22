import { useState } from 'react'
import type { Translations } from '../../../i18n'
import type { LiveSession } from '../../../types'
import { formatModelName } from '../../../utils/modelDisplay'
import { formatRelativeTime } from '../../../utils/relativeTime'
import { Button } from '../../ui/atoms'
import { MicrophoneIcon, TrashIcon } from '../../ui/icons'
import { DialogShell, EmptyPanelState, FilterInput, ProviderIcon } from '../../ui/molecules'
import '../../../styles/history-panel.css'

export interface LiveSessionHistoryPanelProps {
  sessions: LiveSession[]
  /** Session currently shown on the interpret screen, if any. */
  activeSessionId: string | null
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onClearHistory: () => void
  t: Translations
}

/** Rows below this count do not need a filter field. */
const FILTER_THRESHOLD = 4

function languageLabel(code: string, t: Translations): string {
  return t.lang_names[code] ?? code
}

function sessionMatches(session: LiveSession, query: string): boolean {
  const haystack = [
    session.rawTranscript,
    session.translation,
    session.summary,
    session.actionItems,
    session.decisions,
    session.provider,
    session.model,
  ]
  return haystack.some((text) => (text ?? '').toLowerCase().includes(query))
}

/**
 * Saved interpret sessions, hosted by a dialog on the AI Interpret screen. A
 * row reopens its transcript, translation and notes in place; the session on
 * screen is marked.
 */
export function LiveSessionHistoryPanel({
  sessions,
  activeSessionId,
  onOpen,
  onDelete,
  onClearHistory,
  t,
}: LiveSessionHistoryPanelProps) {
  const [filter, setFilter] = useState('')
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)

  const lowerFilter = filter.trim().toLowerCase()
  const visibleSessions = lowerFilter
    ? sessions.filter((session) => sessionMatches(session, lowerFilter))
    : sessions

  return (
    <section className="history-panel" data-variant="overlay" aria-label={t.live_history_title}>
      {sessions.length > FILTER_THRESHOLD && (
        <header className="history-panel-toolbar">
          <FilterInput
            size="sm"
            value={filter}
            onValueChange={setFilter}
            placeholder={t.history_search_placeholder}
            aria-label={t.history_search_placeholder}
            clearLabel={t.history_search_clear}
          />
        </header>
      )}

      <div className="history-panel-list">
        {visibleSessions.length === 0 ? (
          <EmptyPanelState
            icon={<MicrophoneIcon />}
            description={filter ? t.history_no_results : t.live_history_empty}
          />
        ) : (
          <ul className="history-panel-rows">
            {visibleSessions.map((session) => {
              const isActive = session.id === activeSessionId
              const title = session.rawTranscript.trim() || session.translation.trim()
              const languagePair = `${languageLabel(session.sourceLang, t)} → ${languageLabel(session.targetLang, t)}`
              return (
                <li key={session.id} className="history-panel-row" data-active={isActive || undefined}>
                  {/* Native exception: a multi-line, content-driven list row rather than a toolbar control. */}
                  <button
                    type="button"
                    className="history-panel-reopen"
                    aria-current={isActive || undefined}
                    aria-label={`${t.live_history_open}: ${title}`}
                    onClick={() => onOpen(session.id)}
                  >
                    <span className="history-panel-source">{session.rawTranscript}</span>
                    {session.translation && (
                      <span className="history-panel-result">{session.translation}</span>
                    )}
                    <span className="history-panel-meta">
                      <span className="history-panel-model">
                        <ProviderIcon provider={session.provider} size={12} />
                        <span>{formatModelName(session.provider, session.model)}</span>
                      </span>
                      <span className="history-panel-pair">{languagePair}</span>
                      <span className="history-panel-chip">
                        {session.wordCount.toLocaleString()} {t.history_live_words}
                      </span>
                      <span className="history-panel-time">{formatRelativeTime(session.createdAt)}</span>
                    </span>
                  </button>
                  <Button
                    size="xs"
                    shape="icon"
                    variant="danger"
                    appearance="ghost"
                    aria-label={`${t.history_delete}: ${title}`}
                    title={t.history_delete}
                    onClick={() => onDelete(session.id)}
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

      {sessions.length > 0 && (
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
            <span>{t.live_history_clear}</span>
          </Button>
        </footer>
      )}

      {confirmClearOpen && (
        <DialogShell
          size="sm"
          label={t.live_history_clear}
          title={t.live_history_clear}
          closeLabel={t.dictionary_clear_history_cancel}
          onClose={() => setConfirmClearOpen(false)}
          backdropTestId="live-history-clear-backdrop"
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
                <span>{t.live_history_clear}</span>
              </Button>
            </>
          )}
        >
          <p className="history-panel-confirm-copy">{t.live_history_clear_confirm}</p>
        </DialogShell>
      )}
    </section>
  )
}

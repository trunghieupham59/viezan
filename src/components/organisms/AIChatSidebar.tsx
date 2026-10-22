import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore, useT } from '../../store/useAppStore'
import type { ChatSession } from '../../types'
import { formatShortcutLabel } from '../../utils/keyboardShortcuts'
import { tpl } from '../../utils/tpl'
import { Button, Input } from '../ui/atoms'
import { PencilIcon, SearchIcon } from '../ui/icons'
import { HistoryTrigger } from '../ui/molecules'
import { ChatSessionListItem } from '../ui/molecules/ChatSessionListItem'

interface RelativeTimeText {
  time_just_now: string
  time_m_ago: string
  time_h_ago: string
  time_d_ago: string
}

const AI_CHAT_SIDEBAR_AUTO_COMPACT_BREAKPOINT = 900
const CLOSE_PRIMARY_NAVIGATION_EVENT = 'viezan:close-primary-navigation'
const CLOSE_CONTEXT_SIDEBARS_EVENT = 'viezan:close-context-sidebars'

function formatSessionTime(timestamp: number, text: RelativeTimeText): string {
  const now = Date.now()
  const elapsed = Math.max(0, now - timestamp)
  const minutes = Math.floor(elapsed / 60_000)
  const hours = Math.floor(elapsed / 3_600_000)
  const days = Math.floor(elapsed / 86_400_000)

  if (minutes < 1) return text.time_just_now
  if (minutes < 60) return tpl(text.time_m_ago, { n: minutes })
  if (hours < 24) return tpl(text.time_h_ago, { n: hours })
  if (days < 7) return tpl(text.time_d_ago, { n: days })
  return new Date(timestamp).toLocaleDateString()
}

function sessionMatchesQuery(session: ChatSession, query: string): boolean {
  if (!query) return true
  return [session.title, session.model, session.provider]
    .some((value) => value.toLocaleLowerCase().includes(query))
}

interface SessionListProps {
  sessions: ChatSession[]
  emptyLabel: string
  activeSessionId: string | null
  t: ReturnType<typeof useT>
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

/** Searchable conversation rows, including the empty state. */
function SessionList({ sessions, emptyLabel, activeSessionId, t, onSelect, onDelete }: SessionListProps) {
  if (sessions.length === 0) {
    return <p className="ai-chat-session-empty">{emptyLabel}</p>
  }
  return (
    <ul className="ai-chat-session-list">
      {sessions.map((session) => (
        <ChatSessionListItem
          key={session.id}
          id={session.id}
          title={session.title}
          provider={session.provider}
          model={session.model}
          timeLabel={formatSessionTime(session.updatedAt, t)}
          messageCount={session.messages.filter((message) => !message.isLoading && !message.error).length}
          messageUnitLabel={t.history_chat_messages}
          active={session.id === activeSessionId}
          deleteLabel={t.history_chat_delete}
          pendingResearchLabel={t.chat_deep_research_resume}
          hasPendingResearch={Boolean(
            session.deepResearchResumeState
            && session.deepResearchResumeState.lastCompletedPhase !== 'synth'
          )}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </ul>
  )
}

/** Conversation history and its controls share state while occupying separate layout slots. */
export function AIChatSidebar({ children }: {
  children?: (slots: { sidebar: ReactNode; header: ReactNode }) => ReactNode
}) {
  const {
    chatSessions, activeChatSessionId, chatNewSessionShortcut,
    aiChatSidebarCollapsed, setActiveChatSession, deleteChatSession, toggleAiChatSidebar,
  } = useAppStore(useShallow((state) => ({
    chatSessions: state.chatSessions,
    activeChatSessionId: state.activeChatSessionId,
    chatNewSessionShortcut: state.chatNewSessionShortcut,
    aiChatSidebarCollapsed: state.aiChatSidebarCollapsed,
    setActiveChatSession: state.setActiveChatSession,
    deleteChatSession: state.deleteChatSession,
    toggleAiChatSidebar: state.toggleAiChatSidebar,
  })))
  const t = useT()
  const [query, setQuery] = useState('')
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const [responsiveSidebarExpanded, setResponsiveSidebarExpanded] = useState(false)
  const contentId = useId()
  const searchId = useId()
  const sidebarRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const sidebarToggleRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const shortcut = formatShortcutLabel(chatNewSessionShortcut, window.api?.platform)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const responsiveCompact = viewportWidth < AI_CHAT_SIDEBAR_AUTO_COMPACT_BREAKPOINT
  const effectiveCollapsed = responsiveCompact ? !responsiveSidebarExpanded : aiChatSidebarCollapsed
  const responsiveOverlay = responsiveCompact && responsiveSidebarExpanded
  const activeTitle = chatSessions.find(session => session.id === activeChatSessionId)?.title || t.nav_chat
  const sessions = useMemo(() => [...chatSessions]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .filter(session => sessionMatchesQuery(session, normalizedQuery)), [chatSessions, normalizedQuery])

  const handleNewChat = () => {
    setActiveChatSession(null)
    setQuery('')
    setResponsiveSidebarExpanded(false)
  }
  const handleSelect = (id: string) => {
    setActiveChatSession(id)
    setResponsiveSidebarExpanded(false)
  }
  const handleToggle = () => {
    if (!responsiveCompact) {
      toggleAiChatSidebar()
      return
    }
    if (!responsiveSidebarExpanded) {
      window.dispatchEvent(new CustomEvent(CLOSE_PRIMARY_NAVIGATION_EVENT))
    }
    setResponsiveSidebarExpanded(open => !open)
  }

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  useEffect(() => {
    if (!responsiveCompact) setResponsiveSidebarExpanded(false)
  }, [responsiveCompact])
  useEffect(() => {
    const handleClose = () => setResponsiveSidebarExpanded(false)
    window.addEventListener(CLOSE_CONTEXT_SIDEBARS_EVENT, handleClose)
    return () => window.removeEventListener(CLOSE_CONTEXT_SIDEBARS_EVENT, handleClose)
  }, [])
  useEffect(() => {
    if (!responsiveOverlay) return
    searchRef.current?.focus()
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (sidebarRef.current?.contains(target) || headerRef.current?.contains(target)) return
      setResponsiveSidebarExpanded(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setResponsiveSidebarExpanded(false)
      requestAnimationFrame(() => sidebarToggleRef.current?.focus())
    }
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [responsiveOverlay])

  const header = (
    <header className="ai-chat-workspace-header" ref={headerRef}>
      <HistoryTrigger ref={sidebarToggleRef}
        label={t.history_trigger_label}
        count={chatSessions.length}
        expanded={!effectiveCollapsed}
        hideLabel={t.chat_sidebar_collapse}
        showLabel={t.chat_sidebar_expand}
        controlsId={contentId}
        className="ai-chat-history-toggle"
        onToggle={handleToggle} />
      <span className="ai-chat-workspace-title" title={activeTitle}>{activeTitle}</span>
      <Button size="md" shape="rect" variant="primary" appearance="ghost"
        className="ai-chat-header-new" aria-label={t.chat_new_session}
        title={shortcut ? `${t.chat_new_session} (${shortcut})` : t.chat_new_session}
        onClick={handleNewChat}>
        <PencilIcon className="h-4 w-4" />
        <span>{t.chat_new_session}</span>
        {shortcut && <kbd className="ai-chat-header-shortcut">{shortcut}</kbd>}
      </Button>
    </header>
  )
  const sidebar = (
    <aside ref={sidebarRef} id={contentId} className="ai-chat-sidebar"
      hidden={effectiveCollapsed} aria-label={t.chat_sidebar_label}
      data-collapsed={effectiveCollapsed} data-responsive-compact={responsiveCompact}
      data-responsive-overlay={responsiveOverlay} data-user-collapsed={aiChatSidebarCollapsed}
      data-sidebar-scope="chat">
      <div className="ai-chat-sidebar-header">
        <h2 className="ai-chat-sidebar-title">{t.chat_sidebar_conversations}</h2>
      </div>
      <div className="ai-chat-sidebar-content">
        <label className="ai-chat-search" htmlFor={searchId}>
          <SearchIcon className="ai-chat-search-icon" />
          <span className="sr-only">{t.chat_sidebar_search}</span>
          <Input ref={searchRef} id={searchId} size="md" type="search" value={query}
            onChange={event => setQuery(event.target.value)} placeholder={t.chat_sidebar_search}
            aria-label={t.chat_sidebar_search} className="ai-chat-search-input" />
        </label>
        <div className="ai-chat-session-section">
          <div className="ai-chat-session-heading">{t.chat_sidebar_recent}</div>
          <SessionList sessions={sessions}
            emptyLabel={normalizedQuery ? t.chat_sidebar_no_results : t.chat_session_panel_empty}
            activeSessionId={activeChatSessionId} t={t}
            onSelect={handleSelect} onDelete={deleteChatSession} />
        </div>
      </div>
    </aside>
  )
  return children ? children({ sidebar, header }) : <>{header}{sidebar}</>
}

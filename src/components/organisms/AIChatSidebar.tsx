import { type ReactNode, type RefObject, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore, useT } from '../../store/useAppStore'
import type { ChatSession } from '../../types'
import { getChatTaskDefinitions } from '../../utils/chatTaskConfiguration'
import { formatShortcutLabel } from '../../utils/keyboardShortcuts'
import { tpl } from '../../utils/tpl'
import { Button, Input } from '../ui/atoms'
import { PlusIcon, SearchIcon, SidebarPanelIcon } from '../ui/icons'
import { ChatSessionListItem } from '../ui/molecules/ChatSessionListItem'
import { ChatAIConfiguration } from './chat/ChatAIConfiguration'

interface RelativeTimeText {
  time_just_now: string
  time_m_ago: string
  time_h_ago: string
  time_d_ago: string
}

const AI_CHAT_SIDEBAR_AUTO_COMPACT_BREAKPOINT = 900
const DAY_MS = 86_400_000
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

/** The second line of a conversation row: its task, a paused research run, or when it was last used. */
function sessionMeta(session: ChatSession, t: ReturnType<typeof useT>): string {
  if (session.deepResearchResumeState && session.deepResearchResumeState.lastCompletedPhase !== 'synth') {
    return `${t.chat_task_deep} · ${t.chat_sidebar_paused}`
  }
  const selected = session.taskState?.selected
  if (selected != null) {
    const task = getChatTaskDefinitions(t)[selected]
    const option = task?.options.find((item) => item.value === session.taskState?.options[selected])
    if (task) return option ? `${task.title} · ${option.label}` : task.title
  }
  return formatSessionTime(session.updatedAt, t)
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
          meta={sessionMeta(session, t)}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </ul>
  )
}

/** Conversation history and its controls share state while occupying separate layout slots. */
/**
 * The pieces of the AI Chat page header. The page shell places them in the
 * shared `PageHeader` template; `ref` lets the compact history overlay treat
 * clicks on the header as inside.
 */
export interface AIChatHeaderParts {
  ref: RefObject<HTMLElement>
  title: string
  start: ReactNode
  actions: ReactNode
}

export function AIChatSidebar({ children }: {
  children: (slots: { sidebar: ReactNode; header: AIChatHeaderParts }) => ReactNode
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

  // Newest first, grouped the way people remember them: today, this week, earlier.
  const groups = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const today = startOfToday.getTime()
    const weekAgo = today - 6 * DAY_MS
    const buckets = [
      { key: 'today', label: t.chat_sidebar_today, sessions: [] as ChatSession[] },
      { key: 'week', label: t.chat_sidebar_this_week, sessions: [] as ChatSession[] },
      { key: 'earlier', label: t.chat_sidebar_earlier, sessions: [] as ChatSession[] },
    ]
    for (const session of sessions) {
      const bucket = session.updatedAt >= today ? 0 : session.updatedAt >= weekAgo ? 1 : 2
      buckets[bucket].sessions.push(session)
    }
    return buckets.filter((bucket) => bucket.sessions.length > 0)
  }, [sessions, t])

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

  const header: AIChatHeaderParts = {
    ref: headerRef,
    title: activeTitle,
    start: (
      <Button ref={sidebarToggleRef} size="sm" shape="icon" variant="neutral" appearance="ghost"
        className="ai-chat-history-toggle"
        aria-label={effectiveCollapsed ? t.chat_sidebar_expand : t.chat_sidebar_collapse}
        title={effectiveCollapsed ? t.chat_sidebar_expand : t.chat_sidebar_collapse}
        aria-expanded={!effectiveCollapsed} aria-controls={contentId}
        onClick={handleToggle}>
        <SidebarPanelIcon className="h-4 w-4" action={effectiveCollapsed ? 'expand' : 'collapse'} />
      </Button>
    ),
    actions: (
      <>
        <ChatAIConfiguration conversationId={activeChatSessionId} placement="below" />
        <Button size="sm" shape="icon" variant="neutral" appearance="ghost"
          className="ai-chat-header-new" aria-label={t.chat_new_session}
          title={shortcut ? `${t.chat_new_session} (${shortcut})` : t.chat_new_session}
          aria-keyshortcuts={chatNewSessionShortcut || undefined}
          onClick={handleNewChat}>
          <PlusIcon className="h-4 w-4" />
        </Button>
      </>
    ),
  }
  const sidebar = (
    <aside ref={sidebarRef} id={contentId} className="ai-chat-sidebar"
      hidden={effectiveCollapsed} aria-label={t.chat_sidebar_label}
      data-collapsed={effectiveCollapsed} data-responsive-compact={responsiveCompact}
      data-responsive-overlay={responsiveOverlay} data-user-collapsed={aiChatSidebarCollapsed}
      data-sidebar-scope="chat">
      <div className="ai-chat-sidebar-header">
        <label className="ai-chat-search" htmlFor={searchId}>
          <SearchIcon className="ai-chat-search-icon" />
          <span className="sr-only">{t.chat_sidebar_search}</span>
          <Input ref={searchRef} id={searchId} size="sm" type="search" value={query}
            onChange={event => setQuery(event.target.value)} placeholder={t.chat_sidebar_search}
            aria-label={t.chat_sidebar_search} className="ai-chat-search-input" />
        </label>
      </div>
      <div className="ai-chat-sidebar-content">
        {sessions.length === 0 ? (
          <p className="ai-chat-session-empty">{normalizedQuery ? t.chat_sidebar_no_results : t.chat_session_panel_empty}</p>
        ) : groups.map((group) => (
          <section key={group.key} className="ai-chat-session-section" aria-label={group.label}>
            <h3 className="ai-chat-session-heading">{group.label}</h3>
            <SessionList sessions={group.sessions}
              emptyLabel={t.chat_session_panel_empty}
              activeSessionId={activeChatSessionId} t={t}
              onSelect={handleSelect} onDelete={deleteChatSession} />
          </section>
        ))}
      </div>
    </aside>
  )
  return children({ sidebar, header })
}

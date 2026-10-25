import { type ReactNode, type RefObject, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { AppLocale } from '../../i18n'
import { useAppStore, useT } from '../../store/useAppStore'
import { useNotificationStore } from '../../store/useNotificationStore'
import type { ChatSession } from '../../types'
import { chatSessionTitle } from '../../utils/chatSessionTitle'
import { getChatTaskDefinitions } from '../../utils/chatTaskConfiguration'
import { formatShortcutLabel, shortcutKeyCaps } from '../../utils/keyboardShortcuts'
import { formatTimeAgo } from '../../utils/relativeTime'
import { Button, Input } from '../ui/atoms'
import { PlusIcon, SearchIcon, SidebarPanelIcon } from '../ui/icons'
import { ChatSessionListItem } from '../ui/molecules/ChatSessionListItem'
import { ChatAIConfiguration } from './chat/ChatAIConfiguration'

const AI_CHAT_SIDEBAR_AUTO_COMPACT_BREAKPOINT = 900
const DAY_MS = 86_400_000
const CLOSE_PRIMARY_NAVIGATION_EVENT = 'viezan:close-primary-navigation'
const CLOSE_CONTEXT_SIDEBARS_EVENT = 'viezan:close-context-sidebars'
/** Owner key of the "conversation deleted" toast: a newer delete replaces it. */
export const CHAT_SESSION_DELETED_KEY = 'chat-session-deleted'

function sessionTitle(session: ChatSession, t: ReturnType<typeof useT>): string {
  return chatSessionTitle(session.title, t.chat_new_session)
}

/** A research snapshot that has not reached synthesis yet. */
function hasUnfinishedResearch(session: ChatSession): boolean {
  return Boolean(session.deepResearchResumeState && session.deepResearchResumeState.lastCompletedPhase !== 'synth')
}

function sessionMatchesQuery(session: ChatSession, query: string, t: ReturnType<typeof useT>): boolean {
  if (!query) return true
  return [sessionTitle(session, t), session.model, session.provider]
    .some((value) => value.toLocaleLowerCase().includes(query))
}

/** The second line of a conversation row: its task, a paused research run, or when it was last used. */
function sessionMeta(session: ChatSession, running: boolean, t: ReturnType<typeof useT>, locale: AppLocale): string {
  // A run saves a snapshot after every phase, so only a snapshot with no run in flight is paused.
  if (hasUnfinishedResearch(session)) {
    return running ? t.chat_task_deep : `${t.chat_task_deep} · ${t.chat_sidebar_paused}`
  }
  const selected = session.taskState?.selected
  if (selected != null) {
    const task = getChatTaskDefinitions(t)[selected]
    const option = task?.options.find((item) => item.value === session.taskState?.options[selected])
    if (task) return option ? `${task.title} · ${option.label}` : task.title
  }
  return formatTimeAgo(session.updatedAt, t, locale)
}

interface SessionListProps {
  sessions: ChatSession[]
  emptyLabel: string
  activeSessionId: string | null
  runningSessionIds: string[]
  t: ReturnType<typeof useT>
  locale: AppLocale
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

/** Searchable conversation rows, including the empty state. */
function SessionList({ sessions, emptyLabel, activeSessionId, runningSessionIds, t, locale, onSelect, onDelete }: SessionListProps) {
  if (sessions.length === 0) {
    return <p className="ai-chat-session-empty">{emptyLabel}</p>
  }
  return (
    <ul className="ai-chat-session-list">
      {sessions.map((session) => {
        const running = runningSessionIds.includes(session.id)
        return (
        <ChatSessionListItem
          key={session.id}
          id={session.id}
          title={sessionTitle(session, t)}
          provider={session.provider}
          model={session.model}
          timeLabel={formatTimeAgo(session.updatedAt, t, locale)}
          messageCount={session.messages.filter((message) => !message.isLoading && !message.error).length}
          messageUnitLabel={t.history_chat_messages}
          active={session.id === activeSessionId}
          deleteLabel={t.history_chat_delete}
          pendingResearchLabel={t.chat_deep_research_resume}
          hasPendingResearch={hasUnfinishedResearch(session) && !running}
          meta={sessionMeta(session, running, t, locale)}
          onSelect={onSelect}
          onDelete={onDelete}
        />
        )
      })}
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
    chatSessions, activeChatSessionId, chatNewSessionShortcut, chatRunningSessionIds,
    aiChatSidebarCollapsed, setActiveChatSession, deleteChatSession, restoreChatSession, toggleAiChatSidebar,
  } = useAppStore(useShallow((state) => ({
    chatSessions: state.chatSessions,
    chatRunningSessionIds: state.chatRunningSessionIds,
    restoreChatSession: state.restoreChatSession,
    activeChatSessionId: state.activeChatSessionId,
    chatNewSessionShortcut: state.chatNewSessionShortcut,
    aiChatSidebarCollapsed: state.aiChatSidebarCollapsed,
    setActiveChatSession: state.setActiveChatSession,
    deleteChatSession: state.deleteChatSession,
    toggleAiChatSidebar: state.toggleAiChatSidebar,
  })))
  const t = useT()
  const locale = useAppStore((state) => state.locale)
  const notify = useNotificationStore((state) => state.notify)
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
  // Key caps as the sidebar shows ⌘K: "⌘N" on macOS, "Ctrl N" elsewhere.
  const shortcutKeys = shortcutKeyCaps(chatNewSessionShortcut, window.api?.platform)
    .join(window.api?.platform === 'darwin' ? '' : ' ')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const responsiveCompact = viewportWidth < AI_CHAT_SIDEBAR_AUTO_COMPACT_BREAKPOINT
  const effectiveCollapsed = responsiveCompact ? !responsiveSidebarExpanded : aiChatSidebarCollapsed
  const responsiveOverlay = responsiveCompact && responsiveSidebarExpanded
  const activeSession = chatSessions.find(session => session.id === activeChatSessionId)
  const activeTitle = (activeSession && sessionTitle(activeSession, t)) || t.nav_chat
  const sessions = useMemo(() => [...chatSessions]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .filter(session => sessionMatchesQuery(session, normalizedQuery, t)), [chatSessions, normalizedQuery, t])

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
  /** Delete right away and offer an undo that puts the conversation back where it was. */
  const handleDelete = (id: string) => {
    const index = chatSessions.findIndex((session) => session.id === id)
    const session = chatSessions[index]
    if (!session) return
    const wasActive = activeChatSessionId === id
    deleteChatSession(id)
    notify({
      key: CHAT_SESSION_DELETED_KEY,
      tone: 'success',
      message: t.chat_session_deleted,
      actions: [{
        label: t.chat_session_deleted_undo,
        onClick: () => {
          useNotificationStore.getState().dismiss(CHAT_SESSION_DELETED_KEY)
          restoreChatSession(session, index)
          if (wasActive) setActiveChatSession(id)
        },
      }],
    })
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
        {/* The shortcut sits inside the button, like the sidebar's Search ⌘K,
            so the whole hint is one clickable control. */}
        <Button size="sm" shape={shortcutKeys ? 'rect' : 'icon'} variant="neutral" appearance="ghost"
          className="ai-chat-header-new" aria-label={t.chat_new_session}
          title={shortcut ? `${t.chat_new_session} (${shortcut})` : t.chat_new_session}
          aria-keyshortcuts={chatNewSessionShortcut || undefined}
          onClick={handleNewChat}>
          <PlusIcon className="h-4 w-4" />
          {shortcutKeys && <kbd className="ai-chat-header-shortcut">{shortcutKeys}</kbd>}
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
              activeSessionId={activeChatSessionId} runningSessionIds={chatRunningSessionIds} t={t} locale={locale}
              onSelect={handleSelect} onDelete={handleDelete} />
          </section>
        ))}
      </div>
    </aside>
  )
  return children({ sidebar, header })
}

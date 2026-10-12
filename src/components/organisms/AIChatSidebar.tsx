import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore, useT } from '../../store/useAppStore'
import type { ChatSession } from '../../types'
import { formatShortcutLabel } from '../../utils/keyboardShortcuts'
import { tpl } from '../../utils/tpl'
import { Button, Input } from '../ui/atoms'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ConversationsIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
} from '../ui/icons'
import { ChatSessionListItem } from '../ui/molecules/ChatSessionListItem'

interface RelativeTimeText {
  time_just_now: string
  time_m_ago: string
  time_h_ago: string
  time_d_ago: string
}

interface SessionSwitcherPosition {
  top: number
  left: number
  width: number
  maxHeight: number
  layout: 'popover' | 'drawer'
}

const SESSION_SWITCHER_GAP = 8
const SESSION_SWITCHER_MARGIN = 12
const SESSION_SWITCHER_WIDTH = 288
const SESSION_SWITCHER_MAX_HEIGHT = 420
const SESSION_SWITCHER_DRAWER_BREAKPOINT = 720
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

/** Conversation rows (or the empty state) shared by the sidebar and the compact switcher. */
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

/** Contextual navigation for AI Chat conversations only. */
export function AIChatSidebar() {
  const {
    chatSessions,
    activeChatSessionId,
    chatNewSessionShortcut,
    aiChatSidebarCollapsed,
    setActiveChatSession,
    deleteChatSession,
    toggleAiChatSidebar,
  } = useAppStore(
    useShallow((state) => ({
      chatSessions: state.chatSessions,
      activeChatSessionId: state.activeChatSessionId,
      chatNewSessionShortcut: state.chatNewSessionShortcut,
      aiChatSidebarCollapsed: state.aiChatSidebarCollapsed,
      setActiveChatSession: state.setActiveChatSession,
      deleteChatSession: state.deleteChatSession,
      toggleAiChatSidebar: state.toggleAiChatSidebar,
    })),
  )
  const t = useT()
  const [query, setQuery] = useState('')
  const [sessionSwitcherOpen, setSessionSwitcherOpen] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const [responsiveSidebarExpanded, setResponsiveSidebarExpanded] = useState(false)
  const [sessionSwitcherPosition, setSessionSwitcherPosition] = useState<SessionSwitcherPosition | null>(null)
  const contentId = useId()
  const searchId = useId()
  const switcherId = useId()
  const switcherSearchId = useId()
  const switcherButtonRef = useRef<HTMLButtonElement>(null)
  const switcherPanelRef = useRef<HTMLDivElement>(null)
  const switcherSearchRef = useRef<HTMLInputElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const sidebarToggleRef = useRef<HTMLButtonElement>(null)
  const shortcut = formatShortcutLabel(chatNewSessionShortcut, window.api?.platform)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const responsiveCompact = viewportWidth < AI_CHAT_SIDEBAR_AUTO_COMPACT_BREAKPOINT
  const effectiveCollapsed = aiChatSidebarCollapsed || (
    responsiveCompact && !responsiveSidebarExpanded
  )
  const responsiveOverlay = responsiveCompact
    && responsiveSidebarExpanded
    && !aiChatSidebarCollapsed

  const sessions = useMemo(
    () => [...chatSessions]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .filter((session) => sessionMatchesQuery(session, normalizedQuery)),
    [chatSessions, normalizedQuery],
  )

  const handleNewChat = () => {
    setActiveChatSession(null)
    setQuery('')
    setSessionSwitcherOpen(false)
    setResponsiveSidebarExpanded(false)
  }

  const handleSelect = (id: string) => {
    setActiveChatSession(id)
    setSessionSwitcherOpen(false)
    setResponsiveSidebarExpanded(false)
  }

  const closeSessionSwitcher = useCallback((restoreFocus = false) => {
    setSessionSwitcherOpen(false)
    if (restoreFocus) requestAnimationFrame(() => switcherButtonRef.current?.focus())
  }, [])

  const updateSessionSwitcherPosition = useCallback(() => {
    const trigger = switcherButtonRef.current
    if (!trigger) return

    const triggerRect = trigger.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const drawer = viewportWidth < SESSION_SWITCHER_DRAWER_BREAKPOINT
    const width = Math.min(
      drawer ? 320 : SESSION_SWITCHER_WIDTH,
      viewportWidth - SESSION_SWITCHER_MARGIN * 2,
    )
    const maxHeight = Math.max(
      160,
      Math.min(
        drawer ? viewportHeight - SESSION_SWITCHER_MARGIN * 2 : SESSION_SWITCHER_MAX_HEIGHT,
        viewportHeight - SESSION_SWITCHER_MARGIN * 2,
      ),
    )

    if (drawer) {
      setSessionSwitcherPosition({
        top: SESSION_SWITCHER_MARGIN,
        left: viewportWidth - width - SESSION_SWITCHER_MARGIN,
        width,
        maxHeight,
        layout: 'drawer',
      })
      return
    }

    let left = triggerRect.right + SESSION_SWITCHER_GAP
    if (left + width > viewportWidth - SESSION_SWITCHER_MARGIN) {
      left = Math.max(
        SESSION_SWITCHER_MARGIN,
        triggerRect.left - width - SESSION_SWITCHER_GAP,
      )
    }
    const latestTop = viewportHeight - maxHeight - SESSION_SWITCHER_MARGIN
    const top = Math.max(
      SESSION_SWITCHER_MARGIN,
      Math.min(triggerRect.top, latestTop),
    )
    setSessionSwitcherPosition({ top, left, width, maxHeight, layout: 'popover' })
  }, [])

  useEffect(() => {
    if (!sessionSwitcherOpen) return
    updateSessionSwitcherPosition()
    switcherSearchRef.current?.focus()

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !switcherButtonRef.current?.contains(target)
        && !switcherPanelRef.current?.contains(target)
      ) {
        closeSessionSwitcher()
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeSessionSwitcher(true)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', updateSessionSwitcherPosition)
    window.addEventListener('scroll', updateSessionSwitcherPosition, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', updateSessionSwitcherPosition)
      window.removeEventListener('scroll', updateSessionSwitcherPosition, true)
    }
  }, [closeSessionSwitcher, sessionSwitcherOpen, updateSessionSwitcherPosition])

  useEffect(() => {
    if (!effectiveCollapsed) closeSessionSwitcher()
  }, [closeSessionSwitcher, effectiveCollapsed])

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!responsiveCompact) setResponsiveSidebarExpanded(false)
  }, [responsiveCompact])

  useEffect(() => {
    const handleClose = () => {
      setResponsiveSidebarExpanded(false)
      closeSessionSwitcher()
    }
    window.addEventListener(CLOSE_CONTEXT_SIDEBARS_EVENT, handleClose)
    return () => window.removeEventListener(CLOSE_CONTEXT_SIDEBARS_EVENT, handleClose)
  }, [closeSessionSwitcher])

  useEffect(() => {
    if (!responsiveOverlay) return

    const handlePointerDown = (event: PointerEvent) => {
      if (sidebarRef.current?.contains(event.target as Node)) return
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

  return (
    <aside
      ref={sidebarRef}
      className="ai-chat-sidebar"
      aria-label={t.chat_sidebar_label}
      data-collapsed={effectiveCollapsed}
      data-responsive-compact={responsiveCompact}
      data-responsive-overlay={responsiveOverlay}
      data-user-collapsed={aiChatSidebarCollapsed}
      data-sidebar-scope="chat"
    >
      <div className="ai-chat-sidebar-header">
        {!effectiveCollapsed && <h2 className="ai-chat-sidebar-title">{t.nav_chat}</h2>}
        <Button
          size="md"
          shape="icon"
          variant="neutral"
          appearance="ghost"
          ref={sidebarToggleRef}
          type="button"
          className="ai-chat-sidebar-toggle"
          title={effectiveCollapsed ? t.chat_sidebar_expand : t.chat_sidebar_collapse}
          aria-label={effectiveCollapsed ? t.chat_sidebar_expand : t.chat_sidebar_collapse}
          aria-expanded={!effectiveCollapsed}
          aria-controls={contentId}
          onClick={() => {
            closeSessionSwitcher()
            if (responsiveCompact) {
              if (!responsiveSidebarExpanded) {
                window.dispatchEvent(new CustomEvent(CLOSE_PRIMARY_NAVIGATION_EVENT))
              }
              if (aiChatSidebarCollapsed) {
                toggleAiChatSidebar()
                setResponsiveSidebarExpanded(true)
                return
              }
              setResponsiveSidebarExpanded((expanded) => !expanded)
            } else {
              toggleAiChatSidebar()
            }
          }}
        >
          {effectiveCollapsed
            ? <ChevronRightIcon className="h-4 w-4" />
            : <ChevronLeftIcon className="h-4 w-4" />}
        </Button>
      </div>

      {effectiveCollapsed && (
        <div className="ai-chat-sidebar-collapsed-actions">
          <Button
            size="md"
            shape="icon"
            variant="primary"
            appearance="ghost"
            className="ai-chat-sidebar-new-collapsed"
            aria-label={t.chat_new_session}
            title={shortcut ? `${t.chat_new_session} (${shortcut})` : t.chat_new_session}
            onClick={handleNewChat}
          >
            <PlusIcon className="h-4 w-4" />
          </Button>
          <Button
            ref={switcherButtonRef}
            size="md"
            shape="icon"
            variant={sessionSwitcherOpen ? 'primary' : 'neutral'}
            appearance={sessionSwitcherOpen ? 'soft' : 'ghost'}
            className="ai-chat-session-switcher-button"
            data-active={Boolean(activeChatSessionId)}
            aria-label={t.chat_sidebar_switch_sessions}
            title={t.chat_sidebar_switch_sessions}
            aria-haspopup="dialog"
            aria-expanded={sessionSwitcherOpen}
            aria-controls={switcherId}
            onClick={() => {
              if (sessionSwitcherOpen) {
                closeSessionSwitcher()
                return
              }
              setQuery('')
              updateSessionSwitcherPosition()
              setSessionSwitcherOpen(true)
            }}
          >
            <ConversationsIcon className="h-4 w-4" />
            {activeChatSessionId && (
              <span className="ai-chat-session-switcher-active-dot" aria-hidden="true" />
            )}
          </Button>
        </div>
      )}

      {effectiveCollapsed && sessionSwitcherOpen && sessionSwitcherPosition && createPortal(
        <div
          ref={switcherPanelRef}
          id={switcherId}
          className="ai-chat-session-switcher-panel fade-in"
          role="dialog"
          aria-label={t.chat_sidebar_switch_sessions}
          data-layout={sessionSwitcherPosition.layout}
          style={{
            top: sessionSwitcherPosition.top,
            left: sessionSwitcherPosition.left,
            width: sessionSwitcherPosition.width,
            maxHeight: sessionSwitcherPosition.maxHeight,
          }}
        >
          <div className="ai-chat-session-switcher-header">
            <span className="ai-chat-session-switcher-title">{t.chat_sidebar_conversations}</span>
          </div>
          <label
            className="ai-chat-search ai-chat-session-switcher-search"
            htmlFor={switcherSearchId}
          >
            <SearchIcon className="ai-chat-search-icon" />
            <span className="sr-only">{t.chat_sidebar_search}</span>
            <Input
              ref={switcherSearchRef}
              id={switcherSearchId}
              size="md"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.chat_sidebar_search}
              aria-label={t.chat_sidebar_search}
              className="ai-chat-search-input"
            />
          </label>
          <div className="ai-chat-session-switcher-list">
            <div className="ai-chat-session-heading">{t.chat_sidebar_recent}</div>
            <SessionList
              sessions={sessions}
              emptyLabel={normalizedQuery ? t.chat_sidebar_no_results : t.chat_session_panel_empty}
              activeSessionId={activeChatSessionId}
              t={t}
              onSelect={handleSelect}
              onDelete={deleteChatSession}
            />
          </div>
        </div>,
        document.body,
      )}

      <div
        id={contentId}
        className="ai-chat-sidebar-content"
        aria-hidden={effectiveCollapsed}
      >
        <Button
          size="md"
          shape="rect"
          variant="primary"
          appearance="ghost"
          className="ai-chat-new-button"
          aria-label={t.chat_new_session}
          title={shortcut ? `${t.chat_new_session} (${shortcut})` : t.chat_new_session}
          onClick={handleNewChat}
        >
          <PencilIcon className="h-4 w-4" />
          <span>{t.chat_new_session}</span>
          {shortcut && <kbd className="ai-chat-shortcut">{shortcut}</kbd>}
        </Button>

        <label className="ai-chat-search" htmlFor={searchId}>
          <SearchIcon className="ai-chat-search-icon" />
          <span className="sr-only">{t.chat_sidebar_search}</span>
          <Input
            id={searchId}
            size="md"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.chat_sidebar_search}
            aria-label={t.chat_sidebar_search}
            className="ai-chat-search-input"
          />
        </label>

        <div className="ai-chat-session-section">
          <div className="ai-chat-session-heading">{t.chat_sidebar_recent}</div>
          <SessionList
            sessions={sessions}
            emptyLabel={normalizedQuery ? t.chat_sidebar_no_results : t.chat_session_panel_empty}
            activeSessionId={activeChatSessionId}
            t={t}
            onSelect={handleSelect}
            onDelete={deleteChatSession}
          />
        </div>
      </div>
    </aside>
  )
}

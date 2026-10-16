import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../../../store/useAppStore'
import type { ChatSession } from '../../../types'
import { AIChatSidebar } from '../AIChatSidebar'

const sessions: ChatSession[] = [
  {
    id: 'older-chat',
    title: 'Older conversation',
    provider: 'claude',
    model: 'claude-sonnet-4-20250514',
    messages: [],
    createdAt: 1_000,
    updatedAt: 1_000,
  },
  {
    id: 'newer-chat',
    title: 'Newest conversation',
    provider: 'openai',
    model: 'gpt-5-mini',
    messages: [],
    createdAt: 2_000,
    updatedAt: 2_000,
  },
]

describe('AIChatSidebar', () => {
  it.each([
    ['win32', 'CommandOrControl+N', 'Ctrl+N'],
    ['darwin', 'CommandOrControl+N', 'Cmd+N'],
    ['linux', 'CommandOrControl+Shift+N', 'Ctrl+Shift+N'],
    ['win32', '', ''],
  ])('shows the configured header shortcut for %s (%s)', (platform, shortcut, label) => {
    const originalApi = window.api
    const originalShortcut = useAppStore.getState().chatNewSessionShortcut
    window.api = { ...originalApi, platform }
    try {
      act(() => useAppStore.setState({ chatNewSessionShortcut: shortcut }))
      render(<AIChatSidebar />)
      const button = screen.getByRole('button', { name: 'New Chat' })
      expect(button).toHaveAttribute('title', label ? `New Chat (${label})` : 'New Chat')
      if (label) expect(button.querySelector('kbd')).toHaveTextContent(label)
      else expect(button.querySelector('kbd')).toBeNull()
    } finally {
      window.api = originalApi
      act(() => useAppStore.setState({ chatNewSessionShortcut: originalShortcut }))
    }
  })

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1440,
    })
    act(() => {
      useAppStore.setState({
        locale: 'en',
        chatSessions: sessions,
        activeChatSessionId: 'older-chat',
        aiChatSidebarCollapsed: false,
        selectedProvider: 'local',
        selectedModels: {
          local: 'local-auto',
          openai: 'gpt-4o',
          claude: 'claude-sonnet-4-20250514',
          gemini: 'gemini-2.5-flash',
        },
      })
    })
  })

  it('is a separate contextual landmark and sorts newest conversations first', () => {
    render(<AIChatSidebar />)

    const sidebar = document.querySelector('.ai-chat-sidebar')
    const newest = screen.getByRole('button', { name: /^Newest conversation,/ })
    const older = screen.getByRole('button', { name: /^Older conversation,/ })

    expect(sidebar).toHaveAttribute('data-sidebar-scope', 'chat')
    expect(sidebar).toHaveClass('ai-chat-sidebar')
    expect(newest.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(older).toHaveAttribute('aria-current', 'true')
    expect(older.closest('li')).toHaveClass('chat-session-item', 'chat-session-item--active')
    expect(screen.getByText('Recent')).toHaveClass('ai-chat-session-heading')
  })

  it('restores the selected conversation provider and model', () => {
    render(<AIChatSidebar />)

    fireEvent.click(screen.getByRole('button', { name: /^Newest conversation,/ }))

    const state = useAppStore.getState()
    expect(state.activeChatSessionId).toBe('newer-chat')
    expect(state.selectedProvider).toBe('openai')
    expect(state.selectedModels.openai).toBe('gpt-5-mini')
  })

  it('starts a blank chat without deleting history and deletes independently', () => {
    render(<AIChatSidebar />)

    const newChatButton = screen.getByRole('button', { name: 'New Chat' })
    expect(newChatButton).toHaveAttribute('data-control-variant', 'primary')
    expect(newChatButton).toHaveAttribute('data-control-shape', 'rect')
    expect(newChatButton).toHaveAttribute('data-control-appearance', 'ghost')
    fireEvent.click(newChatButton)
    expect(useAppStore.getState().activeChatSessionId).toBeNull()
    expect(useAppStore.getState().chatSessions).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: /^Delete: Newest conversation,/ }))
    expect(useAppStore.getState().chatSessions.map((session) => session.id)).toEqual(['older-chat'])
    expect(useAppStore.getState().activeChatSessionId).toBeNull()
  })

  it('filters conversations and persists its collapse independently of primary navigation', () => {
    const { unmount } = render(<AIChatSidebar />)
    const sidebar = document.querySelector('.ai-chat-sidebar')

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search conversations…' }), {
      target: { value: 'newest' },
    })
    expect(screen.getByRole('searchbox', { name: 'Search conversations…' }))
      .toHaveAttribute('data-ui-control', 'input')
    expect(screen.getByRole('button', { name: /^Newest conversation,/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Older conversation,/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hide conversation history' }))
    expect(sidebar).toHaveAttribute('data-collapsed', 'true')
    expect(screen.getByRole('button', { name: 'Show conversation history' })).toBeInTheDocument()

    unmount()
    render(<AIChatSidebar />)
    expect(document.querySelector('.ai-chat-sidebar')).toHaveAttribute('hidden')
  })

  it('keeps history and New Chat in the header while the entire sidebar is hidden', () => {
    act(() => useAppStore.setState({ aiChatSidebarCollapsed: true, sidebarCollapsed: false }))
    render(<AIChatSidebar />)
    const toggle = screen.getByRole('button', { name: 'Show conversation history' })
    const newChat = screen.getByRole('button', { name: 'New Chat' })
    expect(toggle.closest('header')).toContainElement(newChat)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(document.querySelector('.ai-chat-sidebar')).toHaveAttribute('hidden')
    fireEvent.click(toggle)
    expect(screen.getByRole('complementary')).toBeVisible()
    expect(useAppStore.getState().sidebarCollapsed).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /^Newest conversation,/ }))
    expect(useAppStore.getState().activeChatSessionId).toBe('newer-chat')
    expect(toggle.closest('header')).toHaveTextContent('Newest conversation')
    fireEvent.click(screen.getByRole('button', { name: 'Hide conversation history' }))
    fireEvent.click(newChat)
    expect(useAppStore.getState().activeChatSessionId).toBeNull()
    expect(useAppStore.getState().chatSessions).toHaveLength(2)
    expect(useAppStore.getState().aiChatSidebarCollapsed).toBe(true)
  })

  it('opens compact history without changing either stored preference and restores focus on Escape', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    act(() => useAppStore.setState({ aiChatSidebarCollapsed: true, sidebarCollapsed: true }))
    render(<AIChatSidebar />)
    const toggle = screen.getByRole('button', { name: 'Show conversation history' })
    fireEvent.click(toggle)
    expect(screen.getByRole('searchbox')).toHaveFocus()
    expect(useAppStore.getState().aiChatSidebarCollapsed).toBe(true)
    expect(useAppStore.getState().sidebarCollapsed).toBe(true)
    fireEvent.pointerDown(toggle)
    fireEvent.click(toggle)
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(toggle).toHaveFocus())
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: /^Newest conversation,/ }))
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(useAppStore.getState().aiChatSidebarCollapsed).toBe(true)
    fireEvent.click(toggle)
    fireEvent(window, new CustomEvent('viezan:close-context-sidebars'))
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    act(() => {
      window.innerWidth = 1440
      window.dispatchEvent(new Event('resize'))
    })
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('auto-compacts into a temporary overlay without overwriting the user preference', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    render(<AIChatSidebar />)

    const sidebar = document.querySelector('.ai-chat-sidebar')
    expect(sidebar).toHaveAttribute('data-responsive-compact', 'true')
    expect(sidebar).toHaveAttribute('data-collapsed', 'true')
    expect(sidebar).toHaveAttribute('data-user-collapsed', 'false')
    expect(useAppStore.getState().aiChatSidebarCollapsed).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Show conversation history' }))
    expect(sidebar).toHaveAttribute('data-responsive-overlay', 'true')
    expect(sidebar).toHaveAttribute('data-collapsed', 'false')

    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(sidebar).toHaveAttribute('data-collapsed', 'true'))
    expect(useAppStore.getState().aiChatSidebarCollapsed).toBe(false)

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    fireEvent(window, new Event('resize'))
    await waitFor(() => expect(sidebar).toHaveAttribute('data-collapsed', 'false'))
  })

  it('respects its stored expansion at medium widths', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    render(<AIChatSidebar />)

    const sidebar = document.querySelector('.ai-chat-sidebar')
    expect(sidebar).toHaveAttribute('data-responsive-compact', 'false')
    expect(sidebar).toHaveAttribute('data-collapsed', 'false')
  })
})

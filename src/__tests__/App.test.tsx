import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { useAppStore } from '../store/useAppStore'
import type { QuickChatSeedPayload } from '../types'

describe('App quick chat bridge', () => {
  beforeEach(() => {
    act(() => {
      useAppStore.setState({
        activePage: 'translate',
        locale: 'en',
        settingsOpen: false,
        sidebarCollapsed: false,
        aiChatSidebarCollapsed: false,
        chatSessions: [],
        activeChatSessionId: null,
        chatPendingDraft: '',
        chatPendingTaskState: null,
        selectedProvider: 'local',
        keyStatus: { gemini: false, claude: false, openai: false, local: false },
      })
    })
    vi.mocked(window.api.quickChat.onOpenInChat).mockReset()
    vi.mocked(window.api.quickChat.onOpenInChat).mockReturnValue(() => {})
    vi.mocked(window.api.quickChat.onOpenSettings).mockReset()
    vi.mocked(window.api.quickChat.onOpenSettings).mockReturnValue(() => {})
  })

  it('opens the main chat with a seeded quick chat conversation', async () => {
    let openInChat: ((payload: QuickChatSeedPayload | null) => void) | null = null
    vi.mocked(window.api.quickChat.onOpenInChat).mockImplementation((cb) => {
      openInChat = cb
      return vi.fn()
    })

    render(<App />)

    await waitFor(() => expect(window.api.quickChat.onOpenInChat).toHaveBeenCalled())

    act(() => {
      openInChat?.({
        provider: 'local',
        model: 'local-auto',
        question: 'Summarize this release',
        response: 'Release summary is ready.',
      })
    })

    const state = useAppStore.getState()
    expect(state.activePage).toBe('chat')
    expect(state.chatSessions).toHaveLength(1)
    expect(state.activeChatSessionId).toBe(state.chatSessions[0].id)
    expect(state.chatSessions[0].provider).toBe('local')
    expect(state.chatSessions[0].model).toBe('local-auto')
    expect(state.chatSessions[0].messages).toMatchObject([
      { role: 'user', content: [{ type: 'text', text: 'Summarize this release' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Release summary is ready.' }] },
    ])
  })

  it('opens an unanswered quick chat question as an editable draft without sending', async () => {
    let openInChat: ((payload: QuickChatSeedPayload | null) => void) | null = null
    vi.mocked(window.api.quickChat.onOpenInChat).mockImplementation((cb) => {
      openInChat = cb
      return vi.fn()
    })
    vi.mocked(window.api.chatStream).mockClear()
    act(() => useAppStore.setState({ activePage: 'chat' }))
    render(<App />)
    await screen.findByPlaceholderText('Ask anything…')

    act(() => {
      openInChat?.({
        provider: 'local',
        model: 'local-auto',
        question: 'What is 5 + 7?',
      })
    })

    const state = useAppStore.getState()
    expect(state.chatSessions).toHaveLength(1)
    expect(state.chatSessions[0]).toMatchObject({
      provider: 'local',
      model: 'local-auto',
      draftInput: 'What is 5 + 7?',
      messages: [],
    })
    await waitFor(() => expect(screen.getByPlaceholderText('Ask anything…')).toHaveValue('What is 5 + 7?'))
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    expect(window.api.chatStream).not.toHaveBeenCalled()
  })

  it('composes primary navigation and AI Chat navigation as separate landmarks', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    act(() => {
      useAppStore.setState({ activePage: 'translate', locale: 'en' })
    })

    render(<App />)

    const primaryNavigation = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(primaryNavigation).toHaveAttribute('data-collapsed', 'false')
    expect(screen.queryByRole('complementary', { name: 'AI Chat conversations' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'AI Chat' }))
    await waitFor(() => {
      expect(screen.getByRole('complementary', { name: 'AI Chat conversations' }))
        .toHaveAttribute('data-collapsed', 'false')
    })
    expect(primaryNavigation).toHaveAttribute('data-collapsed', 'false')
  })

  it('opens the command palette with Ctrl+K and keeps sidebar open events idempotent', async () => {
    render(<App />)

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true, repeat: true })
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true, isComposing: true })
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' })
    expect(dialog).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new Event('viezan:open-command-palette'))
      window.dispatchEvent(new Event('viezan:open-command-palette'))
    })
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'K', ctrlKey: true })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument()
    })
  })

  it('keeps Settings and the command palette mutually exclusive', async () => {
    act(() => useAppStore.setState({ settingsOpen: true }))
    render(<App />)

    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()
    })

    act(() => useAppStore.getState().openSettings())
    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument()
    })
  })
})

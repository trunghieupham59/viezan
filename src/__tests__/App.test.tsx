import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LauncherFeatureRequest } from '../../shared/launcher'
import App from '../App'
import { useAppStore } from '../store/useAppStore'
import type { QuickChatSeedPayload, UsageCost } from '../types'

describe('App quick chat bridge', () => {
  beforeEach(() => {
    act(() => {
      useAppStore.setState({
        activePage: 'translate',
        locale: 'en',
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
    vi.mocked(window.api.quickChat.onOpenFeature).mockReset()
    vi.mocked(window.api.quickChat.onOpenFeature).mockReturnValue(() => {})
    vi.mocked(window.api.quickChat.onUsage).mockReset()
    vi.mocked(window.api.quickChat.onUsage).mockReturnValue(() => {})
  })

  it('books Quick AI usage into the shared cost totals', async () => {
    let onUsage: ((cost: UsageCost) => void) | null = null
    vi.mocked(window.api.quickChat.onUsage).mockImplementation((cb) => {
      onUsage = cb
      return vi.fn()
    })
    act(() => useAppStore.setState({ apiKeyUsageTotals: {} }))
    render(<App />)
    await waitFor(() => expect(window.api.quickChat.onUsage).toHaveBeenCalled())
    act(() => onUsage?.({
      id: 'cost-quick', feature: 'chat', provider: 'gemini', model: 'gemini-2.0-flash',
      amountUsd: 0.5, inputTokens: 10, outputTokens: 20, totalTokens: 30, estimated: true, createdAt: Date.now(),
    }))
    expect(useAppStore.getState().apiKeyUsageTotals.gemini?.byFeature?.chat).toMatchObject({ amountUsd: 0.5 })
  })

  it('seeds Translate and Dictionary from launcher feature requests', async () => {
    let openFeature: ((payload: LauncherFeatureRequest) => void) | null = null
    vi.mocked(window.api.quickChat.onOpenFeature).mockImplementation((cb) => {
      openFeature = cb
      return vi.fn()
    })
    render(<App />)
    await waitFor(() => expect(window.api.quickChat.onOpenFeature).toHaveBeenCalled())

    act(() => openFeature?.({ feature: 'translate', text: 'good morning' }))
    expect(useAppStore.getState().activePage).toBe('translate')
    expect(useAppStore.getState().sourceText).toBe('good morning')

    act(() => openFeature?.({ feature: 'dictionary', text: 'serendipity' }))
    expect(useAppStore.getState().activePage).toBe('dictionary')
    expect(useAppStore.getState().pendingDictionaryTerm).toBe('serendipity')

    act(() => openFeature?.({ feature: 'live' }))
    expect(useAppStore.getState().activePage).toBe('live')
    expect(useAppStore.getState().sourceText).toBe('good morning')
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

  it('seeds earlier Quick AI turns before the active pair', async () => {
    let openInChat: ((payload: QuickChatSeedPayload | null) => void) | null = null
    vi.mocked(window.api.quickChat.onOpenInChat).mockImplementation((cb) => {
      openInChat = cb
      return vi.fn()
    })
    render(<App />)
    await waitFor(() => expect(window.api.quickChat.onOpenInChat).toHaveBeenCalled())
    act(() => {
      openInChat?.({
        provider: 'local', model: 'local-auto',
        history: [{ role: 'user', text: 'First' }, { role: 'assistant', text: 'First answer' }],
        question: 'Second', response: 'Second answer',
      })
    })
    const session = useAppStore.getState().chatSessions[0]
    expect(session.messages.map(message => [message.role, message.content[0]]))
      .toEqual([
        ['user', { type: 'text', text: 'First' }], ['assistant', { type: 'text', text: 'First answer' }],
        ['user', { type: 'text', text: 'Second' }], ['assistant', { type: 'text', text: 'Second answer' }],
      ])
    expect(new Set(session.messages.map(message => message.id)).size).toBe(4)
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

  it('opens Settings as a page from the Launcher, and the palette over it', async () => {
    let onOpenSettings: (() => void) | null = null
    vi.mocked(window.api.quickChat.onOpenSettings).mockImplementation((cb) => {
      onOpenSettings = cb
      return vi.fn()
    })
    render(<App />)
    await waitFor(() => expect(onOpenSettings).not.toBeNull())

    act(() => onOpenSettings?.())
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
    expect(useAppStore.getState().activePage).toBe('settings')
  })

  it('falls back to Home when the saved page belongs to a disabled module', async () => {
    act(() => useAppStore.setState({ activePage: 'thermal', enabledModules: { ...useAppStore.getState().enabledModules, thermal: false } }))
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument()
    await waitFor(() => expect(useAppStore.getState().activePage).toBe('home'))
  })
})

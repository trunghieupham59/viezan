import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TRANSLATIONS } from '../../i18n'
import { ALL_MODULES_ENABLED } from '../../store/slices/modulesSlice'
import { useAppStore } from '../../store/useAppStore'
import type { ChatSession, HistoryItem } from '../../types'
import { HomePage } from '../HomePage'

const t = TRANSLATIONS.en
const NOW = Date.now()

const session = (id: string, extra: Partial<ChatSession> = {}) => ({
  id, title: `Title ${id}`, provider: 'local', model: 'qwen3:4b', createdAt: NOW, updatedAt: NOW,
  messages: [{ id: `${id}-m`, role: 'user', content: [{ type: 'text', text: 'hi' }], timestamp: NOW }],
  ...extra,
}) as unknown as ChatSession

const translation: HistoryItem = {
  id: 'h1', timestamp: NOW - 1000, provider: 'local', model: 'qwen3:4b',
  sourceLang: 'en', targetLang: 'ja', sourceText: 'Good morning', translatedText: 'おはよう',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(window.api.hotkey.get).mockResolvedValue({ success: true, settings: { enabled: true, hotkey: 'Alt+T' } })
  vi.mocked(window.api.hotkey.chat.get).mockResolvedValue({ success: true, settings: { enabled: true, hotkey: 'Command+Space' } })
  act(() => useAppStore.setState({
    locale: 'en',
    activePage: 'home',
    // The system card reads sensors; it has its own coverage.
    enabledModules: { ...ALL_MODULES_ENABLED, thermal: false },
    chatSessions: [],
    activeChatSessionId: null,
    history: [],
    liveSessions: [],
    dictionaryEntries: [],
    selectedProvider: 'openai',
    keyStatus: { gemini: false, claude: false, openai: false, local: false },
  }))
})

describe('HomePage', () => {
  it('offers the enabled features and an empty recent list', () => {
    act(() => useAppStore.setState({ enabledModules: { ...ALL_MODULES_ENABLED, thermal: false, live: false } }))
    render(<HomePage />)
    expect(screen.getByRole('heading', { level: 1, name: t.nav_home })).toBeInTheDocument()
    const quick = screen.getByRole('region', { name: t.home_quick_start })
    expect(within(quick).getAllByRole('button').map((button) => button.textContent)).toEqual([
      expect.stringContaining(t.nav_chat), expect.stringContaining(t.nav_translate), expect.stringContaining(t.nav_dictionary),
    ])
    expect(screen.getByText(t.home_resume_empty)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: t.home_system_title })).toBeNull()
  })

  it('reopens recent work where it was left', () => {
    act(() => useAppStore.setState({ chatSessions: [session('c1')], history: [translation] }))
    render(<HomePage />)
    const recent = screen.getByRole('region', { name: t.home_resume_title })

    fireEvent.click(within(recent).getByRole('button', { name: /Good morning/ }))
    expect(useAppStore.getState()).toMatchObject({ activePage: 'translate', sourceText: 'Good morning', targetLang: 'ja' })

    fireEvent.click(within(recent).getByRole('button', { name: /Title c1/ }))
    expect(useAppStore.getState()).toMatchObject({ activePage: 'chat', activeChatSessionId: 'c1' })
  })

  it('puts a paused research run first with a visible Resume', () => {
    const paused = session('r1', { deepResearchResumeState: {} as ChatSession['deepResearchResumeState'] })
    act(() => useAppStore.setState({ chatSessions: [paused], history: [translation] }))
    render(<HomePage />)
    const rows = within(screen.getByRole('region', { name: t.home_resume_title })).getAllByRole('button')
    expect(rows[0]).toHaveTextContent(t.home_kind_research)
    expect(rows[0]).toHaveTextContent(t.home_resume_action)
  })

  it('starts a new chat and says when the selected model needs a key', () => {
    act(() => useAppStore.setState({ activeChatSessionId: 'old' }))
    render(<HomePage />)
    expect(within(screen.getByRole('region', { name: t.home_ai_title })).getByText(t.home_ai_missing_key)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: t.home_new_chat }))
    expect(useAppStore.getState()).toMatchObject({ activePage: 'chat', activeChatSessionId: null })

    fireEvent.click(screen.getByRole('button', { name: t.home_ai_manage }))
    expect(useAppStore.getState()).toMatchObject({ activePage: 'settings', settingsInitialSection: 'api' })
  })

  it('lists the main shortcuts with their keys', async () => {
    render(<HomePage />)
    const shortcuts = screen.getByRole('region', { name: t.home_shortcuts_title })
    expect(await within(shortcuts).findByText(/Space/)).toBeInTheDocument()
    expect(within(shortcuts).getByText(t.shortcut_command_palette)).toBeInTheDocument()
    fireEvent.click(within(shortcuts).getByRole('button', { name: t.home_edit }))
    expect(useAppStore.getState().activePage).toBe('utilities')
  })
})

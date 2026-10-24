import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SHORTCUTS_CHANGED_EVENT } from '../../constants/ui'
import { TRANSLATIONS } from '../../i18n'
import { ALL_MODULES_ENABLED } from '../../store/slices/modulesSlice'
import { useAppStore } from '../../store/useAppStore'
import { EverywherePage } from '../EverywherePage'
import { UtilitiesPage } from '../UtilitiesPage'

vi.mock('../settings/HotkeySection', () => ({ HotkeySection: ({ part }: { part: string }) => <h2>{`Hotkey ${part}`}</h2> }))
vi.mock('../settings/BrowserIntegrationSection', () => ({ BrowserIntegrationSection: () => <h2>Browser content</h2> }))

const t = TRANSLATIONS.en

beforeEach(() => {
  vi.clearAllMocks()
  act(() => useAppStore.setState({ locale: 'en', enabledModules: { ...ALL_MODULES_ENABLED }, chatSendShortcut: 'enter', chatNewSessionShortcut: 'CommandOrControl+N' }))
  vi.mocked(window.api.hotkey.get).mockResolvedValue({ success: true, settings: { enabled: true, hotkey: 'Alt+T' } })
  vi.mocked(window.api.hotkey.chat.get).mockResolvedValue({ success: true, settings: { enabled: true, hotkey: 'Command+Space' } })
})

describe('Translate everywhere and Launcher & shortcuts pages', () => {
  it('puts Quick Translate with the Chrome extension, and the Launcher with every shortcut', () => {
    const view = render(<EverywherePage />)
    expect(screen.getByRole('heading', { level: 1, name: t.nav_everywhere })).toBeInTheDocument()
    expect(screen.getByText('Hotkey quickTranslate')).toBeInTheDocument()
    expect(screen.getByText('Browser content')).toBeInTheDocument()
    view.unmount()

    render(<UtilitiesPage />)
    expect(screen.getByRole('heading', { level: 1, name: t.nav_utilities })).toBeInTheDocument()
    expect(screen.getByText('Hotkey launcher')).toBeInTheDocument()
    const list = screen.getByRole('list', { name: t.shortcuts_all_title })
    expect(within(list).getAllByRole('listitem').map((row) => row.querySelector('.ui-shortcut-list__label')?.textContent)).toEqual([
      t.shortcut_launcher, t.shortcut_quick_translate, t.shortcut_command_palette, t.shortcut_new_chat, t.shortcut_send_message,
    ])
  })

  it('flags shortcuts that share keys and re-reads them when one is saved', async () => {
    vi.mocked(window.api.hotkey.get).mockResolvedValue({ success: true, settings: { enabled: true, hotkey: 'CommandOrControl+K' } })
    render(<UtilitiesPage />)
    await waitFor(() => expect(screen.getAllByText(t.shortcut_conflict)).toHaveLength(2))

    vi.mocked(window.api.hotkey.get).mockResolvedValue({ success: true, settings: { enabled: true, hotkey: 'Alt+T' } })
    act(() => { window.dispatchEvent(new Event(SHORTCUTS_CHANGED_EVENT)) })
    await waitFor(() => expect(screen.queryByText(t.shortcut_conflict)).toBeNull())
  })

  it('never flags a shortcut that is turned off', async () => {
    vi.mocked(window.api.hotkey.get).mockResolvedValue({ success: true, settings: { enabled: false, hotkey: 'CommandOrControl+K' } })
    render(<UtilitiesPage />)
    const list = screen.getByRole('list', { name: t.shortcuts_all_title })
    await waitFor(() => expect(within(list).getByText(new RegExp(t.shortcut_off))).toBeInTheDocument())
    expect(screen.queryByText(t.shortcut_conflict)).toBeNull()
    fireEvent.focus(window)
  })
})

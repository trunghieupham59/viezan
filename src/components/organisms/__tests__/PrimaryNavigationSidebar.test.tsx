import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TRANSLATIONS } from '../../../i18n'
import { ALL_MODULES_ENABLED } from '../../../store/slices/modulesSlice'
import { useAppStore } from '../../../store/useAppStore'
import { PrimaryNavigationSidebar } from '../PrimaryNavigationSidebar'

const t = TRANSLATIONS.en

beforeEach(() => {
  vi.clearAllMocks()
  act(() => useAppStore.setState({ locale: 'en', activePage: 'chat', sidebarCollapsed: false, enabledModules: { ...ALL_MODULES_ENABLED }, settingsOpen: false, settingsInitialSection: null }))
  vi.mocked(window.api.hotkey.get).mockResolvedValue({ success: true, settings: {} })
  vi.mocked(window.api.hotkey.chat.get).mockResolvedValue({ success: true, settings: {} })
  vi.mocked(window.api.localServer.listTokens).mockResolvedValue({ success: true, port: 39875, tokens: [] })
})

describe('PrimaryNavigationSidebar', () => {
  it('groups pages by space and drops a space whose pages are all disabled', () => {
    const view = render(<PrimaryNavigationSidebar toggleHost={null} />)
    const ai = screen.getByRole('region', { name: t.nav_space_ai })
    const language = screen.getByRole('region', { name: t.nav_space_language })
    expect(within(ai).getByRole('button', { name: t.nav_chat })).toHaveAttribute('aria-current', 'page')
    expect(within(language).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([t.nav_translate, t.nav_live_translate, t.nav_dictionary])
    expect(screen.getByRole('region', { name: t.nav_space_system })).toBeInTheDocument()
    view.unmount()

    act(() => useAppStore.setState({ enabledModules: { ...ALL_MODULES_ENABLED, thermal: false } }))
    render(<PrimaryNavigationSidebar toggleHost={null} />)
    expect(screen.queryByRole('region', { name: t.nav_space_system })).toBeNull()
  })

  it('puts the command search first and opens the palette from it', () => {
    const listener = vi.fn()
    window.addEventListener('viezan:open-command-palette', listener)
    render(<PrimaryNavigationSidebar toggleHost={null} />)
    const search = screen.getByRole('button', { name: t.nav_search_or_run })
    const navButtons = within(screen.getByRole('navigation', { name: t.nav_primary_sidebar })).getAllByRole('button')
    expect(navButtons[0]).toBe(search)
    fireEvent.click(search)
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener('viezan:open-command-palette', listener)
  })

  it('shows what runs in the background and opens the place that controls it', async () => {
    vi.mocked(window.api.hotkey.get).mockResolvedValue({ success: true, settings: { enabled: true } })
    vi.mocked(window.api.hotkey.chat.get).mockResolvedValue({ success: true, settings: { enabled: true } })
    vi.mocked(window.api.localServer.listTokens).mockResolvedValue({ success: true, port: 39875, tokens: [{ id: 'a', name: 'Chrome', createdAt: 1, expiresAt: 2 }] })
    render(<PrimaryNavigationSidebar toggleHost={null} />)

    const strip = await screen.findByRole('region', { name: t.nav_background_title })
    await waitFor(() => expect(within(strip).getByRole('button', { name: /Chrome extension/ })).toBeInTheDocument())
    const shortcuts = within(strip).getByRole('button', { name: /Global shortcuts/ })
    expect(shortcuts).toHaveTextContent('2')
    fireEvent.click(shortcuts)
    expect(useAppStore.getState()).toMatchObject({ settingsOpen: true, settingsInitialSection: 'hotkeys' })
  })

  it('hides the background strip when nothing runs and counts only enabled modules', async () => {
    vi.mocked(window.api.hotkey.chat.get).mockResolvedValue({ success: true, settings: { enabled: true } })
    act(() => useAppStore.setState({ enabledModules: { ...ALL_MODULES_ENABLED, launcher: false } }))
    render(<PrimaryNavigationSidebar toggleHost={null} />)
    await waitFor(() => expect(window.api.hotkey.get).toHaveBeenCalled())
    expect(window.api.hotkey.chat.get).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: t.nav_background_title })).toBeNull()
  })

  it('collapses the strip to one labelled dot on the rail', async () => {
    vi.mocked(window.api.hotkey.get).mockResolvedValue({ success: true, settings: { enabled: true } })
    act(() => useAppStore.setState({ sidebarCollapsed: true }))
    render(<PrimaryNavigationSidebar toggleHost={null} />)
    const dot = await screen.findByRole('img', { name: 'Running in the background: 1 items' })
    expect(dot).toHaveAttribute('data-tone', 'ok')
  })
})

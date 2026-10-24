import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TRANSLATIONS } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { SettingsPage } from '../SettingsPage'

vi.mock('../settings/PreferencesSection', () => ({ PreferencesSection: () => <h2>Preferences content</h2> }))
vi.mock('../settings/ModulesSection', () => ({ ModulesSection: () => <h2>Modules content</h2> }))
vi.mock('../settings/ApiKeysSection', () => ({ ApiKeysSection: () => <h2>Providers content</h2> }))
vi.mock('../settings/SttSection', () => ({ SttSection: () => <h2>STT content</h2> }))
vi.mock('../settings/TtsSection', () => ({ TtsSection: () => <h2>TTS content</h2> }))
vi.mock('../settings/ChatPresetsSection', () => ({ ChatPresetsSection: () => <h2>Chat content</h2> }))
vi.mock('../settings/HotkeySection', () => ({ HotkeySection: () => <h2>Hotkey content</h2> }))
vi.mock('../settings/BrowserIntegrationSection', () => ({ BrowserIntegrationSection: () => <h2>Browser content</h2> }))
vi.mock('../settings/UpdaterSection', () => ({ UpdaterSection: () => <h2>Updates content</h2> }))
vi.mock('../settings/AboutSection', () => ({ AboutSection: () => <h2>About content</h2> }))

describe('SettingsPage section navigation', () => {
  beforeEach(() => {
    act(() => useAppStore.setState({ locale: 'en', localeAuto: false }))
  })

  it('scrolls the owned viewport and focuses the selected section', async () => {
    const { container } = render(<SettingsPage />)
    const viewport = container.querySelector<HTMLElement>('.settings-scroll-viewport')
    expect(viewport).not.toBeNull()

    const label = TRANSLATIONS.en.settings_api_keys
    const firstSection = screen.getByRole('region', { name: TRANSLATIONS.en.settings_prefs })
    const section = screen.getByRole('region', { name: label })
    Object.defineProperty(firstSection, 'offsetTop', { configurable: true, value: 120 })
    Object.defineProperty(section, 'offsetTop', { configurable: true, value: 640 })
    Object.defineProperty(viewport, 'scrollTop', { configurable: true, writable: true, value: 0 })
    fireEvent.click(screen.getAllByRole('button', { name: label })[0])

    await waitFor(() => expect(viewport).toHaveProperty('scrollTop', 520))
    expect(section).toHaveFocus()
  })

  it('highlights the section whose top crossed the reading line while scrolling', async () => {
    const { container } = render(<SettingsPage />)
    const viewport = container.querySelector<HTMLElement>('.settings-scroll-viewport')
    if (!viewport) throw new Error('viewport missing')

    // Lay the eight sections out top to bottom; jsdom reports offsetTop 0 otherwise.
    const sectionTops = [0, 400, 800, 1200, 1600, 2000, 2400, 2800]
    const regions = Array.from(viewport.querySelectorAll<HTMLElement>('[data-settings-section]'))
    expect(regions).toHaveLength(sectionTops.length)
    regions.forEach((region, index) => {
      Object.defineProperty(region, 'offsetTop', { configurable: true, value: sectionTops[index] })
    })
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 400 })
    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 3200 })
    Object.defineProperty(viewport, 'scrollTop', { configurable: true, writable: true, value: 0 })

    const navButton = (name: string) => screen.getAllByRole('button', { name })[0]

    // AI models' top (800) is above the reading line (750 + 100 = 850 > 800): already active.
    viewport.scrollTop = 750
    fireEvent.scroll(viewport)
    await waitFor(() => expect(navButton(TRANSLATIONS.en.settings_api_keys)).toHaveAttribute('aria-current', 'true'))

    // Voice's top (1200) is still below the reading line at 1000 + 100.
    viewport.scrollTop = 1000
    fireEvent.scroll(viewport)
    await waitFor(() => expect(navButton(TRANSLATIONS.en.settings_api_keys)).toHaveAttribute('aria-current', 'true'))

    // At the very bottom the last section wins even though it is short.
    viewport.scrollTop = 2800
    fireEvent.scroll(viewport)
    await waitFor(() => expect(navButton(TRANSLATIONS.en.settings_about)).toHaveAttribute('aria-current', 'true'))
  })
})

describe('SettingsPage search', () => {
  beforeEach(() => {
    act(() => useAppStore.setState({ locale: 'en', localeAuto: false }))
  })

  it('is a page with a heading and filters sections by name and description', () => {
    render(<SettingsPage />)
    expect(screen.getByRole('heading', { level: 1, name: TRANSLATIONS.en.settings_title })).toBeInTheDocument()
    // Shortcuts and the browser moved to their own pages.
    expect(screen.queryByText('Hotkey content')).not.toBeInTheDocument()
    expect(screen.queryByText('Browser content')).not.toBeInTheDocument()

    const search = screen.getByRole('textbox', { name: TRANSLATIONS.en.settings_search_placeholder })
    fireEvent.change(search, { target: { value: TRANSLATIONS.en.settings_api_keys } })
    expect(screen.getByRole('region', { name: TRANSLATIONS.en.settings_api_keys })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: TRANSLATIONS.en.settings_prefs })).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'zzzz no such setting' } })
    expect(screen.getByRole('status')).toHaveTextContent(TRANSLATIONS.en.settings_search_empty)
  })
})

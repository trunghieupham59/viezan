import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TRANSLATIONS } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { SettingsPage } from '../SettingsPage'

vi.mock('../settings/PreferencesSection', () => ({ PreferencesSection: () => <h2>Preferences content</h2> }))
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
})

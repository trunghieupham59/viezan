import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationViewport } from '../../../components/organisms/NotificationViewport'
import { TRANSLATIONS } from '../../../i18n'
import { ALL_MODULES_ENABLED } from '../../../store/slices/modulesSlice'
import { useAppStore } from '../../../store/useAppStore'
import { ModulesSection } from '../ModulesSection'

const t = TRANSLATIONS.en

beforeEach(() => {
  vi.clearAllMocks()
  act(() => useAppStore.setState({ locale: 'en', enabledModules: ALL_MODULES_ENABLED, modulesLoaded: true }))
})

describe('ModulesSection', () => {
  it('lists every module as a switch and mirrors the main process after a toggle', async () => {
    vi.mocked(window.api.modules.setEnabled).mockResolvedValue({ success: true, enabled: { ...ALL_MODULES_ENABLED, live: false } })
    render(<ModulesSection />)

    expect(screen.getAllByRole('switch')).toHaveLength(6)
    const live = screen.getByRole('switch', { name: t.nav_live_translate })
    expect(live).toBeChecked()

    fireEvent.click(live)
    await waitFor(() => expect(window.api.modules.setEnabled).toHaveBeenCalledWith('live', false))
    await waitFor(() => expect(screen.getByRole('switch', { name: t.nav_live_translate })).not.toBeChecked())
    expect(useAppStore.getState().enabledModules.live).toBe(false)
  })

  it('locks the last workspace module on and says why', () => {
    act(() => useAppStore.setState({ enabledModules: { ...ALL_MODULES_ENABLED, chat: false, live: false, dictionary: false } }))
    render(<ModulesSection />)

    const translate = screen.getByRole('switch', { name: t.nav_translate })
    expect(translate).toBeChecked()
    expect(translate).toBeDisabled()
    expect(screen.getByText(t.settings_modules_last_page_hint)).toBeInTheDocument()
    // System modules are never locked by that rule.
    expect(screen.getByRole('switch', { name: t.settings_modules_launcher_label })).toBeEnabled()
  })

  it('keeps the old state and reports a failure in the notification stack', async () => {
    vi.mocked(window.api.modules.setEnabled).mockResolvedValue({ success: false, error: 'boom' })
    render(<><ModulesSection /><NotificationViewport /></>)

    fireEvent.click(screen.getByRole('switch', { name: t.settings_modules_browser_bridge_label }))
    expect(await screen.findByRole('alert')).toHaveTextContent(t.settings_modules_error)
    expect(screen.getByRole('switch', { name: t.settings_modules_browser_bridge_label })).toBeChecked()
    expect(useAppStore.getState().enabledModules['browser-bridge']).toBe(true)
  })
})

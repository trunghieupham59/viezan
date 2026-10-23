import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationViewport } from '../../../components/organisms/NotificationViewport'
import { useAppStore } from '../../../store/useAppStore'
import { PreferencesSection } from '../PreferencesSection'

beforeEach(() => {
  useAppStore.setState({ locale: 'en', localeAuto: false })
})
afterEach(() => {
  cleanup()
  // Back to the setup defaults: the API is always present, the platform just reports "unsupported".
  window.api.getLoginItemSettings = vi.fn().mockResolvedValue({ supported: false, openAtLogin: false })
  window.api.setLoginItemSettings = vi.fn().mockResolvedValue({ success: false, openAtLogin: false })
})

describe('launch at login preference', () => {
  it('hides the row where the platform or build cannot register a login item', async () => {
    window.api.getLoginItemSettings = vi.fn().mockResolvedValue({ supported: false, openAtLogin: false })
    await act(async () => { render(<PreferencesSection />) })
    expect(screen.queryByRole('switch', { name: 'Start with the system' })).toBeNull()
  })

  it('reflects the OS setting and saves the toggle through the main process', async () => {
    window.api.getLoginItemSettings = vi.fn().mockResolvedValue({ supported: true, openAtLogin: false })
    window.api.setLoginItemSettings = vi.fn().mockResolvedValue({ success: true, openAtLogin: true })
    await act(async () => { render(<PreferencesSection />) })
    const toggle = screen.getByRole('switch', { name: 'Start with the system' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await act(async () => fireEvent.click(toggle))
    expect(window.api.setLoginItemSettings).toHaveBeenCalledWith(true)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('keeps the previous value and reports a failed save', async () => {
    window.api.getLoginItemSettings = vi.fn().mockResolvedValue({ supported: true, openAtLogin: true })
    window.api.setLoginItemSettings = vi.fn().mockResolvedValue({ success: false, openAtLogin: true, error: 'registry locked' })
    await act(async () => { render(<><PreferencesSection /><NotificationViewport /></>) })
    const toggle = screen.getByRole('switch', { name: 'Start with the system' })
    await act(async () => fireEvent.click(toggle))
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Could not change the startup setting')
  })
})

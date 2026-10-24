import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../../store/useAppStore'
import { useNotificationStore } from '../../../store/useNotificationStore'
import { LauncherShortcutNotice } from '../LauncherShortcutNotice'
import { NotificationViewport } from '../NotificationViewport'

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState({ locale: 'en', activePage: 'chat', settingsInitialSection: null })
  useNotificationStore.getState().clear()
  window.api.platform = 'darwin'
})

describe('LauncherShortcutNotice', () => {
  it('warns once at startup when Spotlight owns the enabled Launcher shortcut and opens Settings on request', async () => {
    vi.mocked(window.api.hotkey.chat.systemConflict).mockResolvedValue({
      success: true, hotkey: 'Command+Space', enabled: true, conflict: { owner: 'spotlight', accelerator: 'Command+Space' },
    })
    render(<><LauncherShortcutNotice /><NotificationViewport /></>)

    expect(await screen.findByText(/Spotlight is using the Launcher shortcut Command\+Space/)).toBeInTheDocument()
    expect(window.api.hotkey.chat.systemConflict).toHaveBeenCalledWith()

    fireEvent.click(screen.getByRole('button', { name: 'See how to fix' }))
    expect(useAppStore.getState().activePage).toBe('utilities')
    await waitFor(() => expect(screen.queryByText(/Spotlight is using/)).not.toBeInTheDocument())
  })

  it('stays quiet when the shortcut is disabled, free, or on another platform', async () => {
    vi.mocked(window.api.hotkey.chat.systemConflict).mockResolvedValue({
      success: true, hotkey: 'Command+Space', enabled: false, conflict: { owner: 'spotlight', accelerator: 'Command+Space' },
    })
    const { unmount } = render(<><LauncherShortcutNotice /><NotificationViewport /></>)
    await waitFor(() => expect(window.api.hotkey.chat.systemConflict).toHaveBeenCalled())
    expect(screen.queryByText(/Spotlight/)).not.toBeInTheDocument()
    unmount()

    vi.mocked(window.api.hotkey.chat.systemConflict).mockClear()
    window.api.platform = 'win32'
    render(<><LauncherShortcutNotice /><NotificationViewport /></>)
    await Promise.resolve()
    expect(window.api.hotkey.chat.systemConflict).not.toHaveBeenCalled()
  })
})

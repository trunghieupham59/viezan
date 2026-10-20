import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../../store/useAppStore'
import { HotkeySection } from '../HotkeySection'

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState({ locale: 'en' })
  vi.mocked(window.api.hotkey.chat.get).mockResolvedValue({ success: true, settings: {} })
  vi.mocked(window.api.hotkey.chat.update).mockResolvedValue({ success: true })
})

describe('launcher shortcut settings', () => {
  it.each([['darwin', 'Command+Space'], ['win32', 'Alt+Space']])('suggests %s default without registering until enabled', async (platform, shortcut) => {
    window.api.platform = platform
    render(<HotkeySection />)
    expect(await screen.findByRole('button', { name: shortcut })).toBeInTheDocument()
    expect(window.api.hotkey.chat.update).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('switch')[1])
    await waitFor(() => expect(window.api.hotkey.chat.update).toHaveBeenCalledWith({ enabled: true, hotkey: shortcut }))
  })

  it('preserves a saved shortcut and restores it after a conflict', async () => {
    window.api.platform = 'darwin'
    vi.mocked(window.api.hotkey.chat.get).mockResolvedValue({ success: true, settings: { hotkey: 'Alt+Shift+C', enabled: true } })
    vi.mocked(window.api.hotkey.chat.update).mockResolvedValue({
      success: false, errorCode: 'IN_USE', error: 'raw backend error',
      settings: { hotkey: 'Alt+Shift+C', enabled: true },
    })
    render(<HotkeySection />)
    const recorder = await screen.findByRole('button', { name: 'Alt+Shift+C' })
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: ' ', metaKey: true })
    expect(await screen.findByText(/check the Spotlight shortcut/)).toBeInTheDocument()
    expect(screen.queryByText('raw backend error')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Alt+Shift+C' })).toBeInTheDocument()
    expect(screen.getAllByRole('switch')[1]).toHaveAttribute('aria-checked', 'true')
  })
})

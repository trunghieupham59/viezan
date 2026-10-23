import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../../store/useAppStore'
import { useNotificationStore } from '../../../store/useNotificationStore'
import { LauncherSpotlightPrompt } from '../LauncherSpotlightPrompt'
import { NotificationViewport } from '../NotificationViewport'

const spotlight = () => window.api.hotkey.chat.spotlight

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState({ locale: 'en' })
  useNotificationStore.getState().clear()
  window.api.platform = 'darwin'
  vi.mocked(spotlight().get).mockResolvedValue({ success: true, shouldPrompt: true, disabledByViezan: false })
  vi.mocked(spotlight().resolve).mockResolvedValue({ success: true, applied: true })
})

describe('LauncherSpotlightPrompt', () => {
  it('asks on first run and hands Command+Space over on "replace"', async () => {
    render(<><LauncherSpotlightPrompt /><NotificationViewport /></>)
    const dialog = await screen.findByRole('dialog', { name: 'Use Command+Space for Viezan Launcher?' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText(/turns the Spotlight shortcut off/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Use Command+Space for Viezan' }))
    await waitFor(() => expect(spotlight().resolve).toHaveBeenCalledWith('replace'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText(/Viezan Launcher now opens with Command\+Space/)).toBeInTheDocument()
  })

  it('keeps Spotlight and enables Option+Space on "keep", also via Escape', async () => {
    render(<><LauncherSpotlightPrompt /><NotificationViewport /></>)
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Keep Spotlight, use Option+Space' }))
    await waitFor(() => expect(spotlight().resolve).toHaveBeenCalledWith('keep'))
    expect(await screen.findByText('Viezan Launcher opens with Option+Space.')).toBeInTheDocument()
  })

  it('treats Escape as keeping Spotlight', async () => {
    render(<><LauncherSpotlightPrompt /><NotificationViewport /></>)
    await screen.findByRole('dialog')
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    await waitFor(() => expect(spotlight().resolve).toHaveBeenCalledWith('keep'))
  })

  it('warns when macOS only applies the change after a new login, and keeps the prompt on failure', async () => {
    vi.mocked(spotlight().resolve).mockResolvedValueOnce({ success: false, errorCode: 'SYSTEM', error: 'nope' })
    render(<><LauncherSpotlightPrompt /><NotificationViewport /></>)
    await screen.findByRole('dialog')

    fireEvent.click(screen.getByRole('button', { name: 'Use Command+Space for Viezan' }))
    expect(await screen.findByText(/Could not turn the Spotlight shortcut off/)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    vi.mocked(spotlight().resolve).mockResolvedValueOnce({ success: true, applied: false })
    fireEvent.click(screen.getByRole('button', { name: 'Use Command+Space for Viezan' }))
    expect(await screen.findByText(/after you log out and back in/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('stays hidden when not needed, while blocked, and off macOS', async () => {
    vi.mocked(spotlight().get).mockResolvedValue({ success: true, shouldPrompt: false, disabledByViezan: false })
    const { unmount } = render(<LauncherSpotlightPrompt />)
    await waitFor(() => expect(spotlight().get).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    unmount()

    vi.mocked(spotlight().get).mockResolvedValue({ success: true, shouldPrompt: true, disabledByViezan: false })
    const blocked = render(<LauncherSpotlightPrompt blocked />)
    await waitFor(() => expect(spotlight().get).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    blocked.unmount()

    vi.mocked(spotlight().get).mockClear()
    window.api.platform = 'win32'
    render(<LauncherSpotlightPrompt />)
    await Promise.resolve()
    expect(spotlight().get).not.toHaveBeenCalled()
  })
})

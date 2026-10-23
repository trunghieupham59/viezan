import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationViewport } from '../../../components/organisms/NotificationViewport'
import { useAppStore } from '../../../store/useAppStore'
import { HotkeySection } from '../HotkeySection'

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState({ locale: 'en', targetLang: 'vi' })
  vi.mocked(window.api.hotkey.get).mockResolvedValue({ success: true, settings: {} })
  vi.mocked(window.api.hotkey.update).mockResolvedValue({ success: true })
  vi.mocked(window.api.hotkey.accessibility.get).mockResolvedValue({ success: true, required: false, granted: true })
  vi.mocked(window.api.hotkey.accessibility.request).mockResolvedValue({ success: true, required: false, granted: true })
  vi.mocked(window.api.hotkey.chat.get).mockResolvedValue({ success: true, settings: {} })
  vi.mocked(window.api.hotkey.chat.update).mockResolvedValue({ success: true })
})

describe('quick translate language pair', () => {
  const primary = () => screen.findByRole('button', { name: /Primary language/ })
  const secondary = () => screen.findByRole('button', { name: /Secondary language/ })

  it('shows the persisted pair instead of the Translate page target', async () => {
    vi.mocked(window.api.hotkey.get).mockResolvedValue({
      success: true, settings: { hotkey: 'Alt+Shift+T', enabled: true, targetLang: 'ja', secondaryLang: 'en' },
    })
    render(<><HotkeySection /><NotificationViewport /></>)
    expect(await primary()).toHaveTextContent('Japanese')
    expect(await secondary()).toHaveTextContent('English')
    expect(screen.getByText(/Text in the primary language is translated into the secondary one/)).toBeInTheDocument()
  })

  it('falls back to the Translate page target with the pair off when nothing is persisted', async () => {
    render(<><HotkeySection /><NotificationViewport /></>)
    expect(await primary()).toHaveTextContent('Vietnamese')
    expect(await secondary()).toHaveTextContent('Off')
    expect(screen.getByText(/Everything is translated into the primary language/)).toBeInTheDocument()
  })

  it('saves a new secondary language without changing the Translate page', async () => {
    vi.mocked(window.api.hotkey.get).mockResolvedValue({
      success: true, settings: { hotkey: 'Alt+Shift+T', enabled: true, targetLang: 'vi', secondaryLang: 'en' },
    })
    render(<><HotkeySection /><NotificationViewport /></>)
    fireEvent.click(await secondary())
    // The primary language is not offered as a secondary one.
    expect(screen.queryByRole('option', { name: 'Vietnamese' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: 'French' }))

    await waitFor(() => expect(window.api.hotkey.update).toHaveBeenLastCalledWith(expect.objectContaining({ targetLang: 'vi', secondaryLang: 'fr' })))
    expect(useAppStore.getState().targetLang).toBe('vi')
    expect(await secondary()).toHaveTextContent('French')
  })

  it('swaps the pair when the secondary language is chosen as primary', async () => {
    vi.mocked(window.api.hotkey.get).mockResolvedValue({
      success: true, settings: { hotkey: 'Alt+Shift+T', enabled: true, targetLang: 'vi', secondaryLang: 'en' },
    })
    render(<><HotkeySection /><NotificationViewport /></>)
    fireEvent.click(await primary())
    fireEvent.click(screen.getByRole('option', { name: 'English' }))

    await waitFor(() => expect(window.api.hotkey.update).toHaveBeenLastCalledWith(expect.objectContaining({ targetLang: 'en', secondaryLang: 'vi' })))
    expect(await primary()).toHaveTextContent('English')
    expect(await secondary()).toHaveTextContent('Vietnamese')
  })

  it('turns the pair off', async () => {
    vi.mocked(window.api.hotkey.get).mockResolvedValue({
      success: true, settings: { hotkey: 'Alt+Shift+T', enabled: true, targetLang: 'vi', secondaryLang: 'en' },
    })
    render(<><HotkeySection /><NotificationViewport /></>)
    fireEvent.click(await secondary())
    fireEvent.click(screen.getByRole('option', { name: /^Off/ }))

    await waitFor(() => expect(window.api.hotkey.update).toHaveBeenLastCalledWith(expect.objectContaining({ secondaryLang: '' })))
    expect(await screen.findByText(/Everything is translated into the primary language/)).toBeInTheDocument()
  })

  it('names the direction in the done toast', async () => {
    let onTranslated: ((data: { original: string; translated: string; targetLang: string | null }) => void) | undefined
    vi.mocked(window.api.hotkey.onTranslated).mockImplementation((cb) => { onTranslated = cb; return () => {} })
    render(<><HotkeySection /><NotificationViewport /></>)
    await primary()

    act(() => { onTranslated?.({ original: 'a', translated: 'b', targetLang: 'en' }) })
    expect(await screen.findByText('Translated into English')).toBeInTheDocument()
  })
})

describe('macOS Accessibility permission', () => {
  it('shows nothing where no permission is needed', async () => {
    render(<><HotkeySection /><NotificationViewport /></>)
    await screen.findByRole('button', { name: /Primary language/ })
    expect(screen.queryByText(/Accessibility permission/)).not.toBeInTheDocument()
  })

  it('explains the missing permission and opens System Settings on request', async () => {
    vi.mocked(window.api.hotkey.accessibility.get).mockResolvedValue({ success: true, required: true, granted: false })
    vi.mocked(window.api.hotkey.accessibility.request).mockResolvedValue({ success: true, required: true, granted: true })
    render(<><HotkeySection /><NotificationViewport /></>)

    expect(await screen.findByText(/needs Accessibility access/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open System Settings' }))
    await waitFor(() => expect(window.api.hotkey.accessibility.request).toHaveBeenCalled())
    expect(await screen.findByText('Accessibility access is granted.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open System Settings' })).not.toBeInTheDocument()
  })

  it('maps a permission error from a hotkey run to a localized toast', async () => {
    let onError: ((data: { error: string; errorCode?: string }) => void) | undefined
    vi.mocked(window.api.hotkey.onError).mockImplementation((cb) => { onError = cb; return () => {} })
    render(<><HotkeySection /><NotificationViewport /></>)
    await screen.findByRole('button', { name: /Primary language/ })

    act(() => { onError?.({ error: 'raw main-process message', errorCode: 'ACCESSIBILITY_DENIED' }) })
    expect(await screen.findByText(/Open System Settings > Privacy & Security/)).toBeInTheDocument()
    expect(screen.queryByText('raw main-process message')).not.toBeInTheDocument()
    expect(await screen.findByText(/needs Accessibility access to copy/)).toBeInTheDocument()
  })
})

describe('launcher shortcut settings', () => {
  it.each([['darwin', 'Command+Space'], ['win32', 'Alt+Space']])('suggests %s default without registering until enabled', async (platform, shortcut) => {
    window.api.platform = platform
    render(<><HotkeySection /><NotificationViewport /></>)
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
    render(<><HotkeySection /><NotificationViewport /></>)
    const recorder = await screen.findByRole('button', { name: 'Alt+Shift+C' })
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: ' ', metaKey: true })
    expect(await screen.findByText(/check the Spotlight shortcut/)).toBeInTheDocument()
    expect(screen.queryByText('raw backend error')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Alt+Shift+C' })).toBeInTheDocument()
    expect(screen.getAllByRole('switch')[1]).toHaveAttribute('aria-checked', 'true')
  })
})

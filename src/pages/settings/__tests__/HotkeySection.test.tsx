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
  vi.mocked(window.api.capabilities.get).mockResolvedValue({ success: true, statuses: [
    { id: 'input.accessibility', supported: true, permission: 'not-required' },
    { id: 'launcher.spotlight', supported: false, permission: 'not-required', detail: { disabledByViezan: false, conflict: null } },
  ] })
  vi.mocked(window.api.capabilities.request).mockResolvedValue({ success: true, status: { id: 'input.accessibility', supported: true, permission: 'not-required' } })
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
    vi.mocked(window.api.capabilities.get).mockResolvedValue({ success: true, statuses: [{ id: 'input.accessibility', supported: true, permission: 'denied' }] })
    vi.mocked(window.api.capabilities.request).mockResolvedValue({ success: true, status: { id: 'input.accessibility', supported: true, permission: 'granted' } })
    render(<><HotkeySection /><NotificationViewport /></>)

    expect(await screen.findByText(/needs Accessibility access/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open System Settings' }))
    await waitFor(() => expect(window.api.capabilities.request).toHaveBeenCalledWith('input.accessibility'))
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

describe('quick translate default shortcut', () => {
  it.each([['darwin', 'Option+T'], ['win32', 'Alt+T']])('offers Alt+T on %s (shown as %s) when nothing is saved and saves the stored form', async (platform, label) => {
    window.api.platform = platform
    vi.mocked(window.api.hotkey.get).mockResolvedValue({ success: true, settings: {} })
    render(<><HotkeySection /><NotificationViewport /></>)
    expect(await screen.findByRole('button', { name: label })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('switch')[0])
    await waitFor(() => expect(window.api.hotkey.update).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true, hotkey: 'Alt+T' })))
  })

  it('shows the shortcut main ships enabled', async () => {
    window.api.platform = 'darwin'
    vi.mocked(window.api.hotkey.get).mockResolvedValue({ success: true, settings: { hotkey: 'Alt+T', enabled: true, targetLang: 'en', secondaryLang: 'vi' } })
    render(<><HotkeySection /><NotificationViewport /></>)
    expect(await screen.findByRole('button', { name: 'Option+T' })).toBeInTheDocument()
    expect(screen.getAllByRole('switch')[0]).toHaveAttribute('aria-checked', 'true')
  })
})

describe('launcher shortcut system conflict (macOS)', () => {
  beforeEach(() => {
    window.api.platform = 'darwin'
    vi.mocked(window.api.hotkey.chat.get).mockResolvedValue({ success: true, settings: { hotkey: 'Command+Space', enabled: true } })
  })

  it('shows nothing when the system does not own the shortcut', async () => {
    render(<><HotkeySection /><NotificationViewport /></>)
    await screen.findByRole('button', { name: 'Command+Space' })
    await waitFor(() => expect(window.api.hotkey.chat.systemConflict).toHaveBeenCalledWith('Command+Space'))
    expect(screen.queryByText(/Spotlight is using/)).not.toBeInTheDocument()
  })

  it('explains a Spotlight conflict with a link to System Settings and an alternative shortcut', async () => {
    vi.mocked(window.api.hotkey.chat.systemConflict).mockResolvedValue({
      success: true, hotkey: 'Command+Space', enabled: true, conflict: { owner: 'spotlight', accelerator: 'Command+Space' },
    })
    render(<><HotkeySection /><NotificationViewport /></>)

    expect(await screen.findByText('Spotlight is using Command+Space')).toBeInTheDocument()
    expect(screen.getByText(/Keyboard Shortcuts > Spotlight/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open System Settings' }))
    expect(window.api.openExternal).toHaveBeenCalledWith('x-apple.systempreferences:com.apple.Keyboard-Settings.extension?Shortcuts')

    vi.mocked(window.api.hotkey.chat.systemConflict).mockResolvedValue({ success: true, hotkey: 'Alt+Space', enabled: true, conflict: null })
    fireEvent.click(screen.getByRole('button', { name: 'Use Option+Space instead' }))
    await waitFor(() => expect(window.api.hotkey.chat.update).toHaveBeenCalledWith({ enabled: true, hotkey: 'Alt+Space' }))
    expect(await screen.findByRole('button', { name: 'Option+Space' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(/Spotlight is using/)).not.toBeInTheDocument())
  })

  it('turns the Spotlight shortcut off from the conflict card and offers to restore it', async () => {
    vi.mocked(window.api.hotkey.chat.systemConflict).mockResolvedValue({
      success: true, hotkey: 'Command+Space', enabled: false, conflict: { owner: 'spotlight', accelerator: 'Command+Space' },
    })
    vi.mocked(window.api.hotkey.chat.spotlight.resolve).mockResolvedValue({ success: true, applied: true, settings: { enabled: true, hotkey: 'Command+Space' } })
    render(<><HotkeySection /><NotificationViewport /></>)

    fireEvent.click(await screen.findByRole('button', { name: 'Turn Spotlight shortcut off' }))
    await waitFor(() => expect(window.api.hotkey.chat.spotlight.resolve).toHaveBeenCalledWith('replace'))
    expect(await screen.findByText(/Viezan Launcher now opens with Command\+Space/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(/Spotlight is using/)).not.toBeInTheDocument())
    expect(screen.getAllByRole('switch')[1]).toHaveAttribute('aria-checked', 'true')

    vi.mocked(window.api.hotkey.chat.spotlight.restore).mockResolvedValue({ success: true, applied: true })
    fireEvent.click(screen.getByRole('button', { name: 'Restore Spotlight shortcut' }))
    await waitFor(() => expect(window.api.hotkey.chat.spotlight.restore).toHaveBeenCalled())
    expect(await screen.findByText('Spotlight shortcut turned back on.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Restore Spotlight shortcut' })).not.toBeInTheDocument())
  })

  it('shows the restore row when Viezan had turned Spotlight off earlier', async () => {
    vi.mocked(window.api.capabilities.get).mockResolvedValue({ success: true, statuses: [
      { id: 'launcher.spotlight', supported: true, permission: 'granted', detail: { disabledByViezan: true, conflict: null } },
    ] })
    render(<><HotkeySection /><NotificationViewport /></>)
    expect(await screen.findByRole('button', { name: 'Restore Spotlight shortcut' })).toBeInTheDocument()
  })

  it('re-checks when the window regains focus', async () => {
    render(<><HotkeySection /><NotificationViewport /></>)
    await waitFor(() => expect(window.api.hotkey.chat.systemConflict).toHaveBeenCalledTimes(1))
    vi.mocked(window.api.hotkey.chat.systemConflict).mockResolvedValue({
      success: true, hotkey: 'Command+Space', enabled: true, conflict: { owner: 'finder-search', accelerator: 'Command+Space' },
    })
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(await screen.findByText('Finder search is using Command+Space')).toBeInTheDocument()
  })

  it('does not check on other platforms', async () => {
    window.api.platform = 'win32'
    vi.mocked(window.api.hotkey.chat.get).mockResolvedValue({ success: true, settings: { hotkey: 'Alt+Space', enabled: true } })
    render(<><HotkeySection /><NotificationViewport /></>)
    await screen.findByRole('button', { name: 'Alt+Space' })
    expect(window.api.hotkey.chat.systemConflict).not.toHaveBeenCalled()
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
    // Stored as Alt+Shift+C; shown with the Mac key name.
    const recorder = await screen.findByRole('button', { name: 'Option+Shift+C' })
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: ' ', metaKey: true })
    expect(await screen.findByText(/check the Spotlight shortcut/)).toBeInTheDocument()
    expect(screen.queryByText('raw backend error')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Option+Shift+C' })).toBeInTheDocument()
    expect(screen.getAllByRole('switch')[1]).toHaveAttribute('aria-checked', 'true')
  })
})

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateStatus } from '../../../../shared/updater'
import { useAppStore } from '../../../store/useAppStore'
import { UPDATE_SNOOZE_MS, useUpdaterStore } from '../../../store/useUpdaterStore'
import { NotificationViewport } from '../NotificationViewport'
import { UpdateNotification } from '../UpdateNotification'

let emit: (status: UpdateStatus) => void
beforeEach(() => {
  localStorage.clear()
  useAppStore.setState({ locale: 'en', localeAuto: false })
  useUpdaterStore.setState({ status: { type: 'idle' }, snoozes: {} })
  window.api.updater.onStatus = vi.fn((cb) => { emit = cb; return vi.fn() })
  window.api.updater.getStatus = vi.fn().mockResolvedValue(null)
  window.api.updater.download = vi.fn().mockResolvedValue({ success: true })
  window.api.updater.install = vi.fn().mockResolvedValue({ success: true })
  window.api.updater.openDownload = vi.fn().mockResolvedValue({ success: true })
})
afterEach(() => {
  cleanup(); vi.useRealTimers()
  delete window.api.updater.getNotificationPreferences
  delete window.api.updater.setNotificationPreferences
  delete window.api.updater.consumeOpenSettings
  delete window.api.updater.onOpenSettings
})
const available = (version = '3.0.0') => act(() => emit({ type: 'available', version, background: true }))

describe('update notification', () => {
  it('uses the native popup without an in-app duplicate and restores a pending Settings request', async () => {
    window.api.updater.getNotificationPreferences = vi.fn().mockResolvedValue({ enabled: true, locale: 'en', theme: 'system' })
    window.api.updater.setNotificationPreferences = vi.fn().mockResolvedValue({ enabled: true, locale: 'en', theme: 'system' })
    window.api.updater.consumeOpenSettings = vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false)
    await act(async () => { render(<UpdateNotification />) })
    available()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useAppStore.getState().settingsOpen).toBe(true)
    expect(useAppStore.getState().settingsInitialSection).toBe('updates')
    expect(window.api.updater.setNotificationPreferences).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en' }))
  })
  it('does not download or install until clicked, opens version-specific changes', async () => {
    render(<UpdateNotification />)
    available()
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(window.api.updater.download).not.toHaveBeenCalled()
    expect(window.api.updater.install).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByText('View changes')))
    expect(window.api.updater.openDownload).toHaveBeenCalledWith('https://github.com/trunghieupham59/Viezan/releases/tag/v3.0.0')
    await act(async () => fireEvent.click(screen.getByText('Download Update')))
    expect(window.api.updater.download).toHaveBeenCalledTimes(1)
    act(() => emit({ type: 'downloading', percent: 42 }))
    expect(screen.getByRole('status')).toHaveTextContent('42%')
    expect(screen.getByText('Download Update')).toBeDisabled()
    act(() => emit({ type: 'downloaded', version: '3.0.0' }))
    expect(window.api.updater.install).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByText('Install & Restart')))
    expect(window.api.updater.install).toHaveBeenCalledTimes(1)
  })

  it('persists a 24-hour snooze across remounts, suppresses duplicate events and allows newer versions', () => {
    vi.useFakeTimers()
    const view = render(<UpdateNotification />)
    available()
    fireEvent.click(screen.getByText('Remind me later'))
    expect(JSON.parse(localStorage.getItem('viezan:update-snoozes') ?? '{}')['3.0.0']).toBe(Date.now() + UPDATE_SNOOZE_MS)
    available()
    expect(screen.queryByRole('dialog')).toBeNull()
    view.unmount()
    render(<UpdateNotification />)
    available()
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => vi.advanceTimersByTime(UPDATE_SNOOZE_MS - 1))
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByRole('dialog')).toBeVisible()
    fireEvent.keyDown(window, { key: 'Escape' })
    available('3.1.0')
    expect(screen.getByRole('dialog')).toHaveTextContent('3.1.0')
  })

  it('waits for other overlays to close, keeps Settings state and suppresses background errors', () => {
    const view = render(<UpdateNotification blocked />)
    available()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useUpdaterStore.getState().status.type).toBe('available')
    act(() => emit({ type: 'error', error: 'offline', background: true }))
    expect(useUpdaterStore.getState().status.type).toBe('available')
    view.rerender(<UpdateNotification />)
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(screen.getByText('Remind me later')).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stays closed for updates found by a manual check and reopens only for a background detection', () => {
    render(<UpdateNotification />)
    act(() => emit({ type: 'checking' }))
    act(() => emit({ type: 'available', version: '3.0.0' }))
    act(() => emit({ type: 'downloaded', version: '3.0.0' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useUpdaterStore.getState().status.type).toBe('downloaded')
    available()
    expect(screen.getByRole('dialog')).toBeVisible()
    // A manual re-check from Settings takes the release over.
    act(() => emit({ type: 'checking' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => emit({ type: 'available', version: '3.0.0' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('restores the main-process snapshot without replacing a newer event', async () => {
    let resolve: (status: UpdateStatus) => void = () => undefined
    window.api.updater.getStatus = vi.fn(() => new Promise<UpdateStatus>((done) => { resolve = done }))
    render(<UpdateNotification />)
    available('3.2.0')
    await act(async () => resolve({ type: 'available', version: '3.0.0' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('3.2.0')
  })

  it('keeps a failed download retryable and catches IPC rejections', async () => {
    window.api.updater.download = vi.fn(async () => {
      emit({ type: 'downloading', percent: 0 })
      emit({ type: 'error', error: 'offline' })
      return { success: false }
    })
    render(<><UpdateNotification /><NotificationViewport /></>)
    available()
    await act(async () => fireEvent.click(screen.getByText('Download Update')))
    expect(screen.getByRole('alert')).toBeVisible()
    expect(screen.getByText('Download Update')).toBeEnabled()
    window.api.updater.openDownload = vi.fn().mockRejectedValue(new Error('IPC unavailable'))
    await act(async () => fireEvent.click(screen.getByText('View changes')))
    expect(screen.getByRole('alert')).toBeVisible()
  })

  it.each([
    ['vi', 'Để sau', 'Xem thay đổi'],
    ['ja', '後で通知', '変更内容を見る'],
  ] as const)('renders %s translations', (locale, later, notes) => {
    useAppStore.setState({ locale })
    render(<UpdateNotification />)
    available()
    expect(screen.getByText(later)).toBeVisible()
    expect(screen.getByText(notes)).toBeVisible()
  })
})

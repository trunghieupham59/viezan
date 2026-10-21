import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '../../../store/useAppStore'
import { useUpdaterStore } from '../../../store/useUpdaterStore'
import { UpdaterSection } from '../UpdaterSection'

beforeEach(() => {
  useAppStore.setState({ locale: 'en', localeAuto: false })
  useUpdaterStore.setState({ status: { type: 'idle' } })
  window.api.updater.getVersion = vi.fn().mockResolvedValue({ version: '2.2.2' })
  window.api.updater.onStatus = vi.fn(() => () => undefined)
  window.api.updater.getNotificationPreferences = vi.fn().mockResolvedValue({ enabled: true, locale: 'en', theme: 'system' })
  window.api.updater.setNotificationPreferences = vi.fn().mockResolvedValue({ enabled: false, locale: 'en', theme: 'system' })
})
afterEach(() => { cleanup(); delete window.api.updater.getNotificationPreferences; delete window.api.updater.setNotificationPreferences })

it('loads and saves the floating notification preference without disabling manual checks', async () => {
  await act(async () => { render(<UpdaterSection />) })
  const toggle = screen.getByRole('switch', { name: 'Floating update notifications' })
  expect(toggle).toHaveAttribute('aria-checked', 'true')
  await act(async () => fireEvent.click(toggle))
  expect(window.api.updater.setNotificationPreferences).toHaveBeenCalledWith({ enabled: false })
  expect(toggle).toHaveAttribute('aria-checked', 'false')
  expect(screen.getByRole('button', { name: 'Check for Updates' })).not.toBeDisabled()
})

it('retains the previous setting and reports a failed save', async () => {
  window.api.updater.setNotificationPreferences = vi.fn().mockResolvedValue(null)
  await act(async () => { render(<UpdaterSection />) })
  await act(async () => fireEvent.click(screen.getByRole('switch')))
  expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByRole('alert')).toBeVisible()
})

it('keeps the retry action and an error message after a failed download', async () => {
  useUpdaterStore.setState({ status: { type: 'available', version: '3.0.0', error: 'checksum mismatch' } })
  await act(async () => { render(<UpdaterSection />) })
  expect(screen.getByRole('alert')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Download Update' })).toBeEnabled()
})

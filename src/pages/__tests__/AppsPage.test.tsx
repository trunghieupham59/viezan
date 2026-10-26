import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../store/useAppStore'
import { createPreviewApps } from '../../web-preview/previewApps'
import { AppsPage } from '../AppsPage'

beforeEach(() => {
  useAppStore.setState({ locale: 'en' })
  window.api.apps = createPreviewApps()
})
async function openPlan() {
  render(<AppsPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Sample Notes' }))
  await screen.findByRole('checkbox', { name: /Caches/ })
}
describe('Applications', () => {
  it('preselects exact data but keeps shared and administrator items disabled', async () => {
    await openPlan()
    expect(screen.getByRole('checkbox', { name: /Caches/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Preferences/ })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Group Containers/ })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /Group Containers/ })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /LaunchDaemons/ })).toBeDisabled()
  })
  it('reset keeps the bundle and sends only selected opaque IDs to main', async () => {
    const apply = vi.spyOn(window.api.apps, 'apply')
    await openPlan()
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByRole('checkbox', { name: /Applications\/Sample Notes/ })).not.toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: /Caches/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Preferences/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Review confirmation' }))
    await waitFor(() => expect(apply).toHaveBeenCalledWith({ planId: 'preview-plan', itemIds: ['preferences'], action: 'reset', quit: true, locale: 'en' }))
    expect(await screen.findByRole('status')).toHaveTextContent('A clean uninstall cannot be confirmed')
  })
  it('shows partial outcomes and supports Undo from the journal', async () => {
    await openPlan()
    fireEvent.click(screen.getByRole('button', { name: 'Review confirmation' }))
    const history = screen.getByRole('region', { name: 'Journal and Undo' })
    await waitFor(() => expect(within(history).getByText(/Sample Notes · Uninstall app/)).toBeTruthy())
    fireEvent.click(within(history).getByText(/Sample Notes · Uninstall app/))
    expect(within(history).getByText('3 items remain within the scanned scope.')).toBeVisible()
    fireEvent.click(within(history).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(within(history).getByRole('button', { name: 'Undo' })).toBeDisabled())
  })
  it('shows scan errors and offers a retry without destructive controls', async () => {
    window.api.apps.inventory = vi.fn().mockResolvedValue({ success: false, error: 'unreadable' })
    render(<AppsPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not read completely')
    expect(screen.getByRole('button', { name: 'Scan again' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Review confirmation' })).toBeNull()
  })
  it('keeps removal disabled when a scan is incomplete', async () => {
    const inspect = window.api.apps.inspect
    window.api.apps.inspect = async id => {
      const result = await inspect(id)
      return result.success ? { success: true, data: { ...result.data, incomplete: true } } : result
    }
    await openPlan()
    expect(screen.getByRole('button', { name: 'Review confirmation' })).toBeDisabled()
  })

})

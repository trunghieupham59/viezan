import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationViewport } from '../../../components/organisms/NotificationViewport'
import { TRANSLATIONS } from '../../../i18n'
import { useAppStore } from '../../../store/useAppStore'
import { BrowserIntegrationSection } from '../BrowserIntegrationSection'

const t = TRANSLATIONS.en

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState({ locale: 'en' })
})

describe('extension token list notices', () => {
  it('reports a failed token list load in the notification stack', async () => {
    vi.mocked(window.api.localServer.listTokens).mockResolvedValue({ success: false, port: 0, tokens: [] })
    render(<><BrowserIntegrationSection /><NotificationViewport /></>)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(t.settings_token_error_load)
    expect(alert.closest('.notification-viewport')).toBeInTheDocument()
  })

  it('drops the token list error toast when the section unmounts', async () => {
    vi.mocked(window.api.localServer.listTokens).mockResolvedValue({ success: false, port: 0, tokens: [] })
    const view = render(<><BrowserIntegrationSection /><NotificationViewport /></>)
    expect(await screen.findByRole('alert')).toHaveTextContent(t.settings_token_error_load)

    view.unmount()
    render(<NotificationViewport />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('one-time token reveal', () => {
  const later = Date.now() + 30 * 24 * 60 * 60 * 1000
  const tokens = [
    { id: 'old-key', name: 'Old key', createdAt: 1, expiresAt: later },
    { id: 'new-key', name: 'New key', createdAt: 2, expiresAt: later },
  ]

  async function createNewKey() {
    vi.mocked(window.api.localServer.listTokens).mockResolvedValue({ success: true, port: 39875, tokens })
    vi.mocked(window.api.localServer.createToken).mockResolvedValue({
      success: true, id: 'new-key', token: 'vzn_fresh_secret', name: 'New key', createdAt: 2, expiresAt: later,
    })
    render(<BrowserIntegrationSection />)
    fireEvent.click(screen.getByRole('button', { name: t.settings_token_create }))
    fireEvent.click(screen.getByRole('button', { name: t.settings_token_generate }))
    expect(await screen.findByText('vzn_fresh_secret')).toBeInTheDocument()
  }

  function deleteButtonFor(name: string) {
    // name <p> → copy column → the token's row
    const row = screen.getByText(name).parentElement?.parentElement as HTMLElement
    return within(row).getByRole('button', { name: t.settings_token_delete_title })
  }

  it('keeps a fresh token visible when a different token is deleted', async () => {
    await createNewKey()
    fireEvent.click(deleteButtonFor('Old key'))
    await waitFor(() => expect(window.api.localServer.deleteToken).toHaveBeenCalledWith({ id: 'old-key' }))
    await waitFor(() => expect(screen.queryByText('Old key')).not.toBeInTheDocument())
    expect(screen.getByText('vzn_fresh_secret')).toBeInTheDocument()
  })

  it('closes the reveal when the revealed token itself is deleted', async () => {
    await createNewKey()
    fireEvent.click(deleteButtonFor('New key'))
    await waitFor(() => expect(screen.queryByText('vzn_fresh_secret')).not.toBeInTheDocument())
  })
})

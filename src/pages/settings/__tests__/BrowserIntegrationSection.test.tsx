import { render, screen } from '@testing-library/react'
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

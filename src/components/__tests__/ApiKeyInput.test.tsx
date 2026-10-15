import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PROVIDERS } from '../../constants/providers'
import { VERIFY_STATUS_RESET_DELAY_MS } from '../../constants/ui'
import { useAppStore } from '../../store/useAppStore'
import { ApiKeyInput } from '../ApiKeyInput'

function requireClaudeProvider() {
  const provider = PROVIDERS.find((candidate) => candidate.id === 'claude')
  if (!provider) throw new Error('Claude provider fixture is missing')
  return provider
}

const claude = requireClaudeProvider()

function renderClaudeInput(onSave = vi.fn(async () => {})) {
  render(
    <ApiKeyInput
      provider={claude}
      onSave={onSave}
      onDelete={vi.fn(async () => {})}
      hasKey={false}
      maskedKey={null}
      usageCurrency="USD"
      usageLabel="Cost"
      onResetUsage={vi.fn()}
    />,
  )
  return onSave
}

describe('ApiKeyInput verification outcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.setState({ locale: 'en' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ['BILLING', 'Key verified and saved, but provider billing requires attention.'],
    ['PERMISSION', 'Key verified and saved, but it does not have permission to list or use models.'],
    ['RATE_LIMIT', 'Rate limited, but key looks valid — saved to Keychain.'],
  ])('saves an authenticated key when verification returns %s', async (errorCode, message) => {
    vi.mocked(window.api.verifyKey).mockResolvedValue({ success: false, errorCode, valid: true })
    const onSave = renderClaudeInput()

    fireEvent.change(screen.getByPlaceholderText('Paste your Anthropic Claude API key…'), {
      target: { value: 'sk-ant-valid' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('sk-ant-valid'))
    expect(await screen.findByText(message)).toBeInTheDocument()
  })

  it('does not save a key when authentication fails', async () => {
    vi.mocked(window.api.verifyKey).mockResolvedValue({ success: false, errorCode: 'INVALID_KEY' })
    const onSave = renderClaudeInput()

    fireEvent.change(screen.getByPlaceholderText('Paste your Anthropic Claude API key…'), {
      target: { value: 'sk-ant-invalid' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await screen.findByText('Invalid API key — please check and try again.')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('clears a successful verification message when its reset delay expires', async () => {
    vi.useFakeTimers()
    vi.mocked(window.api.verifyKey).mockResolvedValue({ success: true })
    const onSave = renderClaudeInput()

    fireEvent.change(screen.getByPlaceholderText('Paste your Anthropic Claude API key…'), {
      target: { value: 'sk-ant-valid' },
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    })

    const successMessage = 'Key verified & saved to OS Keychain!'
    expect(onSave).toHaveBeenCalledWith('sk-ant-valid')
    expect(screen.getByText(successMessage)).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(VERIFY_STATUS_RESET_DELAY_MS - 1))
    expect(screen.getByText(successMessage)).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText(successMessage)).not.toBeInTheDocument()
  })
})

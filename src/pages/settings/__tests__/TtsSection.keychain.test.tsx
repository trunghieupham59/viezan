import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationViewport } from '../../../components/organisms/NotificationViewport'
import { useAppStore } from '../../../store/useAppStore'
import { TtsSection } from '../TtsSection'

type KeychainResult = { success?: boolean; exists?: boolean; masked?: string | null; error?: string }

describe('TtsSection ElevenLabs key', () => {
  const keychain = {
    get: vi.fn<(provider: string) => Promise<KeychainResult>>(),
    save: vi.fn<(provider: string, key: string) => Promise<KeychainResult>>(),
    delete: vi.fn<(provider: string) => Promise<KeychainResult>>(),
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    act(() => useAppStore.setState({ locale: 'en', localeAuto: false }))
    ;(window as unknown as { api: unknown }).api = { keychain }
  })

  const openStoredKey = async () => {
    keychain.get.mockResolvedValue({ exists: true, masked: 'el_****' })
    render(<><TtsSection /><NotificationViewport /></>)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
  }

  it('labels the submit action Save because the key is stored, not verified', async () => {
    keychain.get.mockResolvedValue({ exists: false, masked: null })
    render(<TtsSection />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add key' }))
    fireEvent.change(screen.getByPlaceholderText('Paste your ElevenLabs API key…'), { target: { value: 'el_test' } })

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Verify' })).not.toBeInTheDocument()
  })

  it('asks with the localized templated confirm and keeps the key when cancelled', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await openStoredKey()

    fireEvent.click(screen.getByTitle('Remove'))

    expect(confirm).toHaveBeenCalledWith('Remove the API key for ElevenLabs?')
    expect(keychain.delete).not.toHaveBeenCalled()
  })

  it('surfaces a failed keychain delete and keeps reporting the key as present', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    keychain.delete.mockResolvedValue({ success: false, error: 'denied' })
    await openStoredKey()

    fireEvent.click(screen.getByTitle('Remove'))

    expect(await screen.findByText('Could not update the OS Keychain. Please try again.')).toBeInTheDocument()
    await waitFor(() => expect(keychain.delete).toHaveBeenCalledWith('elevenlabs'))
    expect(screen.getByTitle('Remove')).toBeInTheDocument()
  })

  it('surfaces a thrown keychain delete instead of an unhandled rejection', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    keychain.delete.mockRejectedValue(new Error('ipc down'))
    await openStoredKey()

    fireEvent.click(screen.getByTitle('Remove'))

    expect(await screen.findByText('Could not update the OS Keychain. Please try again.')).toBeInTheDocument()
    expect(screen.getByTitle('Remove')).not.toBeDisabled()
  })
})

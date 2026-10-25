import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationViewport } from '../../../components/organisms/NotificationViewport'
import { useAppStore } from '../../../store/useAppStore'
import { SttSection } from '../SttSection'

type KeychainResult = { success?: boolean; exists?: boolean; masked?: string | null; error?: string }

describe('SttSection Groq keychain results', () => {
  const keychain = {
    get: vi.fn<(provider: string) => Promise<KeychainResult>>(),
    save: vi.fn<(provider: string, key: string) => Promise<KeychainResult>>(),
    delete: vi.fn<(provider: string) => Promise<KeychainResult>>(),
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    act(() => useAppStore.setState({ locale: 'en', localeAuto: false }))
    ;(window as unknown as { api: unknown }).api = { keychain }
  })

  it('shows the failure and keeps the key unsaved when keychain.save reports failure', async () => {
    keychain.get.mockResolvedValue({ exists: false, masked: null })
    keychain.save.mockResolvedValue({ success: false, error: 'keychain locked' })
    render(<><SttSection /><NotificationViewport /></>)

    fireEvent.click(screen.getByRole('button', { name: 'Add key' }))
    const input = screen.getByPlaceholderText('Paste your Groq API key…')
    fireEvent.change(input, { target: { value: 'gsk_test' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByText('keychain locked')).toBeInTheDocument()
    expect(screen.queryByText('Groq key saved!')).not.toBeInTheDocument()
    // Only the mount-time lookup: no re-read after a failed save.
    expect(keychain.get).toHaveBeenCalledTimes(1)
  })

  it('reports success only when keychain.save succeeds', async () => {
    keychain.get
      .mockResolvedValueOnce({ exists: false, masked: null })
      .mockResolvedValueOnce({ exists: true, masked: 'gsk_****' })
    keychain.save.mockResolvedValue({ success: true })
    render(<><SttSection /><NotificationViewport /></>)

    fireEvent.click(screen.getByRole('button', { name: 'Add key' }))
    const input = screen.getByPlaceholderText('Paste your Groq API key…')
    fireEvent.change(input, { target: { value: 'gsk_test' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByText('Groq key saved!')).toBeInTheDocument()
  })

  it('surfaces a failed delete instead of silently removing the key', async () => {
    keychain.get.mockResolvedValue({ exists: true, masked: 'gsk_****' })
    keychain.delete.mockResolvedValue({ success: false, error: 'denied' })
    render(<><SttSection /><NotificationViewport /></>)

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const removeButton = screen.getByTitle('Remove')
    fireEvent.click(removeButton)

    expect(await screen.findByText('Could not update the OS Keychain. Please try again.')).toBeInTheDocument()
    await waitFor(() => expect(keychain.delete).toHaveBeenCalledWith('groq'))
    // Key is still reported as present.
    expect(screen.getByTitle('Remove')).toBeInTheDocument()
  })

  it('confirms before deleting the Groq key with the localized templated message', async () => {
    vi.mocked(window.confirm).mockReturnValue(false)
    act(() => useAppStore.setState({ locale: 'vi' }))
    keychain.get.mockResolvedValue({ exists: true, masked: 'gsk_****' })
    render(<SttSection />)

    fireEvent.click(await screen.findByRole('button', { name: 'Sửa' }))
    fireEvent.click(screen.getByTitle('Xoá'))

    expect(window.confirm).toHaveBeenCalledWith('Xoá khoá API của Groq?')
    expect(keychain.delete).not.toHaveBeenCalled()
  })

  it('labels the submit action Save because the Groq key is stored, not verified', async () => {
    keychain.get.mockResolvedValue({ exists: false, masked: null })
    render(<SttSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Add key' }))
    fireEvent.change(screen.getByPlaceholderText('Paste your Groq API key…'), { target: { value: 'gsk_test' } })

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })
})

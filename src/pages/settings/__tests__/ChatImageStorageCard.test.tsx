import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationViewport } from '../../../components/organisms/NotificationViewport'
import { useAppStore } from '../../../store/useAppStore'
import * as imageStore from '../../../utils/chatImageStore'
import { ChatImageStorageCard } from '../ChatImageStorageCard'

vi.mock('../../../utils/chatImageStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/chatImageStore')>()),
  getChatImageStoreStats: vi.fn(),
  pruneUnusedChatImages: vi.fn(),
  clearAllChatImages: vi.fn(),
}))

describe('ChatImageStorageCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    act(() => {
      useAppStore.setState({
        locale: 'en',
        localeAuto: false,
        chatSessions: [{
          id: 'chat-live',
          title: 'Live',
          createdAt: 1,
          updatedAt: 1,
          provider: 'openai',
          model: 'gpt-4o',
          messages: [{
            id: 'm1',
            role: 'assistant',
            timestamp: 1,
            content: [{ type: 'image', imageStoreKey: 'chat-live:m1:0' }],
          }],
        }],
      })
    })
    vi.mocked(imageStore.getChatImageStoreStats).mockResolvedValue({ count: 3, bytes: 3 * 1024 * 1024 })
    vi.mocked(imageStore.pruneUnusedChatImages).mockResolvedValue(2)
    vi.mocked(imageStore.clearAllChatImages).mockResolvedValue()
  })

  it('shows how many images are stored and how much space they use', async () => {
    render(<><ChatImageStorageCard /><NotificationViewport /></>)

    expect(await screen.findByText('3 images · 3.0 MB')).toBeInTheDocument()
    expect(screen.getByText(/Nothing is removed automatically/)).toBeInTheDocument()
  })

  it('removes only images no conversation references', async () => {
    render(<><ChatImageStorageCard /><NotificationViewport /></>)
    await screen.findByText('3 images · 3.0 MB')

    fireEvent.click(screen.getByRole('button', { name: 'Remove unused images' }))

    await waitFor(() => expect(imageStore.pruneUnusedChatImages).toHaveBeenCalledTimes(1))
    const referenced = vi.mocked(imageStore.pruneUnusedChatImages).mock.calls[0][0]
    expect([...referenced]).toEqual(['chat-live:m1:0'])
    expect(await screen.findByRole('status')).toHaveTextContent('Removed 2 images')
  })

  it('deletes everything only after the user confirms', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    render(<><ChatImageStorageCard /><NotificationViewport /></>)
    await screen.findByText('3 images · 3.0 MB')

    confirm.mockReturnValueOnce(false)
    fireEvent.click(screen.getByRole('button', { name: 'Delete all images' }))
    expect(imageStore.clearAllChatImages).not.toHaveBeenCalled()

    confirm.mockReturnValueOnce(true)
    fireEvent.click(screen.getByRole('button', { name: 'Delete all images' }))
    await waitFor(() => expect(imageStore.clearAllChatImages).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('status')).toHaveTextContent('Removed 3 images')
  })

  it('disables both actions when nothing is stored', async () => {
    vi.mocked(imageStore.getChatImageStoreStats).mockResolvedValue({ count: 0, bytes: 0 })
    render(<><ChatImageStorageCard /><NotificationViewport /></>)

    expect(await screen.findByText('No stored images')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove unused images' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete all images' })).toBeDisabled()
  })

  it('re-enables the actions and reports the failure when cleanup throws', async () => {
    vi.mocked(imageStore.pruneUnusedChatImages).mockRejectedValue(new Error('idb closed'))
    render(<><ChatImageStorageCard /><NotificationViewport /></>)
    await screen.findByText('3 images · 3.0 MB')

    const prune = screen.getByRole('button', { name: 'Remove unused images' })
    fireEvent.click(prune)

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t clean up images. Please try again.')
    await waitFor(() => expect(prune).not.toBeDisabled())
    expect(screen.getByRole('button', { name: 'Delete all images' })).not.toBeDisabled()
  })

  it('re-enables the actions when clearing everything throws', async () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true)
    vi.mocked(imageStore.clearAllChatImages).mockRejectedValue(new Error('quota'))
    render(<><ChatImageStorageCard /><NotificationViewport /></>)
    await screen.findByText('3 images · 3.0 MB')

    const clear = screen.getByRole('button', { name: 'Delete all images' })
    fireEvent.click(clear)

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t clean up images.')
    await waitFor(() => expect(clear).not.toBeDisabled())
  })
})

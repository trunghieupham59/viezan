import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../../store/useAppStore'
import type { ChatMessage } from '../../../types'
import { MessageBubble } from '../MessageBubble'

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    role: 'assistant',
    content: [{ type: 'text', text: 'Hello there' }],
    timestamp: 1_700_000_000_000,
    ...overrides,
  }
}

describe('MessageBubble used-model note', () => {
  beforeEach(() => {
    act(() => {
      useAppStore.setState({ locale: 'en' })
    })
  })

  it('shows which model answered when the provider fell back to another one', () => {
    render(<MessageBubble message={assistantMessage({ usedModel: 'gpt-5' })} onCopy={vi.fn()} />)
    expect(screen.getByTestId('chat-used-model')).toHaveTextContent('Answered by gpt-5 (selected model was unavailable)')
  })

  it('shows nothing when the selected model answered', () => {
    render(<MessageBubble message={assistantMessage()} onCopy={vi.fn()} />)
    expect(screen.queryByTestId('chat-used-model')).not.toBeInTheDocument()
  })

  it('is hidden while the reply is still streaming and for user messages', () => {
    const { rerender } = render(
      <MessageBubble message={assistantMessage({ usedModel: 'gpt-5', isLoading: true })} onCopy={vi.fn()} />,
    )
    expect(screen.queryByTestId('chat-used-model')).not.toBeInTheDocument()

    rerender(<MessageBubble message={assistantMessage({ role: 'user', usedModel: 'gpt-5' })} onCopy={vi.fn()} />)
    expect(screen.queryByTestId('chat-used-model')).not.toBeInTheDocument()
  })

  it('re-renders when only usedModel changes (memo comparison)', () => {
    const { rerender } = render(<MessageBubble message={assistantMessage()} onCopy={vi.fn()} />)
    expect(screen.queryByTestId('chat-used-model')).not.toBeInTheDocument()
    rerender(<MessageBubble message={assistantMessage({ usedModel: 'gpt-5' })} onCopy={vi.fn()} />)
    expect(screen.getByTestId('chat-used-model')).toBeInTheDocument()
  })
})

describe('MessageBubble errors and generated images', () => {
  beforeEach(() => {
    act(() => useAppStore.setState({ locale: 'en', activePage: 'chat' }))
  })

  it('keeps a provider error in the conversation with ways to recover', () => {
    const onRegenerate = vi.fn()
    render(<MessageBubble message={assistantMessage({ content: [], error: 'Rate limited' })} onCopy={vi.fn()} onRegenerate={onRegenerate} isLastAssistant />)
    expect(screen.getByRole('alert')).toHaveTextContent('Rate limited')
    screen.getByRole('button', { name: 'Try again' }).click()
    expect(onRegenerate).toHaveBeenCalledOnce()
    act(() => screen.getByRole('button', { name: 'Change model or key' }).click())
    expect(useAppStore.getState()).toMatchObject({ activePage: 'settings', settingsInitialSection: 'api' })
  })

  it('offers to keep editing the latest generated image', () => {
    const onEditImage = vi.fn()
    const image = { type: 'image' as const, imageBase64: 'AAAA', imageMimeType: 'image/png', imagePreviewUrl: 'data:image/png;base64,AAAA' }
    render(<MessageBubble message={assistantMessage({ content: [image] })} onCopy={vi.fn()} onDownloadImage={vi.fn()} onEditImage={onEditImage} isLastAssistant />)
    screen.getByRole('button', { name: 'Edit this image' }).click()
    expect(onEditImage).toHaveBeenCalledOnce()
  })
})

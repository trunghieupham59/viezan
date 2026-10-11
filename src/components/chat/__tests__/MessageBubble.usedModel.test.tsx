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

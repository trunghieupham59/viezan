import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TRANSLATIONS } from '../../../i18n'
import { useAppStore } from '../../../store/useAppStore'
import type { ChatMessage } from '../../../types'
import { MessageBubble } from '../MessageBubble'

function pendingAssistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm-pending',
    role: 'assistant',
    content: [],
    timestamp: 1_700_000_000_000,
    isLoading: true,
    ...overrides,
  }
}

describe('MessageBubble thinking state', () => {
  beforeEach(() => {
    act(() => {
      useAppStore.setState({ locale: 'en' })
    })
  })

  it('shows one polite status pill without the actions row before the first token', () => {
    const { container } = render(
      <MessageBubble message={pendingAssistantMessage()} isLastAssistant onCopy={vi.fn()} />,
    )

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent(TRANSLATIONS.en.chat_thinking_label.replace(/[….\s]+$/u, ''))
    expect(container.querySelector('.chat-message-status')).toContainElement(status)
    expect(container.querySelector('.chat-message-actions')).not.toBeInTheDocument()
  })

  it('keeps the Smart Thinking pill labelled and shimmering', () => {
    render(
      <MessageBubble
        message={pendingAssistantMessage({ isSmartThinkingStep: true, researchStepLabel: 'Searching the web' })}
        isLastAssistant
        onCopy={vi.fn()}
      />,
    )

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('title', 'Searching the web')
    expect(status).toHaveClass('thinking-state-pill-shimmer')
  })

  it('restores the actions row once content arrives', () => {
    const { container } = render(
      <MessageBubble
        message={pendingAssistantMessage({ content: [{ type: 'text', text: 'Hi' }] })}
        isLastAssistant
        onCopy={vi.fn()}
      />,
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(container.querySelector('.chat-message-actions')).toBeInTheDocument()
  })
})

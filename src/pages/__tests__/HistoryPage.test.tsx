import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../../store/useAppStore'
import { HistoryPage } from '../HistoryPage'

describe('HistoryPage reliability', () => {
  beforeEach(() => {
    act(() => useAppStore.setState({
      locale: 'en',
      localeAuto: false,
      history: [],
      liveSessions: [],
      chatSessions: [{
        id: 'chat-1',
        title: 'Roadmap review',
        provider: 'openai',
        model: 'gpt-5-mini',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
      }],
    }))
  })

  it('distinguishes an empty search result from an empty history', () => {
    render(<HistoryPage />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Search history...' }), {
      target: { value: 'missing phrase' },
    })

    expect(screen.getByText('No matching results')).toBeInTheDocument()
    expect(screen.queryByText('No chat sessions yet')).not.toBeInTheDocument()
  })
})

import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../../store/useAppStore'
import type { HistoryItem } from '../../types'
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

  it('shows every model of a comparison entry and reopens it with all of them', () => {
    const entry: HistoryItem = {
        id: 'hist-compare-1',
        timestamp: 1,
        provider: 'openai',
        model: 'gpt-4o',
        sourceLang: 'en',
        targetLang: 'vi',
        sourceText: 'Translate this',
        translatedText: 'Bản dịch OpenAI',
        selectedKey: 'openai:gpt-4o',
        results: [
          { provider: 'gemini', model: 'gemini-2.0-flash', translatedText: 'Bản dịch Gemini', durationMs: 120 },
          { provider: 'openai', model: 'gpt-4o', translatedText: 'Bản dịch OpenAI', durationMs: 90 },
        ],
      }
    act(() => useAppStore.setState({
      history: [entry],
      activePage: 'history',
      translatedText: 'stale text',
      translationModels: [{ provider: 'claude', model: 'claude-sonnet-4-5' }],
      pendingTranslateRestoreId: null,
    }))

    render(<HistoryPage />)
    fireEvent.click(screen.getByText('AI Translate'))
    expect(screen.getByText('2 models')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText('Bản dịch Gemini')).toBeInTheDocument()
    expect(screen.getByText(/GPT 4o · OpenAI .* Picked/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Use this' }))
    const state = useAppStore.getState()
    expect(state.activePage).toBe('translate')
    expect(state.translationModels).toEqual([
      { provider: 'gemini', model: 'gemini-2.0-flash' },
      { provider: 'openai', model: 'gpt-4o' },
    ])
    expect(state.sourceText).toBe('Translate this')
    expect(state.translatedText).toBe('')
    expect(state.pendingTranslateRestoreId).toBe('hist-compare-1')
  })
})

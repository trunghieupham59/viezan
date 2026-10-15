import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ChatSession } from '../../types'
import { useAppStore } from '../useAppStore'

const sessions: ChatSession[] = [
  {
    id: 'chat-openai',
    title: 'OpenAI conversation',
    provider: 'openai',
    model: 'gpt-conversation',
    messages: [],
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'chat-claude',
    title: 'Claude conversation',
    provider: 'claude',
    model: 'claude-conversation',
    messages: [],
    createdAt: 2,
    updatedAt: 2,
  },
]

beforeEach(() => {
  act(() => {
    useAppStore.setState({
      chatSessions: sessions,
      activeChatSessionId: null,
      selectedProvider: 'gemini',
      selectedModels: {
        gemini: 'gemini-global',
        claude: 'claude-global',
        openai: 'gpt-global',
        local: 'local-auto',
      },
    })
  })
})

describe('chat AI configuration ownership', () => {
  it('restores the provider and model owned by the selected conversation', () => {
    act(() => useAppStore.getState().setActiveChatSession('chat-openai'))

    const state = useAppStore.getState()
    expect(state.selectedProvider).toBe('openai')
    expect(state.selectedModels.openai).toBe('gpt-conversation')
    expect(state.chatSessions).toEqual(sessions)
  })

  it('updates only the targeted conversation model', () => {
    act(() => {
      useAppStore.getState().setChatSessionModel(
        'chat-openai',
        'openai',
        'gpt-conversation-next',
      )
    })

    expect(useAppStore.getState().chatSessions).toEqual([
      expect.objectContaining({
        id: 'chat-openai',
        provider: 'openai',
        model: 'gpt-conversation-next',
      }),
      expect.objectContaining({
        id: 'chat-claude',
        provider: 'claude',
        model: 'claude-conversation',
      }),
    ])
  })
})

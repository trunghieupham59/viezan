import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../../store/useAppStore'
import { useTranslate } from '../useTranslate'

beforeEach(() => {
  act(() => {
    useAppStore.setState({
      sourceText: '',
      translatedText: '',
      phoneticText: '',
      selectedProvider: 'openai',
      selectedModels: {
        gemini: 'gemini-global',
        claude: 'claude-global',
        openai: 'gpt-global',
        local: 'local-auto',
      },
      translationModels: [{ provider: 'claude', model: 'claude-translate' }],
      autoTranslate: false,
    })
  })
})

describe('AI Translate model ownership', () => {
  it('uses translationModels as canonical in single-model mode', async () => {
    const { result } = renderHook(() => useTranslate())

    expect(result.current.translationModels).toEqual([
      { provider: 'claude', model: 'claude-translate' },
    ])
    expect(result.current.selectedProvider).toBe('claude')

    await waitFor(() => {
      const state = useAppStore.getState()
      expect(state.selectedProvider).toBe('claude')
      expect(state.selectedModels.claude).toBe('claude-translate')
    })
  })
})

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('AI Translate comparison mode', () => {
  const MODEL_A = { provider: 'local', model: 'local-a' } as const
  const MODEL_B = { provider: 'local', model: 'local-b' } as const

  beforeEach(() => {
    const api = window.api as unknown as Record<string, unknown>
    api.detectLanguage = vi.fn().mockResolvedValue({ success: false })
    vi.mocked(window.api.translate).mockReset()
    vi.mocked(window.api.translate).mockResolvedValue({ success: true, translatedText: 'ok' })
  })

  it('suspends automatic translation while comparing without overwriting the stored preference', () => {
    act(() => {
      useAppStore.setState({ autoTranslate: true, translationModels: [MODEL_A, MODEL_B] })
    })
    const { result } = renderHook(() => useTranslate())

    expect(result.current.isComparisonMode).toBe(true)
    expect(result.current.autoTranslate).toBe(false)
    expect(useAppStore.getState().autoTranslate).toBe(true)

    act(() => {
      result.current.setTranslationModels([MODEL_A])
    })

    expect(result.current.isComparisonMode).toBe(false)
    expect(result.current.autoTranslate).toBe(true)
  })

  it('retries one model only while every result still matches the source', async () => {
    act(() => {
      useAppStore.setState({ sourceText: 'hello', translationModels: [MODEL_A, MODEL_B] })
    })
    const { result } = renderHook(() => useTranslate())

    await act(async () => {
      await result.current.handleTranslate()
    })
    expect(window.api.translate).toHaveBeenCalledTimes(2)
    expect(result.current.isResultStale).toBe(false)

    await act(async () => {
      await result.current.handleRetryComparison(MODEL_A)
    })
    expect(window.api.translate).toHaveBeenCalledTimes(3)
    expect(vi.mocked(window.api.translate).mock.calls[2][0]).toMatchObject({ model: 'local-a' })
  })

  it('reruns every model when a single retry is requested on a stale comparison', async () => {
    act(() => {
      useAppStore.setState({ sourceText: 'hello', translationModels: [MODEL_A, MODEL_B] })
    })
    const { result } = renderHook(() => useTranslate())

    await act(async () => {
      await result.current.handleTranslate()
    })
    act(() => {
      result.current.handleSourceChange('hello world')
    })
    expect(result.current.isResultStale).toBe(true)

    await act(async () => {
      await result.current.handleRetryComparison(MODEL_A)
    })

    const models = vi.mocked(window.api.translate).mock.calls.slice(2).map(([params]) => params.model)
    expect(models.sort()).toEqual(['local-a', 'local-b'])
    expect(result.current.isResultStale).toBe(false)
    expect(result.current.comparisonResults.every((item) => item.status === 'success')).toBe(true)
  })
})

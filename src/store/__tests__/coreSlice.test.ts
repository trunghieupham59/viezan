/**
 * Unit tests for src/store/slices/coreSlice.ts
 *
 * Tests cover all CoreSlice actions via the real Zustand store:
 *   - Text state (sourceText, translatedText, phoneticText)
 *   - Language management (sourceLang, targetLang, swapLanguages)
 *   - Provider / model selection
 *   - Page navigation
 *   - clearTranslation
 *   - Error state
 */

import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../useAppStore'

// Reset core state before each test to prevent cross-test leakage
beforeEach(() => {
  act(() => {
    useAppStore.setState({
      sourceText: '',
      translatedText: '',
      phoneticText: '',
      sourceLang: 'auto',
      targetLang: 'vi',
      isTranslating: false,
      translateError: null,
      translationModels: [{ provider: 'local', model: 'local-auto' }],
      activePage: 'translate',
    })
  })
})

// ── Text state ─────────────────────────────────────────────────────────────────

describe('setSourceText', () => {
  it('sets sourceText', () => {
    act(() => useAppStore.getState().setSourceText('Hello world'))
    expect(useAppStore.getState().sourceText).toBe('Hello world')
  })

  it('clears translateError when setting source text', () => {
    act(() => {
      useAppStore.setState({ translateError: 'Some error' })
      useAppStore.getState().setSourceText('New text')
    })
    expect(useAppStore.getState().translateError).toBeNull()
  })
})

describe('setTranslatedText', () => {
  it('sets translatedText', () => {
    act(() => useAppStore.getState().setTranslatedText('Xin chào thế giới'))
    expect(useAppStore.getState().translatedText).toBe('Xin chào thế giới')
  })
})

describe('setPhoneticText', () => {
  it('sets phoneticText', () => {
    act(() => useAppStore.getState().setPhoneticText('{東京|とうきょう}'))
    expect(useAppStore.getState().phoneticText).toBe('{東京|とうきょう}')
  })
})

// ── Language management ────────────────────────────────────────────────────────

describe('setSourceLang / setTargetLang', () => {
  it('sets sourceLang', () => {
    act(() => useAppStore.getState().setSourceLang('en'))
    expect(useAppStore.getState().sourceLang).toBe('en')
  })

  it('sets targetLang', () => {
    act(() => useAppStore.getState().setTargetLang('ja'))
    expect(useAppStore.getState().targetLang).toBe('ja')
  })
})

describe('swapLanguages', () => {
  it('swaps sourceLang and targetLang', () => {
    act(() => {
      useAppStore.setState({ sourceLang: 'en', targetLang: 'vi' })
      useAppStore.getState().swapLanguages()
    })
    const state = useAppStore.getState()
    expect(state.sourceLang).toBe('vi')
    expect(state.targetLang).toBe('en')
  })

  it('preserves sourceText and translatedText', () => {
    act(() => {
      useAppStore.setState({ sourceLang: 'en', targetLang: 'vi', sourceText: 'Hello', translatedText: 'Xin chào' })
      useAppStore.getState().swapLanguages()
    })
    const state = useAppStore.getState()
    expect(state.sourceText).toBe('Hello')
    expect(state.translatedText).toBe('Xin chào')
  })

  it('preserves the old result until it is replaced', () => {
    act(() => {
      useAppStore.setState({ sourceLang: 'en', targetLang: 'vi', phoneticText: 'some phonetic' })
      useAppStore.getState().swapLanguages()
    })
    expect(useAppStore.getState().phoneticText).toBe('some phonetic')
  })

  it('does not guess a language when Auto has not resolved', () => {
    act(() => {
      useAppStore.setState({ sourceLang: 'auto', targetLang: 'vi' })
      useAppStore.getState().swapLanguages()
    })
    const state = useAppStore.getState()
    expect(state.sourceLang).toBe('auto')
    expect(state.targetLang).toBe('vi')
  })

  it('uses detectedLang over sourceLang when provided', () => {
    act(() => {
      useAppStore.setState({ sourceLang: 'auto', targetLang: 'vi' })
      useAppStore.getState().swapLanguages('en')
    })
    const state = useAppStore.getState()
    expect(state.sourceLang).toBe('vi')
    expect(state.targetLang).toBe('en') // detectedLang wins over 'auto' fallback
  })
})

// ── Provider / model selection ─────────────────────────────────────────────────

describe('setSelectedProvider', () => {
  it('sets selectedProvider', () => {
    act(() => useAppStore.getState().setSelectedProvider('claude'))
    expect(useAppStore.getState().selectedProvider).toBe('claude')
  })

  it('clears translateError when provider changes', () => {
    act(() => {
      useAppStore.setState({ translateError: 'Old error' })
      useAppStore.getState().setSelectedProvider('openai')
    })
    expect(useAppStore.getState().translateError).toBeNull()
  })
})

describe('setSelectedModel', () => {
  it('sets a model for the given provider', () => {
    act(() => useAppStore.getState().setSelectedModel('gemini', 'gemini-2.0-flash'))
    expect(useAppStore.getState().selectedModels.gemini).toBe('gemini-2.0-flash')
  })

  it('updating one provider model does not affect others', () => {
    act(() => {
      useAppStore.getState().setSelectedModel('openai', 'gpt-4o')
      useAppStore.getState().setSelectedModel('claude', 'claude-3-5-sonnet')
    })
    expect(useAppStore.getState().selectedModels.openai).toBe('gpt-4o')
    expect(useAppStore.getState().selectedModels.claude).toBe('claude-3-5-sonnet')
    // gemini model should still have its default value
    expect(useAppStore.getState().selectedModels.gemini).toBeTruthy()
  })
})

describe('setTranslationModels', () => {
  it('deduplicates, limits, and synchronizes the first provider model', () => {
    act(() => useAppStore.getState().setTranslationModels([
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'claude', model: 'claude-sonnet-4' },
      { provider: 'gemini', model: 'gemini-2.5-flash' },
      { provider: 'local', model: 'local-auto' },
    ]))

    const state = useAppStore.getState()
    expect(state.translationModels).toEqual([
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'claude', model: 'claude-sonnet-4' },
      { provider: 'gemini', model: 'gemini-2.5-flash' },
    ])
    expect(state.selectedProvider).toBe('openai')
    expect(state.selectedModels.openai).toBe('gpt-4o')
  })

  it('keeps one valid model when passed an empty selection', () => {
    act(() => {
      useAppStore.setState({
        selectedProvider: 'gemini',
        selectedModels: {
          ...useAppStore.getState().selectedModels,
          gemini: 'gemini-2.5-flash',
        },
      })
      useAppStore.getState().setTranslationModels([])
    })

    expect(useAppStore.getState().translationModels).toEqual([
      { provider: 'gemini', model: 'gemini-2.5-flash' },
    ])
  })
})

// ── Page navigation ────────────────────────────────────────────────────────────

describe('setActivePage', () => {
  it('navigates to chat page', () => {
    act(() => useAppStore.getState().setActivePage('chat'))
    expect(useAppStore.getState().activePage).toBe('chat')
  })

  it('navigates to all valid pages', () => {
    const pages = ['translate', 'chat', 'live', 'dictionary'] as const
    for (const page of pages) {
      act(() => useAppStore.getState().setActivePage(page))
      expect(useAppStore.getState().activePage).toBe(page)
    }
  })

  it('opens and closes settings modal', () => {
    act(() => useAppStore.getState().openSettings())
    expect(useAppStore.getState().settingsOpen).toBe(true)
    act(() => useAppStore.getState().closeSettings())
    expect(useAppStore.getState().settingsOpen).toBe(false)
  })
})

// ── Error state ────────────────────────────────────────────────────────────────

describe('setTranslateError', () => {
  it('sets a translate error message', () => {
    act(() => useAppStore.getState().setTranslateError('Network error'))
    expect(useAppStore.getState().translateError).toBe('Network error')
  })

  it('clears error by setting null', () => {
    act(() => {
      useAppStore.getState().setTranslateError('Network error')
      useAppStore.getState().setTranslateError(null)
    })
    expect(useAppStore.getState().translateError).toBeNull()
  })
})

describe('setIsTranslating', () => {
  it('sets isTranslating to true', () => {
    act(() => useAppStore.getState().setIsTranslating(true))
    expect(useAppStore.getState().isTranslating).toBe(true)
  })

  it('sets isTranslating to false', () => {
    act(() => {
      useAppStore.getState().setIsTranslating(true)
      useAppStore.getState().setIsTranslating(false)
    })
    expect(useAppStore.getState().isTranslating).toBe(false)
  })
})

// ── clearTranslation ───────────────────────────────────────────────────────────

describe('clearTranslation', () => {
  it('clears sourceText, translatedText, phoneticText, and error in one action', () => {
    act(() => {
      useAppStore.setState({
        sourceText: 'Hello',
        translatedText: 'Xin chào',
        phoneticText: 'phonetic',
        translateError: 'Some error',
      })
      useAppStore.getState().clearTranslation()
    })
    const state = useAppStore.getState()
    expect(state.sourceText).toBe('')
    expect(state.translatedText).toBe('')
    expect(state.phoneticText).toBe('')
    expect(state.translateError).toBeNull()
  })

  it('is idempotent on already-empty state', () => {
    act(() => useAppStore.getState().clearTranslation())
    const state = useAppStore.getState()
    expect(state.sourceText).toBe('')
    expect(state.translatedText).toBe('')
    expect(state.phoneticText).toBe('')
  })
})

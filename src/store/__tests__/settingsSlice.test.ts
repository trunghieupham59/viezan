/**
 * Unit tests for src/store/slices/settingsSlice.ts
 *
 * Tests cover all settings actions independently via the real Zustand store.
 */

import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CHAT_NEW_SESSION_SHORTCUT, DEFAULT_CHAT_SEND_SHORTCUT } from '../../utils/keyboardShortcuts'
import { migratePersistedStore, STORE_PERSIST_VERSION, useAppStore } from '../useAppStore'

// Reset settings slice state before each test
// Explicitly reset all provider-keyed maps to avoid cross-test state leakage.
beforeEach(() => {
  act(() => {
    useAppStore.setState({
      locale: 'en',
      localeAuto: true,
      autoTranslate: false,
      autoTranslateDelay: 500,
      phoneticMode: 'off',
      translationStyle: 'general',
      translationReasoningEffort: 'auto',
      ttsMode: 'free',
      ttsVoice: 'nova',
      sttProvider: 'auto',
      fontSize: 'medium',
      themePreset: 'graphite',
      chatSendShortcut: DEFAULT_CHAT_SEND_SHORTCUT,
      chatNewSessionShortcut: DEFAULT_CHAT_NEW_SESSION_SHORTCUT,
      keyStatus: { gemini: false, claude: false, openai: false, local: false } as Record<string, boolean>,
      dynamicModels: { gemini: [], claude: [], openai: [], local: [] } as Record<string, []>,
      modelsLoading: { gemini: false, claude: false, openai: false, local: false } as Record<string, boolean>,
      modelsError: { gemini: null, claude: null, openai: null, local: null } as Record<string, null>,
    })
  })
})

describe('ttsMode defaults and persistence', () => {
  it('defaults TTS mode to free', () => {
    expect(useAppStore.getState().ttsMode).toBe('free')
  })

  it('sets TTS mode to premium', () => {
    act(() => useAppStore.getState().setTtsMode('premium'))
    expect(useAppStore.getState().ttsMode).toBe('premium')
  })

  it('includes TTS mode in persisted settings', () => {
    act(() => useAppStore.getState().setTtsMode('auto'))
    // Zustand persist exposes the configured partialize callback at runtime.
    // biome-ignore lint/suspicious/noExplicitAny: persist middleware test hook
    const partialize = (useAppStore as any).persist.getOptions().partialize
    const persisted = partialize(useAppStore.getState())
    expect(persisted.ttsMode).toBe('auto')
  })
})

describe('themePreset defaults and persistence', () => {
  it('defaults to the Graphite palette', () => {
    expect(useAppStore.getState().themePreset).toBe('graphite')
  })

  it('switches the palette without touching the light/dark mode', () => {
    act(() => useAppStore.getState().setTheme('dark'))
    act(() => useAppStore.getState().setThemePreset('studio'))
    expect(useAppStore.getState().themePreset).toBe('studio')
    expect(useAppStore.getState().theme).toBe('dark')
  })

  it('includes the palette in persisted settings', () => {
    act(() => useAppStore.getState().setThemePreset('paper'))
    // biome-ignore lint/suspicious/noExplicitAny: persist middleware test hook
    const partialize = (useAppStore as any).persist.getOptions().partialize
    expect(partialize(useAppStore.getState()).themePreset).toBe('paper')
  })

  it.each(['neon', 'cosmos', '', null, undefined, 42])('migrates unknown persisted palette %s back to Graphite', (themePreset) => {
    expect(migratePersistedStore({ themePreset, locale: 'ja' })).toMatchObject({ themePreset: 'graphite', locale: 'ja' })
  })

  it('keeps a known persisted palette', () => {
    expect(migratePersistedStore({ themePreset: 'corporate' })).toMatchObject({ themePreset: 'corporate' })
  })
})

describe('persisted STT provider migration', () => {
  it('registers the migration on the Zustand persistence boundary', async () => {
    const options = useAppStore.persist.getOptions()
    const migrate = options.migrate as (
      state: unknown,
      version: number,
    ) => unknown | Promise<unknown>

    expect(options.version).toBe(STORE_PERSIST_VERSION)
    const migrated = await Promise.resolve(migrate({ sttProvider: 'webSpeech', locale: 'vi' }, 0))
    expect(migrated).toMatchObject({
      sttProvider: 'auto',
      locale: 'vi',
      chatPendingTaskState: null,
    })
  })

  it.each(['webSpeech', 'unknown-provider', '', null, undefined])(
    'maps legacy or invalid value %s to auto without losing unrelated settings',
    (sttProvider) => {
      const persisted = {
        sttProvider,
        locale: 'ja',
        theme: 'dark',
        chatPendingDraft: 'keep this draft',
      }

      expect(migratePersistedStore(persisted)).toMatchObject({
        ...persisted,
        sttProvider: 'auto',
        chatPendingTaskState: null,
      })
    },
  )

  it.each(['auto', 'whisper', 'google', 'groq'])('preserves supported provider %s', (sttProvider) => {
    const persisted = { sttProvider, locale: 'vi' }

    expect(migratePersistedStore(persisted)).toMatchObject({ ...persisted, chatPendingTaskState: null })
  })
})

// ── Locale ────────────────────────────────────────────────────────────────────

describe('setLocale', () => {
  it('sets locale and disables localeAuto', () => {
    act(() => useAppStore.getState().setLocale('vi'))
    const state = useAppStore.getState()
    expect(state.locale).toBe('vi')
    expect(state.localeAuto).toBe(false)
  })

  it('switching locale to ja disables auto-follow', () => {
    act(() => useAppStore.getState().setLocale('ja'))
    expect(useAppStore.getState().locale).toBe('ja')
    expect(useAppStore.getState().localeAuto).toBe(false)
  })
})

describe('setLocaleFromSystem', () => {
  it('sets locale WITHOUT changing localeAuto', () => {
    act(() => {
      useAppStore.setState({ localeAuto: true })
      useAppStore.getState().setLocaleFromSystem('vi')
    })
    const state = useAppStore.getState()
    expect(state.locale).toBe('vi')
    expect(state.localeAuto).toBe(true) // unchanged
  })
})

describe('setLocaleAuto', () => {
  it('can disable localeAuto', () => {
    act(() => useAppStore.getState().setLocaleAuto(false))
    expect(useAppStore.getState().localeAuto).toBe(false)
  })

  it('can re-enable localeAuto', () => {
    act(() => {
      useAppStore.getState().setLocaleAuto(false)
      useAppStore.getState().setLocaleAuto(true)
    })
    expect(useAppStore.getState().localeAuto).toBe(true)
  })
})

// ── UI preferences ────────────────────────────────────────────────────────────

describe('setAutoTranslate', () => {
  it('enables auto-translate', () => {
    act(() => useAppStore.getState().setAutoTranslate(true))
    expect(useAppStore.getState().autoTranslate).toBe(true)
  })

  it('disables auto-translate', () => {
    act(() => {
      useAppStore.getState().setAutoTranslate(true)
      useAppStore.getState().setAutoTranslate(false)
    })
    expect(useAppStore.getState().autoTranslate).toBe(false)
  })
})

describe('setAutoTranslateDelay', () => {
  it('sets delay in milliseconds', () => {
    act(() => useAppStore.getState().setAutoTranslateDelay(1000))
    expect(useAppStore.getState().autoTranslateDelay).toBe(1000)
  })

  it('accepts zero delay', () => {
    act(() => useAppStore.getState().setAutoTranslateDelay(0))
    expect(useAppStore.getState().autoTranslateDelay).toBe(0)
  })
})

describe('setPhoneticMode', () => {
  it('enables standard phonetic mode', () => {
    act(() => useAppStore.getState().setPhoneticMode('standard'))
    expect(useAppStore.getState().phoneticMode).toBe('standard')
  })

  it('enables pure phonetic transcription mode', () => {
    act(() => useAppStore.getState().setPhoneticMode('phonetic'))
    expect(useAppStore.getState().phoneticMode).toBe('phonetic')
  })

  it('disables phonetic mode', () => {
    act(() => {
      useAppStore.getState().setPhoneticMode('standard')
      useAppStore.getState().setPhoneticMode('off')
    })
    expect(useAppStore.getState().phoneticMode).toBe('off')
  })
})

describe('setTranslationStyle', () => {
  it('sets style to casual', () => {
    act(() => useAppStore.getState().setTranslationStyle('casual'))
    expect(useAppStore.getState().translationStyle).toBe('casual')
  })

  it('sets style to technical', () => {
    act(() => useAppStore.getState().setTranslationStyle('technical'))
    expect(useAppStore.getState().translationStyle).toBe('technical')
  })

  it('sets style to formal', () => {
    act(() => useAppStore.getState().setTranslationStyle('formal'))
    expect(useAppStore.getState().translationStyle).toBe('formal')
  })
})

describe('setTranslationReasoningEffort', () => {
  it('updates and persists the translation reasoning preference', () => {
    act(() => useAppStore.getState().setTranslationReasoningEffort('medium'))
    expect(useAppStore.getState().translationReasoningEffort).toBe('medium')

    // Zustand persist exposes the configured partialize callback at runtime.
    // biome-ignore lint/suspicious/noExplicitAny: persist middleware test hook
    const partialize = (useAppStore as any).persist.getOptions().partialize
    expect(partialize(useAppStore.getState()).translationReasoningEffort).toBe('medium')
  })
})

describe('setImageProviderFallback', () => {
  it('defaults to off so images only go to the chosen provider', () => {
    act(() => useAppStore.setState({ imageProviderFallback: false }))
    expect(useAppStore.getState().imageProviderFallback).toBe(false)
  })

  it('updates and persists the opt-in', () => {
    act(() => useAppStore.getState().setImageProviderFallback(true))
    expect(useAppStore.getState().imageProviderFallback).toBe(true)

    // biome-ignore lint/suspicious/noExplicitAny: persist middleware test hook
    const partialize = (useAppStore as any).persist.getOptions().partialize
    expect(partialize(useAppStore.getState()).imageProviderFallback).toBe(true)
    act(() => useAppStore.getState().setImageProviderFallback(false))
  })
})

describe('setTtsVoice', () => {
  it('sets TTS voice to alloy', () => {
    act(() => useAppStore.getState().setTtsVoice('alloy'))
    expect(useAppStore.getState().ttsVoice).toBe('alloy')
  })

  it('sets TTS voice to shimmer', () => {
    act(() => useAppStore.getState().setTtsVoice('shimmer'))
    expect(useAppStore.getState().ttsVoice).toBe('shimmer')
  })
})

describe('setFontSize', () => {
  it('sets fontSize to small', () => {
    act(() => useAppStore.getState().setFontSize('small'))
    expect(useAppStore.getState().fontSize).toBe('small')
  })

  it('sets fontSize to large', () => {
    act(() => useAppStore.getState().setFontSize('large'))
    expect(useAppStore.getState().fontSize).toBe('large')
  })
})

describe('chat keyboard shortcuts', () => {
  it('defaults to Enter send and platform-aware new chat shortcut', () => {
    const state = useAppStore.getState()
    expect(state.chatSendShortcut).toBe(DEFAULT_CHAT_SEND_SHORTCUT)
    expect(state.chatNewSessionShortcut).toBe(DEFAULT_CHAT_NEW_SESSION_SHORTCUT)
  })

  it('updates AI Chat shortcut preferences', () => {
    act(() => {
      useAppStore.getState().setChatSendShortcut('modEnter')
      useAppStore.getState().setChatNewSessionShortcut('Alt+N')
    })

    const state = useAppStore.getState()
    expect(state.chatSendShortcut).toBe('modEnter')
    expect(state.chatNewSessionShortcut).toBe('Alt+N')
  })

  it('includes AI Chat shortcuts in persisted settings', () => {
    act(() => {
      useAppStore.getState().setChatSendShortcut('modEnter')
      useAppStore.getState().setChatNewSessionShortcut('Shift+N')
    })
    // biome-ignore lint/suspicious/noExplicitAny: persist middleware test hook
    const partialize = (useAppStore as any).persist.getOptions().partialize
    const persisted = partialize(useAppStore.getState())

    expect(persisted.chatSendShortcut).toBe('modEnter')
    expect(persisted.chatNewSessionShortcut).toBe('Shift+N')
  })
})

// ── Provider / key status ─────────────────────────────────────────────────────

describe('setKeyStatus', () => {
  it('marks gemini as having a key', () => {
    act(() => useAppStore.getState().setKeyStatus('gemini', true))
    expect(useAppStore.getState().keyStatus.gemini).toBe(true)
  })

  it('marks openai as NOT having a key', () => {
    act(() => {
      useAppStore.getState().setKeyStatus('openai', true)
      useAppStore.getState().setKeyStatus('openai', false)
    })
    expect(useAppStore.getState().keyStatus.openai).toBe(false)
  })

  it('updating one provider does not affect others', () => {
    act(() => {
      useAppStore.getState().setKeyStatus('gemini', true)
      useAppStore.getState().setKeyStatus('claude', true)
    })
    const { keyStatus } = useAppStore.getState()
    expect(keyStatus.gemini).toBe(true)
    expect(keyStatus.claude).toBe(true)
    expect(keyStatus.openai).toBe(false) // untouched
  })
})

describe('setDynamicModels', () => {
  it('sets dynamic models for a provider', () => {
    const models = [{ id: 'gpt-4o', name: 'GPT-4o', description: '' }]
    act(() => useAppStore.getState().setDynamicModels('openai', models))
    expect(useAppStore.getState().dynamicModels.openai).toEqual(models)
  })

  it('updating one provider does not affect others', () => {
    const geminiModels = [{ id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: '' }]
    act(() => useAppStore.getState().setDynamicModels('gemini', geminiModels))
    expect(useAppStore.getState().dynamicModels.openai).toEqual([]) // untouched
    expect(useAppStore.getState().dynamicModels.gemini).toEqual(geminiModels)
  })
})

describe('setModelsLoading', () => {
  it('sets loading state to true for a provider', () => {
    act(() => useAppStore.getState().setModelsLoading('gemini', true))
    expect(useAppStore.getState().modelsLoading.gemini).toBe(true)
  })

  it('resets loading state to false', () => {
    act(() => {
      useAppStore.getState().setModelsLoading('gemini', true)
      useAppStore.getState().setModelsLoading('gemini', false)
    })
    expect(useAppStore.getState().modelsLoading.gemini).toBe(false)
  })
})

describe('setModelsError', () => {
  it('sets an error message for a provider', () => {
    act(() => useAppStore.getState().setModelsError('openai', 'Network error'))
    expect(useAppStore.getState().modelsError.openai).toBe('Network error')
  })

  it('clears error by setting null', () => {
    act(() => {
      useAppStore.getState().setModelsError('openai', 'Network error')
      useAppStore.getState().setModelsError('openai', null)
    })
    expect(useAppStore.getState().modelsError.openai).toBeNull()
  })

  it('updating one provider error does not affect others', () => {
    act(() => useAppStore.getState().setModelsError('gemini', 'Rate limit'))
    expect(useAppStore.getState().modelsError.openai).toBeNull()
    expect(useAppStore.getState().modelsError.gemini).toBe('Rate limit')
  })
})

describe('translateComparisonView', () => {
  it('defaults to columns', () => {
    expect(useAppStore.getState().translateComparisonView).toBe('columns')
  })

  it('switches to sentence rows and persists the choice', () => {
    act(() => useAppStore.getState().setTranslateComparisonView('sentences'))
    expect(useAppStore.getState().translateComparisonView).toBe('sentences')
    const partialize = useAppStore.persist.getOptions().partialize
    expect(partialize?.(useAppStore.getState())).toMatchObject({ translateComparisonView: 'sentences' })
  })
})

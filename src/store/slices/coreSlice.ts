/**
 * coreSlice — Zustand store slice for core translation + navigation state.
 *
 * Extracted from useAppStore.ts inline definition to follow the same pattern
 * as chatSlice / historySlice / settingsSlice — each slice owns one domain,
 * keeping useAppStore.ts as a thin aggregator.
 *
 * Contains: sourceText, translatedText, lang pair, provider/model selection,
 * active page, and the convenience `t` computed translations getter.
 */
import { DEFAULT_SETTINGS, MAX_TRANSLATION_MODELS } from '../../constants/providers'
import { TRANSLATIONS, type Translations } from '../../i18n'
import { workbenchRecovery } from '../../services/workbenchRecovery'
import type { AIModelSelection, AppPage, Provider } from '../../types'
import type { SliceGet, SliceSet } from './sliceTypes'

/** Settings sections other surfaces can open directly. */
export type SettingsSectionTarget = 'updates' | 'api' | 'appearance' | 'modules'

export interface CoreSlice {
  // Translation state
  sourceText: string
  translatedText: string
  phoneticText: string
  sourceLang: string
  targetLang: string
  isTranslating: boolean
  translateError: string | null
  /** Structured error code from the IPC handler — preferred over substring matching on translateError. */
  translateErrorCode: string | null

  // Provider/Model selection
  selectedProvider: Provider
  selectedModels: Record<Provider, string>
  /** Canonical ordered AI Translate selection set, including single-model mode. */
  translationModels: AIModelSelection[]
  recentModels: Array<{ provider: Provider; modelId: string }>
  recordModelUsage: (provider: Provider, modelId: string) => void

  // Active page (Settings is a page too)
  activePage: AppPage

  /** Section Settings scrolls to when it opens; cleared once applied. */
  settingsInitialSection: SettingsSectionTarget | null

  // Language usage tracking (for smart top-3 pills in language bar)
  langUsage: Record<string, { count: number; lastUsed: number }>
  recordLangUsage: (lang: string) => void

  // Core actions
  setSourceText: (text: string) => void
  setTranslatedText: (text: string) => void
  setPhoneticText: (text: string) => void
  setSourceLang: (lang: string) => void
  setTargetLang: (lang: string) => void
  /** Swap source ↔ target languages, preserving input.
   * @param detectedLang — optional AI-detected source lang to use as the new target. */
  swapLanguages: (detectedLang?: string) => void
  setIsTranslating: (v: boolean) => void
  setTranslateError: (err: string | null, errorCode?: string | null) => void
  setSelectedProvider: (provider: Provider) => void
  setSelectedModel: (provider: Provider, model: string) => void
  setTranslationModels: (models: AIModelSelection[]) => void
  setActivePage: (page: AppPage) => void
  /** Goes to the Settings page. */
  openSettings: () => void
  /** Opens Settings scrolled to one section (background status rows, notices). */
  openSettingsAt: (section: SettingsSectionTarget) => void
  clearTranslation: () => void

  // Computed — reads locale from SettingsSlice via store.get()
  t: Translations
}

export const createCoreSlice = (set: SliceSet, get: SliceGet): CoreSlice => ({
  // ── Initial state ───────────────────────────────────────────────────────────
  sourceText: '',
  translatedText: '',
  phoneticText: '',
  sourceLang: DEFAULT_SETTINGS.defaultSourceLang,
  targetLang: DEFAULT_SETTINGS.defaultTargetLang,
  isTranslating: false,
  translateError: null,
  translateErrorCode: null,
  selectedProvider: DEFAULT_SETTINGS.defaultProvider,
  selectedModels: DEFAULT_SETTINGS.defaultModels,
  translationModels: [{
    provider: DEFAULT_SETTINGS.defaultProvider,
    model: DEFAULT_SETTINGS.defaultModels[DEFAULT_SETTINGS.defaultProvider],
  }],
  recentModels: [],
  activePage: 'home',
  settingsInitialSection: null,
  langUsage: {},

  // Computed getter — reads locale from SettingsSlice at access time.
  // NOTE: Zustand's shallow-merge on set() means this getter lives on the
  // initial object; for reactive locale changes prefer the standalone useT() hook.
  // SAFETY: during Zustand store initialization get() returns undefined — use
  // optional chaining so the getter doesn't throw before the store is ready.
  get t() {
    const state = get() as { locale?: string } | undefined
    const locale = state?.locale
    return (locale ? TRANSLATIONS[locale as keyof typeof TRANSLATIONS] : undefined) ?? TRANSLATIONS.en
  },

  // ── Actions ─────────────────────────────────────────────────────────────────
  setSourceText: (text) => set({ sourceText: text, translateError: null, translateErrorCode: null }),
  setTranslatedText: (text) => set({ translatedText: text }),
  setPhoneticText: (text) => set({ phoneticText: text }),
  setSourceLang: (lang) => get().setLanguagePair('translate', { source: lang, target: get().targetLang }),
  setTargetLang: (lang) => get().setLanguagePair('translate', { source: get().sourceLang, target: lang }),

  recordLangUsage: (lang) => {
    if (!lang || lang === 'auto') return
    set((state: CoreSlice) => ({
      langUsage: {
        ...state.langUsage,
        [lang]: {
          count: (state.langUsage[lang]?.count ?? 0) + 1,
          lastUsed: Date.now(),
        },
      },
    }))
  },

  swapLanguages: (detectedLang?: string) => {
    const state = get()
    const source = state.sourceLang === 'auto' ? detectedLang : state.sourceLang
    if (!source || source === 'auto' || source === state.targetLang) return
    state.setLanguagePair('translate', { source: state.targetLang, target: source })
  },

  setIsTranslating: (v) => set({ isTranslating: v }),
  setTranslateError: (err, errorCode) =>
    set({ translateError: err, translateErrorCode: err ? (errorCode ?? null) : null }),
  setSelectedProvider: (provider) =>
    set({ selectedProvider: provider, translateError: null, translateErrorCode: null }),
  setSelectedModel: (provider, model) =>
    set((state: CoreSlice) => ({ selectedModels: { ...state.selectedModels, [provider]: model } })),
  setTranslationModels: (models) =>
    set((state: CoreSlice) => {
      const seen = new Set<string>()
      const normalized = models.filter(({ provider, model }) => {
        const key = `${provider}:${model}`
        if (!model || seen.has(key)) return false
        seen.add(key)
        return true
      }).slice(0, MAX_TRANSLATION_MODELS)
      const fallback = {
        provider: state.selectedProvider,
        model: state.selectedModels[state.selectedProvider],
      }
      const translationModels = normalized.length > 0 ? normalized : [fallback]
      const firstSelection = translationModels[0]
      return {
        translationModels,
        selectedProvider: firstSelection.provider,
        selectedModels: { ...state.selectedModels, [firstSelection.provider]: firstSelection.model },
        translateError: null,
        translateErrorCode: null,
      }
    }),
  recordModelUsage: (provider, modelId) =>
    set((state: CoreSlice) => {
      const filtered = state.recentModels.filter(
        (r) => !(r.provider === provider && r.modelId === modelId),
      )
      return { recentModels: [{ provider, modelId }, ...filtered].slice(0, 5) }
    }),

  setActivePage: (page) => set({ activePage: page }),
  openSettings: () => set({ activePage: 'settings', settingsInitialSection: null }),
  openSettingsAt: (section) => set({ activePage: 'settings', settingsInitialSection: section }),
  clearTranslation: () => {
    workbenchRecovery.clear('translate')
    set({ sourceText: '', translatedText: '', phoneticText: '', translateError: null, translateErrorCode: null })
  },
})

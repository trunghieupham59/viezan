/**
 * settingsSlice — Zustand store slice for User Preferences and Provider State.
 *
 * Covers: app locale, UI settings (font size, auto-translate, furigana),
 * translation style, TTS voice, API key status cache, and dynamically
 * fetched model lists — all independently versioned from chat/history state.
 */
import { DEFAULT_SETTINGS, PROVIDERS } from '../../constants/providers'
import { DEFAULT_THEME_ACCENT, DEFAULT_THEME_PRESET, type ThemeAccent, type ThemePreset } from '../../constants/themePresets'
import type { AppLocale } from '../../i18n'
import type { ChatSendShortcut, FetchedModel, PhoneticMode, Provider, SttProvider, TranslateComparisonView, TranslationReasoningEffort, TranslationStyle, TtsMode, TtsVoice } from '../../types'
import { DEFAULT_CHAT_NEW_SESSION_SHORTCUT, DEFAULT_CHAT_SEND_SHORTCUT } from '../../utils/keyboardShortcuts'
import type { SliceSet } from './sliceTypes'

export interface SettingsSlice {
  // Locale
  locale: AppLocale
  /** When true, locale is automatically set from system language on startup */
  localeAuto: boolean

  // UI preferences
  autoTranslate: boolean
  autoTranslateDelay: number
  /**
   * Phonetic annotation mode for the translation result:
   *  - 'off'      — no phonetic annotations
   *  - 'standard' — ruby/furigana annotations above original characters ({word|reading} format)
   *  - 'phonetic' — replace script with pure phonetics (hiragana-only, pinyin-only, romanization-only, IPA)
   */
  phoneticMode: PhoneticMode
  translationStyle: TranslationStyle
  translationReasoningEffort: TranslationReasoningEffort
  /**
   * When true, image translation may upload the image to another provider that has a
   * stored key if the selected provider cannot read images. Off by default so an image
   * is never sent to a provider the user did not choose.
   */
  imageProviderFallback: boolean
  ttsMode: TtsMode
  ttsVoice: TtsVoice
  fontSize: 'small' | 'medium' | 'large'
  /** App colour theme — 'system' follows OS preference */
  theme: 'light' | 'dark' | 'system'
  /** Colour palette preset; independent from the light/dark mode above. */
  themePreset: ThemePreset
  /** Accent hue layered on the preset; 'auto' keeps the preset's own. */
  themeAccent: ThemeAccent
  /**
   * Preferred STT provider. Default 'auto' tries Whisper first then falls back
   * to Google Cloud STT (using the Gemini key), keeping voice input resilient
   * even when the OpenAI API is unavailable or out of credits.
   */
  sttProvider: SttProvider
  chatSendShortcut: ChatSendShortcut
  chatNewSessionShortcut: string
  /** When true, the left sidebar is collapsed to icon-only mode */
  sidebarCollapsed: boolean
  /** Independent collapsed preference for the contextual AI Chat sidebar. */
  aiChatSidebarCollapsed: boolean
  /** Columns or sentence rows for the multi-model translation comparison; survives navigation. */
  translateComparisonView: TranslateComparisonView
  /** Collapsed preference for the history panel beside the AI Translate workbench. */
  translateHistoryCollapsed: boolean

  // Provider / key status
  keyStatus: Record<Provider, boolean>

  // Dynamic models (fetched from API per provider)
  dynamicModels: Record<Provider, FetchedModel[]>
  modelsLoading: Record<Provider, boolean>
  modelsError: Record<Provider, string | null>

  // Actions — locale
  /** Set locale explicitly by user — disables auto-follow */
  setLocale: (locale: AppLocale) => void
  /** Set locale from system detection — does NOT disable auto-follow */
  setLocaleFromSystem: (locale: AppLocale) => void
  setLocaleAuto: (v: boolean) => void

  // Actions — preferences
  setAutoTranslate: (v: boolean) => void
  setAutoTranslateDelay: (ms: number) => void
  setPhoneticMode: (mode: PhoneticMode) => void
  setTranslationStyle: (style: TranslationStyle) => void
  setTranslationReasoningEffort: (effort: TranslationReasoningEffort) => void
  setImageProviderFallback: (v: boolean) => void
  setTtsMode: (mode: TtsMode) => void
  setTtsVoice: (voice: TtsVoice) => void
  setFontSize: (size: 'small' | 'medium' | 'large') => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setThemePreset: (preset: ThemePreset) => void
  setThemeAccent: (accent: ThemeAccent) => void
  setSttProvider: (provider: SttProvider) => void
  setChatSendShortcut: (shortcut: ChatSendShortcut) => void
  setChatNewSessionShortcut: (shortcut: string) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  setAiChatSidebarCollapsed: (collapsed: boolean) => void
  toggleAiChatSidebar: () => void
  setTranslateComparisonView: (view: TranslateComparisonView) => void
  setTranslateHistoryCollapsed: (collapsed: boolean) => void

  /** Whether a Tavily API key is stored (used for Deep Research web search) */
  hasTavilyKey: boolean
  /** Whether a Brave Search API key is stored (Deep Research fallback) */
  hasBraveKey: boolean
  /**
   * Bumped whenever a keychain-only STT credential (Groq) is saved or deleted, so
   * views that cache the STT pre-flight result re-run it. Not persisted.
   */
  sttCredentialsRevision: number

  // Actions — provider state
  setKeyStatus: (provider: Provider, hasKey: boolean) => void
  setDynamicModels: (provider: Provider, models: FetchedModel[]) => void
  setModelsLoading: (provider: Provider, loading: boolean) => void
  setModelsError: (provider: Provider, error: string | null) => void
  setHasTavilyKey: (v: boolean) => void
  setHasBraveKey: (v: boolean) => void
  bumpSttCredentialsRevision: () => void
}

export const createSettingsSlice = (set: SliceSet): SettingsSlice => ({
  locale: 'en' as AppLocale,
  localeAuto: true,
  autoTranslate: DEFAULT_SETTINGS.autoTranslate,
  autoTranslateDelay: DEFAULT_SETTINGS.autoTranslateDelay,
  phoneticMode: 'off' as PhoneticMode,
  translationStyle: 'general' as TranslationStyle,
  translationReasoningEffort: 'auto' as TranslationReasoningEffort,
  imageProviderFallback: false,
  ttsMode: 'free' as TtsMode,
  ttsVoice: 'nova' as TtsVoice,
  fontSize: 'medium' as const,
  theme: 'system' as const,
  themePreset: DEFAULT_THEME_PRESET,
  themeAccent: DEFAULT_THEME_ACCENT,
  sttProvider: 'auto' as SttProvider,
  chatSendShortcut: DEFAULT_CHAT_SEND_SHORTCUT,
  chatNewSessionShortcut: DEFAULT_CHAT_NEW_SESSION_SHORTCUT,
  sidebarCollapsed: false,
  aiChatSidebarCollapsed: false,
  translateComparisonView: 'columns' as TranslateComparisonView,
  translateHistoryCollapsed: false,
  // Build initial provider maps from PROVIDERS registry — adding a new provider only requires
  // updating constants/providers.ts; no need to touch this slice.
  keyStatus: Object.fromEntries(PROVIDERS.map((p) => [p.id, false])) as Record<Provider, boolean>,
  dynamicModels: Object.fromEntries(PROVIDERS.map((p): [string, FetchedModel[]] => [p.id, []])) as Record<Provider, FetchedModel[]>,
  modelsLoading: Object.fromEntries(PROVIDERS.map((p) => [p.id, false])) as Record<Provider, boolean>,
  modelsError: Object.fromEntries(PROVIDERS.map((p): [string, string | null] => [p.id, null])) as Record<Provider, string | null>,
  hasTavilyKey: false,
  hasBraveKey: false,
  sttCredentialsRevision: 0,

  // Locale — explicit user choice turns off auto-follow
  setLocale: (locale) => set({ locale, localeAuto: false }),
  // System detection — does NOT change localeAuto flag
  setLocaleFromSystem: (locale) => set({ locale }),
  setLocaleAuto: (v) => set({ localeAuto: v }),

  setAutoTranslate: (v) => set({ autoTranslate: v }),
  setAutoTranslateDelay: (ms) => set({ autoTranslateDelay: ms }),
  setPhoneticMode: (mode) => set({ phoneticMode: mode }),
  setTranslationStyle: (style) => set({ translationStyle: style }),
  setTranslationReasoningEffort: (effort) => set({ translationReasoningEffort: effort }),
  setImageProviderFallback: (v) => set({ imageProviderFallback: v }),
  setTtsMode: (mode) => set({ ttsMode: mode }),
  setTtsVoice: (voice) => set({ ttsVoice: voice }),
  setFontSize: (size) => set({ fontSize: size }),
  setTheme: (theme) => set({ theme }),
  setThemePreset: (preset) => set({ themePreset: preset }),
  setThemeAccent: (accent) => set({ themeAccent: accent }),
  setSttProvider: (provider) => set({ sttProvider: provider }),
  setChatSendShortcut: (shortcut) => set({ chatSendShortcut: shortcut }),
  setChatNewSessionShortcut: (shortcut) => set({ chatNewSessionShortcut: shortcut }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((state: SettingsSlice) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setAiChatSidebarCollapsed: (collapsed) => set({ aiChatSidebarCollapsed: collapsed }),
  toggleAiChatSidebar: () =>
    set((state: SettingsSlice) => ({ aiChatSidebarCollapsed: !state.aiChatSidebarCollapsed })),
  setTranslateComparisonView: (view) => set({ translateComparisonView: view }),
  setTranslateHistoryCollapsed: (collapsed) => set({ translateHistoryCollapsed: collapsed }),

  setKeyStatus: (provider, hasKey) =>
    set((state: SettingsSlice) => ({ keyStatus: { ...state.keyStatus, [provider]: hasKey } })),
  setDynamicModels: (provider, models) =>
    set((state: SettingsSlice) => ({ dynamicModels: { ...state.dynamicModels, [provider]: models } })),
  setModelsLoading: (provider, loading) =>
    set((state: SettingsSlice) => ({ modelsLoading: { ...state.modelsLoading, [provider]: loading } })),
  setModelsError: (provider, error) =>
    set((state: SettingsSlice) => ({ modelsError: { ...state.modelsError, [provider]: error } })),
  setHasTavilyKey: (v) => set({ hasTavilyKey: v }),
  setHasBraveKey: (v) => set({ hasBraveKey: v }),
  bumpSttCredentialsRevision: () =>
    set((state: SettingsSlice) => ({ sttCredentialsRevision: state.sttCredentialsRevision + 1 })),
})

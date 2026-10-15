import type { Language, Provider, ProviderConfig } from '../types'

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'local',
    name: 'Local AI',
    color: '#6B7280',
    keyPrefix: '',
    docsUrl: 'https://ollama.com/download',
    requiresApiKey: false,
    localEngines: ['ollama', 'lmstudio', 'llamacpp'],
    models: [
      { id: 'local-auto', name: 'Auto local model', description: 'Best running local model', tag: 'recommended' },
      { id: 'qwen3:4b', name: 'Qwen3 4B', description: 'Balanced local model', tag: 'balanced' },
      { id: 'gemma3:4b', name: 'Gemma 3 4B', description: 'Vision-capable local model', tag: 'powerful' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI GPT',
    color: '#10A37F',
    keyPrefix: 'sk-',
    docsUrl: 'https://platform.openai.com/api-keys',
    requiresApiKey: true,
    models: [
      // ★ When adding a new OpenAI model, mark the fastest/best translation model as tag:'recommended'
      { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: 'Fast & efficient', tag: 'recommended' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', description: 'Balanced performance', tag: 'balanced' },
      { id: 'gpt-5.2', name: 'GPT-5.2', description: 'Most capable', tag: 'powerful' },
    ],
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    color: '#CC785C',
    keyPrefix: 'sk-ant-',
    docsUrl: 'https://console.anthropic.com',
    requiresApiKey: true,
    models: [
      // ★ When adding a new Claude model, mark the fastest/best translation model as tag:'recommended'
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: 'Fast & capable', tag: 'recommended' },
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', description: 'Latest balanced model', tag: 'balanced' },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', description: 'Highest capability', tag: 'powerful' },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    color: '#4285F4',
    keyPrefix: 'AIza',
    docsUrl: 'https://aistudio.google.com/apikey',
    requiresApiKey: true,
    models: [
      // ★ When adding a new Gemini model, mark the fastest/best translation model as tag:'recommended'
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Best price-performance', tag: 'recommended' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', description: 'Fast & efficient', tag: 'balanced' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Most capable', tag: 'powerful' },
    ],
  },
]

/**
 * Returns the ID of the recommended translation model for a given provider.
 * Falls back to the first model in the list if none is tagged 'recommended'.
 *
 * MAINTENANCE: When a provider releases a new, faster/better translation model,
 * update the PROVIDERS array above:
 *   1. Set the new model's tag to 'recommended'
 *   2. Change the previous recommended model's tag to 'balanced' or 'powerful'
 * This function will automatically pick up the new default.
 */
export function getRecommendedModel(providerId: Provider): string {
  const provider = PROVIDERS.find((p) => p.id === providerId)
  if (!provider) return ''
  const recommended = provider.models.find((m) => m.tag === 'recommended')
  return recommended?.id ?? provider.models[0]?.id ?? ''
}

export const LANGUAGES: Language[] = [
  { code: 'auto', name: 'Auto Detect', nativeName: 'Auto' },
  // Sorted alphabetically by English name:
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'zh', name: 'Chinese (Simplified)', nativeName: '中文' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '繁體中文' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिंदी' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'th', name: 'Thai', nativeName: 'ภาษาไทย' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
]

export const TARGET_LANGUAGES = LANGUAGES.filter((l) => l.code !== 'auto')

/**
 * Advisory threshold for unusually long translation input.
 * The UI warns about extra latency and cost above this point, but still allows
 * submission; the main process owns separate chunking and hard-limit guards.
 */
export const TRANSLATE_INPUT_WARNING_CHARS = 5000

/**
 * Maximum number of characters allowed in the chat input.
 * Chat context is smaller than full-page translation so the limit is lower.
 */
export const MAX_CHAT_INPUT_CHARS = 3000

/**
 * Maximum characters of source text sent to the AI for language detection.
 * Enough to reliably identify any language; truncating saves tokens on long inputs.
 *
 * IMPORTANT: Must stay in sync with DETECT_LANG_MAX_CHARS in electron/ipc/ipcConstants.ts
 * which applies the same limit in the main process (defence-in-depth).
 */
export const DETECT_LANG_MAX_CHARS = 500

/** Keep comparison useful and predictable without multiplying provider cost unexpectedly. */
export const MAX_TRANSLATION_MODELS = 3

/**
 * Fallback language code for TTS when source language is set to 'auto'.
 * 'auto' is not a valid BCP-47 tag for speech synthesis, so we fall back to English.
 */
export const DEFAULT_TTS_FALLBACK_LANG = 'en'

export const DEFAULT_SETTINGS = {
  defaultProvider: 'local' as const,
  defaultSourceLang: 'auto',
  defaultTargetLang: 'vi',
  /** Auto-resolved from PROVIDERS using tag:'recommended' — update tags to change defaults */
  defaultModels: {
    local: getRecommendedModel('local'),
    gemini: getRecommendedModel('gemini'),
    claude: getRecommendedModel('claude'),
    openai: getRecommendedModel('openai'),
  },
  autoTranslate: true,
  autoTranslateDelay: 800,
}

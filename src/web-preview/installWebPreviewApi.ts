import { PROVIDERS } from '../constants/providers'
import type { ChatStreamEvent, WindowApi } from '../types'

const noopSubscription = () => () => {}
const ok = async () => ({ success: true })

const sampleTranslations: Record<string, Record<string, string>> = {
  vi: {
    'Hello, how are you?': 'Xin chào, bạn khỏe không?',
    'Good morning': 'Chào buổi sáng',
  },
  en: {
    'Xin chào, bạn khỏe không?': 'Hello, how are you?',
    'Chào buổi sáng': 'Good morning',
  },
  ja: {
    'Hello, how are you?': 'こんにちは、お元気ですか？',
    'Xin chào, bạn khỏe không?': 'こんにちは、お元気ですか？',
  },
}

function previewTranslation(text: string, targetLang: string): string {
  const exact = sampleTranslations[targetLang]?.[text.trim()]
  if (exact) return exact
  return `[${targetLang.toUpperCase()} preview] ${text.trim()}`
}

function detectPreviewLanguage(text: string): string {
  if (/[ぁ-んァ-ン一-龯]/u.test(text)) return 'ja'
  if (/[À-ỹ]/u.test(text)) return 'vi'
  return 'en'
}

function createWebPreviewApi(): WindowApi {
  const keys = new Map<string, string>()
  const streamListeners = new Map<string, (event: ChatStreamEvent) => void>()
  const modelList = PROVIDERS.flatMap(provider => provider.models.map(model => ({ ...model })))

  const api = {
    keychain: {
      save: async (provider: string, key: string) => { keys.set(provider, key); return { success: true } },
      get: async (provider: string) => ({ success: true, exists: keys.has(provider), masked: keys.has(provider) ? '••••preview' : null }),
      delete: async (provider: string) => { keys.delete(provider); return { success: true } },
      hasKey: async (provider: string) => ({ exists: keys.has(provider) || provider === 'local' }),
    },
    fetchModels: async (provider: string) => {
      const config = PROVIDERS.find(item => item.id === provider)
      return { success: true, models: config?.models ?? modelList, recommendedModel: config?.models[0]?.id }
    },
    discoverLocalAi: async () => ({ success: true, available: true, engine: 'ollama', models: PROVIDERS[0].models, suggestedModels: PROVIDERS[0].models, hardware: { platform: 'web', arch: 'preview', cpuCount: 8, totalMemoryGb: 16, tier: 'balanced' } }),
    ensureLocalAiRuntime: async () => api.discoverLocalAi(),
    benchmarkLocalAi: async () => ({ hardware: { platform: 'web', arch: 'preview', cpuCount: 8, totalMemoryGb: 16, tier: 'balanced' }, suggestedModels: PROVIDERS[0].models, metrics: { cpuScore: 100, memoryScore: 100, combinedScore: 100, durationMs: 1 } }),
    getLocalAiPerformance: async () => ({}),
    compareLocalAiPerformance: async () => { throw new Error('Performance comparison requires the desktop app.') },
    selectLocalAiPerformance: async () => { throw new Error('Performance configuration requires the desktop app.') },
    cancelLocalAiPerformance: async () => undefined,
    downloadLocalAiModel: async (modelId: string) => ({ success: true, model: modelId }),
    uninstallLocalAiModel: async (modelId: string) => ({ success: true, model: modelId }),
    onLocalAiModelDownloadProgress: noopSubscription,
    installOllama: async () => ({ success: false, error: 'Desktop only in Web Preview' }),
    verifyKey: async () => ({ success: true, valid: true }),
    translate: async (params: { sourceText: string; targetLang: string }) => ({ success: true, translatedText: previewTranslation(params.sourceText, params.targetLang) }),
    cancelTranslate: ok,
    rewriteText: async (params: { text: string }) => ({ success: true, translatedText: `[Rewritten preview] ${params.text.trim()}` }),
    detectLanguage: async (params: { text: string }) => ({ success: true, lang: detectPreviewLanguage(params.text) }),
    transcribeAudio: async () => ({
      success: true as const,
      text: 'This is a simulated transcript for Web Preview.',
      usedProvider: 'whisper' as const,
    }),
    cancelAudioTranscription: async () => ({ success: true as const, cancelled: false }),
    speakText: async () => ({ success: false, error: 'Audio playback requires the desktop app.' }),
    translateImage: async () => ({ success: true, regions: [{ x: 0.1, y: 0.1, width: 0.8, height: 0.15, originalText: 'Sample image text', translatedText: 'Văn bản ảnh mẫu', fontSize: 0.05, bgColor: '#ffffff', textColor: '#111111' }] }),
    onImageModelSwitched: noopSubscription,
    webSearch: async ({ query }: { query: string }) => ({ success: true, provider: 'jina', answer: `Preview search results for “${query}”`, results: [{ title: 'Web Preview result', url: 'https://example.com', content: 'Deterministic mock content for UI development.', score: 1 }] }),
    webSearchVerify: async () => ({ valid: true }),
    chat: async () => ({ success: true, reply: 'This is a deterministic Web Preview response. The desktop app will use the selected AI provider.' }),
    editChatImage: async () => ({ success: false, error: 'Image editing requires the desktop app.' }),
    generateChatImage: async () => ({ success: false, error: 'Image generation requires the desktop app.' }),
    chatStream: async ({ requestId }: { requestId: string }) => {
      const reply = 'This is a streamed Web Preview response.'
      queueMicrotask(() => {
        const emit = streamListeners.get(requestId)
        emit?.({ requestId, type: 'start' })
        emit?.({ requestId, type: 'token', token: reply })
        emit?.({ requestId, type: 'end', reply })
      })
      return { success: true, reply }
    },
    chatStreamCancel: ok,
    onChatStreamEvent: (requestId: string, callback: (event: ChatStreamEvent) => void) => {
      streamListeners.set(requestId, callback)
      return () => streamListeners.delete(requestId)
    },
    checkScreenPermission: async () => 'denied',
    openExternal: async (url: string) => { window.open(url, '_blank', 'noopener,noreferrer') },
    relaunchApp: async () => undefined,
    checkSttProviders: async () => ({ primary: 'whisper', available: ['whisper'] }),
    translateStream: async (params: { sourceText: string; targetLang: string }) => ({ success: true, translatedText: previewTranslation(params.sourceText, params.targetLang) }),
    subtitle: { show: async () => undefined, hide: async () => undefined, update: async () => undefined, setStyle: async () => undefined, setSourceText: async () => undefined, pushState: async () => undefined, onClosed: noopSubscription, onStart: noopSubscription, onStop: noopSubscription, onSetProvider: noopSubscription, onSetModel: noopSubscription, onSetAudioMode: noopSubscription, onSetTargetLang: noopSubscription, onStyleUpdate: noopSubscription, onClear: noopSubscription },
    platform: 'web',
    version: 'web-preview',
    hotkey: { update: async (settings: Record<string, unknown>) => ({ success: true, settings }), get: async () => ({ success: true, settings: {} }), disable: ok, onTranslating: noopSubscription, onTranslated: noopSubscription, onError: noopSubscription, chat: { update: async (settings: Record<string, unknown>) => ({ success: true, settings }), get: async () => ({ success: true, settings: {} }), onOpen: noopSubscription } },
    quickChat: { hide: ok, openSettings: ok, openInChat: ok, onShow: noopSubscription, onOpenSettings: noopSubscription, onOpenInChat: noopSubscription },
    legacyAssistant: { get: async () => ({ success: true, settings: {} }), update: ok, getBookmarklet: async () => ({ success: true, bookmarklet: '' }), injectNow: ok },
    updater: { check: ok, download: async () => ({ success: false, error: 'Desktop only in Web Preview' }), install: async () => ({ success: false, error: 'Desktop only in Web Preview' }), openInstaller: async () => ({ success: false, error: 'Desktop only in Web Preview' }), getVersion: async () => ({ version: 'web-preview' }), openDownload: ok, onStatus: noopSubscription },
    localServer: { createToken: async () => ({ success: false, error: 'Desktop only in Web Preview' }), listTokens: async () => ({ success: true, port: 39875, tokens: [] }), deleteToken: ok, regenerateToken: async () => ({ success: false, error: 'Desktop only in Web Preview' }), syncConfig: ok },
  }

  return api as unknown as WindowApi
}

export function installWebPreviewApi(): void {
  if (import.meta.env.MODE !== 'web-preview' || window.api) return
  window.api = createWebPreviewApi()
  document.documentElement.dataset.runtime = 'web-preview'
  console.info('[Viezan] Web Preview API installed; native features are simulated.')
}

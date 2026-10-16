/**
 * Translation & model preload API — text translation, rewrite, language detection,
 * live-stream, model fetching, and API key verification.
 */
import { ipcRenderer } from 'electron'
import type { LocalAiExecutionMode, LocalAiPerformanceRequest } from '../../shared/localAiPerformance'

export const translateSection = {
  // Fetch available models from provider API
  fetchModels: (provider: string) =>
    ipcRenderer.invoke('models:fetch', provider),

  // Discover a running local AI runtime (Ollama, LM Studio, llama.cpp)
  discoverLocalAi: (force?: boolean) =>
    ipcRenderer.invoke('local-ai:discover', force),

  // Ensure a local AI runtime is available, starting a managed runtime when possible
  ensureLocalAiRuntime: () =>
    ipcRenderer.invoke('local-ai:ensureRuntime'),

  // Benchmark this machine and return local model recommendations
  benchmarkLocalAi: () =>
    ipcRenderer.invoke('local-ai:benchmark'),

  getLocalAiPerformance: (model: string) => ipcRenderer.invoke('local-ai:performance:get', model),
  compareLocalAiPerformance: (request: LocalAiPerformanceRequest) => ipcRenderer.invoke('local-ai:performance:compare', request),
  selectLocalAiPerformance: (model: string, mode: LocalAiExecutionMode | 'auto') => ipcRenderer.invoke('local-ai:performance:select', model, mode),
  cancelLocalAiPerformance: () => ipcRenderer.invoke('local-ai:performance:cancel'),

  // Download a supported local model through the local runtime when available
  downloadLocalAiModel: (modelId: string) =>
    ipcRenderer.invoke('local-ai:downloadModel', modelId),

  // Remove an installed local model through the local runtime when available
  uninstallLocalAiModel: (modelId: string) =>
    ipcRenderer.invoke('local-ai:uninstallModel', modelId),

  onLocalAiModelDownloadProgress: (cb: (progress: {
    model: string
    status: 'running' | 'success' | 'error'
    percent: number
    message: string
    completedBytes?: number
    totalBytes?: number
  }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: {
      model: string
      status: 'running' | 'success' | 'error'
      percent: number
      message: string
      completedBytes?: number
      totalBytes?: number
    }) => cb(progress)
    ipcRenderer.on('local-ai:modelDownloadProgress', listener)
    return () => ipcRenderer.removeListener('local-ai:modelDownloadProgress', listener)
  },

  // Pulls still running in main, so a remounted Settings view can resume showing them
  getLocalAiActiveDownloads: () =>
    ipcRenderer.invoke('local-ai:getActiveDownloads'),

  // Install the managed local runtime through a fixed main-process installer command
  installOllama: () =>
    ipcRenderer.invoke('local-ai:installOllama'),

  cancelModelDownload: (modelId: string) =>
    ipcRenderer.invoke('local-ai:cancelModelDownload', modelId),

  // Verify API key (test call to provider)
  verifyKey: (provider: string, apiKey: string) =>
    ipcRenderer.invoke('translate:verify', provider, apiKey),

  // Full text translation with optional chunking for long documents
  translate: (params: {
    provider: string
    model: string
    requestId?: string
    sourceText: string
    sourceLang: string
    targetLang: string
    showFurigana?: boolean
    phoneticMode?: 'off' | 'standard' | 'phonetic'
    translationStyle?: string
    reasoningEffort?: 'auto' | 'low' | 'medium' | 'high'
    phoneticOnly?: boolean
  }) => ipcRenderer.invoke('translate', params),

  // Cancel an in-flight text or image translation request by renderer requestId.
  cancelTranslate: async (params: { requestId: string }) => {
    const [textResult, imageResult] = await Promise.all([
      ipcRenderer.invoke('translate:cancel', params),
      ipcRenderer.invoke('image:translate:cancel', params),
    ])
    return textResult?.success ? textResult : imageResult
  },

  // Rewrite text to be more natural in its own language (preserves meaning/tone)
  rewriteText: (params: {
    provider: string
    model: string
    text: string
    lang: string
    translationStyle?: string
  }) => ipcRenderer.invoke('translate:rewrite', params),

  // Detect the language of source text — returns the BCP-47 code (e.g. "vi", "en", "ja")
  detectLanguage: (params: {
    provider: string
    model: string
    text: string
  }) => ipcRenderer.invoke('translate:detect-lang', params),

  // Streaming translate — sends each AI token directly to subtitle window,
  // returns the full translated text when done.
  translateStream: (params: {
    provider: string
    model: string
    sourceText: string
    sourceLang: string
    targetLang: string
    translationStyle?: string
  }) => ipcRenderer.invoke('translate:live-stream', params),
}

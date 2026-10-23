/**
 * Translation & model preload API — text translation, rewrite, language detection,
 * live-stream, model fetching, API key verification and the local AI runtime.
 * Shape: `shared/translateApi.d.ts`.
 */
import type { TranslateApi } from '../../shared/translateApi'
import { IMAGE_TRANSLATE_CHANNELS, LOCAL_AI_CHANNELS, MODELS_CHANNELS, TRANSLATE_CHANNELS } from '../ipc/channels'
import { invoke, subscribe } from './contract'

const cancelTextTranslate = invoke<[{ requestId: string }], { success: boolean; error?: string } | undefined>(TRANSLATE_CHANNELS.invoke.cancel)
const cancelImageTranslate = invoke<[{ requestId: string }], { success: boolean; error?: string }>(IMAGE_TRANSLATE_CHANNELS.invoke.cancel)

export const translateApi: TranslateApi = {
  fetchModels: invoke(MODELS_CHANNELS.invoke.fetch),
  discoverLocalAi: invoke(LOCAL_AI_CHANNELS.invoke.discover),
  ensureLocalAiRuntime: invoke(LOCAL_AI_CHANNELS.invoke.ensureRuntime),
  benchmarkLocalAi: invoke(LOCAL_AI_CHANNELS.invoke.benchmark),
  getLocalAiPerformance: invoke(LOCAL_AI_CHANNELS.invoke.performanceGet),
  compareLocalAiPerformance: invoke(LOCAL_AI_CHANNELS.invoke.performanceCompare),
  selectLocalAiPerformance: invoke(LOCAL_AI_CHANNELS.invoke.performanceSelect),
  cancelLocalAiPerformance: invoke(LOCAL_AI_CHANNELS.invoke.performanceCancel),
  downloadLocalAiModel: invoke(LOCAL_AI_CHANNELS.invoke.downloadModel),
  uninstallLocalAiModel: invoke(LOCAL_AI_CHANNELS.invoke.uninstallModel),
  onLocalAiModelDownloadProgress: subscribe(LOCAL_AI_CHANNELS.event.modelDownloadProgress),
  getLocalAiActiveDownloads: invoke(LOCAL_AI_CHANNELS.invoke.getActiveDownloads),
  installOllama: invoke(LOCAL_AI_CHANNELS.invoke.installOllama),
  cancelModelDownload: invoke(LOCAL_AI_CHANNELS.invoke.cancelModelDownload),
  verifyKey: invoke(TRANSLATE_CHANNELS.invoke.verify),
  translate: invoke(TRANSLATE_CHANNELS.invoke.translate),
  // A requestId may belong to a text or an image translation; ask both and report the one that found it.
  cancelTranslate: async (params) => {
    const [textResult, imageResult] = await Promise.all([cancelTextTranslate(params), cancelImageTranslate(params)])
    return textResult?.success ? textResult : imageResult
  },
  rewriteText: invoke(TRANSLATE_CHANNELS.invoke.rewrite),
  detectLanguage: invoke(TRANSLATE_CHANNELS.invoke.detectLang),
  translateStream: invoke(TRANSLATE_CHANNELS.invoke.liveStream),
}

/** These members sit directly on `window.api`. */
export const translateSection = translateApi

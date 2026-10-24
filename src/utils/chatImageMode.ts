import type { Provider } from '../types'

/**
 * Providers whose Electron main-process handlers implement image generation
 * and editing. Mirrors the `CHAT_IMAGE_GENERATE_PROVIDERS` /
 * `CHAT_IMAGE_EDIT_PROVIDERS` registries in `electron/ipc/chatImageEdit.ts`;
 * the renderer cannot import them across the trust boundary.
 */
const CHAT_IMAGE_MODE_PROVIDERS: ReadonlySet<Provider> = new Set<Provider>(['gemini', 'openai'])

export function supportsChatImageMode(provider: Provider): boolean {
  return CHAT_IMAGE_MODE_PROVIDERS.has(provider)
}

export type ImageInputSupport = 'yes' | 'no' | 'unknown'

/** Local model families that read images (Ollama / LM Studio / llama.cpp names). */
const LOCAL_VISION_MODEL = /(llava|bakllava|vision|[-_.:]vl\b|vl[-_:]|qwen\d*(\.\d+)?-?vl|gemma3|gemma-3|minicpm-v|moondream|pixtral|llama4|mistral-small3\.[12]|granite.*vision)/i
/** Cloud models known not to accept images. Everything else from these providers does. */
const CLOUD_TEXT_ONLY_MODEL = /^(gpt-3\.5|o1-mini|o3-mini|gpt-4-(\d{4}|32k|turbo-preview|\d{4}-preview)$|gpt-4$)/i

/**
 * Whether a chat model can read an attached image, from its id alone. Cloud
 * models are known; local ones depend on what the user pulled, so an
 * unrecognised local model is `unknown` rather than a confident "no".
 */
export function imageInputSupport(provider: Provider, model: string): ImageInputSupport {
  const id = model.trim()
  if (provider === 'local') {
    if (!id || id === 'local-auto') return 'unknown'
    return LOCAL_VISION_MODEL.test(id) ? 'yes' : 'unknown'
  }
  return CLOUD_TEXT_ONLY_MODEL.test(id) ? 'no' : 'yes'
}

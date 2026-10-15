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

/**
 * Web Search preload — search providers via contextBridge. Shape: `shared/webSearchApi.d.ts`.
 */
import type { WebSearchApi } from '../../shared/webSearchApi'
import { WEBSEARCH_CHANNELS } from '../ipc/channels'
import { invoke } from './contract'

export const webSearchApi: WebSearchApi = {
  webSearch: invoke(WEBSEARCH_CHANNELS.invoke.search),
  webSearchVerify: invoke(WEBSEARCH_CHANNELS.invoke.verify),
}

/** These members sit directly on `window.api`. */
export const webSearchSection = webSearchApi

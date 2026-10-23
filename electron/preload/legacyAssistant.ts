/**
 * Legacy Assistant preload API — no-extension browser injection via bookmarklet.
 * Shape: `shared/legacyAssistantApi.d.ts`.
 */
import type { LegacyAssistantApi } from '../../shared/legacyAssistantApi'
import { LEGACY_ASSISTANT_CHANNELS } from '../ipc/channels'
import { invoke } from './contract'

const ch = LEGACY_ASSISTANT_CHANNELS.invoke

export const legacyAssistantApi: LegacyAssistantApi = {
  get: invoke(ch.get),
  update: invoke(ch.update),
  getBookmarklet: invoke(ch.getBookmarklet),
  injectNow: invoke(ch.injectNow),
}

export const legacyAssistantSection = { legacyAssistant: legacyAssistantApi }

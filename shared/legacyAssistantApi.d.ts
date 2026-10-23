/**
 * Legacy Assistant API — the floating assistant icon injected into browsers without an
 * extension (bookmarklet or direct injection). Single source for
 * `window.api.legacyAssistant`; see `electron/preload/legacyAssistant.ts`.
 */

export interface LegacyAssistantSettingsPatch {
  enabled?: boolean
  targetLang?: string
}

export interface LegacyAssistantApi {
  get: () => Promise<{ success: boolean; settings?: Record<string, unknown> }>
  update: (settings: LegacyAssistantSettingsPatch) => Promise<{ success: boolean }>
  /** The `javascript:` bookmarklet URL embedding the assistant script. */
  getBookmarklet: () => Promise<{ success: boolean; bookmarklet?: string; error?: string }>
  /** Trigger one injection attempt into the frontmost browser now. */
  injectNow: () => Promise<{ success: boolean }>
}

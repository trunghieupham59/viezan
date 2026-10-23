/**
 * Local server API — the API-key-authenticated HTTP bridge the Chrome extension uses.
 * API key values are returned once, on creation or rotation, and never listed.
 * Single source for `window.api.localServer`; see `electron/preload/localServer.ts`.
 */

export type LocalServerTtsMode = 'free' | 'auto' | 'premium'
export type LocalServerTtsVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'

export interface LocalServerTokenSummary {
  id: string
  name: string
  createdAt: number
  expiresAt: number
}

/** Result of creating or rotating a key: `token` is the only time the value is shown. */
export interface LocalServerTokenResult {
  success: boolean
  token?: string
  id?: string
  name?: string
  createdAt?: number
  expiresAt?: number
  error?: string
}

export interface LocalServerApi {
  createToken: (params: { name: string; ttlDays: number }) => Promise<LocalServerTokenResult>
  listTokens: () => Promise<{ success: boolean; port: number; tokens: LocalServerTokenSummary[] }>
  deleteToken: (params: { id: string }) => Promise<{ success: boolean; error?: string }>
  regenerateToken: (params: { id: string; ttlDays?: number }) => Promise<LocalServerTokenResult>
  /** Mirror the app's selected provider/model and TTS preferences so the extension endpoints follow the app. */
  syncConfig: (params: {
    provider: string
    model: string
    ttsMode?: LocalServerTtsMode
    ttsVoice?: LocalServerTtsVoice
  }) => Promise<{ success: boolean }>
}

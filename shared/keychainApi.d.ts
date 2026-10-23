/**
 * Keychain API — secure API key storage. Raw key values never leave the main process;
 * the renderer only ever sees whether a key exists and a masked preview.
 * Single source for `window.api.keychain`; see `electron/preload/keychain.ts`.
 */

export interface KeychainResult {
  success?: boolean
  exists?: boolean
  /** Masked preview of the stored key (e.g. "sk-…abcd"), null when none is stored. */
  masked?: string | null
  error?: string
}

export interface KeychainApi {
  save: (provider: string, key: string) => Promise<KeychainResult>
  /** Status only: never returns the raw key. */
  get: (provider: string) => Promise<KeychainResult>
  delete: (provider: string) => Promise<KeychainResult>
  hasKey: (provider: string) => Promise<{ exists: boolean }>
}

/**
 * Keychain preload API — secure API key storage for the renderer. Raw key values
 * NEVER leave the main process. Shape: `shared/keychainApi.d.ts`.
 */
import type { KeychainApi } from '../../shared/keychainApi'
import { KEYCHAIN_CHANNELS } from '../ipc/channels'
import { invoke } from './contract'

const ch = KEYCHAIN_CHANNELS.invoke

export const keychainApi: KeychainApi = {
  save: invoke(ch.save),
  get: invoke(ch.get),
  delete: invoke(ch.delete),
  hasKey: invoke(ch.hasKey),
}

export const keychainSection = { keychain: keychainApi }

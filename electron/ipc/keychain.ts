import type { BrowserWindow, IpcMain } from 'electron'
import { KEYCHAIN_CHANNELS } from './channels'
import { isSenderWindow } from './senderGuard'
import { deleteStoredApiKey, getStoredApiKey, hasStoredApiKey, setStoredApiKey } from './storage'

const MASK_BULLET_COUNT = 12
const MASK_REVEAL_MIN_KEY_LENGTH = 20
const MASK_REVEAL_TAIL_CHARS = 4
const UNTRUSTED_SENDER = { success: false, error: 'Untrusted sender' } as const

/**
 * Build a display mask that never reveals the key length or its prefix.
 * Only keys long enough that 4 trailing chars are not a meaningful fraction
 * of the secret show their tail.
 */
export function maskApiKey(key: string): string {
  const bullets = '•'.repeat(MASK_BULLET_COUNT)
  return key.length >= MASK_REVEAL_MIN_KEY_LENGTH
    ? `${bullets}${key.slice(-MASK_REVEAL_TAIL_CHARS)}`
    : bullets
}

/**
 * `getMainWindow` is optional for backward compatibility. When provided,
 * mutating/reading handlers (save, get, delete) only accept the main window;
 * `keychain:hasKey` stays open because the Quick Chat window uses it.
 */
export function registerKeychainHandlers(ipcMain: IpcMain, getMainWindow?: () => BrowserWindow | null) {
  const isTrusted = (event: Parameters<typeof isSenderWindow>[0]) =>
    !getMainWindow || isSenderWindow(event, getMainWindow)

  // Save API key to OS Keychain
  ipcMain.handle(KEYCHAIN_CHANNELS.invoke.save, async (event, provider: string, apiKey: string) => {
    if (!isTrusted(event)) return UNTRUSTED_SENDER
    try {
      setStoredApiKey(provider, apiKey)
      return { success: true }
    } catch (error) {
      console.error('keychain:save error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to save API key' }
    }
  })

  // Get API key status (masked) - does NOT return raw key
  ipcMain.handle(KEYCHAIN_CHANNELS.invoke.get, async (event, provider: string) => {
    if (!isTrusted(event)) return { exists: false, masked: null, error: UNTRUSTED_SENDER.error }
    try {
      const key = getStoredApiKey(provider)
      if (!key) return { exists: false, masked: null }
      // Return a fixed-length mask only; never the prefix or the key length.
      return { exists: true, masked: maskApiKey(key) }
    } catch (error) {
      console.error('keychain:get error:', error)
      return { exists: false, masked: null, error: String(error) }
    }
  })

  // Delete API key from OS Keychain
  ipcMain.handle(KEYCHAIN_CHANNELS.invoke.delete, async (event, provider: string) => {
    if (!isTrusted(event)) return UNTRUSTED_SENDER
    try {
      const deleted = deleteStoredApiKey(provider)
      return { success: deleted }
    } catch (error) {
      console.error('keychain:delete error:', error)
      return { success: false, error: String(error) }
    }
  })

  // Check if key exists (boolean only) — does NOT decrypt, avoids macOS Keychain prompt on startup
  ipcMain.handle(KEYCHAIN_CHANNELS.invoke.hasKey, async (_event, provider: string) => {
    try {
      const exists = hasStoredApiKey(provider)
      return { exists }
    } catch (error) {
      return { exists: false, error: String(error) }
    }
  })
}

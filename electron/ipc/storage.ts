/**
 * Secure key storage using Electron's built-in safeStorage API.
 * Replaces keytar — no native module compilation required.
 * Data is encrypted with OS-level encryption and stored in the app's userData directory.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { app, safeStorage } from 'electron'

const KEYS_FILE_NAME = 'api-keys.enc'
const KEYCHAIN_SERVICE = 'TranslateApp'
const MAX_PROVIDER_ID_CHARS = 64
const MAX_API_KEY_CHARS = 4096
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const RESERVED_PROVIDER_IDS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'hasownproperty',
  'tostring',
  'valueof',
])

type KeyRecord = Record<string, string>

function getKeysFilePath(): string {
  return path.join(app.getPath('userData'), KEYS_FILE_NAME)
}

/** Returns the normalized provider id, or null when it is not a safe record key. */
function normalizeProvider(provider: unknown): string | null {
  if (typeof provider !== 'string') return null
  const id = provider.trim()
  if (!id || id.length > MAX_PROVIDER_ID_CHARS) return null
  if (!PROVIDER_ID_PATTERN.test(id)) return null
  if (RESERVED_PROVIDER_IDS.has(id.toLowerCase())) return null
  return id
}

function hasOwn(record: KeyRecord, name: string): boolean {
  // biome-ignore lint/suspicious/noPrototypeBuiltins: Object.hasOwn needs the ES2022 lib, which tsconfig.electron.json does not enable
  return Object.prototype.hasOwnProperty.call(record, name)
}

function newKeyRecord(): KeyRecord {
  return Object.create(null) as KeyRecord
}

function lookupEncoded(encrypted: KeyRecord, provider: string): string | undefined {
  const namespaced = `${KEYCHAIN_SERVICE}:${provider}`
  if (hasOwn(encrypted, namespaced) && typeof encrypted[namespaced] === 'string') return encrypted[namespaced]
  // Legacy un-namespaced entry
  if (hasOwn(encrypted, provider) && typeof encrypted[provider] === 'string') return encrypted[provider]
  return undefined
}

/** Keep unreadable key files for recovery instead of letting the next save wipe them. */
function backupCorruptKeysFile(filePath: string): void {
  const backupPath = `${filePath}.corrupt-${Date.now()}`
  try {
    fs.renameSync(filePath, backupPath)
    console.error(`[storage] Key file was unreadable; moved to ${path.basename(backupPath)}`)
  } catch (err) {
    console.error('[storage] Failed to back up unreadable key file:', err)
  }
}

function loadEncryptedKeys(): KeyRecord {
  const filePath = getKeysFilePath()
  if (!fs.existsSync(filePath)) return newKeyRecord()

  const raw = fs.readFileSync(filePath, 'utf-8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    backupCorruptKeysFile(filePath)
    return newKeyRecord()
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    backupCorruptKeysFile(filePath)
    return newKeyRecord()
  }

  const result = newKeyRecord()
  for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'string' && !RESERVED_PROVIDER_IDS.has(name.toLowerCase())) result[name] = value
  }
  return result
}

const RENAME_RETRY_ATTEMPTS = 3
const RENAME_RETRY_DELAY_MS = 50
const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * rename over an existing file can transiently fail on Windows (antivirus or
 * indexer holding the target). Retry briefly for those codes only, then throw.
 */
function renameWithRetry(from: string, to: string): void {
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(from, to)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code
      if (attempt >= RENAME_RETRY_ATTEMPTS || !code || !RETRYABLE_RENAME_CODES.has(code)) throw err
      sleepSync(RENAME_RETRY_DELAY_MS)
    }
  }
}

function saveEncryptedKeys(data: KeyRecord): void {
  const filePath = getKeysFilePath()
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data), { encoding: 'utf-8', mode: 0o600 })
    renameWithRetry(tempPath, filePath)
  } catch (err) {
    try {
      fs.rmSync(tempPath, { force: true })
    } catch {
      // best effort
    }
    throw err
  }
}

/** safeStorage is only trustworthy when it is not the Linux plaintext fallback. */
function isEncryptionUsable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  if (process.platform === 'linux') {
    const backend = safeStorage.getSelectedStorageBackend?.()
    if (backend === 'basic_text') return false
  }
  return true
}

/**
 * Check if an API key exists WITHOUT decrypting it.
 * This avoids triggering the macOS Keychain password dialog on startup.
 */
export function hasStoredApiKey(provider: string): boolean {
  try {
    const id = normalizeProvider(provider)
    if (!id) return false
    // On Linux the plaintext `basic_text` backend is rejected by
    // getStoredApiKey, so never report such a key as configured. Other
    // platforms are not probed here: this must stay free of keychain prompts.
    if (process.platform === 'linux' && !isEncryptionUsable()) return false
    return !!lookupEncoded(loadEncryptedKeys(), id)
  } catch {
    return false
  }
}

export function getStoredApiKey(provider: string): string | null {
  try {
    const id = normalizeProvider(provider)
    if (!id) return null
    if (!isEncryptionUsable()) return null
    const encoded = lookupEncoded(loadEncryptedKeys(), id)
    if (!encoded) return null
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
  } catch {
    return null
  }
}

export function setStoredApiKey(provider: string, apiKey: string): void {
  const id = normalizeProvider(provider)
  if (!id) throw new Error('Invalid provider.')
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('API key must be a non-empty string.')
  if (apiKey.length > MAX_API_KEY_CHARS) throw new Error('API key is too long.')
  if (!isEncryptionUsable()) {
    throw new Error('Encryption not available on this system.')
  }
  const encrypted = loadEncryptedKeys()
  encrypted[`${KEYCHAIN_SERVICE}:${id}`] = safeStorage.encryptString(apiKey).toString('base64')
  // Clean up old-format key if present
  delete encrypted[id]
  saveEncryptedKeys(encrypted)
}

export function deleteStoredApiKey(provider: string): boolean {
  const id = normalizeProvider(provider)
  if (!id) return false
  const encrypted = loadEncryptedKeys()
  const key = `${KEYCHAIN_SERVICE}:${id}`
  const hadNew = hasOwn(encrypted, key)
  const hadOld = hasOwn(encrypted, id)
  delete encrypted[key]
  delete encrypted[id]
  if (hadNew || hadOld) {
    saveEncryptedKeys(encrypted)
    return true
  }
  return false
}

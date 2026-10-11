// @vitest-environment node
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronState = vi.hoisted(() => ({
  failRename: false,
  renameFailures: [] as string[],
  renameCalls: 0,
  userData: '',
  encryptionAvailable: true,
  backend: undefined as string | undefined,
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    renameSync: (from: string, to: string) => {
      electronState.renameCalls++
      if (electronState.failRename) throw new Error('rename failed')
      const code = electronState.renameFailures.shift()
      if (code) throw Object.assign(new Error(`${code}: rename blocked`), { code })
      return actual.renameSync(from, to)
    },
  }
})

vi.mock('electron', () => ({
  app: { getPath: () => electronState.userData },
  safeStorage: {
    isEncryptionAvailable: () => electronState.encryptionAvailable,
    getSelectedStorageBackend: () => electronState.backend,
    encryptString: (value: string) => Buffer.from(`enc:${value}`, 'utf-8'),
    decryptString: (value: Buffer) => value.toString('utf-8').replace(/^enc:/, ''),
  },
}))

import { deleteStoredApiKey, getStoredApiKey, hasStoredApiKey, setStoredApiKey } from '../storage'

function keysFile(): string {
  return path.join(electronState.userData, 'api-keys.enc')
}

function encode(value: string): string {
  return Buffer.from(`enc:${value}`).toString('base64')
}

describe('storage', () => {
  beforeEach(() => {
    electronState.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'viezan-storage-'))
    electronState.encryptionAvailable = true
    electronState.backend = undefined
    electronState.failRename = false
    electronState.renameFailures = []
    electronState.renameCalls = 0
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(electronState.userData, { recursive: true, force: true })
  })

  it('round-trips a key and reports existence without decrypting', () => {
    setStoredApiKey('openai', 'sk-test-1234567890')
    expect(hasStoredApiKey('openai')).toBe(true)
    expect(getStoredApiKey('openai')).toBe('sk-test-1234567890')
    expect(hasStoredApiKey('claude')).toBe(false)
  })

  it('does not treat prototype names as stored providers', () => {
    expect(hasStoredApiKey('constructor')).toBe(false)
    expect(hasStoredApiKey('__proto__')).toBe(false)
    expect(hasStoredApiKey('toString')).toBe(false)
    expect(getStoredApiKey('constructor')).toBeNull()
    expect(deleteStoredApiKey('__proto__')).toBe(false)
  })

  it('rejects invalid providers on save', () => {
    for (const provider of ['', '   ', '__proto__', 'constructor', 'prototype', 'a/b', 'x'.repeat(65), 5 as unknown as string]) {
      expect(() => setStoredApiKey(provider, 'sk-valid')).toThrow('Invalid provider')
    }
    expect(fs.existsSync(keysFile())).toBe(false)
  })

  it('rejects empty, non-string and oversized API keys', () => {
    expect(() => setStoredApiKey('openai', '')).toThrow('non-empty')
    expect(() => setStoredApiKey('openai', '   ')).toThrow('non-empty')
    expect(() => setStoredApiKey('openai', 42 as unknown as string)).toThrow('non-empty')
    expect(() => setStoredApiKey('openai', 'k'.repeat(4097))).toThrow('too long')
    expect(() => setStoredApiKey('openai', 'k'.repeat(4096))).not.toThrow()
  })

  it('writes atomically without leaving temp files', () => {
    setStoredApiKey('openai', 'sk-one')
    setStoredApiKey('claude', 'sk-two')
    expect(fs.readdirSync(electronState.userData)).toEqual(['api-keys.enc'])
    if (process.platform !== 'win32') {
      expect(fs.statSync(keysFile()).mode & 0o777).toBe(0o600)
    }
  })

  it('removes the temp file and keeps the old file when the rename fails', () => {
    setStoredApiKey('openai', 'sk-one')
    const before = fs.readFileSync(keysFile(), 'utf-8')
    electronState.failRename = true
    expect(() => setStoredApiKey('claude', 'sk-two')).toThrow('rename failed')
    expect(fs.readFileSync(keysFile(), 'utf-8')).toBe(before)
    expect(fs.readdirSync(electronState.userData)).toEqual(['api-keys.enc'])
  })

  it('retries a transient EPERM/EBUSY/EACCES rename and then succeeds', () => {
    setStoredApiKey('openai', 'sk-one')
    for (const code of ['EPERM', 'EBUSY', 'EACCES']) {
      electronState.renameCalls = 0
      electronState.renameFailures = [code, code]
      setStoredApiKey('claude', `sk-${code}`)
      expect(electronState.renameCalls).toBe(3)
      expect(getStoredApiKey('claude')).toBe(`sk-${code}`)
    }
    expect(fs.readdirSync(electronState.userData)).toEqual(['api-keys.enc'])
  })

  it('gives up after 3 attempts and cleans the temp file', () => {
    setStoredApiKey('openai', 'sk-one')
    electronState.renameCalls = 0
    electronState.renameFailures = ['EPERM', 'EPERM', 'EPERM', 'EPERM']
    expect(() => setStoredApiKey('claude', 'sk-two')).toThrow('EPERM')
    expect(electronState.renameCalls).toBe(3)
    expect(fs.readdirSync(electronState.userData)).toEqual(['api-keys.enc'])
  })

  it('does not retry other rename errors', () => {
    setStoredApiKey('openai', 'sk-one')
    electronState.renameCalls = 0
    electronState.renameFailures = ['ENOSPC']
    expect(() => setStoredApiKey('claude', 'sk-two')).toThrow('ENOSPC')
    expect(electronState.renameCalls).toBe(1)
  })

  it('backs up a corrupt key file instead of wiping it on the next save', () => {
    fs.writeFileSync(keysFile(), '{not json', 'utf-8')
    expect(hasStoredApiKey('openai')).toBe(false)

    const backups = fs.readdirSync(electronState.userData).filter((name) => name.startsWith('api-keys.enc.corrupt-'))
    expect(backups).toHaveLength(1)
    expect(fs.readFileSync(path.join(electronState.userData, backups[0]), 'utf-8')).toBe('{not json')

    setStoredApiKey('openai', 'sk-new')
    expect(getStoredApiKey('openai')).toBe('sk-new')
  })

  it('backs up a key file whose JSON is not an object', () => {
    fs.writeFileSync(keysFile(), '[1,2,3]', 'utf-8')
    expect(hasStoredApiKey('openai')).toBe(false)
    expect(fs.readdirSync(electronState.userData).some((name) => name.includes('.corrupt-'))).toBe(true)
  })

  it('ignores polluted __proto__ entries in the key file', () => {
    fs.writeFileSync(keysFile(), `{"__proto__":"x","TranslateApp:openai":"${encode('sk-ok')}"}`, 'utf-8')
    expect(getStoredApiKey('openai')).toBe('sk-ok')
    expect(hasStoredApiKey('__proto__')).toBe(false)
  })

  it('reads legacy un-namespaced entries and migrates them on save', () => {
    fs.writeFileSync(keysFile(), JSON.stringify({ openai: encode('sk-old') }), 'utf-8')
    expect(getStoredApiKey('openai')).toBe('sk-old')
    setStoredApiKey('openai', 'sk-new')
    const stored = JSON.parse(fs.readFileSync(keysFile(), 'utf-8')) as Record<string, string>
    expect(Object.keys(stored)).toEqual(['TranslateApp:openai'])
  })

  it('deletes stored keys', () => {
    setStoredApiKey('openai', 'sk-one')
    expect(deleteStoredApiKey('openai')).toBe(true)
    expect(hasStoredApiKey('openai')).toBe(false)
    expect(deleteStoredApiKey('openai')).toBe(false)
  })

  it('treats encryption as unavailable when safeStorage reports it so', () => {
    electronState.encryptionAvailable = false
    expect(() => setStoredApiKey('openai', 'sk-one')).toThrow('Encryption not available')
  })

  it('treats the Linux basic_text backend as unavailable encryption', () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'linux' })
    try {
      electronState.backend = 'gnome_libsecret'
      setStoredApiKey('openai', 'sk-one')
      expect(getStoredApiKey('openai')).toBe('sk-one')

      electronState.backend = 'basic_text'
      expect(() => setStoredApiKey('claude', 'sk-two')).toThrow('Encryption not available')
      expect(getStoredApiKey('openai')).toBeNull()
      // The UI must not report a key as configured when it cannot be used
      expect(hasStoredApiKey('openai')).toBe(false)

      electronState.backend = 'gnome_libsecret'
      expect(hasStoredApiKey('openai')).toBe(true)
    } finally {
      if (platform) Object.defineProperty(process, 'platform', platform)
    }
  })
})

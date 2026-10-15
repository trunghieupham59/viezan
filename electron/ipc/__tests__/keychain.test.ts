// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const storageMocks = vi.hoisted(() => ({
  deleteStoredApiKey: vi.fn(),
  getStoredApiKey: vi.fn(),
  hasStoredApiKey: vi.fn(),
  setStoredApiKey: vi.fn(),
}))

vi.mock('electron', () => ({}))
vi.mock('../storage', () => storageMocks)

import { maskApiKey, registerKeychainHandlers } from '../keychain'

type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>

function setup(getMainWindow?: () => unknown) {
  const handlers: Record<string, Handler> = {}
  const ipc = { handle: (channel: string, handler: Handler) => { handlers[channel] = handler } }
  registerKeychainHandlers(ipc as never, getMainWindow as never)
  return handlers
}

describe('maskApiKey', () => {
  it('never reveals key material for short keys', () => {
    for (const key of ['a', 'abcd', 'sk-1234567', 'x'.repeat(19)]) {
      const masked = maskApiKey(key)
      expect(masked).toMatch(/^•+$/)
      expect(masked).toHaveLength(12)
    }
  })

  it('reveals at most the last 4 characters for keys of 20+ characters', () => {
    const key = `sk-ant-${'a'.repeat(30)}WXYZ`
    const masked = maskApiKey(key)
    expect(masked).toBe(`${'•'.repeat(12)}WXYZ`)
    expect(masked).not.toContain('sk-a')
    expect(maskApiKey('x'.repeat(20))).toBe(`${'•'.repeat(12)}xxxx`)
  })
})

describe('keychain handlers', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('keychain:get keeps the {exists, masked} shape without leaking a prefix', async () => {
    storageMocks.getStoredApiKey.mockReturnValue('sk-secret-short')
    const handlers = setup()
    const result = await handlers['keychain:get']({}, 'openai') as { exists: boolean; masked: string }
    expect(result.exists).toBe(true)
    expect(result.masked).toBe('•'.repeat(12))
  })

  it('keychain:get reports a missing key', async () => {
    storageMocks.getStoredApiKey.mockReturnValue(null)
    const handlers = setup()
    expect(await handlers['keychain:get']({}, 'openai')).toEqual({ exists: false, masked: null })
  })

  it('does not echo the provider or raw key in save errors', async () => {
    storageMocks.setStoredApiKey.mockImplementation(() => {
      throw new Error('Invalid provider.')
    })
    const handlers = setup()
    expect(await handlers['keychain:save']({}, '__proto__', 'sk-secret')).toEqual({
      success: false,
      error: 'Invalid provider.',
    })
  })

  it('restricts save/get/delete to the main window but leaves hasKey open', async () => {
    const mainContents = { isDestroyed: () => false }
    const handlers = setup(() => ({ isDestroyed: () => false, webContents: mainContents }))
    const stranger = { sender: { isDestroyed: () => false } }
    const trusted = { sender: mainContents }

    expect(await handlers['keychain:save'](stranger, 'openai', 'sk-1')).toEqual({ success: false, error: 'Untrusted sender' })
    expect(await handlers['keychain:delete'](stranger, 'openai')).toEqual({ success: false, error: 'Untrusted sender' })
    expect(await handlers['keychain:get'](stranger, 'openai')).toMatchObject({ exists: false, masked: null })
    expect(storageMocks.setStoredApiKey).not.toHaveBeenCalled()

    storageMocks.hasStoredApiKey.mockReturnValue(true)
    expect(await handlers['keychain:hasKey'](stranger, 'openai')).toEqual({ exists: true })

    expect(await handlers['keychain:save'](trusted, 'openai', 'sk-1')).toEqual({ success: true })
    expect(storageMocks.setStoredApiKey).toHaveBeenCalledWith('openai', 'sk-1')
  })
})

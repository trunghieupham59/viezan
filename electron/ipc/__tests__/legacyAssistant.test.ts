// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const execFileMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  exec: vi.fn(() => {
    throw new Error('exec must not be used')
  }),
  execSync: vi.fn(() => {
    throw new Error('execSync must not be used')
  }),
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
  }
})

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/viezan-test',
  },
}))

import * as fs from 'node:fs'
import {
  buildAssistantScript,
  buildBookmarklet,
  buildChromeLikeAppleScript,
  buildSafariAppleScript,
  initLegacyAssistant,
  sanitizeLegacyAssistantSettings,
  setLocalServerAccessors,
} from '../legacyAssistant'

const TOKEN = `sk-vie-${'a'.repeat(64)}`

function unescapeAppleScriptPayload(appleScript: string, marker: string, suffix = ''): string {
  const start = appleScript.indexOf(marker) + marker.length
  const end = suffix ? appleScript.lastIndexOf(suffix) : appleScript.length - 1
  return appleScript.slice(start, end).replace(/\\(["\\])/g, '$1')
}

describe('legacyAssistant bookmarklet hardening', () => {
  it('renders translated output as text and sends a tokenized CORS preflight URL', () => {
    const bookmarklet = buildBookmarklet(TOKEN, 39875, 'vi')
    const script = decodeURIComponent(bookmarklet.replace(/^javascript:/, ''))

    expect(script).toContain('corsToken=')
    expect(script).toContain('createTextNode(text)')
    expect(script).toContain('textContent=msg')
    expect(script).not.toContain('innerHTML=msg')
    expect(script).not.toContain('MSG.header+d.translatedText')
  })
})

describe('legacyAssistant generated script syntax', () => {
  it('has no line comments that whitespace collapsing could turn into a truncated script', () => {
    expect(buildAssistantScript(TOKEN, 39875, 'vi')).not.toMatch(/(^|[^:'"])\/\//m)
  })

  it('bookmarklet payload parses as JavaScript (syntax check only)', () => {
    const bookmarklet = buildBookmarklet(TOKEN, 39875, 'vi')
    const script = decodeURIComponent(bookmarklet.replace(/^javascript:/, ''))
    expect(script).not.toContain('\n')
    expect(() => new Function(script)).not.toThrow()
  })

  it('AppleScript payloads parse as JavaScript after unescaping (syntax check only)', () => {
    const script = buildAssistantScript(TOKEN, 39875, 'vi')
    const chrome = buildChromeLikeAppleScript('Google Chrome', script)
    const safari = buildSafariAppleScript(script)

    const chromeJs = unescapeAppleScriptPayload(chrome, `active tab javascript "`)
    const safariJs = unescapeAppleScriptPayload(safari, `do JavaScript "`, `" in current tab`)
    expect(() => new Function(chromeJs)).not.toThrow()
    expect(() => new Function(safariJs)).not.toThrow()
    expect(chromeJs).toBe(script.replace(/\s+/g, ' '))
    expect(chrome).toContain(`front window's active tab javascript`)
  })
})

describe('legacyAssistant settings validation', () => {
  it('whitelists known fields and drops invalid values', () => {
    expect(sanitizeLegacyAssistantSettings({ enabled: true, targetLang: 'ja', evil: 1 })).toEqual({
      enabled: true,
      targetLang: 'ja',
    })
    expect(sanitizeLegacyAssistantSettings({ enabled: 'yes', targetLang: "en'; rm -rf ~; '" })).toEqual({
      enabled: false,
      targetLang: 'en',
    })
    expect(sanitizeLegacyAssistantSettings('nope')).toEqual({ enabled: false, targetLang: 'en' })
  })
})

describe('legacyAssistant IPC and osascript execution', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const originalPlatform = process.platform

  beforeEach(() => {
    handlers.clear()
    execFileMock.mockReset()
    vi.mocked(fs.existsSync).mockReturnValue(false)
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    setLocalServerAccessors(() => TOKEN, () => 39875)
    initLegacyAssistant({
      handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
        handlers.set(channel, fn)
      },
    } as unknown as Electron.IpcMain)
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
    vi.restoreAllMocks()
  })

  it('rejects a malicious targetLang and invalid enabled flag without persisting', async () => {
    const update = handlers.get('legacyAssistant:update')!
    const bad = await update({}, { targetLang: `en'; touch /tmp/pwned; '` })
    expect(bad).toMatchObject({ success: false, errorCode: 'INVALID_INPUT' })
    expect(await update({}, { enabled: 'true' })).toMatchObject({ success: false, errorCode: 'INVALID_INPUT' })
    expect(await update({}, null)).toMatchObject({ success: false, errorCode: 'INVALID_INPUT' })
    expect(fs.writeFileSync).not.toHaveBeenCalled()
    expect(await handlers.get('legacyAssistant:get')!()).toMatchObject({
      settings: { enabled: false, targetLang: 'en' },
    })
  })

  it('accepts a valid patch and ignores unknown fields', async () => {
    const update = handlers.get('legacyAssistant:update')!
    const result = (await update({}, { targetLang: 'vi', extra: 'x' })) as { success: boolean; settings: Record<string, unknown> }
    expect(result.success).toBe(true)
    expect(result.settings).toEqual({ enabled: false, targetLang: 'vi' })
    // Disable again so no loop timer leaks into other tests
    await update({}, { enabled: false })
  })

  it('recovers when execFile throws synchronously: no stuck rejected guard, lookup retried next time', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const frontmostCalls = () =>
      execFileMock.mock.calls.filter(([, args]) => (args as string[])[1].includes('System Events')).length
    execFileMock.mockImplementation(() => {
      throw new Error('spawn EINVAL')
    })

    const update = handlers.get('legacyAssistant:update')!
    await update({}, { enabled: true, targetLang: 'vi' })
    const injectNow = handlers.get('legacyAssistant:injectNow')!
    await expect(Promise.resolve(injectNow())).resolves.not.toThrow()
    const afterFirst = frontmostCalls()
    expect(afterFirst).toBeGreaterThan(0)

    // The guard was reset: a second attempt performs a fresh lookup instead of
    // re-awaiting a rejected promise forever.
    await expect(Promise.resolve(injectNow())).resolves.not.toThrow()
    expect(frontmostCalls()).toBeGreaterThan(afterFirst)
    await update({}, { enabled: false })
  })

  it('injects through execFile with an argv array (no shell) and logs failures without the token', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    execFileMock.mockImplementation((_file: string, args: string[], _opts: unknown, cb: (e: Error | null, out?: string) => void) => {
      if (args[1].includes('System Events')) cb(null, 'Google Chrome\n')
      else cb(Object.assign(new Error(`Command failed: osascript ${args[1]}`), { code: 1 }))
    })

    const update = handlers.get('legacyAssistant:update')!
    await update({}, { enabled: true, targetLang: 'vi' })
    await handlers.get('legacyAssistant:injectNow')!()
    await update({}, { enabled: false })

    const injectCall = execFileMock.mock.calls.find(([, args]) => (args as string[])[1].includes('active tab javascript'))
    expect(injectCall).toBeTruthy()
    const [file, args, opts] = injectCall as [string, string[], { timeout: number }]
    expect(file).toBe('osascript')
    expect(Array.isArray(args)).toBe(true)
    expect(args[0]).toBe('-e')
    expect(opts.timeout).toBeGreaterThan(0)
    expect(warn).toHaveBeenCalled()
    expect(warn.mock.calls.flat().join(' ')).not.toContain(TOKEN)
  })
})

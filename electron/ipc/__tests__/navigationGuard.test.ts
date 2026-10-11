// @vitest-environment node
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { createWindowOpenHandler, isAllowedAppNavigation, isAllowedPermission } from '../navigationGuard'
import { isSenderWindow, isTrustedSender } from '../senderGuard'

const distDir = path.resolve('/opt/viezan/dist')
const prod = { isDev: false, distDir }
const dev = { isDev: true, distDir }

describe('isAllowedAppNavigation', () => {
  it('allows files inside the dist directory', () => {
    expect(isAllowedAppNavigation(pathToFileURL(path.join(distDir, 'index.html')).href, prod)).toBe(true)
    expect(isAllowedAppNavigation(`${pathToFileURL(path.join(distDir, 'quick-chat.html')).href}#/chat`, prod)).toBe(true)
  })

  it('rejects other local files, including sibling directories with the same prefix', () => {
    expect(isAllowedAppNavigation(pathToFileURL(path.resolve('/etc/passwd')).href, prod)).toBe(false)
    expect(isAllowedAppNavigation(pathToFileURL(path.resolve('/opt/viezan/dist-evil/index.html')).href, prod)).toBe(false)
    expect(isAllowedAppNavigation(pathToFileURL(path.resolve('/opt/viezan/dist/../secret.html')).href, prod)).toBe(false)
  })

  it('rejects remote URLs and the dev origin in production', () => {
    expect(isAllowedAppNavigation('https://evil.example.com/', prod)).toBe(false)
    expect(isAllowedAppNavigation('http://localhost:5173/', prod)).toBe(false)
  })

  it('allows only the exact dev origin in development', () => {
    expect(isAllowedAppNavigation('http://localhost:5173/quick-chat.html', dev)).toBe(true)
    expect(isAllowedAppNavigation('http://localhost:5173.evil.com/', dev)).toBe(false)
    expect(isAllowedAppNavigation('http://localhost:5174/', dev)).toBe(false)
    expect(isAllowedAppNavigation('https://localhost:5173/', dev)).toBe(false)
  })

  it('fails closed on malformed or non-string input', () => {
    expect(isAllowedAppNavigation('not a url', prod)).toBe(false)
    expect(isAllowedAppNavigation('', prod)).toBe(false)
    expect(isAllowedAppNavigation(undefined, prod)).toBe(false)
    expect(isAllowedAppNavigation('javascript:alert(1)', prod)).toBe(false)
    expect(isAllowedAppNavigation('data:text/html,hi', prod)).toBe(false)
  })

  it('allows only about:blank among about: URLs', () => {
    expect(isAllowedAppNavigation('about:blank', prod)).toBe(true)
    expect(isAllowedAppNavigation('about:srcdoc', prod)).toBe(false)
  })
})

describe('isAllowedPermission', () => {
  it('allows capture and sanitized clipboard writes', () => {
    expect(isAllowedPermission('media')).toBe(true)
    expect(isAllowedPermission('display-capture')).toBe(true)
    expect(isAllowedPermission('clipboard-sanitized-write')).toBe(true)
  })

  it('denies everything else', () => {
    for (const permission of ['notifications', 'geolocation', 'clipboard-read', 'midi', 'openExternal', 'fullscreen', 'unknown']) {
      expect(isAllowedPermission(permission), permission).toBe(false)
    }
  })
})

describe('senderGuard', () => {
  const contents = { isDestroyed: () => false }

  it('matches only the allowed live webContents', () => {
    expect(isTrustedSender({ sender: contents } as never, [contents as never])).toBe(true)
    expect(isTrustedSender({ sender: { isDestroyed: () => false } } as never, [contents as never])).toBe(false)
    expect(isTrustedSender({ sender: contents } as never, [null, undefined])).toBe(false)
    expect(isTrustedSender({ sender: contents } as never, [{ isDestroyed: () => true } as never])).toBe(false)
    expect(isTrustedSender({} as never, [contents as never])).toBe(false)
  })

  it('isSenderWindow checks the window webContents and ignores destroyed windows', () => {
    const win = { isDestroyed: () => false, webContents: contents }
    expect(isSenderWindow({ sender: contents } as never, () => win as never)).toBe(true)
    expect(isSenderWindow({ sender: contents } as never, () => null)).toBe(false)
    expect(isSenderWindow({ sender: contents } as never, () => ({ ...win, isDestroyed: () => true }) as never)).toBe(false)
  })
})

describe('createWindowOpenHandler', () => {
  it('always denies child windows and opens allowed http(s) URLs externally', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined)
    const handler = createWindowOpenHandler(openExternal)

    expect(handler({ url: 'https://github.com/trunghieupham59/viezan/releases' })).toEqual({ action: 'deny' })
    await vi.waitFor(() => expect(openExternal).toHaveBeenCalledWith('https://github.com/trunghieupham59/viezan/releases'))
  })

  it('does not open blocked, private, non-web or malformed URLs', () => {
    const openExternal = vi.fn()
    const handler = createWindowOpenHandler(openExternal)

    for (const url of ['http://127.0.0.1/', 'file:///etc/passwd', 'javascript:alert(1)', 'not a url', '']) {
      expect(handler({ url })).toEqual({ action: 'deny' })
    }
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('swallows openExternal failures', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const openExternal = vi.fn().mockRejectedValue(new Error('no browser'))
    const handler = createWindowOpenHandler(openExternal)
    expect(handler({ url: 'https://github.com/trunghieupham59/viezan/releases' })).toEqual({ action: 'deny' })
    await vi.waitFor(() => expect(spy).toHaveBeenCalled())
    spy.mockRestore()
  })
})

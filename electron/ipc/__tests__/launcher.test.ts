// @vitest-environment node
import type { BrowserWindow, IpcMain } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerLauncherHandlers } from '../launcher'

const env = vi.hoisted(() => ({
  scan: vi.fn(),
  openPath: vi.fn(),
  openExternal: vi.fn(),
  openWindowsApp: vi.fn(),
  icons: vi.fn(),
}))
vi.mock('electron', () => ({
  app: { getPath: () => '/appData' },
  shell: { openPath: env.openPath, openExternal: env.openExternal, readShortcutLink: vi.fn() },
}))
vi.mock('../../services/launcherApps', () => ({ scanLauncherApps: env.scan }))
vi.mock('../../services/launcherSystemApps', () => ({ openWindowsLauncherApp: env.openWindowsApp }))
vi.mock('../../services/launcherIcons', () => ({ readLauncherIcons: env.icons }))
vi.mock('node:fs/promises', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
  stat: vi.fn().mockRejectedValue(new Error('Missing test file')),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
}))

const id = 'a'.repeat(64)
const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
const mainFrame = {}
const contents = { isDestroyed: () => false, mainFrame, send: vi.fn() }
const window = { isDestroyed: () => false, webContents: contents, hide: vi.fn() }
const event = { sender: contents, senderFrame: mainFrame }
const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()
const invoke = (channel: string, payload?: unknown, sender: unknown = event) => handlers.get(channel)?.(sender, payload)

beforeEach(() => {
  vi.clearAllMocks()
  handlers.clear()
  env.scan.mockResolvedValue([{ id, name: 'Editor', target: { kind: 'path', path: '/Applications/Editor.app' } }])
  env.openPath.mockResolvedValue('')
  env.openExternal.mockResolvedValue(undefined)
  env.openWindowsApp.mockResolvedValue(undefined)
  env.icons.mockResolvedValue([{ id, dataUrl }])
  registerLauncherHandlers({ handle: (name: string, handler: (...args: unknown[]) => Promise<unknown>) => handlers.set(name, handler) } as unknown as IpcMain,
    () => window as unknown as BrowserWindow)
})

describe('launcher IPC boundary', () => {
  it('rejects other windows and subframes before discovering or launching anything', async () => {
    expect(await invoke('launcher:list-apps', undefined, { sender: {}, senderFrame: mainFrame })).toMatchObject({ success: false })
    expect(await invoke('launcher:search-web', 'test', { sender: contents, senderFrame: {} })).toMatchObject({ success: false })
    expect(await invoke('launcher:open-app', id, { sender: {} })).toMatchObject({ success: false })
    expect(env.scan).not.toHaveBeenCalled()
    expect(env.openExternal).not.toHaveBeenCalled()
    expect(env.openPath).not.toHaveBeenCalled()
  })

  it.skipIf(!['win32', 'darwin'].includes(process.platform))('returns opaque IDs, shares catalog loads, and launches only discovered entries', async () => {
    const [first] = await Promise.all([invoke('launcher:list-apps'), invoke('launcher:list-apps')])
    expect(first).toMatchObject({ success: true, apps: [{ id, name: 'Editor' }] })
    expect(env.scan).toHaveBeenCalledTimes(1)
    expect(await invoke('launcher:open-app', id)).toEqual({ success: true })
    expect(env.openPath).toHaveBeenCalledWith('/Applications/Editor.app')
    expect(window.hide).toHaveBeenCalledOnce()
  })

  it('rejects arbitrary paths, malformed IDs and undiscovered entries', async () => {
    for (const input of ['C:\\Windows\\cmd.exe', 'https://example.com', { id }, id]) {
      expect(await invoke('launcher:open-app', input)).toMatchObject({ success: false })
    }
    expect(env.openPath).not.toHaveBeenCalled()
  })

  it.skipIf(!['win32', 'darwin'].includes(process.platform))('loads icons only for catalog IDs, with shared extraction and cached misses', async () => {
    expect(await invoke('launcher:get-icons', [id])).toMatchObject({ errorCode: 'NOT_FOUND' })
    await invoke('launcher:list-apps')
    const [first] = await Promise.all([invoke('launcher:get-icons', [id, id]), invoke('launcher:get-icons', [id])])
    expect(first).toEqual({ success: true, icons: [{ id, dataUrl }] })
    expect(env.icons).toHaveBeenCalledOnce()
    expect(env.icons.mock.calls[0][0]).toHaveLength(1)
    expect(contents.send).toHaveBeenCalledWith('launcher:icons', [{ id, dataUrl }])
    expect(await invoke('launcher:list-apps')).toEqual({ success: true, apps: [{ id, name: 'Editor', iconDataUrl: dataUrl }] })
    for (const invalid of ['C:\\private.png', [id, 'C:\\private.png'], Array(17).fill(id)]) {
      expect(await invoke('launcher:get-icons', invalid)).toMatchObject({ errorCode: 'INVALID' })
    }
    expect(await invoke('launcher:get-icons', [id], { sender: contents, senderFrame: {} })).toMatchObject({ errorCode: 'UNAVAILABLE' })
    expect(env.icons).toHaveBeenCalledOnce()
  })

  it.skipIf(!['win32', 'darwin'].includes(process.platform))('keeps catalog and launch usable if native icon extraction fails', async () => {
    env.icons.mockRejectedValueOnce(new Error('OS extraction unavailable'))
    await invoke('launcher:list-apps')
    expect(await invoke('launcher:get-icons', [id])).toEqual({ success: true, icons: [] })
    expect(await invoke('launcher:get-icons', [id])).toEqual({ success: true, icons: [] })
    expect(env.icons).toHaveBeenCalledOnce()
    expect(await invoke('launcher:open-app', id)).toEqual({ success: true })
  })

  it.skipIf(!['win32', 'darwin'].includes(process.platform))('launches discovered packaged apps without exposing or accepting their App ID in the renderer', async () => {
    env.scan.mockResolvedValue([{ id, name: 'Claude', target: { kind: 'windows-app', appId: 'Claude_package!Claude' } }])
    expect(await invoke('launcher:list-apps')).toMatchObject({ success: true, apps: [{ id, name: 'Claude' }] })
    expect(await invoke('launcher:open-app', 'Claude_package!Claude')).toMatchObject({ success: false })
    expect(await invoke('launcher:open-app', id)).toEqual({ success: true })
    expect(env.openWindowsApp).toHaveBeenCalledExactlyOnceWith('Claude_package!Claude')
    expect(env.openPath).not.toHaveBeenCalled()
    env.openWindowsApp.mockRejectedValueOnce(new Error('OS launch failed'))
    window.hide.mockClear()
    expect(await invoke('launcher:open-app', id)).toMatchObject({ errorCode: 'OPEN_FAILED' })
    expect(window.hide).not.toHaveBeenCalled()
  })

  it('encodes a web query into a fixed HTTPS search endpoint', async () => {
    expect(await invoke('launcher:search-web', ' hello & q=other # 日本語 ')).toEqual({ success: true })
    const url = new URL(env.openExternal.mock.calls[0][0])
    expect(url.origin).toBe('https://www.google.com')
    expect(url.searchParams.get('q')).toBe('hello & q=other # 日本語')
    expect([...url.searchParams.keys()]).toEqual(['q'])
  })

  it('keeps the window available when opening fails and rejects oversized queries', async () => {
    env.openExternal.mockRejectedValueOnce(new Error('OS failure'))
    expect(await invoke('launcher:search-web', 'query')).toMatchObject({ errorCode: 'OPEN_FAILED' })
    for (const query of ['', ' ', null, 'x'.repeat(501)]) {
      expect(await invoke('launcher:search-web', query)).toMatchObject({ errorCode: 'INVALID' })
    }
    expect(window.hide).not.toHaveBeenCalled()
  })
})

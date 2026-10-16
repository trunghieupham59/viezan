// @vitest-environment node
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { PassThrough } from 'node:stream'
import { autoUpdater } from 'electron-updater'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  tmpDir: '',
  openExternal: vi.fn(),
  openPath: vi.fn(),
  fetch: vi.fn(),
  httpsGet: vi.fn(),
  spawn: vi.fn(),
  quit: vi.fn(),
  autoUpdaterHandlers: {} as Record<string, (...args: unknown[]) => void>,
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    getVersion: () => '1.0.0',
    isPackaged: true,
    getPath: (name: string) => (name === 'exe' ? '/Applications/Viezan.app/Contents/MacOS/Viezan' : mocks.tmpDir),
    quit: mocks.quit,
    once: vi.fn(),
  },
  net: { fetch: mocks.fetch },
  shell: { openExternal: mocks.openExternal, openPath: mocks.openPath },
}))

vi.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    logger: null,
    on: (event: string, handler: (...args: unknown[]) => void) => { mocks.autoUpdaterHandlers[event] = handler },
    checkForUpdates: mocks.checkForUpdates,
    downloadUpdate: mocks.downloadUpdate,
    quitAndInstall: mocks.quitAndInstall,
  },
}))

vi.mock('node:https', () => ({ get: mocks.httpsGet }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))

import { parseSha256Digest, registerUpdaterHandlers, sha256DigestsMatch } from '../updater'

type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const RELEASE_URL = 'https://github.com/trunghieupham59/viezan/releases/download/v9.9.9/Viezan-9.9.9-arm64.dmg'

function setPlatform(value: NodeJS.Platform): () => void {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { value })
  return () => {
    if (original) Object.defineProperty(process, 'platform', original)
  }
}

function setup() {
  const handlers: Record<string, Handler> = {}
  const send = vi.fn()
  const mainContents = { send, isDestroyed: () => false }
  const win = { isDestroyed: () => false, webContents: mainContents }
  const ipc = { handle: (channel: string, handler: Handler) => { handlers[channel] = handler } }
  registerUpdaterHandlers(ipc as never, () => win as never)

  const event = { sender: mainContents }
  const call = (channel: string, ...args: unknown[]) => handlers[channel](event, ...args)
  const statuses = () => send.mock.calls.filter((c) => c[0] === 'updater:status').map((c) => c[1] as { type: string })
  return { handlers, call, statuses, event }
}

function releaseResponse(digest?: unknown) {
  return {
    ok: true,
    json: async () => ({
      tag_name: 'v9.9.9',
      html_url: '',
      assets: [{
        name: 'Viezan-9.9.9-arm64.dmg',
        browser_download_url: RELEASE_URL,
        ...(digest === undefined ? {} : { digest }),
      }],
    }),
  }
}

const sha256Hex = (data: string) => createHash('sha256').update(data).digest('hex')

function serveBody(body: string) {
  mocks.httpsGet.mockImplementation((_url: string, _opts: unknown, cb: (res: unknown) => void) => {
    const res = new PassThrough() as PassThrough & { statusCode?: number; headers?: Record<string, string> }
    res.statusCode = 200
    res.headers = {}
    queueMicrotask(() => { cb(res); res.end(body) })
    return { on: vi.fn() }
  })
}

describe('updater handlers', () => {
  let restorePlatform: () => void

  beforeEach(() => {
    vi.resetAllMocks()
    for (const key of Object.keys(mocks.autoUpdaterHandlers)) delete mocks.autoUpdaterHandlers[key]
    mocks.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viezan-updater-'))
    restorePlatform = () => undefined
  })

  afterEach(() => {
    vi.useRealTimers()
    restorePlatform()
    fs.rmSync(mocks.tmpDir, { recursive: true, force: true })
  })

  describe('updater:openDownload', () => {
    it('awaits openExternal and reports success', async () => {
      mocks.openExternal.mockResolvedValue(undefined)
      const { call } = setup()
      expect(await call('updater:openDownload')).toEqual({ success: true })
      expect(mocks.openExternal).toHaveBeenCalledWith('https://github.com/trunghieupham59/viezan/releases/latest')
    })

    it('returns success:false when openExternal fails', async () => {
      mocks.openExternal.mockRejectedValue(new Error('no browser'))
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const { call } = setup()
      expect(await call('updater:openDownload', 'https://example.org.evil.io/')).toEqual({ success: false, error: 'no browser' })
      spy.mockRestore()
    })

    it('blocks private URLs and untrusted senders', async () => {
      const { call, handlers } = setup()
      expect(await call('updater:openDownload', 'http://127.0.0.1/')).toEqual({ success: false, error: 'Blocked external URL' })
      expect(await handlers['updater:openDownload']({ sender: {} })).toEqual({ success: false, error: 'Untrusted sender' })
      expect(mocks.openExternal).not.toHaveBeenCalled()
    })
  })

  describe('Windows/Linux install', () => {
    it('disables automatic download and installation on quit', () => {
      setup()
      expect(autoUpdater.autoDownload).toBe(false)
      expect(autoUpdater.autoInstallOnAppQuit).toBe(false)
      expect(mocks.downloadUpdate).not.toHaveBeenCalled()
      expect(mocks.quitAndInstall).not.toHaveBeenCalled()
    })

    it('shares concurrent checks and preserves a downloaded update during scheduled checks', async () => {
      restorePlatform = setPlatform('win32')
      vi.useFakeTimers()
      let resolve: () => void = () => undefined
      mocks.checkForUpdates.mockImplementation(() => new Promise<void>((done) => { resolve = done }))
      const { call } = setup()
      const first = call('updater:check')
      const second = call('updater:check')
      await vi.advanceTimersByTimeAsync(30_000)
      expect(mocks.checkForUpdates).toHaveBeenCalledTimes(1)
      resolve()
      await Promise.all([first, second])
      mocks.autoUpdaterHandlers['update-available']({ version: '9.9.9' })
      mocks.autoUpdaterHandlers['download-progress']({ percent: 50, bytesPerSecond: 1, transferred: 1, total: 2 })
      expect(await call('updater:getStatus')).toMatchObject({ type: 'downloading', version: '9.9.9' })
      mocks.autoUpdaterHandlers['update-downloaded']({ version: '9.9.9' })
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1_000)
      expect(mocks.checkForUpdates).toHaveBeenCalledTimes(1)
      expect(await call('updater:getStatus')).toMatchObject({ type: 'downloaded', version: '9.9.9' })
      expect(mocks.quitAndInstall).not.toHaveBeenCalled()
    })

    it('recovers a failed startup check on retry and publishes the available update', async () => {
      restorePlatform = setPlatform('win32')
      vi.useFakeTimers()
      mocks.checkForUpdates.mockRejectedValueOnce(new Error('offline'))
        .mockImplementationOnce(async () => {
          mocks.autoUpdaterHandlers['update-available']({ version: '2.2.2' })
        })
      const { call, statuses } = setup()
      await vi.advanceTimersByTimeAsync(30_000)
      expect(mocks.checkForUpdates).toHaveBeenCalledTimes(1)
      expect(await call('updater:getStatus')).toBeNull()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(mocks.checkForUpdates).toHaveBeenCalledTimes(2)
      expect(statuses()[statuses().length - 1]).toMatchObject({ type: 'available', version: '2.2.2', background: true })
      expect(await call('updater:getStatus')).toMatchObject({ type: 'available', version: '2.2.2' })
      expect(mocks.downloadUpdate).not.toHaveBeenCalled()
      expect(mocks.quitAndInstall).not.toHaveBeenCalled()
    })

    it('marks background errors and protects the status snapshot from untrusted senders', async () => {
      restorePlatform = setPlatform('win32')
      vi.useFakeTimers()
      mocks.checkForUpdates.mockRejectedValue(new Error('offline'))
      const { call, handlers, statuses } = setup()
      mocks.autoUpdaterHandlers['update-available']({ version: '9.9.9' })
      await vi.advanceTimersByTimeAsync(30_000)
      expect(statuses()[statuses().length - 1]).toMatchObject({ type: 'error', background: true })
      expect(await call('updater:getStatus')).toMatchObject({ type: 'available', version: '9.9.9' })
      expect(await handlers['updater:getStatus']({ sender: {} })).toBeNull()
    })

    it('runs the installer silently and relaunches the app', async () => {
      restorePlatform = setPlatform('win32')
      const { call } = setup()

      expect(await call('updater:install')).toEqual({ success: true })
      expect(mocks.quitAndInstall).toHaveBeenCalledTimes(1)
      expect(mocks.quitAndInstall).toHaveBeenCalledWith(true, true)
    })
  })

  describe('Windows/Linux error reporting', () => {
    beforeEach(() => {
      restorePlatform = setPlatform('linux')
    })

    it('reports a missing latest.yml once, as not-available', async () => {
      const error = new Error('Cannot find latest.yml in the latest release artifacts: HttpError: 404')
      mocks.checkForUpdates.mockImplementation(async () => {
        mocks.autoUpdaterHandlers.error(error)
        throw error
      })
      const { call, statuses } = setup()

      expect(await call('updater:check')).toEqual({ success: true })
      expect(statuses().map((s) => s.type)).toEqual(['not-available'])
    })

    it('reports other HttpErrors once, as error, never as not-available', async () => {
      const error = new Error('HttpError: 404 Not Found while downloading https://example.com/Viezan.exe')
      mocks.checkForUpdates.mockImplementation(async () => {
        mocks.autoUpdaterHandlers.error(error)
        throw error
      })
      const { call, statuses } = setup()

      expect(await call('updater:check')).toMatchObject({ success: false })
      expect(statuses().map((s) => s.type)).toEqual(['error'])
    })

    it('does not duplicate error status from the download catch path', async () => {
      const error = new Error('disk full')
      mocks.downloadUpdate.mockImplementation(async () => {
        mocks.autoUpdaterHandlers.error(error)
        throw error
      })
      const { call, statuses } = setup()

      expect(await call('updater:download')).toEqual({ success: false, error: 'disk full' })
      expect(statuses().map((s) => s.type)).toEqual(['error'])
    })

    it('reports an error from the catch path when no event fired', async () => {
      mocks.downloadUpdate.mockRejectedValue(new Error('network'))
      const { call, statuses } = setup()
      await call('updater:download')
      expect(statuses().map((s) => s.type)).toEqual(['error'])
    })
  })

  describe('macOS download', () => {
    beforeEach(() => {
      restorePlatform = setPlatform('darwin')
      mocks.fetch.mockResolvedValue(releaseResponse())
    })

    it('shares one in-flight download between concurrent calls', async () => {
      let respond: ((res: unknown) => void) | undefined
      mocks.httpsGet.mockImplementation((_url: string, _opts: unknown, cb: (res: unknown) => void) => {
        respond = cb
        return { on: vi.fn() }
      })
      const { call } = setup()

      const first = call('updater:download')
      const second = call('updater:download')
      await vi.waitFor(() => expect(respond).toBeDefined())
      expect(mocks.httpsGet).toHaveBeenCalledTimes(1)

      const body = new PassThrough() as PassThrough & { statusCode?: number; headers?: Record<string, string> }
      body.statusCode = 200
      body.headers = { 'content-length': '4' }
      respond?.(body)
      body.end('data')

      const [a, b] = await Promise.all([first, second])
      expect(a).toMatchObject({ success: true })
      expect(b).toBe(a)
      expect(mocks.httpsGet).toHaveBeenCalledTimes(1)

      // The guard is released afterwards
      mocks.httpsGet.mockImplementation((_url: string, _opts: unknown, cb: (res: unknown) => void) => {
        const res = new PassThrough() as PassThrough & { statusCode?: number; headers?: Record<string, string> }
        res.statusCode = 200
        res.headers = {}
        queueMicrotask(() => { cb(res); res.end('x') })
        return { on: vi.fn() }
      })
      expect(await call('updater:download')).toMatchObject({ success: true })
      expect(mocks.httpsGet).toHaveBeenCalledTimes(2)
    })

    it('refuses redirects to non-GitHub or non-https hosts', async () => {
      mocks.httpsGet.mockImplementation((_url: string, _opts: unknown, cb: (res: unknown) => void) => {
        const res = new PassThrough() as PassThrough & { statusCode?: number; headers?: Record<string, string> }
        res.statusCode = 302
        res.headers = { location: 'https://evil.example.net/Viezan.dmg' }
        queueMicrotask(() => cb(res))
        return { on: vi.fn() }
      })
      const { call } = setup()
      const result = await call('updater:download') as { success: boolean; error?: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('untrusted')
      expect(mocks.httpsGet).toHaveBeenCalledTimes(1)
    })
  })

  describe('macOS download integrity', () => {
    const BODY = 'dmg-bytes'
    const downloadedFile = () => path.join(mocks.tmpDir, 'Viezan-9.9.9-arm64.dmg')

    beforeEach(() => {
      restorePlatform = setPlatform('darwin')
      serveBody(BODY)
    })

    it('marks the download verified when the SHA-256 matches (case-insensitive)', async () => {
      mocks.fetch.mockResolvedValue(releaseResponse(`sha256:${sha256Hex(BODY).toUpperCase()}`))
      const { call } = setup()
      const result = await call('updater:download')
      expect(result).toEqual({ success: true, filePath: downloadedFile(), verified: true })
      expect(fs.readFileSync(downloadedFile(), 'utf8')).toBe(BODY)
    })

    it('deletes the file and returns CHECKSUM_MISMATCH on a digest mismatch, never installable', async () => {
      mocks.fetch.mockResolvedValue(releaseResponse(`sha256:${sha256Hex('something else')}`))
      const { call, statuses } = setup()
      const result = await call('updater:download') as { success: boolean; errorCode?: string; error?: string; filePath?: string }
      expect(result.success).toBe(false)
      expect(result.errorCode).toBe('CHECKSUM_MISMATCH')
      expect(result.error).toContain('SHA-256')
      expect(result.filePath).toBeUndefined()
      expect(fs.existsSync(downloadedFile())).toBe(false)
      expect(statuses().map((s) => s.type)).not.toContain('downloaded')

      expect(await call('updater:install')).toEqual({ success: false, error: 'No downloaded installer found' })
      expect(await call('updater:openInstaller')).toEqual({ success: false, error: 'No downloaded installer found' })
      expect(mocks.spawn).not.toHaveBeenCalled()
      expect(mocks.openPath).not.toHaveBeenCalled()
    })

    it('proceeds with verified:false and a warning when no digest is published', async () => {
      mocks.fetch.mockResolvedValue(releaseResponse())
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const { call } = setup()
      expect(await call('updater:download')).toEqual({ success: true, filePath: downloadedFile(), verified: false })
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('unverified'))
      warn.mockRestore()
    })

    it.each([
      ['wrong algorithm', `sha512:${'a'.repeat(64)}`],
      ['short hash', `sha256:${'a'.repeat(63)}`],
      ['non-hex hash', `sha256:${'z'.repeat(64)}`],
      ['not a string', 12345],
      ['null', null],
    ])('ignores a malformed digest (%s) and treats the asset as unverified', async (_label, digest) => {
      mocks.fetch.mockResolvedValue(releaseResponse(digest))
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const { call } = setup()
      expect(await call('updater:download')).toMatchObject({ success: true, verified: false })
      warn.mockRestore()
    })

    it('parses and compares digests defensively', () => {
      const hex = sha256Hex(BODY)
      expect(parseSha256Digest(`sha256:${hex.toUpperCase()}`)).toBe(hex)
      expect(parseSha256Digest(`sha256:${hex}0`)).toBeNull()
      expect(parseSha256Digest(undefined)).toBeNull()
      expect(sha256DigestsMatch(hex, hex.toUpperCase())).toBe(true)
      expect(sha256DigestsMatch(hex, sha256Hex('other'))).toBe(false)
      expect(sha256DigestsMatch(hex, 'abc')).toBe(false)
    })

    it('refuses to install a path that this session did not download', async () => {
      mocks.fetch.mockResolvedValue(releaseResponse(`sha256:${sha256Hex(BODY)}`))
      const { call } = setup()
      expect(await call('updater:download')).toMatchObject({ success: true, verified: true })

      expect(await call('updater:install', '/tmp/evil.dmg')).toEqual({
        success: false,
        error: 'Installer path does not match the update downloaded in this session',
      })
      expect(mocks.spawn).not.toHaveBeenCalled()
      expect(mocks.quit).not.toHaveBeenCalled()
    })

    it('refuses to install when the downloaded file was replaced after verification', async () => {
      mocks.fetch.mockResolvedValue(releaseResponse(`sha256:${sha256Hex(BODY)}`))
      const { call } = setup()
      expect(await call('updater:download')).toMatchObject({ success: true, verified: true })

      fs.writeFileSync(downloadedFile(), 'tampered-bytes')
      const result = await call('updater:install') as { success: boolean; error?: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('modified')
      expect(mocks.spawn).not.toHaveBeenCalled()
      expect(fs.existsSync(downloadedFile())).toBe(false)
      expect(await call('updater:install')).toEqual({ success: false, error: 'No downloaded installer found' })
    })

    it('drops the previous installer record when a new download fails verification', async () => {
      const { call } = setup()
      mocks.fetch.mockResolvedValue(releaseResponse(`sha256:${sha256Hex(BODY)}`))
      expect(await call('updater:download')).toMatchObject({ success: true })

      mocks.fetch.mockResolvedValue(releaseResponse(`sha256:${sha256Hex('different')}`))
      expect(await call('updater:download')).toMatchObject({ success: false, errorCode: 'CHECKSUM_MISMATCH' })
      expect(await call('updater:install')).toEqual({ success: false, error: 'No downloaded installer found' })
    })
  })

  describe('macOS install', () => {
    beforeEach(() => {
      restorePlatform = setPlatform('darwin')
    })

    async function downloadFirst(call: ReturnType<typeof setup>['call']) {
      mocks.fetch.mockResolvedValue(releaseResponse())
      mocks.httpsGet.mockImplementation((_url: string, _opts: unknown, cb: (res: unknown) => void) => {
        const res = new PassThrough() as PassThrough & { statusCode?: number; headers?: Record<string, string> }
        res.statusCode = 200
        res.headers = {}
        queueMicrotask(() => { cb(res); res.end('x') })
        return { on: vi.fn() }
      })
      expect(await call('updater:download')).toMatchObject({ success: true })
    }

    it('returns success:false and does not quit when the helper fails to spawn', async () => {
      const { call, statuses } = setup()
      await downloadFirst(call)

      const child = { once: vi.fn(), unref: vi.fn() }
      child.once.mockImplementation((event: string, cb: (err?: Error) => void) => {
        if (event === 'error') queueMicrotask(() => cb(new Error('spawn ENOENT')))
        return child
      })
      mocks.spawn.mockReturnValue(child)

      expect(await call('updater:install')).toEqual({ success: false, error: 'spawn ENOENT' })
      expect(mocks.quit).not.toHaveBeenCalled()
      expect(statuses()[statuses().length - 1]).toMatchObject({ type: 'error' })
    })

    it('quits only after the helper spawned, targeting the running bundle', async () => {
      const { call } = setup()
      await downloadFirst(call)

      const child = { once: vi.fn(), unref: vi.fn() }
      child.once.mockImplementation((event: string, cb: () => void) => {
        if (event === 'spawn') queueMicrotask(cb)
        return child
      })
      mocks.spawn.mockReturnValue(child)

      expect(await call('updater:install')).toEqual({ success: true })
      expect(mocks.spawn).toHaveBeenCalledTimes(1)
      const args = mocks.spawn.mock.calls[0][1] as string[]
      expect(args[3]).toBe('/Applications/Viezan.app')
      expect(child.unref).toHaveBeenCalled()
      expect(mocks.quit).toHaveBeenCalledTimes(1)
    })
  })
})

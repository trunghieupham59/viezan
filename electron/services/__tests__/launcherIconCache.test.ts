// @vitest-environment node
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LauncherIcon } from '../../../shared/launcher'
import type { IndexedLauncherApp } from '../launcherApps'
import { LauncherIconCache } from '../launcherIconCache'

vi.mock('../launcherIcons', () => ({ readLauncherIcons: vi.fn() }))

const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
const appEntry = (name: string): IndexedLauncherApp => ({
  id: createHash('sha256').update(name).digest('hex'), name,
  target: { kind: 'windows-app', appId: `${name}_package!App` },
})
const apps = ['Claude', 'Chrome', 'Visual Studio Code'].map(appEntry)
let directory: string
let file: string
const caches: LauncherIconCache[] = []
const extract = vi.fn(async (entries: IndexedLauncherApp[]) => entries.map(({ id }) => ({ id, dataUrl })))
const makeCache = (onIcons?: (icons: LauncherIcon[]) => void) => {
  const cache = new LauncherIconCache({ file, platform: 'win32', extract, onIcons })
  caches.push(cache)
  return cache
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'viezan-launcher-icons-'))
  file = path.join(directory, 'icons.json')
  extract.mockClear()
  extract.mockImplementation(async entries => entries.map(({ id }) => ({ id, dataUrl })))
})
afterEach(async () => {
  for (const cache of caches.splice(0)) await cache.flush()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

describe('launcher icon cache', () => {
  it('prefetches before any query, shares concurrent reads, and preserves hits through catalog refresh and restart', async () => {
    const notify = vi.fn()
    const cache = makeCache(notify)
    await cache.updateCatalog(apps)
    cache.warm()
    await Promise.all(apps.map(app => cache.get([app.id])))
    await cache.flush()
    expect(extract).toHaveBeenCalledOnce()
    expect(notify).toHaveBeenCalledWith(expect.arrayContaining(apps.map(({ id }) => ({ id, dataUrl }))))
    await cache.updateCatalog([...apps])
    expect(cache.peek(apps[2].id)).toBe(dataUrl)
    await cache.get(apps.map(app => app.id))
    await cache.flush()

    const restarted = makeCache()
    await restarted.updateCatalog(apps)
    expect(apps.map(app => restarted.peek(app.id))).toEqual(apps.map(() => dataUrl))
    restarted.warm()
    await restarted.flush()
    expect(extract).toHaveBeenCalledOnce()
    expect(await readFile(file, 'utf8')).not.toContain('_package!')
  })

  it('invalidates an updated executable and drops removed apps without losing unchanged icons', async () => {
    const executable = path.join(directory, 'chrome.exe')
    await writeFile(executable, 'version one')
    const chrome = { ...apps[1], iconSourcePath: executable }
    const cache = makeCache()
    await cache.updateCatalog([apps[0], chrome])
    await cache.get([apps[0].id, chrome.id])
    await writeFile(executable, 'a larger version two')
    await cache.updateCatalog([chrome])
    expect(cache.peek(apps[0].id)).toBeUndefined()
    expect(cache.peek(chrome.id)).toBeUndefined()
    await cache.get([chrome.id])
    expect(extract).toHaveBeenCalledTimes(2)
    await cache.flush()
    const restarted = makeCache()
    await restarted.updateCatalog([chrome])
    expect(restarted.peek(chrome.id)).toBe(dataUrl)
  })

  it('serves warm hits without waiting for a slow cold batch and prioritizes requested apps in the next batch', async () => {
    const cache = makeCache()
    await cache.updateCatalog(apps)
    await cache.get([apps[0].id])
    let finish!: (icons: LauncherIcon[]) => void
    extract.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const coldApps = Array.from({ length: 40 }, (_, index) => appEntry(`Other ${index}`))
    await cache.updateCatalog([...apps, ...coldApps])
    cache.warm()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    expect(await cache.get([apps[0].id])).toEqual([{ id: apps[0].id, dataUrl }])
    const wanted = coldApps[39]
    const requested = cache.get([wanted.id])
    finish([])
    await requested
    expect(extract.mock.calls[2][0][0].id).toBe(wanted.id)
    await cache.flush()
    expect(extract.mock.calls.every(([batch]) => batch.length <= 16)).toBe(true)
  })

  it('ignores extraction results from a removed or replaced catalog entry', async () => {
    let finish!: (icons: LauncherIcon[]) => void
    extract.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const notify = vi.fn()
    const cache = makeCache(notify)
    await cache.updateCatalog([apps[0]])
    const loading = cache.get([apps[0].id])
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    await cache.updateCatalog([])
    finish([{ id: apps[0].id, dataUrl }])
    expect(await loading).toEqual([])
    expect(notify).not.toHaveBeenCalled()
  })

  it('refreshes aged icons in the background while keeping them available, including on OS failure', async () => {
    const cache = makeCache()
    await cache.updateCatalog(apps)
    await cache.get([apps[0].id])
    const future = Date.now() + 25 * 60 * 60 * 1000
    vi.spyOn(Date, 'now').mockReturnValue(future)
    extract.mockRejectedValueOnce(new Error('OS busy'))
    expect(await cache.get([apps[0].id])).toEqual([{ id: apps[0].id, dataUrl }])
    await cache.flush()
    expect(cache.peek(apps[0].id)).toBe(dataUrl)
    expect(extract).toHaveBeenCalledTimes(2)
  })

  it('caches failures briefly and retries later without blocking app discovery', async () => {
    extract.mockRejectedValueOnce(new Error('OS busy'))
    const cache = makeCache()
    await cache.updateCatalog(apps)
    expect(await cache.get([apps[0].id])).toEqual([])
    expect(await cache.get([apps[0].id])).toEqual([])
    expect(extract).toHaveBeenCalledOnce()
    const future = Date.now() + 6 * 60 * 1000
    vi.spyOn(Date, 'now').mockReturnValue(future)
    expect(await cache.get([apps[0].id])).toEqual([{ id: apps[0].id, dataUrl }])
    expect(extract).toHaveBeenCalledTimes(2)
  })

  it.each(['not json', '{"version":99,"icons":[]}', '{"version":1,"icons":[null,{"id":"bad","dataUrl":"https://example.com"}]}'])(
    'recovers from an invalid disk cache: %s', async content => {
      await writeFile(file, content)
      const cache = makeCache()
      await cache.updateCatalog(apps)
      expect(await cache.get([apps[0].id])).toEqual([{ id: apps[0].id, dataUrl }])
    },
  )

  it('retains memory icons when the disk cache is unwritable or the popup closes', async () => {
    file = path.join(directory, 'not-a-directory', 'icons.json')
    await writeFile(path.dirname(file), 'file')
    const cache = makeCache(() => { throw new Error('Window closed') })
    await cache.updateCatalog(apps)
    expect(await cache.get([apps[0].id])).toEqual([{ id: apps[0].id, dataUrl }])
    await cache.flush()
    expect(cache.peek(apps[0].id)).toBe(dataUrl)
  })
})

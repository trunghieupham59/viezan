import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow, type IpcMain, shell } from 'electron'
import type { LauncherResult } from '../../shared/launcher'
import { CurrencyRateStore, convertWithSnapshot, parseCurrencyConversionRequest } from '../services/currencyRates'
import { type IndexedLauncherApp, scanLauncherApps } from '../services/launcherApps'
import { LauncherFileIndex, MAX_FILE_QUERY_CHARS, searchLauncherFiles } from '../services/launcherFiles'
import { LauncherIconCache } from '../services/launcherIconCache'
import { openWindowsLauncherApp } from '../services/launcherSystemApps'
import { isSenderWindow } from './senderGuard'

const CATALOG_TTL_MS = 60_000
const MAX_RECENT_APPS = 8
const CURRENCY_CODE = /^[A-Z]{3}$/
const OPAQUE_ID = /^[a-f0-9]{64}$/
const MAX_FILE_ICON_CACHE = 64

async function readRecentIds(file: string): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf-8'))
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)) : []
  } catch {
    return []
  }
}

async function readCurrencyTarget(file: string): Promise<string | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf-8'))
    const code = parsed && typeof parsed === 'object' ? (parsed as { code?: unknown }).code : undefined
    return typeof code === 'string' && CURRENCY_CODE.test(code) ? code : null
  } catch {
    return null
  }
}

/** Renderer sends catalog IDs, never executable paths, arguments, or shell commands. */
export function registerLauncherHandlers(ipc: IpcMain, getWindow: () => BrowserWindow | null): () => Promise<void> {
  let catalog: IndexedLauncherApp[] = []
  let refreshedAt = 0
  let pending: Promise<IndexedLauncherApp[]> | undefined
  const recentFile = path.join(app.getPath('userData'), 'launcher-recent-v1.json')
  let recent: string[] | undefined
  const loadRecent = async () => {
    recent ??= await readRecentIds(recentFile)
    return recent
  }
  const rememberRecent = async (id: string) => {
    recent = [id, ...(await loadRecent()).filter(entry => entry !== id)].slice(0, MAX_RECENT_APPS)
    try {
      await mkdir(path.dirname(recentFile), { recursive: true })
      await writeFile(recentFile, JSON.stringify(recent), 'utf-8')
    } catch { /* Recents are a convenience; the launch already succeeded. */ }
  }
  // The popup never writes the shared renderer store, so its one preference lives here.
  const currencyTargetFile = path.join(app.getPath('userData'), 'launcher-currency-target-v1.json')
  let currencyTarget: Promise<string | null> | undefined
  const files = new LauncherFileIndex()
  // Generic type icons repeat across results; folders share one.
  const fileIcons = new Map<string, string | null>()
  const fileIcon = async (filePath: string, kind: 'file' | 'folder'): Promise<string | undefined> => {
    const key = kind === 'folder' ? 'folder' : path.extname(filePath).toLowerCase() || 'file'
    if (!fileIcons.has(key)) {
      try {
        const icon = await app.getFileIcon(filePath, { size: 'normal' })
        fileIcons.set(key, icon.isEmpty() ? null : icon.toDataURL())
      } catch {
        fileIcons.set(key, null)
      }
      if (fileIcons.size > MAX_FILE_ICON_CACHE) fileIcons.delete(fileIcons.keys().next().value as string)
    }
    return fileIcons.get(key) ?? undefined
  }
  const rates = new CurrencyRateStore({ file: path.join(app.getPath('userData'), 'launcher-currency-rates-v1.json') })
  const icons = new LauncherIconCache({
    file: path.join(app.getPath('userData'), 'launcher-icons-v1.json'),
    platform: process.platform,
    onIcons: updates => {
      const window = getWindow()
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send('launcher:icons', updates)
      }
    },
  })
  const trusted = (event: Electron.IpcMainInvokeEvent) =>
    isSenderWindow(event, getWindow) && event.senderFrame === event.sender.mainFrame
  const refresh = async () => {
    if (refreshedAt && Date.now() - refreshedAt < CATALOG_TTL_MS) return catalog
    pending ??= scanLauncherApps({
      platform: process.platform,
      home: homedir(),
      appData: app.getPath('appData'),
      programData: process.env.ProgramData,
      readShortcut: shortcut => shell.readShortcutLink(shortcut),
    }).then(async apps => {
      await icons.updateCatalog(apps)
      catalog = apps
      refreshedAt = Date.now()
      icons.warm()
      return apps
    }).finally(() => { pending = undefined })
    return pending
  }
  const failure = (errorCode: LauncherResult['errorCode']): LauncherResult => ({ success: false, errorCode })

  ipc.handle('launcher:list-apps', async event => {
    if (!trusted(event) || !['darwin', 'win32'].includes(process.platform)) {
      return { ...failure('UNAVAILABLE'), apps: [] }
    }
    try {
      const [apps, recentIds] = await Promise.all([refresh(), loadRecent()])
      const known = new Set(apps.map(entry => entry.id))
      return {
        success: true,
        apps: apps.map(({ id, name, aliases }) => ({ id, name, ...(aliases?.length ? { aliases } : {}), iconDataUrl: icons.peek(id) })),
        recent: recentIds.filter(id => known.has(id)),
      }
    } catch {
      return { ...failure('UNAVAILABLE'), apps: [] }
    }
  })

  ipc.handle('launcher:get-icons', async (event, ids: unknown) => {
    if (!trusted(event)) return { ...failure('UNAVAILABLE'), icons: [] }
    if (!Array.isArray(ids) || ids.length > 16 || ids.some(id => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id))) {
      return { ...failure('INVALID'), icons: [] }
    }
    const entries = [...new Set(ids as string[])].map(id => catalog.find(entry => entry.id === id))
    if (entries.some(entry => !entry)) return { ...failure('NOT_FOUND'), icons: [] }
    return { success: true, icons: await icons.get([...new Set(ids as string[])]) }
  })

  ipc.handle('launcher:open-app', async (event, id: unknown) => {
    if (!trusted(event)) return failure('UNAVAILABLE')
    if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) return failure('INVALID')
    // Only entries already offered by this process may be launched.
    const target = catalog.find(item => item.id === id)
    if (!target) return failure('NOT_FOUND')
    try {
      if (target.target.kind === 'windows-app') {
        await openWindowsLauncherApp(target.target.appId)
      } else {
        const error = await shell.openPath(target.target.path)
        if (error) return failure('OPEN_FAILED')
      }
      getWindow()?.hide()
      await rememberRecent(id)
      return { success: true }
    } catch {
      return failure('OPEN_FAILED')
    }
  })

  ipc.handle('launcher:search-web', async (event, query: unknown) => {
    if (!trusted(event)) return failure('UNAVAILABLE')
    if (typeof query !== 'string' || !query.trim() || query.length > 500) return failure('INVALID')
    try {
      const url = new URL('https://www.google.com/search')
      url.searchParams.set('q', query.trim())
      await shell.openExternal(url.toString())
      getWindow()?.hide()
      return { success: true }
    } catch {
      return failure('OPEN_FAILED')
    }
  })

  ipc.handle('launcher:search-files', async (event, query: unknown) => {
    if (!trusted(event)) return { ...failure('UNAVAILABLE'), files: [] }
    // Shape errors are reported the same on every platform; the index is a separate concern.
    if (typeof query !== 'string' || query.length > MAX_FILE_QUERY_CHARS) return { ...failure('INVALID'), files: [] }
    if (!['darwin', 'win32'].includes(process.platform)) return { ...failure('UNAVAILABLE'), files: [] }
    try {
      const home = homedir()
      const hits = await searchLauncherFiles(query, { platform: process.platform, home })
      const listed = files.remember(hits, home)
      const icons = await Promise.all(hits.map(hit => fileIcon(hit.path, hit.kind)))
      return { success: true, files: listed.map((file, index) => ({ ...file, ...(icons[index] ? { iconDataUrl: icons[index] } : {}) })) }
    } catch {
      return { ...failure('UNAVAILABLE'), files: [] }
    }
  })

  const fileAction = async (event: Electron.IpcMainInvokeEvent, id: unknown, act: (filePath: string) => Promise<void>) => {
    if (!trusted(event)) return failure('UNAVAILABLE')
    if (typeof id !== 'string' || !OPAQUE_ID.test(id)) return failure('INVALID')
    // Only a path this process listed for this renderer can be opened.
    const target = files.get(id)
    if (!target) return failure('NOT_FOUND')
    try {
      await act(target.path)
      getWindow()?.hide()
      return { success: true }
    } catch {
      return failure('OPEN_FAILED')
    }
  }

  ipc.handle('launcher:open-file', (event, id: unknown) => fileAction(event, id, async filePath => {
    const error = await shell.openPath(filePath)
    if (error) throw new Error(error)
  }))

  ipc.handle('launcher:reveal-file', (event, id: unknown) => fileAction(event, id, async filePath => {
    shell.showItemInFolder(filePath)
  }))

  ipc.handle('launcher:convert-currency', async (event, request: unknown) => {
    if (!trusted(event)) return failure('UNAVAILABLE')
    const parsed = parseCurrencyConversionRequest(request)
    if (!parsed) return failure('INVALID')
    const snapshot = await rates.get()
    if (!snapshot) return failure('UNAVAILABLE')
    const conversion = convertWithSnapshot(snapshot, parsed)
    return conversion ? { success: true, conversion } : failure('NOT_FOUND')
  })

  ipc.handle('launcher:get-currency-target', async event => {
    if (!trusted(event)) return { ...failure('UNAVAILABLE'), code: null }
    currencyTarget ??= readCurrencyTarget(currencyTargetFile)
    return { success: true, code: await currencyTarget }
  })

  ipc.handle('launcher:set-currency-target', async (event, code: unknown) => {
    if (!trusted(event)) return failure('UNAVAILABLE')
    if (code !== null && (typeof code !== 'string' || !CURRENCY_CODE.test(code))) return failure('INVALID')
    currencyTarget = Promise.resolve(code)
    try {
      await mkdir(path.dirname(currencyTargetFile), { recursive: true })
      await writeFile(currencyTargetFile, JSON.stringify({ code }), 'utf-8')
      return { success: true }
    } catch {
      return failure('OPEN_FAILED')
    }
  })

  // Start catalog/icon preparation before the lazy popup is ever created.
  return async () => {
    if (['darwin', 'win32'].includes(process.platform)) await refresh().catch(() => {})
  }
}

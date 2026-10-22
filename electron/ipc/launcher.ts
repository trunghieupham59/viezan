import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow, type IpcMain, shell } from 'electron'
import type { LauncherResult } from '../../shared/launcher'
import { type IndexedLauncherApp, scanLauncherApps } from '../services/launcherApps'
import { LauncherIconCache } from '../services/launcherIconCache'
import { openWindowsLauncherApp } from '../services/launcherSystemApps'
import { isSenderWindow } from './senderGuard'

const CATALOG_TTL_MS = 60_000
const MAX_RECENT_APPS = 8

async function readRecentIds(file: string): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf-8'))
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)) : []
  } catch {
    return []
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

  // Start catalog/icon preparation before the lazy popup is ever created.
  return async () => {
    if (['darwin', 'win32'].includes(process.platform)) await refresh().catch(() => {})
  }
}

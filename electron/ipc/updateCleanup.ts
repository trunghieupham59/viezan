/**
 * Installer cleanup after an in-app update.
 *
 * Both update paths download a full installer and leave it behind once the new
 * version is running:
 *
 *   • Windows/Linux (electron-updater): `<cache>/<updaterCacheDirName>/pending/`
 *     keeps the NSIS installer / AppImage plus `update-info.json`; electron-updater
 *     only empties it when a *later* download replaces the file.
 *   • macOS (GitHub fallback): the DMG is written to `<userData>/updates/`; the
 *     install helper deletes it on success, but a failed or skipped install
 *     leaves it there.
 *
 * On startup the running version decides: an installer that is not newer than
 * the app itself can never be installed as an upgrade, so it is garbage. A newer
 * one is a pending download the user has not installed yet and is kept so it is
 * not downloaded again.
 */
import { readdir, readFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { isNewerVersion, parseArtifactVersion } from './updateVersion'

/** Folder under `userData` that holds macOS DMG downloads. */
export const MAC_UPDATE_DIR_NAME = 'updates'
/** electron-updater default when `app-update.yml` does not name the cache folder. */
export const DEFAULT_UPDATER_CACHE_DIR_NAME = 'viezan-updater'

/** True when a cached installer can no longer upgrade the running app. */
export function isStaleInstaller(fileName: string, currentVersion: string): boolean {
  const version = parseArtifactVersion(fileName)
  return !version || !isNewerVersion(version, currentVersion)
}

/** `updaterCacheDirName` from electron-builder's `app-update.yml` (one `key: value` line). */
export function readUpdaterCacheDirName(appUpdateYml: string): string | null {
  const match = /^updaterCacheDirName:\s*["']?([^"'\r\n]+?)["']?\s*$/m.exec(appUpdateYml)
  const name = match?.[1].trim()
  return name && !/[/\\]/.test(name) && name !== '..' ? name : null
}

/** Mirrors electron-updater's `getAppCacheDir()` so the same folder is cleaned. */
export function resolveUpdaterCacheDir(options: {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  home?: string
  cacheDirName: string
}): string {
  const home = options.home ?? homedir()
  const base = options.platform === 'win32'
    ? options.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
    : options.platform === 'darwin'
      ? path.join(home, 'Library', 'Caches')
      : options.env.XDG_CACHE_HOME || path.join(home, '.cache')
  return path.join(base, options.cacheDirName)
}

async function listDir(dir: string): Promise<string[]> {
  try { return await readdir(dir) } catch { return [] }
}

/**
 * Remove installers that the running version has made obsolete. Never throws:
 * cleanup is best effort and must not delay startup. Returns the removed paths.
 */
export async function cleanupInstalledUpdates(options: {
  currentVersion: string
  /** electron-updater cache folder (parent of `pending/`), or null to skip. */
  updaterCacheDir: string | null
  /** macOS DMG download folder, or null to skip. */
  macUpdateDir: string | null
}): Promise<string[]> {
  const removed: string[] = []

  if (options.updaterCacheDir) {
    const pending = path.join(options.updaterCacheDir, 'pending')
    const entries = await listDir(pending)
    if (entries.length > 0) {
      let keep = false
      try {
        const info = JSON.parse(await readFile(path.join(pending, 'update-info.json'), 'utf8')) as { fileName?: unknown }
        keep = typeof info.fileName === 'string' && !isStaleInstaller(info.fileName, options.currentVersion)
      } catch { /* No valid record: nothing in here is installable. */ }
      if (!keep) {
        try {
          await rm(pending, { recursive: true, force: true })
          removed.push(pending)
        } catch { /* Locked by a still-running installer; retried on the next start. */ }
      }
    }
  }

  if (options.macUpdateDir) {
    for (const entry of await listDir(options.macUpdateDir)) {
      if (!/\.dmg$/i.test(entry) || !isStaleInstaller(entry, options.currentVersion)) continue
      const file = path.join(options.macUpdateDir, entry)
      try {
        await rm(file, { force: true })
        removed.push(file)
      } catch { /* Best effort. */ }
    }
  }

  if (removed.length > 0) console.info('[updater] Removed installed update files', { count: removed.length })
  return removed
}

/** Startup entry point: resolves the real folders for the packaged app. */
export async function runStartupUpdateCleanup(app: {
  isPackaged: boolean
  version: string
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  resourcesPath: string
  userDataPath: string
}): Promise<string[]> {
  if (!app.isPackaged) return []
  let updaterCacheDir: string | null = null
  if (app.platform !== 'darwin') {
    let cacheDirName = DEFAULT_UPDATER_CACHE_DIR_NAME
    try {
      cacheDirName = readUpdaterCacheDirName(await readFile(path.join(app.resourcesPath, 'app-update.yml'), 'utf8')) ?? cacheDirName
    } catch { /* No publish config: keep the default name. */ }
    updaterCacheDir = resolveUpdaterCacheDir({ platform: app.platform, env: app.env, cacheDirName })
  }
  return cleanupInstalledUpdates({
    currentVersion: app.version,
    updaterCacheDir,
    macUpdateDir: app.platform === 'darwin' ? path.join(app.userDataPath, MAC_UPDATE_DIR_NAME) : null,
  })
}

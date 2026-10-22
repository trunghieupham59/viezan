// @vitest-environment node
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanupInstalledUpdates,
  DEFAULT_UPDATER_CACHE_DIR_NAME,
  isStaleInstaller,
  readUpdaterCacheDirName,
  resolveUpdaterCacheDir,
  runStartupUpdateCleanup,
} from '../updateCleanup'
import { parseArtifactVersion } from '../updateVersion'

let root: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'viezan-update-cleanup-'))
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(root, { recursive: true, force: true })
})

function writePending(cacheDir: string, fileName: string, withInfo = true) {
  const pending = path.join(cacheDir, 'pending')
  fs.mkdirSync(pending, { recursive: true })
  fs.writeFileSync(path.join(pending, fileName), 'installer-bytes')
  fs.writeFileSync(path.join(pending, `${fileName}.blockmap`), 'blockmap')
  if (withInfo) fs.writeFileSync(path.join(pending, 'update-info.json'), JSON.stringify({ fileName, sha512: 'x', isAdminRightsRequired: false }))
  return pending
}

describe('installer artifact versions', () => {
  it('reads the version out of electron-builder artifact names only', () => {
    expect(parseArtifactVersion('Viezan-2.2.6-x64.exe')).toBe('2.2.6')
    expect(parseArtifactVersion('C:\\cache\\pending\\Viezan-2.2.6-x64.exe')).toBe('2.2.6')
    expect(parseArtifactVersion('Viezan-2.3.0-beta.1-arm64.dmg')).toBe('2.3.0-beta.1')
    expect(parseArtifactVersion('temp-Viezan-2.2.6-x64.exe')).toBeNull()
    expect(parseArtifactVersion('update-info.json')).toBeNull()
  })

  it('treats anything not newer than the running app, or unparseable, as stale', () => {
    expect(isStaleInstaller('Viezan-2.2.6-x64.exe', '2.2.6')).toBe(true)
    expect(isStaleInstaller('Viezan-2.2.5-x64.exe', '2.2.6')).toBe(true)
    expect(isStaleInstaller('Viezan-2.2.7-x64.exe', '2.2.6')).toBe(false)
    expect(isStaleInstaller('installer.exe', '2.2.6')).toBe(true)
  })

  it('mirrors electron-updater cache folder resolution and its app-update.yml name', () => {
    expect(readUpdaterCacheDirName('provider: github\nupdaterCacheDirName: viezan-updater\nowner: x\n')).toBe('viezan-updater')
    expect(readUpdaterCacheDirName("updaterCacheDirName: 'my-updater'")).toBe('my-updater')
    expect(readUpdaterCacheDirName('provider: github\n')).toBeNull()
    expect(readUpdaterCacheDirName('updaterCacheDirName: ../escape')).toBeNull()
    expect(resolveUpdaterCacheDir({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, cacheDirName: 'viezan-updater' }))
      .toBe(path.join('C:\\Users\\me\\AppData\\Local', 'viezan-updater'))
    expect(resolveUpdaterCacheDir({ platform: 'win32', env: {}, home: '/home/me', cacheDirName: 'viezan-updater' }))
      .toBe(path.join('/home/me', 'AppData', 'Local', 'viezan-updater'))
    expect(resolveUpdaterCacheDir({ platform: 'darwin', env: {}, home: '/Users/me', cacheDirName: 'viezan-updater' }))
      .toBe(path.join('/Users/me', 'Library', 'Caches', 'viezan-updater'))
    expect(resolveUpdaterCacheDir({ platform: 'linux', env: { XDG_CACHE_HOME: '/xdg' }, home: '/home/me', cacheDirName: 'viezan-updater' }))
      .toBe(path.join('/xdg', 'viezan-updater'))
    expect(DEFAULT_UPDATER_CACHE_DIR_NAME).toBe('viezan-updater')
  })
})

describe('cleanupInstalledUpdates', () => {
  it('removes the electron-updater pending installer once that version is running', async () => {
    const cacheDir = path.join(root, 'viezan-updater')
    const pending = writePending(cacheDir, 'Viezan-2.2.6-x64.exe')
    // The differential-download seed in the cache root is not an installed update.
    fs.writeFileSync(path.join(cacheDir, 'installer.exe'), 'seed')

    const removed = await cleanupInstalledUpdates({ currentVersion: '2.2.6', updaterCacheDir: cacheDir, macUpdateDir: null })

    expect(removed).toEqual([pending])
    expect(fs.existsSync(pending)).toBe(false)
    expect(fs.existsSync(path.join(cacheDir, 'installer.exe'))).toBe(true)
  })

  it('keeps a downloaded update that has not been installed yet', async () => {
    const cacheDir = path.join(root, 'viezan-updater')
    const pending = writePending(cacheDir, 'Viezan-2.3.0-x64.exe')

    expect(await cleanupInstalledUpdates({ currentVersion: '2.2.6', updaterCacheDir: cacheDir, macUpdateDir: null })).toEqual([])
    expect(fs.readdirSync(pending)).toHaveLength(3)
  })

  it('drops leftovers of an interrupted download that have no valid record', async () => {
    const cacheDir = path.join(root, 'viezan-updater')
    const pending = writePending(cacheDir, 'temp-Viezan-2.3.0-x64.exe', false)
    fs.writeFileSync(path.join(pending, 'update-info.json'), '{not json')

    await cleanupInstalledUpdates({ currentVersion: '2.2.6', updaterCacheDir: cacheDir, macUpdateDir: null })
    expect(fs.existsSync(pending)).toBe(false)
  })

  it('removes installed and older macOS DMGs but keeps a newer pending one and other files', async () => {
    const macDir = path.join(root, 'updates')
    fs.mkdirSync(macDir)
    for (const name of ['Viezan-2.2.6-arm64.dmg', 'Viezan-2.2.5-arm64.DMG', 'Viezan-2.3.0-arm64.dmg', 'notes.txt']) {
      fs.writeFileSync(path.join(macDir, name), name)
    }

    const removed = await cleanupInstalledUpdates({ currentVersion: '2.2.6', updaterCacheDir: null, macUpdateDir: macDir })

    expect(removed.sort()).toEqual([path.join(macDir, 'Viezan-2.2.5-arm64.DMG'), path.join(macDir, 'Viezan-2.2.6-arm64.dmg')])
    expect(fs.readdirSync(macDir).sort()).toEqual(['Viezan-2.3.0-arm64.dmg', 'notes.txt'])
  })

  it('is a no-op for missing folders and never throws', async () => {
    await expect(cleanupInstalledUpdates({
      currentVersion: '2.2.6', updaterCacheDir: path.join(root, 'missing'), macUpdateDir: path.join(root, 'missing-too'),
    })).resolves.toEqual([])
  })
})

describe('runStartupUpdateCleanup', () => {
  it('does nothing in development runs', async () => {
    expect(await runStartupUpdateCleanup({
      isPackaged: false, version: '2.2.6', platform: 'win32', env: {}, resourcesPath: root, userDataPath: root,
    })).toEqual([])
  })

  it('cleans the cache folder named in app-update.yml on Windows', async () => {
    const localAppData = path.join(root, 'Local')
    const resources = path.join(root, 'resources')
    fs.mkdirSync(resources, { recursive: true })
    fs.writeFileSync(path.join(resources, 'app-update.yml'), 'provider: github\nupdaterCacheDirName: custom-updater\n')
    const pending = writePending(path.join(localAppData, 'custom-updater'), 'Viezan-2.2.6-x64.exe')

    const removed = await runStartupUpdateCleanup({
      isPackaged: true, version: '2.2.6', platform: 'win32', env: { LOCALAPPDATA: localAppData },
      resourcesPath: resources, userDataPath: path.join(root, 'userData'),
    })
    expect(removed).toEqual([pending])
  })

  it('cleans the userData updates folder on macOS and leaves the updater cache alone', async () => {
    const userData = path.join(root, 'userData')
    fs.mkdirSync(path.join(userData, 'updates'), { recursive: true })
    fs.writeFileSync(path.join(userData, 'updates', 'Viezan-2.2.6-arm64.dmg'), 'dmg')

    const removed = await runStartupUpdateCleanup({
      isPackaged: true, version: '2.2.6', platform: 'darwin', env: {}, resourcesPath: root, userDataPath: userData,
    })
    expect(removed).toEqual([path.join(userData, 'updates', 'Viezan-2.2.6-arm64.dmg')])
  })
})

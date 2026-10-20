import { createHash } from 'node:crypto'
import { readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import type { LauncherApp } from '../../shared/launcher'
import { type LauncherTarget, readSystemLauncherApps } from './launcherSystemApps'

export interface IndexedLauncherApp extends LauncherApp {
  target: LauncherTarget
  iconSourcePath?: string
}

interface CatalogOptions {
  platform: string
  home: string
  appData?: string
  programData?: string
  readShortcut: (shortcutPath: string) => { target: string; args?: string }
}

const normalizedName = (value: string) => value.normalize('NFKC').toLowerCase()
  .replace(/\.(exe|app|lnk)$/i, '').replace(/\s+(?:for\s+windows|for\s+macos|for\s+mac)$/i, '')
  .replace(/\s+/g, ' ').trim()

// Match helper roles at word boundaries, not substrings in genuine app names
// such as "Update Manager", "Proxy Switcher" or "Helper Studio".
function isAuxiliary(name: string, executable?: string): boolean {
  const helper = /(?:^|[\s._-])(?:ssh[\s_-](?:askpass|proxy)|askpass|crashpad(?:[\s_-]handler)?|crash[\s_-]reporter|unins\d*|uninstall(?:er)?|updater)(?:$|[\s._-])/i
  const helperSuffix = /[\s._-](?:helper|agent|service)(?:\s*\([^)]*\))?$/i
  const claudeSetupHelper = /^claude[-_]make[-_]data[-_]folder$/i
  return [name, executable ? path.win32.basename(executable, '.exe') : '']
    .some(value => helper.test(value) || helperSuffix.test(value) || claudeSetupHelper.test(value))
}

/** Fallback roots also work when the native catalog/Spotlight is unavailable. */
export function launcherRoots(options: CatalogOptions): string[] {
  if (options.platform === 'darwin') {
    return ['/Applications', '/System/Applications', '/System/Library/CoreServices/Applications', path.join(options.home, 'Applications')]
  }
  if (options.platform === 'win32') {
    return [options.appData, options.programData]
      .filter((root): root is string => Boolean(root))
      .map(root => path.join(root, 'Microsoft', 'Windows', 'Start Menu', 'Programs'))
  }
  return []
}

export async function scanLauncherApps(options: CatalogOptions): Promise<IndexedLauncherApp[]> {
  const apps: IndexedLauncherApp[] = []
  const seen = new Set<string>()
  const names = new Set<string>()
  const executables = new Set<string>()
  const add = (name: string, target: LauncherTarget, executable?: string, args = '') => {
    if (isAuxiliary(name, executable)) return
    const value = target.kind === 'path' ? target.path : target.appId
    const identity = `${target.kind}:${options.platform === 'win32' ? value.toLowerCase() : value}`
    const nameKey = `${normalizedName(name)}\0${args.trim()}`
    const executableKey = executable ? `${path.win32.normalize(executable).toLowerCase()}\0${args.trim()}` : ''
    if (seen.has(identity) || names.has(nameKey) || (executableKey && executables.has(executableKey))) return
    seen.add(identity)
    names.add(nameKey)
    if (executableKey) executables.add(executableKey)
    apps.push({ id: createHash('sha256').update(identity).digest('hex'), name, target, iconSourcePath: executable })
  }
  const systemApps = await readSystemLauncherApps(options.platform).catch(() => [])
  for (const item of systemApps) {
    let target = item.target
    // Drop stale Spotlight entries. Don't walk into helper bundles.
    if (options.platform === 'darwin' && target.kind === 'path') {
      const appPath = target.path
      if (!(await stat(appPath).catch(() => null))?.isDirectory()) continue
      target = { kind: 'path', path: await realpath(appPath).catch(() => appPath) }
    }
    add(item.name, target, item.executable ?? (options.platform === 'win32' && target.kind === 'path' ? target.path : undefined), item.args)
  }
  let visited = 0
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > 6 || visited >= 20_000) return
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (++visited > 20_000) break
      const launchPath = path.join(directory, entry.name)
      const isMacApp = options.platform === 'darwin' && entry.name.endsWith('.app') && (entry.isDirectory()
        || (entry.isSymbolicLink() && (await stat(launchPath).catch(() => null))?.isDirectory()))
      if (entry.isSymbolicLink() && !isMacApp) continue
      let isWindowsApp = false
      let shortcut: { target: string; args?: string } | undefined
      if (options.platform === 'win32' && entry.isFile() && /\.lnk$/i.test(entry.name)) {
        try {
          // Exclude document, folder and URL shortcuts from the application launcher.
          shortcut = options.readShortcut(launchPath)
          isWindowsApp = /\.exe$/i.test(shortcut.target)
        } catch { /* Broken or inaccessible shortcut. */ }
      }
      if (isMacApp || isWindowsApp) {
        const name = entry.name.replace(/\.(app|lnk)$/i, '')
        const resolved = isMacApp ? await realpath(launchPath).catch(() => launchPath) : launchPath
        add(name, { kind: 'path', path: resolved }, shortcut?.target, shortcut?.args)
      } else if (entry.isDirectory()) {
        await visit(launchPath, depth + 1)
      }
    }
  }
  for (const root of launcherRoots(options)) await visit(root, 0)
  return apps.sort((a, b) => a.name.localeCompare(b.name))
}

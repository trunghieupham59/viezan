import { randomUUID } from 'node:crypto'
import { lstat, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { InstalledApp } from '../../shared/appsApi'
import { runFile } from '../fileActions/native'
import { within } from '../fileActions/verify'
import { scanLauncherApps } from '../services/launcherApps'

export interface AppRecord extends InstalledApp { teamId: string; executable: string }
export async function readPlist(file: string): Promise<Record<string, unknown>> {
  const { stdout } = await runFile('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file], { timeout: 5000, maxBuffer: 1024 * 1024 })
  const parsed: unknown = JSON.parse(stdout)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid plist')
  return parsed as Record<string, unknown>
}
export const bundleIdentifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9.-]{2,199}$/.test(value) && value.includes('.')

/** Supplement Launcher discovery: its name deduplication is appropriate for launching, not removal. */
export async function inventory(home: string, ownBundle: string): Promise<AppRecord[]> {
  const discovered = await scanLauncherApps({ platform: 'darwin', home, readShortcut: () => ({ target: '' }) })
  const paths = new Set(discovered.flatMap(a => a.target.kind === 'path' ? [a.target.path] : []))
  let incomplete = false
  let visited = 0
  async function visit(root: string, depth = 0): Promise<void> {
    if (++visited > 20_000 || depth > 8) { incomplete = true; return }
    for (const e of await readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') incomplete = true
      return []
    })) {
      const p = path.join(root, e.name)
      if (e.name.endsWith('.app')) paths.add(p)
      else if (e.isDirectory()) await visit(p, depth + 1)
      else if (e.isSymbolicLink()) incomplete = true
    }
  }
  await visit('/Applications')
  await visit(path.join(home, 'Applications'))
  const apps: AppRecord[] = []
  for (const p of paths) {
    try {
      const info = await readPlist(path.join(p, 'Contents/Info.plist'))
      const id = info.CFBundleIdentifier
      if (!bundleIdentifier(id)) { incomplete = true; continue }
      const signature = await runFile('/usr/bin/codesign', ['-dv', '--verbose=2', p], { timeout: 5000 }).catch(() => ({ stderr: '' }))
      const teamId = /^TeamIdentifier=(.+)$/m.exec(signature.stderr)?.[1] ?? ''
      const allowed = within('/Applications', p) || within(path.join(home, 'Applications'), p)
      const blocked = !allowed || id.startsWith('com.apple.') || p === ownBundle || id.toLowerCase().startsWith('com.viezan.') || within('/Applications/Setapp', p) || (await lstat(p)).isSymbolicLink()
      apps.push({ id: randomUUID(), name: String(info.CFBundleDisplayName ?? info.CFBundleName ?? path.basename(p, '.app')),
        bundleId: id, path: p, version: String(info.CFBundleShortVersionString ?? info.CFBundleVersion ?? ''),
        teamId: teamId === 'not set' ? '' : teamId, executable: String(info.CFBundleExecutable ?? ''), ...(blocked ? { blocked: 'protected' as const } : {}) })
    } catch { incomplete = true /* Unknown siblings may own data that otherwise looks exclusive. */ }
  }
  if (incomplete) return apps.map(app => ({ ...app, blocked: 'unreadable' as const }))
  return apps.sort((a, b) => a.name.localeCompare(b.name))
}

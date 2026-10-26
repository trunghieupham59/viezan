import { randomUUID } from 'node:crypto'
import { lstat, readdir, realpath } from 'node:fs/promises'
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
// Some installed Apple bundles use underscores (e.g. Image Capture). Inventory recognition
// must not turn their protected presence into an unknown owner; mutation domains stay stricter.
const inventoryIdentifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{2,199}$/.test(value) && value.includes('.')

/** Read only the metadata fields we use when a valid plist contains dates/data unsupported by JSON. */
export async function bundleInfo(file: string) {
  try { return await readPlist(file) }
  catch {
    const fields = ['CFBundleIdentifier', 'CFBundleDisplayName', 'CFBundleName', 'CFBundleShortVersionString', 'CFBundleVersion', 'CFBundleExecutable']
    const info: Record<string, unknown> = {}
    for (const field of fields) {
      try {
        const { stdout } = await runFile('/usr/bin/plutil', ['-extract', field, 'raw', '-o', '-', file], { timeout: 5000, maxBuffer: 64 * 1024 })
        info[field] = stdout.trim()
      } catch { if (field === 'CFBundleIdentifier') throw new Error('Unreadable bundle identity') }
    }
    return info
  }
}

/** A suffix alone is not a bundle: Spotlight also returns Application Scripts folders. */
export async function bundleMetadata(bundle: string): Promise<{ file: string; signingPath: string; wrapped: boolean } | null> {
  const canonical = await realpath(bundle)
  for (const relative of ['Contents/Info.plist', 'Info.plist']) {
    const file = path.join(bundle, relative)
    const st = await lstat(file).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error })
    if (st) {
      if (!within(canonical, await realpath(file))) throw new Error('Metadata outside bundle')
      return { file, signingPath: bundle, wrapped: false }
    }
  }
  const wrapper = path.join(bundle, 'Wrapper')
  const children = await readdir(wrapper, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error })
  const wrapped = children.filter(e => e.isDirectory() && e.name.endsWith('.app'))
  if (wrapped.length > 1) throw new Error('Ambiguous wrapped application')
  if (wrapped.length === 1) {
    const signingPath = path.join(wrapper, wrapped[0].name)
    const file = path.join(signingPath, 'Info.plist')
    if (!within(canonical, await realpath(file))) throw new Error('Metadata outside bundle')
    return { file, signingPath, wrapped: true }
  }
  return null
}

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
      const allowed = within('/Applications', p) || within(path.join(home, 'Applications'), p)
      const metadata = await bundleMetadata(p)
      if (!metadata) { if (allowed) incomplete = true; continue }
      const info = await bundleInfo(metadata.file)
      const id = info.CFBundleIdentifier
      if (!inventoryIdentifier(id)) { incomplete = true; continue }
      const signature = await runFile('/usr/bin/codesign', ['-dv', '--verbose=2', metadata.signingPath], { timeout: 5000 }).catch(() => ({ stderr: '' }))
      const teamId = /^TeamIdentifier=(.+)$/m.exec(signature.stderr)?.[1] ?? ''
      const blocked = !allowed || metadata.wrapped || id.toLowerCase().startsWith('com.apple.') || p === ownBundle || id.toLowerCase().startsWith('com.viezan.') || within('/Applications/Setapp', p) || (await lstat(p)).isSymbolicLink()
      apps.push({ id: randomUUID(), name: String(info.CFBundleDisplayName ?? info.CFBundleName ?? path.basename(p, '.app')),
        bundleId: id, path: p, version: String(info.CFBundleShortVersionString ?? info.CFBundleVersion ?? ''),
        teamId: teamId === 'not set' ? '' : teamId, executable: String(info.CFBundleExecutable ?? ''), ...(blocked ? { blocked: 'protected' as const } : {}) })
    } catch { incomplete = true /* Unknown siblings may own data that otherwise looks exclusive. */ }
  }
  if (incomplete) return apps.map(app => ({ ...app, blocked: 'unreadable' as const }))
  return apps.sort((a, b) => a.name.localeCompare(b.name))
}

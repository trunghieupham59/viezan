import { randomUUID } from 'node:crypto'
import { lstat, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { AppDataItem } from '../../shared/appsApi'
import type { FileCandidate } from '../fileActions/service'
import { snapshot, within } from '../fileActions/verify'
import { type AppRecord, bundleIdentifier, readPlist } from './inventory'

export const prefixMatch = (value: string, id: string) => value === id || value.startsWith(`${id}.`)
export function ownership(name: string, app: AppRecord, all: AppRecord[]): { evidence: AppDataItem['evidence']; shared: boolean } | null {
  const stem = name.replace(/\.plist$/, '').replace(/\.savedState$/, '')
  const vendor = app.bundleId.split('.').slice(0, -1).join('.')
  const exact = prefixMatch(stem, app.bundleId)
  const vendorMatch = vendor.includes('.') && prefixMatch(stem, vendor)
  const teamMatch = Boolean(app.teamId && stem.startsWith(`${app.teamId}.`))
  const nameMatch = stem.toLowerCase() === app.name.toLowerCase()
  if (!exact && !vendorMatch && !teamMatch && !nameMatch) return null
  const shared = all.some(other => other.path !== app.path && (prefixMatch(stem, other.bundleId)
    || (other.bundleId === app.bundleId)
    || (!exact && ((app.teamId && other.teamId === app.teamId) || prefixMatch(other.bundleId, vendor)))))
  return { evidence: exact ? 'exact' : nameMatch ? 'name' : 'vendor', shared }
}

/** Restricted to known support roots, never Documents, Keychains, cloud storage or arbitrary matches. */
export async function residues(app: AppRecord, all: AppRecord[], home: string) {
  const items: FileCandidate[] = []
  let incomplete = false
  async function add(p: string, kind: AppDataItem['kind'], evidence: AppDataItem['evidence'], blocked?: AppDataItem['blocked']) {
    const item: FileCandidate = { id: randomUUID(), path: p, kind, evidence, bytes: null, selected: false, ...(blocked ? { blocked } : {}) }
    try {
      item.snapshot = await snapshot(p)
      item.bytes = item.snapshot.bytes
      item.selected = evidence === 'exact' && !blocked
      if (kind === 'preferences') {
        // ByHost domains cannot be safely mapped to defaults' current-host API in V1.
        if (path.basename(path.dirname(p)) === 'ByHost') item.blocked = 'protected'
        else {
          const domain = path.basename(p, '.plist')
          if (!bundleIdentifier(domain)) item.blocked = 'protected'
          else item.domain = domain
        }
      }
      if (kind === 'agent' && !item.blocked) {
        const plist = await readPlist(p)
        const program = typeof plist.Program === 'string' ? plist.Program : Array.isArray(plist.ProgramArguments) ? plist.ProgramArguments[0] : undefined
        if (!bundleIdentifier(plist.Label) || plist.Label !== path.basename(p, '.plist')
          || !prefixMatch(plist.Label, app.bundleId) || typeof program !== 'string' || !within(app.path, program)) item.blocked = 'protected'
        else item.launchLabel = plist.Label
      }
    } catch { item.blocked = 'unreadable'; incomplete = true }
    item.selected = item.selected && !item.blocked
    items.push(item)
  }
  if (await lstat(app.path).catch(() => null)) await add(app.path, 'bundle', 'exact', app.blocked)
  const roots = ['Caches', 'Logs', 'Application Support', 'Preferences', 'Preferences/ByHost', 'Containers', 'Group Containers', 'Saved Application State', 'HTTPStorages', 'WebKit', 'LaunchAgents']
  for (const system of [false, true]) for (const root of roots) {
    const dir = path.join(system ? '/Library' : path.join(home, 'Library'), root)
    let names: string[]
    try { names = await readdir(dir) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') incomplete = true; continue }
    for (const name of names) {
      const match = ownership(name, app, all)
      if (!match) continue
      const kind = root.startsWith('Preferences') ? 'preferences' : root === 'LaunchAgents' ? 'agent' : 'data'
      await add(path.join(dir, name), kind, match.evidence, match.shared || root === 'Group Containers' ? 'shared' : system ? 'needs-admin' : app.blocked)
    }
  }
  // Root-managed helpers are shown but never acted on by this user-level module.
  for (const root of ['/Library/LaunchDaemons', '/Library/PrivilegedHelperTools']) {
    for (const name of await readdir(root).catch(() => { incomplete = true; return [] as string[] })) {
      const match = ownership(name, app, all)
      if (match) await add(path.join(root, name), 'data', match.evidence, match.shared ? 'shared' : 'needs-admin')
    }
  }
  return { items, incomplete }
}

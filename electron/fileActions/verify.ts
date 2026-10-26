import { createHash } from 'node:crypto'
import { lstat, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import type { AppsIssue } from '../../shared/appsApi'

export class FileActionError extends Error {
  constructor(public readonly issue: AppsIssue) { super(issue) }
}
export const within = (root: string, target: string) => target === root || target.startsWith(`${root}${path.sep}`)
export interface FileSnapshot { dev: number; ino: number; digest: string; bytes: number }

/** No symlink traversal, no file contents, bounded work. Nested changes invalidate a plan too. */
export async function snapshot(target: string): Promise<FileSnapshot> {
  const first = await lstat(target)
  if (first.isSymbolicLink()) throw new FileActionError('protected')
  const hash = createHash('sha256')
  let count = 0
  let bytes = 0
  const seen = new Set<string>()
  const deadline = Date.now() + 30_000
  async function walk(file: string): Promise<void> {
    if (++count > 150_000 || Date.now() > deadline) throw new FileActionError('unreadable')
    const st = await lstat(file)
    if (st.dev !== first.dev) throw new FileActionError('protected')
    hash.update(JSON.stringify([path.relative(target, file), st.dev, st.ino, st.mode, st.size, st.mtimeMs]))
    const key = `${st.dev}:${st.ino}`
    if (!seen.has(key)) { bytes += st.blocks * 512; seen.add(key) }
    if (st.isDirectory()) for (const name of (await readdir(file)).sort()) await walk(path.join(file, name))
  }
  await walk(target)
  return { dev: first.dev, ino: first.ino, digest: hash.digest('hex'), bytes }
}

export function createPathPolicy(home: string, appData: string) {
  const dataRoots = ['Caches', 'Logs', 'Application Support', 'Preferences', 'Containers', 'Group Containers', 'Saved Application State', 'HTTPStorages', 'WebKit', 'LaunchAgents'].map(p => path.join(home, 'Library', p))
  const appRoots = ['/Applications', path.join(home, 'Applications')]
  const forbidden = [appData, ...['.ssh', '.gnupg', '.aws', '.config/gh', 'Library/Keychains', 'Library/Mobile Documents'].map(p => path.join(home, p))]
  return async (target: string): Promise<void> => {
    const normalized = path.resolve(target)
    const allowed = dataRoots.some(root => within(root, normalized) && root !== normalized)
      || (appRoots.some(root => within(root, normalized) && root !== normalized) && normalized.endsWith('.app'))
    if (!allowed || forbidden.some(root => within(root, normalized) || within(normalized, root))
      || normalized.split(path.sep).some(part => part.endsWith('.photoslibrary'))
      || await realpath(normalized) !== normalized) throw new FileActionError('protected')
  }
}

export async function verify(target: string, expected: FileSnapshot, policy: (p: string) => Promise<void>): Promise<void> {
  await policy(target)
  const now = await snapshot(target)
  if (now.digest !== expected.digest) throw new FileActionError('changed')
}

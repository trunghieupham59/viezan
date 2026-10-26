import { randomUUID } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import type { AppAction, AppActionSession, AppDataItem, AppsIssue } from '../../shared/appsApi'
import { createJournal, type JournalItem, type JournalSession } from './journal'
import type { createNativeFiles } from './native'
import { FileActionError, type FileSnapshot, snapshot, verify } from './verify'

export interface FileCandidate extends AppDataItem { snapshot?: FileSnapshot; domain?: string; launchLabel?: string }
export interface FileActionDeps {
  directory: string
  files: ReturnType<typeof createNativeFiles>
  policy: (path: string) => Promise<void>
  /** Includes app running state and current open files, checked immediately before each operation. */
  checkUse: (path: string) => Promise<void>
  preferences: {
    export: (domain: string, destination: string) => Promise<void>
    remove: (domain: string) => Promise<void>
    restore: (domain: string, source: string) => Promise<void>
    exists: (domain: string) => Promise<boolean>
  }
  agents: { stop: (label: string) => Promise<void>; start: (file: string) => Promise<void> }
}
export const issueOf = (e: unknown): AppsIssue => e instanceof FileActionError ? e.issue : (e as NodeJS.ErrnoException)?.code === 'EACCES' || (e as NodeJS.ErrnoException)?.code === 'EPERM' ? 'needs-admin' : 'failed'

/** Serial execution is enforced by the owning service, including journal reads and writes. */
export function createFileActions(deps: FileActionDeps) {
  const journal = createJournal(deps.directory)
  async function readSessions(): Promise<JournalSession[]> {
    const sessions = await journal.read()
    let recovered = false
    for (const session of sessions) for (const item of session.items) {
      if (item.status !== 'pending' || !item.snapshot) continue
      try {
        if (item.domain && item.backup && await lstat(item.backup) && !await deps.preferences.exists(item.domain)) {
          item.status = 'trashed'; delete item.issue; recovered = true
        } else if (item.receipt && !await lstat(item.path).catch(() => null)) {
          const receipt = JSON.parse(await readFile(item.receipt, 'utf8')) as { path: string }
          const st = await lstat(receipt.path)
          if (st.dev === item.snapshot.dev && st.ino === item.snapshot.ino) {
            item.trashedPath = receipt.path; item.status = 'trashed'; delete item.issue; recovered = true
          }
        }
      } catch { /* Retain unresolved intent, visibly pending, without claiming completion. */ }
    }
    if (recovered) await journal.write(sessions)
    return sessions
  }
  async function restorable(item: JournalItem): Promise<boolean> {
    if (item.status !== 'trashed' || !item.snapshot) return false
    if (item.domain) return Boolean(item.backup && await lstat(item.backup).catch(() => null))
    const st = item.trashedPath ? await lstat(item.trashedPath).catch(() => null) : null
    return Boolean(st && st.dev === item.snapshot.dev && st.ino === item.snapshot.ino)
  }
  async function publicSession(s: JournalSession): Promise<AppActionSession> {
    return { id: s.id, appName: s.appName, action: s.action, createdAt: s.createdAt, remaining: s.remaining,
      canUndo: (await Promise.all(s.items.map(restorable))).some(Boolean),
      items: s.items.map(({ path: p, status, issue }) => ({ path: p, status, ...(issue ? { issue } : {}) })) }
  }
  async function execute(appName: string, action: AppAction, candidates: FileCandidate[], selected: Set<string>) {
    if (!deps.files.available()) throw new FileActionError('native-missing')
    const sessions = await readSessions()
    const session: JournalSession = { id: randomUUID(), appName, action, createdAt: new Date().toISOString(), remaining: null,
      items: candidates.map(item => ({ path: item.path, kind: item.kind, snapshot: item.snapshot,
        domain: item.domain, launchLabel: item.launchLabel,
        status: item.blocked || !selected.has(item.id) ? 'skipped' : 'pending', issue: item.blocked })) }
    sessions.unshift(session)
    // Write intent BEFORE touching user files. Pending entries survive interruption; never claim success for them.
    await journal.write(sessions)
    for (const item of session.items) {
      if (item.status !== 'pending') continue
      try {
        if (!item.snapshot) throw new FileActionError('unreadable')
        await verify(item.path, item.snapshot, deps.policy)
        await deps.checkUse(item.path)
        if (item.domain) {
          item.backup = path.join(journal.directory, `${session.id}-${randomUUID()}.plist`)
          await deps.preferences.export(item.domain, item.backup)
          await journal.write(sessions)
          await deps.preferences.remove(item.domain)
        } else {
          item.receipt = path.join(journal.directory, `${session.id}-${randomUUID()}.receipt.json`)
          await journal.write(sessions)
          if (item.launchLabel) await deps.agents.stop(item.launchLabel)
          try { item.trashedPath = await deps.files.trash(item.path, item.snapshot, item.receipt) }
          catch (e) {
            if (item.launchLabel) await deps.agents.start(item.path)
            throw e
          }
        }
        item.status = 'trashed'
      } catch (error) {
        item.status = 'failed'; item.issue = issueOf(error)
        // A helper may have completed before its pipe closed. Recover from its durable receipt later.
        if (item.receipt && !await lstat(item.path).catch(() => null)) item.status = 'pending'
      }
      // Journal write failure stops the entire operation; do not continue making unrecorded changes.
      await journal.write(sessions)
    }
    return session
  }
  return {
    execute,
    async finish(session: JournalSession, remaining: number | null) {
      const sessions = await readSessions()
      const saved = sessions.find(s => s.id === session.id)
      if (!saved) throw new FileActionError('stale')
      saved.remaining = remaining
      await journal.write(sessions)
      return publicSession(saved)
    },
    async sessions() { return Promise.all((await readSessions()).map(publicSession)) },
    async undo(id: string) {
      const sessions = await readSessions()
      const session = sessions.find(s => s.id === id)
      if (!session) throw new FileActionError('stale')
      // Restore the bundle before its data, and agents last; never overwrite a recreated file/domain.
      const ordered = [...session.items].sort((a, b) => (a.kind === 'bundle' ? -1 : a.kind === 'agent' ? 1 : 0) - (b.kind === 'bundle' ? -1 : b.kind === 'agent' ? 1 : 0))
      for (const item of ordered) {
        if (item.status !== 'trashed') continue
        try {
          if (!(await restorable(item))) throw new FileActionError('changed')
          const parent = path.dirname(item.path)
          if (await realpath(parent) !== parent) throw new FileActionError('protected')
          await deps.checkUse(item.path)
          if (item.domain && item.backup) {
            if (await deps.preferences.exists(item.domain)) throw new FileActionError('collision')
            await deps.preferences.restore(item.domain, item.backup)
          } else if (item.trashedPath && item.snapshot) {
            if (await lstat(item.path).catch(e => { if (e.code === 'ENOENT') return null; throw e })) throw new FileActionError('collision')
            if ((await snapshot(item.trashedPath)).digest !== item.snapshot.digest) throw new FileActionError('changed')
            await deps.files.restore(item.trashedPath, item.path, item.snapshot)
            // A bootstrap failure must not misreport an already restored file as still in Trash.
            item.status = 'restored'
            if (item.launchLabel) await deps.agents.start(item.path)
          }
          item.status = 'restored'
          delete item.issue
        } catch (error) { item.issue = issueOf(error) }
        await journal.write(sessions)
      }
      return publicSession(session)
    },
  }
}

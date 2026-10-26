import { createHash, randomUUID } from 'node:crypto'
import { lstat, open, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import type { AppAction, AppActionSession, AppDataItem, AppsIssue } from '../../shared/appsApi'
import { createJournal, type JournalItem, type JournalSession } from './journal'
import type { createNativeFiles } from './native'
import { FileActionError, type FileSnapshot, snapshot, verify } from './verify'

export interface FileCandidate extends AppDataItem { snapshot?: FileSnapshot; domain?: string; launchLabel?: string }
export interface FileActionDeps {
  directory: string
  files: ReturnType<typeof createNativeFiles>
  policy: (path: string, allowMissing?: boolean) => Promise<void>
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
      if (item.restoring && item.snapshot && !item.domain) {
        try {
          const original = await snapshot(item.path).catch(() => null)
          const trash = item.trashedPath ? await lstat(item.trashedPath).catch(() => null) : null
          if (original?.digest === item.snapshot.digest && !trash) {
            item.status = 'restored'; delete item.restoring; delete item.issue; recovered = true
          } else if (!await lstat(item.path).catch(() => null) && trash?.dev === item.snapshot.dev && trash?.ino === item.snapshot.ino) {
            delete item.restoring; recovered = true
          }
        } catch { /* An uncertain restoration remains pending for manual verification. */ }
      }
      if (item.status !== 'pending' || !item.snapshot || item.restoring) continue
      try {
        if (item.domain && await validBackup(item) && !await deps.preferences.exists(item.domain)) {
          item.preferenceAfter = await preferenceState(item.path)
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
  async function backupDigest(file: string) {
    const st = await lstat(file)
    if (!st.isFile() || st.size > 100 * 1024 * 1024) throw new FileActionError('changed')
    return createHash('sha256').update(await readFile(file)).digest('hex')
  }
  async function preferenceState(file: string) {
    return snapshot(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
  }
  async function validBackup(item: JournalItem) {
    return Boolean(item.backup && path.dirname(item.backup) === journal.directory && item.backupDigest && await backupDigest(item.backup).catch(() => '') === item.backupDigest)
  }
  async function restorable(item: JournalItem): Promise<boolean> {
    if (item.status !== 'trashed' || !item.snapshot || item.restoring) return false
    if (item.domain) return validBackup(item)
    const st = item.trashedPath ? await lstat(item.trashedPath).catch(() => null) : null
    return Boolean(st && st.dev === item.snapshot.dev && st.ino === item.snapshot.ino)
  }
  async function publicSession(s: JournalSession): Promise<AppActionSession> {
    return { id: s.id, appName: s.appName, action: s.action, createdAt: s.createdAt, remaining: s.remaining,
      canUndo: (await Promise.all(s.items.map(restorable))).some(Boolean),
      items: s.items.map(({ path: p, status, issue, restoring }) => ({ path: p, status: restoring ? 'pending' : status, ...(issue ? { issue } : {}) })) }
  }
  async function execute(appName: string, action: AppAction, candidates: FileCandidate[], selected: Set<string>) {
    if (!deps.files.available()) throw new FileActionError('native-missing')
    const sessions = await readSessions()
    if (sessions.some(s => s.items.some(i => i.status === 'pending' || i.restoring))) throw new FileActionError('unreadable')
    const session: JournalSession = { id: randomUUID(), appName, action, createdAt: new Date().toISOString(), remaining: null,
      items: candidates.map(item => ({ path: item.path, kind: item.kind, snapshot: item.snapshot,
        domain: item.domain, launchLabel: item.launchLabel,
        status: item.blocked || !selected.has(item.id) ? 'skipped' : 'pending', issue: item.blocked })) }
    sessions.unshift(session)
    // Write intent BEFORE touching user files. Pending entries survive interruption; never claim success for them.
    await journal.write(sessions)
    // Validate the entire selection before the first mutation, then recheck each item at execution.
    for (const item of session.items) {
      if (item.status !== 'pending') continue
      try {
        if (!item.snapshot) throw new FileActionError('unreadable')
        await verify(item.path, item.snapshot, deps.policy)
        await deps.checkUse(item.path)
      } catch (error) {
        item.status = 'failed'; item.issue = issueOf(error)
        for (const remaining of session.items) if (remaining.status === 'pending') { remaining.status = 'skipped'; remaining.issue = 'failed' }
        await journal.write(sessions)
        return session
      }
    }
    let stopped = false
    for (const item of session.items) {
      if (item.status !== 'pending') continue
      if (stopped) { item.status = 'skipped'; item.issue = 'failed'; continue }
      try {
        if (!item.snapshot) throw new FileActionError('unreadable')
        await verify(item.path, item.snapshot, deps.policy)
        await deps.checkUse(item.path)
        if (item.domain) {
          item.backup = path.join(journal.directory, `${session.id}-${randomUUID()}.plist`)
          await deps.preferences.export(item.domain, item.backup)
          const backupFile = await open(item.backup, 'r')
          try { await backupFile.sync() } finally { await backupFile.close() }
          item.backupDigest = await backupDigest(item.backup)
          await journal.write(sessions)
          await deps.preferences.remove(item.domain)
          item.preferenceAfter = await preferenceState(item.path)
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
        stopped = true
        item.status = 'failed'; item.issue = issueOf(error)
        // A helper may have completed before its pipe closed. Recover from its durable receipt later.
        if (item.receipt && !await lstat(item.path).catch(() => null)) item.status = 'pending'
        if (item.domain && await validBackup(item)) item.status = 'pending'
      }
      // Journal write failure stops the entire operation; do not continue making unrecorded changes.
      await journal.write(sessions)
    }
    await journal.write(sessions)
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
      session.remaining = null
      // Restore the bundle before its data, and agents last; never overwrite a recreated file/domain.
      const ordered = [...session.items].sort((a, b) => (a.kind === 'bundle' ? -1 : a.kind === 'agent' ? 1 : 0) - (b.kind === 'bundle' ? -1 : b.kind === 'agent' ? 1 : 0))
      for (const item of ordered) {
        if (item.status !== 'trashed' || item.restoring) continue
        try {
          if (!(await restorable(item))) throw new FileActionError('changed')
          await deps.policy(item.path, true)
          const parent = path.dirname(item.path)
          if (await realpath(parent) !== parent) throw new FileActionError('protected')
          await deps.checkUse(item.path)
          if (item.domain && item.backup) {
            if (item.kind !== 'preferences' || !/^[A-Za-z0-9][A-Za-z0-9.-]{2,199}$/.test(item.domain)
              || !item.domain.includes('.') || path.basename(item.path) !== `${item.domain}.plist`
              || !path.dirname(item.path).endsWith('/Library/Preferences')) throw new FileActionError('protected')
            if (await deps.preferences.exists(item.domain)) throw new FileActionError('collision')
            const current = await preferenceState(item.path)
            if (item.preferenceAfter === undefined || current?.digest !== item.preferenceAfter?.digest) throw new FileActionError('changed')
            item.restoring = true
            await journal.write(sessions)
            await deps.preferences.restore(item.domain, item.backup)
          } else if (item.trashedPath && item.snapshot) {
            if (await lstat(item.path).catch(e => { if (e.code === 'ENOENT') return null; throw e })) throw new FileActionError('collision')
            if ((await snapshot(item.trashedPath)).digest !== item.snapshot.digest) throw new FileActionError('changed')
            item.restoring = true
            await journal.write(sessions)
            await deps.files.restore(item.trashedPath, item.path, item.snapshot)
            if ((await snapshot(item.path)).digest !== item.snapshot.digest) throw new FileActionError('changed')
            // A bootstrap failure must not misreport an already restored file as still in Trash.
            item.status = 'restored'
            if (item.launchLabel) await deps.agents.start(item.path)
          }
          item.status = 'restored'
          delete item.restoring
          delete item.issue
        } catch (error) {
          item.issue = issueOf(error)
          if (item.status === 'restored') delete item.restoring
          await journal.write(sessions)
          // A replacement bundle or conflicting data must not receive the rest of an old installation.
          break
        }
        await journal.write(sessions)
      }
      return publicSession(session)
    },
  }
}

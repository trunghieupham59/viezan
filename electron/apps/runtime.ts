import { randomUUID } from 'node:crypto'
import { chmod, lstat } from 'node:fs/promises'
import path from 'node:path'
import type { AppActionRequest, AppRemovalPlan, AppsApi, AppsReply } from '../../shared/appsApi'
import { createNativeFiles, runFile } from '../fileActions/native'
import { createFileActions, type FileCandidate, issueOf } from '../fileActions/service'
import { createPathPolicy, FileActionError, within } from '../fileActions/verify'
import { type AppRecord, inventory } from './inventory'
import { residues } from './residues'

export interface AppsRuntimeOptions {
  home: string
  userData: string
  ownBundle: string
  binary: string
  uid: number
  platform: string
  confirm: (plan: AppRemovalPlan, request: AppActionRequest) => Promise<boolean>
  reveal: (path: string) => void
}
export type AppsRuntime = ReturnType<typeof createAppsRuntime>
export function createAppsRuntime(options: AppsRuntimeOptions) {
  const files = createNativeFiles(options.binary)
  const policy = createPathPolicy(options.home, options.userData)
  let enabled = false
  let busy = false
  let apps: AppRecord[] = []
  let plan: (Omit<AppRemovalPlan, 'items'> & { items: FileCandidate[]; expires: number }) | null = null
  let activeBundle = ''
  async function guard<T>(work: () => Promise<T>): Promise<AppsReply<T>> {
    if (options.platform !== 'darwin') return { success: false, error: 'unsupported' }
    if (!enabled) return { success: false, error: 'disabled' }
    if (busy) return { success: false, error: 'busy' }
    busy = true
    try { return { success: true, data: await work() } }
    catch (error) { return { success: false, error: issueOf(error) } }
    finally { busy = false; activeBundle = '' }
  }
  async function assertNotInUse(target: string) {
    if (!enabled) throw new FileActionError('disabled')
    if (activeBundle && await files.running(activeBundle)) throw new FileActionError('in-use')
    let output = ''
    try { output = (await runFile('/usr/sbin/lsof', ['-n', '-P', '-a', '-u', String(options.uid), '-Fpn'], { timeout: 15_000, maxBuffer: 16 * 1024 * 1024 })).stdout }
    catch (error) {
      // Exit 1 with empty stdout means no open files, not a successful partial scan.
      const e = error as { code?: number; stdout?: string }
      if (e.code !== 1 || e.stdout) throw new FileActionError('unreadable')
    }
    if (output.split('\n').some(line => line.startsWith('n') && within(target, line.slice(1)))) throw new FileActionError('in-use')
  }
  const command = (file: string, args: string[]) => runFile(file, args, { timeout: 15_000, maxBuffer: 1024 * 1024 })
  const actions = createFileActions({
    directory: path.join(options.userData, 'fileActions'), files, policy, checkUse: assertNotInUse,
    preferences: {
      export: async (domain, destination) => { await command('/usr/bin/defaults', ['export', domain, destination]); await chmod(destination, 0o600) },
      remove: async domain => { await command('/usr/bin/defaults', ['delete', domain]) },
      restore: async (domain, source) => { await command('/usr/bin/defaults', ['import', domain, source]) },
      exists: async domain => {
        try { await command('/usr/bin/defaults', ['read', domain]); return true }
        catch (e) { if ((e as { code?: number }).code === 1) return false; throw e }
      },
    },
    agents: {
      stop: async label => {
        // Not loaded is safe; distinguish it from a bootout failure for a loaded service.
        const target = `gui/${options.uid}/${label}`
        try { await command('/bin/launchctl', ['print', target]) }
        catch (e) { if ((e as { code?: number }).code === 113) return; throw e }
        await command('/bin/launchctl', ['bootout', target])
      },
      start: async file => { await command('/bin/launchctl', ['bootstrap', `gui/${options.uid}`, file]) },
    },
  })
  async function apply(request: AppActionRequest) {
    const current = plan
    if (!current || current.id !== request.planId || current.expires < Date.now()) throw new FileActionError('stale')
    if (current.app.blocked) throw new FileActionError(current.app.blocked)
    const selected = new Set(request.itemIds)
    if (!selected.size || selected.size !== request.itemIds.length || request.itemIds.some(id => !current.items.some(i => i.id === id && !i.blocked))) throw new FileActionError('stale')
    const bundle = current.items.find(i => i.kind === 'bundle')
    if (!bundle || (request.action === 'uninstall') !== selected.has(bundle.id)) throw new FileActionError('stale')
    if (!await options.confirm(current, request)) throw new FileActionError('cancelled')
    // Disabling the module while the native confirmation was open cancels the action.
    if (!enabled) throw new FileActionError('disabled')
    // Installed siblings may have changed since preview; never use stale shared-data ownership.
    const latest = await inventory(options.home, options.ownBundle)
    const original = apps.find(a => a.id === current.app.id)
    const target = latest.find(a => a.path === current.app.path && a.bundleId === current.app.bundleId && a.teamId === original?.teamId)
    if (!target || target.blocked) throw new FileActionError('stale')
    const checked = await residues(target, latest, options.home)
    for (const item of current.items) {
      const fresh = checked.items.find(i => i.path === item.path)
      if (!fresh) item.blocked = 'changed'
      else if (fresh.blocked) item.blocked = fresh.blocked
    }
    activeBundle = current.app.path
    if (await files.running(activeBundle)) {
      if (!request.quit) throw new FileActionError('in-use')
      await files.quit(activeBundle)
    }
    plan = null // Single-use approval, even when a later operation fails.
    // Stop agents first, data next, bundle last. A running process that respawns blocks subsequent items.
    const ordered = [...current.items].sort((a, b) => (a.kind === 'agent' ? -1 : a.kind === 'bundle' ? 1 : 0) - (b.kind === 'agent' ? -1 : b.kind === 'bundle' ? 1 : 0))
    const session = await actions.execute(current.app.name, request.action, ordered, selected)
    try {
      const after = await residues(target, latest, options.home)
      return await actions.finish(session, after.incomplete ? null : after.items.filter(i => request.action !== 'reset' || i.kind !== 'bundle').length)
    } catch { return actions.finish(session, null) }
  }
  const api: AppsApi = {
    inventory: () => guard(async () => {
      plan = null
      apps = await inventory(options.home, options.ownBundle)
      // A managed device needs its administrator's removal policy; V1 does not infer per-app MDM ownership.
      try {
        const { stdout } = await command('/usr/bin/profiles', ['status', '-type', 'enrollment'])
        if (/(?:MDM enrollment|Enrolled via DEP):\s*Yes/i.test(stdout)) apps = apps.map(a => ({ ...a, blocked: 'protected' }))
      } catch { apps = apps.map(a => ({ ...a, blocked: 'unreadable' })) }
      return apps.map(({ teamId: _team, executable: _exe, ...app }) => app)
    }),
    inspect: id => guard(async () => {
      const app = apps.find(a => a.id === id)
      if (!app) throw new FileActionError('stale')
      const scan = await residues(app, apps, options.home)
      plan = { id: randomUUID(), app, ...scan, running: files.available() ? await files.running(app.path) : false, canUndo: files.available(), expires: Date.now() + 5 * 60_000 }
      const { teamId: _team, executable: _exe, ...publicApp } = app
      const { expires: _expires, ...publicPlan } = plan
      return { ...publicPlan, app: publicApp, items: plan.items.map(({ snapshot: _snapshot, domain: _domain, launchLabel: _label, ...i }) => i) }
    }),
    apply: request => guard(() => apply(request)),
    sessions: () => guard(() => actions.sessions()),
    undo: id => guard(async () => {
      const session = (await actions.sessions()).find(s => s.id === id)
      if (!session) throw new FileActionError('stale')
      activeBundle = session.items.find(i => i.path.endsWith('.app'))?.path ?? ''
      plan = null
      return actions.undo(id)
    }),
    reveal: id => guard(async () => {
      const target = plan?.items.find(i => i.id === id)?.path ?? apps.find(a => a.id === id)?.path
      if (!target || !await lstat(target).catch(() => null)) throw new FileActionError('stale')
      options.reveal(target)
      return null
    }),
  }
  return { api, start: () => { enabled = true }, stop: () => { enabled = false; plan = null } }
}

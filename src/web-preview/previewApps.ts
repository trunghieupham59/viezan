import type { AppActionSession, AppRemovalPlan, AppsApi, InstalledApp } from '../../shared/appsApi'

/** Synthetic fixtures only: the web preview never reads or changes the host's applications. */
export function createPreviewApps(): AppsApi {
  const app: InstalledApp = { id: 'sample-app', name: 'Sample Notes', bundleId: 'org.example.notes', path: '/Applications/Sample Notes.app', version: '1.2.0' }
  const items: AppRemovalPlan['items'] = [
    { id: 'bundle', path: app.path, kind: 'bundle', evidence: 'exact', bytes: 125_000_000, selected: true },
    { id: 'cache', path: '~/Library/Caches/org.example.notes', kind: 'data', evidence: 'exact', bytes: 15_000_000, selected: true },
    { id: 'preferences', path: '~/Library/Preferences/org.example.notes.plist', kind: 'preferences', evidence: 'exact', bytes: 4096, selected: false },
    { id: 'shared', path: '~/Library/Group Containers/EXAMPLE.Shared', kind: 'data', evidence: 'vendor', bytes: 30_000_000, selected: false, blocked: 'shared' },
    { id: 'admin', path: '/Library/LaunchDaemons/org.example.notes.plist', kind: 'data', evidence: 'exact', bytes: 4096, selected: false, blocked: 'needs-admin' },
  ]
  let history: AppActionSession[] = []
  return {
    inventory: async () => ({ success: true, data: [app] }),
    inspect: async () => ({ success: true, data: { id: 'preview-plan', app, items, running: false, incomplete: false, canUndo: true } }),
    apply: async request => {
      const session: AppActionSession = { id: `preview-${Date.now()}`, appName: app.name, action: request.action, createdAt: new Date().toISOString(), canUndo: true, remaining: items.length - request.itemIds.length,
        items: items.map(i => ({ path: i.path, status: request.itemIds.includes(i.id) ? 'trashed' : 'skipped', issue: i.blocked })) }
      history = [session, ...history]
      return { success: true, data: session }
    },
    sessions: async () => ({ success: true, data: history }),
    undo: async id => {
      const session = history.find(s => s.id === id)
      if (!session) return { success: false, error: 'stale' }
      session.items = session.items.map(i => ({ ...i, status: i.status === 'trashed' ? 'restored' : i.status }))
      session.remaining = null
      session.canUndo = false
      return { success: true, data: session }
    },
    reveal: async () => ({ success: true, data: null }),
  }
}

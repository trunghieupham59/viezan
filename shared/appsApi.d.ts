/** Opaque, main-owned app/item/plan/session IDs. No mutation accepts a path. */
export type AppsIssue = 'unsupported' | 'disabled' | 'busy' | 'stale' | 'protected' | 'shared' | 'in-use' | 'needs-admin' | 'unreadable' | 'changed' | 'failed' | 'cancelled' | 'native-missing' | 'collision'
export type AppsReply<T> = { success: true; data: T } | { success: false; error: AppsIssue }
export interface InstalledApp {
  id: string
  name: string
  bundleId: string
  path: string
  version: string
  blocked?: AppsIssue
}
export interface AppDataItem {
  id: string
  path: string
  kind: 'bundle' | 'data' | 'preferences' | 'agent'
  evidence: 'exact' | 'vendor' | 'name'
  bytes: number | null
  selected: boolean
  blocked?: AppsIssue
}
export interface AppRemovalPlan {
  id: string
  app: InstalledApp
  items: AppDataItem[]
  running: boolean
  canUndo: boolean
  /** A partial scan must never be reported as a clean uninstall. */
  incomplete: boolean
}
export type AppAction = 'uninstall' | 'reset'
export interface AppActionRequest {
  planId: string
  itemIds: string[]
  action: AppAction
  quit: boolean
  locale: 'vi' | 'en' | 'ja'
}
export interface AppSessionItem {
  path: string
  status: 'pending' | 'trashed' | 'restored' | 'skipped' | 'failed'
  issue?: AppsIssue
}
export interface AppActionSession {
  id: string
  appName: string
  action: AppAction
  createdAt: string
  items: AppSessionItem[]
  canUndo: boolean
  /** null means that the post-action scan could not complete. */
  remaining: number | null
}
export interface AppsApi {
  inventory: () => Promise<AppsReply<InstalledApp[]>>
  inspect: (appId: string) => Promise<AppsReply<AppRemovalPlan>>
  apply: (request: AppActionRequest) => Promise<AppsReply<AppActionSession>>
  sessions: () => Promise<AppsReply<AppActionSession[]>>
  undo: (sessionId: string) => Promise<AppsReply<AppActionSession>>
  reveal: (itemId: string) => Promise<AppsReply<null>>
}

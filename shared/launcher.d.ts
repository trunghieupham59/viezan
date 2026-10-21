export interface LauncherApp {
  id: string
  name: string
  iconDataUrl?: string
}

export interface LauncherResult {
  success: boolean
  errorCode?: 'UNAVAILABLE' | 'INVALID' | 'NOT_FOUND' | 'OPEN_FAILED'
}

export interface LauncherIcon {
  id: string
  dataUrl: string
}

/** Main-window features the launcher can open with an optional seed text. */
export type LauncherFeature = 'translate' | 'dictionary' | 'live'

export interface LauncherFeatureRequest {
  feature: LauncherFeature
  text?: string
}

export interface LauncherApi {
  /** `recent` lists catalog IDs most recently opened from the launcher, newest first. */
  listApps: () => Promise<LauncherResult & { apps: LauncherApp[]; recent?: string[] }>
  getIcons: (ids: string[]) => Promise<LauncherResult & { icons: LauncherIcon[] }>
  onIcons: (callback: (icons: LauncherIcon[]) => void) => () => void
  openApp: (id: string) => Promise<LauncherResult>
  searchWeb: (query: string) => Promise<LauncherResult>
}

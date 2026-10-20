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

export interface LauncherApi {
  listApps: () => Promise<LauncherResult & { apps: LauncherApp[] }>
  getIcons: (ids: string[]) => Promise<LauncherResult & { icons: LauncherIcon[] }>
  onIcons: (callback: (icons: LauncherIcon[]) => void) => () => void
  openApp: (id: string) => Promise<LauncherResult>
  searchWeb: (query: string) => Promise<LauncherResult>
}

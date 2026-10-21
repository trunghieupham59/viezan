import type { ThemeAccent, ThemeMode, ThemePreset } from './theme'

export interface UpdateNotificationPreferences {
  enabled: boolean
  locale: 'en' | 'vi' | 'ja'
  theme: ThemeMode
  themePreset: ThemePreset
  themeAccent: ThemeAccent
}

export interface UpdateNotificationSnapshot extends UpdateNotificationPreferences {
  version: string
  ready: boolean
  downloading?: boolean
  percent?: number
  error?: boolean
}

export type UpdateNotificationAction = 'view' | 'later' | 'dismiss' | 'download' | 'install'

export interface UpdatePopupApi {
  getSnapshot: () => Promise<UpdateNotificationSnapshot | null>
  onSnapshot: (cb: (snapshot: UpdateNotificationSnapshot) => void) => () => void
  act: (action: UpdateNotificationAction) => Promise<boolean>
}

export interface UpdateNotificationPreferences {
  enabled: boolean
  locale: 'en' | 'vi' | 'ja'
  theme: 'light' | 'dark' | 'system'
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

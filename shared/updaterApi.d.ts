/**
 * Updater API — check, download and install app updates from GitHub Releases, plus the
 * native update-notification preferences. Single source for `window.api.updater`; see
 * `electron/preload/updater.ts`, `electron/ipc/updater.ts` and `electron/updateNotification.ts`.
 */
import type { UpdateNotificationPreferences } from './updateNotification'
import type { UpdateStatus } from './updater'

export interface UpdaterDownloadResult {
  success: boolean
  error?: string
  errorCode?: string
  filePath?: string
  /** Whether the download's signature/checksum was verified. */
  verified?: boolean
}

export interface UpdaterApi {
  /**
   * Native-notification members. The in-app update dialog treats their presence as "the
   * OS notification handles prompting", so they stay optional and the web preview and the
   * test setup leave them out to get the in-app dialog.
   */
  consumeOpenSettings?: () => Promise<boolean>
  getNotificationPreferences?: () => Promise<UpdateNotificationPreferences | null>
  setNotificationPreferences?: (patch: Partial<UpdateNotificationPreferences>) => Promise<UpdateNotificationPreferences | null>
  onOpenSettings?: (callback: () => void) => () => void
  getStatus?: () => Promise<UpdateStatus | null>
  /** Trigger a check; the result arrives through `onStatus`. */
  check: () => Promise<{ success: boolean; error?: string }>
  /** In-app download. macOS downloads the DMG without opening Finder. */
  download: () => Promise<UpdaterDownloadResult>
  /** Quit and install, or delegate to the platform updater. */
  install: () => Promise<{ success: boolean; error?: string }>
  /** Manual fallback for macOS: open the downloaded DMG in Finder. */
  openInstaller: () => Promise<{ success: boolean; error?: string }>
  getVersion: () => Promise<{ version: string }>
  /** Open the download URL in the system browser; falls back to the GitHub Releases page. */
  openDownload: (url?: string) => Promise<{ success: boolean }>
  onStatus: (cb: (status: UpdateStatus) => void) => () => void
}

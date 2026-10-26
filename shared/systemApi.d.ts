/**
 * System API — OS permissions, external URLs, login item, native window chrome and
 * app metadata. The single source for these top-level `window.api` members; see
 * `electron/preload/system.ts` and `electron/ipc/system.ts`.
 */
import type { ThemeMode, ThemePreset } from './theme'

/** macOS Screen Recording permission as reported by Electron; always 'granted' elsewhere. */
export type ScreenPermissionStatus = 'granted' | 'denied' | 'restricted' | 'unknown' | 'not-determined' | (string & {})

export interface LoginItemSettings {
  /** False in development runs and on Linux, where launch-at-login is not offered. */
  supported: boolean
  openAtLogin: boolean
}

export interface LoginItemUpdateResult {
  success: boolean
  openAtLogin: boolean
  error?: string
}

export interface SystemApi {
  /** Main-window lifecycle only; subscribing never starts recording or AI work. */
  onSessionActivity: (callback: (activity: 'away' | 'back') => void) => () => void
  onPrepareSessionSave: (callback: () => void) => () => void
  completeSessionSave: () => Promise<void>
  checkScreenPermission: () => Promise<ScreenPermissionStatus>
  /** Open a URL in the system browser or a System Settings deep link (allow-listed in main). */
  openExternal: (url: string) => Promise<void>
  relaunchApp: () => Promise<void>
  getLoginItemSettings: () => Promise<LoginItemSettings>
  setLoginItemSettings: (openAtLogin: boolean) => Promise<LoginItemUpdateResult>
  /** Align native window chrome (title bar overlay, background) with the in-app theme. */
  setWindowTheme: (theme: ThemeMode, preset?: ThemePreset) => Promise<void>
  /** `process.platform` of the main process. */
  platform: string
  /** App version string. */
  version: string
}

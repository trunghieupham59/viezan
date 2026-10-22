import type { BrowserWindow, IpcMain } from 'electron'
import { app, nativeTheme, shell, systemPreferences } from 'electron'
import type { ThemePreset } from '../../shared/theme'
import { loginItemArgs, supportsLoginItem } from '../loginItem'
import { isThemePreset } from '../windowPalette'
import { isAllowedExternalUrl } from './externalUrl'
import { isSenderWindow } from './senderGuard'

export function registerSystemHandlers(
  ipc: IpcMain,
  getMainWindow?: () => BrowserWindow | null,
  applyWindowPalette?: (preset: ThemePreset) => void,
) {
  // ── Check Screen Recording permission (macOS) ───────────────────────────
  ipc.handle('app:checkScreenPermission', () => {
    if (process.platform === 'darwin') {
      return systemPreferences.getMediaAccessStatus('screen') // 'granted' | 'denied' | 'restricted' | 'unknown' | 'not-determined'
    }
    return 'granted'
  })

  // ── Open external URL (used by renderer to open System Settings deep links) ──
  ipc.handle('app:openExternal', async (_event, url: string) => {
    if (!isAllowedExternalUrl(url)) return
    try {
      await shell.openExternal(url)
    } catch (err) {
      console.error('[openExternal] failed:', err)
    }
  })

  // ── Sync native window chrome with the in-app theme ─────────────────────
  // `themeSource` drives nativeTheme.shouldUseDarkColors, which in turn
  // refreshes the window background and Windows title bar overlay. The
  // palette preset picks which colour table that refresh reads from.
  ipc.handle('app:setWindowTheme', (event, theme: unknown, preset?: unknown) => {
    if (getMainWindow && !isSenderWindow(event, getMainWindow)) return
    if (theme !== 'light' && theme !== 'dark' && theme !== 'system') return
    if (preset !== undefined && isThemePreset(preset)) applyWindowPalette?.(preset)
    nativeTheme.themeSource = theme
  })

  // ── Launch at login ──────────────────────────────────────────────────────
  // The OS (Run key / login items) is the only store for this preference, so
  // Settings always reflects what will really happen at the next sign-in.
  const loginItemSupported = () => supportsLoginItem(process.platform, app.isPackaged)
  const readLoginItem = () => {
    if (!loginItemSupported()) return { supported: false, openAtLogin: false }
    try {
      return { supported: true, openAtLogin: app.getLoginItemSettings({ args: loginItemArgs(process.platform) }).openAtLogin }
    } catch {
      return { supported: false, openAtLogin: false }
    }
  }
  ipc.handle('app:getLoginItemSettings', (event) => {
    if (getMainWindow && !isSenderWindow(event, getMainWindow)) return { supported: false, openAtLogin: false }
    return readLoginItem()
  })
  ipc.handle('app:setLoginItemSettings', (event, openAtLogin: unknown) => {
    if (getMainWindow && !isSenderWindow(event, getMainWindow)) {
      return { success: false, openAtLogin: false, error: 'Untrusted sender' }
    }
    if (typeof openAtLogin !== 'boolean') return { success: false, ...readLoginItem(), error: 'Invalid value' }
    if (!loginItemSupported()) return { success: false, openAtLogin: false, error: 'Not supported on this platform or build' }
    try {
      app.setLoginItemSettings({ openAtLogin, args: loginItemArgs(process.platform) })
    } catch (err) {
      console.error('[loginItem] setLoginItemSettings failed:', err)
      return { success: false, ...readLoginItem(), error: err instanceof Error ? err.message : String(err) }
    }
    const current = readLoginItem()
    return { success: current.openAtLogin === openAtLogin, openAtLogin: current.openAtLogin }
  })

  // Relaunch through the normal quit path so `will-quit` cleanup (global
  // hotkeys, local server, managed Ollama) runs. `app.exit()` would skip it.
  ipc.handle('app:relaunch', (event) => {
    if (getMainWindow && !isSenderWindow(event, getMainWindow)) {
      return { success: false, error: 'Untrusted sender' }
    }
    app.relaunch()
    app.quit()
    return { success: true }
  })
}

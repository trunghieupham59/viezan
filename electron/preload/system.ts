/**
 * System preload API — OS permissions, external URLs, app metadata.
 */
import { ipcRenderer } from 'electron'

export const systemSection = {
  // Check macOS Screen Recording permission status
  // Returns: 'granted' | 'denied' | 'restricted' | 'unknown' | 'not-determined'
  checkScreenPermission: () =>
    ipcRenderer.invoke('app:checkScreenPermission') as Promise<string>,

  // Open a URL in the system browser or a macOS Settings deep link
  openExternal: (url: string) =>
    ipcRenderer.invoke('app:openExternal', url),

  relaunchApp: () =>
    ipcRenderer.invoke('app:relaunch'),

  // Launch at login (Windows / macOS packaged builds only)
  getLoginItemSettings: () =>
    ipcRenderer.invoke('app:getLoginItemSettings') as Promise<{ supported: boolean; openAtLogin: boolean }>,
  setLoginItemSettings: (openAtLogin: boolean) =>
    ipcRenderer.invoke('app:setLoginItemSettings', openAtLogin) as Promise<{ success: boolean; openAtLogin: boolean; error?: string }>,

  // Sync native window chrome with the in-app theme preference
  setWindowTheme: (theme: 'light' | 'dark' | 'system', preset?: string) =>
    ipcRenderer.invoke('app:setWindowTheme', theme, preset) as Promise<void>,

  // App metadata
  platform: process.platform,
  version: process.env.npm_package_version || '1.0.0',
}

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

  // Sync native window chrome with the in-app theme preference
  setWindowTheme: (theme: 'light' | 'dark' | 'system') =>
    ipcRenderer.invoke('app:setWindowTheme', theme) as Promise<void>,

  // App metadata
  platform: process.platform,
  version: process.env.npm_package_version || '1.0.0',
}

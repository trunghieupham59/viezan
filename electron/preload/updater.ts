/**
 * Auto-updater preload API — check, download, and install app updates.
 */
import { ipcRenderer } from 'electron'
import type { UpdateStatus } from '../../shared/updater'

export const updaterSection = {
  updater: {
    getStatus: () => ipcRenderer.invoke('updater:getStatus') as Promise<UpdateStatus | null>,
    /** Trigger a check for updates. Status is pushed via onStatus(). */
    check: () =>
      ipcRenderer.invoke('updater:check') as Promise<{ success: boolean; error?: string }>,
    /** Start downloading an available update. macOS downloads the DMG without opening Finder. */
    download: () =>
      ipcRenderer.invoke('updater:download') as Promise<{ success: boolean; error?: string; errorCode?: string; filePath?: string; verified?: boolean }>,
    /** Quit and install, or delegate to the platform updater. */
    install: () =>
      ipcRenderer.invoke('updater:install') as Promise<{ success: boolean; error?: string }>,
    /** Manual fallback for macOS: open the downloaded DMG in Finder. */
    openInstaller: () =>
      ipcRenderer.invoke('updater:openInstaller') as Promise<{ success: boolean; error?: string }>,
    /** Get the current app version. */
    getVersion: () =>
      ipcRenderer.invoke('updater:getVersion') as Promise<{ version: string }>,
    /**
     * Open the download URL in the system browser.
     * Fallback only; macOS update downloads normally use updater.download().
     * Falls back to the GitHub Releases page if no URL is provided.
     */
    openDownload: (url?: string) =>
      ipcRenderer.invoke('updater:openDownload', url) as Promise<{ success: boolean }>,
    /**
     * Subscribe to update status events pushed from the main process.
     * Returns a cleanup function — call it to unsubscribe.
     */
    onStatus: (cb: (status: UpdateStatus) => void) => {
      const handler = (_: unknown, status: Parameters<typeof cb>[0]) => cb(status)
      ipcRenderer.on('updater:status', handler)
      return () => ipcRenderer.removeListener('updater:status', handler)
    },
  },
}

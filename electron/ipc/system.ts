import type { BrowserWindow, IpcMain } from 'electron'
import { app, shell, systemPreferences } from 'electron'
import { isAllowedExternalUrl } from './externalUrl'
import { isSenderWindow } from './senderGuard'

export function registerSystemHandlers(ipc: IpcMain, getMainWindow?: () => BrowserWindow | null) {
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

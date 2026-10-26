import { app, type BrowserWindow, ipcMain, powerMonitor } from 'electron'
import { SYSTEM_CHANNELS } from './ipc/channels'
import { isSenderWindow } from './ipc/senderGuard'

const SAVE_BEFORE_QUIT_TIMEOUT_MS = 1500

/** Bounded graceful-quit save. OS shutdown/crashes still rely on regular checkpoints. */
export function registerSessionLifecycle(getWindow: () => BrowserWindow | null): void {
  let quitReady = false
  let quitTimer: ReturnType<typeof setTimeout> | undefined
  const finish = () => {
    if (!quitTimer) return
    clearTimeout(quitTimer)
    quitTimer = undefined
    quitReady = true
    app.quit()
  }
  ipcMain.handle(SYSTEM_CHANNELS.invoke.completeSessionSave, (event) => {
    if (isSenderWindow(event, getWindow)) finish()
  })
  const send = (activity: 'away' | 'back') => {
    const window = getWindow()
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send(SYSTEM_CHANNELS.event.sessionActivity, activity)
  }
  powerMonitor.on('suspend', () => send('away'))
  powerMonitor.on('lock-screen', () => send('away'))
  powerMonitor.on('resume', () => send('back'))
  powerMonitor.on('unlock-screen', () => send('back'))
  app.on('before-quit', (event) => {
    const window = getWindow()
    if (quitReady || !window || window.isDestroyed() || window.webContents.isDestroyed()) return
    event.preventDefault()
    if (quitTimer) return
    quitTimer = setTimeout(finish, SAVE_BEFORE_QUIT_TIMEOUT_MS)
    window.webContents.send(SYSTEM_CHANNELS.event.prepareSessionSave)
  })
}

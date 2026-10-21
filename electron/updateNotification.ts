import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, type IpcMain, screen } from 'electron'
import type { UpdateNotificationSnapshot } from '../shared/updateNotification'
import type { UpdateStatus } from '../shared/updater'
import { isSenderWindow } from './ipc/senderGuard'
import { isNotificationStatus, NOTIFICATION_SNOOZE_MS, readNotificationState } from './ipc/updateNotificationState'
import { isThemePreset } from './windowPalette'

/** Main owns notification policy even while every renderer is hidden. */
export function createUpdateNotification(
  ipc: IpcMain,
  getMainWindow: () => BrowserWindow | null,
  showMainWindow: () => void,
  actions?: { download: () => Promise<{ success: boolean }>; install: () => Promise<{ success: boolean }> },
) {
  const file = path.join(app.getPath('userData'), 'update-notifications.json')
  let state = readNotificationState(null)
  try { state = readNotificationState(JSON.parse(readFileSync(file, 'utf8'))) } catch { /* First launch or invalid preferences. */ }
  let popup: BrowserWindow | null = null
  let status: UpdateStatus | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let pendingOpenSettings = false
  let actionRunning = false
  let reminderSaveFailed = false
  const preferences = () => ({ enabled: state.enabled, locale: state.locale, theme: state.theme, themePreset: state.themePreset })
  const snapshot = (): UpdateNotificationSnapshot => ({
    ...preferences(), version: status?.version ?? '', ready: status?.type === 'downloaded',
    downloading: status?.type === 'downloading', percent: status?.percent, error: reminderSaveFailed || !!status?.error,
  })
  const save = () => {
    // Atomic replacement, with no credentials or updater download URLs on disk.
    try {
      writeFileSync(`${file}.tmp`, JSON.stringify(state), { mode: 0o600 })
      renameSync(`${file}.tmp`, file)
      return true
    } catch { console.warn('[updater] Could not persist notification preferences'); return false }
  }
  const hide = () => { if (popup && !popup.isDestroyed()) popup.hide() }
  const dismiss = () => {
    if (status?.version) {
      const previous = state
      state = { ...state, snoozes: { ...readNotificationState(state).snoozes, [status.version]: Date.now() + NOTIFICATION_SNOOZE_MS } }
      if (!save()) {
        state = previous
        reminderSaveFailed = true
        refresh()
        return false
      }
    }
    reminderSaveFailed = false
    hide()
    refresh()
    return true
  }
  const refresh = () => {
    clearTimeout(timer)
    if (stopped || !state.enabled || !status || !isNotificationStatus(status)) { hide(); return }
    const until = state.snoozes[status.version ?? ''] ?? 0
    if (until > Date.now()) {
      hide()
      timer = setTimeout(refresh, Math.min(until - Date.now(), NOTIFICATION_SNOOZE_MS))
      timer.unref?.()
      return
    }
    if (!popup || popup.isDestroyed()) {
      const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
      // Native window geometry (DIP), separate from renderer design tokens.
      const width = Math.min(440, area.width)
      const height = Math.min(320, area.height)
      const win = new BrowserWindow({
        width, height, x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2),
        show: false, alwaysOnTop: true, skipTaskbar: true, frame: false, thickFrame: false,
        resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
        title: 'Viezan',
        webPreferences: {
          preload: path.join(__dirname, 'update-notification-preload.js'),
          contextIsolation: true, nodeIntegration: false, sandbox: true,
        },
      })
      popup = win
      win.on('close', (event) => { if (!stopped) { event.preventDefault(); dismiss() } })
      win.on('closed', () => { if (popup === win) popup = null })
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      win.once('ready-to-show', refresh)
      win.webContents.once('did-finish-load', refresh)
      const loaded = app.isPackaged
        ? win.loadFile(path.join(__dirname, '..', 'dist', 'update-notification.html'))
        : win.loadURL('http://localhost:5173/update-notification.html')
      void loaded.catch(() => { win.destroy(); console.warn('[updater] Notification window failed to load') })
      return
    }
    popup.webContents.send('update-popup:snapshot', snapshot())
    if (!popup.webContents.isLoading() && !popup.isVisible()) {
      popup.showInactive()
      // Windows can demote the default floating level when another app is
      // foreground. Apply the popup level AFTER showInactive; changing the
      // stacking level does not activate the window or take keyboard focus.
      popup.setAlwaysOnTop(true, 'pop-up-menu')
      popup.center()
    }
  }
  const trustedMain = (event: Parameters<typeof isSenderWindow>[0]) => isSenderWindow(event, getMainWindow)
  const trustedPopup = (event: Parameters<typeof isSenderWindow>[0]) => isSenderWindow(event, () => popup)
  ipc.handle('updater:notificationPreferences', (event) => trustedMain(event) ? preferences() : null)
  ipc.handle('updater:consumeOpenSettings', (event) => {
    if (!trustedMain(event)) return false
    const pending = pendingOpenSettings
    pendingOpenSettings = false
    return pending
  })
  ipc.handle('updater:setNotificationPreferences', (event, patch: unknown) => {
    if (!trustedMain(event) || !patch || typeof patch !== 'object') return null
    const input = patch as Record<string, unknown>
    const previous = state
    state = readNotificationState({ ...state,
      ...(typeof input.enabled === 'boolean' ? { enabled: input.enabled } : {}),
      ...(['en', 'vi', 'ja'].includes(String(input.locale)) ? { locale: input.locale } : {}),
      ...(['light', 'dark', 'system'].includes(String(input.theme)) ? { theme: input.theme } : {}),
      ...(isThemePreset(input.themePreset) ? { themePreset: input.themePreset } : {}),
    })
    if (!save()) { state = previous; return null }
    refresh()
    return preferences()
  })
  ipc.handle('update-popup:snapshot', (event) => trustedPopup(event) ? snapshot() : null)
  ipc.handle('update-popup:act', (event, action: unknown) => {
    if (!trustedPopup(event) || !['view', 'later', 'dismiss', 'download', 'install'].includes(String(action))) return false
    if (action === 'download' || action === 'install') {
      if (!actions || actionRunning || status?.type !== (action === 'download' ? 'available' : 'downloaded')) return false
      actionRunning = true
      return (async () => {
        try {
          const result = await actions[action]()
          if (!result.success && status) {
            status = { ...status, type: action === 'download' ? 'available' : 'downloaded', error: 'action-failed' }
            refresh()
          }
          return result.success
        } catch {
          if (status) { status = { ...status, type: action === 'download' ? 'available' : 'downloaded', error: 'action-failed' }; refresh() }
          return false
        } finally { actionRunning = false }
      })()
    }
    if (!dismiss()) return false
    if (action === 'view') {
      pendingOpenSettings = true
      showMainWindow()
      const win = getMainWindow()
      const open = () => { if (win && !win.isDestroyed()) win.webContents.send('updater:openSettings') }
      if (win?.webContents.isLoading()) win.webContents.once('did-finish-load', open)
      else open()
    }
    return true
  })
  app.once('before-quit', () => {
    stopped = true
    clearTimeout(timer)
    popup?.destroy()
    popup = null
  })
  return (next: UpdateStatus) => {
    if (next.type === 'checking') return
    if (next.type === 'error' || next.type === 'error-codesign') {
      if (!next.background && status && isNotificationStatus(status)) {
        status = { ...status, type: status.type === 'downloaded' ? 'downloaded' : 'available', error: 'action-failed' }
        refresh()
      }
      return
    }
    status = { ...next, version: next.version ?? status?.version }
    refresh()
  }
}

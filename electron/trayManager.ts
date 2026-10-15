import type { BrowserWindow } from 'electron'
import { dialog, Menu, nativeImage, Tray } from 'electron'

/**
 * System-tray presence for Windows/Linux.
 *
 * Closing the main window with the X button asks whether to keep Viezan running
 * in the tray (global hotkeys, Quick Chat and the local server keep their ports)
 * or to quit completely and release them. Quitting for real also goes through the
 * tray menu, the updater/relaunch paths, or the OS shutting down.
 */

type TrayLocale = 'en' | 'vi' | 'ja'

type TrayLabels = { open: string; quit: string; tooltip: string }

const TRAY_LABELS: Record<TrayLocale, TrayLabels> = {
  en: { open: 'Open Viezan', quit: 'Quit Viezan', tooltip: 'Viezan' },
  vi: { open: 'Mở Viezan', quit: 'Thoát Viezan', tooltip: 'Viezan' },
  ja: { open: 'Viezan を開く', quit: 'Viezan を終了', tooltip: 'Viezan' },
}

type CloseAction = 'tray' | 'quit' | 'cancel'

type CloseDialogLabels = { title: string; message: string; tray: string; quit: string; cancel: string }

const CLOSE_DIALOG_LABELS: Record<TrayLocale, CloseDialogLabels> = {
  en: {
    title: 'Close Viezan',
    message: 'Do you want Viezan to keep running in the background?',
    tray: 'Run in background',
    quit: 'Quit',
    cancel: 'Cancel',
  },
  vi: {
    title: 'Đóng Viezan',
    message: 'Bạn muốn Viezan tiếp tục chạy nền?',
    tray: 'Chạy nền',
    quit: 'Thoát hẳn',
    cancel: 'Hủy',
  },
  ja: {
    title: 'Viezan を閉じる',
    message: 'Viezan をバックグラウンドで実行し続けますか？',
    tray: 'バックグラウンドで実行',
    quit: '終了',
    cancel: 'キャンセル',
  },
}

const TRAY_ICON_SIZE = 16

/** Map an OS locale such as `vi`, `vi-VN` or `ja_JP` onto a supported tray language. */
export function resolveTrayLocale(osLocale: string | undefined): TrayLocale {
  const language = (osLocale ?? '').toLowerCase().split(/[-_]/)[0]
  return language === 'vi' || language === 'ja' ? language : 'en'
}

export function getTrayLabels(osLocale: string | undefined): TrayLabels {
  return TRAY_LABELS[resolveTrayLocale(osLocale)]
}

/** Platforms that keep the app alive in the tray when the main window is closed. */
export function supportsTrayResidency(platform: NodeJS.Platform): boolean {
  return platform === 'win32' || platform === 'linux'
}

/**
 * Whether the main window's `close` event should hide the window instead of
 * destroying it. Quitting always wins; macOS keeps its own dock-resident behavior.
 */
export function shouldHideMainWindowOnClose(options: {
  platform: NodeJS.Platform
  isQuitting: boolean
  hasTray: boolean
}): boolean {
  return supportsTrayResidency(options.platform) && options.hasTray && !options.isQuitting
}

/**
 * Ask what the X button should do. Dismissing the dialog (Esc / close) counts as
 * `cancel`, so an accidental click never quits or hides the app.
 */
export async function promptCloseAction(window: BrowserWindow, osLocale: string | undefined): Promise<CloseAction> {
  const labels = CLOSE_DIALOG_LABELS[resolveTrayLocale(osLocale)]
  // The safe, non-destructive action comes first and is the default.
  const actions: CloseAction[] = ['tray', 'quit', 'cancel']
  const { response } = await dialog.showMessageBox(window, {
    type: 'question',
    title: labels.title,
    message: labels.message,
    buttons: [labels.tray, labels.quit, labels.cancel],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  })
  return actions[response] ?? 'cancel'
}

export interface AppTrayOptions {
  /** Absolute path of a PNG/ICO to use as the tray icon. */
  iconPath: string
  /** Defaults to the running OS; Windows uses the ICO's native DPI frames. */
  platform?: NodeJS.Platform
  /** Overrides the localized tooltip, e.g. "Viezan (Dev)" for a development run. */
  tooltip?: string
  osLocale: string | undefined
  onOpen: () => void
  onQuit: () => void
}

/** Create the tray icon, or return null when no usable icon could be loaded. */
export function createAppTray(options: AppTrayOptions): Tray | null {
  const source = nativeImage.createFromPath(options.iconPath)
  if (source.isEmpty()) {
    console.warn('[tray] Icon could not be loaded, tray disabled:', options.iconPath)
    return null
  }

  const labels = getTrayLabels(options.osLocale)
  // Pass the ICO path directly so Windows can pick the right embedded frame
  // for the display DPI instead of stretching an already flattened 16px image.
  const tray = new Tray(
    (options.platform ?? process.platform) === 'win32'
      ? options.iconPath
      : source.resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE }),
  )
  tray.setToolTip(options.tooltip ?? labels.tooltip)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: labels.open, click: options.onOpen },
      { type: 'separator' },
      { label: labels.quit, click: options.onQuit },
    ]),
  )
  // Windows: single left click restores the window; Linux shells that support
  // click events behave the same.
  tray.on('click', options.onOpen)
  tray.on('double-click', options.onOpen)
  return tray
}

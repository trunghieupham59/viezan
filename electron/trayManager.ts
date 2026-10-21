import type { BrowserWindow } from 'electron'
import { Menu, nativeImage, Tray } from 'electron'

/**
 * System-tray presence for Windows/Linux.
 *
 * Closing the main window with X / Alt+F4 keeps Viezan running in the tray
 * without prompting (global hotkeys, Quick Chat and the local server stay alive).
 * Real quits use the tray menu, updater/relaunch paths, or OS shutdown.
 */

type TrayLocale = 'en' | 'vi' | 'ja'

type TrayLabels = { open: string; quit: string; tooltip: string }

const TRAY_LABELS: Record<TrayLocale, TrayLabels> = {
  en: { open: 'Open Viezan', quit: 'Quit Viezan', tooltip: 'Viezan' },
  vi: { open: 'Mở Viezan', quit: 'Thoát Viezan', tooltip: 'Viezan' },
  ja: { open: 'Viezan を開く', quit: 'Viezan を終了', tooltip: 'Viezan' },
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

/** Keep the existing window and its tasks alive on ordinary close requests. */
export function handleMainWindowClose(
  event: { preventDefault: () => void },
  window: Pick<BrowserWindow, 'hide'>,
  options: Parameters<typeof shouldHideMainWindowOnClose>[0],
): void {
  if (!shouldHideMainWindowOnClose(options)) return
  event.preventDefault()
  window.hide()
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

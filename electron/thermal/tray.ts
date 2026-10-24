/**
 * Live reading outside the window.
 *
 * macOS: a status item of its own (an image-less `Tray` whose title is the reading),
 * created when the option is on and destroyed when it is off, so the menu bar stays
 * clean by default. Windows/Linux: the app's resident tray icon already exists for
 * residency, so the reading goes into its tooltip; a tray title is a macOS-only API.
 *
 * Electron objects are injected so the rules run under plain Vitest.
 */
import type { ThermalSnapshot, ThermalTrayPlacement, ThermalTraySettings } from '../../shared/thermalApi'
import { formatTrayTitle, formatTrayTooltip } from './trayTitle'

/** The slice of Electron's `Tray` the controller touches. */
export interface StatusItem {
  setTitle: (title: string, options?: { fontType?: 'monospaced' | 'monospacedDigit' }) => void
  setToolTip: (tooltip: string) => void
  destroy: () => void
}

export interface ThermalTrayDeps {
  platform: NodeJS.Platform
  appTitle: string
  /** macOS: build the status item with its context menu. Called only while the option is on. */
  createStatusItem: () => StatusItem
  /** Windows/Linux: the residency tray, when this run has one. */
  getAppTray: () => Pick<StatusItem, 'setToolTip'> | null
  log?: Pick<Console, 'error'>
}

export interface ThermalTrayController {
  placement: () => ThermalTrayPlacement
  /** Show or hide according to the settings; idempotent. */
  apply: (settings: ThermalTraySettings) => void
  /** Push a reading. Ignored while hidden. */
  update: (snapshot: ThermalSnapshot) => void
  isShowing: () => boolean
  /** Hide and release everything (module stop, app quit). */
  dispose: () => void
}

export function resolveTrayPlacement(platform: NodeJS.Platform, hasAppTray: boolean): ThermalTrayPlacement {
  if (platform === 'darwin') return 'menu-bar'
  return hasAppTray ? 'tray' : 'none'
}

export function createThermalTrayController(deps: ThermalTrayDeps): ThermalTrayController {
  const log = deps.log ?? console
  let settings: ThermalTraySettings | null = null
  let statusItem: StatusItem | null = null
  let lastSnapshot: ThermalSnapshot | null = null

  const placement = () => resolveTrayPlacement(deps.platform, deps.getAppTray() !== null)

  function render() {
    if (!settings?.enabled || !lastSnapshot) return
    const tooltip = formatTrayTooltip(deps.appTitle, lastSnapshot, settings)
    if (statusItem) {
      statusItem.setTitle(formatTrayTitle(lastSnapshot, settings), { fontType: 'monospacedDigit' })
      statusItem.setToolTip(tooltip)
      return
    }
    deps.getAppTray()?.setToolTip(tooltip)
  }

  function hide() {
    if (statusItem) {
      try {
        statusItem.destroy()
      } catch (e) {
        log.error('[Thermal] Could not remove the menu bar item:', e)
      }
      statusItem = null
    } else if (settings?.enabled) {
      // Give the residency tray its plain tooltip back.
      deps.getAppTray()?.setToolTip(deps.appTitle)
    }
  }

  return {
    placement,
    isShowing: () => settings?.enabled === true && placement() !== 'none',
    apply: (next) => {
      const wasOn = settings?.enabled === true
      if (!next.enabled) {
        hide()
        settings = { ...next }
        return
      }
      settings = { ...next }
      if (placement() === 'menu-bar' && !statusItem) {
        try {
          statusItem = deps.createStatusItem()
          statusItem.setToolTip(deps.appTitle)
        } catch (e) {
          log.error('[Thermal] Could not create the menu bar item:', e)
          statusItem = null
        }
      }
      if (!wasOn && statusItem) statusItem.setTitle('…', { fontType: 'monospacedDigit' })
      render()
    },
    update: (snapshot) => {
      lastSnapshot = snapshot
      render()
    },
    dispose: () => {
      hide()
      settings = null
      lastSnapshot = null
    },
  }
}

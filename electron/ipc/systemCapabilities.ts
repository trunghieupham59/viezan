/**
 * The capability providers Viezan ships today. Each one wraps an existing permission
 * flow so Settings can render it with the shared notice.
 */

import type { ThermalSupport } from '../../shared/thermalApi'
import { getAccessibilityStatus, requestAccessibilityPermission, requiresAccessibilityPermission } from './accessibilityPermission'
import type { CapabilityProvider, CapabilityStatus } from './capabilities'
import { getLauncherSpotlightSnapshot } from './globalHotkey'
import { detectSystemShortcutConflict } from './launcherSystemShortcut'

/** `input.accessibility`: may the app send keystrokes (Quick Translate copy/paste)? */
export const accessibilityCapability: CapabilityProvider = {
  id: 'input.accessibility',
  get: () => {
    const status = getAccessibilityStatus()
    return toCapabilityStatus(status.required, status.granted)
  },
  request: async () => {
    const status = await requestAccessibilityPermission()
    return toCapabilityStatus(status.required, status.granted)
  },
}

function toCapabilityStatus(required: boolean, granted: boolean): CapabilityStatus {
  return {
    id: 'input.accessibility',
    supported: true,
    permission: !required ? 'not-required' : granted ? 'granted' : 'denied',
  }
}

/**
 * `launcher.spotlight`: on macOS, does a system shortcut (Spotlight, Finder search)
 * own the saved Launcher shortcut, and has Viezan turned Spotlight's shortcut off?
 * `permission` is `denied` while the system still owns the keys. The hand-over
 * actions themselves stay on the hotkey API (`hotkey.chat.spotlight.*`).
 */
export const spotlightCapability: CapabilityProvider = {
  id: 'launcher.spotlight',
  get: async () => {
    const supported = requiresAccessibilityPermission() // same platform gate: macOS only
    const snapshot = getLauncherSpotlightSnapshot()
    if (!supported) {
      return { id: 'launcher.spotlight', supported: false, permission: 'not-required', detail: { ...snapshot, conflict: null } }
    }
    const conflict = snapshot.hotkey ? await detectSystemShortcutConflict(snapshot.hotkey) : null
    return {
      id: 'launcher.spotlight',
      supported: true,
      permission: conflict ? 'denied' : 'granted',
      detail: { ...snapshot, conflict },
    }
  },
}

/**
 * `thermal.sensors`: can this machine's temperatures and fan speeds be read? No
 * permission is involved; `detail` carries the source or the reason it cannot.
 */
export function createThermalCapability(getSupport: () => ThermalSupport): CapabilityProvider {
  return {
    id: 'thermal.sensors',
    get: () => {
      const support = getSupport()
      return { id: 'thermal.sensors', supported: support.supported, permission: 'not-required', detail: { ...support } }
    },
  }
}

export interface SystemCapabilityDeps {
  thermalSupport: () => ThermalSupport
}

export function createSystemCapabilityProviders(deps: SystemCapabilityDeps): CapabilityProvider[] {
  return [accessibilityCapability, spotlightCapability, createThermalCapability(deps.thermalSupport)]
}

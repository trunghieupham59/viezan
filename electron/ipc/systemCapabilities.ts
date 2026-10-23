/**
 * The capability providers Viezan ships today. Each one wraps an existing permission
 * flow so Settings can render it with the shared notice.
 */
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

export function createSystemCapabilityProviders(): CapabilityProvider[] {
  return [accessibilityCapability, spotlightCapability]
}

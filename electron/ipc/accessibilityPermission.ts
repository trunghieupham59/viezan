/**
 * macOS Accessibility (TCC) permission — required before the app may send synthetic
 * keystrokes through System Events (Quick Translate copies and pastes this way).
 * Other platforms need no permission, so every check reports "not required".
 */
import { shell, systemPreferences } from 'electron'
import { MACOS_ACCESSIBILITY_PREFS } from './externalUrl'

/** Only macOS gates synthetic keystrokes behind the Accessibility permission. */
export function requiresAccessibilityPermission(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'darwin'
}

/**
 * True when this process may send keystrokes through System Events. With `prompt`
 * macOS shows its one-time "control this computer" dialog and lists the app under
 * Privacy & Security > Accessibility so the user can tick it.
 */
export function hasAccessibilityPermission(prompt: boolean): boolean {
  if (!requiresAccessibilityPermission()) return true
  try {
    return systemPreferences.isTrustedAccessibilityClient(prompt)
  } catch (e) {
    console.warn('[Accessibility] Permission check failed:', e)
    return false
  }
}

export interface AccessibilityStatus {
  /** False on platforms where no permission is needed; `granted` is then always true. */
  required: boolean
  granted: boolean
}

export function getAccessibilityStatus(): AccessibilityStatus {
  const required = requiresAccessibilityPermission()
  return { required, granted: !required || hasAccessibilityPermission(false) }
}

/**
 * Ask for Accessibility access: triggers the macOS prompt (which also lists the app
 * under Privacy & Security > Accessibility) and, while still denied, opens that pane.
 */
export async function requestAccessibilityPermission(): Promise<AccessibilityStatus> {
  if (!requiresAccessibilityPermission()) return { required: false, granted: true }
  const granted = hasAccessibilityPermission(true)
  if (!granted) {
    try {
      await shell.openExternal(MACOS_ACCESSIBILITY_PREFS)
    } catch (e) {
      console.error('[Accessibility] Could not open Accessibility settings:', e)
    }
  }
  return { required: true, granted }
}

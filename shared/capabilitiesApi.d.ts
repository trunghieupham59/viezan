/**
 * Capabilities API — the single source for the shape of `window.api.capabilities`
 * and the status objects main reports. See `electron/ipc/capabilities.ts`.
 */

export type CapabilityId = 'input.accessibility' | 'launcher.spotlight' | 'thermal.sensors' | 'thermal.fan.write'

export type CapabilityPermission = 'granted' | 'denied' | 'not-required'

export interface CapabilityStatus {
  id: CapabilityId
  /** Whether this platform/machine can do it at all. */
  supported: boolean
  permission: CapabilityPermission
  /** Provider-specific facts the UI may show (e.g. which system shortcut conflicts). */
  detail?: Record<string, unknown>
}

export interface CapabilitiesApi {
  /** Statuses for the given ids, or for every capability when omitted. */
  get: (ids?: CapabilityId[]) => Promise<{ success: boolean; statuses?: CapabilityStatus[]; error?: string }>
  /** Run the capability's own permission request (system prompt, settings pane) and return the new status. */
  request: (id: CapabilityId) => Promise<{ success: boolean; status?: CapabilityStatus; error?: string }>
}

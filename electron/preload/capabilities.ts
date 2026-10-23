/**
 * Capabilities preload API — ask main what this machine can do and whether the
 * user has allowed it, and trigger the capability's own permission request.
 */
import { ipcRenderer } from 'electron'

export const capabilitiesSection = {
  capabilities: {
    /** Statuses for the given ids, or for every capability when omitted. */
    get: (ids?: string[]) => ipcRenderer.invoke('capabilities:get', ids),
    /** Run the capability's permission request (system prompt, settings pane) and return the new status. */
    request: (id: string) => ipcRenderer.invoke('capabilities:request', id),
  },
}

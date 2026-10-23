/**
 * Capabilities — what this machine can do and whether the user has allowed it.
 *
 * Modules declare what they need (send keystrokes, hand a system shortcut over, later
 * read sensors or drive fans). Each need is a capability with a provider that answers
 * two questions: is it *supported* on this platform and hardware, and is the
 * *permission* granted. The renderer renders every answer with one shared notice
 * instead of a bespoke flow per feature.
 *
 * `request` runs the provider's own way of asking (a system prompt, opening a
 * settings pane); it never grants anything by itself.
 */
import type { IpcMain } from 'electron'
import type { CapabilityId, CapabilityPermission, CapabilityStatus } from '../../shared/capabilitiesApi'
import { CAPABILITY_CHANNELS } from './channels'

export type { CapabilityId, CapabilityPermission, CapabilityStatus }

export interface CapabilityProvider {
  id: CapabilityId
  get: () => Promise<CapabilityStatus> | CapabilityStatus
  /** Ask the user / the OS. Absent when the capability has nothing to request. */
  request?: () => Promise<CapabilityStatus>
}

export const CAPABILITY_IDS: readonly CapabilityId[] = ['input.accessibility', 'launcher.spotlight']

export function isCapabilityId(value: unknown): value is CapabilityId {
  return typeof value === 'string' && (CAPABILITY_IDS as readonly string[]).includes(value)
}

/** Status returned when a provider throws: unsupported and denied, never a crash in the renderer. */
function failedStatus(id: CapabilityId, e: unknown): CapabilityStatus {
  console.error(`[Capabilities] ${id} failed:`, e instanceof Error ? e.message : e)
  return { id, supported: false, permission: 'denied' }
}

export interface CapabilityRegistry {
  get: (ids?: readonly CapabilityId[]) => Promise<CapabilityStatus[]>
  request: (id: CapabilityId) => Promise<CapabilityStatus>
}

export function createCapabilityRegistry(providers: readonly CapabilityProvider[]): CapabilityRegistry {
  const byId = new Map(providers.map((provider) => [provider.id, provider]))

  async function getOne(id: CapabilityId): Promise<CapabilityStatus> {
    const provider = byId.get(id)
    if (!provider) return { id, supported: false, permission: 'denied' }
    try {
      return await provider.get()
    } catch (e) {
      return failedStatus(id, e)
    }
  }

  return {
    get: (ids) => Promise.all((ids ?? [...byId.keys()]).map(getOne)),
    request: async (id) => {
      const provider = byId.get(id)
      if (!provider) return { id, supported: false, permission: 'denied' }
      try {
        return provider.request ? await provider.request() : await provider.get()
      } catch (e) {
        return failedStatus(id, e)
      }
    },
  }
}

/**
 * `capabilities:get` (ids?: CapabilityId[]) and `capabilities:request` (id). Unknown or
 * malformed ids are rejected before any provider runs.
 */
export function registerCapabilityHandlers(ipcMain: IpcMain, registry: CapabilityRegistry): void {
  ipcMain.handle(CAPABILITY_CHANNELS.invoke.get, async (_event, rawIds?: unknown) => {
    if (rawIds !== undefined && !(Array.isArray(rawIds) && rawIds.every(isCapabilityId))) {
      return { success: false, error: 'Invalid capability ids.' }
    }
    return { success: true, statuses: await registry.get(rawIds as CapabilityId[] | undefined) }
  })

  ipcMain.handle(CAPABILITY_CHANNELS.invoke.request, async (_event, rawId: unknown) => {
    if (!isCapabilityId(rawId)) return { success: false, error: 'Invalid capability id.' }
    return { success: true, status: await registry.request(rawId) }
  })
}

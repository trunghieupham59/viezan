/**
 * Capabilities preload API — ask main what this machine can do and whether the
 * user has allowed it. Shape: `shared/capabilitiesApi.d.ts`.
 */
import type { CapabilitiesApi } from '../../shared/capabilitiesApi'
import { CAPABILITY_CHANNELS } from '../ipc/channels'
import { invoke } from './contract'

export const capabilitiesApi: CapabilitiesApi = {
  get: invoke(CAPABILITY_CHANNELS.invoke.get),
  request: invoke(CAPABILITY_CHANNELS.invoke.request),
}

export const capabilitiesSection = { capabilities: capabilitiesApi }

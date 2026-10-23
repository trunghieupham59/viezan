/**
 * Modules preload API — which feature modules are enabled. Shape: `shared/modules.d.ts`.
 */
import type { ModulesApi } from '../../shared/modules'
import { MODULES_CHANNELS } from '../ipc/channels'
import { invoke, subscribe } from './contract'

export const modulesApi: ModulesApi = {
  get: invoke(MODULES_CHANNELS.invoke.get),
  setEnabled: invoke(MODULES_CHANNELS.invoke.setEnabled),
  onChanged: subscribe(MODULES_CHANNELS.event.changed),
}

export const modulesSection = { modules: modulesApi }

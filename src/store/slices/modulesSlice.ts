/**
 * modulesSlice — which feature modules are on, mirrored from the main process.
 *
 * Main owns the persisted choice (`modules.json` under userData) and the start/stop
 * work; the renderer keeps a copy so navigation can hide pages of modules that are off
 * and Settings can show the toggles. `useModulesSync` loads the copy and follows
 * `modules:changed`. Nothing here is persisted by zustand.
 */
import type { ModuleEnabledState, ModuleId } from '../../types'
import type { SliceSet } from './sliceTypes'

export const ALL_MODULES_ENABLED: ModuleEnabledState = {
  chat: true,
  translate: true,
  live: true,
  dictionary: true,
  thermal: true,
  apps: true,
  launcher: true,
  'browser-bridge': true,
}

export interface ModulesSlice {
  enabledModules: ModuleEnabledState
  /** True once main answered `modules:get` (or the preview mock did). */
  modulesLoaded: boolean
  /** Replace the mirror with what main reports; unknown ids are ignored. */
  setEnabledModules: (state: Partial<Record<string, boolean>>) => void
  /** Ask main to turn a module on or off. Resolves with an error message on failure. */
  setModuleEnabled: (id: ModuleId, enabled: boolean) => Promise<{ success: boolean; error?: string }>
}

function normalizeEnabledModules(state: Partial<Record<string, boolean>>): ModuleEnabledState {
  const next = { ...ALL_MODULES_ENABLED }
  for (const id of Object.keys(next) as ModuleId[]) {
    if (state[id] === false) next[id] = false
  }
  return next
}

export const createModulesSlice = (set: SliceSet): ModulesSlice => ({
  enabledModules: ALL_MODULES_ENABLED,
  modulesLoaded: false,

  setEnabledModules: (state) => set({ enabledModules: normalizeEnabledModules(state), modulesLoaded: true }),

  setModuleEnabled: async (id, enabled) => {
    const api = window.api?.modules
    if (!api) return { success: false, error: 'Modules are not available in this window.' }
    try {
      const res = await api.setEnabled(id, enabled)
      if (res?.success && res.enabled) {
        set({ enabledModules: normalizeEnabledModules(res.enabled), modulesLoaded: true })
        return { success: true }
      }
      return { success: false, error: res?.error }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  },
})

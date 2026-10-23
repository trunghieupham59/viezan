/**
 * JSON file under userData that remembers which modules the user turned off.
 * Only known module ids with boolean values are kept; a missing file means "all on".
 */
import * as fs from 'node:fs'
import type { ModuleId } from '../../shared/modules'
import type { ModuleEnabledState, ModuleEnabledStore } from './host'

export const MODULES_FILE = 'modules.json'

export function createFileModuleStore(filePath: string, knownIds: readonly ModuleId[]): ModuleEnabledStore {
  const known = new Set<string>(knownIds)
  return {
    load: () => {
      if (!fs.existsSync(filePath)) return {}
      const raw: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
      const out: Partial<Record<ModuleId, boolean>> = {}
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (known.has(key) && typeof value === 'boolean') out[key as ModuleId] = value
      }
      return out
    },
    save: (state: ModuleEnabledState) => {
      fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8')
    },
  }
}

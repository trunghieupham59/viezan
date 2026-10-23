/**
 * Module host — the main-process side of the module platform.
 *
 * Every module registers its IPC handlers once at startup so the renderer can always ask
 * for status, but only *enabled* modules are started (global shortcuts, local server,
 * background work). Toggling a module starts or stops it and persists the choice; app
 * quit stops every started module in reverse order. The host is pure (no Electron
 * import) so the lifecycle rules are unit-tested without a running app.
 */
import type { ModuleId } from '../../shared/modules'

export interface MainModule {
  id: ModuleId
  /** Register IPC handlers. Runs once for every module, enabled or not. */
  registerHandlers?: () => void
  /** Begin the module's runtime work (shortcuts, servers, listeners). */
  start?: () => void | Promise<void>
  /** Undo `start`; must leave nothing of the module running. */
  stop?: () => void | Promise<void>
}

export type ModuleEnabledState = Record<ModuleId, boolean>

/** Where the enabled/disabled choice lives (a JSON file under userData in production). */
export interface ModuleEnabledStore {
  load: () => Partial<Record<ModuleId, boolean>>
  save: (state: ModuleEnabledState) => void
}

export interface ModuleHostOptions {
  modules: readonly MainModule[]
  store: ModuleEnabledStore
  /** Called after a change is applied so the host's owner can notify the renderer. */
  onChange?: (state: ModuleEnabledState) => void
  log?: Pick<Console, 'warn' | 'error'>
}

export interface ModuleHost {
  /** Register every module's handlers, then start the enabled ones. */
  init: () => Promise<void>
  getState: () => ModuleEnabledState
  isEnabled: (id: ModuleId) => boolean
  isKnown: (id: unknown) => id is ModuleId
  /** Start or stop a module and persist the choice. Resolves with the new state. */
  setEnabled: (id: ModuleId, enabled: boolean) => Promise<ModuleEnabledState>
  /** Stop every started module, newest first. Safe to call more than once. */
  shutdown: () => Promise<void>
}

export function createModuleHost({ modules, store, onChange, log = console }: ModuleHostOptions): ModuleHost {
  const byId = new Map(modules.map((module) => [module.id, module]))
  const ids = modules.map((module) => module.id)
  const started = new Set<ModuleId>()
  let state: ModuleEnabledState = loadState()
  // Serialise lifecycle work so a quick toggle back and forth cannot interleave start/stop.
  let queue: Promise<unknown> = Promise.resolve()

  function loadState(): ModuleEnabledState {
    let persisted: Partial<Record<ModuleId, boolean>> = {}
    try {
      persisted = store.load() ?? {}
    } catch (e) {
      log.warn('[Modules] Could not read the enabled-modules file; every module stays on.', e)
    }
    // Unknown ids are dropped; anything not persisted defaults to enabled.
    return Object.fromEntries(ids.map((id) => [id, persisted[id] !== false])) as ModuleEnabledState
  }

  function persist(): void {
    try {
      store.save(state)
    } catch (e) {
      log.error('[Modules] Could not save the enabled-modules file:', e)
    }
  }

  async function startModule(module: MainModule): Promise<void> {
    if (started.has(module.id)) return
    try {
      await module.start?.()
      started.add(module.id)
    } catch (e) {
      log.error(`[Modules] ${module.id} failed to start:`, e)
    }
  }

  async function stopModule(module: MainModule): Promise<void> {
    if (!started.has(module.id)) return
    started.delete(module.id)
    try {
      await module.stop?.()
    } catch (e) {
      log.error(`[Modules] ${module.id} failed to stop:`, e)
    }
  }

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = queue.then(work, work)
    queue = next.catch(() => undefined)
    return next
  }

  return {
    init: () => enqueue(async () => {
      for (const module of modules) {
        try {
          module.registerHandlers?.()
        } catch (e) {
          log.error(`[Modules] ${module.id} failed to register handlers:`, e)
        }
      }
      for (const module of modules) {
        if (state[module.id]) await startModule(module)
      }
    }),
    getState: () => ({ ...state }),
    isEnabled: (id) => state[id] === true,
    isKnown: (id): id is ModuleId => typeof id === 'string' && byId.has(id as ModuleId),
    setEnabled: (id, enabled) => enqueue(async () => {
      const module = byId.get(id)
      if (!module) throw new Error(`Unknown module: ${id}`)
      if (state[id] !== enabled) {
        state = { ...state, [id]: enabled }
        persist()
        if (enabled) await startModule(module)
        else await stopModule(module)
        onChange?.({ ...state })
      }
      return { ...state }
    }),
    shutdown: () => enqueue(async () => {
      for (const module of [...modules].reverse()) await stopModule(module)
    }),
  }
}

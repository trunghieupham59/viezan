// @vitest-environment node
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModuleId } from '../../../shared/modules'
import { createFileModuleStore } from '../enabledStore'
import { createModuleHost, type MainModule, type ModuleEnabledStore } from '../host'

const log = { warn: vi.fn(), error: vi.fn() }

function fakeModule(id: ModuleId, events: string[], opts: { failStart?: boolean } = {}): MainModule {
  return {
    id,
    registerHandlers: () => { events.push(`register:${id}`) },
    start: async () => {
      if (opts.failStart) throw new Error('boom')
      events.push(`start:${id}`)
    },
    stop: () => { events.push(`stop:${id}`) },
  }
}

function memoryStore(initial: Partial<Record<ModuleId, boolean>> = {}): ModuleEnabledStore & { saved: unknown[] } {
  const saved: unknown[] = []
  return { saved, load: () => initial, save: (state) => { saved.push(state) } }
}

beforeEach(() => { log.warn.mockReset(); log.error.mockReset() })

describe('module host', () => {
  it('registers every module but starts only the enabled ones, in catalog order', async () => {
    const events: string[] = []
    const host = createModuleHost({
      modules: [fakeModule('chat', events), fakeModule('launcher', events), fakeModule('browser-bridge', events)],
      store: memoryStore({ launcher: false }),
      log,
    })
    await host.init()
    expect(events).toEqual(['register:chat', 'register:launcher', 'register:browser-bridge', 'start:chat', 'start:browser-bridge'])
    expect(host.getState()).toEqual({ chat: true, launcher: false, 'browser-bridge': true })
    expect(host.isEnabled('launcher')).toBe(false)
  })

  it('stops and starts on toggle, persists the choice and notifies once per change', async () => {
    const events: string[] = []
    const store = memoryStore()
    const onChange = vi.fn()
    const host = createModuleHost({ modules: [fakeModule('launcher', events)], store, onChange, log })
    await host.init()

    expect(await host.setEnabled('launcher', false)).toEqual({ launcher: false })
    expect(events).toEqual(['register:launcher', 'start:launcher', 'stop:launcher'])
    expect(store.saved).toEqual([{ launcher: false }])
    expect(onChange).toHaveBeenCalledWith({ launcher: false })

    await host.setEnabled('launcher', false) // no-op: already off
    expect(store.saved).toHaveLength(1)
    expect(onChange).toHaveBeenCalledTimes(1)

    await host.setEnabled('launcher', true)
    expect(events[events.length - 1]).toBe('start:launcher')
    expect(host.isEnabled('launcher')).toBe(true)
  })

  it('serialises a fast toggle so stop never overlaps start', async () => {
    const events: string[] = []
    const slow: MainModule = {
      id: 'launcher',
      start: () => new Promise((resolve) => setTimeout(() => { events.push('start'); resolve() }, 10)),
      stop: () => { events.push('stop') },
    }
    const host = createModuleHost({ modules: [slow], store: memoryStore(), log })
    await host.init()
    const off = host.setEnabled('launcher', false)
    const on = host.setEnabled('launcher', true)
    await Promise.all([off, on])
    expect(events).toEqual(['start', 'stop', 'start'])
  })

  it('keeps going when a module fails to start, and shuts down newest first', async () => {
    const events: string[] = []
    const host = createModuleHost({
      modules: [fakeModule('chat', events), fakeModule('launcher', events, { failStart: true }), fakeModule('live', events)],
      store: memoryStore(),
      log,
    })
    await host.init()
    expect(events.filter((e) => e.startsWith('start:'))).toEqual(['start:chat', 'start:live'])
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('launcher failed to start'), expect.any(Error))

    await host.shutdown()
    // launcher never started, so it is not stopped; the others stop in reverse order.
    expect(events.filter((e) => e.startsWith('stop:'))).toEqual(['stop:live', 'stop:chat'])
    await host.shutdown()
    expect(events.filter((e) => e.startsWith('stop:'))).toHaveLength(2)
  })

  it('falls back to all-enabled when the store cannot be read and rejects unknown ids', async () => {
    const host = createModuleHost({
      modules: [fakeModule('chat', [])],
      store: { load: () => { throw new Error('corrupt') }, save: () => {} },
      log,
    })
    await host.init()
    expect(host.getState()).toEqual({ chat: true })
    expect(log.warn).toHaveBeenCalled()
    expect(host.isKnown('chat')).toBe(true)
    expect(host.isKnown('thermal')).toBe(false)
    await expect(host.setEnabled('thermal' as ModuleId, false)).rejects.toThrow(/Unknown module/)
  })
})

describe('file module store', () => {
  let dir: string
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viezan-modules-')) })
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  it('round-trips the state and drops unknown ids and non-boolean values', () => {
    const file = path.join(dir, 'modules.json')
    const store = createFileModuleStore(file, ['chat', 'launcher'])
    expect(store.load()).toEqual({})

    store.save({ chat: true, launcher: false } as never)
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({ chat: true, launcher: false })

    fs.writeFileSync(file, JSON.stringify({ chat: 'yes', launcher: false, thermal: false }))
    expect(store.load()).toEqual({ launcher: false })

    fs.writeFileSync(file, '[1,2]')
    expect(store.load()).toEqual({})
  })
})

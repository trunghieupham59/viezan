// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { type CapabilityProvider, createCapabilityRegistry, isCapabilityId, registerCapabilityHandlers } from '../capabilities'

const granted: CapabilityProvider = {
  id: 'input.accessibility',
  get: () => ({ id: 'input.accessibility', supported: true, permission: 'granted' }),
}

function requestable(): CapabilityProvider & { requests: number } {
  const provider = {
    id: 'launcher.spotlight' as const,
    requests: 0,
    get: () => ({ id: 'launcher.spotlight' as const, supported: true, permission: 'denied' as const, detail: { conflict: 'spotlight' } }),
    request: async () => {
      provider.requests += 1
      return { id: 'launcher.spotlight' as const, supported: true, permission: 'granted' as const }
    },
  }
  return provider
}

function handlersFor(providers: CapabilityProvider[]) {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {}
  const ipcMain = { handle: (channel: string, fn: (...args: unknown[]) => unknown) => { handlers[channel] = fn } }
  registerCapabilityHandlers(ipcMain as never, createCapabilityRegistry(providers))
  return (channel: string, ...args: unknown[]) => handlers[channel]({}, ...args)
}

describe('capability registry', () => {
  it('answers every registered capability, or only the requested ids', async () => {
    const registry = createCapabilityRegistry([granted, requestable()])
    expect((await registry.get()).map((s) => s.id)).toEqual(['input.accessibility', 'launcher.spotlight'])
    expect(await registry.get(['launcher.spotlight'])).toEqual([
      { id: 'launcher.spotlight', supported: true, permission: 'denied', detail: { conflict: 'spotlight' } },
    ])
  })

  it('runs the provider request and falls back to get() when there is nothing to request', async () => {
    const spotlight = requestable()
    const registry = createCapabilityRegistry([granted, spotlight])
    expect(await registry.request('launcher.spotlight')).toMatchObject({ permission: 'granted' })
    expect(spotlight.requests).toBe(1)
    expect(await registry.request('input.accessibility')).toMatchObject({ permission: 'granted' })
  })

  it('reports a throwing provider as unsupported and denied instead of failing the call', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken: CapabilityProvider = { id: 'input.accessibility', get: () => { throw new Error('boom') } }
    const registry = createCapabilityRegistry([broken])
    expect(await registry.get()).toEqual([{ id: 'input.accessibility', supported: false, permission: 'denied' }])
    expect(await registry.request('input.accessibility')).toEqual({ id: 'input.accessibility', supported: false, permission: 'denied' })
  })

  it('treats an unregistered id as unsupported', async () => {
    const registry = createCapabilityRegistry([granted])
    expect(await registry.get(['launcher.spotlight'])).toEqual([{ id: 'launcher.spotlight', supported: false, permission: 'denied' }])
  })
})

describe('capability IPC', () => {
  it('validates ids before touching providers', async () => {
    const spotlight = requestable()
    const invoke = handlersFor([granted, spotlight])

    expect(await invoke('capabilities:get', ['nope'])).toMatchObject({ success: false })
    expect(await invoke('capabilities:get', 'input.accessibility')).toMatchObject({ success: false })
    expect(await invoke('capabilities:request', 'rm -rf /')).toMatchObject({ success: false })
    expect(await invoke('capabilities:request', 42)).toMatchObject({ success: false })
    expect(spotlight.requests).toBe(0)

    expect(await invoke('capabilities:get')).toMatchObject({ success: true, statuses: [expect.anything(), expect.anything()] })
    expect(await invoke('capabilities:get', ['input.accessibility'])).toEqual({
      success: true, statuses: [{ id: 'input.accessibility', supported: true, permission: 'granted' }],
    })
    expect(await invoke('capabilities:request', 'launcher.spotlight')).toMatchObject({ success: true, status: { permission: 'granted' } })
  })

  it('knows its own ids', () => {
    expect(isCapabilityId('input.accessibility')).toBe(true)
    expect(isCapabilityId('thermal.fan.write')).toBe(false)
    expect(isCapabilityId(null)).toBe(false)
  })
})

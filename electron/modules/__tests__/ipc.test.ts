// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createModuleHost, type MainModule } from '../host'
import { broadcastModulesChanged, registerModuleHandlers } from '../ipc'

function setup(modules: MainModule[]) {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {}
  const ipcMain = { handle: (channel: string, fn: (...args: unknown[]) => unknown) => { handlers[channel] = fn } }
  const sent: unknown[] = []
  const win = { isDestroyed: () => false, webContents: { isDestroyed: () => false, send: (...args: unknown[]) => { sent.push(args) } } }
  const host = createModuleHost({
    modules,
    store: { load: () => ({}), save: () => {} },
    onChange: (state) => broadcastModulesChanged(() => win as never, state),
    log: { warn: vi.fn(), error: vi.fn() },
  })
  registerModuleHandlers(ipcMain as never, host)
  const invoke = (channel: string, ...args: unknown[]) => handlers[channel]({}, ...args)
  return { host, invoke, sent }
}

describe('modules IPC', () => {
  it('reports the state, applies a valid toggle and pushes the change to the main window', async () => {
    const events: string[] = []
    const { host, invoke, sent } = setup([
      { id: 'launcher', start: () => { events.push('start') }, stop: () => { events.push('stop') } },
    ])
    await host.init()

    expect(await invoke('modules:get')).toEqual({ success: true, enabled: { launcher: true } })
    expect(await invoke('modules:setEnabled', 'launcher', false)).toEqual({ success: true, enabled: { launcher: false } })
    expect(events).toEqual(['start', 'stop'])
    expect(sent).toEqual([['modules:changed', { launcher: false }]])
  })

  it('rejects unknown ids and non-boolean values before touching the host', async () => {
    const { host, invoke, sent } = setup([{ id: 'chat' }])
    await host.init()
    expect(await invoke('modules:setEnabled', 'thermal', false)).toMatchObject({ success: false })
    expect(await invoke('modules:setEnabled', 'chat', 'off')).toMatchObject({ success: false })
    expect(host.getState()).toEqual({ chat: true })
    expect(sent).toEqual([])
  })
})

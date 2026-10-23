// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ipc = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}))
vi.mock('electron', () => ({ ipcRenderer: ipc }))

import { invoke, subscribe, subscribeSignal } from '../contract'

beforeEach(() => {
  ipc.invoke.mockReset()
  ipc.on.mockReset()
  ipc.removeListener.mockReset()
})

describe('preload contract helpers', () => {
  it('invoke forwards every argument to the channel and returns the main result', async () => {
    ipc.invoke.mockResolvedValue({ success: true })
    const update: (settings: { enabled: boolean }, extra?: number) => Promise<{ success: boolean }> = invoke('hotkey:update')

    await expect(update({ enabled: true }, 2)).resolves.toEqual({ success: true })
    expect(ipc.invoke).toHaveBeenCalledWith('hotkey:update', { enabled: true }, 2)

    const get: () => Promise<unknown> = invoke('hotkey:get')
    await get()
    expect(ipc.invoke).toHaveBeenLastCalledWith('hotkey:get')
  })

  it('subscribe hands the payload (not the IPC event) to the callback and unsubscribes the same handler', () => {
    const onTranslated = subscribe<{ translated: string }>('hotkey:translated')
    const cb = vi.fn()
    const off = onTranslated(cb)

    expect(ipc.on).toHaveBeenCalledWith('hotkey:translated', expect.any(Function))
    const handler = ipc.on.mock.calls[0][1] as (event: unknown, payload: unknown) => void
    handler({ sender: 'ipc-event' }, { translated: 'xin chào' })
    expect(cb).toHaveBeenCalledWith({ translated: 'xin chào' })

    off()
    expect(ipc.removeListener).toHaveBeenCalledWith('hotkey:translated', handler)
  })

  it('subscribeSignal calls back without arguments', () => {
    const cb = vi.fn()
    const off = subscribeSignal('hotkey:chat-open')(cb)
    const handler = ipc.on.mock.calls[0][1] as (event: unknown) => void
    handler({ sender: 'ipc-event' })
    expect(cb).toHaveBeenCalledWith()
    off()
    expect(ipc.removeListener).toHaveBeenCalledWith('hotkey:chat-open', handler)
  })
})

// @vitest-environment node
import type { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ handlers: new Map<string, (event: unknown) => void>(), quit: vi.fn() }))
vi.mock('electron', async () => {
  const { EventEmitter: Emitter } = await import('node:events')
  return { app: Object.assign(new Emitter(), { quit: mocks.quit }), powerMonitor: new Emitter(),
    ipcMain: { handle: (name: string, fn: (event: unknown) => void) => mocks.handlers.set(name, fn) } }
})

import { app, powerMonitor } from 'electron'
import { registerSessionLifecycle } from '../sessionLifecycle'

describe('session lifecycle bridge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.handlers.clear()
    app.removeAllListeners()
    powerMonitor.removeAllListeners()
  })
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

  function setup() {
    const contents = { send: vi.fn(), isDestroyed: () => false }
    registerSessionLifecycle(() => ({ isDestroyed: () => false, webContents: contents }) as never)
    return contents
  }

  it('relays sleep/lock events without starting any operation', () => {
    const contents = setup()
    ;(powerMonitor as unknown as EventEmitter).emit('suspend')
    ;(powerMonitor as unknown as EventEmitter).emit('resume')
    expect(contents.send.mock.calls).toEqual([['app:session-activity', 'away'], ['app:session-activity', 'back']])
  })

  it('waits for the main renderer save acknowledgment and refuses other windows', () => {
    const contents = setup()
    const event = { preventDefault: vi.fn() }
    app.emit('before-quit', event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(contents.send).toHaveBeenCalledWith('app:prepare-session-save')
    mocks.handlers.get('app:complete-session-save')?.({ sender: {} })
    expect(mocks.quit).not.toHaveBeenCalled()
    mocks.handlers.get('app:complete-session-save')?.({ sender: contents })
    expect(mocks.quit).toHaveBeenCalledOnce()
    event.preventDefault.mockClear()
    app.emit('before-quit', event)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('bounds the wait when a renderer cannot answer', () => {
    setup()
    app.emit('before-quit', { preventDefault: vi.fn() })
    vi.advanceTimersByTime(1500)
    expect(mocks.quit).toHaveBeenCalledOnce()
  })
})

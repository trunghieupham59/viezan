// @vitest-environment node
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => 'unused-test-storage' }, shell: { openExternal: vi.fn() } }))

import { registerLocalAiHandlers } from '../localAi'
import { resetLocalAiPerformanceForTests } from '../localAiPerformance'

const contents = { isDestroyed: () => false }
const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>()
const event = { sender: contents } as unknown as IpcMainInvokeEvent
beforeEach(() => {
  resetLocalAiPerformanceForTests(); handlers.clear()
  registerLocalAiHandlers({ handle: (name: string, fn: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) => handlers.set(name, fn) } as unknown as IpcMain,
    () => ({ isDestroyed: () => false, webContents: contents }) as unknown as BrowserWindow)
})
afterEach(() => resetLocalAiPerformanceForTests())
it('only accepts performance requests from the main window', () => {
  expect(() => handlers.get('local-ai:performance:get')?.({ sender: {} } as IpcMainInvokeEvent, 'gemma3:4b')).toThrow()
  expect(handlers.get('local-ai:performance:get')?.(event, 'gemma3:4b')).toEqual({ running: false })
})
it('rejects reloads without explicit consent before contacting the runtime', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch')
  await expect(handlers.get('local-ai:performance:compare')?.(event, { model: 'gemma3:4b', consentToReload: false })).rejects.toThrow('consent')
  expect(fetcher).not.toHaveBeenCalled()
  fetcher.mockRestore()
})
it('rejects arbitrary or unmeasured execution configuration', () => {
  expect(() => handlers.get('local-ai:performance:select')?.(event, 'gemma3:4b', { num_gpu: 20 })).toThrow()
  expect(() => handlers.get('local-ai:performance:select')?.(event, 'gemma3:4b', 'hybrid')).toThrow('successful')
  expect(() => handlers.get('local-ai:performance:get')?.(event, '../../file')).toThrow()
})

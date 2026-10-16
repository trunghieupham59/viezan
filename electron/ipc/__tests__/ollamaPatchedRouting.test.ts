// @vitest-environment node
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), exec: vi.fn(), find: vi.fn(), allocate: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn, execFileSync: mocks.exec }))
vi.mock('electron', () => ({ app: {}, shell: {} }))
vi.mock('../ollamaPatchedRuntime', () => ({ findPatchedOllama: mocks.find, allocateOllamaPort: mocks.allocate, PATCHED_OLLAMA_VERSION: 'patched' }))

import { discoverLocalAiRuntimes, ensureLocalAiRuntime, resetLocalAiStateForTests, resolveLocalAiRequestModel, stopManagedLocalAiRuntime } from '../localAi'
import { resetLocalAiPerformanceForTests } from '../localAiPerformance'

let child: EventEmitter & { pid: number; exitCode: number | null; signalCode: null; unref: ReturnType<typeof vi.fn>; kill: ReturnType<typeof vi.fn> }
let urls: string[]
beforeEach(() => {
  resetLocalAiStateForTests(); resetLocalAiPerformanceForTests(); vi.clearAllMocks()
  vi.spyOn(process, 'kill').mockImplementation(() => true)
  mocks.find.mockReturnValue('C:/Viezan/ollama.exe')
  mocks.allocate.mockResolvedValue(54321)
  child = Object.assign(new EventEmitter(), { pid: 4321, exitCode: null, signalCode: null, unref: vi.fn(), kill: vi.fn() })
  mocks.spawn.mockImplementation(() => { queueMicrotask(() => child.emit('spawn')); return child })
  urls = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(String(url))
    if (!String(url).startsWith('http://127.0.0.1:54321/')) throw new Error('External runtime must not be contacted')
    return new Response(JSON.stringify(String(url).endsWith('/version') ? { version: 'patched' } : { data: [{ id: 'gemma3:4b' }] }))
  }))
})
afterEach(() => { resetLocalAiStateForTests(); resetLocalAiPerformanceForTests(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks() })

it('routes concurrent discovery and chat to one owned runtime instead of installed Ollama', async () => {
  const results = await Promise.all([discoverLocalAiRuntimes(true), ensureLocalAiRuntime(true)])
  expect(results.every(result => result.endpoint === 'http://127.0.0.1:54321/v1')).toBe(true)
  expect(mocks.spawn).toHaveBeenCalledTimes(1)
  expect(mocks.spawn.mock.calls[0][2]).toMatchObject({ windowsHide: true, env: { OLLAMA_HOST: '127.0.0.1:54321' } })
  expect((await resolveLocalAiRequestModel('gemma3:4b')).baseURL).toBe('http://127.0.0.1:54321/v1')
  expect(urls.some(url => url.includes(':11434'))).toBe(false)
})

it('fails closed on an unexpected server version without using external Ollama', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { urls.push(url); return new Response(JSON.stringify({ version: 'unpatched' })) }))
  expect((await ensureLocalAiRuntime(true)).available).toBe(false)
  expect(urls.every(url => url.includes(':54321/'))).toBe(true)
})

it('only stops the owned process tree', async () => {
  await ensureLocalAiRuntime(true)
  stopManagedLocalAiRuntime()
  if (process.platform === 'win32') expect(mocks.exec).toHaveBeenCalledWith('taskkill', ['/pid', '4321', '/T', '/F'], expect.objectContaining({ windowsHide: true }))
})

it('does not start a late child after shutdown while allocating its port', async () => {
  let release: ((port: number) => void) | undefined
  mocks.allocate.mockImplementation(() => new Promise<number>(resolve => { release = resolve }))
  const pending = ensureLocalAiRuntime(true)
  stopManagedLocalAiRuntime()
  release?.(54321)
  expect((await pending).available).toBe(false)
  expect(mocks.spawn).not.toHaveBeenCalled()
})

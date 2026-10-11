// @vitest-environment node
import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cp = vi.hoisted(() => ({
  spawn: vi.fn(),
  execFileSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => cp.spawn(...args),
  execFileSync: (...args: unknown[]) => cp.execFileSync(...args),
}))

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
}))

import {
  cancelLocalAiModelDownload,
  downloadLocalAiModel,
  ensureLocalAiRuntime,
  getLocalAiActiveDownloads,
  resetLocalAiStateForTests,
  stopManagedLocalAiRuntime,
  uninstallLocalAiModel,
} from '../localAi'

class FakeChild extends EventEmitter {
  pid = 4242
  exitCode: number | null = null
  signalCode: string | null = null
  unref = vi.fn()
  kill = vi.fn()
  constructor() {
    super()
    queueMicrotask(() => this.emit('spawn'))
  }
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }
}

function streamOf(lines: string[], opts: { hang?: boolean; signal?: AbortSignal } = {}) {
  const encoder = new TextEncoder()
  const cancel = vi.fn()
  let index = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < lines.length) {
        controller.enqueue(encoder.encode(`${lines[index++]}\n`))
        return undefined
      }
      if (opts.hang) {
        return new Promise<void>((_resolve, reject) => {
          opts.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
        })
      }
      controller.close()
      return undefined
    },
    cancel,
  })
  return { ok: true, status: 200, body, text: async () => '', cancel }
}

const OLLAMA_MODELS_URL = 'http://127.0.0.1:11434/v1/models'
const MODEL = 'qwen3:4b'

describe('model download', () => {
  const fetchMock = vi.fn()
  const sender = { isDestroyed: () => false, send: vi.fn() }

  function progressStatuses() {
    return sender.send.mock.calls.map(call => (call[1] as { status: string }).status)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    resetLocalAiStateForTests()
    vi.stubGlobal('fetch', fetchMock)
    // Ollama is "running": the readiness probe succeeds.
    fetchMock.mockImplementation(async (url: string) => {
      if (url === OLLAMA_MODELS_URL) return jsonResponse({ data: [] })
      throw new Error(`unexpected fetch ${url}`)
    })
  })

  afterEach(() => {
    resetLocalAiStateForTests()
    vi.unstubAllGlobals()
  })

  function mockPull(response: unknown | ((signal: AbortSignal) => unknown)) {
    fetchMock.mockImplementation(async (url: string, init?: { signal?: AbortSignal }) => {
      if (url === OLLAMA_MODELS_URL) return jsonResponse({ data: [] })
      if (url.endsWith('/pull')) {
        return typeof response === 'function'
          ? (response as (signal: AbortSignal) => unknown)(init?.signal as AbortSignal)
          : response
      }
      throw new Error(`unexpected fetch ${url}`)
    })
  }

  it('succeeds only when the stream ends with a success status line', async () => {
    mockPull(streamOf(['{"status":"pulling","total":100,"completed":50}', '{"status":"success"}']))

    const result = await downloadLocalAiModel(MODEL, sender as never)

    expect(result).toEqual({ success: true, model: MODEL })
    expect(progressStatuses()[progressStatuses().length - 1]).toBe('success')
  })

  it('treats a stream that ends without success as a failure and emits an error event', async () => {
    mockPull(streamOf(['{"status":"pulling manifest"}', '{"status":"pulling","total":100,"completed":10}']))

    const result = await downloadLocalAiModel(MODEL, sender as never)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/ended before completion/i)
    expect(progressStatuses()[progressStatuses().length - 1]).toBe('error')
  })

  it('reports Ollama stream errors', async () => {
    mockPull(streamOf(['{"error":"pull model manifest: file does not exist"}']))

    const result = await downloadLocalAiModel(MODEL, sender as never)

    expect(result).toMatchObject({ success: false, error: 'pull model manifest: file does not exist' })
    expect(progressStatuses()[progressStatuses().length - 1]).toBe('error')
  })

  it('catches fetch failures, emits an error event, and frees the slot for a retry', async () => {
    mockPull(() => { throw new Error('connect ECONNRESET') })

    const failed = await downloadLocalAiModel(MODEL, sender as never)
    expect(failed.success).toBe(false)
    expect(failed.error).toContain('ECONNRESET')
    expect(progressStatuses()[progressStatuses().length - 1]).toBe('error')

    mockPull(streamOf(['{"status":"success"}']))
    expect(await downloadLocalAiModel(MODEL, sender as never)).toEqual({ success: true, model: MODEL })
  })

  it('rejects a concurrent pull of the same model', async () => {
    mockPull((signal: AbortSignal) => streamOf([], { hang: true, signal }))

    const first = downloadLocalAiModel(MODEL, sender as never)
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith('/pull'))).toBe(true))

    const second = await downloadLocalAiModel(MODEL, sender as never)
    expect(second).toMatchObject({ success: false, error: expect.stringMatching(/already being downloaded/i) })

    cancelLocalAiModelDownload(MODEL)
    await first
  })

  it('reports the latest progress of a running pull so a remounted view can resume it', async () => {
    mockPull((signal: AbortSignal) => streamOf(['{"status":"pulling","total":100,"completed":40}'], { hang: true, signal }))

    expect(getLocalAiActiveDownloads()).toEqual([])
    const pending = downloadLocalAiModel(MODEL, sender as never)
    await vi.waitFor(() => expect(progressStatuses()).toContain('running'))

    expect(getLocalAiActiveDownloads()).toEqual([
      expect.objectContaining({ model: MODEL, status: 'running', percent: 40 }),
    ])

    cancelLocalAiModelDownload(MODEL)
    await pending
    expect(getLocalAiActiveDownloads()).toEqual([])
  })

  it('cancels an in-flight download and releases the stream', async () => {
    mockPull((signal: AbortSignal) => streamOf(['{"status":"pulling","total":100,"completed":5}'], { hang: true, signal }))

    const pending = downloadLocalAiModel(MODEL, sender as never)
    await vi.waitFor(() => expect(progressStatuses()).toContain('running'))

    expect(cancelLocalAiModelDownload(MODEL)).toEqual({ success: true, cancelled: true })
    const result = await pending

    expect(result).toMatchObject({ success: false, cancelled: true })
    expect(progressStatuses()[progressStatuses().length - 1]).toBe('error')
    expect(cancelLocalAiModelDownload(MODEL)).toEqual({ success: true, cancelled: false })
  })
})

describe('model download idle timeout', () => {
  const fetchMock = vi.fn()
  const sender = { isDestroyed: () => false, send: vi.fn() }

  beforeEach(() => {
    vi.clearAllMocks()
    resetLocalAiStateForTests()
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    resetLocalAiStateForTests()
    vi.unstubAllGlobals()
  })

  function mockHangingPull(lines: string[]) {
    fetchMock.mockImplementation(async (url: string, init?: { signal?: AbortSignal }) => {
      if (url === OLLAMA_MODELS_URL) return jsonResponse({ data: [] })
      if (url.endsWith('/pull')) return streamOf(lines, { hang: true, signal: init?.signal })
      throw new Error(`unexpected fetch ${url}`)
    })
  }

  function track<T>(promise: Promise<T>) {
    const state: { settled: boolean; value?: T } = { settled: false }
    void promise.then((value) => { state.settled = true; state.value = value })
    return state
  }

  it('does not give up on a pull that is quiet for less than five minutes', async () => {
    mockHangingPull(['{"status":"pulling","total":100,"completed":5}'])

    const state = track(downloadLocalAiModel(MODEL, sender as never))
    await vi.advanceTimersByTimeAsync(299_000)
    expect(state.settled).toBe(false)

    await vi.advanceTimersByTimeAsync(2_000)
    expect(state.settled).toBe(true)
    expect(state.value).toMatchObject({ success: false, error: expect.stringMatching(/stalled/i) })
  })

  it('allows a much longer silent gap while Ollama is verifying a blob', async () => {
    mockHangingPull(['{"status":"pulling","total":100,"completed":100}', '{"status":"verifying sha256 digest"}'])

    const state = track(downloadLocalAiModel(MODEL, sender as never))
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(state.settled).toBe(false)

    // Still bounded: a verify phase that never finishes is eventually reported as a stall.
    await vi.advanceTimersByTimeAsync(11 * 60_000)
    expect(state.settled).toBe(true)
    expect(state.value).toMatchObject({ success: false, error: expect.stringMatching(/stalled/i) })
  })

  it('allows a long silent gap while writing the manifest', async () => {
    mockHangingPull(['{"status":"writing manifest"}'])

    const state = track(downloadLocalAiModel(MODEL, sender as never))
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(state.settled).toBe(false)

    cancelLocalAiModelDownload(MODEL)
    await vi.advanceTimersByTimeAsync(10)
    expect(state.settled).toBe(true)
  })
})

describe('model uninstall', () => {
  const fetchMock = vi.fn()
  const timeoutError = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
  const notFound = () => ({
    ok: false,
    status: 404,
    text: async () => JSON.stringify({ error: `model '${MODEL}' not found` }),
  })

  function mockDelete(handler: (method: string) => unknown) {
    fetchMock.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (url === OLLAMA_MODELS_URL) return jsonResponse({ data: [] })
      if (url.endsWith('/generate')) return { ok: true, status: 200, text: async () => '{}' }
      if (url.endsWith('/delete')) {
        const result = handler(init?.method ?? 'GET')
        if (result instanceof Error) throw result
        return result
      }
      throw new Error(`unexpected fetch ${url}`)
    })
  }

  function mockCli(code: number, output: string) {
    cp.spawn.mockImplementation(() => {
      const child = new FakeChild() as FakeChild & { stdout: EventEmitter; stderr: EventEmitter }
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      setTimeout(() => {
        child.stderr.emit('data', Buffer.from(output))
        child.emit('close', code)
      }, 0)
      return child
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    resetLocalAiStateForTests()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    resetLocalAiStateForTests()
    vi.unstubAllGlobals()
  })

  it('deletes with a plain DELETE request', async () => {
    mockDelete(() => ({ ok: true, status: 200, text: async () => '' }))

    expect(await uninstallLocalAiModel(MODEL)).toEqual({ success: true, model: MODEL })
    expect(cp.spawn).not.toHaveBeenCalled()
  })

  it('treats "not found" after a timed-out DELETE as success (the delete went through)', async () => {
    mockDelete(method => (method === 'DELETE' ? timeoutError() : notFound()))

    expect(await uninstallLocalAiModel(MODEL)).toEqual({ success: true, model: MODEL })
    expect(cp.spawn).not.toHaveBeenCalled()
  })

  it('treats "ollama rm" reporting not found after a timeout as success', async () => {
    mockDelete(() => timeoutError())
    mockCli(1, `Error: model '${MODEL}' not found`)

    expect(await uninstallLocalAiModel(MODEL)).toEqual({ success: true, model: MODEL })
  })

  it('still fails when the model is not found without any preceding timeout', async () => {
    mockDelete(() => notFound())
    mockCli(1, `Error: model '${MODEL}' not found`)

    const result = await uninstallLocalAiModel(MODEL)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not found/i)
  })

  it('still fails when every attempt times out and the CLI reports a real error', async () => {
    mockDelete(() => timeoutError())
    mockCli(1, 'Error: permission denied')

    const result = await uninstallLocalAiModel(MODEL)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/permission denied/i)
  })
})

// These tests step through the runtime's start/back-off timers; give them headroom when the whole suite runs in parallel.
const MANAGED_RUNTIME_TEST_TIMEOUT_MS = 20_000

describe('managed Ollama runtime', () => {
  const fetchMock = vi.fn()
  let resourcesDir: string
  const originalResourcesPath = (process as { resourcesPath?: string }).resourcesPath

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    resetLocalAiStateForTests()
    // No runtime ever answers.
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    vi.stubGlobal('fetch', fetchMock)

    resourcesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viezan-ollama-'))
    const dir = path.join(resourcesDir, 'local-ai', 'ollama')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, process.platform === 'win32' ? 'ollama.exe' : 'ollama'), '')
    ;(process as { resourcesPath?: string }).resourcesPath = resourcesDir
    cp.spawn.mockImplementation(() => new FakeChild())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    ;(process as { resourcesPath?: string }).resourcesPath = originalResourcesPath
    resetLocalAiStateForTests()
    fs.rmSync(resourcesDir, { recursive: true, force: true })
  })

  async function runEnsure(force: boolean) {
    const pending = ensureLocalAiRuntime(force)
    await vi.advanceTimersByTimeAsync(60_000)
    return pending
  }

  it('never spawns a second `ollama serve` while the first is alive and backs off after a failed start', async () => {
    const first = await runEnsure(true)

    expect(first.available).toBe(false)
    expect(cp.spawn).toHaveBeenCalledTimes(1)
    expect(cp.spawn.mock.calls[0][1]).toEqual(['serve'])

    // Automatic request within the cool-down: no spawn, no waiting.
    const startedAt = Date.now()
    const second = await ensureLocalAiRuntime(false)
    expect(second.available).toBe(false)
    expect(Date.now() - startedAt).toBeLessThan(1_000)
    expect(cp.spawn).toHaveBeenCalledTimes(1)

    // Explicit retry while the managed child is still alive reuses it.
    await runEnsure(true)
    expect(cp.spawn).toHaveBeenCalledTimes(1)
  }, MANAGED_RUNTIME_TEST_TIMEOUT_MS)

  it('respawns after the managed child exits and the user retries explicitly', async () => {
    await runEnsure(true)
    const child = cp.spawn.mock.results[0].value as FakeChild
    child.exitCode = 1
    child.emit('exit', 1, null)

    await runEnsure(true)

    expect(cp.spawn.mock.calls.length).toBeGreaterThan(1)
  }, MANAGED_RUNTIME_TEST_TIMEOUT_MS)

  describe('shutdown', () => {
    const originalPlatform = process.platform

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform })
      vi.restoreAllMocks()
    })

    async function startChild() {
      await runEnsure(true)
      return cp.spawn.mock.results[0].value as FakeChild
    }

    it('terminates the process tree with taskkill on Windows (argv array, no shell)', async () => {
      const child = await startChild()
      Object.defineProperty(process, 'platform', { value: 'win32' })
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)

      stopManagedLocalAiRuntime()

      expect(cp.execFileSync).toHaveBeenCalledWith(
        'taskkill',
        ['/pid', String(child.pid), '/T', '/F'],
        expect.objectContaining({ windowsHide: true }),
      )
      expect(killSpy).not.toHaveBeenCalled()
    })

    it('signals the process group on POSIX', async () => {
      const child = await startChild()
      Object.defineProperty(process, 'platform', { value: 'linux' })
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)

      stopManagedLocalAiRuntime()

      expect(killSpy).toHaveBeenCalledWith(-child.pid, 'SIGTERM')
      // GPU detection also uses execFileSync (nvidia-smi); only taskkill is off-limits here.
      expect(cp.execFileSync).not.toHaveBeenCalledWith('taskkill', expect.anything(), expect.anything())
    })

    it('falls back to child.kill when taskkill fails', async () => {
      const child = await startChild()
      Object.defineProperty(process, 'platform', { value: 'win32' })
      cp.execFileSync.mockImplementation(() => { throw new Error('taskkill failed') })

      stopManagedLocalAiRuntime()

      expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    })
  })
})

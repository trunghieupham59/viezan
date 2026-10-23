// @vitest-environment node
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSmcReader, parseSmcOutput, resolveSmcBinaryPath } from '../smcReader'
import { classifySmcKey } from '../smcKeys'

describe('SMC key classification', () => {
  it('knows the common Intel and Apple Silicon keys', () => {
    expect(classifySmcKey('TC0P')).toEqual({ group: 'cpu', label: 'cpu-proximity' })
    expect(classifySmcKey('TG0D')).toEqual({ group: 'gpu', label: 'gpu-die' })
    expect(classifySmcKey('TaLP')).toEqual({ group: 'other', label: 'airflow-left' })
    expect(classifySmcKey('TB1T')).toEqual({ group: 'other', label: 'battery' })
  })

  it('falls back to the subsystem letter and then to "other"', () => {
    expect(classifySmcKey('Tp0X')).toEqual({ group: 'cpu', label: 'cpu-performance-core' })
    expect(classifySmcKey('Te02')).toEqual({ group: 'cpu', label: 'cpu-efficiency-core' })
    expect(classifySmcKey('TC13')).toEqual({ group: 'cpu', label: 'cpu-core' })
    expect(classifySmcKey('Tg0f')).toEqual({ group: 'gpu', label: 'gpu' })
    expect(classifySmcKey('TRD0')).toEqual({ group: 'other' })
  })
})

describe('parseSmcOutput', () => {
  it('maps the binary output to a snapshot, rounding and labelling', () => {
    const snapshot = parseSmcOutput({
      ok: true,
      timestamp: 1_700_000_000_000,
      sensors: [{ key: 'Tp01', type: 'flt ', celsius: 51.456 }, { key: 'TB1T', type: 'flt ', celsius: 30 }, { key: 'bad' }],
      fans: [{ index: 0, rpm: 2374.4, min: 1499, max: 5348, target: 2371 }, { index: 'x', rpm: 1 }],
    })
    expect(snapshot.source).toBe('smc')
    expect(snapshot.timestamp).toBe(1_700_000_000_000)
    expect(snapshot.sensors).toEqual([
      { id: 'smc:Tp01', code: 'Tp01', group: 'cpu', label: 'cpu-performance-core', celsius: 51.5 },
      { id: 'smc:TB1T', code: 'TB1T', group: 'other', label: 'battery', celsius: 30 },
    ])
    expect(snapshot.fans).toEqual([{ id: 'smc:fan0', index: 0, rpm: 2374, minRpm: 1499, maxRpm: 5348, targetRpm: 2371 }])
  })

  it('throws the binary\'s own error and rejects garbage', () => {
    expect(() => parseSmcOutput({ ok: false, error: 'AppleSMC service not found' })).toThrow(/AppleSMC/)
    expect(() => parseSmcOutput('nope')).toThrow(/no data/)
  })
})

describe('resolveSmcBinaryPath', () => {
  it('uses Resources/native when packaged and native/bin in a checkout', () => {
    expect(resolveSmcBinaryPath({ isPackaged: true, resourcesPath: '/App/Contents/Resources', appPath: '/x' })).toBe('/App/Contents/Resources/native/viezan-smc')
    expect(resolveSmcBinaryPath({ isPackaged: false, resourcesPath: '/x', appPath: '/repo' })).toBe('/repo/native/bin/darwin/viezan-smc')
  })
})

class FakeChild extends EventEmitter {
  stdout = new PassThrough()
  stderr = new PassThrough()
  exitCode: number | null = null
  killed = false
  kill = vi.fn(() => { this.killed = true; return true })
}

describe('createSmcReader', () => {
  const log = { warn: vi.fn(), error: vi.fn() }
  afterEach(() => { vi.useRealTimers() })

  it('keeps one watch child alive across reads and stops it when idle', async () => {
    vi.useFakeTimers()
    const children: FakeChild[] = []
    const spawnProcess = vi.fn(() => { const child = new FakeChild(); children.push(child); return child })
    const reader = createSmcReader({ binaryPath: '/bin/viezan-smc', intervalMs: 1000, idleMs: 5000, spawnProcess: spawnProcess as never, log })

    expect(reader.probe()).toEqual({ supported: false, reason: 'reader-missing', detail: '/bin/viezan-smc' })

    const first = reader.read()
    expect(spawnProcess).toHaveBeenCalledWith('/bin/viezan-smc', ['--watch', '1000'], expect.objectContaining({ windowsHide: true }))
    children[0].stdout.write(`${JSON.stringify({ ok: true, timestamp: Date.now(), sensors: [{ key: 'Tp01', celsius: 50 }], fans: [] })}\n`)
    await expect(first).resolves.toMatchObject({ sensors: [{ code: 'Tp01', celsius: 50 }] })

    // A fresh line is reused without waiting; the child is not respawned.
    await expect(reader.read()).resolves.toMatchObject({ sensors: [{ celsius: 50 }] })
    expect(spawnProcess).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5001)
    expect(children[0].kill).toHaveBeenCalled()

    // After the idle stop the next read spawns again.
    const again = reader.read()
    expect(spawnProcess).toHaveBeenCalledTimes(2)
    children[1].stdout.write(`${JSON.stringify({ ok: true, timestamp: Date.now(), sensors: [], fans: [] })}\n`)
    await expect(again).resolves.toMatchObject({ source: 'smc' })
    reader.dispose?.()
  })

  it('rejects pending reads when the child exits, with its stderr', async () => {
    const children: FakeChild[] = []
    const spawnProcess = vi.fn(() => { const child = new FakeChild(); children.push(child); return child })
    const reader = createSmcReader({ binaryPath: '/bin/viezan-smc', spawnProcess: spawnProcess as never, log })
    const pending = reader.read()
    children[0].stderr.write('dyld: missing library')
    await new Promise((resolve) => setImmediate(resolve))
    children[0].exitCode = 1
    children[0].emit('exit', 1)
    await expect(pending).rejects.toThrow(/missing library/)
  })
})

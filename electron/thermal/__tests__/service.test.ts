// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThermalSnapshot } from '../../../shared/thermalApi'
import { createCpuLoadSampler, loadBetween } from '../cpuLoad'
import type { ThermalReader } from '../reader'
import { createThermalService } from '../service'

const log = { warn: vi.fn(), error: vi.fn() }

function snapshotAt(timestamp: number): ThermalSnapshot {
  return { timestamp, source: 'smc', sensors: [{ id: 's', code: 'Tp01', group: 'cpu', celsius: 50 }], fans: [] }
}

interface FakeReader extends ThermalReader {
  reads: number
  read: ReturnType<typeof vi.fn<() => Promise<ThermalSnapshot>>>
  dispose: ReturnType<typeof vi.fn<() => void>>
}

function fakeReader(): FakeReader {
  const reader: FakeReader = {
    reads: 0,
    probe: () => ({ supported: true, source: 'smc' as const }),
    read: vi.fn(async () => { reader.reads += 1; return snapshotAt(reader.reads) }),
    dispose: vi.fn(),
  }
  return reader
}

beforeEach(() => { vi.useFakeTimers(); log.warn.mockReset() })
afterEach(() => { vi.useRealTimers() })

describe('thermal service', () => {
  it('polls while monitoring, pauses while the window is hidden, and stops cleanly', async () => {
    const reader = fakeReader()
    let paused = false
    const onSnapshot = vi.fn()
    const service = createThermalService({ reader, intervalMs: 1000, isPaused: () => paused, onSnapshot, log })

    service.setMonitoring(true)
    service.setMonitoring(true) // idempotent
    await vi.advanceTimersByTimeAsync(0)
    expect(onSnapshot).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(onSnapshot).toHaveBeenCalledTimes(3)
    expect(service.isMonitoring()).toBe(true)

    paused = true
    await vi.advanceTimersByTimeAsync(3000)
    expect(onSnapshot).toHaveBeenCalledTimes(3)
    paused = false
    await vi.advanceTimersByTimeAsync(1000)
    expect(onSnapshot).toHaveBeenCalledTimes(4)

    service.setMonitoring(false)
    expect(reader.dispose).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(onSnapshot).toHaveBeenCalledTimes(4)
    expect(service.isMonitoring()).toBe(false)
  })

  it('attaches the CPU load to snapshots and reports read failures without stopping', async () => {
    const reader = fakeReader()
    let loads = [undefined, 12, 40]
    const onSnapshot = vi.fn()
    const onError = vi.fn()
    const service = createThermalService({ reader, intervalMs: 1000, sampleCpuLoad: () => loads.shift(), onSnapshot, onError, log })

    service.setMonitoring(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(onSnapshot.mock.calls[0][0].cpuLoadPercent).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1000)
    expect(onSnapshot.mock.calls[1][0].cpuLoadPercent).toBe(12)

    vi.mocked(reader.read).mockRejectedValueOnce(new Error('SMC reader timed out.'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(onError).toHaveBeenCalledWith({ message: 'SMC reader timed out.' })
    loads = [7]
    await vi.advanceTimersByTimeAsync(1000)
    expect(onSnapshot).toHaveBeenCalledTimes(3)
    expect(service.isMonitoring()).toBe(true)
    service.stop()
  })

  it('refuses to read when the platform is unsupported and caches the probe', async () => {
    const probe = vi.fn(() => ({ supported: false, reason: 'unsupported-platform' as const }))
    const service = createThermalService({ reader: { probe, read: vi.fn() }, log })
    expect(service.getSupport()).toEqual({ supported: false, reason: 'unsupported-platform' })
    expect(service.getSupport()).toBe(service.getSupport())
    expect(probe).toHaveBeenCalledTimes(1)
    await expect(service.read()).rejects.toThrow(/not supported/)
  })
})

describe('cpu load sampler', () => {
  it('derives busy time from idle and total deltas, clamped to 0–100', () => {
    expect(loadBetween({ idle: 100, total: 200 }, { idle: 150, total: 300 })).toBe(50)
    expect(loadBetween({ idle: 0, total: 0 }, { idle: 0, total: 0 })).toBeUndefined()
    expect(loadBetween({ idle: 0, total: 100 }, { idle: 0, total: 200 })).toBe(100)
  })

  it('needs a baseline before the first value', () => {
    let times = { user: 10, nice: 0, sys: 10, idle: 80, irq: 0 }
    const sampler = createCpuLoadSampler(() => [{ model: 'x', speed: 1, times }])
    expect(sampler.sample()).toBeUndefined()
    times = { user: 40, nice: 0, sys: 10, idle: 100, irq: 0 }
    expect(sampler.sample()).toBe(60)
  })
})

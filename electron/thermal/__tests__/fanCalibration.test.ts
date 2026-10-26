// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FanAffinityResult, FanCommand, FanControlState, ThermalSnapshot } from '../../../shared/thermalApi'
import { affinitySensorIds, buildAffinities, coolingDeltas, createFanCalibration } from '../fanCalibration'
import type { FanControlService } from '../fanControlTypes'
import { isFanSourceId, resolveFanSource } from '../fanCurve'
import { classifyFanName, fanLabelFor } from '../fanNames'

describe('fan names', () => {
  it('reads the description first, then the model table, else "main" for a single fan', () => {
    expect(classifyFanName('Left side')).toBe('left')
    expect(classifyFanName('CPU Fan')).toBe('cpu')
    expect(classifyFanName('Exhaust')).toBe('exhaust')
    expect(classifyFanName('X7')).toBeUndefined()
    expect(fanLabelFor({ model: 'MacBookPro18,2', index: 0, count: 2 })).toBe('left')
    expect(fanLabelFor({ model: 'MacBookPro18,2', index: 1, count: 2 })).toBe('right')
    expect(fanLabelFor({ model: 'MacBookPro18,2', index: 0, count: 3 })).toBeUndefined()
    expect(fanLabelFor({ model: 'MacBookAir10,1', index: 0, count: 1 })).toBe('main')
    expect(fanLabelFor({ model: 'Unknown1,1', index: 0, count: 1 })).toBe('main')
    expect(fanLabelFor({ model: 'MacBookPro18,2', index: 0, count: 2, name: 'Right side' })).toBe('right')
  })
})

describe('affinity maths', () => {
  it('cancels drift with the two baselines and attributes a sensor to the fan that cooled it clearly more', () => {
    // The machine warms by 1 °C over the run: the spin reading alone would hide fan 0's effect.
    const before = new Map([['smc:Tp01', 60], ['smc:Tg05', 50]])
    const during = new Map([['smc:Tp01', 55], ['smc:Tg05', 49]])
    const after = new Map([['smc:Tp01', 62], ['smc:Tg05', 52]])
    const delta = coolingDeltas(before, during, after)
    expect(delta.get('smc:Tp01')).toBe(6)
    expect(delta.get('smc:Tg05')).toBe(2)
    expect(coolingDeltas(before, during, null).get('smc:Tp01')).toBe(5)

    const deltas = new Map([
      ['smc:fan0', new Map([['smc:Tp01', 6], ['smc:Tg05', 2], ['smc:TB1T', 0.2]])],
      ['smc:fan1', new Map([['smc:Tp01', 2], ['smc:Tg05', 2], ['smc:Te01', 3]])],
    ])
    const fans = buildAffinities(deltas)
    expect(fans[0].sensors).toEqual([
      { sensorId: 'smc:Tp01', cooling: 6, share: 0.75, contrast: 4 },
      { sensorId: 'smc:Tg05', cooling: 2, share: 0.5, contrast: 0 },
    ])
    expect(fans[1].sensors.map((s) => [s.sensorId, s.contrast])).toEqual([['smc:Te01', 3], ['smc:Tg05', 0], ['smc:Tp01', -4]])
    // Ownership needs contrast: the GPU sensor both fans cool alike stays shared and is not an affinity source for either.
    expect(affinitySensorIds(fans[0])).toEqual(['smc:Tp01'])
    expect(affinitySensorIds(fans[1])).toEqual(['smc:Te01'])
    // A fan that cooled nothing clearly more still gets its strongest sensors as a fallback.
    expect(affinitySensorIds({ fanId: 'x', sensors: [{ sensorId: 'a', cooling: 1, share: 0.5, contrast: 0 }, { sensorId: 'b', cooling: 2, share: 0.5, contrast: 0 }] })).toEqual(['b', 'a'])
    expect(affinitySensorIds(undefined)).toBeNull()
  })

  it('resolves affinity sources through the lookup and falls back to the hottest sensor', () => {
    const sensors = [
      { id: 'smc:Tp01', code: 'Tp01', group: 'cpu' as const, celsius: 60 },
      { id: 'smc:Te01', code: 'Te01', group: 'cpu' as const, celsius: 70 },
    ]
    expect(isFanSourceId('affinity:fan0')).toBe(true)
    expect(isFanSourceId('affinity:fanx')).toBe(false)
    expect(resolveFanSource(sensors, 'affinity:fan0', (key) => (key === 'fan0' ? ['smc:Tp01'] : null))?.id).toBe('smc:Tp01')
    expect(resolveFanSource(sensors, 'affinity:fan1', () => null)?.id).toBe('smc:Te01')
    expect(resolveFanSource(sensors, 'affinity:fan0', () => ['smc:Gone'])?.id).toBe('smc:Te01')
  })
})

function fakeControl() {
  let state: FanControlState = {
    helper: 'ready', helperVersion: '1.0.0',
    fans: [
      { id: 'smc:fan0', index: 0, mode: 'auto', minRpm: 1499, maxRpm: 5348, currentRpm: 1900 },
      { id: 'smc:fan1', index: 1, mode: 'auto', minRpm: 1499, maxRpm: 5776, currentRpm: 1700 },
    ],
  }
  const calls: Array<{ fanId: string; command: FanCommand } | 'restoreAll'> = []
  const control: FanControlService = {
    getState: () => state,
    enable: async () => state,
    setFan: async (fanId, command) => { calls.push({ fanId, command }); return state },
    restoreAll: async () => { calls.push('restoreAll'); return state },
    disable: async () => state,
    stop: async () => {},
    resume: async () => state,
    installHelper: async () => state,
    uninstallHelper: async () => state,
  }
  return { control, calls, setHelper: (helper: FanControlState['helper']) => { state = { ...state, helper } } }
}

/** Temperatures that react to the fan being spun: fan0 cools Tp01 a lot and Tg05 a little, fan1 cools Te01. */
function snapshotFor(spinning: string | null, at: number): ThermalSnapshot {
  const cool = (fan: string, amount: number) => (spinning === fan ? amount : 0)
  return {
    timestamp: at, source: 'smc', model: 'MacBookPro18,2',
    sensors: [
      { id: 'smc:Tp01', code: 'Tp01', group: 'cpu', label: 'cpu-performance-core', celsius: 60 - cool('smc:fan0', 6) - cool('smc:fan1', 1) },
      { id: 'smc:Tg05', code: 'Tg05', group: 'gpu', label: 'gpu', celsius: 50 - cool('smc:fan0', 2) - cool('smc:fan1', 2) },
      { id: 'smc:Te01', code: 'Te01', group: 'cpu', label: 'cpu-efficiency-core', celsius: 48 - cool('smc:fan1', 4) },
      { id: 'smc:TB1T', code: 'TB1T', group: 'other', label: 'battery', celsius: 30 },
    ],
    fans: [],
  }
}

describe('fan calibration run', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  function setup() {
    const { control, calls, setHelper } = fakeControl()
    let listener: ((snapshot: ThermalSnapshot) => void) | null = null
    const saved: Array<FanAffinityResult | null> = []
    const onState = vi.fn()
    const setBackgroundReads = vi.fn()
    const service = createFanCalibration({
      control,
      subscribeSnapshots: (cb) => { listener = cb; return () => { listener = null } },
      setBackgroundReads,
      saveResult: (result) => { saved.push(result) },
      loadResult: () => null,
      onState,
      timings: { preSettleMs: 1000, baselineMs: 4000, spinMs: 6000, windowMs: 2000, settleMs: 2000 },
      log: { warn: vi.fn(), error: vi.fn() },
    })
    // Feed a reading every second that reflects whichever fan is currently fixed at full speed.
    let spinning: string | null = null
    const feeder = setInterval(() => { listener?.(snapshotFor(spinning, Date.now())) }, 1000)
    const originalSetFan = control.setFan
    control.setFan = async (fanId, command) => { spinning = command.mode === 'fixed' ? fanId : null; return originalSetFan(fanId, command) }
    return { service, calls, saved, onState, setBackgroundReads, setHelper, stop: () => clearInterval(feeder) }
  }

  it('spins each fan in turn, attributes the cooling, saves the result and returns everything to automatic', async () => {
    const { service, calls, saved, onState, setBackgroundReads, stop } = setup()
    const started = await service.start()
    expect(started.status).toBe('running')
    expect(setBackgroundReads).toHaveBeenLastCalledWith(true)

    await vi.advanceTimersByTimeAsync(1000 + 4500) // pre-settle, baseline of fan 0 done, fan 0 spinning
    expect(calls).toContainEqual({ fanId: 'smc:fan0', command: { mode: 'fixed', rpm: 5348 } })
    expect(service.getState()).toMatchObject({ status: 'running', fanId: 'smc:fan0', phase: 'spin' })

    await vi.advanceTimersByTimeAsync(6000) // spin done → auto, settle
    expect(calls).toContainEqual({ fanId: 'smc:fan0', command: { mode: 'auto' } })
    await vi.advanceTimersByTimeAsync(2000 + 4000 + 6000 + 2000 + 500) // settle, baseline 1, spin 1, final settle
    const done = service.getState()
    expect(done.status).toBe('done')
    expect(saved).toHaveLength(1)
    const result = saved[0] as FanAffinityResult
    expect(result.model).toBe('MacBookPro18,2')
    const fan0 = result.fans.find((fan) => fan.fanId === 'smc:fan0')
    const fan1 = result.fans.find((fan) => fan.fanId === 'smc:fan1')
    expect(fan0?.sensors.map((s) => s.sensorId)).toEqual(['smc:Tp01', 'smc:Tg05'])
    expect(fan0?.sensors[0]).toMatchObject({ cooling: 6, share: 0.86, contrast: 5 })
    expect(fan1?.sensors.map((s) => s.sensorId)).toEqual(['smc:Te01', 'smc:Tg05', 'smc:Tp01'])
    // Each fan owns what it cooled clearly more; the GPU sensor both cool alike is shared.
    expect(service.affinitySensors('fan0')).toEqual(['smc:Tp01'])
    expect(service.affinitySensors('fan1')).toEqual(['smc:Te01'])
    // Every fan is back on automatic at the end and the reader may rest again.
    expect(calls[calls.length - 1]).toBe('restoreAll')
    expect(setBackgroundReads).toHaveBeenLastCalledWith(false)
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ status: 'done' }))
    stop()
  })

  it('cancels mid-run, restores the fans and keeps the previous result', async () => {
    const { service, calls, saved, stop } = setup()
    await service.start()
    await vi.advanceTimersByTimeAsync(1000 + 5000)
    expect(service.getState().phase).toBe('spin')
    const cancelling = await service.cancel()
    expect(cancelling.status).toBe('cancelled')
    await vi.advanceTimersByTimeAsync(100)
    expect(service.getState().status).toBe('cancelled')
    expect(calls[calls.length - 1]).toBe('restoreAll')
    expect(saved).toHaveLength(0)
    await expect(service.start()).resolves.toMatchObject({ status: 'running' })
    await service.cancel()
    await vi.advanceTimersByTimeAsync(100)
    stop()
  })

  it('refuses to start without a ready helper or while already running', async () => {
    const { service, setHelper, stop } = setup()
    setHelper('idle')
    await expect(service.start()).rejects.toThrow(/not connected/)
    setHelper('ready')
    await service.start()
    await expect(service.start()).rejects.toThrow(/already running/)
    await service.cancel()
    await vi.advanceTimersByTimeAsync(100)
    stop()
  })
})

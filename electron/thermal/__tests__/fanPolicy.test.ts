// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { FanCommand, FanControlState, ThermalSnapshot } from '../../../shared/thermalApi'
import type { FanControlService } from '../fanControlTypes'
import { FAN_TARGET_DEADBAND_RPM, isFanSensorRule, isFanSourceId, needsTargetUpdate, resolveFanSource, smoothCelsius, snapRpm, targetChangeAllowed, targetForTemperature } from '../fanCurve'
import { createFanPolicy } from '../fanPolicy'

const range = { minRpm: 1499, maxRpm: 5348 }
const rule = { sensorId: 'smc:Tp01', minCelsius: 50, maxCelsius: 90 }

/** Let the policy's serialised bridge writes (several awaits deep) run to completion. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('fan curve', () => {
  it('maps temperature to a snapped target inside the fan range', () => {
    expect(targetForTemperature(30, rule, range)).toBe(1499)
    expect(targetForTemperature(50, rule, range)).toBe(1499)
    expect(targetForTemperature(70, rule, range)).toBe(3400) // halfway: 1499 + 0.5 * 3849 = 3423.5 → 3400
    expect(targetForTemperature(90, rule, range)).toBe(5348)
    expect(targetForTemperature(105, rule, range)).toBe(5348)
    expect(targetForTemperature(Number.NaN, rule, range)).toBe(1499)
    expect(snapRpm(2374, range)).toBe(2350)
    expect(snapRpm(100, range)).toBe(1499)
  })

  it('ignores wobble inside the dead band but always honours the range ends', () => {
    expect(needsTargetUpdate(undefined, 2000, range)).toBe(true)
    expect(needsTargetUpdate(2000, 2000 + FAN_TARGET_DEADBAND_RPM - 50, range)).toBe(false)
    expect(needsTargetUpdate(2000, 2000 + FAN_TARGET_DEADBAND_RPM, range)).toBe(true)
    expect(needsTargetUpdate(1550, 1499, range)).toBe(true)
    expect(needsTargetUpdate(5300, 5348, range)).toBe(true)
    expect(needsTargetUpdate(1499, 1499, range)).toBe(false)
  })

  it('resolves group, label and raw sources to the hottest matching sensor', () => {
    const sensors = [
      { id: 'smc:Tp01', code: 'Tp01', group: 'cpu' as const, label: 'cpu-performance-core' as const, celsius: 61 },
      { id: 'smc:Tp05', code: 'Tp05', group: 'cpu' as const, label: 'cpu-performance-core' as const, celsius: 64 },
      { id: 'smc:Te01', code: 'Te01', group: 'cpu' as const, label: 'cpu-efficiency-core' as const, celsius: 50 },
      { id: 'smc:Tg05', code: 'Tg05', group: 'gpu' as const, label: 'gpu' as const, celsius: 70 },
    ]
    expect(resolveFanSource(sensors, 'group:cpu')?.id).toBe('smc:Tp05')
    expect(resolveFanSource(sensors, 'group:gpu')?.id).toBe('smc:Tg05')
    expect(resolveFanSource(sensors, 'group:all')?.id).toBe('smc:Tg05')
    expect(resolveFanSource(sensors, 'label:cpu-efficiency-core')?.id).toBe('smc:Te01')
    expect(resolveFanSource(sensors, 'smc:Tp01')?.id).toBe('smc:Tp01')
    expect(resolveFanSource(sensors, 'group:other')).toBeNull()
    expect(resolveFanSource(sensors, 'label:battery')).toBeNull()
    expect(isFanSourceId('group:cpu')).toBe(true)
    expect(isFanSourceId('group:disk')).toBe(false)
    expect(isFanSourceId('label:cpu-die')).toBe(true)
    expect(isFanSourceId('label:CPU DIE')).toBe(false)
    expect(isFanSourceId('smc:Tp01')).toBe(true)
  })

  it('smooths readings over time but snaps on a real jump, and spaces ordinary target changes', () => {
    expect(smoothCelsius(undefined, 60, 0)).toBe(60)
    expect(smoothCelsius(60, 62, 2000)).toBeCloseTo(60.36, 1) // a 2 °C wobble moves the average a little
    expect(smoothCelsius(60, 62, 10_000)).toBeCloseTo(61.26, 1)
    expect(smoothCelsius(60, 75, 2000)).toBe(75) // load arrived: follow it now
    expect(targetChangeAllowed(undefined, 1000, undefined, 2000)).toBe(true)
    expect(targetChangeAllowed(0, 2000, 2000, 2100)).toBe(false) // 100 RPM nudge two seconds after the last change
    expect(targetChangeAllowed(0, 6000, 2000, 2100)).toBe(true)
    expect(targetChangeAllowed(0, 2000, 2000, 2500)).toBe(true) // urgent
  })

  it('validates rules against the shared bounds', () => {
    expect(isFanSensorRule(rule)).toBe(true)
    expect(isFanSensorRule({ ...rule, sensorId: 'group:cpu' })).toBe(true)
    expect(isFanSensorRule({ ...rule, minCelsius: 95 })).toBe(false)
    expect(isFanSensorRule({ ...rule, maxCelsius: 120 })).toBe(false)
    expect(isFanSensorRule({ ...rule, sensorId: 7 })).toBe(false)
  })
})

/** A bridge that remembers fixed targets and reports them like the real one would. */
function fakeBridge(initial: FanControlState['helper'] = 'ready') {
  let state: FanControlState = {
    helper: initial, helperVersion: '1.0.0',
    fans: [
      { id: 'smc:fan0', index: 0, mode: 'auto', ...range, currentRpm: 1900 },
      { id: 'smc:fan1', index: 1, mode: 'auto', minRpm: 1499, maxRpm: 5776, currentRpm: 1700 },
    ],
  }
  const bridge: FanControlService & { setFan: ReturnType<typeof vi.fn<FanControlService['setFan']>>; state: () => FanControlState } = {
    state: () => state,
    getState: () => state,
    enable: async () => { state = { ...state, helper: 'ready' }; return state },
    setFan: vi.fn(async (fanId: string, command: FanCommand) => {
      if (command.mode === 'sensor') throw new Error('bridge only knows auto/fixed')
      state = { ...state, fans: state.fans.map((fan) => (fan.id === fanId ? { ...fan, mode: command.mode, ...(command.mode === 'fixed' ? { targetRpm: command.rpm } : { targetRpm: undefined }) } : fan)) }
      return state
    }),
    restoreAll: async () => { state = { ...state, fans: state.fans.map((fan) => ({ ...fan, mode: 'auto', targetRpm: undefined })) }; return state },
    disable: async () => { state = { helper: 'idle', fans: [] }; return state },
    stop: async () => { state = { helper: 'idle', fans: [] } },
    resume: async () => { state = { ...state, helper: 'ready' }; return state },
    installHelper: async () => { state = { ...state, helper: 'ready', install: 'installed' }; return state },
    uninstallHelper: async () => { state = { helper: 'idle', install: 'not-installed', fans: [] }; return state },
  }
  return bridge
}

function snapshotAt(celsius: number, extra: ThermalSnapshot['sensors'] = []): ThermalSnapshot {
  return { timestamp: Date.now(), source: 'smc', sensors: [{ id: 'smc:Tp01', code: 'Tp01', group: 'cpu', celsius }, ...extra], fans: [] }
}

describe('fan policy', () => {
  function setup() {
    const bridge = fakeBridge()
    let listener: ((snapshot: ThermalSnapshot) => void) | null = null
    const unsubscribe = vi.fn(() => { listener = null })
    const subscribeSnapshots = vi.fn((cb: (snapshot: ThermalSnapshot) => void) => { listener = cb; return unsubscribe })
    const setBackgroundReads = vi.fn()
    const onState = vi.fn()
    const policy = createFanPolicy({ control: bridge, subscribeSnapshots, setBackgroundReads, onState, log: { warn: vi.fn(), error: vi.fn() } })
    const push = (snapshot: ThermalSnapshot) => listener?.(snapshot)
    return { bridge, policy, push, subscribeSnapshots, unsubscribe, setBackgroundReads, onState }
  }

  it('drives a fan from its sensor, with dead band, and reports the sensor mode to the renderer', async () => {
    const { bridge, policy, push, setBackgroundReads, subscribeSnapshots, onState } = setup()

    const state = await policy.setFan('smc:fan0', { mode: 'sensor', ...rule })
    expect(state.fans[0]).toMatchObject({ mode: 'sensor', sensor: rule })
    expect(state.fans[0].targetRpm).toBeUndefined() // no reading yet
    expect(setBackgroundReads).toHaveBeenLastCalledWith(true)
    expect(subscribeSnapshots).toHaveBeenCalledTimes(1)
    expect(bridge.setFan).not.toHaveBeenCalled()

    push(snapshotAt(70))
    await flush()
    expect(bridge.setFan).toHaveBeenLastCalledWith('smc:fan0', { mode: 'fixed', rpm: 3400 })
    expect(policy.getState().fans[0]).toMatchObject({ mode: 'sensor', targetRpm: 3400, sensorCelsius: 70 })
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ fans: expect.arrayContaining([expect.objectContaining({ id: 'smc:fan0', mode: 'sensor', targetRpm: 3400 })]) }))

    // Half a degree of wobble (about 50 RPM on this slope) stays inside the dead band: no new write, but the reading is reported.
    push(snapshotAt(70.5))
    await flush()
    expect(bridge.setFan).toHaveBeenCalledTimes(1)
    expect(policy.getState().fans[0].sensorCelsius).toBe(70.5)

    push(snapshotAt(95))
    await flush()
    expect(bridge.setFan).toHaveBeenLastCalledWith('smc:fan0', { mode: 'fixed', rpm: 5348 })

    // The sensor disappears from a reading: the fan keeps its target and the UI learns the reading is gone.
    push({ ...snapshotAt(95), sensors: [] })
    await flush()
    expect(policy.getState().fans[0]).toMatchObject({ targetRpm: 5348 })
    expect(policy.getState().fans[0].sensorCelsius).toBeUndefined()

    // The other fan is untouched and still reported as the bridge sees it.
    expect(policy.getState().fans[1].mode).toBe('auto')
  })

  it('switching back to auto or fixed drops the rule and stops background reads', async () => {
    const { bridge, policy, push, setBackgroundReads, unsubscribe } = setup()
    await policy.setFan('smc:fan0', { mode: 'sensor', ...rule })
    push(snapshotAt(80))
    await flush()

    const fixed = await policy.setFan('smc:fan0', { mode: 'fixed', rpm: 2000 })
    expect(fixed.fans[0]).toMatchObject({ mode: 'fixed', targetRpm: 2000 })
    expect(fixed.fans[0].sensor).toBeUndefined()
    expect(setBackgroundReads).toHaveBeenLastCalledWith(false)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(policy.rules().size).toBe(0)

    // A later snapshot must not resurrect the rule.
    push(snapshotAt(95))
    await flush()
    expect(bridge.setFan).toHaveBeenLastCalledWith('smc:fan0', { mode: 'fixed', rpm: 2000 })
  })

  it('applies right away from the last reading, clears rules on restoreAll, and on helper loss', async () => {
    const { bridge, policy, push, setBackgroundReads } = setup()
    // A group source follows the hottest sensor of the group, whichever key that is.
    await policy.setFan('smc:fan1', { mode: 'sensor', sensorId: 'group:cpu', minCelsius: 50, maxCelsius: 90 })
    push(snapshotAt(60, [{ id: 'smc:Tp09', code: 'Tp09', group: 'cpu', celsius: 70 }]))
    await flush()
    expect(bridge.setFan).toHaveBeenLastCalledWith('smc:fan1', { mode: 'fixed', rpm: 3650 }) // 70 °C, not 60
    expect(policy.getState().fans[1].sensorCelsius).toBe(70)
    // Re-tuning the rule on a fan with a known reading applies immediately.
    await policy.setFan('smc:fan1', { mode: 'sensor', sensorId: 'smc:Tp01', minCelsius: 30, maxCelsius: 60 })
    expect(bridge.setFan).toHaveBeenLastCalledWith('smc:fan1', { mode: 'fixed', rpm: 5776 })

    const restored = await policy.restoreAll()
    expect(restored.fans.every((fan) => fan.mode === 'auto')).toBe(true)
    expect(policy.rules().size).toBe(0)

    await policy.setFan('smc:fan0', { mode: 'sensor', ...rule })
    expect(policy.rules().size).toBe(1)
    policy.ingestControlState({ helper: 'idle', fans: [], lastRestoreReason: 'disconnect' })
    expect(policy.rules().size).toBe(0)
    expect(setBackgroundReads).toHaveBeenLastCalledWith(false)
    expect(policy.getState()).toMatchObject({ helper: 'idle', lastRestoreReason: 'disconnect' })
  })

  it('drops every rule when the helper restores at the temperature ceiling, but not for other restores', async () => {
    const { bridge, policy, setBackgroundReads } = setup()
    await policy.setFan('smc:fan0', { mode: 'sensor', ...rule })
    const ready = bridge.state()
    policy.ingestControlState({ ...ready, restoreSeq: 4 })
    policy.ingestControlState({ ...ready, restoreSeq: 5, lastRestoreReason: 'wake' })
    expect(policy.rules().size).toBe(1)
    // Left in place, the rule would take the fan back as soon as the machine cooled below its maximum.
    policy.ingestControlState({ ...ready, restoreSeq: 6, lastRestoreReason: 'ceiling' })
    expect(policy.rules().size).toBe(0)
    expect(policy.getState().fans[0].mode).toBe('auto')
    expect(setBackgroundReads).toHaveBeenLastCalledWith(false)
  })

  it('refuses a rule while the helper is not ready or for an unknown fan', async () => {
    const bridge = fakeBridge('idle')
    const policy = createFanPolicy({ control: bridge, subscribeSnapshots: () => () => {}, setBackgroundReads: vi.fn() })
    await expect(policy.setFan('smc:fan0', { mode: 'sensor', ...rule })).rejects.toThrow(/not connected/)
    await bridge.enable()
    await expect(policy.setFan('smc:fan9', { mode: 'sensor', ...rule })).rejects.toThrow(/No fan/)
  })
})

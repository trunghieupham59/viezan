/**
 * Fan policy — the modes the app adds on top of the helper bridge.
 *
 * `fanControl.ts` knows two things: a fan is on automatic control or holds one fixed
 * target. This layer wraps it with the `sensor` mode: per fan, a two-point rule on one
 * temperature source (a sensor group, a sensor meaning, or one raw sensor; the hottest
 * match counts) that is re-evaluated on every thermal snapshot and applied to the
 * bridge as fixed targets (`fanCurve.ts`). IPC, the capability and the renderer
 * see this service; the bridge stays a thin, testable helper client.
 *
 * Readings are smoothed over about ten seconds and ordinary target changes are spaced
 * a few seconds apart, so a fan ramps instead of hunting on a reading that wobbles;
 * a jump of several degrees, or a target several hundred RPM away, goes through at once.
 * Rules exist only while the helper is `ready`; any loss of the helper (which already
 * restored the fans) clears them. While a rule is active the thermal reader keeps
 * running in the background so a hidden window still drives the fan.
 */
import type { FanCommand, FanControlFan, FanControlState, FanSensorRule, ThermalSnapshot } from '../../shared/thermalApi'
import type { FanControlService } from './fanControlTypes'
import { type AffinityLookup, needsTargetUpdate, resolveFanSource, smoothCelsius, targetChangeAllowed, targetForTemperature } from './fanCurve'

export interface FanPolicyDeps {
  control: FanControlService
  /** Thermal snapshots as they are read (`ThermalService.subscribe`). */
  subscribeSnapshots: (listener: (snapshot: ThermalSnapshot) => void) => () => void
  /** Keep the reader going while the window is hidden (true while any sensor rule is active). */
  setBackgroundReads: (active: boolean) => void
  /** Calibration result for `affinity:fanN` sources; absent means not calibrated. */
  affinity?: AffinityLookup
  onState?: (state: FanControlState) => void
  log?: Pick<Console, 'warn' | 'error'>
}

export interface FanPolicyService extends FanControlService {
  /** The bridge's `onState` must be routed here so the policy can merge and forward it. */
  ingestControlState: (state: FanControlState) => void
  /** Active rules, for tests and for a later profile layer. */
  rules: () => ReadonlyMap<string, FanSensorRule>
}

interface RuleState {
  rule: FanSensorRule
  appliedRpm?: number
  /** Latest raw reading of the source (what the UI shows). */
  celsius?: number
  /** Smoothed reading the target is computed from. */
  smoothed?: number
  lastReadingAt?: number
  lastChangeAt?: number
}

export function createFanPolicy({ control, subscribeSnapshots, setBackgroundReads, affinity, onState, log = console }: FanPolicyDeps): FanPolicyService {
  const rules = new Map<string, RuleState>()
  let controlState: FanControlState = control.getState()
  let lastEmitted = ''
  let unsubscribe: (() => void) | null = null
  let applying: Promise<unknown> = Promise.resolve()

  function merged(): FanControlState {
    const fans: FanControlFan[] = controlState.fans.map((fan) => {
      const entry = rules.get(fan.id)
      if (!entry) return fan
      return {
        ...fan,
        mode: 'sensor',
        sensor: { ...entry.rule },
        ...(entry.appliedRpm !== undefined ? { targetRpm: entry.appliedRpm } : {}),
        ...(entry.celsius !== undefined ? { sensorCelsius: entry.celsius } : {}),
      }
    })
    return { ...controlState, fans }
  }

  function emit() {
    const next = merged()
    const key = JSON.stringify(next)
    if (key === lastEmitted) return
    lastEmitted = key
    onState?.(next)
  }

  function syncBackground() {
    const active = rules.size > 0
    setBackgroundReads(active)
    if (active && !unsubscribe) unsubscribe = subscribeSnapshots(onSnapshot)
    if (!active && unsubscribe) { unsubscribe(); unsubscribe = null }
  }

  function clearRules() {
    if (rules.size === 0) return
    rules.clear()
    syncBackground()
  }

  /** Serialise bridge writes so two snapshots cannot interleave their commands. */
  function enqueue(work: () => Promise<unknown>) {
    applying = applying.then(work, work).catch((e) => log.warn('[Thermal] fan policy apply failed:', e instanceof Error ? e.message : e))
    return applying
  }

  function evaluate(fanId: string, entry: RuleState, celsius: number | undefined, at = Date.now()): number | null {
    const fan = controlState.fans.find((candidate) => candidate.id === fanId)
    if (!fan || celsius === undefined) return null
    entry.celsius = celsius
    entry.smoothed = smoothCelsius(entry.smoothed, celsius, entry.lastReadingAt === undefined ? 0 : at - entry.lastReadingAt)
    entry.lastReadingAt = at
    const next = targetForTemperature(entry.smoothed, entry.rule, fan)
    if (!needsTargetUpdate(entry.appliedRpm, next, fan)) return null
    return targetChangeAllowed(entry.lastChangeAt, at, entry.appliedRpm, next) ? next : null
  }

  function fanRangeOf(fanId: string): { minRpm: number; maxRpm: number } {
    const fan = controlState.fans.find((candidate) => candidate.id === fanId)
    return fan ?? { minRpm: 0, maxRpm: 0 }
  }

  function onSnapshot(snapshot: ThermalSnapshot) {
    if (controlState.helper !== 'ready' || rules.size === 0) return
    let changed = false
    for (const [fanId, entry] of rules) {
      const sensor = resolveFanSource(snapshot.sensors, entry.rule.sensorId, affinity)
      const previousCelsius = entry.celsius
      const target = evaluate(fanId, entry, sensor?.celsius, snapshot.timestamp)
      if (!sensor && entry.celsius !== undefined) { entry.celsius = undefined; changed = true }
      if (entry.celsius !== previousCelsius) changed = true
      if (target === null) continue
      entry.appliedRpm = target
      entry.lastChangeAt = snapshot.timestamp
      changed = true
      void enqueue(async () => {
        if (!rules.has(fanId)) return
        await control.setFan(fanId, { mode: 'fixed', rpm: target })
      })
    }
    if (changed) emit()
  }

  async function setRule(fanId: string, rule: FanSensorRule): Promise<FanControlState> {
    const state = control.getState()
    if (state.helper !== 'ready') throw new Error('Fan control is not connected.')
    const fan = state.fans.find((candidate) => candidate.id === fanId)
    if (!fan) throw new Error(`No fan ${fanId}.`)
    const previous = rules.get(fanId)
    const entry: RuleState = { rule: { ...rule }, celsius: previous?.celsius, smoothed: previous?.smoothed, lastReadingAt: previous?.lastReadingAt }
    rules.set(fanId, entry)
    console.info(`[Thermal] fan rule set: ${fanId} follows ${rule.sensorId} (${rule.minCelsius}–${rule.maxCelsius} °C)`)
    syncBackground()
    // Apply once right away from the last known reading so the fan does not wait for the next poll.
    // Re-tuning applies from the known reading at once; the first apply is never rate-limited.
    const target = entry.celsius !== undefined ? targetForTemperature(entry.smoothed ?? entry.celsius, entry.rule, fanRangeOf(fanId)) : null
    if (target !== null) {
      entry.appliedRpm = target
      entry.lastChangeAt = Date.now()
      await enqueue(() => control.setFan(fanId, { mode: 'fixed', rpm: target }))
    }
    emit()
    return merged()
  }

  return {
    getState: () => merged(),
    rules: () => new Map([...rules].map(([id, entry]) => [id, { ...entry.rule }])),
    ingestControlState: (state) => {
      controlState = state
      if (state.helper !== 'ready') clearRules()
      emit()
    },
    enable: async () => {
      controlState = await control.enable()
      emit()
      return merged()
    },
    setFan: async (fanId, command: FanCommand) => {
      if (command.mode === 'sensor') {
        const { mode: _mode, ...rule } = command
        return setRule(fanId, rule)
      }
      if (rules.delete(fanId)) syncBackground()
      controlState = await control.setFan(fanId, command)
      emit()
      return merged()
    },
    restoreAll: async () => {
      clearRules()
      controlState = await control.restoreAll()
      emit()
      return merged()
    },
    disable: async () => {
      clearRules()
      controlState = await control.disable()
      emit()
      return merged()
    },
    stop: async () => {
      clearRules()
      await control.stop()
      controlState = control.getState()
      emit()
    },
  }
}

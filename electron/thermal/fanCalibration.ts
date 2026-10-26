/**
 * Fan ↔ sensor calibration: which sensors each fan actually cools on this machine.
 *
 * Nothing in the SMC says which fan sits next to which sensor, so the app measures it.
 * With every fan on automatic it first lets the machine settle, then for each fan:
 * records a baseline, runs that fan at its maximum for a while, and records a second
 * baseline once things have settled again. The cooling a fan caused is the spin
 * reading against the average of the two baselines, which cancels the slow drift a
 * laptop always has (A–B–A). Because one fan at full speed cools the whole chassis a
 * little, a sensor is *owned* by a fan only when that fan cooled it clearly more than
 * the others (contrast); sensors every fan cools alike stay shared. Only ever speeds
 * fans up, never slows them; cancel or any failure returns every fan to automatic.
 *
 * Pure apart from the injected control service, snapshots and timers.
 */
import type { FanAffinity, FanAffinityResult, FanCalibrationPhase, FanCalibrationState, ThermalSnapshot } from '../../shared/thermalApi'
import type { FanControlService } from './fanControlTypes'

export interface FanCalibrationTimings {
  /** With every fan automatic, before the first baseline: lets whatever ran before (a profile, a rule) fade out. */
  preSettleMs: number
  /** Readings averaged before a fan is spun up. */
  baselineMs: number
  /** How long the fan runs at full speed; the last `windowMs` of it are averaged. */
  spinMs: number
  windowMs: number
  /** Pause with every fan automatic after a spin; its last `windowMs` form the second baseline. */
  settleMs: number
}

export const DEFAULT_CALIBRATION_TIMINGS: FanCalibrationTimings = { preSettleMs: 45_000, baselineMs: 12_000, spinMs: 40_000, windowMs: 12_000, settleMs: 30_000 }

/** A sensor must cool at least this much to count as affected by a fan. */
export const AFFINITY_MIN_COOLING_CELSIUS = 0.5
/** A fan owns a sensor when it cooled it this much more than any other fan … */
export const AFFINITY_MIN_CONTRAST_CELSIUS = 0.4
/** … or when it accounts for this share of the sensor's total cooling. */
export const AFFINITY_MIN_SHARE = 0.6
export const AFFINITY_MAX_SENSORS = 12

export interface FanCalibrationDeps {
  control: FanControlService
  subscribeSnapshots: (listener: (snapshot: ThermalSnapshot) => void) => () => void
  /** Keep the reader going while the window is hidden for the duration. */
  setBackgroundReads: (active: boolean) => void
  /** Persist the result (and clear it). */
  saveResult: (result: FanAffinityResult | null) => void
  loadResult: () => FanAffinityResult | null
  onState?: (state: FanCalibrationState) => void
  /** After every run (done, cancelled or failed) once the fans are back to automatic. */
  onFinished?: () => void
  timings?: Partial<FanCalibrationTimings>
  now?: () => number
  setTimeoutFn?: typeof setTimeout
  clearTimeoutFn?: typeof clearTimeout
  log?: Pick<Console, 'warn' | 'error'>
}

export interface FanCalibrationService {
  getState: () => FanCalibrationState
  /** Begin; rejects when the helper is not ready, when no fan exists, or while already running. */
  start: () => Promise<FanCalibrationState>
  cancel: () => Promise<FanCalibrationState>
  /** Sensors a fan owns (`affinity:fanN`), or null when not calibrated. */
  affinitySensors: (fanKey: string) => string[] | null
  clear: () => FanCalibrationState
}

/** Average each sensor over the readings taken in a window. */
function averageReadings(samples: readonly ThermalSnapshot[]): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>()
  for (const snapshot of samples) {
    for (const sensor of snapshot.sensors) {
      const entry = sums.get(sensor.id) ?? { total: 0, count: 0 }
      entry.total += sensor.celsius
      entry.count += 1
      sums.set(sensor.id, entry)
    }
  }
  return new Map([...sums].map(([id, { total, count }]) => [id, total / count]))
}

/** Cooling per sensor for one fan: the mean of the two baselines minus the spin reading (A–B–A). */
export function coolingDeltas(before: ReadonlyMap<string, number>, during: ReadonlyMap<string, number>, after: ReadonlyMap<string, number> | null): Map<string, number> {
  const deltas = new Map<string, number>()
  for (const [sensorId, b] of before) {
    const d = during.get(sensorId)
    if (d === undefined) continue
    const a = after?.get(sensorId)
    const baseline = a === undefined ? b : (b + a) / 2
    deltas.set(sensorId, baseline - d)
  }
  return deltas
}

/** Turn per-fan cooling deltas into affinities with share and contrast, strongest sensors first. */
export function buildAffinities(deltas: ReadonlyMap<string, ReadonlyMap<string, number>>, minCooling = AFFINITY_MIN_COOLING_CELSIUS): FanAffinity[] {
  const totalPerSensor = new Map<string, number>()
  for (const perSensor of deltas.values()) {
    for (const [sensorId, cooling] of perSensor) {
      if (cooling >= minCooling) totalPerSensor.set(sensorId, (totalPerSensor.get(sensorId) ?? 0) + cooling)
    }
  }
  const round = (value: number) => Math.round(value * 100) / 100
  return [...deltas].map(([fanId, perSensor]) => ({
    fanId,
    sensors: [...perSensor]
      .filter(([, cooling]) => cooling >= minCooling)
      .map(([sensorId, cooling]) => {
        let bestOther = Number.NEGATIVE_INFINITY
        for (const [otherFan, other] of deltas) {
          if (otherFan === fanId) continue
          bestOther = Math.max(bestOther, other.get(sensorId) ?? 0)
        }
        const contrast = Number.isFinite(bestOther) ? cooling - Math.max(0, bestOther) : cooling
        return { sensorId, cooling: Math.round(cooling * 10) / 10, share: round(cooling / (totalPerSensor.get(sensorId) ?? cooling)), contrast: Math.round(contrast * 10) / 10 }
      })
      .sort((a, b) => (b.contrast ?? 0) - (a.contrast ?? 0) || b.cooling - a.cooling),
  }))
}

/** The sensors a fan owns for the `affinity:` source; the strongest-cooled ones when it owns none outright. */
export function affinitySensorIds(affinity: FanAffinity | undefined): string[] | null {
  if (!affinity || affinity.sensors.length === 0) return null
  const owned = affinity.sensors.filter((sensor) => (sensor.contrast ?? 0) >= AFFINITY_MIN_CONTRAST_CELSIUS || sensor.share >= AFFINITY_MIN_SHARE).slice(0, AFFINITY_MAX_SENSORS)
  if (owned.length > 0) return owned.map((sensor) => sensor.sensorId)
  return [...affinity.sensors].sort((a, b) => b.cooling - a.cooling).slice(0, AFFINITY_MAX_SENSORS).map((sensor) => sensor.sensorId)
}

export function createFanCalibration(deps: FanCalibrationDeps): FanCalibrationService {
  const { control, subscribeSnapshots, setBackgroundReads, saveResult, loadResult, onState, onFinished, now = Date.now, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout, log = console } = deps
  const timings = { ...DEFAULT_CALIBRATION_TIMINGS, ...deps.timings }
  let state: FanCalibrationState = { status: 'idle', result: loadResult() ?? undefined }
  let running = false
  let cancelled = false
  let unsubscribe: (() => void) | null = null
  let samples: ThermalSnapshot[] = []
  let pendingTimer: ReturnType<typeof setTimeout> | null = null
  let wake: (() => void) | null = null

  function emit(next: FanCalibrationState) {
    state = next
    onState?.(state)
  }

  /** Wait `ms`, ticking `secondsLeft` once a second; resolves early on cancel. */
  function wait(ms: number, tick: (secondsLeft: number) => void): Promise<void> {
    return new Promise((resolve) => {
      const end = now() + ms
      const step = () => {
        const left = Math.max(0, end - now())
        tick(Math.ceil(left / 1000))
        if (left <= 0 || cancelled) { pendingTimer = null; wake = null; resolve(); return }
        pendingTimer = setTimeoutFn(step, Math.min(1000, left))
      }
      wake = () => { if (pendingTimer) { clearTimeoutFn(pendingTimer); pendingTimer = null } wake = null; resolve() }
      step()
    })
  }

  const perFanMs = timings.baselineMs + timings.spinMs + timings.settleMs
  const totalMs = (fanCount: number) => timings.preSettleMs + perFanMs * fanCount

  function phaseState(fanIndex: number, fanCount: number, fanId: string, phase: FanCalibrationPhase, secondsLeft: number): FanCalibrationState {
    const phaseEnd = phase === 'baseline' ? timings.baselineMs : phase === 'spin' ? timings.baselineMs + timings.spinMs : perFanMs
    const done = timings.preSettleMs + fanIndex * perFanMs + phaseEnd - secondsLeft * 1000
    return { status: 'running', fanIndex, fanCount, fanId, phase, secondsLeft, progress: Math.max(0, Math.min(1, done / totalMs(fanCount))), result: state.result }
  }

  function windowAverage(fromTimestamp: number): Map<string, number> {
    return averageReadings(samples.filter((snapshot) => snapshot.timestamp >= fromTimestamp))
  }

  async function run(): Promise<void> {
    const fans = control.getState().fans
    const deltas = new Map<string, Map<string, number>>()
    unsubscribe = subscribeSnapshots((snapshot) => { samples.push(snapshot) })
    setBackgroundReads(true)
    try {
      await control.restoreAll()
      // Everything automatic first, so a profile or rule that ran a moment ago does not leak into the first baseline.
      await wait(timings.preSettleMs, (left) => emit({ status: 'running', fanIndex: 0, fanCount: fans.length, fanId: fans[0]?.id, phase: 'settle', secondsLeft: left, progress: Math.max(0, (timings.preSettleMs - left * 1000) / totalMs(fans.length)), result: state.result }))
      let after: Map<string, number> | null = null
      for (let i = 0; i < fans.length && !cancelled; i++) {
        const fan = fans[i]
        samples = []
        await wait(timings.baselineMs, (left) => emit(phaseState(i, fans.length, fan.id, 'baseline', left)))
        if (cancelled) break
        const before = averageReadings(samples)
        await control.setFan(fan.id, { mode: 'fixed', rpm: fan.maxRpm })
        samples = []
        const spinWindow = now() + timings.spinMs - timings.windowMs
        await wait(timings.spinMs, (left) => emit(phaseState(i, fans.length, fan.id, 'spin', left)))
        const during = windowAverage(spinWindow)
        await control.setFan(fan.id, { mode: 'auto' })
        if (cancelled) break
        samples = []
        const settleWindow = now() + timings.settleMs - timings.windowMs
        await wait(timings.settleMs, (left) => emit(phaseState(i, fans.length, fan.id, 'settle', left)))
        if (cancelled) break
        after = windowAverage(settleWindow)
        deltas.set(fan.id, coolingDeltas(before, during, after))
      }
      if (cancelled) {
        emit({ status: 'cancelled', result: state.result })
        return
      }
      const result: FanAffinityResult = { calibratedAt: now(), model: samples[samples.length - 1]?.model ?? samples[0]?.model, fans: buildAffinities(deltas) }
      saveResult(result)
      emit({ status: 'done', result })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      log.error('[Thermal] fan calibration failed:', message)
      emit({ status: 'error', error: message, result: state.result })
    } finally {
      unsubscribe?.()
      unsubscribe = null
      samples = []
      setBackgroundReads(false)
      try { await control.restoreAll() } catch (e) { log.warn('[Thermal] restore after calibration failed:', e instanceof Error ? e.message : e) }
      running = false
      onFinished?.()
    }
  }

  return {
    getState: () => state,
    start: async () => {
      if (running) throw new Error('Calibration is already running.')
      const current = control.getState()
      if (current.helper !== 'ready') throw new Error('Fan control is not connected.')
      if (current.fans.length === 0) throw new Error('This machine reports no fans.')
      running = true
      cancelled = false
      emit({ status: 'running', fanIndex: 0, fanCount: current.fans.length, fanId: current.fans[0].id, phase: 'settle', secondsLeft: Math.ceil(timings.preSettleMs / 1000), progress: 0, result: state.result })
      void run()
      return state
    },
    cancel: async () => {
      if (!running) return state
      cancelled = true
      wake?.()
      // `run` finishes its cleanup on its own; report the intent right away.
      return { ...state, status: 'cancelled' }
    },
    affinitySensors: (fanKey) => affinitySensorIds(state.result?.fans.find((fan) => fan.fanId === `smc:${fanKey}` || fan.fanId === fanKey)),
    clear: () => {
      saveResult(null)
      emit({ status: 'idle', result: undefined })
      return state
    },
  }
}

/**
 * Thermal service — one reader per platform, a poll loop while someone is listening,
 * and CPU load attached to each snapshot. Pure apart from the reader so the poll/pause
 * rules are unit-tested with fake timers.
 *
 * Two consumers can keep the loop alive:
 *   • the renderer (`setMonitoring`) while the Thermal page is open; reads are skipped
 *     while `isPaused()` reports the main window hidden or minimized;
 *   • a background consumer (`setBackgroundMonitoring`) — the menu bar / tray reading —
 *     which keeps reading while the window is hidden, at the slower background interval.
 * With neither, nothing runs and the reader is released. Turning the module off calls `stop()`.
 */
import type { ThermalSnapshot, ThermalSupport } from '../../shared/thermalApi'
import type { ThermalReader } from './reader'

export interface ThermalServiceOptions {
  reader: ThermalReader
  /** Attach the CPU load since the previous call; undefined when there is no baseline. */
  sampleCpuLoad?: () => number | undefined
  /** Cadence while the renderer is watching and the window is visible. */
  intervalMs?: number
  /** Cadence while only the background consumer needs readings. */
  backgroundIntervalMs?: number
  /** True while renderer snapshots would go unseen (window hidden/minimized). */
  isPaused?: () => boolean
  onSnapshot?: (snapshot: ThermalSnapshot) => void
  onError?: (error: { message: string }) => void
  setTimeoutFn?: typeof setTimeout
  clearTimeoutFn?: typeof clearTimeout
  log?: Pick<Console, 'warn' | 'error'>
}

export interface ThermalService {
  getSupport: () => ThermalSupport
  read: () => Promise<ThermalSnapshot>
  /** The renderer's interest (Thermal page open). */
  setMonitoring: (active: boolean) => void
  /** A consumer that needs readings even while the window is hidden (menu bar / tray). */
  setBackgroundMonitoring: (active: boolean) => void
  /** True while any consumer keeps the loop running. */
  isMonitoring: () => boolean
  /** Receive every snapshot the loop produces, in addition to `onSnapshot`. */
  subscribe: (listener: (snapshot: ThermalSnapshot) => void) => () => void
  /** Stop polling, drop both consumers and release the reader. Idempotent. */
  stop: () => void
}

export function createThermalService({
  reader,
  sampleCpuLoad,
  intervalMs = 2000,
  backgroundIntervalMs = 5000,
  isPaused = () => false,
  onSnapshot,
  onError,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  log = console,
}: ThermalServiceOptions): ThermalService {
  let timer: ReturnType<typeof setTimeout> | null = null
  let reading = false
  let supportCache: ThermalSupport | null = null
  let renderer = false
  let background = false
  const listeners = new Set<(snapshot: ThermalSnapshot) => void>()

  function getSupport(): ThermalSupport {
    if (!supportCache) supportCache = reader.probe()
    return supportCache
  }

  async function read(): Promise<ThermalSnapshot> {
    const support = getSupport()
    if (!support.supported) throw new Error(support.reason === 'reader-missing' ? 'The sensor reader is missing.' : 'Thermal sensors are not supported on this platform.')
    const snapshot = await reader.read()
    const cpuLoadPercent = sampleCpuLoad?.()
    return cpuLoadPercent === undefined ? snapshot : { ...snapshot, cpuLoadPercent }
  }

  const running = () => renderer || background
  /** The renderer wants fresh readings right now; otherwise only the background consumer does. */
  const foreground = () => renderer && !isPaused()
  /** Slow down only when the background consumer is the sole reason to read. */
  const currentInterval = () => (background && !foreground() ? backgroundIntervalMs : intervalMs)

  function schedule(delay: number) {
    if (timer) clearTimeoutFn(timer)
    timer = setTimeoutFn(() => { timer = null; void tick() }, delay)
  }

  async function tick() {
    if (!running()) return
    schedule(currentInterval())
    if (reading || (!background && !foreground())) return
    reading = true
    try {
      const snapshot = await read()
      if (running()) {
        onSnapshot?.(snapshot)
        for (const listener of listeners) listener(snapshot)
      }
    } catch (e) {
      // The last consumer leaving mid-read makes the reader reject; that is not an error worth reporting.
      if (!running()) return
      const message = e instanceof Error ? e.message : String(e)
      log.warn('[Thermal] read failed:', message)
      onError?.({ message })
    } finally {
      reading = false
    }
  }

  function reconcile(joined: boolean) {
    if (!running()) {
      if (timer) { clearTimeoutFn(timer); timer = null }
      reader.dispose?.()
      return
    }
    // A consumer joining (or the renderer coming back) wants a reading now, not at the next slow tick.
    if (joined) schedule(0)
  }

  return {
    getSupport,
    read,
    isMonitoring: () => running(),
    setMonitoring: (active) => {
      if (renderer === active) return
      renderer = active
      reconcile(active)
    },
    setBackgroundMonitoring: (active) => {
      if (background === active) return
      background = active
      reconcile(active)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    stop: () => {
      renderer = false
      background = false
      reconcile(false)
    },
  }
}

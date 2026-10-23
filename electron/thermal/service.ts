/**
 * Thermal service — one reader per platform, a poll loop while the renderer is
 * monitoring, and CPU load attached to each snapshot. Pure apart from the reader so
 * the poll/pause rules are unit-tested with fake timers.
 *
 * Polling stops when the renderer asks (page left, window hidden) and skips reads
 * while `isPaused()` reports the main window hidden or minimized, so a background
 * app costs nothing. Turning the module off calls `stop()`.
 */
import type { ThermalSnapshot, ThermalSupport } from '../../shared/thermalApi'
import type { ThermalReader } from './reader'

export interface ThermalServiceOptions {
  reader: ThermalReader
  /** Attach the CPU load since the previous call; undefined when there is no baseline. */
  sampleCpuLoad?: () => number | undefined
  intervalMs?: number
  /** True while snapshots would go unseen (window hidden/minimized). */
  isPaused?: () => boolean
  onSnapshot?: (snapshot: ThermalSnapshot) => void
  onError?: (error: { message: string }) => void
  setIntervalFn?: typeof setInterval
  clearIntervalFn?: typeof clearInterval
  log?: Pick<Console, 'warn' | 'error'>
}

export interface ThermalService {
  getSupport: () => ThermalSupport
  read: () => Promise<ThermalSnapshot>
  setMonitoring: (active: boolean) => void
  isMonitoring: () => boolean
  /** Stop polling and release the reader. Idempotent. */
  stop: () => void
}

export function createThermalService({
  reader,
  sampleCpuLoad,
  intervalMs = 2000,
  isPaused = () => false,
  onSnapshot,
  onError,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  log = console,
}: ThermalServiceOptions): ThermalService {
  let timer: ReturnType<typeof setInterval> | null = null
  let reading = false
  let supportCache: ThermalSupport | null = null

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

  async function tick() {
    if (reading || isPaused()) return
    reading = true
    try {
      const snapshot = await read()
      if (timer) onSnapshot?.(snapshot)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      log.warn('[Thermal] read failed:', message)
      onError?.({ message })
    } finally {
      reading = false
    }
  }

  function stopPolling() {
    if (timer) { clearIntervalFn(timer); timer = null }
  }

  return {
    getSupport,
    read,
    isMonitoring: () => timer !== null,
    setMonitoring: (active) => {
      if (!active) {
        stopPolling()
        reader.dispose?.()
        return
      }
      if (timer) return
      timer = setIntervalFn(() => { void tick() }, intervalMs)
      void tick()
    },
    stop: () => {
      stopPolling()
      reader.dispose?.()
    },
  }
}

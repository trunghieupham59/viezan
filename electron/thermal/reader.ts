/**
 * A platform reader produces snapshots. `probe` is synchronous and cheap (platform and
 * file checks) so the module host can decide a default without touching hardware.
 */
import type { ThermalSnapshot, ThermalSupport } from '../../shared/thermalApi'

export interface ThermalReader {
  probe: () => ThermalSupport
  /** One snapshot. Rejects when the source cannot be read. */
  read: () => Promise<ThermalSnapshot>
  /** Release any long-lived process or handle; the next `read` reopens it. */
  dispose?: () => void
}

export function unsupportedReader(detail?: string): ThermalReader {
  return {
    probe: () => ({ supported: false, reason: 'unsupported-platform', ...(detail ? { detail } : {}) }),
    read: () => Promise.reject(new Error('Thermal sensors are not supported on this platform.')),
  }
}

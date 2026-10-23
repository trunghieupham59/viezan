/**
 * Whole-machine CPU load from `os.cpus()` deltas: cheap, cross-platform, no privileges.
 * The first sample has no baseline and returns undefined.
 */
import * as os from 'node:os'

export interface CpuTimes { idle: number; total: number }

export function sumCpuTimes(cpus: os.CpuInfo[]): CpuTimes {
  let idle = 0
  let total = 0
  for (const cpu of cpus) {
    const times = cpu.times
    idle += times.idle
    total += times.user + times.nice + times.sys + times.idle + times.irq
  }
  return { idle, total }
}

export function loadBetween(previous: CpuTimes, current: CpuTimes): number | undefined {
  const total = current.total - previous.total
  if (total <= 0) return undefined
  const busy = total - (current.idle - previous.idle)
  return Math.round(Math.min(100, Math.max(0, (busy / total) * 100)))
}

export function createCpuLoadSampler(readCpus: () => os.CpuInfo[] = os.cpus) {
  let previous: CpuTimes | null = null
  return {
    sample(): number | undefined {
      const current = sumCpuTimes(readCpus())
      const load = previous ? loadBetween(previous, current) : undefined
      previous = current
      return load
    },
    reset() { previous = null },
  }
}

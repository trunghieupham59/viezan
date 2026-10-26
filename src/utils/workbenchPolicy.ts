import type { WorkbenchFeature } from '../types/workbench'

export const WORKBENCH_IDLE_MS: Record<WorkbenchFeature, number> = {
  translate: 2 * 60 * 60 * 1000,
  dictionary: 30 * 60 * 1000,
}

export function shouldStartFresh({ enabled, busy, complete, awayAt, completedAt, now, feature }: {
  enabled: boolean
  busy: boolean
  complete: boolean
  awayAt: number | null
  completedAt: number | null
  now: number
  feature: WorkbenchFeature
}): boolean {
  if (!enabled || busy || !complete || awayAt === null || completedAt === null) return false
  const since = Math.max(awayAt, completedAt)
  return Number.isFinite(since) && now >= since && now - since >= WORKBENCH_IDLE_MS[feature]
}

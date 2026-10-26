import { describe, expect, it } from 'vitest'
import { shouldStartFresh, WORKBENCH_IDLE_MS } from '../workbenchPolicy'

describe('workbench return policy', () => {
  const base = { feature: 'dictionary' as const, enabled: true, busy: false, complete: true, awayAt: 1000, completedAt: 500, now: 1000 + WORKBENCH_IDLE_MS.dictionary }
  it('expires only on or after the feature threshold', () => {
    expect(shouldStartFresh({ ...base, now: base.now - 1 })).toBe(false)
    expect(shouldStartFresh(base)).toBe(true)
    expect(shouldStartFresh({ ...base, feature: 'translate' })).toBe(false)
    expect(shouldStartFresh({ ...base, feature: 'translate', now: 1000 + WORKBENCH_IDLE_MS.translate })).toBe(true)
  })
  it('protects drafts, running jobs and a screen being read without leaving', () => {
    for (const patch of [{ complete: false }, { busy: true }, { enabled: false }, { awayAt: null }, { completedAt: null }]) {
      expect(shouldStartFresh({ ...base, ...patch })).toBe(false)
    }
  })
  it('waits from completion if the result arrived while away', () => {
    expect(shouldStartFresh({ ...base, completedAt: base.now - 1 })).toBe(false)
  })
  it('ignores day boundaries and fails safe if the clock moves backwards', () => {
    const beforeMidnight = Date.UTC(2026, 9, 26, 23, 59)
    expect(shouldStartFresh({ ...base, awayAt: beforeMidnight, now: beforeMidnight + 120000 })).toBe(false)
    expect(shouldStartFresh({ ...base, now: 0 })).toBe(false)
  })
})

// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startUpdateSchedule, UPDATE_CHECK_INTERVAL, UPDATE_STARTUP_DELAY } from '../updateSchedule'

afterEach(() => vi.useRealTimers())

describe('background update schedule', () => {
  it('checks after 30 seconds and repeats every 24 hours; never downloads or installs', async () => {
    vi.useFakeTimers()
    const check = vi.fn().mockResolvedValue({ success: true })
    const stop = startUpdateSchedule(check)
    await vi.advanceTimersByTimeAsync(UPDATE_STARTUP_DELAY - 1)
    expect(check).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL - 1)
    expect(check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(check).toHaveBeenCalledTimes(2)
    stop()
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL * 2)
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('cancels before startup and continues after a network failure', async () => {
    vi.useFakeTimers()
    const check = vi.fn().mockRejectedValue(new Error('offline'))
    const stopEarly = startUpdateSchedule(check)
    stopEarly()
    await vi.advanceTimersByTimeAsync(UPDATE_STARTUP_DELAY)
    expect(check).not.toHaveBeenCalled()
    const stop = startUpdateSchedule(check)
    await vi.advanceTimersByTimeAsync(UPDATE_STARTUP_DELAY + UPDATE_CHECK_INTERVAL)
    expect(check).toHaveBeenCalledTimes(2)
    stop()
  })
})

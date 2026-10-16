// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startUpdateSchedule, UPDATE_CHECK_INTERVAL, UPDATE_RETRY_DELAYS, UPDATE_STARTUP_DELAY } from '../updateSchedule'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

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

  it('cancels before startup', async () => {
    const check = vi.fn().mockResolvedValue({ success: true })
    const stopEarly = startUpdateSchedule(check)
    stopEarly()
    await vi.advanceTimersByTimeAsync(UPDATE_STARTUP_DELAY)
    expect(check).not.toHaveBeenCalled()
  })

  it.each(['resolved', 'rejected'])('retries a %s failure and stops retrying after recovery', async (mode) => {
    const check = vi.fn().mockResolvedValue({ success: true })
    if (mode === 'resolved') check.mockResolvedValueOnce({ success: false })
    else check.mockRejectedValueOnce(new Error('offline https://secret.invalid/?token=private'))
    const stop = startUpdateSchedule(check)
    await vi.advanceTimersByTimeAsync(UPDATE_STARTUP_DELAY)
    expect(check).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledWith('[updater] Background check failed', {
      attempt: 1, retryInMs: UPDATE_RETRY_DELAYS[0], exhausted: false,
    })
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('private')
    await vi.advanceTimersByTimeAsync(UPDATE_RETRY_DELAYS[0] - 1)
    expect(check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(check).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(UPDATE_RETRY_DELAYS[2])
    expect(check).toHaveBeenCalledTimes(2)
    stop()
  })

  it('bounds retries and resets the budget at the next daily check', async () => {
    const check = vi.fn().mockResolvedValue({ success: false })
    const stop = startUpdateSchedule(check)
    await vi.advanceTimersByTimeAsync(UPDATE_STARTUP_DELAY)
    for (const [index, delay] of UPDATE_RETRY_DELAYS.entries()) {
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(check).toHaveBeenCalledTimes(index + 1)
      await vi.advanceTimersByTimeAsync(1)
      expect(check).toHaveBeenCalledTimes(index + 2)
    }
    expect(console.warn).toHaveBeenLastCalledWith('[updater] Background check failed', {
      attempt: 4, retryInMs: null, exhausted: true,
    })
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL - UPDATE_RETRY_DELAYS.reduce((sum, delay) => sum + delay, 0))
    expect(check).toHaveBeenCalledTimes(5)
    await vi.advanceTimersByTimeAsync(UPDATE_RETRY_DELAYS[0])
    expect(check).toHaveBeenCalledTimes(6)
    stop()
  })

  it('cancels a pending retry on shutdown', async () => {
    const check = vi.fn().mockResolvedValue({ success: false })
    const stop = startUpdateSchedule(check)
    await vi.advanceTimersByTimeAsync(UPDATE_STARTUP_DELAY)
    stop()
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL * 2)
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('never overlaps checks or schedules retries after shutdown during a check', async () => {
    let resolve!: (result: { success: boolean }) => void
    const check = vi.fn(() => new Promise<{ success: boolean }>((done) => { resolve = done }))
    const stop = startUpdateSchedule(check)
    await vi.advanceTimersByTimeAsync(UPDATE_STARTUP_DELAY + UPDATE_CHECK_INTERVAL)
    expect(check).toHaveBeenCalledTimes(1)
    stop()
    resolve({ success: false })
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL * 2)
    expect(check).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})

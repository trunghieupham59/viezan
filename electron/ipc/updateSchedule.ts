export const UPDATE_STARTUP_DELAY = 30_000
export const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1_000
export const UPDATE_RETRY_DELAYS = [60_000, 5 * 60_000, 15 * 60_000] as const

/** Main-process timers keep running when the renderer is hidden in the tray. */
export function startUpdateSchedule(check: () => Promise<{ success: boolean }>) {
  let stopped = false
  let running = false
  let retry: ReturnType<typeof setTimeout> | undefined
  // Only fixed diagnostic fields: upstream error text can contain signed URLs.
  const run = async (attempt = 0) => {
    if (stopped || running) return
    clearTimeout(retry)
    running = true
    console.info('[updater] Background check started', { attempt: attempt + 1 })
    let success = false
    try { success = (await check()).success } catch { /* Retry rejected network checks too. */ }
    finally { running = false }
    if (stopped) return
    if (success) {
      console.info('[updater] Background check succeeded', { attempt: attempt + 1 })
      return
    }
    const delay = UPDATE_RETRY_DELAYS[attempt]
    console.warn('[updater] Background check failed', {
      attempt: attempt + 1,
      retryInMs: delay ?? null,
      exhausted: delay === undefined,
    })
    if (delay !== undefined) {
      retry = setTimeout(() => { void run(attempt + 1) }, delay)
      retry.unref?.()
    }
  }
  let interval: ReturnType<typeof setInterval> | undefined
  const startup = setTimeout(() => {
    void run()
    interval = setInterval(() => { void run() }, UPDATE_CHECK_INTERVAL)
    interval.unref?.()
  }, UPDATE_STARTUP_DELAY)
  startup.unref?.()
  return () => {
    stopped = true
    clearTimeout(startup)
    clearInterval(interval)
    clearTimeout(retry)
  }
}

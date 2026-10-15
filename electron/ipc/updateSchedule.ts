export const UPDATE_STARTUP_DELAY = 30_000
export const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1_000

/** Main-process timers keep running when the renderer is hidden in the tray. */
export function startUpdateSchedule(check: () => Promise<unknown>) {
  const run = () => { void check().catch(() => undefined) }
  let interval: ReturnType<typeof setInterval> | undefined
  const startup = setTimeout(() => {
    run()
    interval = setInterval(run, UPDATE_CHECK_INTERVAL)
    interval.unref?.()
  }, UPDATE_STARTUP_DELAY)
  startup.unref?.()
  return () => {
    clearTimeout(startup)
    clearInterval(interval)
  }
}

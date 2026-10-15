/**
 * Quit request — lets the Windows installer/uninstaller ask a running Viezan to
 * exit by itself before it falls back to killing the process.
 *
 * The app lives in the tray and ignores window-close, so a plain `taskkill`
 * never ends it gracefully and the forced kill that follows skips the normal
 * `will-quit` cleanup (global shortcuts, local servers, child processes).
 * Launching `Viezan.exe --quit` reaches the running instance through the
 * single-instance lock as a `second-instance` event carrying this flag.
 */
export const QUIT_FLAG = '--quit'

export function isQuitRequest(argv: readonly string[]): boolean {
  return argv.includes(QUIT_FLAG)
}

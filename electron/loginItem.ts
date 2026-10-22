/**
 * Launch at login — lets the OS start Viezan when the user signs in.
 *
 * Windows registers `Viezan.exe --hidden` under the user's Run key, so the app
 * comes up resident in the tray without opening its window. macOS registers a
 * plain login item (the OS launches the bundle normally; there is no tray on
 * macOS, so the window opens as usual). Linux is not supported by Electron's
 * login-item API. Pure module (no Electron import) so it is trivially testable.
 */
export const HIDDEN_START_FLAG = '--hidden'

/** Whether this launch asked to stay in the tray instead of opening the window. */
export function isHiddenStartRequest(argv: readonly string[]): boolean {
  return argv.includes(HIDDEN_START_FLAG)
}

/** Only the packaged app has a stable executable path the OS can register. */
export function supportsLoginItem(platform: NodeJS.Platform, isPackaged: boolean): boolean {
  return isPackaged && (platform === 'win32' || platform === 'darwin')
}

/** Command-line arguments the login item launches the app with. */
export function loginItemArgs(platform: NodeJS.Platform): string[] {
  return platform === 'win32' ? [HIDDEN_START_FLAG] : []
}

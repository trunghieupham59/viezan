/**
 * Runtime profile — separates the official (packaged) Viezan from a development
 * run on the same machine so they never fight over shared resources:
 *
 *   • userData directory (settings, API keys, tokens) — also the key of the
 *     single-instance lock, so a resident release build must not block `npm run dev`
 *   • local server port (Chrome extension bridge)
 *   • tray residency (a dev run should quit when its window closes)
 *
 * The packaged build keeps the historic defaults untouched so existing users keep
 * their data and the Chrome extension keeps working. `app.isPackaged` is the only
 * switch: environment variables are honoured in development runs only, so a
 * user-controlled variable can never reconfigure the shipped app.
 *
 * Pure module (no Electron import) so it is trivially testable.
 */

export type RuntimeChannel = 'release' | 'dev'

/** Port the Chrome extension and legacy assistant are built against. */
export const RELEASE_LOCAL_SERVER_PORT = 39875
export const DEV_LOCAL_SERVER_PORT = 39876

const DEV_USER_DATA_DIR_NAME = 'viezan-dev'
const MIN_PORT = 1024
const MAX_PORT = 65535

export interface RuntimeProfile {
  channel: RuntimeChannel
  isDev: boolean
  /** Name Electron reports to the OS (`app.setName`). */
  appName: string
  /** Title for windows and tray tooltip, so a dev run is visibly not the product. */
  windowTitle: string
  /** Folder under `appData` to use as `userData`; null keeps Electron's default. */
  userDataDirName: string | null
  localServerPort: number
  /** Whether closing the main window may keep the app resident in the system tray. */
  trayEnabled: boolean
}

function parsePort(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null
  const port = Number(value)
  return port >= MIN_PORT && port <= MAX_PORT ? port : null
}

export function resolveRuntimeProfile(isPackaged: boolean, env: NodeJS.ProcessEnv = {}): RuntimeProfile {
  if (isPackaged) {
    return {
      channel: 'release',
      isDev: false,
      appName: 'Viezan',
      windowTitle: 'Viezan',
      userDataDirName: null,
      localServerPort: RELEASE_LOCAL_SERVER_PORT,
      trayEnabled: true,
    }
  }

  return {
    channel: 'dev',
    isDev: true,
    appName: 'Viezan Dev',
    windowTitle: 'Viezan (Dev)',
    userDataDirName: DEV_USER_DATA_DIR_NAME,
    localServerPort: parsePort(env.VIEZAN_LOCAL_PORT) ?? DEV_LOCAL_SERVER_PORT,
    trayEnabled: env.VIEZAN_DEV_TRAY === '1',
  }
}

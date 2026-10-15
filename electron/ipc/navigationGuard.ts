import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isAllowedExternalUrl } from './externalUrl'

export const DEV_SERVER_ORIGIN = 'http://localhost:5173'

/**
 * Permissions the renderer verifiably uses:
 * - `media`: microphone capture (dictation, live translate); also device enumeration
 * - `display-capture`: getDisplayMedia for system-audio capture
 * - `clipboard-sanitized-write`: navigator.clipboard.writeText / write
 * Everything else (notifications, geolocation, clipboard-read, midi, ...) is denied.
 */
const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set([
  'media',
  'display-capture',
  'clipboard-sanitized-write',
])

export interface NavigationPolicy {
  isDev: boolean
  /** Absolute path of the packaged renderer build output (`dist`). */
  distDir: string
}

function isInsideDirectory(candidate: string, directory: string): boolean {
  const normalizedDir = path.resolve(directory)
  const normalizedCandidate = path.resolve(candidate)
  const compare = process.platform === 'win32'
    ? (value: string) => value.toLowerCase()
    : (value: string) => value
  const dir = compare(normalizedDir)
  const target = compare(normalizedCandidate)
  return target === dir || target.startsWith(dir.endsWith(path.sep) ? dir : `${dir}${path.sep}`)
}

/**
 * True for the app's own `file://` renderer build and (in dev) the Vite dev
 * origin. Anything else, including malformed URLs, is rejected.
 */
export function isAllowedAppNavigation(rawUrl: unknown, policy: NavigationPolicy): boolean {
  if (typeof rawUrl !== 'string' || !rawUrl) return false

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }

  if (url.protocol === 'about:') return rawUrl === 'about:blank'

  if (url.protocol === 'file:') {
    try {
      return isInsideDirectory(fileURLToPath(url), policy.distDir)
    } catch {
      return false
    }
  }

  return policy.isDev && url.origin === DEV_SERVER_ORIGIN
}

export function isAllowedPermission(permission: string): boolean {
  return ALLOWED_PERMISSIONS.has(permission)
}

/**
 * Handler for `webContents.setWindowOpenHandler`. Never lets a renderer spawn a
 * child window (it would inherit the privileged preload); allowed http(s) URLs
 * are handed to the system browser instead. `openExternal` must not throw.
 */
export function createWindowOpenHandler(
  openExternal: (url: string) => Promise<void> | void,
): (details: { url: string }) => { action: 'deny' } {
  return ({ url }) => {
    let isWebUrl = false
    try {
      const protocol = new URL(url).protocol
      isWebUrl = protocol === 'http:' || protocol === 'https:'
    } catch {
      isWebUrl = false
    }
    if (isWebUrl && isAllowedExternalUrl(url)) {
      void Promise.resolve()
        .then(() => openExternal(url))
        .catch((err: unknown) => console.error('[main] openExternal failed:', err))
    }
    return { action: 'deny' }
  }
}

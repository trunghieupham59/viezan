import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron'

type AnyIpcEvent = Pick<IpcMainEvent | IpcMainInvokeEvent, 'sender'>

/**
 * True when the IPC event was sent by one of the allowed webContents.
 * Destroyed or missing webContents never match.
 */
export function isTrustedSender(
  event: AnyIpcEvent,
  allowed: ReadonlyArray<WebContents | null | undefined>,
): boolean {
  const sender = event?.sender
  if (!sender) return false
  return allowed.some((contents) => {
    if (!contents) return false
    if (typeof contents.isDestroyed === 'function' && contents.isDestroyed()) return false
    return contents === sender
  })
}

/** Convenience wrapper: sender must be the window returned by `getWindow`. */
export function isSenderWindow(
  event: AnyIpcEvent,
  getWindow: () => BrowserWindow | null | undefined,
): boolean {
  const win = getWindow()
  if (!win || win.isDestroyed()) return false
  return isTrustedSender(event, [win.webContents])
}

/**
 * Preload helpers that turn a channel name into a typed bridge function.
 *
 * A section is written as a plain object typed against its `shared/*Api.d.ts`
 * interface, e.g. `update: invoke(HOTKEY_CHANNELS.invoke.update)`. TypeScript infers
 * the argument and result types from the interface, so the implementation cannot
 * drift from the contract, and the boilerplate of `ipcRenderer.invoke` / `on` /
 * `removeListener` is written once here.
 */
import { ipcRenderer } from 'electron'

/** `(...args) => ipcRenderer.invoke(channel, ...args)` typed by its contextual type. */
export function invoke<Args extends unknown[], Result>(channel: string): (...args: Args) => Promise<Result> {
  return (...args: Args) => ipcRenderer.invoke(channel, ...args) as Promise<Result>
}

/**
 * Subscribe to a main→renderer event. The callback receives the payload only (the
 * IPC event object never crosses the bridge). Returns the unsubscribe function.
 */
export function subscribe<Payload>(channel: string): (cb: (payload: Payload) => void) => () => void {
  return (cb) => {
    const handler = (_event: unknown, payload: Payload) => cb(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

/** Subscribe to a main→renderer signal that carries no payload. */
export function subscribeSignal(channel: string): (cb: () => void) => () => void {
  return (cb) => {
    const handler = () => cb()
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

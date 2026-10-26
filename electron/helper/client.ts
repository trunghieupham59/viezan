/**
 * HelperClient — the one connection from Electron main to the privileged helper.
 *
 * Connects to the helper's Unix socket, performs the `hello` handshake (protocol
 * check), then serialises requests as JSON lines with ids, matches replies, times
 * them out, and sends a `status` heartbeat so the helper's watchdog never fires while
 * the app is alive and well. Any socket end rejects every pending request and emits
 * `disconnected`. The socket factory is injected so the client is tested against a
 * fake server without root.
 */
import * as net from 'node:net'
import { HELPER_PROTOCOL_VERSION, type HelperHello, HelperProtocolError, HelperRequestError, type HelperResponse, isHelperResponse } from './protocol'

export interface HelperSocket {
  on: (event: 'data' | 'close' | 'error' | 'connect', cb: (...args: unknown[]) => void) => unknown
  write: (data: string) => unknown
  end: () => unknown
  destroy: () => unknown
}

export interface HelperClientOptions {
  socketPath: string
  requestTimeoutMs?: number
  /** Heartbeat interval; keep it well under the helper's watchdog (15 s by default). */
  heartbeatMs?: number
  connect?: (socketPath: string) => HelperSocket
  log?: Pick<Console, 'warn'>
}

export interface HelperClient {
  /** Connect and shake hands. Rejects when the socket is missing/refused or the protocol does not match. */
  connect: () => Promise<HelperHello>
  request: <T>(op: string, args?: Record<string, unknown>) => Promise<T>
  isConnected: () => boolean
  hello: () => HelperHello | null
  onDisconnected: (cb: (reason: string) => void) => () => void
  /** End the connection. Does not restore fans by itself; callers send `fans.restoreAll` first. */
  close: () => void
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export function createHelperClient({
  socketPath,
  requestTimeoutMs = 5000,
  heartbeatMs = 5000,
  connect = (path) => net.connect(path) as unknown as HelperSocket,
  log = console,
}: HelperClientOptions): HelperClient {
  let socket: HelperSocket | null = null
  let connected = false
  let hello: HelperHello | null = null
  let nextId = 1
  let buffer = ''
  let heartbeat: ReturnType<typeof setInterval> | null = null
  const pending = new Map<number, Pending>()
  const disconnectListeners = new Set<(reason: string) => void>()

  function failPending(reason: string) {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer)
      entry.reject(new Error(reason))
      pending.delete(id)
    }
  }

  function teardown(reason: string) {
    if (heartbeat) { clearInterval(heartbeat); heartbeat = null }
    const wasConnected = connected
    connected = false
    hello = null
    socket = null
    buffer = ''
    failPending(reason)
    if (wasConnected) for (const listener of disconnectListeners) listener(reason)
  }

  function handleLine(line: string) {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      log.warn('[Helper] unparsable line from helper:', line.slice(0, 200))
      return
    }
    if (!isHelperResponse(parsed)) return
    const response: HelperResponse = parsed
    if (response.id === null) return
    const entry = pending.get(response.id)
    if (!entry) return
    pending.delete(response.id)
    clearTimeout(entry.timer)
    if (response.ok) entry.resolve(response.result)
    else entry.reject(new HelperRequestError(response.error))
  }

  function send<T>(op: string, args?: Record<string, unknown>): Promise<T> {
    const current = socket
    if (!current) return Promise.reject(new Error('Helper is not connected.'))
    const id = nextId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Helper did not answer "${op}" within ${requestTimeoutMs} ms.`))
      }, requestTimeoutMs)
      pending.set(id, { resolve: (value) => resolve(value as T), reject, timer })
      current.write(`${JSON.stringify({ id, op, ...(args ? { args } : {}) })}\n`)
    })
  }

  return {
    connect: () => new Promise<HelperHello>((resolve, reject) => {
      if (socket) { reject(new Error('Helper client is already connected.')); return }
      const current = connect(socketPath)
      socket = current
      let settled = false
      const fail = (error: Error) => {
        if (settled) return
        settled = true
        teardown(error.message)
        try { current.destroy() } catch { /* already gone */ }
        reject(error)
      }
      current.on('error', (e) => {
        const error = e instanceof Error ? e : new Error(String(e))
        if (!settled) fail(error)
        else teardown(error.message)
      })
      current.on('close', () => {
        if (!settled) fail(new Error('Helper closed the connection during the handshake.'))
        else teardown('Helper connection closed.')
      })
      current.on('data', (chunk) => {
        buffer += String(chunk)
        let newline = buffer.indexOf('\n')
        while (newline !== -1) {
          const line = buffer.slice(0, newline).trim()
          buffer = buffer.slice(newline + 1)
          if (line) handleLine(line)
          newline = buffer.indexOf('\n')
        }
      })
      current.on('connect', () => {
        send<HelperHello>('hello').then((answer) => {
          if (settled) return
          if (!answer || answer.protocol !== HELPER_PROTOCOL_VERSION) {
            fail(new HelperProtocolError(`Helper speaks protocol ${answer?.protocol ?? '?'}, this app needs ${HELPER_PROTOCOL_VERSION}.`))
            return
          }
          settled = true
          connected = true
          hello = answer
          heartbeat = setInterval(() => {
            if (pending.size > 0) return
            send('status').catch(() => { /* a failure here surfaces through close/error */ })
          }, heartbeatMs)
          heartbeat.unref?.()
          resolve(answer)
        }, fail)
      })
    }),
    request: (op, args) => {
      if (!connected) return Promise.reject(new Error('Helper is not connected.'))
      return send(op, args)
    },
    isConnected: () => connected,
    hello: () => hello,
    onDisconnected: (cb) => {
      disconnectListeners.add(cb)
      return () => { disconnectListeners.delete(cb) }
    },
    close: () => {
      const current = socket
      // Our own close is not a surprise: drop `connected` first so no disconnect event fires.
      connected = false
      teardown('Closed by the app.')
      try { current?.end() } catch { /* ignore */ }
    },
  }
}

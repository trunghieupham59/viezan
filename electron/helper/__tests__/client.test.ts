// @vitest-environment node
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHelperClient, type HelperSocket } from '../client'
import { appleScriptString, buildDetachedCommand, buildOsascriptArgs, launchWithAdministratorPrivileges, shellQuote } from '../launch'
import { HelperRequestError } from '../protocol'

/** An in-memory socket: what the client writes is parsed and answered by `respond`. */
class FakeSocket extends EventEmitter implements HelperSocket {
  written: Array<{ id: number; op: string; args?: Record<string, unknown> }> = []
  ended = false
  destroyed = false
  constructor(private respond: (request: { id: number; op: string; args?: Record<string, unknown> }, reply: (line: string) => void) => void) {
    super()
  }
  write(data: string) {
    for (const line of data.split('\n')) {
      if (!line) continue
      const request = JSON.parse(line)
      this.written.push(request)
      this.respond(request, (reply) => this.emit('data', `${reply}\n`))
    }
    return true
  }
  end() { this.ended = true; this.emit('close') }
  destroy() { this.destroyed = true }
}

const hello = { protocol: 1, helperVersion: '1.0.0', platform: 'darwin', pid: 42, watchdogSeconds: 15, ceilingCelsius: 105, capabilities: ['fans.write'] }

function okHelper(overrides: Record<string, (args?: Record<string, unknown>) => unknown> = {}) {
  return new FakeSocket((request, reply) => {
    const handler = overrides[request.op]
    if (handler) {
      const result = handler(request.args)
      reply(JSON.stringify(result instanceof Error ? { id: request.id, ok: false, error: { code: 'out-of-range', message: result.message } } : { id: request.id, ok: true, result }))
      return
    }
    if (request.op === 'hello') reply(JSON.stringify({ id: request.id, ok: true, result: hello }))
    else if (request.op === 'status') reply(JSON.stringify({ id: request.id, ok: true, result: { uptime: 1, activeOverrides: [] } }))
    else reply(JSON.stringify({ id: request.id, ok: false, error: { code: 'bad-request', message: `Unknown op ${request.op}.` } }))
  })
}

afterEach(() => { vi.useRealTimers() })

describe('helper client', () => {
  it('shakes hands, matches replies by id, and surfaces helper errors as HelperRequestError', async () => {
    const socket = okHelper({ 'fans.setTarget': (args) => (args?.rpm === 99999 ? new Error('Target 99999 RPM is outside 1499–5348 RPM.') : { id: args?.id, mode: 'manual' }) })
    const client = createHelperClient({ socketPath: '/var/run/x.sock', connect: () => socket, log: { warn: vi.fn() } })
    const connecting = client.connect()
    socket.emit('connect')
    expect(await connecting).toEqual(hello)
    expect(client.isConnected()).toBe(true)
    expect(client.hello()?.helperVersion).toBe('1.0.0')

    await expect(client.request('fans.setTarget', { id: 'fan0', rpm: 2000 })).resolves.toEqual({ id: 'fan0', mode: 'manual' })
    const failure = client.request('fans.setTarget', { id: 'fan0', rpm: 99999 })
    await expect(failure).rejects.toBeInstanceOf(HelperRequestError)
    await expect(failure).rejects.toMatchObject({ code: 'out-of-range' })
    expect(socket.written.map((r) => r.op)).toEqual(['hello', 'fans.setTarget', 'fans.setTarget'])

    const disconnected = vi.fn()
    client.onDisconnected(disconnected)
    client.close()
    expect(socket.ended).toBe(true)
    expect(client.isConnected()).toBe(false)
    // Closing from our side is not a surprise disconnect.
    expect(disconnected).not.toHaveBeenCalled()
  })

  it('refuses a helper with another protocol version', async () => {
    const socket = okHelper({ hello: () => ({ ...hello, protocol: 2 }) })
    const client = createHelperClient({ socketPath: '/var/run/x.sock', connect: () => socket })
    const connecting = client.connect()
    socket.emit('connect')
    await expect(connecting).rejects.toThrow(/protocol 2/)
    expect(client.isConnected()).toBe(false)
    expect(socket.destroyed).toBe(true)
  })

  it('rejects pending requests and reports a disconnect when the socket closes', async () => {
    vi.useFakeTimers()
    const socket = new FakeSocket((request, reply) => {
      if (request.op === 'hello') reply(JSON.stringify({ id: request.id, ok: true, result: hello }))
      // Everything else is left unanswered.
    })
    const client = createHelperClient({ socketPath: '/var/run/x.sock', connect: () => socket, requestTimeoutMs: 1000, heartbeatMs: 400 })
    const connecting = client.connect()
    socket.emit('connect')
    await connecting

    // The heartbeat goes out while idle.
    await vi.advanceTimersByTimeAsync(450)
    expect(socket.written.filter((r) => r.op === 'status')).toHaveLength(1)

    const hanging = client.request('fans.list')
    const disconnected = vi.fn()
    client.onDisconnected(disconnected)
    socket.emit('close')
    await expect(hanging).rejects.toThrow(/closed/)
    expect(disconnected).toHaveBeenCalledTimes(1)
    expect(client.isConnected()).toBe(false)
    await expect(client.request('status')).rejects.toThrow(/not connected/)
  })

  it('times out a request the helper never answers', async () => {
    vi.useFakeTimers()
    const socket = new FakeSocket((request, reply) => {
      if (request.op === 'hello') reply(JSON.stringify({ id: request.id, ok: true, result: hello }))
    })
    const client = createHelperClient({ socketPath: '/var/run/x.sock', connect: () => socket, requestTimeoutMs: 500, heartbeatMs: 60_000 })
    const connecting = client.connect()
    socket.emit('connect')
    await connecting
    const slow = client.request('fans.list')
    await vi.advanceTimersByTimeAsync(500)
    await expect(slow).rejects.toThrow(/within 500 ms/)
    expect(client.isConnected()).toBe(true)
  })

  it('fails the connect when the socket errors before the handshake', async () => {
    const socket = okHelper()
    const client = createHelperClient({ socketPath: '/var/run/x.sock', connect: () => socket })
    const connecting = client.connect()
    socket.emit('error', Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }))
    await expect(connecting).rejects.toThrow(/ECONNREFUSED/)
    // A later attempt is allowed.
    const again = okHelper()
    const retry = createHelperClient({ socketPath: '/var/run/x.sock', connect: () => again })
    const second = retry.connect()
    again.emit('connect')
    await expect(second).resolves.toEqual(hello)
  })
})

describe('helper launcher', () => {
  it('quotes the shell command and the AppleScript string safely', () => {
    expect(shellQuote("it's")).toBe(`'it'\\''s'`)
    expect(buildDetachedCommand('/Applications/My App.app/Contents/Resources/native/viezan-fan-helper', ['--socket', '/var/run/viezan-fan-helper-501.sock', '--uid', '501']))
      .toBe(`'/Applications/My App.app/Contents/Resources/native/viezan-fan-helper' '--socket' '/var/run/viezan-fan-helper-501.sock' '--uid' '501' >/dev/null 2>&1 &`)
    expect(appleScriptString('say "hi" \\ bye')).toBe('"say \\"hi\\" \\\\ bye"')
    expect(buildOsascriptArgs("'/x' &")).toEqual(['-e', 'do shell script "\'/x\' &" with administrator privileges'])
  })

  it('reports a cancelled prompt separately from a failure', async () => {
    const cancelled = await launchWithAdministratorPrivileges({
      binaryPath: '/x/helper', args: [],
      run: async () => { throw Object.assign(new Error('Command failed'), { stderr: 'execution error: User canceled. (-128)' }) },
      log: { error: vi.fn() },
    })
    expect(cancelled).toEqual({ ok: false, reason: 'cancelled', message: expect.stringMatching(/cancelled/) })

    const log = { error: vi.fn() }
    const failed = await launchWithAdministratorPrivileges({
      binaryPath: '/x/helper', args: [],
      run: async () => { throw Object.assign(new Error('Command failed'), { stderr: 'sh: /x/helper: No such file or directory' }) },
      log,
    })
    expect(failed).toEqual({ ok: false, reason: 'failed', message: 'sh: /x/helper: No such file or directory' })
    expect(log.error).toHaveBeenCalled()

    const run = vi.fn(async () => ({ stdout: '', stderr: '' }))
    expect(await launchWithAdministratorPrivileges({ binaryPath: '/x/helper', args: ['--uid', '501'], run })).toEqual({ ok: true })
    expect(run).toHaveBeenCalledWith('osascript', ['-e', `do shell script "'/x/helper' '--uid' '501' >/dev/null 2>&1 &" with administrator privileges`])
  })
})

// @vitest-environment node
/**
 * Executable specification for `electron/thermal/fanControl.ts` (the helper bridge).
 * The implementation is user-written; these tests pin the contract that the policy,
 * profile, IPC and capability layers rely on. The suite skips itself while the module
 * is absent so the rest of the project keeps testing.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { HelperClient } from '../../helper/client'
import type { LaunchResult } from '../../helper/launch'
import type { HelperFan, HelperHello, HelperStatus } from '../../helper/protocol'
import { HelperRequestError } from '../../helper/protocol'
import * as fanControlModule from '../fanControl'
import type { FanControlDeps, FanControlService } from '../fanControlTypes'

const modulePath = join(__dirname, '..', 'fanControl.ts')
const present = existsSync(modulePath) && typeof (fanControlModule as { createFanControlService?: unknown }).createFanControlService === 'function'

const hello: HelperHello = { protocol: 1, helperVersion: '1.0.0', platform: 'darwin', pid: 42, watchdogSeconds: 15, ceilingCelsius: 105, capabilities: ['fans.write'] }

/** A helper the client "talks to": two fans, fixed targets remembered, status reflecting overrides. */
function fakeHelper() {
  const fans: HelperFan[] = [
    { id: 'fan0', index: 0, minRpm: 1499, maxRpm: 5348, currentRpm: 1900, targetRpm: 1900, mode: 'auto' },
    { id: 'fan1', index: 1, minRpm: 1499, maxRpm: 5776, currentRpm: 1700, targetRpm: 1700, mode: 'auto' },
  ]
  let lastRestoreReason: string | undefined
  const requests: Array<{ op: string; args?: Record<string, unknown> }> = []
  const handle = async (op: string, args?: Record<string, unknown>): Promise<unknown> => {
    requests.push({ op, args })
    switch (op) {
      case 'hello': return hello
      case 'status': return { uptime: 1, activeOverrides: fans.filter((f) => f.mode === 'manual').map((f) => ({ id: f.id, rpm: f.targetRpm ?? 0 })), lastRestoreReason } satisfies HelperStatus
      case 'fans.list': return fans.map((f) => ({ ...f }))
      case 'fans.setTarget': {
        const fan = fans.find((f) => f.id === args?.id)
        if (!fan) throw new HelperRequestError({ code: 'unknown-fan', message: `No fan ${args?.id}.` })
        const rpm = Number(args?.rpm)
        if (rpm < fan.minRpm || rpm > fan.maxRpm) throw new HelperRequestError({ code: 'out-of-range', message: `Target ${rpm} RPM is outside ${fan.minRpm}–${fan.maxRpm} RPM.` })
        fan.mode = 'manual'; fan.targetRpm = rpm
        return { id: fan.id, targetRpm: rpm, mode: 'manual' }
      }
      case 'fans.setMode': {
        const fan = fans.find((f) => f.id === args?.id)
        if (!fan) throw new HelperRequestError({ code: 'unknown-fan', message: `No fan ${args?.id}.` })
        fan.mode = 'auto'
        return { id: fan.id, mode: 'auto' }
      }
      case 'fans.restoreAll':
        for (const fan of fans) fan.mode = 'auto'
        lastRestoreReason = 'client'
        return { restored: true }
      default:
        throw new HelperRequestError({ code: 'bad-request', message: `Unknown op ${op}.` })
    }
  }
  return {
    fans, requests,
    simulateHelperRestore(reason: string) { for (const fan of fans) fan.mode = 'auto'; lastRestoreReason = reason },
    handle,
  }
}

/** A client whose `connect` succeeds only while `running` is true (the helper process is up). */
function fakeClient(helper: ReturnType<typeof fakeHelper>, running: { value: boolean }) {
  let connected = false
  const disconnectListeners = new Set<(reason: string) => void>()
  const client: HelperClient & { dropConnection: (reason: string) => void } = {
    connect: async () => {
      if (!running.value) throw Object.assign(new Error('connect ENOENT'), { code: 'ENOENT' })
      connected = true
      return hello
    },
    request: async (op, args) => {
      if (!connected) throw new Error('Helper is not connected.')
      return helper.handle(op, args) as never
    },
    isConnected: () => connected,
    hello: () => (connected ? hello : null),
    onDisconnected: (cb) => { disconnectListeners.add(cb); return () => { disconnectListeners.delete(cb) } },
    close: () => { connected = false },
    dropConnection: (reason) => { connected = false; for (const cb of disconnectListeners) cb(reason) },
  }
  return client
}

async function load(): Promise<(deps: FanControlDeps) => FanControlService> {
  return (fanControlModule as { createFanControlService: (deps: FanControlDeps) => FanControlService }).createFanControlService
}

function setup(options: { platform?: NodeJS.Platform; binary?: boolean; launch?: LaunchResult } = {}) {
  const helper = fakeHelper()
  const running = { value: false }
  const client = fakeClient(helper, running)
  const launchResult: LaunchResult = options.launch ?? { ok: true }
  const launch = vi.fn(async () => { if (launchResult.ok) running.value = true; return launchResult })
  const onState = vi.fn()
  const deps: FanControlDeps = {
    platform: options.platform ?? 'darwin',
    helperBinaryPath: '/Applications/Viezan.app/Contents/Resources/native/viezan-fan-helper',
    binaryExists: () => options.binary !== false,
    socketPath: '/var/run/viezan-fan-helper-501.sock',
    uid: 501,
    launch,
    createClient: () => client,
    onState,
    connectRetryMs: 1,
    connectTimeoutMs: 50,
    refreshMs: 100_000,
    log: { warn: vi.fn(), error: vi.fn() },
  }
  return { helper, running, client, launch, onState, deps }
}

describe.skipIf(!present)('fan control bridge (electron/thermal/fanControl.ts)', () => {
  it('reports unsupported off macOS and missing without the binary, without launching anything', async () => {
    const create = await load()
    const linux = setup({ platform: 'linux' })
    const linuxService = create(linux.deps)
    expect(linuxService.getState()).toEqual({ helper: 'unsupported', fans: [] })
    expect((await linuxService.enable()).helper).toBe('unsupported')
    expect(linux.launch).not.toHaveBeenCalled()

    const missing = setup({ binary: false })
    const missingService = create(missing.deps)
    expect(missingService.getState().helper).toBe('missing')
    expect((await missingService.enable()).helper).toBe('missing')
    expect(missing.launch).not.toHaveBeenCalled()
  })

  it('starts idle, launches the helper on enable, connects, lists fans with app ids, and emits state', async () => {
    const create = await load()
    const { deps, launch, onState, helper } = setup()
    const service = create(deps)
    expect(service.getState()).toEqual({ helper: 'idle', fans: [] })

    const state = await service.enable()
    expect(launch).toHaveBeenCalledWith({ binaryPath: deps.helperBinaryPath, args: ['--socket', deps.socketPath, '--uid', '501'] })
    expect(state.helper).toBe('ready')
    expect(state.helperVersion).toBe('1.0.0')
    expect(state.fans).toEqual([
      { id: 'smc:fan0', index: 0, mode: 'auto', minRpm: 1499, maxRpm: 5348, currentRpm: 1900 },
      { id: 'smc:fan1', index: 1, mode: 'auto', minRpm: 1499, maxRpm: 5776, currentRpm: 1700 },
    ])
    expect(helper.requests.map((r) => r.op)).toContain('fans.list')
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ helper: 'starting' }))
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ helper: 'ready' }))

    // Enabling again is a no-op.
    launch.mockClear()
    expect((await service.enable()).helper).toBe('ready')
    expect(launch).not.toHaveBeenCalled()
  })

  it('reuses a helper that is already running instead of prompting again', async () => {
    const create = await load()
    const { deps, launch, running } = setup()
    running.value = true
    const service = create(deps)
    expect((await service.enable()).helper).toBe('ready')
    expect(launch).not.toHaveBeenCalled()
  })

  it('treats a cancelled prompt as idle (no error) and a failed launch as error', async () => {
    const create = await load()
    const cancelled = setup({ launch: { ok: false, reason: 'cancelled', message: 'The administrator prompt was cancelled.' } })
    const cancelledService = create(cancelled.deps)
    const afterCancel = await cancelledService.enable()
    expect(afterCancel.helper).toBe('idle')
    expect(afterCancel.error).toBeUndefined()

    const failed = setup({ launch: { ok: false, reason: 'failed', message: 'sh: helper: Permission denied' } })
    const failedService = create(failed.deps)
    const afterFail = await failedService.enable()
    expect(afterFail.helper).toBe('error')
    expect(afterFail.error).toMatch(/Permission denied/)

    // The helper never came up after a "successful" launch: error, not a hang.
    const silent = setup()
    silent.launch.mockImplementation(async () => ({ ok: true })) // does not set running
    const silentService = create(silent.deps)
    const afterSilence = await silentService.enable()
    expect(afterSilence.helper).toBe('error')
  })

  it('drives fans through the helper and refreshes the fan list after each command', async () => {
    const create = await load()
    const { deps, helper } = setup()
    const service = create(deps)
    await service.enable()

    const fixed = await service.setFan('smc:fan0', { mode: 'fixed', rpm: 2500 })
    expect(helper.requests[helper.requests.length - 2]).toEqual({ op: 'fans.setTarget', args: { id: 'fan0', rpm: 2500 } })
    expect(fixed.fans[0]).toMatchObject({ id: 'smc:fan0', mode: 'fixed', targetRpm: 2500 })
    expect(fixed.fans[1]).toMatchObject({ id: 'smc:fan1', mode: 'auto' })
    expect(fixed.fans[1].targetRpm).toBeUndefined()

    const auto = await service.setFan('smc:fan0', { mode: 'auto' })
    expect(helper.requests[helper.requests.length - 2]).toEqual({ op: 'fans.setMode', args: { id: 'fan0', mode: 'auto' } })
    expect(auto.fans[0].mode).toBe('auto')

    await service.setFan('smc:fan1', { mode: 'fixed', rpm: 3000 })
    const restored = await service.restoreAll()
    expect(helper.requests[helper.requests.length - 2]?.op).toBe('fans.restoreAll')
    expect(restored.fans.every((fan) => fan.mode === 'auto')).toBe(true)
    expect(restored.helper).toBe('ready')
  })

  it('rejects commands the helper refuses, unknown fans, and commands while not ready', async () => {
    const create = await load()
    const { deps } = setup()
    const service = create(deps)
    await expect(service.setFan('smc:fan0', { mode: 'fixed', rpm: 2500 })).rejects.toThrow(/not connected|not ready/i)
    await expect(service.restoreAll()).rejects.toThrow(/not connected|not ready/i)

    await service.enable()
    await expect(service.setFan('smc:fan0', { mode: 'fixed', rpm: 99_999 })).rejects.toThrow(/outside/)
    await expect(service.setFan('smc:fan9', { mode: 'fixed', rpm: 2000 })).rejects.toThrow(/fan/i)
    await expect(service.setFan('hwmon:fan0', { mode: 'auto' })).rejects.toThrow(/fan/i)
    // The bridge knows only auto and fixed; sensor rules belong to the policy layer.
    await expect(service.setFan('smc:fan0', { mode: 'sensor', sensorId: 'smc:Tp01', minCelsius: 50, maxCelsius: 90 })).rejects.toThrow()
    expect(service.getState().helper).toBe('ready')
  })

  it('goes idle on a lost helper, remembering the helper-side restore reason, and does not reconnect by itself', async () => {
    const create = await load()
    const { deps, client, onState, launch } = setup()
    const service = create(deps)
    await service.enable()
    await service.setFan('smc:fan0', { mode: 'fixed', rpm: 2500 })

    client.dropConnection('Helper connection closed.')
    expect(service.getState()).toMatchObject({ helper: 'idle', fans: [], lastRestoreReason: 'disconnect' })
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ helper: 'idle' }))
    launch.mockClear()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(launch).not.toHaveBeenCalled()
  })

  it('disable restores every fan, closes the client and reports idle; stop is the same and never throws', async () => {
    const create = await load()
    const { deps, helper, client } = setup()
    const service = create(deps)
    await service.enable()
    await service.setFan('smc:fan1', { mode: 'fixed', rpm: 3000 })

    const idle = await service.disable()
    expect(helper.requests.some((r) => r.op === 'fans.restoreAll')).toBe(true)
    expect(client.isConnected()).toBe(false)
    expect(idle).toMatchObject({ helper: 'idle', fans: [] })

    await expect(service.stop()).resolves.toBeUndefined()
    await expect(service.stop()).resolves.toBeUndefined()
  })

  it('reflects a restore the helper did on its own (watchdog / ceiling / sleep) at the next refresh', async () => {
    vi.useFakeTimers()
    try {
      const create = await load()
      const { deps, helper } = setup()
      const service = create({ ...deps, refreshMs: 1000 })
      await service.enable()
      await service.setFan('smc:fan0', { mode: 'fixed', rpm: 2500 })
      expect(service.getState().fans[0].mode).toBe('fixed')

      helper.simulateHelperRestore('ceiling')
      await vi.advanceTimersByTimeAsync(1000)
      expect(service.getState().fans[0].mode).toBe('auto')
      expect(service.getState().lastRestoreReason).toBe('ceiling')
      await service.stop()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe.skipIf(present)('fan control bridge', () => {
  it('is not implemented yet; electron/thermal/fanControl.ts does not export createFanControlService', () => {
    expect(present).toBe(false)
  })
})

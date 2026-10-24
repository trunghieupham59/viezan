import { existsSync } from 'node:fs'
import type { FanControlFan, FanControlState } from '../../shared/thermalApi'
import type { HelperClient } from '../helper/client'
import type { HelperFan, HelperHello, HelperStatus } from '../helper/protocol'
import { appFanId, type FanControlDeps, type FanControlService, helperFanId } from './fanControlTypes'

function mapFan(fan: HelperFan): FanControlFan {
  return {
    id: appFanId(fan.id),
    index: fan.index,
    mode: fan.mode === 'manual' ? 'fixed' : 'auto',
    minRpm: fan.minRpm,
    maxRpm: fan.maxRpm,
    currentRpm: fan.currentRpm,
    ...(fan.mode === 'manual' ? { targetRpm: fan.targetRpm } : {}),
  }
}

export function createFanControlService(deps: FanControlDeps): FanControlService {
  const { binaryExists = existsSync, connectRetryMs = 300, connectTimeoutMs = 30_000, refreshMs = 5000, log = console } = deps
  const unavailable = deps.platform !== 'darwin' ? 'unsupported' : !binaryExists(deps.helperBinaryPath) ? 'missing' : null
  let state: FanControlState = { helper: unavailable ?? 'idle', fans: [] }
  let client: HelperClient | null = null
  let unsubscribe: (() => void) | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let generation = 0
  let enabling: Promise<FanControlState> | null = null
  let disabling: Promise<FanControlState> | null = null

  function update(next: FanControlState) {
    if (next.helper !== 'ready' && timer) { clearInterval(timer); timer = null }
    if (JSON.stringify(state) === JSON.stringify(next)) return
    state = next
    // A consumer failing to broadcast must not break connection cleanup or enable().
    try { deps.onState?.(state) } catch (error) { log.warn('[Thermal] fan state listener failed:', error) }
  }

  function detach(): HelperClient | null {
    const current = client
    client = null
    unsubscribe?.()
    unsubscribe = null
    return current
  }

  function close(current: HelperClient | null) {
    try { current?.close() } catch (error) { log.warn('[Thermal] fan helper close failed:', error) }
  }

  function isCurrent(current: HelperClient, epoch: number): boolean {
    return client === current && generation === epoch
  }

  async function connect(current: HelperClient, timeoutMs: number): Promise<HelperHello> {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        current.connect(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Timed out connecting to the fan helper.')), timeoutMs)
        }),
      ])
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }

  async function connectAfterLaunch(current: HelperClient, epoch: number): Promise<HelperHello | null> {
    const deadline = Date.now() + connectTimeoutMs
    let lastError: unknown = new Error('The fan helper did not start.')
    while (isCurrent(current, epoch)) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) break
      try { return await connect(current, remaining) } catch (error) { lastError = error }
      if (!isCurrent(current, epoch)) return null
      const delay = Math.min(connectRetryMs, deadline - Date.now())
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    }
    if (!isCurrent(current, epoch)) return null
    const message = lastError instanceof Error ? lastError.message : String(lastError)
    throw new Error(`Could not connect to the fan helper within ${connectTimeoutMs} ms: ${message}`)
  }

  async function refresh(current: HelperClient, epoch: number, includeStatus = false): Promise<FanControlState> {
    if (!isCurrent(current, epoch) || state.helper !== 'ready') return state
    const status = includeStatus ? await current.request<HelperStatus>('status') : undefined
    if (!isCurrent(current, epoch) || state.helper !== 'ready') return state
    const fans = await current.request<HelperFan[]>('fans.list')
    // A response from a previous connection must never revive its fan state.
    if (isCurrent(current, epoch) && state.helper === 'ready') {
      update({ ...state, fans: fans.map(mapFan), ...(status ? { lastRestoreReason: status.lastRestoreReason } : {}) })
    }
    return state
  }

  function startRefresh(current: HelperClient, epoch: number) {
    let refreshing = false
    timer = setInterval(() => {
      if (refreshing) return
      refreshing = true
      void refresh(current, epoch, true).catch((error) => {
        if (isCurrent(current, epoch)) log.warn('[Thermal] fan refresh failed:', error)
      }).finally(() => { refreshing = false })
    }, refreshMs)
    timer.unref?.()
  }

  async function runEnable(): Promise<FanControlState> {
    const epoch = ++generation
    update({ helper: 'starting', fans: [] })
    try {
      const current = deps.createClient(deps.socketPath)
      client = current
      let hello: HelperHello | null
      try {
        hello = await connect(current, connectTimeoutMs)
      } catch {
        if (!isCurrent(current, epoch)) return state
        close(current)
        const result = await deps.launch({
          binaryPath: deps.helperBinaryPath,
          args: ['--socket', deps.socketPath, '--uid', String(deps.uid)],
        })
        if (!isCurrent(current, epoch)) return state
        if (!result.ok) {
          close(detach())
          update(result.reason === 'cancelled' ? { helper: 'idle', fans: [] } : { helper: 'error', fans: [], error: result.message })
          return state
        }
        hello = await connectAfterLaunch(current, epoch)
      }
      if (!hello || !isCurrent(current, epoch)) return state
      unsubscribe = current.onDisconnected(() => {
        if (!isCurrent(current, epoch)) return
        generation++
        close(detach())
        update({ helper: 'idle', fans: [], lastRestoreReason: 'disconnect' })
      })
      const fans = await current.request<HelperFan[]>('fans.list')
      if (!isCurrent(current, epoch)) return state
      startRefresh(current, epoch)
      update({ helper: 'ready', helperVersion: hello.helperVersion, fans: fans.map(mapFan) })
    } catch (error) {
      if (generation === epoch) {
        close(detach())
        update({ helper: 'error', fans: [], error: error instanceof Error ? error.message : String(error) })
      }
    }
    return state
  }

  async function enable(): Promise<FanControlState> {
    if (disabling) await disabling
    if (unavailable || state.helper === 'ready') return state
    if (enabling) return enabling
    const attempt = runEnable()
    enabling = attempt
    try { return await attempt } finally { if (enabling === attempt) enabling = null }
  }

  function readyClient(): HelperClient {
    if (state.helper !== 'ready' || !client) throw new Error('Fan control is not connected.')
    return client
  }

  async function runDisable(): Promise<FanControlState> {
    generation++
    enabling = null
    const current = detach()
    update({ helper: unavailable ?? 'idle', fans: [] })
    try {
      if (current?.isConnected()) await current.request('fans.restoreAll')
    } catch (error) {
      log.warn('[Thermal] fan restore during disable failed:', error)
    } finally {
      close(current)
    }
    return state
  }

  async function disable(): Promise<FanControlState> {
    if (disabling) return disabling
    const attempt = runDisable()
    disabling = attempt
    try { return await attempt } finally { if (disabling === attempt) disabling = null }
  }

  return {
    getState: () => state,
    enable,
    setFan: async (fanId, command) => {
      const current = readyClient()
      const epoch = generation
      const id = helperFanId(fanId)
      if (!id) throw new Error(`Invalid fan id: ${fanId}.`)
      if (command.mode === 'fixed') await current.request('fans.setTarget', { id, rpm: command.rpm })
      else if (command.mode === 'auto') await current.request('fans.setMode', { id, mode: 'auto' })
      else throw new Error(`Unsupported fan mode: ${command.mode}. Use auto or fixed.`)
      return refresh(current, epoch)
    },
    restoreAll: async () => {
      const current = readyClient()
      const epoch = generation
      await current.request('fans.restoreAll')
      return refresh(current, epoch)
    },
    disable,
    stop: async () => {
      try { await disable() } catch (error) { log.warn('[Thermal] fan control stop failed:', error) }
    },
  }
}

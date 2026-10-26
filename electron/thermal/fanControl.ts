import { existsSync } from 'node:fs'
import type { FanControlFan, FanControlState, FanHelperInstallState } from '../../shared/thermalApi'
import type { HelperClient } from '../helper/client'
import type { HelperDaemonInstaller } from '../helper/daemon'
import type { LaunchResult } from '../helper/launch'
import { type HelperFan, type HelperHello, HelperProtocolError, type HelperStatus } from '../helper/protocol'
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

type ConnectMode = 'interactive' | 'resume' | 'reinstall'

export function createFanControlService(deps: FanControlDeps): FanControlService {
  const { binaryExists = existsSync, connectRetryMs = 300, connectTimeoutMs = 30_000, resumeTimeoutMs = 5000, refreshMs = 5000, log = console } = deps
  const unavailable = deps.platform !== 'darwin' ? 'unsupported' : !binaryExists(deps.helperBinaryPath) ? 'missing' : null
  const daemon = unavailable ? undefined : deps.daemon
  let install: FanHelperInstallState | undefined = daemon?.installer.status()
  let state: FanControlState = { helper: unavailable ?? 'idle', fans: [], ...(install ? { install } : {}) }
  let client: HelperClient | null = null
  let unsubscribe: (() => void) | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let generation = 0
  /** The helper's restore count when this connection began; older restores are not news. */
  let baselineSeq: number | undefined
  let enabling: Promise<FanControlState> | null = null
  let enablingMode: ConnectMode | null = null
  let disabling: Promise<FanControlState> | null = null
  let enableSeq = 0
  let disableSeq = 0

  function update(next: FanControlState) {
    if (next.helper !== 'ready' && timer) { clearInterval(timer); timer = null }
    if (install && next.install === undefined) next = { ...next, install }
    if (JSON.stringify(state) === JSON.stringify(next)) return
    state = next
    // A consumer failing to broadcast must not break connection cleanup or enable().
    try { deps.onState?.(state) } catch (error) { log.warn('[Thermal] fan state listener failed:', error) }
  }

  function refreshInstall() {
    if (daemon) install = daemon.installer.status()
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

  /** Retry until the helper answers: it may still be starting (after a launch, or launchd bringing the daemon up). */
  async function connectWithRetry(current: HelperClient, epoch: number, timeoutMs = connectTimeoutMs): Promise<HelperHello | null> {
    const deadline = Date.now() + timeoutMs
    let lastError: unknown = new Error('The fan helper did not start.')
    while (isCurrent(current, epoch)) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) break
      try { return await connect(current, remaining) } catch (error) { lastError = error }
      // Another protocol will not change by waiting.
      if (lastError instanceof HelperProtocolError) throw lastError
      if (!isCurrent(current, epoch)) return null
      const delay = Math.min(connectRetryMs, deadline - Date.now())
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    }
    if (!isCurrent(current, epoch)) return null
    const message = lastError instanceof Error ? lastError.message : String(lastError)
    throw new Error(`Could not connect to the fan helper within ${timeoutMs} ms: ${message}`)
  }

  /** The status fields worth surfacing: a restore is news only when it happened after this connection began. */
  function restoreFields(status: HelperStatus | undefined): Pick<FanControlState, 'lastRestoreReason' | 'restoreSeq'> {
    if (!status) return {}
    if (status.restoreSeq === undefined) return { lastRestoreReason: status.lastRestoreReason }
    const fresh = baselineSeq === undefined || status.restoreSeq > baselineSeq
    return { restoreSeq: status.restoreSeq, ...(fresh && status.lastRestoreReason ? { lastRestoreReason: status.lastRestoreReason } : {}) }
  }

  async function refresh(current: HelperClient, epoch: number, includeStatus = false): Promise<FanControlState> {
    if (!isCurrent(current, epoch) || state.helper !== 'ready') return state
    const status = includeStatus ? await current.request<HelperStatus>('status') : undefined
    if (!isCurrent(current, epoch) || state.helper !== 'ready') return state
    const fans = await current.request<HelperFan[]>('fans.list')
    // A response from a previous connection must never revive its fan state.
    if (isCurrent(current, epoch) && state.helper === 'ready') {
      update({ ...state, fans: fans.map(mapFan), ...restoreFields(status) })
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

  /** After the handshake: watch the connection, read fans and the restore baseline, go ready. */
  async function attach(current: HelperClient, epoch: number, hello: HelperHello): Promise<FanControlState> {
    unsubscribe = current.onDisconnected(() => {
      if (!isCurrent(current, epoch)) return
      generation++
      close(detach())
      update({ helper: 'idle', fans: [], lastRestoreReason: 'disconnect' })
    })
    const [fans, status] = await Promise.all([
      current.request<HelperFan[]>('fans.list'),
      current.request<HelperStatus>('status').catch(() => undefined),
    ])
    if (!isCurrent(current, epoch)) return state
    baselineSeq = status?.restoreSeq
    startRefresh(current, epoch)
    update({ helper: 'ready', helperVersion: hello.helperVersion, fans: fans.map(mapFan), ...(baselineSeq !== undefined ? { restoreSeq: baselineSeq } : {}) })
    return state
  }

  /** A failed or declined prompt: a dismissed dialog is not an error. */
  function promptFailed(result: Exclude<LaunchResult, { ok: true }>): FanControlState {
    close(detach())
    update(result.reason === 'cancelled' ? { helper: 'idle', fans: [] } : { helper: 'error', fans: [], error: result.message })
    return state
  }

  function stayIdle(): FanControlState {
    close(detach())
    update({ helper: 'idle', fans: [] })
    return state
  }

  async function enableSession(epoch: number, mode: ConnectMode): Promise<FanControlState> {
    const current = deps.createClient(deps.socketPath)
    client = current
    let hello: HelperHello | null
    try {
      hello = await connect(current, mode === 'resume' ? resumeTimeoutMs : connectTimeoutMs)
    } catch {
      if (!isCurrent(current, epoch)) return state
      if (mode === 'resume') return stayIdle()
      close(current)
      const result = await deps.launch({
        binaryPath: deps.helperBinaryPath,
        args: ['--socket', deps.socketPath, '--uid', String(deps.uid)],
      })
      if (!isCurrent(current, epoch)) return state
      if (!result.ok) return promptFailed(result)
      hello = await connectWithRetry(current, epoch)
    }
    if (!hello || !isCurrent(current, epoch)) return state
    return attach(current, epoch, hello)
  }

  async function enableDaemon(installer: HelperDaemonInstaller, socketPath: string, epoch: number, mode: ConnectMode): Promise<FanControlState> {
    refreshInstall()
    const installNow = async (): Promise<FanControlState | null> => {
      const result = await installer.install()
      if (generation !== epoch) return state
      refreshInstall()
      return result.ok ? null : promptFailed(result)
    }
    let installed = false
    if (mode === 'reinstall' || install === 'not-installed' || (installer.kind === 'smappservice' && install === 'outdated')) {
      // Path B registers without a prompt, and an "outdated" there is path A's job waiting to be migrated.
      if (mode === 'resume') return stayIdle()
      const stopped = await installNow()
      if (stopped) return stopped
      installed = true
    }
    // SMAppService: registered but not approved yet. Not an error; the page offers System Settings.
    if (install === 'requires-approval') return stayIdle()
    let current = deps.createClient(socketPath)
    client = current
    let hello: HelperHello | null
    try {
      hello = await connectWithRetry(current, epoch, mode === 'resume' ? resumeTimeoutMs : connectTimeoutMs)
    } catch (error) {
      if (!isCurrent(current, epoch)) return state
      if (mode === 'resume') return stayIdle()
      // An installed daemon that does not answer or speaks another protocol (outdated, a broken
      // plist): the user asked for fan control, so replace it once — never a second prompt.
      if (mode !== 'interactive' || installed) throw error
      close(detach())
      const stopped = await installNow()
      if (stopped) return stopped
      current = deps.createClient(socketPath)
      client = current
      hello = await connectWithRetry(current, epoch)
    }
    if (!hello || !isCurrent(current, epoch)) return state
    const bundled = installer.bundledSha256?.()
    if (bundled && hello.binarySha256 && hello.binarySha256 !== bundled) {
      // Path B after an app update: launchd still runs the old binary's process. Ask it to leave;
      // KeepAlive starts the new file from the bundle, then connect to that one.
      log.warn('[Thermal] the running fan helper predates this app; restarting it')
      await current.request('helper.exit').catch(() => undefined)
      close(detach())
      current = deps.createClient(socketPath)
      client = current
      hello = await connectWithRetry(current, epoch)
      if (!hello || !isCurrent(current, epoch)) return state
    }
    return attach(current, epoch, hello)
  }

  async function runEnable(mode: ConnectMode): Promise<FanControlState> {
    const epoch = ++generation
    update({ helper: 'starting', fans: [] })
    try {
      return daemon ? await enableDaemon(daemon.installer, daemon.socketPath, epoch, mode) : await enableSession(epoch, mode)
    } catch (error) {
      if (generation === epoch) {
        close(detach())
        update({ helper: 'error', fans: [], error: error instanceof Error ? error.message : String(error) })
      }
    }
    return state
  }

  async function enableWith(mode: ConnectMode): Promise<FanControlState> {
    if (disabling) await disabling
    if (unavailable || state.helper === 'ready') return state
    if (enabling) {
      // A quiet resume never prompts; a user's enable behind it must still get its chance.
      if (enablingMode !== 'resume' || mode === 'resume') return enabling
      await enabling
      // Read through a call: the awaited resume changed `state` behind TypeScript's narrowing.
      if (currentHelper() === 'ready') return state
      if (enabling) return enabling
    }
    const attempt = runEnable(mode)
    const token = ++enableSeq
    enabling = attempt
    enablingMode = mode
    try { return await attempt } finally { if (enableSeq === token) { enabling = null; enablingMode = null } }
  }

  function currentHelper(): FanControlState['helper'] {
    return state.helper
  }

  function readyClient(): HelperClient {
    if (state.helper !== 'ready' || !client) throw new Error('Fan control is not connected.')
    return client
  }

  async function runDisable(): Promise<FanControlState> {
    generation++
    enabling = null
    baselineSeq = undefined
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
    const token = ++disableSeq
    disabling = attempt
    try { return await attempt } finally { if (disableSeq === token) disabling = null }
  }

  function requireDaemon(): HelperDaemonInstaller {
    if (!daemon) throw new Error('The fan helper is not installed as a background helper in this build.')
    return daemon.installer
  }

  return {
    getState: () => state,
    enable: () => enableWith('interactive'),
    resume: () => enableWith('resume'),
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
    installHelper: async () => {
      requireDaemon()
      // The running daemon is replaced: hand the fans back first, then reconnect to the new one.
      await disable()
      return enableWith('reinstall')
    },
    uninstallHelper: async () => {
      const installer = requireDaemon()
      const wasReady = state.helper === 'ready'
      await disable()
      const result = await installer.uninstall()
      refreshInstall()
      update({ ...state, ...(install ? { install } : {}) })
      if (result.ok) return state
      // Nothing was removed: reconnect as before (no prompt needed, the daemon is still there).
      if (wasReady) await enableWith('resume')
      if (result.reason !== 'cancelled') throw new Error(result.message)
      return state
    },
  }
}

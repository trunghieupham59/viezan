/**
 * Fan profiles — a named setting for every fan, for a situation: the built-ins Viezan
 * ships (System, Quiet, Cool, Gaming, Local AI) and the ones the user saves from the
 * current state.
 *
 * Built-ins are symbolic (a rule on the CPU or GPU sensor *group*) so one definition
 * works on every Mac; the policy follows the hottest sensor of that group.
 * This layer wraps the policy service: a manual tweak after a profile turns it into
 * "custom", restore/disable drop `applied`. The choice, the user's profiles and the
 * per-fan setting of "custom" live in `thermal.json`.
 *
 * It also owns *keeping* the user's setting: whenever the helper comes up (enable, the
 * resume at launch, a reinstall) and whenever the helper itself handed the fans back
 * for a reason that has passed (sleep, wake, a missed heartbeat), the remembered
 * profile — or else the saved custom setting — is applied again. A restore for the
 * temperature ceiling is left alone: the user decides when to take over again.
 */
import { randomUUID } from 'node:crypto'
import type { FanCommand, FanControlFan, FanControlState, FanProfile, FanProfileEntry, FanProfilesState } from '../../shared/thermalApi'
import type { FanControlService } from './fanControlTypes'
import { FAN_PROFILE_WILDCARD, isUserFanProfileId, isValidFanProfileName, MAX_USER_FAN_PROFILES } from './fanProfilesSchema'
import type { ThermalSettingsStore } from './settingsStore'

export const BUILTIN_FAN_PROFILES: readonly FanProfile[] = [
  { id: 'builtin:system', name: 'System', builtin: true, fans: { [FAN_PROFILE_WILDCARD]: { mode: 'auto' } } },
  { id: 'builtin:quiet', name: 'Quiet', builtin: true, fans: { [FAN_PROFILE_WILDCARD]: { mode: 'sensor-group', group: 'cpu', minCelsius: 70, maxCelsius: 100 } } },
  { id: 'builtin:cool', name: 'Cool', builtin: true, fans: { [FAN_PROFILE_WILDCARD]: { mode: 'sensor-group', group: 'cpu', minCelsius: 45, maxCelsius: 75 } } },
  { id: 'builtin:gaming', name: 'Gaming', builtin: true, fans: { [FAN_PROFILE_WILDCARD]: { mode: 'sensor-group', group: 'gpu', minCelsius: 50, maxCelsius: 80 } } },
  { id: 'builtin:local-ai', name: 'Local AI', builtin: true, fans: { [FAN_PROFILE_WILDCARD]: { mode: 'sensor-group', group: 'cpu', minCelsius: 45, maxCelsius: 70 } } },
]

/** Turn a profile entry into a command for one fan. A group rule follows the hottest sensor of that group (`group:cpu`). */
export function resolveProfileEntry(entry: FanProfileEntry): FanCommand {
  if (entry.mode !== 'sensor-group') return entry
  return { mode: 'sensor', sensorId: `group:${entry.group}`, minCelsius: entry.minCelsius, maxCelsius: entry.maxCelsius }
}

/** The entry a profile holds for a fan: its own, else the wildcard. */
export function entryForFan(profile: FanProfile, fanId: string): FanProfileEntry | undefined {
  return profile.fans[fanId] ?? profile.fans[FAN_PROFILE_WILDCARD]
}

/** What a fan is doing now, as a profile entry. */
export function commandFromFan(fan: FanControlFan): FanCommand {
  if (fan.mode === 'sensor' && fan.sensor) return { mode: 'sensor', ...fan.sensor }
  if (fan.mode === 'fixed' && fan.targetRpm !== undefined) return { mode: 'fixed', rpm: fan.targetRpm }
  return { mode: 'auto' }
}

/** Helper restores after which the saved setting goes back on by itself. */
const REAPPLY_AFTER_RESTORE: ReadonlySet<string> = new Set(['sleep', 'can-sleep', 'wake', 'watchdog'])

export interface FanProfileDeps {
  control: FanControlService
  settings: Pick<ThermalSettingsStore, 'get' | 'update'>
  onState?: (state: FanProfilesState) => void
  /** True while something else drives the fans on purpose (calibration); no automatic re-apply then. */
  paused?: () => boolean
  log?: Pick<Console, 'info' | 'warn' | 'error'>
}

export interface FanProfileService extends FanControlService {
  getProfiles: () => FanProfilesState
  applyProfile: (id: string) => Promise<FanProfilesState>
  saveCurrentProfile: (name: string) => Promise<FanProfilesState>
  removeProfile: (id: string) => Promise<FanProfilesState>
  /** Route the policy's `onState` here so a lost helper clears `applied` and a helper restore is noticed. */
  ingestControlState: (state: FanControlState) => void
  /** Apply the remembered profile, else the saved custom setting. Never rejects. */
  reapply: () => Promise<void>
}

export function createFanProfileService({ control, settings, onState, paused = () => false, log = console }: FanProfileDeps): FanProfileService {
  let applied = false
  let lastEmitted = ''
  /** The helper's restore count already handled; undefined until the connection reported one. */
  let restoreBaseline: number | undefined
  let reapplying: Promise<void> = Promise.resolve()
  /** After a ceiling restore the setting stays off until the user picks one again (or the next launch). */
  let heldByCeiling = false

  function profiles(): FanProfile[] {
    return [...BUILTIN_FAN_PROFILES, ...settings.get().fanProfiles.user]
  }

  function state(): FanProfilesState {
    return { activeId: settings.get().fanProfiles.activeId, applied, profiles: profiles().map((profile) => ({ ...profile, fans: { ...profile.fans } })) }
  }

  function emit() {
    const next = state()
    const key = JSON.stringify(next)
    if (key === lastEmitted) return
    lastEmitted = key
    onState?.(next)
  }

  function setActive(activeId: string | null, isApplied: boolean) {
    applied = isApplied
    if (settings.get().fanProfiles.activeId !== activeId) settings.update({ fanProfiles: { activeId } })
    emit()
  }

  async function applyProfile(id: string): Promise<FanProfilesState> {
    const profile = profiles().find((candidate) => candidate.id === id)
    if (!profile) throw new Error(`No profile ${id}.`)
    const current = control.getState()
    if (current.helper !== 'ready') throw new Error('Fan control is not connected.')
    console.info(`[Thermal] applying fan profile ${id}`)
    heldByCeiling = false
    const failures: string[] = []
    for (const fan of current.fans) {
      const entry = entryForFan(profile, fan.id)
      if (!entry) continue
      const command = resolveProfileEntry(entry)
      try {
        await control.setFan(fan.id, command)
      } catch (e) {
        failures.push(`${fan.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (failures.length > 0) {
      setActive(id, false)
      throw new Error(`Profile could not be fully applied (${failures.join('; ')}).`)
    }
    setActive(id, true)
    return state()
  }

  /** Remember what the fans do now as the custom setting (after a hand-made change). */
  function saveCustom(fans: readonly FanControlFan[]) {
    settings.update({ fanControl: { custom: Object.fromEntries(fans.map((fan) => [fan.id, commandFromFan(fan)])) } })
  }

  function setAutoEnable(autoEnable: boolean) {
    if (settings.get().fanControl.autoEnable !== autoEnable) settings.update({ fanControl: { autoEnable } })
  }

  async function applyRemembered(): Promise<void> {
    const current = control.getState()
    if (current.helper !== 'ready') return
    const activeId = settings.get().fanProfiles.activeId
    if (activeId && profiles().some((profile) => profile.id === activeId)) {
      await applyProfile(activeId)
      return
    }
    const custom = settings.get().fanControl.custom
    const entries = current.fans.flatMap((fan) => (custom[fan.id] ? [[fan.id, custom[fan.id]] as const] : []))
    if (entries.length === 0) return
    console.info(`[Thermal] applying the saved custom fan setting to ${entries.length} fan(s)`)
    const failures: string[] = []
    for (const [fanId, command] of entries) {
      try {
        await control.setFan(fanId, command)
      } catch (e) {
        failures.push(`${fanId}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (failures.length > 0) throw new Error(`The custom setting could not be fully applied (${failures.join('; ')}).`)
  }

  /** Serialised so a restore arriving mid-apply queues behind it instead of interleaving commands. */
  function reapply(): Promise<void> {
    reapplying = reapplying.then(applyRemembered).catch((e) => {
      log.warn('[Thermal] could not re-apply the remembered fan setting:', e instanceof Error ? e.message : e)
    })
    return reapplying
  }

  /** Enable-like calls: when they brought the helper up, keep it on across launches and put the setting back. */
  async function afterConnect(wasReady: boolean, remember: boolean): Promise<FanControlState> {
    const next = control.getState()
    if (next.helper === 'ready' && !wasReady) {
      heldByCeiling = false
      if (remember) setAutoEnable(true)
      await reapply()
    }
    return control.getState()
  }

  return {
    getState: () => control.getState(),
    getProfiles: state,
    reapply,
    ingestControlState: (next) => {
      if (next.helper !== 'ready') {
        restoreBaseline = undefined
        if (applied) { applied = false; emit() }
        return
      }
      if (next.restoreSeq === undefined) return
      if (restoreBaseline === undefined || next.restoreSeq <= restoreBaseline) {
        restoreBaseline = Math.max(restoreBaseline ?? next.restoreSeq, next.restoreSeq)
        return
      }
      restoreBaseline = next.restoreSeq
      const reason = next.lastRestoreReason ?? ''
      // The app's own restore (Back to automatic, calibration) is already accounted for by whoever asked.
      if (reason === 'client') return
      if (reason === 'ceiling') heldByCeiling = true
      if (REAPPLY_AFTER_RESTORE.has(reason) && !paused() && !heldByCeiling) {
        log.info(`[Thermal] the helper restored the fans (${reason}); applying the remembered setting again`)
        void reapply()
      } else if (applied) {
        applied = false
        emit()
      }
    },
    enable: async () => {
      const wasReady = control.getState().helper === 'ready'
      await control.enable()
      return afterConnect(wasReady, true)
    },
    resume: async () => {
      const wasReady = control.getState().helper === 'ready'
      await control.resume()
      return afterConnect(wasReady, false)
    },
    setFan: async (fanId, command) => {
      const next = await control.setFan(fanId, command)
      heldByCeiling = false
      // A hand-made change is no longer the chosen profile; it becomes the custom setting.
      saveCustom(next.fans)
      setActive(null, false)
      return next
    },
    restoreAll: async () => {
      const next = await control.restoreAll()
      settings.update({ fanControl: { custom: {} } })
      setActive(null, false)
      return next
    },
    disable: async () => {
      // Turning fan control off is a choice that survives the next launch; quitting is not.
      setAutoEnable(false)
      const next = await control.disable()
      if (applied) { applied = false; emit() }
      return next
    },
    installHelper: async () => {
      await control.installHelper()
      return afterConnect(false, true)
    },
    uninstallHelper: async () => {
      const wasAutoEnable = settings.get().fanControl.autoEnable
      setAutoEnable(false)
      const next = await control.uninstallHelper()
      if (next.install !== 'not-installed') {
        // The prompt was dismissed: nothing was removed, so fan control stays as the user had it.
        setAutoEnable(wasAutoEnable)
        if (next.helper === 'ready') await reapply()
        return control.getState()
      }
      if (applied) { applied = false; emit() }
      return next
    },
    stop: async () => {
      await control.stop()
      if (applied) { applied = false; emit() }
    },
    applyProfile,
    saveCurrentProfile: async (name) => {
      if (!isValidFanProfileName(name)) throw new Error('Give the profile a name of up to 40 characters.')
      const current = control.getState()
      if (current.helper !== 'ready') throw new Error('Fan control is not connected.')
      const user = settings.get().fanProfiles.user
      if (user.length >= MAX_USER_FAN_PROFILES) throw new Error(`You can keep up to ${MAX_USER_FAN_PROFILES} profiles.`)
      const profile: FanProfile = {
        id: `user:${randomUUID()}`,
        name: name.trim(),
        builtin: false,
        fans: Object.fromEntries(current.fans.map((fan) => [fan.id, commandFromFan(fan)])),
      }
      settings.update({ fanProfiles: { user: [...user, profile], activeId: profile.id } })
      applied = true
      emit()
      return state()
    },
    removeProfile: async (id) => {
      if (!isUserFanProfileId(id)) throw new Error('Built-in profiles cannot be deleted.')
      const current = settings.get().fanProfiles
      if (!current.user.some((profile) => profile.id === id)) throw new Error(`No profile ${id}.`)
      const activeId = current.activeId === id ? null : current.activeId
      if (current.activeId === id) applied = false
      settings.update({ fanProfiles: { user: current.user.filter((profile) => profile.id !== id), activeId } })
      emit()
      return state()
    },
  }
}

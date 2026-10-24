/**
 * Fan profiles — a named setting for every fan, for a situation: the built-ins Viezan
 * ships (System, Quiet, Cool, Gaming, Local AI) and the ones the user saves from the
 * current state.
 *
 * Built-ins are symbolic (a rule on the CPU or GPU sensor *group*) so one definition
 * works on every Mac; the policy follows the hottest sensor of that group.
 * This layer wraps the policy service: a manual tweak after a profile turns it into
 * "custom", restore/disable drop `applied`, and when the helper comes up the remembered
 * profile is applied again. The choice and the user's profiles live in `thermal.json`.
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

export interface FanProfileDeps {
  control: FanControlService
  settings: Pick<ThermalSettingsStore, 'get' | 'update'>
  onState?: (state: FanProfilesState) => void
  log?: Pick<Console, 'warn' | 'error'>
}

export interface FanProfileService extends FanControlService {
  getProfiles: () => FanProfilesState
  applyProfile: (id: string) => Promise<FanProfilesState>
  saveCurrentProfile: (name: string) => Promise<FanProfilesState>
  removeProfile: (id: string) => Promise<FanProfilesState>
  /** Route the policy's `onState` here so a lost helper clears `applied`. */
  ingestControlState: (state: FanControlState) => void
}

export function createFanProfileService({ control, settings, onState, log = console }: FanProfileDeps): FanProfileService {
  let applied = false
  let lastEmitted = ''

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

  return {
    getState: () => control.getState(),
    getProfiles: state,
    ingestControlState: (next) => {
      if (next.helper !== 'ready' && applied) {
        applied = false
        emit()
      }
    },
    enable: async () => {
      const next = await control.enable()
      const activeId = settings.get().fanProfiles.activeId
      if (next.helper === 'ready' && activeId && !applied) {
        try {
          await applyProfile(activeId)
        } catch (e) {
          log.warn('[Thermal] could not re-apply the remembered fan profile:', e instanceof Error ? e.message : e)
        }
      }
      return control.getState()
    },
    setFan: async (fanId, command) => {
      const next = await control.setFan(fanId, command)
      // A hand-made change is no longer the chosen profile.
      setActive(null, false)
      return next
    },
    restoreAll: async () => {
      const next = await control.restoreAll()
      setActive(null, false)
      return next
    },
    disable: async () => {
      const next = await control.disable()
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

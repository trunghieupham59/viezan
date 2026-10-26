// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { FanCommand, FanControlState, ThermalSettings } from '../../../shared/thermalApi'
import type { FanControlService } from '../fanControlTypes'
import { BUILTIN_FAN_PROFILES, commandFromFan, createFanProfileService, resolveProfileEntry } from '../fanProfiles'
import { isUserFanProfile } from '../fanProfilesSchema'
import { createThermalSettingsStore, DEFAULT_THERMAL_SETTINGS, parseThermalSettingsPatch } from '../settingsStore'

describe('fan profile resolution', () => {
  it('turns entries into commands and fans back into entries', () => {
    expect(resolveProfileEntry({ mode: 'sensor-group', group: 'gpu', minCelsius: 50, maxCelsius: 80 })).toEqual({ mode: 'sensor', sensorId: 'group:gpu', minCelsius: 50, maxCelsius: 80 })
    expect(resolveProfileEntry({ mode: 'fixed', rpm: 2000 })).toEqual({ mode: 'fixed', rpm: 2000 })
    expect(commandFromFan({ id: 'smc:fan0', index: 0, mode: 'sensor', sensor: { sensorId: 'smc:Tp01', minCelsius: 50, maxCelsius: 90 }, minRpm: 1, maxRpm: 2, currentRpm: 1 })).toEqual({ mode: 'sensor', sensorId: 'smc:Tp01', minCelsius: 50, maxCelsius: 90 })
    expect(commandFromFan({ id: 'smc:fan0', index: 0, mode: 'fixed', targetRpm: 2000, minRpm: 1, maxRpm: 2, currentRpm: 1 })).toEqual({ mode: 'fixed', rpm: 2000 })
    expect(commandFromFan({ id: 'smc:fan0', index: 0, mode: 'auto', minRpm: 1, maxRpm: 2, currentRpm: 1 })).toEqual({ mode: 'auto' })
  })

  it('validates persisted user profiles and the settings patch', () => {
    const good = { id: 'user:abc-123', name: 'Night', builtin: false, fans: { 'smc:fan0': { mode: 'fixed', rpm: 2000 }, '*': { mode: 'auto' } } }
    expect(isUserFanProfile(good)).toBe(true)
    expect(isUserFanProfile({ ...good, id: 'builtin:system' })).toBe(false)
    expect(isUserFanProfile({ ...good, name: '' })).toBe(false)
    expect(isUserFanProfile({ ...good, fans: { 'smc:fan0': { mode: 'curve' } } })).toBe(false)
    expect(parseThermalSettingsPatch({ fanProfiles: { activeId: 'builtin:quiet', user: [good] } })).toMatchObject({ ok: true })
    expect(parseThermalSettingsPatch({ fanProfiles: { activeId: 'evil' } })).toEqual({ ok: false, error: 'Invalid "fanProfiles.activeId" value.' })
    expect(BUILTIN_FAN_PROFILES.map((p) => p.id)).toEqual(['builtin:system', 'builtin:quiet', 'builtin:cool', 'builtin:gaming', 'builtin:local-ai'])
  })

  it('accepts the main-owned fan control fields from the settings file only', () => {
    const custom = { 'smc:fan0': { mode: 'sensor', sensorId: 'group:cpu', minCelsius: 50, maxCelsius: 90 }, 'smc:fan1': { mode: 'fixed', rpm: 2000 } }
    // The renderer cannot switch automatic resume on or plant a custom setting; the fields are dropped.
    expect(parseThermalSettingsPatch({ fanControl: { acknowledged: true, autoEnable: true, custom } })).toEqual({ ok: true, patch: { fanControl: { acknowledged: true } } })
    expect(parseThermalSettingsPatch({ fanControl: { autoEnable: true, custom } }, { trusted: true })).toEqual({ ok: true, patch: { fanControl: { autoEnable: true, custom } } })
    expect(parseThermalSettingsPatch({ fanControl: { custom: { 'smc:fan0': { mode: 'curve' } } } }, { trusted: true })).toMatchObject({ ok: false })
    expect(parseThermalSettingsPatch({ fanControl: { custom: { '../fan0': { mode: 'auto' } } } }, { trusted: true })).toMatchObject({ ok: false })
  })
})

function fakeControl(helper: FanControlState['helper'] = 'ready') {
  let state: FanControlState = {
    helper, helperVersion: '1.0.0',
    fans: [
      { id: 'smc:fan0', index: 0, mode: 'auto', minRpm: 1499, maxRpm: 5348, currentRpm: 1900 },
      { id: 'smc:fan1', index: 1, mode: 'auto', minRpm: 1499, maxRpm: 5776, currentRpm: 1700 },
    ],
  }
  const control: FanControlService & { setFan: ReturnType<typeof vi.fn<FanControlService['setFan']>> } = {
    getState: () => state,
    enable: async () => { state = { ...state, helper: 'ready' }; return state },
    setFan: vi.fn(async (fanId: string, command: FanCommand) => {
      state = {
        ...state,
        fans: state.fans.map((fan) => (fan.id !== fanId ? fan : {
          ...fan,
          mode: command.mode,
          targetRpm: command.mode === 'fixed' ? command.rpm : undefined,
          sensor: command.mode === 'sensor' ? { sensorId: command.sensorId, minCelsius: command.minCelsius, maxCelsius: command.maxCelsius } : undefined,
        })),
      }
      return state
    }),
    restoreAll: async () => { state = { ...state, fans: state.fans.map((fan) => ({ ...fan, mode: 'auto', targetRpm: undefined, sensor: undefined })) }; return state },
    disable: async () => { state = { helper: 'idle', fans: [] }; return state },
    stop: async () => { state = { helper: 'idle', fans: [] } },
    resume: async () => { state = { ...state, helper: 'ready' }; return state },
    installHelper: async () => { state = { ...state, helper: 'ready', install: 'installed' }; return state },
    uninstallHelper: async () => { state = { helper: 'idle', install: 'not-installed', fans: [] }; return state },
  }
  return control
}

function setup(helper: FanControlState['helper'] = 'ready', saved: Partial<ThermalSettings['fanProfiles']> = {}, options: { fanControl?: Partial<ThermalSettings['fanControl']>; paused?: () => boolean } = {}) {
  const control = fakeControl(helper)
  const save = vi.fn()
  const settings = createThermalSettingsStore({
    load: () => ({ ...DEFAULT_THERMAL_SETTINGS, fanControl: { ...DEFAULT_THERMAL_SETTINGS.fanControl, ...options.fanControl }, fanProfiles: { activeId: null, user: [], ...saved } }),
    save,
  })
  const onState = vi.fn()
  const service = createFanProfileService({ control, settings, onState, paused: options.paused, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })
  return { control, settings, save, onState, service }
}

/** Let a queued re-apply (fire-and-forget inside the service) finish. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

/** What the policy forwards after the helper's status poll: ready, with its restore count and reason. */
function restoreState(control: FanControlService, restoreSeq: number, lastRestoreReason?: string): FanControlState {
  return { ...control.getState(), restoreSeq, ...(lastRestoreReason ? { lastRestoreReason } : {}) }
}

describe('fan profile service', () => {
  it('applies a built-in profile to every fan, resolving group rules, and remembers it', async () => {
    const { control, service, settings, onState } = setup()
    const state = await service.applyProfile('builtin:gaming')
    expect(control.setFan).toHaveBeenCalledTimes(2)
    expect(control.setFan).toHaveBeenCalledWith('smc:fan0', { mode: 'sensor', sensorId: 'group:gpu', minCelsius: 50, maxCelsius: 80 })
    expect(control.setFan).toHaveBeenCalledWith('smc:fan1', { mode: 'sensor', sensorId: 'group:gpu', minCelsius: 50, maxCelsius: 80 })
    expect(state).toMatchObject({ activeId: 'builtin:gaming', applied: true })
    expect(settings.get().fanProfiles.activeId).toBe('builtin:gaming')
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ activeId: 'builtin:gaming', applied: true }))

    // A manual tweak turns the choice into custom.
    await service.setFan('smc:fan0', { mode: 'fixed', rpm: 3000 })
    expect(service.getProfiles()).toMatchObject({ activeId: null, applied: false })
    expect(settings.get().fanProfiles.activeId).toBeNull()
  })

  it('saves the current state as a user profile, applies it again later, and deletes it', async () => {
    const { control, service, settings } = setup()
    await service.setFan('smc:fan0', { mode: 'fixed', rpm: 3000 })
    await service.setFan('smc:fan1', { mode: 'sensor', sensorId: 'smc:Tp01', minCelsius: 55, maxCelsius: 85 })

    const saved = await service.saveCurrentProfile('  Render night  ')
    const mine = saved.profiles.find((profile) => !profile.builtin)
    expect(mine).toMatchObject({ name: 'Render night', builtin: false, fans: { 'smc:fan0': { mode: 'fixed', rpm: 3000 }, 'smc:fan1': { mode: 'sensor', sensorId: 'smc:Tp01', minCelsius: 55, maxCelsius: 85 } } })
    expect(mine?.id.startsWith('user:')).toBe(true)
    expect(saved).toMatchObject({ activeId: mine?.id, applied: true })
    expect(settings.get().fanProfiles.user).toHaveLength(1)

    await service.restoreAll()
    expect(service.getProfiles()).toMatchObject({ activeId: null, applied: false })
    control.setFan.mockClear()
    await service.applyProfile(mine?.id ?? '')
    expect(control.setFan).toHaveBeenCalledWith('smc:fan0', { mode: 'fixed', rpm: 3000 })
    expect(control.setFan).toHaveBeenCalledWith('smc:fan1', { mode: 'sensor', sensorId: 'smc:Tp01', minCelsius: 55, maxCelsius: 85 })

    const removed = await service.removeProfile(mine?.id ?? '')
    expect(removed.profiles.every((profile) => profile.builtin)).toBe(true)
    expect(removed).toMatchObject({ activeId: null, applied: false })
    await expect(service.removeProfile('builtin:quiet')).rejects.toThrow(/Built-in/)
    await expect(service.saveCurrentProfile('')).rejects.toThrow(/name/)
  })

  it('re-applies the remembered profile when the helper comes up and drops applied when it goes', async () => {
    const { control, service } = setup('idle', { activeId: 'builtin:cool' })
    expect(service.getProfiles()).toMatchObject({ activeId: 'builtin:cool', applied: false })
    await expect(service.applyProfile('builtin:cool')).rejects.toThrow(/not connected/)

    await service.enable()
    expect(control.setFan).toHaveBeenCalledWith('smc:fan0', { mode: 'sensor', sensorId: 'group:cpu', minCelsius: 45, maxCelsius: 75 })
    expect(service.getProfiles()).toMatchObject({ activeId: 'builtin:cool', applied: true })

    service.ingestControlState({ helper: 'idle', fans: [], lastRestoreReason: 'disconnect' })
    expect(service.getProfiles()).toMatchObject({ activeId: 'builtin:cool', applied: false })
  })

  it('remembers that fan control is on across quits and forgets it only when turned off', async () => {
    const { service, settings } = setup('idle')
    await service.enable()
    expect(settings.get().fanControl.autoEnable).toBe(true)
    // Quitting (an update relaunch) must not count as turning it off.
    await service.stop()
    expect(settings.get().fanControl.autoEnable).toBe(true)
    await service.enable()
    await service.disable()
    expect(settings.get().fanControl.autoEnable).toBe(false)
  })

  it('keeps a hand-made setting as "custom" and puts it back when the app resumes after a relaunch', async () => {
    const { service, settings } = setup()
    await service.applyProfile('builtin:cool')
    await service.setFan('smc:fan1', { mode: 'fixed', rpm: 2600 })
    // The whole current state becomes the custom setting, not only the fan that was touched.
    expect(settings.get().fanControl.custom).toEqual({
      'smc:fan0': { mode: 'sensor', sensorId: 'group:cpu', minCelsius: 45, maxCelsius: 75 },
      'smc:fan1': { mode: 'fixed', rpm: 2600 },
    })

    // The next launch: same settings file, helper not connected yet.
    const relaunched = setup('idle', {}, { fanControl: settings.get().fanControl })
    await relaunched.service.resume()
    expect(relaunched.control.setFan).toHaveBeenCalledWith('smc:fan0', { mode: 'sensor', sensorId: 'group:cpu', minCelsius: 45, maxCelsius: 75 })
    expect(relaunched.control.setFan).toHaveBeenCalledWith('smc:fan1', { mode: 'fixed', rpm: 2600 })
    expect(relaunched.service.getProfiles()).toMatchObject({ activeId: null, applied: false })

    // "Back to automatic" clears the custom setting, so nothing comes back next time.
    await service.restoreAll()
    expect(settings.get().fanControl.custom).toEqual({})
  })

  it('puts the setting back after a sleep, wake or missed-heartbeat restore, but not after the ceiling', async () => {
    const { service, control } = setup('ready', { activeId: 'builtin:quiet' })
    service.ingestControlState(restoreState(control, 3, 'disconnect')) // baseline at connect: old news
    await flush()
    expect(control.setFan).not.toHaveBeenCalled()

    service.ingestControlState(restoreState(control, 4, 'wake'))
    await flush()
    expect(control.setFan).toHaveBeenCalledTimes(2)
    expect(service.getProfiles()).toMatchObject({ activeId: 'builtin:quiet', applied: true })

    // The same count again (the next poll) is not a new restore.
    service.ingestControlState(restoreState(control, 4, 'wake'))
    await flush()
    expect(control.setFan).toHaveBeenCalledTimes(2)

    control.setFan.mockClear()
    service.ingestControlState(restoreState(control, 5, 'ceiling'))
    await flush()
    expect(control.setFan).not.toHaveBeenCalled()
    expect(service.getProfiles()).toMatchObject({ activeId: 'builtin:quiet', applied: false })
  })

  it('does not re-apply while something else drives the fans on purpose (calibration)', async () => {
    let calibrating = true
    const { service, control } = setup('ready', { activeId: 'builtin:quiet' }, { paused: () => calibrating })
    service.ingestControlState(restoreState(control, 1))
    service.ingestControlState(restoreState(control, 2, 'watchdog'))
    await flush()
    expect(control.setFan).not.toHaveBeenCalled()
    calibrating = false
    service.ingestControlState(restoreState(control, 3, 'sleep'))
    await flush()
    expect(control.setFan).toHaveBeenCalledTimes(2)
  })

  it('treats its own restore as accounted for and holds the setting after a ceiling restore until the user chooses again', async () => {
    const { service, control } = setup('ready', { activeId: 'builtin:quiet' })
    await service.applyProfile('builtin:quiet')
    service.ingestControlState(restoreState(control, 1))
    // Calibration or "Back to automatic" restored through the app: no flip to "not applied", no re-apply.
    service.ingestControlState(restoreState(control, 2, 'client'))
    await flush()
    expect(service.getProfiles()).toMatchObject({ applied: true })

    service.ingestControlState(restoreState(control, 3, 'ceiling'))
    control.setFan.mockClear()
    service.ingestControlState(restoreState(control, 4, 'wake'))
    await flush()
    expect(control.setFan).not.toHaveBeenCalled()

    await service.applyProfile('builtin:quiet')
    control.setFan.mockClear()
    service.ingestControlState(restoreState(control, 5, 'sleep'))
    await flush()
    expect(control.setFan).toHaveBeenCalledTimes(2)
  })

  it('keeps fan control as it was when the uninstall prompt is dismissed', async () => {
    const { service, control, settings } = setup('idle')
    await service.enable()
    control.uninstallHelper = async () => control.getState() // still installed: nothing removed
    await service.uninstallHelper()
    expect(settings.get().fanControl.autoEnable).toBe(true)
  })

  it('reports a partial failure and keeps the choice unapplied', async () => {
    const { control, service } = setup()
    control.setFan.mockRejectedValueOnce(new Error('Target is outside the range.'))
    await expect(service.applyProfile('builtin:quiet')).rejects.toThrow(/could not be fully applied/)
    expect(service.getProfiles()).toMatchObject({ activeId: 'builtin:quiet', applied: false })
    await expect(service.applyProfile('builtin:nope')).rejects.toThrow(/No profile/)
  })
})

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
  }
  return control
}

function setup(helper: FanControlState['helper'] = 'ready', saved: Partial<ThermalSettings['fanProfiles']> = {}) {
  const control = fakeControl(helper)
  const save = vi.fn()
  const settings = createThermalSettingsStore({
    load: () => ({ ...DEFAULT_THERMAL_SETTINGS, fanProfiles: { activeId: null, user: [], ...saved } }),
    save,
  })
  const onState = vi.fn()
  const service = createFanProfileService({ control, settings, onState, log: { warn: vi.fn(), error: vi.fn() } })
  return { control, settings, save, onState, service }
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

  it('reports a partial failure and keeps the choice unapplied', async () => {
    const { control, service } = setup()
    control.setFan.mockRejectedValueOnce(new Error('Target is outside the range.'))
    await expect(service.applyProfile('builtin:quiet')).rejects.toThrow(/could not be fully applied/)
    expect(service.getProfiles()).toMatchObject({ activeId: 'builtin:quiet', applied: false })
    await expect(service.applyProfile('builtin:nope')).rejects.toThrow(/No profile/)
  })
})

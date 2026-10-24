// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { ThermalSnapshot } from '../../../shared/thermalApi'
import { applyThermalSettingsPatch, createThermalSettingsStore, DEFAULT_THERMAL_SETTINGS, parseThermalSettingsPatch } from '../settingsStore'
import { createThermalTrayController, resolveTrayPlacement, type StatusItem } from '../tray'
import { formatTrayTitle, formatTrayTooltip, pickTraySensor } from '../trayTitle'

const snapshot: ThermalSnapshot = {
  timestamp: 1,
  source: 'smc',
  cpuLoadPercent: 23,
  sensors: [
    { id: 'smc:Tp01', code: 'Tp01', group: 'cpu', label: 'cpu-performance-core', celsius: 61.4 },
    { id: 'smc:Tg05', code: 'Tg05', group: 'gpu', label: 'gpu', celsius: 47 },
    { id: 'smc:TRD0', code: 'TRD0', group: 'other', celsius: 92.2 },
  ],
  fans: [
    { id: 'smc:fan0', index: 0, rpm: 2374 },
    { id: 'smc:fan1', index: 1, rpm: 2510, name: 'Right' },
  ],
}

describe('tray title', () => {
  it('picks the sensor for each metric and falls back to the hottest when a group is empty', () => {
    expect(pickTraySensor(snapshot, 'hottest')?.code).toBe('TRD0')
    expect(pickTraySensor(snapshot, 'cpu')?.code).toBe('Tp01')
    expect(pickTraySensor(snapshot, 'gpu')?.code).toBe('Tg05')
    expect(pickTraySensor({ sensors: snapshot.sensors.filter((s) => s.group !== 'gpu') }, 'gpu')?.code).toBe('TRD0')
    expect(pickTraySensor({ sensors: [] }, 'cpu')).toBeNull()
  })

  it('keeps the title terse and spells things out in the tooltip', () => {
    expect(formatTrayTitle(snapshot, { metric: 'cpu', showFan: false })).toBe('61°')
    expect(formatTrayTitle(snapshot, { metric: 'hottest', showFan: true })).toBe('92° 2510')
    expect(formatTrayTitle({ sensors: [], fans: [] }, { metric: 'hottest', showFan: true })).toBe('')
    expect(formatTrayTooltip('Viezan', snapshot, { metric: 'cpu', showFan: true }).split('\n')).toEqual([
      'Viezan', 'CPU 61.4°C (Tp01)', 'Fan 1: 2374 RPM', 'Right: 2510 RPM', 'CPU 23%',
    ])
  })
})

describe('thermal settings store', () => {
  it('validates patches field by field and ignores unknown keys', () => {
    expect(parseThermalSettingsPatch({ tray: { enabled: true, metric: 'gpu', extra: 1 } })).toEqual({ ok: true, patch: { tray: { enabled: true, metric: 'gpu' } } })
    expect(parseThermalSettingsPatch({ tray: { metric: 'disk' } })).toEqual({ ok: false, error: 'Invalid "tray.metric" value.' })
    expect(parseThermalSettingsPatch({ tray: { enabled: 'yes' } })).toEqual({ ok: false, error: 'Invalid "tray.enabled" value.' })
    expect(parseThermalSettingsPatch(null)).toEqual({ ok: false, error: 'Invalid thermal settings payload.' })
    expect(applyThermalSettingsPatch(DEFAULT_THERMAL_SETTINGS, { tray: { showFan: true } })).toEqual({ tray: { enabled: false, metric: 'hottest', showFan: true } })
  })

  it('persists and notifies only when something changed', () => {
    const save = vi.fn()
    const listener = vi.fn()
    const store = createThermalSettingsStore({ load: () => ({ tray: { ...DEFAULT_THERMAL_SETTINGS.tray } }), save })
    store.subscribe(listener)

    store.update({ tray: { enabled: false } })
    expect(save).not.toHaveBeenCalled()
    expect(listener).not.toHaveBeenCalled()

    expect(store.update({ tray: { enabled: true, metric: 'cpu' } })).toEqual({ tray: { enabled: true, metric: 'cpu', showFan: false } })
    expect(save).toHaveBeenCalledWith({ tray: { enabled: true, metric: 'cpu', showFan: false } })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.get().tray.metric).toBe('cpu')
  })
})

function fakeStatusItem() {
  return { setTitle: vi.fn<StatusItem['setTitle']>(), setToolTip: vi.fn<StatusItem['setToolTip']>(), destroy: vi.fn<StatusItem['destroy']>() }
}

describe('thermal tray controller', () => {
  it('resolves where the reading can go', () => {
    expect(resolveTrayPlacement('darwin', false)).toBe('menu-bar')
    expect(resolveTrayPlacement('linux', true)).toBe('tray')
    expect(resolveTrayPlacement('linux', false)).toBe('none')
    expect(resolveTrayPlacement('win32', true)).toBe('tray')
  })

  it('creates the macOS status item while on, titles it from snapshots, and destroys it when off', () => {
    const items: ReturnType<typeof fakeStatusItem>[] = []
    const createStatusItem = vi.fn(() => { const item = fakeStatusItem(); items.push(item); return item })
    const controller = createThermalTrayController({ platform: 'darwin', appTitle: 'Viezan', createStatusItem, getAppTray: () => null })

    controller.update(snapshot) // nothing shown yet
    expect(createStatusItem).not.toHaveBeenCalled()

    controller.apply({ enabled: true, metric: 'hottest', showFan: false })
    expect(createStatusItem).toHaveBeenCalledTimes(1)
    expect(items[0].setTitle).toHaveBeenLastCalledWith('92°', { fontType: 'monospacedDigit' })
    expect(controller.isShowing()).toBe(true)

    controller.apply({ enabled: true, metric: 'cpu', showFan: true }) // same item, new reading
    expect(createStatusItem).toHaveBeenCalledTimes(1)
    expect(items[0].setTitle).toHaveBeenLastCalledWith('61° 2510', { fontType: 'monospacedDigit' })

    controller.update({ ...snapshot, sensors: [{ id: 'x', code: 'Tp01', group: 'cpu', celsius: 70 }] })
    expect(items[0].setTitle).toHaveBeenLastCalledWith('70° 2510', { fontType: 'monospacedDigit' })

    controller.apply({ enabled: false, metric: 'cpu', showFan: true })
    expect(items[0].destroy).toHaveBeenCalledTimes(1)
    expect(controller.isShowing()).toBe(false)

    controller.apply({ enabled: true, metric: 'cpu', showFan: false })
    expect(createStatusItem).toHaveBeenCalledTimes(2)
    controller.dispose()
    expect(items[1].destroy).toHaveBeenCalledTimes(1)
  })

  it('uses the residency tray tooltip on Linux and restores it when turned off', () => {
    const appTray = { setToolTip: vi.fn() }
    const createStatusItem = vi.fn(fakeStatusItem)
    const controller = createThermalTrayController({ platform: 'linux', appTitle: 'Viezan', createStatusItem, getAppTray: () => appTray })

    controller.apply({ enabled: true, metric: 'cpu', showFan: true })
    controller.update(snapshot)
    expect(createStatusItem).not.toHaveBeenCalled()
    expect(appTray.setToolTip).toHaveBeenLastCalledWith(['Viezan', 'CPU 61.4°C (Tp01)', 'Fan 1: 2374 RPM', 'Right: 2510 RPM', 'CPU 23%'].join('\n'))

    controller.apply({ enabled: false, metric: 'cpu', showFan: true })
    expect(appTray.setToolTip).toHaveBeenLastCalledWith('Viezan')
  })
})

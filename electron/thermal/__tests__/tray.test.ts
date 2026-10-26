// @vitest-environment node

import type { NativeImage } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import type { ThermalSnapshot, ThermalTraySettings } from '../../../shared/thermalApi'
import { applyThermalSettingsPatch, createThermalSettingsStore, DEFAULT_THERMAL_SETTINGS, parseThermalSettingsPatch } from '../settingsStore'
import { createThermalTrayController, resolveTrayPlacement, type StatusItem } from '../tray'
import { renderStackedBitmap, STACKED_CELL_PX, STACKED_HEIGHT_PX, stackedRowWidth } from '../trayGlyphs'
import { formatTrayParts, formatTrayTitle, formatTrayTooltip, pickTraySensor, shortRpm } from '../trayTitle'

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

/** Full tray settings from a few overrides (the defaults are the inline text with the unit). */
function tray(overrides: Partial<ThermalTraySettings> = {}): ThermalTraySettings {
  return { ...DEFAULT_THERMAL_SETTINGS.tray, ...overrides }
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
    expect(formatTrayTitle(snapshot, tray({ metric: 'cpu', showFan: false }))).toBe('61°')
    expect(formatTrayTitle(snapshot, tray({ metric: 'hottest', showFan: true }))).toBe('92° 2510')
    expect(formatTrayTitle({ sensors: [], fans: [] }, tray({ metric: 'hottest', showFan: true }))).toBe('')
    expect(formatTrayTooltip('Viezan', snapshot, { metric: 'cpu', showFan: true }).split('\n')).toEqual([
      'Viezan', 'CPU 61.4°C (Tp01)', 'Fan 1: 2374 RPM', 'Right: 2510 RPM', 'CPU 23%',
    ])
  })

  it('drops the unit and shortens the fan speed on request', () => {
    expect(shortRpm(980)).toBe('980')
    expect(shortRpm(2374)).toBe('2.4k')
    expect(shortRpm(2510)).toBe('2.5k')
    expect(shortRpm(12_500)).toBe('13k')
    expect(formatTrayParts(snapshot, tray({ metric: 'cpu', showFan: true, showUnit: false, fanFormat: 'short' }))).toEqual({ temperature: '61', fan: '2.5k' })
    expect(formatTrayParts(snapshot, tray({ metric: 'cpu', showFan: false }))).toEqual({ temperature: '61°', fan: null })
    expect(formatTrayTitle(snapshot, tray({ metric: 'cpu', showFan: true, showUnit: false, fanFormat: 'short' }))).toBe('61 2.5k')
  })
})

describe('stacked bitmap', () => {
  it('draws two centred rows of glyphs as an opaque-black 2× bitmap', () => {
    expect(stackedRowWidth('61°')).toBe(5 + 1 + 5 + 1 + 4)
    expect(stackedRowWidth('2.5k')).toBe(5 + 1 + 2 + 1 + 5 + 1 + 4)
    const bitmap = renderStackedBitmap(['61°', '2.5k'])
    expect(bitmap.scaleFactor).toBe(STACKED_CELL_PX)
    expect(bitmap.height).toBe(STACKED_HEIGHT_PX)
    expect(bitmap.width).toBe((19 + 2) * STACKED_CELL_PX)
    expect(bitmap.buffer.length).toBe(bitmap.width * bitmap.height * 4)
    // Every pixel is either transparent or opaque black.
    let inked = 0
    for (let i = 0; i < bitmap.buffer.length; i += 4) {
      expect(bitmap.buffer[i] | bitmap.buffer[i + 1] | bitmap.buffer[i + 2]).toBe(0)
      expect([0, 255]).toContain(bitmap.buffer[i + 3])
      if (bitmap.buffer[i + 3] === 255) inked++
    }
    expect(inked).toBeGreaterThan(0)
    // The first row sits in the upper half, the second in the lower half.
    const rowHasInk = (y: number) => { for (let x = 0; x < bitmap.width; x++) if (bitmap.buffer[(y * bitmap.width + x) * 4 + 3]) return true; return false }
    expect(rowHasInk(2 * STACKED_CELL_PX)).toBe(true)
    expect(rowHasInk(11 * STACKED_CELL_PX)).toBe(false)
    expect(rowHasInk(12 * STACKED_CELL_PX)).toBe(true)
    // Unknown characters draw as a dash rather than vanishing.
    expect(stackedRowWidth('x')).toBe(5)
    expect(renderStackedBitmap(['']).width).toBe(3 * STACKED_CELL_PX)
  })
})

describe('thermal settings store', () => {
  it('validates patches field by field and ignores unknown keys', () => {
    expect(parseThermalSettingsPatch({ tray: { enabled: true, metric: 'gpu', extra: 1 } })).toEqual({ ok: true, patch: { tray: { enabled: true, metric: 'gpu' } } })
    expect(parseThermalSettingsPatch({ tray: { metric: 'disk' } })).toEqual({ ok: false, error: 'Invalid "tray.metric" value.' })
    expect(parseThermalSettingsPatch({ tray: { enabled: 'yes' } })).toEqual({ ok: false, error: 'Invalid "tray.enabled" value.' })
    expect(parseThermalSettingsPatch({ tray: { layout: 'stacked', showUnit: false, fanFormat: 'short' } })).toEqual({ ok: true, patch: { tray: { layout: 'stacked', showUnit: false, fanFormat: 'short' } } })
    expect(parseThermalSettingsPatch({ tray: { layout: 'grid' } })).toEqual({ ok: false, error: 'Invalid "tray.layout" value.' })
    expect(parseThermalSettingsPatch({ tray: { fanFormat: 'long' } })).toEqual({ ok: false, error: 'Invalid "tray.fanFormat" value.' })
    expect(parseThermalSettingsPatch({ tray: { showUnit: 1 } })).toEqual({ ok: false, error: 'Invalid "tray.showUnit" value.' })
    expect(parseThermalSettingsPatch(null)).toEqual({ ok: false, error: 'Invalid thermal settings payload.' })
    expect(applyThermalSettingsPatch(DEFAULT_THERMAL_SETTINGS, { tray: { showFan: true } })).toEqual({ tray: tray({ showFan: true }), fanControl: { acknowledged: false, autoEnable: false, custom: {} }, fanProfiles: { activeId: null, user: [] }, fanAffinity: null })
    expect(parseThermalSettingsPatch({ fanControl: { acknowledged: true } })).toEqual({ ok: true, patch: { fanControl: { acknowledged: true } } })
    expect(parseThermalSettingsPatch({ fanControl: { acknowledged: 'yes' } })).toEqual({ ok: false, error: 'Invalid "fanControl.acknowledged" value.' })
  })

  it('persists and notifies only when something changed', () => {
    const save = vi.fn()
    const listener = vi.fn()
    const store = createThermalSettingsStore({ load: () => ({ ...DEFAULT_THERMAL_SETTINGS, tray: { ...DEFAULT_THERMAL_SETTINGS.tray } }), save })
    store.subscribe(listener)

    store.update({ tray: { enabled: false } })
    expect(save).not.toHaveBeenCalled()
    expect(listener).not.toHaveBeenCalled()

    expect(store.update({ tray: { enabled: true, metric: 'cpu' } })).toEqual({ tray: tray({ enabled: true, metric: 'cpu' }), fanControl: { acknowledged: false, autoEnable: false, custom: {} }, fanProfiles: { activeId: null, user: [] }, fanAffinity: null })
    expect(save).toHaveBeenCalledWith({ tray: tray({ enabled: true, metric: 'cpu' }), fanControl: { acknowledged: false, autoEnable: false, custom: {} }, fanProfiles: { activeId: null, user: [] }, fanAffinity: null })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.get().tray.metric).toBe('cpu')
  })
})

function fakeStatusItem() {
  return { setTitle: vi.fn<StatusItem['setTitle']>(), setToolTip: vi.fn<StatusItem['setToolTip']>(), setImage: vi.fn<StatusItem['setImage']>(), destroy: vi.fn<StatusItem['destroy']>() }
}

/** Images are opaque to the controller: a tag per bitmap is enough to assert what it set. */
const createImage = vi.fn((bitmap: { width: number } | null) => ({ tag: bitmap ? `stacked:${bitmap.width}` : 'empty' }) as unknown as NativeImage)

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
    const controller = createThermalTrayController({ platform: 'darwin', appTitle: 'Viezan', createStatusItem, createImage, getAppTray: () => null })

    controller.update(snapshot) // nothing shown yet
    expect(createStatusItem).not.toHaveBeenCalled()

    controller.apply(tray({ enabled: true, metric: 'hottest', showFan: false }))
    expect(createStatusItem).toHaveBeenCalledTimes(1)
    expect(items[0].setTitle).toHaveBeenLastCalledWith('92°', { fontType: 'monospacedDigit' })
    expect(items[0].setImage).not.toHaveBeenCalled()
    expect(controller.isShowing()).toBe(true)

    controller.apply(tray({ enabled: true, metric: 'cpu', showFan: true })) // same item, new reading
    expect(createStatusItem).toHaveBeenCalledTimes(1)
    expect(items[0].setTitle).toHaveBeenLastCalledWith('61° 2510', { fontType: 'monospacedDigit' })

    controller.update({ ...snapshot, sensors: [{ id: 'x', code: 'Tp01', group: 'cpu', celsius: 70 }] })
    expect(items[0].setTitle).toHaveBeenLastCalledWith('70° 2510', { fontType: 'monospacedDigit' })

    controller.apply(tray({ enabled: false, metric: 'cpu', showFan: true }))
    expect(items[0].destroy).toHaveBeenCalledTimes(1)
    expect(controller.isShowing()).toBe(false)

    controller.apply(tray({ enabled: true, metric: 'cpu', showFan: false }))
    expect(createStatusItem).toHaveBeenCalledTimes(2)
    controller.dispose()
    expect(items[1].destroy).toHaveBeenCalledTimes(1)
  })

  it('draws the stacked layout as an image and goes back to text when a line is gone', () => {
    const item = fakeStatusItem()
    const controller = createThermalTrayController({ platform: 'darwin', appTitle: 'Viezan', createStatusItem: () => item, createImage, getAppTray: () => null })
    createImage.mockClear()
    controller.update(snapshot)
    controller.apply(tray({ enabled: true, metric: 'cpu', showFan: true, layout: 'stacked', fanFormat: 'short' }))
    // Two lines → one image, title cleared so only the image shows.
    expect(createImage).toHaveBeenLastCalledWith(expect.objectContaining({ width: (stackedRowWidth('2.5k') + 2) * STACKED_CELL_PX }))
    expect(item.setImage).toHaveBeenLastCalledWith({ tag: `stacked:${(stackedRowWidth('2.5k') + 2) * STACKED_CELL_PX}` })
    expect(item.setTitle).toHaveBeenLastCalledWith('', { fontType: 'monospacedDigit' })
    expect(item.setToolTip).toHaveBeenLastCalledWith(['Viezan', 'CPU 61.4°C (Tp01)', 'Fan 1: 2374 RPM', 'Right: 2510 RPM', 'CPU 23%'].join('\n'))

    // Without the fan there is one line, so stacked falls back to the inline text and the image is cleared once.
    controller.apply(tray({ enabled: true, metric: 'cpu', showFan: false, layout: 'stacked' }))
    expect(item.setImage).toHaveBeenLastCalledWith({ tag: 'empty' })
    expect(item.setTitle).toHaveBeenLastCalledWith('61°', { fontType: 'monospacedDigit' })
    const clears = item.setImage.mock.calls.length
    controller.update(snapshot)
    expect(item.setImage.mock.calls.length).toBe(clears)
  })

  it('uses the residency tray tooltip on Linux and restores it when turned off', () => {
    const appTray = { setToolTip: vi.fn() }
    const createStatusItem = vi.fn(fakeStatusItem)
    const controller = createThermalTrayController({ platform: 'linux', appTitle: 'Viezan', createStatusItem, createImage, getAppTray: () => appTray })

    controller.apply(tray({ enabled: true, metric: 'cpu', showFan: true }))
    controller.update(snapshot)
    expect(createStatusItem).not.toHaveBeenCalled()
    expect(appTray.setToolTip).toHaveBeenLastCalledWith(['Viezan', 'CPU 61.4°C (Tp01)', 'Fan 1: 2374 RPM', 'Right: 2510 RPM', 'CPU 23%'].join('\n'))

    controller.apply(tray({ enabled: false, metric: 'cpu', showFan: true }))
    expect(appTray.setToolTip).toHaveBeenLastCalledWith('Viezan')
  })
})

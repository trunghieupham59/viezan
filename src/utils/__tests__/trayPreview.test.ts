import { describe, expect, it } from 'vitest'
import type { ThermalTraySettings } from '../../../shared/thermalApi'
import { buildTrayPreview, shortRpm } from '../trayPreview'

const snapshot = {
  sensors: [
    { id: 'smc:Tp01', code: 'Tp01', group: 'cpu' as const, celsius: 61.4 },
    { id: 'smc:TRD0', code: 'TRD0', group: 'other' as const, celsius: 72.2 },
  ],
  fans: [{ id: 'smc:fan0', index: 0, rpm: 2374 }, { id: 'smc:fan1', index: 1, rpm: 2510 }],
}
const base: ThermalTraySettings = { enabled: true, metric: 'hottest', showFan: true, layout: 'inline', showUnit: true, fanFormat: 'rpm' }

describe('tray preview', () => {
  it('mirrors the main-process wording and knows when the item is the stacked image', () => {
    expect(shortRpm(2510)).toBe('2.5k')
    expect(buildTrayPreview(snapshot, base, 'menu-bar')).toEqual({ temperature: '72°', fan: '2510', stacked: false })
    expect(buildTrayPreview(snapshot, { ...base, metric: 'cpu', showUnit: false, fanFormat: 'short', layout: 'stacked' }, 'menu-bar')).toEqual({ temperature: '61', fan: '2.5k', stacked: true })
    // Stacked needs a menu bar and a fan line.
    expect(buildTrayPreview(snapshot, { ...base, layout: 'stacked' }, 'tray').stacked).toBe(false)
    expect(buildTrayPreview(snapshot, { ...base, layout: 'stacked', showFan: false }, 'menu-bar')).toEqual({ temperature: '72°', fan: null, stacked: false })
    expect(buildTrayPreview(null, base, 'menu-bar')).toEqual({ temperature: null, fan: null, stacked: false })
  })
})

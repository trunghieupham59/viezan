import { describe, expect, it } from 'vitest'
import type { ThermalSensor } from '../../../shared/thermalApi'
import { buildSensorRows, hottestSensor, thermalTone } from '../thermalSensorRows'

const sensors: ThermalSensor[] = [
  { id: 'smc:Tp01', code: 'Tp01', group: 'cpu', label: 'cpu-performance-core', celsius: 61.4 },
  { id: 'smc:Tp05', code: 'Tp05', group: 'cpu', label: 'cpu-performance-core', celsius: 58 },
  { id: 'smc:Te01', code: 'Te01', group: 'cpu', label: 'cpu-efficiency-core', celsius: 44 },
  { id: 'smc:Tg05', code: 'Tg05', group: 'gpu', label: 'gpu', celsius: 47 },
  { id: 'smc:TRD0', code: 'TRD0', group: 'other', celsius: 92.2 },
  { id: 'smc:TRD1', code: 'TRD1', group: 'other', celsius: 40 },
  { id: 'smc:TB1T', code: 'TB1T', group: 'other', label: 'battery', celsius: 30 },
  { id: 'hwmon:nvme/temp1', code: 'nvme/temp1', group: 'other', name: 'Composite', celsius: 35 },
]

describe('thermal sensor rows', () => {
  it('folds sensors with the same meaning into one row with max, average and members hottest first', () => {
    const rows = buildSensorRows(sensors)
    expect(rows.cpu.map((row) => [row.label, row.count, row.max, row.avg])).toEqual([
      ['cpu-performance-core', 2, 61.4, 59.7],
      ['cpu-efficiency-core', 1, 44, 44],
    ])
    expect(rows.cpu[0].sensors.map((sensor) => sensor.code)).toEqual(['Tp01', 'Tp05'])
    expect(rows.gpu).toHaveLength(1)
  })

  it('keeps hwmon names as their own rows and parks unnamed keys in one trailing row', () => {
    const rows = buildSensorRows(sensors)
    expect(rows.other.map((row) => row.label ?? row.name ?? (row.unlabeled ? '?' : ''))).toEqual(['Composite', 'battery', '?'])
    const unlabeled = rows.other[2]
    expect(unlabeled).toMatchObject({ unlabeled: true, count: 2, max: 92.2 })
    expect(unlabeled.sensors.map((sensor) => sensor.code)).toEqual(['TRD0', 'TRD1'])
  })

  it('reports tone and the hottest sensor', () => {
    expect(thermalTone(50)).toBe('ok')
    expect(thermalTone(70)).toBe('warm')
    expect(thermalTone(90)).toBe('hot')
    expect(hottestSensor(sensors)?.code).toBe('TRD0')
    expect(hottestSensor([])).toBeNull()
    expect(buildSensorRows([])).toEqual({ cpu: [], gpu: [], other: [] })
  })
})

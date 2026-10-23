// @vitest-environment node
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { classifyHwmonSensor, createHwmonReader, readHwmonTree, readThermalZones } from '../hwmonReader'

let root: string

function chip(name: string, dir: string, files: Record<string, string>) {
  const full = path.join(root, 'hwmon', dir)
  fs.mkdirSync(full, { recursive: true })
  fs.writeFileSync(path.join(full, 'name'), `${name}\n`)
  for (const [file, value] of Object.entries(files)) fs.writeFileSync(path.join(full, file), `${value}\n`)
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'viezan-hwmon-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('hwmon reader', () => {
  it('reads temperatures and fans from every chip, in millidegrees and RPM', () => {
    chip('coretemp', 'hwmon2', { temp1_input: '52000', temp1_label: 'Package id 0', temp2_input: '48500', temp2_label: 'Core 0' })
    chip('amdgpu', 'hwmon1', { temp1_input: '61000', temp1_label: 'edge', fan1_input: '1820', fan1_min: '0', fan1_max: '3300' })
    chip('nvme', 'hwmon3', { temp1_input: '35000', temp1_label: 'Composite', temp2_input: '0' })

    const tree = readHwmonTree(path.join(root, 'hwmon'))
    expect(tree.sensors).toEqual([
      { id: 'hwmon:hwmon1:temp1', code: 'amdgpu/edge', group: 'gpu', label: 'gpu', name: 'edge', celsius: 61 },
      { id: 'hwmon:hwmon2:temp1', code: 'coretemp/Package id 0', group: 'cpu', label: 'cpu-package', name: 'Package id 0', celsius: 52 },
      { id: 'hwmon:hwmon2:temp2', code: 'coretemp/Core 0', group: 'cpu', label: 'cpu-core', name: 'Core 0', celsius: 48.5 },
      { id: 'hwmon:hwmon3:temp1', code: 'nvme/Composite', group: 'other', label: 'storage', name: 'Composite', celsius: 35 },
    ])
    expect(tree.fans).toEqual([{ id: 'hwmon:hwmon1:fan1', index: 0, rpm: 1820, minRpm: 0, maxRpm: 3300 }])
  })

  it('falls back to thermal zones when no hwmon chip has a temperature', async () => {
    chip('pwmfan', 'hwmon0', { fan1_input: '900' })
    const zone = path.join(root, 'thermal', 'thermal_zone0')
    fs.mkdirSync(zone, { recursive: true })
    fs.writeFileSync(path.join(zone, 'type'), 'cpu-thermal\n')
    fs.writeFileSync(path.join(zone, 'temp'), '47200\n')

    expect(readThermalZones(path.join(root, 'thermal'))).toEqual([
      { id: 'thermal:thermal_zone0', code: 'cpu-thermal', group: 'cpu', name: 'cpu-thermal', celsius: 47.2 },
    ])
    const reader = createHwmonReader({ hwmonRoot: path.join(root, 'hwmon'), thermalRoot: path.join(root, 'thermal'), now: () => 42 })
    expect(reader.probe()).toEqual({ supported: true, source: 'hwmon' })
    await expect(reader.read()).resolves.toEqual({
      timestamp: 42,
      source: 'hwmon',
      sensors: [{ id: 'thermal:thermal_zone0', code: 'cpu-thermal', group: 'cpu', name: 'cpu-thermal', celsius: 47.2 }],
      fans: [{ id: 'hwmon:hwmon0:fan1', index: 0, rpm: 900 }],
    })
  })

  it('reports no sensors when neither sysfs class exists', () => {
    const reader = createHwmonReader({ hwmonRoot: path.join(root, 'none'), thermalRoot: path.join(root, 'none2') })
    expect(reader.probe()).toMatchObject({ supported: false, reason: 'no-sensors' })
  })

  it('classifies chips by driver name', () => {
    expect(classifyHwmonSensor('k10temp', 'Tctl')).toEqual({ group: 'cpu', label: 'cpu-package' })
    expect(classifyHwmonSensor('iwlwifi_1', undefined)).toEqual({ group: 'other', label: 'wifi' })
    expect(classifyHwmonSensor('acpitz', undefined)).toEqual({ group: 'other', label: 'ambient' })
    expect(classifyHwmonSensor('mystery', undefined)).toEqual({ group: 'other' })
  })
})

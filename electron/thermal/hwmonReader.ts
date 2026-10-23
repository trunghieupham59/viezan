/**
 * Linux reader: the kernel's hwmon class under /sys/class/hwmon, with the thermal
 * zones under /sys/class/thermal as a fallback when no hwmon chip reports a
 * temperature. Plain file reads, no privileges.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ThermalFan, ThermalSensor, ThermalSensorGroup, ThermalSensorLabel, ThermalSnapshot, ThermalSupport } from '../../shared/thermalApi'
import type { ThermalReader } from './reader'

export interface HwmonReaderOptions {
  hwmonRoot?: string
  thermalRoot?: string
  now?: () => number
}

const CPU_CHIPS = ['coretemp', 'k10temp', 'zenpower', 'cpu_thermal', 'x86_pkg_temp', 'soc_thermal', 'cpu-thermal', 'soc-thermal']
const GPU_CHIPS = ['amdgpu', 'radeon', 'nouveau', 'nvidia', 'i915', 'xe', 'gpu_thermal', 'gpu-thermal']

/** Group by the driver (chip) name; label by the channel label where the convention is clear. */
export function classifyHwmonSensor(chip: string, channelLabel: string | undefined): { group: ThermalSensorGroup; label?: ThermalSensorLabel } {
  const name = chip.toLowerCase()
  const label = (channelLabel ?? '').toLowerCase()
  if (CPU_CHIPS.some((c) => name.startsWith(c))) {
    if (label.startsWith('core')) return { group: 'cpu', label: 'cpu-core' }
    if (label.startsWith('package') || label === 'tctl' || label === 'tdie') return { group: 'cpu', label: 'cpu-package' }
    return { group: 'cpu' }
  }
  if (GPU_CHIPS.some((c) => name.startsWith(c))) {
    return { group: 'gpu', label: label === 'edge' || label === '' ? 'gpu' : undefined }
  }
  if (name.startsWith('nvme') || name.includes('drivetemp')) return { group: 'other', label: 'storage' }
  if (name.includes('wifi') || name.startsWith('iwl') || name.startsWith('ath')) return { group: 'other', label: 'wifi' }
  if (name.startsWith('bat') || name.includes('battery')) return { group: 'other', label: 'battery' }
  if (name.startsWith('acpitz') || name.includes('ambient')) return { group: 'other', label: 'ambient' }
  return { group: 'other' }
}

function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8').trim()
  } catch {
    return null
  }
}

function readNumber(file: string): number | null {
  const text = readText(file)
  if (text === null || text === '') return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

function listDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir)
  } catch {
    return []
  }
}

/** Read every hwmon chip once. Exported for tests with a fake sysfs tree. */
export function readHwmonTree(hwmonRoot: string): { sensors: ThermalSensor[]; fans: ThermalFan[] } {
  const sensors: ThermalSensor[] = []
  const fans: ThermalFan[] = []
  let fanIndex = 0
  for (const entry of listDir(hwmonRoot).sort()) {
    const dir = path.join(hwmonRoot, entry)
    const chip = readText(path.join(dir, 'name')) ?? entry
    const files = listDir(dir)
    for (const file of files.filter((f) => /^temp\d+_input$/.test(f)).sort()) {
      const channel = file.replace('_input', '')
      const milli = readNumber(path.join(dir, file))
      if (milli === null) continue
      const celsius = Math.round(milli / 100) / 10
      if (celsius <= 0 || celsius >= 150) continue
      const name = readText(path.join(dir, `${channel}_label`)) ?? undefined
      const meaning = classifyHwmonSensor(chip, name)
      sensors.push({
        id: `hwmon:${entry}:${channel}`,
        code: `${chip}/${name ?? channel}`,
        group: meaning.group,
        ...(meaning.label ? { label: meaning.label } : {}),
        ...(name ? { name } : {}),
        celsius,
      })
    }
    for (const file of files.filter((f) => /^fan\d+_input$/.test(f)).sort()) {
      const channel = file.replace('_input', '')
      const rpm = readNumber(path.join(dir, file))
      if (rpm === null) continue
      const name = readText(path.join(dir, `${channel}_label`)) ?? undefined
      const minRpm = readNumber(path.join(dir, `${channel}_min`))
      const maxRpm = readNumber(path.join(dir, `${channel}_max`))
      fans.push({
        id: `hwmon:${entry}:${channel}`,
        index: fanIndex++,
        ...(name ? { name } : {}),
        rpm: Math.round(rpm),
        ...(minRpm !== null ? { minRpm: Math.round(minRpm) } : {}),
        ...(maxRpm !== null ? { maxRpm: Math.round(maxRpm) } : {}),
      })
    }
  }
  return { sensors, fans }
}

/** /sys/class/thermal/thermal_zone*: one temperature per zone, typed by `type`. */
export function readThermalZones(thermalRoot: string): ThermalSensor[] {
  const sensors: ThermalSensor[] = []
  for (const entry of listDir(thermalRoot).filter((e) => e.startsWith('thermal_zone')).sort()) {
    const dir = path.join(thermalRoot, entry)
    const milli = readNumber(path.join(dir, 'temp'))
    if (milli === null) continue
    const celsius = Math.round(milli / 100) / 10
    if (celsius <= 0 || celsius >= 150) continue
    const type = readText(path.join(dir, 'type')) ?? entry
    const meaning = classifyHwmonSensor(type, undefined)
    sensors.push({ id: `thermal:${entry}`, code: type, group: meaning.group, ...(meaning.label ? { label: meaning.label } : {}), name: type, celsius })
  }
  return sensors
}

export function createHwmonReader({ hwmonRoot = '/sys/class/hwmon', thermalRoot = '/sys/class/thermal', now = Date.now }: HwmonReaderOptions = {}): ThermalReader {
  return {
    probe: () => (fs.existsSync(hwmonRoot) || fs.existsSync(thermalRoot))
      ? { supported: true, source: 'hwmon' }
      : { supported: false, reason: 'no-sensors', detail: hwmonRoot },
    read: async () => {
      const tree = readHwmonTree(hwmonRoot)
      const sensors = tree.sensors.length > 0 ? tree.sensors : readThermalZones(thermalRoot)
      return { timestamp: now(), source: 'hwmon', sensors, fans: tree.fans }
    },
  }
}

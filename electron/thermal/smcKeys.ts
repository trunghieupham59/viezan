/**
 * Meaning of Apple SMC temperature keys. Keys are four characters; the second one
 * names the subsystem on most machines (C/p/e for CPU, G/g for GPU, B battery, W
 * wireless, a airflow/ambient, s skin ...). Exact keys differ per model, so the
 * table lists well-known keys and the classifier falls back to the subsystem letter.
 * Values are label ids the renderer localizes (shared/thermalApi.d.ts).
 */
import type { ThermalSensorGroup, ThermalSensorLabel } from '../../shared/thermalApi'

export interface SmcKeyMeaning {
  group: ThermalSensorGroup
  label?: ThermalSensorLabel
}

const KNOWN_KEYS: Readonly<Record<string, SmcKeyMeaning>> = {
  // Intel Macs
  TC0P: { group: 'cpu', label: 'cpu-proximity' },
  TC0D: { group: 'cpu', label: 'cpu-die' },
  TC0E: { group: 'cpu', label: 'cpu-die' },
  TC0F: { group: 'cpu', label: 'cpu-die' },
  TC0H: { group: 'cpu', label: 'cpu-package' },
  TCXC: { group: 'cpu', label: 'cpu-package' },
  TG0D: { group: 'gpu', label: 'gpu-die' },
  TG0P: { group: 'gpu', label: 'gpu-proximity' },
  TG0H: { group: 'gpu', label: 'gpu' },
  TM0P: { group: 'other', label: 'memory' },
  TA0P: { group: 'other', label: 'ambient' },
  TH0P: { group: 'other', label: 'storage' },
  TL0P: { group: 'other', label: 'display' },
  TPCD: { group: 'other', label: 'power' },
  TI0P: { group: 'other', label: 'thunderbolt' },
  TI1P: { group: 'other', label: 'thunderbolt' },
  // Apple Silicon
  TaLP: { group: 'other', label: 'airflow-left' },
  TaRF: { group: 'other', label: 'airflow-right' },
  Ts0P: { group: 'other', label: 'palm-rest' },
  Ts1P: { group: 'other', label: 'palm-rest' },
  TW0P: { group: 'other', label: 'wifi' },
  TB0T: { group: 'other', label: 'battery' },
  TB1T: { group: 'other', label: 'battery' },
  TB2T: { group: 'other', label: 'battery' },
  TH0a: { group: 'other', label: 'storage' },
  TH0b: { group: 'other', label: 'storage' },
  TH0x: { group: 'other', label: 'storage' },
}

/** Subsystem letter (second character) → group and, where it is unambiguous, a label. */
const SUBSYSTEM_LETTERS: Readonly<Record<string, SmcKeyMeaning>> = {
  p: { group: 'cpu', label: 'cpu-performance-core' },
  e: { group: 'cpu', label: 'cpu-efficiency-core' },
  C: { group: 'cpu', label: 'cpu-core' },
  c: { group: 'cpu', label: 'cpu-core' },
  G: { group: 'gpu', label: 'gpu' },
  g: { group: 'gpu', label: 'gpu' },
  f: { group: 'gpu', label: 'gpu' },
  B: { group: 'other', label: 'battery' },
  W: { group: 'other', label: 'wifi' },
  M: { group: 'other', label: 'memory' },
  m: { group: 'other', label: 'memory' },
  H: { group: 'other', label: 'storage' },
  L: { group: 'other', label: 'display' },
  s: { group: 'other', label: 'skin' },
  I: { group: 'other', label: 'thunderbolt' },
  P: { group: 'other', label: 'power' },
}

export function classifySmcKey(key: string): SmcKeyMeaning {
  const known = KNOWN_KEYS[key]
  if (known) return known
  const bySubsystem = SUBSYSTEM_LETTERS[key.charAt(1)]
  return bySubsystem ?? { group: 'other' }
}

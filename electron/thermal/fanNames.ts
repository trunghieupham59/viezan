/**
 * What a fan is, for people: its place or job ("left", "right", "CPU"). Intel Macs
 * describe fans in `F%dID`; Apple Silicon Macs do not, so a small model table fills
 * in the known layouts; Linux hwmon fans carry a driver label. The renderer localizes
 * the label; the raw description is kept as `name` for the unknown cases.
 */
import type { ThermalFanLabel } from '../../shared/thermalApi'

/** Model identifier prefix → fan layout by index. Two-fan MacBook Pros are left, right. */
const MODEL_LAYOUTS: ReadonlyArray<[RegExp, readonly ThermalFanLabel[]]> = [
  // Apple Silicon MacBook Pro 14"/16" (M1 Pro/Max, M2, M3, M4 families) and 16" Intel.
  [/^MacBookPro(1[5-9]|2\d),\d+$/, ['left', 'right']],
  [/^MacBookPro1[1-4],\d+$/, ['left', 'right']],
  // One-fan laptops.
  [/^MacBookAir\d+,\d+$/, ['main']],
  [/^MacBook\d+,\d+$/, ['main']],
  // Desktops: a single main fan unless the SMC says otherwise.
  [/^Macmini\d+,\d+$/, ['main']],
  [/^iMac\d+,\d+$/, ['main']],
  [/^Mac1[34],\d+$/, ['left', 'right']], // Mac Studio
]

const NAME_PATTERNS: ReadonlyArray<[RegExp, ThermalFanLabel]> = [
  [/left/i, 'left'],
  [/right/i, 'right'],
  [/cpu/i, 'cpu'],
  [/gpu|graphics/i, 'gpu'],
  [/exhaust|rear/i, 'exhaust'],
  [/intake|front/i, 'intake'],
  [/chassis|case|sys/i, 'chassis'],
  [/main|system/i, 'main'],
]

/** A label from the SMC / driver description, when the words make it obvious. */
export function classifyFanName(name: string | undefined): ThermalFanLabel | undefined {
  if (!name) return undefined
  for (const [pattern, label] of NAME_PATTERNS) if (pattern.test(name)) return label
  return undefined
}

/**
 * The best label for fan `index` of `count` on this machine: the description first,
 * then the model table (only when it lists as many fans as the machine has), else a
 * single fan is "main".
 */
export function fanLabelFor(options: { model?: string; index: number; count: number; name?: string }): ThermalFanLabel | undefined {
  const fromName = classifyFanName(options.name)
  if (fromName) return fromName
  if (options.model) {
    for (const [pattern, layout] of MODEL_LAYOUTS) {
      if (pattern.test(options.model) && layout.length === options.count) return layout[options.index]
    }
  }
  return options.count === 1 ? 'main' : undefined
}

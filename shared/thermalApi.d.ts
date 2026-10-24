/**
 * Thermal API — temperature sensors and fan speeds, read without privileges (macOS via
 * the bundled `viezan-smc` reader, Linux via sysfs hwmon), plus fan *control* through
 * the privileged helper on macOS (`fanControl`, capability `thermal.fan.write`).
 * Single source for `window.api.thermal`.
 */

export type ThermalSensorGroup = 'cpu' | 'gpu' | 'other'

export type ThermalSource = 'smc' | 'hwmon'

/**
 * Stable label ids for sensors whose meaning is known; the renderer localizes them.
 * Sensors without a known label show their `code` (an SMC key such as `Tp01`, or the
 * hwmon chip and channel).
 */
export type ThermalSensorLabel =
  | 'cpu-core'
  | 'cpu-performance-core'
  | 'cpu-efficiency-core'
  | 'cpu-die'
  | 'cpu-proximity'
  | 'cpu-package'
  | 'gpu'
  | 'gpu-die'
  | 'gpu-proximity'
  | 'memory'
  | 'battery'
  | 'wifi'
  | 'airflow-left'
  | 'airflow-right'
  | 'palm-rest'
  | 'storage'
  | 'ambient'
  | 'display'
  | 'power'
  | 'thunderbolt'
  | 'skin'

export interface ThermalSensor {
  /** Unique within a snapshot and stable across snapshots from the same machine. */
  id: string
  /** The raw identifier: SMC key, or `chip/channel` on hwmon. */
  code: string
  group: ThermalSensorGroup
  label?: ThermalSensorLabel
  /** Free-text name the driver reported (hwmon `temp*_label`), when there is one. */
  name?: string
  celsius: number
}

/** What a fan is, for people: its place or job. Localized by the renderer. */
export type ThermalFanLabel = 'left' | 'right' | 'main' | 'cpu' | 'gpu' | 'exhaust' | 'intake' | 'chassis'

export interface ThermalFan {
  id: string
  /** Zero-based position among the machine's fans. */
  index: number
  /** Raw description from the SMC (`F%dID`) or the hwmon driver, when there is one. */
  name?: string
  /** Known meaning, from the description or from the machine model. */
  label?: ThermalFanLabel
  rpm: number
  minRpm?: number
  maxRpm?: number
  targetRpm?: number
}

export interface ThermalSnapshot {
  /** Milliseconds since the epoch, taken when the reader produced the values. */
  timestamp: number
  source: ThermalSource
  sensors: ThermalSensor[]
  fans: ThermalFan[]
  /** Whole-machine CPU busy time since the previous sample, 0–100. Absent on the first sample. */
  cpuLoadPercent?: number
  /** Hardware model identifier (`MacBookPro18,2`), when the reader knows it. */
  model?: string
}

export type ThermalUnsupportedReason = 'unsupported-platform' | 'reader-missing' | 'no-sensors'

/**
 * Where a live reading can be shown outside the window: the macOS menu bar (a status
 * item of its own), the Windows/Linux system tray (the app's resident tray icon, as a
 * tooltip), or nowhere (no tray on this run).
 */
export type ThermalTrayPlacement = 'menu-bar' | 'tray' | 'none'

export interface ThermalSupport {
  supported: boolean
  source?: ThermalSource
  reason?: ThermalUnsupportedReason
  /** Human-oriented hint for logs and the notice (e.g. the missing reader path). */
  detail?: string
  /** Absent when sensors cannot be read at all. */
  trayPlacement?: ThermalTrayPlacement
}

/** Which reading the menu bar / tray shows. `cpu` and `gpu` fall back to the hottest sensor when the group is empty. */
export type ThermalTrayMetric = 'hottest' | 'cpu' | 'gpu'

/**
 * How the menu bar item is laid out. `inline` is text (`58° 2374`); `stacked` draws the
 * temperature over the fan speed in one icon-sized image, about half the width.
 * Stacked needs the fan speed and a menu bar; elsewhere it falls back to inline.
 */
export type ThermalTrayLayout = 'inline' | 'stacked'
/** Fan speed as the raw RPM (`2374`) or shortened (`2.4k`). */
export type ThermalTrayFanFormat = 'rpm' | 'short'

export interface ThermalTraySettings {
  /** Show a live reading in the menu bar / tray. Keeps sensors polled (slower) while the window is hidden. */
  enabled: boolean
  metric: ThermalTrayMetric
  /** Append the fastest fan's RPM after the temperature. */
  showFan: boolean
  layout: ThermalTrayLayout
  /** Keep the degree sign after the temperature (`58°` vs `58`). */
  showUnit: boolean
  fanFormat: ThermalTrayFanFormat
}

export interface ThermalFanControlSettings {
  /** The user read the first-run explanation and disclaimer of fan control. */
  acknowledged: boolean
}

// ── Fan ↔ sensor calibration ──────────────────────────────────────────────────────

export interface FanAffinitySensor {
  sensorId: string
  /** How much this sensor cooled (°C) while the fan ran at full speed. */
  cooling: number
  /** This fan's part of the sensor's total cooling across fans, 0–1. */
  share: number
  /** How much more this fan cooled the sensor than the best other fan (°C); large means the sensor is near this fan. */
  contrast?: number
}

export interface FanAffinity {
  /** A `ThermalFan.id`. */
  fanId: string
  /** Strongest cooling first. */
  sensors: FanAffinitySensor[]
}

export interface FanAffinityResult {
  calibratedAt: number
  model?: string
  fans: FanAffinity[]
}

export type FanCalibrationPhase = 'baseline' | 'spin' | 'settle'

export interface FanCalibrationState {
  status: 'idle' | 'running' | 'done' | 'cancelled' | 'error'
  fanIndex?: number
  fanCount?: number
  fanId?: string
  phase?: FanCalibrationPhase
  secondsLeft?: number
  /** 0–1 over the whole run. */
  progress?: number
  error?: string
  /** The last completed calibration, persisted. */
  result?: FanAffinityResult
}

export interface FanCalibrationApi {
  get: () => Promise<{ success: boolean; state?: FanCalibrationState; error?: string }>
  /** Needs the helper ready; runs for a few minutes, speeding fans up only. */
  start: () => Promise<{ success: boolean; state?: FanCalibrationState; error?: string }>
  cancel: () => Promise<{ success: boolean; state?: FanCalibrationState; error?: string }>
  /** Forget the result. */
  clear: () => Promise<{ success: boolean; state?: FanCalibrationState; error?: string }>
  onState: (cb: (state: FanCalibrationState) => void) => () => void
}

export interface ThermalFanProfilesSettings {
  /** The profile chosen last (`builtin:…` or `user:…`); re-applied when the helper comes up. null = none / custom. */
  activeId: string | null
  /** Profiles the user saved from the current fan state. */
  user: FanProfile[]
}

/** Per-module settings owned by the main process (`thermal.json` under userData). */
export interface ThermalSettings {
  tray: ThermalTraySettings
  fanControl: ThermalFanControlSettings
  fanProfiles: ThermalFanProfilesSettings
  /** Last fan ↔ sensor calibration, or null. */
  fanAffinity: FanAffinityResult | null
}

/** A partial update; omitted fields keep their value. */
export interface ThermalSettingsPatch {
  tray?: Partial<ThermalTraySettings>
  fanControl?: Partial<ThermalFanControlSettings>
  fanProfiles?: Partial<ThermalFanProfilesSettings>
  fanAffinity?: FanAffinityResult | null
}

// ── Fan control (phase 2: privileged helper, macOS) ──────────────────────────────

/**
 * Where the privileged helper stands:
 * `unsupported` (not macOS), `missing` (helper binary not found beside the app),
 * `idle` (available, not running or not connected), `starting` (administrator prompt
 * / connecting), `ready` (connected, fans can be driven), `error` (last attempt failed;
 * see `error`).
 */
export type FanControlHelperState = 'unsupported' | 'missing' | 'idle' | 'starting' | 'ready' | 'error'

/**
 * `auto`: the system drives the fan. `fixed`: one target RPM. `sensor`: the app sets
 * the target from one temperature sensor — minimum speed at `minCelsius` and below,
 * maximum speed at `maxCelsius` and above, linear in between (re-evaluated on every
 * reading, applied to the helper as fixed targets).
 */
export type FanMode = 'auto' | 'fixed' | 'sensor'

export interface FanSensorRule {
  /**
   * The temperature source: `group:cpu` / `group:gpu` / `group:other` / `group:all`
   * (hottest sensor of the group or of the machine), `label:<ThermalSensorLabel>`
   * (hottest sensor with that meaning), `affinity:fanN` (hottest of the sensors the
   * calibration found that fan cools), or one raw `ThermalSensor.id` (`smc:Tp01`).
   */
  sensorId: string
  minCelsius: number
  maxCelsius: number
}

export interface FanControlFan {
  /** Same id as the matching `ThermalFan` (`smc:fan0`). */
  id: string
  index: number
  mode: FanMode
  /** Present while `mode` is `fixed` or `sensor` (the target the app last applied). */
  targetRpm?: number
  /** Present while `mode` is `sensor`. */
  sensor?: FanSensorRule
  /** The source sensor's latest reading while `mode` is `sensor`; absent when the sensor is not in the current snapshot. */
  sensorCelsius?: number
  minRpm: number
  maxRpm: number
  currentRpm: number
}

export interface FanControlState {
  helper: FanControlHelperState
  helperVersion?: string
  /** Why the last enable/command failed, when `helper` is `error`. */
  error?: string
  /** The helper's own last safety restore (`watchdog`, `ceiling`, `sleep`, `wake`, `disconnect`), when any. */
  lastRestoreReason?: string
  fans: FanControlFan[]
}

export type FanCommand = { mode: 'auto' } | { mode: 'fixed'; rpm: number } | ({ mode: 'sensor' } & FanSensorRule)

// ── Fan profiles ─────────────────────────────────────────────────────────────────

/**
 * One fan's setting inside a profile: a concrete command, or — for built-in profiles
 * that must work on any Mac — a rule on a sensor *group*, resolved to a real sensor of
 * this machine when the profile is applied.
 */
export type FanProfileEntry =
  | FanCommand
  | { mode: 'sensor-group'; group: ThermalSensorGroup; minCelsius: number; maxCelsius: number }

export interface FanProfile {
  /** `builtin:<key>` (localized by the renderer) or `user:<id>`. */
  id: string
  /** The user's name for a saved profile; built-ins carry an English fallback. */
  name: string
  builtin: boolean
  /** Fan id → entry. The key `*` covers every fan without an entry of its own. */
  fans: Record<string, FanProfileEntry>
}

export interface FanProfilesState {
  /** Same as the persisted choice. */
  activeId: string | null
  /** True while `activeId` is what the helper currently runs; false while the helper is off or after a manual tweak. */
  applied: boolean
  /** Built-in profiles first, then the user's. */
  profiles: FanProfile[]
}

export interface FanProfilesApi {
  get: () => Promise<{ success: boolean; state?: FanProfilesState; error?: string }>
  /** Apply a profile to every fan (helper must be ready) and remember it. */
  apply: (id: string) => Promise<{ success: boolean; state?: FanProfilesState; error?: string }>
  /** Save the current per-fan settings as a new user profile and make it active. */
  saveCurrent: (name: string) => Promise<{ success: boolean; state?: FanProfilesState; error?: string }>
  /** Delete a user profile. */
  remove: (id: string) => Promise<{ success: boolean; state?: FanProfilesState; error?: string }>
  onState: (cb: (state: FanProfilesState) => void) => () => void
}

export interface FanControlApi {
  getState: () => Promise<{ success: boolean; state?: FanControlState; error?: string }>
  /** Start the helper (administrator prompt) if needed and connect. Resolves with the new state either way. */
  enable: () => Promise<{ success: boolean; state?: FanControlState; error?: string }>
  setFan: (fanId: string, command: FanCommand) => Promise<{ success: boolean; state?: FanControlState; error?: string }>
  /** Every fan back to automatic control; the helper stays connected. */
  restoreAll: () => Promise<{ success: boolean; state?: FanControlState; error?: string }>
  /** Restore every fan and drop the helper; it exits by itself shortly after. */
  disable: () => Promise<{ success: boolean; state?: FanControlState; error?: string }>
  onState: (cb: (state: FanControlState) => void) => () => void
  profiles: FanProfilesApi
  calibration: FanCalibrationApi
}

export interface ThermalApi {
  getSupport: () => Promise<{ success: boolean; support?: ThermalSupport; error?: string }>
  /** One snapshot now. */
  read: () => Promise<{ success: boolean; snapshot?: ThermalSnapshot; error?: string }>
  /** Start or stop periodic snapshots pushed through `onSnapshot`. Stops by itself when the module is turned off. */
  setMonitoring: (active: boolean) => Promise<{ success: boolean; error?: string }>
  onSnapshot: (cb: (snapshot: ThermalSnapshot) => void) => () => void
  onError: (cb: (error: { message: string }) => void) => () => void
  getSettings: () => Promise<{ success: boolean; settings?: ThermalSettings; error?: string }>
  /** Validated in main; resolves with the full settings after the change was applied and saved. */
  updateSettings: (patch: ThermalSettingsPatch) => Promise<{ success: boolean; settings?: ThermalSettings; error?: string }>
  /** Fired after main applied a settings change from any source (Settings UI, tray menu). */
  onSettingsChanged: (cb: (settings: ThermalSettings) => void) => () => void
  fanControl: FanControlApi
}

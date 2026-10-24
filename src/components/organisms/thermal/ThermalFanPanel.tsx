import { type FormEvent, useId, useMemo, useState } from 'react'
import type { FanCalibrationState, FanCommand, FanControlFan, FanControlState, FanProfile, FanProfilesState, FanSensorRule, ThermalFan } from '../../../../shared/thermalApi'
import { Button, Input, Meter, ProgressBar, XIcon } from '../../ui/atoms'
import { DialogShell, FilterInput, NumberField, SelectField, type SelectFieldOption, SliderField } from '../../ui/molecules'

/** A temperature source a fan may follow: a group (`group:cpu`), a meaning (`label:…`) or one raw sensor. */
export interface ThermalFanSourceOption {
  /** The rule's `sensorId`. */
  id: string
  label: string
  /** Current reading, shown beside the label. */
  value?: string
}

/** One raw sensor for the advanced picker. */
export interface ThermalFanRawSensor {
  id: string
  code: string
  label: string
  value: string
}

export interface ThermalFanSources {
  /** `affinity:fanN` per fan (only after a calibration): first in that fan's picker. */
  affinity: Readonly<Record<string, ThermalFanSourceOption>>
  /** `group:*` entries, first in the picker. */
  groups: readonly ThermalFanSourceOption[]
  /** `label:*` entries (one per meaning present on this machine). */
  kinds: readonly ThermalFanSourceOption[]
  /** Every raw sensor, for the advanced dialog. */
  raw: readonly ThermalFanRawSensor[]
}

export interface ThermalFanPanelLabels {
  title: string
  empty: string
  restoreAll: string
  /** Shown in place of the mode switch while the helper is not driving the fans. */
  modeSystem: string
  modeAuto: string
  modeFixed: string
  modeSensor: string
  targetLabel: string
  sensorSource: string
  sensorLow: string
  sensorHigh: string
  sensorNow: (celsius: string, rpm: string) => string
  sensorMissing: string
  sourceGroups: string
  sourceKinds: string
  sourceAdvanced: string
  sourceDialogTitle: string
  sourceDialogDescription: string
  sourceFilter: string
  sourceFilterClear: string
  sourceNoMatch: string
  /** Receives the raw key when the rule follows one specific sensor. */
  sourceRaw: (code: string) => string
  sourceClose: string
  /** Tooltip of the target mark on the speed meter; receives the target in RPM. */
  targetTitle: (rpm: number) => string
  /** Units after the number boxes. */
  unitRpm: string
  unitCelsius: string
  profileLabel: string
  profileCustom: string
  profileSave: string
  profileNamePlaceholder: string
  profileSaveConfirm: string
  profileSaveCancel: string
  profileDelete: (name: string) => string
  profileName: (profile: FanProfile) => string
  profileDescription: (profile: FanProfile) => string | undefined
  calibrateCancel: string
  /** Accessible name of the calibration progress bar. */
  calibrateTitle: string
  /** Progress line while calibrating. */
  calibrateProgress: (state: FanCalibrationState) => string
}

export interface ThermalFanPanelProps {
  /** Live readings from the snapshot. */
  fans: readonly ThermalFan[]
  /** Control state, or null where fan control does not exist (Linux). */
  control: FanControlState | null
  profiles: FanProfilesState | null
  calibration: FanCalibrationState | null
  sources: ThermalFanSources
  labels: ThermalFanPanelLabels
  nameFor: (fan: Pick<ThermalFan, 'index' | 'name'>) => string
  formatRpm: (rpm: number) => string
  formatCelsius: (celsius: number) => string
  busy?: boolean
  onRestoreAll: () => void
  onCancelCalibration: () => void
  onSetFan: (fanId: string, command: FanCommand) => void
  onApplyProfile: (id: string) => void
  onSaveProfile: (name: string) => void
  onRemoveProfile: (id: string) => void
}

/** Targets snap to this step (also the slider step). */
export const FAN_RPM_STEP = 50
/** Temperature bounds of a sensor rule; mirror `electron/thermal/fanCurve.ts`. */
export const FAN_SENSOR_MIN_CELSIUS = 20
export const FAN_SENSOR_MAX_CELSIUS = 110
/** Starting rule when a fan is first switched to a sensor: follow the hottest CPU sensor. */
export const DEFAULT_SENSOR_RULE = { sensorId: 'group:cpu', minCelsius: 50, maxCelsius: 90 }

const CUSTOM_PROFILE = 'custom'
const ADVANCED_SOURCE = '__advanced'

function clampRpm(range: { minRpm: number; maxRpm: number }, rpm: number): number {
  const snapped = Math.round(rpm / FAN_RPM_STEP) * FAN_RPM_STEP
  return Math.max(range.minRpm, Math.min(range.maxRpm, snapped))
}

function ModeButton({ active, label, disabled, onClick }: { active: boolean; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <Button
      size="sm"
      shape="pill"
      variant={active ? 'primary' : 'neutral'}
      appearance={active ? 'soft' : 'ghost'}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

interface RawSensorDialogProps {
  raw: readonly ThermalFanRawSensor[]
  current: string | null
  labels: ThermalFanPanelLabels
  onPick: (id: string) => void
  onClose: () => void
}

/** The advanced picker: every raw sensor behind a filter box, one click to follow it. */
function RawSensorDialog({ raw, current, labels, onPick, onClose }: RawSensorDialogProps) {
  const [filter, setFilter] = useState('')
  const needle = filter.trim().toLowerCase()
  const matches = useMemo(() => (needle ? raw.filter((sensor) => `${sensor.label} ${sensor.code}`.toLowerCase().includes(needle)) : raw), [raw, needle])
  return (
    <DialogShell label={labels.sourceDialogTitle} title={labels.sourceDialogTitle} subtitle={labels.sourceDialogDescription} closeLabel={labels.sourceClose} onClose={onClose} size="sm">
      <div className="thermal-raw">
        <FilterInput value={filter} onValueChange={setFilter} placeholder={labels.sourceFilter} clearLabel={labels.sourceFilterClear} size="sm" autoFocus aria-label={labels.sourceFilter} />
        {matches.length === 0 ? (
          <p className="thermal-empty">{labels.sourceNoMatch}</p>
        ) : (
          <ul className="thermal-raw__list">
            {matches.map((sensor) => (
              <li key={sensor.id}>
                <button
                  type="button"
                  className="thermal-raw__item"
                  aria-pressed={sensor.id === current}
                  onClick={() => onPick(sensor.id)}
                >
                  <span className="thermal-raw__label">{sensor.label}</span>
                  <span className="thermal-raw__code">{sensor.code}</span>
                  <span className="thermal-raw__value">{sensor.value}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DialogShell>
  )
}

interface FanRowProps {
  fan: ThermalFan
  controlled: FanControlFan | undefined
  ready: boolean
  name: string
  sources: ThermalFanSources
  labels: ThermalFanPanelLabels
  formatRpm: (rpm: number) => string
  formatCelsius: (celsius: number) => string
  busy: boolean
  onSetFan: (fanId: string, command: FanCommand) => void
}

/**
 * One fan: name and live speed, a meter from its minimum to its maximum with the
 * current speed filled and the app's target marked, and (while the helper runs)
 * its mode and parameters.
 */
function FanRow({ fan, controlled, ready, name, sources, labels, formatRpm, formatCelsius, busy, onSetFan }: FanRowProps) {
  const range = { minRpm: controlled?.minRpm ?? fan.minRpm ?? 0, maxRpm: controlled?.maxRpm ?? fan.maxRpm ?? Math.max(fan.rpm, 1) }
  const mode = ready && controlled ? controlled.mode : 'auto'
  const committed = controlled?.targetRpm ?? clampRpm(range, fan.rpm)
  // The target mark only means something while the app holds the fan; a stopped fan (0 RPM at idle) still reads correctly as empty.
  const target = ready && controlled && mode !== 'auto' ? controlled.targetRpm : undefined
  const rule = controlled?.sensor ?? null
  const [advancedOpen, setAdvancedOpen] = useState(false)
  // A rule on one raw sensor is shown as its own option so the picker never looks empty.
  const rawCurrent = rule && !rule.sensorId.startsWith('affinity:') && !sources.groups.some((o) => o.id === rule.sensorId) && !sources.kinds.some((o) => o.id === rule.sensorId)
    ? sources.raw.find((sensor) => sensor.id === rule.sensorId) ?? null
    : null
  const affinityOption = sources.affinity[fan.id]
  const sourceOptions: SelectFieldOption[] = [
    ...(affinityOption ? [{ value: affinityOption.id, label: affinityOption.label, description: affinityOption.value }] : []),
    ...sources.groups.map((o) => ({ value: o.id, label: o.label, description: o.value })),
    ...sources.kinds.map((o) => ({ value: o.id, label: o.label, description: o.value })),
    ...(rawCurrent ? [{ value: rawCurrent.id, label: labels.sourceRaw(rawCurrent.code), description: rawCurrent.value }] : rule && !sources.raw.some((s) => s.id === rule.sensorId) && !sources.groups.some((o) => o.id === rule.sensorId) && !sources.kinds.some((o) => o.id === rule.sensorId) ? [{ value: rule.sensorId, label: labels.sourceRaw(rule.sensorId) }] : []),
    { value: ADVANCED_SOURCE, label: labels.sourceAdvanced },
  ]
  const sourceKnown = rule ? sourceOptions.some((o) => o.value === rule.sensorId && o.value !== ADVANCED_SOURCE) : true
  const commitRule = (next: FanSensorRule) => { if (next.minCelsius < next.maxCelsius) onSetFan(fan.id, { mode: 'sensor', ...next }) }
  const initialRule = (): FanSensorRule => rule ?? { ...DEFAULT_SENSOR_RULE, ...(affinityOption ? { sensorId: affinityOption.id } : {}) }

  return (
    <li className="thermal-fan" data-mode={ready ? mode : 'system'}>
      <div className="thermal-fan__main">
        <div className="thermal-fan__identity">
          <span className="thermal-fan__name">{name}</span>
          <span className="thermal-fan__current">{formatRpm(fan.rpm)}</span>
        </div>
        {ready && controlled ? (
          <fieldset className="thermal-fan__modes">
            <legend className="sr-only">{name}</legend>
            <ModeButton active={mode === 'auto'} label={labels.modeAuto} disabled={busy} onClick={() => onSetFan(fan.id, { mode: 'auto' })} />
            <ModeButton active={mode === 'fixed'} label={labels.modeFixed} disabled={busy} onClick={() => onSetFan(fan.id, { mode: 'fixed', rpm: committed })} />
            <ModeButton active={mode === 'sensor'} label={labels.modeSensor} disabled={busy} onClick={() => commitRule(initialRule())} />
          </fieldset>
        ) : (
          <span className="thermal-fan__system">{labels.modeSystem}</span>
        )}
      </div>
      <div className="thermal-fan__meter-row">
        <span className="thermal-fan__bound">{formatRpm(range.minRpm)}</span>
        <Meter
          label={name}
          value={fan.rpm}
          min={range.minRpm}
          max={range.maxRpm}
          valueText={formatRpm(fan.rpm)}
          emphasis={ready && mode !== 'auto' ? 'action' : 'neutral'}
          marker={target !== undefined ? { value: target, title: labels.targetTitle(target) } : undefined}
        />
        <span className="thermal-fan__bound">{formatRpm(range.maxRpm)}</span>
      </div>

      {ready && controlled && mode === 'fixed' && (
        <div className="thermal-fan__params">
          <SliderField
            label={labels.targetLabel}
            value={committed}
            min={range.minRpm}
            max={range.maxRpm}
            step={FAN_RPM_STEP}
            unit={labels.unitRpm}
            disabled={busy}
            onCommit={(rpm) => onSetFan(fan.id, { mode: 'fixed', rpm })}
          />
        </div>
      )}

      {ready && controlled && mode === 'sensor' && rule && (
        <div className="thermal-fan__params">
          <SelectField
            className="thermal-fan__sensor"
            label={labels.sensorSource}
            value={rule.sensorId}
            options={sourceOptions}
            disabled={busy}
            onChange={(sensorId) => { if (sensorId === ADVANCED_SOURCE) setAdvancedOpen(true); else commitRule({ ...rule, sensorId }) }}
          />
          {advancedOpen && (
            <RawSensorDialog
              raw={sources.raw}
              current={rule.sensorId}
              labels={labels}
              onPick={(sensorId) => { setAdvancedOpen(false); commitRule({ ...rule, sensorId }) }}
              onClose={() => setAdvancedOpen(false)}
            />
          )}
          <div className="thermal-fan__thresholds">
            <NumberField
              label={labels.sensorLow}
              value={rule.minCelsius}
              min={FAN_SENSOR_MIN_CELSIUS}
              max={Math.max(FAN_SENSOR_MIN_CELSIUS, rule.maxCelsius - 1)}
              unit={labels.unitCelsius}
              disabled={busy}
              onCommit={(minCelsius) => commitRule({ ...rule, minCelsius })}
            />
            <NumberField
              label={labels.sensorHigh}
              value={rule.maxCelsius}
              min={Math.min(FAN_SENSOR_MAX_CELSIUS, rule.minCelsius + 1)}
              max={FAN_SENSOR_MAX_CELSIUS}
              unit={labels.unitCelsius}
              disabled={busy}
              onCommit={(maxCelsius) => commitRule({ ...rule, maxCelsius })}
            />
          </div>
          <p className="thermal-fan__now">
            {controlled.sensorCelsius !== undefined && controlled.targetRpm !== undefined
              ? labels.sensorNow(formatCelsius(controlled.sensorCelsius), formatRpm(controlled.targetRpm))
              : sourceKnown ? '' : labels.sensorMissing}
          </p>
        </div>
      )}
    </li>
  )
}

interface ProfileRowProps {
  profiles: FanProfilesState
  labels: ThermalFanPanelLabels
  disabled: boolean
  onApply: (id: string) => void
  onSave: (name: string) => void
  onRemove: (id: string) => void
}

function ProfileRow({ profiles, labels, disabled, onApply, onSave, onRemove }: ProfileRowProps) {
  const nameId = useId()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const activeId = profiles.applied && profiles.activeId ? profiles.activeId : CUSTOM_PROFILE
  const active = profiles.profiles.find((profile) => profile.id === activeId)
  const options: SelectFieldOption[] = [
    { value: CUSTOM_PROFILE, label: labels.profileCustom, disabled: true },
    ...profiles.profiles.map((profile) => ({ value: profile.id, label: labels.profileName(profile), description: labels.profileDescription(profile) })),
  ]
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSave(trimmed)
    setName('')
    setSaving(false)
  }
  return (
    <>
      <SelectField
        className="thermal-profiles__select"
        label={labels.profileLabel}
        value={activeId}
        options={options}
        disabled={disabled}
        onChange={(id) => { if (id !== CUSTOM_PROFILE) onApply(id) }}
      />
      {active && !active.builtin && (
        <Button
          size="sm"
          shape="icon"
          variant="danger"
          appearance="ghost"
          aria-label={labels.profileDelete(labels.profileName(active))}
          title={labels.profileDelete(labels.profileName(active))}
          disabled={disabled}
          onClick={() => onRemove(active.id)}
        >
          <XIcon />
        </Button>
      )}
      {saving ? (
        <form className="thermal-profiles__form" onSubmit={submit}>
          <label htmlFor={nameId} className="sr-only">{labels.profileNamePlaceholder}</label>
          <Input id={nameId} size="sm" value={name} maxLength={40} placeholder={labels.profileNamePlaceholder} disabled={disabled} autoFocus onChange={(event) => setName(event.currentTarget.value)} />
          <Button size="sm" shape="rect" variant="primary" appearance="solid" type="submit" disabled={disabled || name.trim().length === 0}>{labels.profileSaveConfirm}</Button>
          <Button size="sm" shape="rect" variant="neutral" appearance="ghost" type="button" onClick={() => { setSaving(false); setName('') }}>{labels.profileSaveCancel}</Button>
        </form>
      ) : (
        <Button size="sm" shape="rect" variant="neutral" appearance="outline" disabled={disabled} onClick={() => setSaving(true)}>
          {labels.profileSave}
        </Button>
      )}
    </>
  )
}

/**
 * The fan panel of the Thermal page: a panel toolbar with the title, the profile
 * picker and "back to automatic", then one row per fan with its live speed on a
 * meter between its bounds and, while the helper runs, the mode switch and
 * parameters inline. The helper's own status and on/off live in the page's
 * command bar. Props-driven.
 */
export function ThermalFanPanel({ fans, control, profiles, calibration, sources, labels, nameFor, formatRpm, formatCelsius, busy = false, onRestoreAll, onCancelCalibration, onSetFan, onApplyProfile, onSaveProfile, onRemoveProfile }: ThermalFanPanelProps) {
  const titleId = useId()
  const ready = control?.helper === 'ready'
  const anyOverride = control?.fans.some((fan) => fan.mode !== 'auto') ?? false
  const calibrating = calibration?.status === 'running'

  return (
    <section className="glass-panel thermal-panel" aria-labelledby={titleId}>
      <div className="live-panel-toolbar">
        <div className="live-toolbar-start">
          <h2 id={titleId} className="live-panel-title">{labels.title}</h2>
          {ready && profiles && (
            <ProfileRow profiles={profiles} labels={labels} disabled={busy} onApply={onApplyProfile} onSave={onSaveProfile} onRemove={onRemoveProfile} />
          )}
        </div>
        {ready && (
          <div className="live-toolbar-end">
            <Button size="sm" shape="rect" variant="neutral" appearance="outline" disabled={busy || calibrating || !anyOverride} onClick={onRestoreAll}>
              {labels.restoreAll}
            </Button>
          </div>
        )}
      </div>
      {ready && calibrating && calibration && (
        <div className="thermal-calibration" role="status">
          <ProgressBar className="thermal-calibration__bar" label={labels.calibrateTitle} value={calibration.progress ?? 0} max={1} valueText={labels.calibrateProgress(calibration)} />
          <span className="thermal-calibration__text">{labels.calibrateProgress(calibration)}</span>
          <Button size="xs" shape="rect" variant="danger" appearance="ghost" disabled={busy} onClick={onCancelCalibration}>{labels.calibrateCancel}</Button>
        </div>
      )}
      <div className="thermal-panel__body">
        {fans.length === 0 ? (
          <p className="thermal-empty">{labels.empty}</p>
        ) : (
          <ul className="thermal-fans">
            {fans.map((fan) => (
              <FanRow
                key={fan.id}
                fan={fan}
                controlled={control?.fans.find((candidate) => candidate.id === fan.id)}
                ready={ready}
                name={nameFor(fan)}
                sources={sources}
                labels={labels}
                formatRpm={formatRpm}
                formatCelsius={formatCelsius}
                busy={busy || calibrating}
                onSetFan={onSetFan}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

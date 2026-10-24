import { useId } from 'react'
import type { ThermalTrayMetric, ThermalTrayPlacement, ThermalTraySettings } from '../../../../shared/thermalApi'
import { ToggleSwitch } from '../../ui/atoms'
import { ConfigSection, SelectField, type SelectFieldOption } from '../../ui/molecules'

export interface ThermalTrayOptionsLabels {
  /** Section title: "Menu bar" or "System tray", chosen by the caller from the placement. */
  title: string
  enable: string
  enableDescription: string
  metric: string
  metricOptions: Record<ThermalTrayMetric, string>
  showFan: string
}

export interface ThermalTrayOptionsProps {
  placement: Exclude<ThermalTrayPlacement, 'none'>
  settings: ThermalTraySettings
  labels: ThermalTrayOptionsLabels
  /** Disables every control while a change is being applied. */
  busy?: boolean
  onChange: (patch: Partial<ThermalTraySettings>) => void
}

const METRICS: readonly ThermalTrayMetric[] = ['hottest', 'cpu', 'gpu']

/**
 * Live reading outside the window: the master switch plus, while it is on, which
 * reading to show and whether to append the fan speed. One `ConfigSection` of the
 * options popover, so it lines up with the sections beside it. Props-driven; the
 * page owns the settings round-trip with main.
 */
export function ThermalTrayOptions({ placement, settings, labels, busy = false, onChange }: ThermalTrayOptionsProps) {
  const sectionId = useId()
  const enableId = useId()
  const enableDescId = useId()
  const fanId = useId()
  const metricOptions: SelectFieldOption[] = METRICS.map((metric) => ({ value: metric, label: labels.metricOptions[metric] }))

  return (
    <ConfigSection id={sectionId} title={labels.title}>
      <div className="thermal-options__card" data-placement={placement}>
        <div className="thermal-options__row">
          <div className="thermal-options__text">
            <p id={enableId} className="thermal-options__label">{labels.enable}</p>
            <p id={enableDescId} className="thermal-options__desc">{labels.enableDescription}</p>
          </div>
          <ToggleSwitch
            checked={settings.enabled}
            disabled={busy}
            onChange={(enabled) => onChange({ enabled })}
            aria-labelledby={enableId}
            aria-describedby={enableDescId}
          />
        </div>
        {settings.enabled && (
          <div className="thermal-options__row thermal-options__row--details">
            <SelectField
              className="thermal-options__metric"
              label={labels.metric}
              value={settings.metric}
              options={metricOptions}
              disabled={busy}
              onChange={(value) => onChange({ metric: value as ThermalTrayMetric })}
            />
            <div className="thermal-options__fan">
              <p id={fanId} className="thermal-options__label">{labels.showFan}</p>
              <ToggleSwitch
                checked={settings.showFan}
                disabled={busy}
                onChange={(showFan) => onChange({ showFan })}
                aria-labelledby={fanId}
              />
            </div>
          </div>
        )}
      </div>
    </ConfigSection>
  )
}

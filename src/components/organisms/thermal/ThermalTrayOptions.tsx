import { useId } from 'react'
import type { ThermalTrayFanFormat, ThermalTrayLayout, ThermalTrayMetric, ThermalTrayPlacement, ThermalTraySettings } from '../../../../shared/thermalApi'
import type { TrayPreview } from '../../../utils/trayPreview'
import { Button, ToggleSwitch } from '../../ui/atoms'
import { ConfigSection, SelectField, type SelectFieldOption } from '../../ui/molecules'

export interface ThermalTrayOptionsLabels {
  /** Section title: "Menu bar" or "System tray", chosen by the caller from the placement. */
  title: string
  enable: string
  enableDescription: string
  metric: string
  metricOptions: Record<ThermalTrayMetric, string>
  showFan: string
  layout: string
  layoutOptions: Record<ThermalTrayLayout, string>
  fanFormat: string
  fanFormatOptions: Record<ThermalTrayFanFormat, string>
  showUnit: string
  preview: string
}

export interface ThermalTrayOptionsProps {
  placement: Exclude<ThermalTrayPlacement, 'none'>
  settings: ThermalTraySettings
  /** What the item shows for the current reading; null before the first reading. */
  preview: TrayPreview | null
  labels: ThermalTrayOptionsLabels
  /** Disables every control while a change is being applied. */
  busy?: boolean
  onChange: (patch: Partial<ThermalTraySettings>) => void
}

const METRICS: readonly ThermalTrayMetric[] = ['hottest', 'cpu', 'gpu']
const LAYOUTS: readonly ThermalTrayLayout[] = ['inline', 'stacked']
const FAN_FORMATS: readonly ThermalTrayFanFormat[] = ['rpm', 'short']

/**
 * Live reading outside the window: the master switch plus, while it is on, which
 * reading to show, whether to append the fan speed, how to lay the two out (one
 * line of text, or stacked in one narrow image on the menu bar), the fan speed
 * format, the degree sign, and a preview of the result. One `ConfigSection` of the
 * options popover. Props-driven; the page owns the settings round-trip with main.
 */
export function ThermalTrayOptions({ placement, settings, preview, labels, busy = false, onChange }: ThermalTrayOptionsProps) {
  const sectionId = useId()
  const enableId = useId()
  const enableDescId = useId()
  const fanId = useId()
  const unitId = useId()
  const metricOptions: SelectFieldOption[] = METRICS.map((metric) => ({ value: metric, label: labels.metricOptions[metric] }))
  const fanFormatOptions: SelectFieldOption[] = FAN_FORMATS.map((format) => ({ value: format, label: labels.fanFormatOptions[format] }))
  // Stacking needs two lines and a menu bar; the tooltip on Windows/Linux has no layout.
  const canStack = placement === 'menu-bar' && settings.showFan
  const previewText = preview ? [preview.temperature, preview.fan].filter((part) => part !== null).join(' ') : ''

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
          <>
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
            <div className="thermal-options__row thermal-options__row--details">
              {canStack && (
                <fieldset className="thermal-options__layout">
                  <legend className="thermal-options__label">{labels.layout}</legend>
                  {LAYOUTS.map((layout) => (
                    <Button
                      key={layout}
                      size="sm"
                      shape="pill"
                      variant={settings.layout === layout ? 'primary' : 'neutral'}
                      appearance={settings.layout === layout ? 'soft' : 'ghost'}
                      aria-pressed={settings.layout === layout}
                      disabled={busy}
                      onClick={() => onChange({ layout })}
                    >
                      {labels.layoutOptions[layout]}
                    </Button>
                  ))}
                </fieldset>
              )}
              {settings.showFan && (
                <SelectField
                  className="thermal-options__metric"
                  label={labels.fanFormat}
                  value={settings.fanFormat}
                  options={fanFormatOptions}
                  disabled={busy}
                  onChange={(value) => onChange({ fanFormat: value as ThermalTrayFanFormat })}
                />
              )}
              <div className="thermal-options__fan">
                <p id={unitId} className="thermal-options__label">{labels.showUnit}</p>
                <ToggleSwitch
                  checked={settings.showUnit}
                  disabled={busy}
                  onChange={(showUnit) => onChange({ showUnit })}
                  aria-labelledby={unitId}
                />
              </div>
            </div>
            <div className="thermal-options__row thermal-options__row--preview">
              <p className="thermal-options__label">{labels.preview}</p>
              <output className="thermal-tray-preview" data-stacked={preview?.stacked || undefined} aria-label={labels.preview}>
                {preview?.stacked ? (
                  <>
                    <span className="thermal-tray-preview__line">{preview.temperature}</span>
                    <span className="thermal-tray-preview__line">{preview.fan}</span>
                  </>
                ) : (
                  <span className="thermal-tray-preview__text">{previewText || '…'}</span>
                )}
              </output>
            </div>
          </>
        )}
      </div>
    </ConfigSection>
  )
}

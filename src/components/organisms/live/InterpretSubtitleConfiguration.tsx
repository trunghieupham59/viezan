import { useId } from 'react'
import { useT } from '../../../store/useAppStore'
import type { SubtitleSettings } from '../../../types'
import { Button } from '../../ui/atoms'
import { SubtitlesIcon } from '../../ui/icons'
import { ToggleSwitch } from '../../ui/ToggleSwitch'

export interface SubtitleColorOption {
  label: string
  value: string
}

export interface SubtitleFontSizeOption {
  size: number
  label: string
}

export interface InterpretSubtitleConfigurationProps {
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  settings: SubtitleSettings
  onSettingsChange: (settings: SubtitleSettings) => void
  onReset: () => void
  colors: readonly SubtitleColorOption[]
  fontSizes: readonly SubtitleFontSizeOption[]
}

/**
 * Floating-subtitle output settings.
 *
 * The switch is the primary decision; appearance controls only appear while
 * subtitles are on, inline in the section instead of in a nested popup.
 */
export function InterpretSubtitleConfiguration({
  enabled,
  onEnabledChange,
  settings,
  onSettingsChange,
  onReset,
  colors,
  fontSizes,
}: InterpretSubtitleConfigurationProps) {
  const t = useT()
  const titleId = useId()
  const hintId = useId()
  const opacityId = useId()

  return (
    <div className="ai-subtitle-config">
      <div className="ai-switch-row">
        <SubtitlesIcon className="ai-switch-row__icon" aria-hidden="true" />
        <div className="ai-switch-row__copy">
          <span id={titleId} className="ai-switch-row__title">{t.live_subtitles}</span>
          <span id={hintId} className="ai-switch-row__hint">
            {enabled ? t.live_subtitles_hide_title : t.live_subtitles_show_title}
          </span>
        </div>
        <ToggleSwitch
          checked={enabled}
          onChange={onEnabledChange}
          aria-labelledby={titleId}
          aria-describedby={hintId}
        />
      </div>

      {enabled && (
        <div className="ai-subtitle-config__appearance">
          <fieldset className="ai-subtitle-field">
            <legend className="ai-subtitle-field__label">{t.live_subtitle_text_color}</legend>
            <div className="ai-subtitle-field__row">
              {colors.map(({ label, value }) => {
                const selected = settings.textColor === value
                return (
                  <Button
                    key={value}
                    size="sm"
                    shape="icon"
                    variant={selected ? 'primary' : 'neutral'}
                    appearance={selected ? 'soft' : 'ghost'}
                    aria-label={label}
                    aria-pressed={selected}
                    title={label}
                    onClick={() => onSettingsChange({ ...settings, textColor: value })}
                  >
                    <span className="ai-subtitle-swatch" style={{ background: value }} aria-hidden="true" />
                  </Button>
                )
              })}
            </div>
          </fieldset>

          <fieldset className="ai-subtitle-field">
            <legend className="ai-subtitle-field__label">
              {t.live_subtitle_font_size}
              <span className="ai-subtitle-field__value">{settings.fontSize}px</span>
            </legend>
            <div className="ai-subtitle-field__row">
              {fontSizes.map(({ size, label }) => {
                const selected = settings.fontSize === size
                return (
                  <Button
                    key={size}
                    size="sm"
                    shape="pill"
                    variant={selected ? 'primary' : 'neutral'}
                    appearance={selected ? 'soft' : 'ghost'}
                    aria-pressed={selected}
                    onClick={() => onSettingsChange({ ...settings, fontSize: size })}
                  >
                    {label}
                  </Button>
                )
              })}
            </div>
          </fieldset>

          <div className="ai-subtitle-field">
            <label htmlFor={opacityId} className="ai-subtitle-field__label">
              {t.live_subtitle_bg_opacity}
              <span className="ai-subtitle-field__value">{settings.bgOpacity}%</span>
            </label>
            {/* Native range input: no slider atom exists; keeps keyboard and AT behavior built in. */}
            <input
              id={opacityId}
              type="range"
              min={0}
              max={100}
              step={5}
              value={settings.bgOpacity}
              onChange={(event) => onSettingsChange({ ...settings, bgOpacity: Number(event.target.value) })}
              className="ai-subtitle-slider"
            />
            <div className="ai-subtitle-field__scale" aria-hidden="true">
              <span>{t.live_subtitle_transparent}</span>
              <span>{t.live_subtitle_opaque}</span>
            </div>
          </div>

          <div className="ai-subtitle-config__footer">
            <Button size="sm" shape="rect" variant="neutral" appearance="ghost" onClick={onReset}>
              {t.live_subtitle_reset}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { ButtonGroup } from '../../components/ui/ButtonGroup'
import { FontSizePicker } from '../../components/ui/FontSizePicker'
import { AccentPicker, SettingsCard, ThemePresetPicker, ThemePreview } from '../../components/ui/molecules'
import { THEME_ACCENTS, THEME_PRESET_TRAITS, THEME_PRESETS, type ThemeAccent, type ThemePreset } from '../../constants/themePresets'
import { useAppStore, useT } from '../../store/useAppStore'

type ThemeMode = 'light' | 'dark' | 'system'

/** Tracks the OS colour scheme so the preview can show what "System" resolves to. */
function useSystemDark(): boolean {
  const [dark, setDark] = useState(() =>
    typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)').matches : false,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handle = (event: MediaQueryListEvent) => setDark(event.matches)
    media.addEventListener('change', handle)
    return () => media.removeEventListener('change', handle)
  }, [])
  return dark
}

export function AppearanceSection() {
  const t = useT()
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const themePreset = useAppStore((state) => state.themePreset)
  const setThemePreset = useAppStore((state) => state.setThemePreset)
  const fontSize = useAppStore((state) => state.fontSize)
  const setFontSize = useAppStore((state) => state.setFontSize)
  const themeAccent = useAppStore((state) => state.themeAccent)
  const setThemeAccent = useAppStore((state) => state.setThemeAccent)
  const [previewPreset, setPreviewPreset] = useState<ThemePreset | null>(null)
  const [previewAccent, setPreviewAccent] = useState<ThemeAccent | null>(null)
  const systemDark = useSystemDark()

  // The preview follows the pointer or focus; the window keeps the stored choice.
  const shown = previewPreset ?? themePreset
  const modeLocked = THEME_PRESET_TRAITS[themePreset].darkOnly
  const windowDark = modeLocked || theme === 'dark' || (theme === 'system' && systemDark)
  const previewDark = THEME_PRESET_TRAITS[shown].darkOnly || windowDark
  const shownName = t[`settings_theme_preset_${shown}`]
  const shownDescription = t[`settings_theme_preset_${shown}_desc`]

  const presetOptions = THEME_PRESETS.map((preset) => ({
    value: preset,
    label: t[`settings_theme_preset_${preset}`],
    badge: THEME_PRESET_TRAITS[preset].darkOnly ? t.settings_theme_dark_only_badge : undefined,
  }))
  const accentOptions = THEME_ACCENTS.map((accent) => ({
    value: accent,
    label: t[`settings_theme_accent_${accent}`],
    auto: accent === 'auto',
  }))
  const modeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: t.settings_theme_light },
    { value: 'dark', label: t.settings_theme_dark },
    { value: 'system', label: t.settings_theme_system },
  ]

  return (
    <section className="settings-section-stack">
      <div>
        <h2 className="settings-section-title">{t.settings_appearance}</h2>
        <p className="settings-section-desc mt-1">{t.settings_appearance_desc}</p>
      </div>

      <div className="appearance-layout">
        <div className="appearance-cards">
          <SettingsCard
            title={t.settings_theme_mode}
            description={modeLocked ? t.settings_theme_dark_only_hint : t.settings_theme_desc}
            aside={<ButtonGroup size="sm" label={t.settings_theme_mode} value={theme} onChange={setTheme} options={modeOptions} disabled={modeLocked} />}
          />

          {/* Hovering or focusing a tile previews it beside the cards */}
          <SettingsCard title={t.settings_theme_palette} description={t.settings_theme_palette_desc}>
            <div className="appearance-card-body">
              <ThemePresetPicker
                label={t.settings_theme_palette}
                value={themePreset}
                options={presetOptions}
                onChange={setThemePreset}
                onPreview={setPreviewPreset}
              />
              <p className="appearance-note" aria-live="polite">
                <span className="appearance-note__name">{shownName}</span>
                {' · '}
                {shownDescription}
              </p>
            </div>
          </SettingsCard>

          {/* Accent hue layered on the style */}
          <SettingsCard title={t.settings_theme_accent} description={t.settings_theme_accent_desc}>
            <div className="appearance-card-body">
              <AccentPicker
                label={t.settings_theme_accent}
                value={themeAccent}
                options={accentOptions}
                onChange={setThemeAccent}
                dark={windowDark}
                onPreview={setPreviewAccent}
              />
            </div>
          </SettingsCard>

          <SettingsCard
            title={t.settings_font_size}
            description={t.settings_font_size_desc}
            aside={(
              <FontSizePicker
                label={t.settings_font_size}
                value={fontSize}
                onChange={setFontSize}
                labels={{
                  small: t.settings_font_size_small,
                  medium: t.settings_font_size_medium,
                  large: t.settings_font_size_large,
                }}
              />
            )}
          />
        </div>

        <aside className="appearance-preview" aria-label={t.settings_theme_preview_heading}>
          <p className="appearance-preview__label">{t.settings_theme_preview_heading}</p>
          <ThemePreview
            preset={shown}
            dark={previewDark}
            accent={previewAccent ?? themeAccent}
            labels={{
              label: `${t.settings_theme_preview_label}: ${shownName}`,
              title: t.nav_chat,
              assistant: t.settings_theme_preview_assistant,
              user: t.settings_theme_preview_user,
              placeholder: t.settings_theme_preview_placeholder,
            }}
          />
        </aside>
      </div>
    </section>
  )
}

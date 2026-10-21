import { useEffect, useState } from 'react'
import { ButtonGroup } from '../../components/ui/ButtonGroup'
import { FontSizePicker } from '../../components/ui/FontSizePicker'
import { ThemePresetPicker, ThemePreview } from '../../components/ui/molecules'
import { THEME_PRESET_TRAITS, THEME_PRESETS, type ThemePreset } from '../../constants/themePresets'
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
  const [previewPreset, setPreviewPreset] = useState<ThemePreset | null>(null)
  const systemDark = useSystemDark()

  // The preview follows the pointer or focus; the window keeps the stored choice.
  const shown = previewPreset ?? themePreset
  const modeLocked = THEME_PRESET_TRAITS[themePreset].darkOnly
  const previewDark = THEME_PRESET_TRAITS[shown].darkOnly || theme === 'dark' || (theme === 'system' && systemDark)
  const shownName = t[`settings_theme_preset_${shown}`]
  const shownDescription = t[`settings_theme_preset_${shown}_desc`]

  const presetOptions = THEME_PRESETS.map((preset) => ({
    value: preset,
    label: t[`settings_theme_preset_${preset}`],
    badge: THEME_PRESET_TRAITS[preset].darkOnly ? t.settings_theme_dark_only_badge : undefined,
  }))
  const modeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: t.settings_theme_light },
    { value: 'system', label: t.settings_theme_system },
    { value: 'dark', label: t.settings_theme_dark },
  ]

  return (
    <section className="space-y-3">
      <div>
        <h2 className="settings-section-title">{t.settings_appearance}</h2>
        <p className="settings-section-desc mt-1">{t.settings_appearance_desc}</p>
      </div>

      <div className="card divide-y divide-gray-100 dark:divide-gray-700">
        {/* Live preview with the light/dark mode control attached to it */}
        <div className="flex flex-col gap-3 px-4 py-3.5">
          <div className="settings-choice-row flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_theme_mode}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {modeLocked ? t.settings_theme_dark_only_hint : t.settings_theme_desc}
              </p>
            </div>
            <ButtonGroup value={theme} onChange={setTheme} options={modeOptions} disabled={modeLocked} />
          </div>
          <ThemePreview
            preset={shown}
            dark={previewDark}
            labels={{
              label: `${t.settings_theme_preview_label}: ${shownName}`,
              title: t.nav_chat,
              assistant: t.settings_theme_preview_assistant,
              user: t.settings_theme_preview_user,
              placeholder: t.settings_theme_preview_placeholder,
            }}
          />
        </div>

        {/* Style strip; hovering or focusing a tile previews it above */}
        <div className="flex flex-col gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_theme_palette}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_theme_palette_desc}</p>
          </div>
          <ThemePresetPicker
            label={t.settings_theme_palette}
            value={themePreset}
            options={presetOptions}
            onChange={setThemePreset}
            onPreview={setPreviewPreset}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
            <span className="font-medium text-gray-800 dark:text-gray-200">{shownName}</span>
            {' · '}
            {shownDescription}
          </p>
        </div>

        {/* Font Size */}
        <div className="settings-choice-row flex items-center justify-between px-4 py-3.5 gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_font_size}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_font_size_desc}</p>
          </div>
          <FontSizePicker
            value={fontSize}
            onChange={setFontSize}
            labels={{
              small: t.settings_font_size_small,
              medium: t.settings_font_size_medium,
              large: t.settings_font_size_large,
            }}
          />
        </div>
      </div>
    </section>
  )
}

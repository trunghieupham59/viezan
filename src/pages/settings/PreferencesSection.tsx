import { ToggleSwitch } from '../../components/ui/atoms'
import { OptionPicker } from '../../components/ui/molecules'
import { type AppLocale, LOCALE_NAMES } from '../../i18n'
import { useAppStore, useT } from '../../store/useAppStore'
import { detectSystemLocale } from '../../utils/locale'

const localeOptions = (Object.entries(LOCALE_NAMES) as [AppLocale, string][]).map(
  ([value, label]) => ({ value, label }),
)

export function PreferencesSection() {
  const autoTranslate = useAppStore((state) => state.autoTranslate)
  const setAutoTranslate = useAppStore((state) => state.setAutoTranslate)
  const autoTranslateDelay = useAppStore((state) => state.autoTranslateDelay)
  const setAutoTranslateDelay = useAppStore((state) => state.setAutoTranslateDelay)
  const phoneticMode = useAppStore((state) => state.phoneticMode)
  const setPhoneticMode = useAppStore((state) => state.setPhoneticMode)
  const imageProviderFallback = useAppStore((state) => state.imageProviderFallback)
  const setImageProviderFallback = useAppStore((state) => state.setImageProviderFallback)
  const locale = useAppStore((state) => state.locale)
  const localeAuto = useAppStore((state) => state.localeAuto)
  const setLocale = useAppStore((state) => state.setLocale)
  const setLocaleAuto = useAppStore((state) => state.setLocaleAuto)
  const setLocaleFromSystem = useAppStore((state) => state.setLocaleFromSystem)
  const t = useT()

  const handleToggleLocaleAuto = () => {
    if (localeAuto) {
      setLocale(locale)
    } else {
      setLocaleAuto(true)
      setLocaleFromSystem(detectSystemLocale())
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="settings-section-title">{t.settings_prefs}</h2>
        <p className="settings-section-desc mt-1">{t.settings_prefs_desc}</p>
      </div>

      <div className="card divide-y divide-gray-100 dark:divide-gray-700">

        {/* Follow System Language toggle */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_locale_auto}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_locale_auto_desc}</p>
          </div>
          <ToggleSwitch
            checked={localeAuto}
            onChange={handleToggleLocaleAuto}
            aria-label={t.settings_locale_auto}
          />
        </div>

        {/* App Language selector */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_app_language}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_app_language_desc}</p>
          </div>
          <OptionPicker
            value={locale}
            options={localeOptions}
            onChange={(code) => setLocale(code as AppLocale)}
            label={t.settings_app_language}
          />
        </div>

        {/* Phonetic / Furigana toggle */}
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_furigana}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_furigana_desc}</p>
          </div>
          <ToggleSwitch
            checked={phoneticMode !== 'off'}
            onChange={(v) => setPhoneticMode(v ? 'standard' : 'off')}
            aria-label={t.settings_furigana}
          />
        </div>

        {/* Image translation: allow uploading the image to another provider as a fallback */}
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_image_provider_fallback}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_image_provider_fallback_desc}</p>
          </div>
          <ToggleSwitch
            checked={imageProviderFallback}
            onChange={setImageProviderFallback}
            aria-label={t.settings_image_provider_fallback}
          />
        </div>

        {/* Auto / Manual translation mode toggle */}
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {`${t.settings_translate_mode}: ${autoTranslate ? t.settings_mode_auto : t.settings_mode_manual}`}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {t.settings_translate_mode_desc}
            </p>
          </div>
          <ToggleSwitch
            checked={autoTranslate}
            onChange={setAutoTranslate}
            aria-label={t.settings_auto_translate}
          />
        </div>

        {/* Delay slider (only for auto) */}
        {autoTranslate && (
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_translate_delay}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_translate_delay_desc}</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={300}
                max={2000}
                step={100}
                value={autoTranslateDelay}
                onChange={(e) => setAutoTranslateDelay(Number(e.target.value))}
                className="w-24 accent-gray-600"
              />
              <span className="text-xs text-gray-500 font-mono w-14 text-right tabular-nums">
                {autoTranslateDelay}ms
              </span>
            </div>
          </div>
        )}

      </div>
    </section>
  )
}

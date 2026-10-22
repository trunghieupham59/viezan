import { useCallback, useEffect, useState } from 'react'
import { ToggleSwitch } from '../../components/ui/atoms'
import { OptionPicker } from '../../components/ui/molecules'
import { type AppLocale, LOCALE_NAMES } from '../../i18n'
import { useAppStore, useT } from '../../store/useAppStore'
import { useNotificationStore } from '../../store/useNotificationStore'
import { detectSystemLocale } from '../../utils/locale'

/** Toast owner key so repeated failures replace each other instead of stacking. */
const LOGIN_ITEM_ERROR_KEY = 'settings-login-item'

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
  const notify = useNotificationStore((state) => state.notify)
  const dismissNotification = useNotificationStore((state) => state.dismiss)
  // The OS owns this preference; null until the main process has answered, and
  // the row is hidden where Electron cannot register a login item.
  const [launchAtLogin, setLaunchAtLogin] = useState<boolean | null>(null)
  const [launchSaving, setLaunchSaving] = useState(false)
  const reportLaunchError = useCallback(() => {
    notify({ key: LOGIN_ITEM_ERROR_KEY, tone: 'error', message: t.settings_launch_at_login_error })
  }, [notify, t.settings_launch_at_login_error])

  useEffect(() => {
    let active = true
    void window.api?.getLoginItemSettings?.().then((settings) => {
      if (active && settings?.supported) setLaunchAtLogin(settings.openAtLogin)
    }).catch(() => { if (active) reportLaunchError() })
    return () => { active = false; dismissNotification(LOGIN_ITEM_ERROR_KEY) }
  }, [reportLaunchError, dismissNotification])

  const toggleLaunchAtLogin = async (enabled: boolean) => {
    setLaunchSaving(true)
    dismissNotification(LOGIN_ITEM_ERROR_KEY)
    try {
      const result = await window.api?.setLoginItemSettings?.(enabled)
      if (result?.success) setLaunchAtLogin(result.openAtLogin)
      else reportLaunchError()
    } catch { reportLaunchError() }
    finally { setLaunchSaving(false) }
  }

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

        {/* Launch at login (packaged Windows/macOS builds only) */}
        {launchAtLogin !== null && (
          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_launch_at_login}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_launch_at_login_desc}</p>
            </div>
            <ToggleSwitch
              checked={launchAtLogin}
              disabled={launchSaving}
              onChange={(enabled) => void toggleLaunchAtLogin(enabled)}
              aria-label={t.settings_launch_at_login}
            />
          </div>
        )}

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

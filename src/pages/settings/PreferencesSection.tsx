import { useCallback, useEffect, useState } from 'react'
import { ToggleSwitch } from '../../components/ui/atoms'
import { ButtonGroup } from '../../components/ui/ButtonGroup'
import { OptionPicker, SettingsRow } from '../../components/ui/molecules'
import { type AppLocale, LOCALE_NAMES } from '../../i18n'
import { useAppStore, useT } from '../../store/useAppStore'
import { useNotificationStore } from '../../store/useNotificationStore'
import { detectSystemLocale } from '../../utils/locale'

/** Toast owner key so repeated failures replace each other instead of stacking. */
const LOGIN_ITEM_ERROR_KEY = 'settings-login-item'

/** Auto-translate waits this long after typing stops: short, medium (the default) or long. */
const AUTO_TRANSLATE_DELAYS = [
  { ms: 500, labelKey: 'settings_delay_short' },
  { ms: 800, labelKey: 'settings_delay_medium' },
  { ms: 1500, labelKey: 'settings_delay_long' },
] as const

const localeOptions = (Object.entries(LOCALE_NAMES) as [AppLocale, string][]).map(
  ([value, label]) => ({ value, label }),
)

export function PreferencesSection() {
  const smartSessionReset = useAppStore((state) => state.smartSessionReset)
  const setSmartSessionReset = useAppStore((state) => state.setSmartSessionReset)
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

  // One picker: "Follow the system" or a fixed language.
  const LOCALE_SYSTEM = 'system'
  const handleLocaleChange = (value: string) => {
    if (value === LOCALE_SYSTEM) {
      setLocaleAuto(true)
      setLocaleFromSystem(detectSystemLocale())
    } else {
      setLocale(value as AppLocale)
    }
  }
  const delayChoice = AUTO_TRANSLATE_DELAYS.reduce((best, option) => (
    Math.abs(option.ms - autoTranslateDelay) < Math.abs(best.ms - autoTranslateDelay) ? option : best
  ), AUTO_TRANSLATE_DELAYS[1])

  return (
    <section className="settings-section-stack">
      <header>
        <h2 className="settings-section-title">{t.settings_prefs}</h2>
        <p className="settings-section-desc">{t.settings_prefs_card_desc}</p>
      </header>

      <div className="ui-settings-card">
        <SettingsRow label={t.settings_app_language} description={t.settings_app_language_desc}>
          <OptionPicker
            value={localeAuto ? LOCALE_SYSTEM : locale}
            options={[{ value: LOCALE_SYSTEM, label: t.settings_locale_auto }, ...localeOptions]}
            onChange={handleLocaleChange}
            label={t.settings_app_language}
          />
        </SettingsRow>

        {/* Launch at login (packaged Windows/macOS builds only) */}
        {launchAtLogin !== null && (
          <SettingsRow label={t.settings_launch_at_login} description={t.settings_launch_at_login_desc}>
            <ToggleSwitch
              checked={launchAtLogin}
              disabled={launchSaving}
              onChange={(enabled) => void toggleLaunchAtLogin(enabled)}
              aria-label={t.settings_launch_at_login}
            />
          </SettingsRow>
        )}

        <SettingsRow label={t.session_smart_reset} description={t.session_smart_reset_desc}>
          <ToggleSwitch checked={smartSessionReset} onChange={setSmartSessionReset} aria-label={t.session_smart_reset} />
        </SettingsRow>

        <SettingsRow label={t.settings_auto_translate} description={t.settings_translate_mode_desc}>
          <ToggleSwitch checked={autoTranslate} onChange={setAutoTranslate} aria-label={t.settings_auto_translate} />
        </SettingsRow>

        {autoTranslate && (
          <SettingsRow label={t.settings_translate_delay} description={t.settings_translate_delay_desc}>
            <ButtonGroup<number>
              size="sm"
              label={t.settings_translate_delay}
              value={delayChoice.ms}
              onChange={setAutoTranslateDelay}
              options={AUTO_TRANSLATE_DELAYS.map((option) => ({ value: option.ms, label: t[option.labelKey] }))}
            />
          </SettingsRow>
        )}

        <SettingsRow label={t.settings_furigana} description={t.settings_furigana_desc}>
          <ToggleSwitch
            checked={phoneticMode !== 'off'}
            onChange={(v) => setPhoneticMode(v ? 'standard' : 'off')}
            aria-label={t.settings_furigana}
          />
        </SettingsRow>

        <SettingsRow label={t.settings_image_provider_fallback} description={t.settings_image_provider_fallback_desc}>
          <ToggleSwitch
            checked={imageProviderFallback}
            onChange={setImageProviderFallback}
            aria-label={t.settings_image_provider_fallback}
          />
        </SettingsRow>
      </div>
    </section>
  )
}

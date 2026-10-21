import { useCallback, useEffect, useState } from 'react'
import { Button, ToggleSwitch } from '@/components/ui/atoms'
import { CheckUpdateButton } from '../../components/ui/CheckUpdateButton'
import { CheckCircleIcon, CheckIcon, DownloadIcon, SpinnerIcon } from '../../components/ui/icons'
import { useT } from '../../store/useAppStore'
import { useNotificationStore } from '../../store/useNotificationStore'
import { useUpdaterStore } from '../../store/useUpdaterStore'
import { tpl } from '../../utils/tpl'

/** Toast owner keys so updater notices replace each other instead of stacking. */
const PREFERENCE_ERROR_KEY = 'settings-update-preference'
const UPDATE_ERROR_KEY = 'settings-update-error'

export function UpdaterSection() {
  const t = useT()
  const updaterStatus = useUpdaterStore((state) => state.status)
  const setUpdaterStatus = useUpdaterStore((state) => state.receive)
  const notify = useNotificationStore((state) => state.notify)
  const dismissNotification = useNotificationStore((state) => state.dismiss)
  const [appVersion, setAppVersion] = useState('')
  const [notifications, setNotifications] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const reportPreferenceError = useCallback(() => {
    notify({ key: PREFERENCE_ERROR_KEY, tone: 'error', message: t.update_notification_action_error })
  }, [notify, t.update_notification_action_error])

  useEffect(() => {
    let active = true
    void window.api?.updater?.getNotificationPreferences?.().then((preferences) => {
      if (active && preferences) setNotifications(preferences.enabled)
    }).catch(() => { if (active) reportPreferenceError() })
    return () => { active = false }
  }, [reportPreferenceError])

  const toggleNotifications = async (enabled: boolean) => {
    setSaving(true)
    dismissNotification(PREFERENCE_ERROR_KEY)
    try {
      const result = await window.api?.updater?.setNotificationPreferences?.({ enabled })
      if (result) setNotifications(result.enabled)
      else reportPreferenceError()
    } catch { reportPreferenceError() }
    finally { setSaving(false) }
  }

  // Check/download failures surface in the toast stack; the status row keeps
  // only the actionable states (available, downloading, downloaded, up to date).
  const updateErrorMessage = updaterStatus.type === 'error'
    ? `${t.settings_update_error}${updaterStatus.error ? `: ${updaterStatus.error}` : ''}`
    : updaterStatus.type === 'error-codesign'
      ? t.settings_update_error_codesign
      : updaterStatus.error
        ? t.update_notification_action_error
        : null
  const updateErrorTone = updaterStatus.type === 'error-codesign' ? 'warning' : 'error'
  useEffect(() => {
    if (!updateErrorMessage) {
      dismissNotification(UPDATE_ERROR_KEY)
      return
    }
    notify({ key: UPDATE_ERROR_KEY, tone: updateErrorTone, message: updateErrorMessage })
    // Leaves with the section when Settings closes; it is re-raised on reopen.
    return () => dismissNotification(UPDATE_ERROR_KEY)
  }, [updateErrorMessage, updateErrorTone, notify, dismissNotification])

  useEffect(() => {
    if (!window.api?.updater) return
    window.api.updater.getVersion().then((res: { version: string }) => {
      if (res?.version) setAppVersion(res.version)
    })
    const unsub = window.api.updater.onStatus((status) => {
      setUpdaterStatus(status)
    })
    return unsub
  }, [setUpdaterStatus])

  const handleCheckUpdate = async () => {
    if (!window.api?.updater) return
    setUpdaterStatus({ type: 'checking' })
    await window.api.updater.check()
  }

  const handleDownloadUpdate = () => window.api?.updater?.download()
  const handleInstallUpdate  = () => window.api?.updater?.install()
  const handleOpenInstaller  = () => window.api?.updater?.openInstaller?.()
  const installerMode = updaterStatus.type === 'downloaded' && updaterStatus.installMode === 'open-installer'
  const showManualInstaller = updaterStatus.type === 'downloaded' && updaterStatus.installMode === 'restart'

  return (
    <section className="space-y-3">
      <div>
        <h2 className="settings-section-title">{t.settings_update_section}</h2>
        <p className="settings-section-desc mt-1">{t.settings_update_section_desc}</p>
      </div>

      <div className="card divide-y divide-gray-100 dark:divide-gray-700">
        {notifications !== null && (
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <p className="text-sm font-medium">{t.update_popup_enabled}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t.update_popup_enabled_description}</p>
            </div>
            <ToggleSwitch checked={notifications} disabled={saving} onChange={(enabled) => void toggleNotifications(enabled)} aria-label={t.update_popup_enabled} />
          </div>
        )}

        {/* Current version + Check button */}
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_update_current_version}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono">
              v{appVersion || window.api?.version || '-'}
            </p>
          </div>
          <CheckUpdateButton
            status={updaterStatus.type}
            checkLabel={t.settings_update_check}
            checkingLabel={t.settings_update_checking}
            onClick={handleCheckUpdate}
          />
        </div>

        {/* Status row — actionable states only; errors go to the toast stack */}
        {updaterStatus.type !== 'idle' && updaterStatus.type !== 'checking' && updaterStatus.type !== 'error' && updaterStatus.type !== 'error-codesign' && (
          <div className="px-4 py-3 space-y-2">

            {/* Update available */}
            {updaterStatus.type === 'available' && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <DownloadIcon className="w-4 h-4 flex-shrink-0" />
                  <span>{tpl(t.settings_update_available, { version: updaterStatus.version ?? '' })}</span>
                </div>
                <Button
                  size="sm"
                  shape="rect"
                  variant="primary"
                  appearance="solid"
                  type="button"
                  onClick={handleDownloadUpdate}
                  className="flex-shrink-0"
                >
                  {updaterStatus.downloadUrl ? t.settings_update_download_installer : t.settings_update_download}
                </Button>
              </div>
            )}

            {/* Up to date */}
            {updaterStatus.type === 'not-available' && (
              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <CheckIcon className="w-4 h-4 flex-shrink-0" />
                <span>{tpl(t.settings_update_not_available, { version: updaterStatus.version ?? appVersion ?? '' })}</span>
              </div>
            )}

            {/* Downloading */}
            {updaterStatus.type === 'downloading' && (
              <div className="space-y-1.5">
                <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                  <span className="flex items-center gap-2">
                    <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                    {tpl(t.settings_update_downloading, { percent: updaterStatus.percent ?? 0 })}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-gray-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${updaterStatus.percent ?? 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* Downloaded — ready to install */}
            {updaterStatus.type === 'downloaded' && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
                  <span>{tpl(t.settings_update_downloaded, { version: updaterStatus.version ?? '' })}</span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {showManualInstaller && (
                    <Button
                      size="sm"
                      shape="rect"
                      variant="neutral"
                      appearance="outline"
                      type="button"
                      onClick={handleOpenInstaller}
                    >
                      {t.settings_update_open_installer}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    shape="rect"
                    variant="primary"
                    appearance="solid"
                    type="button"
                    onClick={handleInstallUpdate}
                  >
                    {installerMode ? t.settings_update_open_installer : t.settings_update_install}
                  </Button>
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </section>
  )
}

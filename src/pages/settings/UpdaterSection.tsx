import { useCallback, useEffect, useState } from 'react'
import { Button, Meter, ToggleSwitch } from '@/components/ui/atoms'
import { SettingsRow } from '@/components/ui/molecules'
import { CheckUpdateButton } from '../../components/ui/CheckUpdateButton'
import { CheckCircleIcon, CheckIcon, DownloadIcon, SpinnerIcon } from '../../components/ui/icons'
import { GITHUB_RELEASES_URL } from '../../constants/urls'
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

  const showStatus = updaterStatus.type === 'available'
    || updaterStatus.type === 'not-available'
    || updaterStatus.type === 'downloading'
    || updaterStatus.type === 'downloaded'

  return (
    <div className="settings-section-stack">
      <header>
        <h2 className="settings-section-title">{t.settings_update_section}</h2>
        <p className="settings-section-desc">{t.settings_update_section_desc}</p>
      </header>

      <div className="ui-settings-card">
        <SettingsRow
          label={t.settings_update_current_version}
          description={<code className="settings-version">v{appVersion || window.api?.version || '-'}</code>}
        >
          <Button
            size="sm"
            shape="rect"
            variant="neutral"
            appearance="ghost"
            type="button"
            onClick={() => window.api?.openExternal(GITHUB_RELEASES_URL)}
          >
            {t.settings_update_release_notes}
          </Button>
          <CheckUpdateButton
            status={updaterStatus.type}
            checkLabel={t.settings_update_check}
            checkingLabel={t.settings_update_checking}
            onClick={handleCheckUpdate}
          />
        </SettingsRow>

        {notifications !== null && (
          <SettingsRow label={t.update_popup_enabled} description={t.update_popup_enabled_description}>
            <ToggleSwitch
              checked={notifications}
              disabled={saving}
              onChange={(enabled) => void toggleNotifications(enabled)}
              aria-label={t.update_popup_enabled}
            />
          </SettingsRow>
        )}

        {/* Status row — actionable states only; errors go to the toast stack */}
        {showStatus && (
          <SettingsRow
            label={t.settings_update_status}
            description={(
              <span className="settings-update-status" role="status">
                {updaterStatus.type === 'available' && <DownloadIcon />}
                {updaterStatus.type === 'not-available' && <CheckIcon />}
                {updaterStatus.type === 'downloading' && <SpinnerIcon className="animate-spin" />}
                {updaterStatus.type === 'downloaded' && <CheckCircleIcon />}
                {updaterStatus.type === 'available' && tpl(t.settings_update_available, { version: updaterStatus.version ?? '' })}
                {updaterStatus.type === 'not-available' && tpl(t.settings_update_not_available, { version: updaterStatus.version ?? appVersion ?? '' })}
                {updaterStatus.type === 'downloading' && tpl(t.settings_update_downloading, { percent: updaterStatus.percent ?? 0 })}
                {updaterStatus.type === 'downloaded' && tpl(t.settings_update_downloaded, { version: updaterStatus.version ?? '' })}
              </span>
            )}
            below={updaterStatus.type === 'downloading' ? (
              <Meter
                value={updaterStatus.percent ?? 0}
                min={0}
                max={100}
                label={t.settings_update_status}
                valueText={`${updaterStatus.percent ?? 0}%`}
              />
            ) : undefined}
          >
            {updaterStatus.type === 'available' && (
              <Button
                size="sm"
                shape="rect"
                variant="primary"
                appearance="solid"
                type="button"
                onClick={handleDownloadUpdate}
              >
                {updaterStatus.downloadUrl ? t.settings_update_download_installer : t.settings_update_download}
              </Button>
            )}
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
            {updaterStatus.type === 'downloaded' && (
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
            )}
          </SettingsRow>
        )}
      </div>
    </div>
  )
}

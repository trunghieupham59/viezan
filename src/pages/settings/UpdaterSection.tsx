import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/atoms'
import { CheckUpdateButton } from '../../components/ui/CheckUpdateButton'
import { AlertTriangleIcon, CheckCircleIcon, CheckIcon, DownloadIcon, SpinnerIcon } from '../../components/ui/icons'
import { useT } from '../../store/useAppStore'
import { useUpdaterStore } from '../../store/useUpdaterStore'
import { tpl } from '../../utils/tpl'

export function UpdaterSection() {
  const t = useT()
  const updaterStatus = useUpdaterStore((state) => state.status)
  const setUpdaterStatus = useUpdaterStore((state) => state.receive)
  const [appVersion, setAppVersion] = useState('')

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
        <h2 className="section-label">{t.settings_update_section}</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_update_section_desc}</p>
      </div>

      <div className="card divide-y divide-gray-100 dark:divide-gray-700">

        {/* Current version + Check button */}
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_update_current_version}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono">
              v{appVersion || window.api?.version || '—'}
            </p>
          </div>
          <CheckUpdateButton
            status={updaterStatus.type}
            checkLabel={t.settings_update_check}
            checkingLabel={t.settings_update_checking}
            onClick={handleCheckUpdate}
          />
        </div>

        {/* Status row — shown when not idle or checking */}
        {updaterStatus.type !== 'idle' && updaterStatus.type !== 'checking' && (
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

            {/* Code-signature error (macOS unsigned app) */}
            {updaterStatus.type === 'error-codesign' && (
              <div className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                <AlertTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{t.settings_update_error_codesign}</span>
              </div>
            )}

            {/* Generic error */}
            {updaterStatus.type === 'error' && (
              <div className="ui-error-text flex items-start gap-2 text-xs">
                <AlertTriangleIcon className="ui-error-icon w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{t.settings_update_error}{updaterStatus.error ? `: ${updaterStatus.error}` : ''}</span>
              </div>
            )}

          </div>
        )}

      </div>
    </section>
  )
}

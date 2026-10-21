import { useEffect, useState } from 'react'
import { AppLogoIcon } from '../../components/AppLogo'
import { PROVIDERS } from '../../constants/providers'
import { useT } from '../../store/useAppStore'

export function AboutSection() {
  const t = useT()
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    if (window.api?.updater) {
      window.api.updater.getVersion().then((res: { version: string }) => {
        if (res?.version) setAppVersion(res.version)
      })
    }
  }, [])

  return (
    <section className="space-y-3">
      <div>
        <h2 className="settings-section-title">{t.settings_about}</h2>
        <p className="settings-section-desc mt-1">{t.settings_about_desc}</p>
      </div>
      <div className="card px-4 py-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <AppLogoIcon size={44} />
            <div>
              <p className="font-bold text-gray-900 dark:text-gray-50">Viezan</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {appVersion ? `v${appVersion} · ` : ''}{t.settings_about_version}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {t.settings_about_platform}: {window.api?.platform || 'web'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t.settings_about_supports}</p>
            {/* HC-NEW-10: Use PROVIDERS constant instead of hardcoding provider names */}
            {PROVIDERS.map((p) => (
              <p key={p.id} className="text-xs text-gray-400">{p.name}</p>
            ))}
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-400 dark:text-gray-500">{t.settings_about_footer}</p>
        </div>
      </div>
    </section>
  )
}

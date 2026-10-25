import { useEffect, useState } from 'react'
import { AppLogoIcon } from '../../components/AppLogo'
import { Button } from '../../components/ui/atoms'
import { CheckIcon, CopyIcon } from '../../components/ui/icons'
import { SettingsCard, SettingsRow } from '../../components/ui/molecules'
import { PROVIDERS } from '../../constants/providers'
import { GITHUB_RELEASES_URL } from '../../constants/urls'
import { useAppStore, useT } from '../../store/useAppStore'
import { useUpdaterStore } from '../../store/useUpdaterStore'
import type { LocalAiEngine } from '../../types'

/** How long the Copy button shows its confirmation. */
const COPIED_MS = 1500

/** Display names of the local runtimes discovery can report. */
const LOCAL_ENGINE_NAMES: Record<LocalAiEngine, string> = {
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  llamacpp: 'llama.cpp',
}

const PLATFORM_NAMES: Record<string, string> = {
  darwin: 'macOS',
  win32: 'Windows',
  linux: 'Linux',
}

export function AboutSection() {
  const t = useT()
  const [appVersion, setAppVersion] = useState('')
  const [copied, setCopied] = useState(false)
  const updaterStatus = useUpdaterStore((state) => state.status)
  const localModel = useAppStore((state) => state.selectedModels.local)
  const localAvailable = useAppStore((state) => state.keyStatus.local)
  const localEngine = useAppStore((state) => state.localAiEngine)
  const receiveUpdaterStatus = useUpdaterStore((state) => state.receive)

  useEffect(() => {
    if (window.api?.updater) {
      window.api.updater.getVersion().then((res: { version: string }) => {
        if (res?.version) setAppVersion(res.version)
      })
    }
  }, [])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const version = appVersion || window.api?.version || ''
  const platform = window.api?.platform ? PLATFORM_NAMES[window.api.platform] ?? window.api.platform : 'web'
  // Name the runtime only when discovery reported it; never assume Ollama.
  const localAi = localAvailable
    ? [localEngine ? LOCAL_ENGINE_NAMES[localEngine] : null, localModel].filter(Boolean).join(' · ') || '-'
    : '-'
  const providers = PROVIDERS.map((provider) => provider.name).join(', ')
  const systemInfo: { label: string; value: string; mono?: boolean }[] = [
    { label: t.settings_about_platform, value: platform },
    { label: t.settings_about_local_ai, value: localAi, mono: localAvailable },
    { label: t.settings_about_supports, value: providers },
    { label: t.settings_about_data, value: t.settings_about_data_local },
  ]
  const features = [
    { title: t.settings_about_feature_private, description: t.settings_about_feature_private_desc },
    { title: t.settings_about_feature_everywhere, description: t.settings_about_feature_everywhere_desc },
    { title: t.settings_about_feature_modules, description: t.settings_about_feature_modules_desc },
  ]

  const copySystemInfo = () => {
    const text = [`Viezan ${version ? `v${version}` : ''}`.trim(), ...systemInfo.map((row) => `${row.label}: ${row.value}`)].join('\n')
    void navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {})
  }

  const checkForUpdates = () => {
    // The Updates section owns the check and its result; scroll there and start it.
    useAppStore.setState({ settingsInitialSection: 'updates' })
    if (!window.api?.updater) return
    // Same contract as the Updates section: show the spinner before main replies.
    receiveUpdaterStatus({ type: 'checking' })
    void window.api.updater.check()
  }

  return (
    <div className="settings-section-stack">
      <h2 className="sr-only">{t.settings_about}</h2>

      <div className="ui-settings-card about-hero">
        <div className="about-hero__identity">
          <AppLogoIcon size={48} />
          <div className="about-hero__copy">
            <p className="about-hero__name">Viezan</p>
            <p className="about-hero__version">
              {t.settings_about_version_label}{' '}
              <code>{version ? `v${version}` : '-'}</code>
              {updaterStatus.type === 'not-available' && ` · ${t.settings_about_up_to_date}`}
            </p>
          </div>
        </div>
        <p className="about-hero__tagline">{t.settings_about_tagline}</p>
        <ul className="about-features">
          {features.map((feature) => (
            <li key={feature.title} className="about-features__item">
              <span className="about-features__title">{feature.title}</span>
              <span className="about-features__description">{feature.description}</span>
            </li>
          ))}
        </ul>
        <div className="about-hero__actions">
          <Button size="sm" shape="rect" variant="neutral" appearance="outline" type="button" onClick={checkForUpdates}>
            {t.settings_about_check_updates}
          </Button>
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
        </div>
      </div>

      <SettingsCard
        title={t.settings_about_system_info}
        headingLevel={3}
        aside={(
          <Button
            size="sm"
            shape="rect"
            variant={copied ? 'primary' : 'neutral'}
            appearance={copied ? 'soft' : 'ghost'}
            type="button"
            onClick={copySystemInfo}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? t.translate_copied : t.translate_copy}
          </Button>
        )}
      >
        {systemInfo.map((row) => (
          <SettingsRow key={row.label} label={row.label}>
            {row.mono ? <code className="settings-info-value">{row.value}</code> : <span className="settings-info-value">{row.value}</span>}
          </SettingsRow>
        ))}
      </SettingsCard>
    </div>
  )
}

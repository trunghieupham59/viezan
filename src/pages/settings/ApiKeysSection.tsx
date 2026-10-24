import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/atoms'
import { ApiKeyInput } from '../../components/ApiKeyInput'
import { DeepResearchApiSection } from '../../components/chat/DeepResearchApiSection'
import { CostOverviewCard } from '../../components/cost/CostOverviewCard'
import { Meter } from '../../components/ui/atoms'
import { DownloadIcon, RefreshIcon, SpinnerIcon } from '../../components/ui/icons'
import { CapabilityNotice, SettingsCard, SettingsRow, StatusLabel } from '../../components/ui/molecules'
import { PROVIDERS } from '../../constants/providers'
import { JINA_DOCS_URL } from '../../constants/urls'
import { useAppStore, useT } from '../../store/useAppStore'
import { useNotificationStore } from '../../store/useNotificationStore'
import type {
  LocalAiBenchmarkResult,
  LocalAiDiscoveryResult,
  LocalAiModelDownloadProgress,
  Provider,
} from '../../types'
import { formatUsageAmount } from '../../utils/usageCost'
import { LocalAiPerformanceSection } from './LocalAiPerformanceSection'

/** Main-process message for a model whose pull is already in flight (see downloadLocalAiModel). */
const ALREADY_DOWNLOADING_ERROR = 'This model is already being downloaded.'
/** Toast owner key for local-runtime model/install outcomes. */
const LOCAL_AI_NOTICE_KEY = 'settings-local-ai'

function LocalAiProviderCard({
  status,
  benchmark,
  loading,
  benchmarking,
  downloads,
  uninstallingModel,
  openingRuntimePage,
  onRefresh,
  onBenchmark,
  onDownloadModel,
  onUninstallModel,
  onInstallOllama,
}: {
  status: LocalAiDiscoveryResult | null
  benchmark: LocalAiBenchmarkResult | null
  loading: boolean
  benchmarking: boolean
  /** In-flight pulls keyed by model id; survives Settings being closed and reopened. */
  downloads: Record<string, LocalAiModelDownloadProgress>
  uninstallingModel: string | null
  openingRuntimePage: boolean
  onRefresh: () => void
  onBenchmark: () => void
  onDownloadModel: (modelId: string) => void
  onUninstallModel: (modelId: string) => void
  onInstallOllama: () => void
}) {
  const t = useT()
  // The benchmark and CPU/GPU comparison are detail; the row stays one line until asked.
  const [showDetails, setShowDetails] = useState(false)
  const available = status?.available ?? false
  const models = status?.models ?? []
  const suggestions = status?.suggestedModels?.length ? status.suggestedModels : benchmark?.suggestedModels ?? []
  const hardware = status?.hardware ?? benchmark?.hardware
  const metrics = benchmark?.metrics
  const canDownloadModels = status?.engine === 'ollama'
  const showRuntimeInstallPanel = !canDownloadModels
  const recommended = models.find((model) => model.id === status?.recommendedModel)
    ?? suggestions.find((model) => model.id === (status?.recommendedModel ?? benchmark?.recommendedModel))
  const anyDownloading = Object.keys(downloads).length > 0
  const formatModelDownloadBytes = (progress: LocalAiModelDownloadProgress) => {
    if (!progress.completedBytes || !progress.totalBytes) return null
    const completedGb = Math.round((progress.completedBytes / 1024 ** 3) * 10) / 10
    const totalGb = Math.round((progress.totalBytes / 1024 ** 3) * 10) / 10
    return `${completedGb}/${totalGb} GB`
  }

  const hardwareSummary = hardware
    ? [
        `${t.settings_local_ai_tier}: ${hardware.tier}`,
        hardware.vramGb === undefined
          ? null
          : hardware.vramGb > 0
            ? `GPU ${hardware.gpuName ? `${hardware.gpuName} · ` : ''}${hardware.vramGb} GB`
            : t.settings_local_ai_gpu_none,
        `RAM ${hardware.totalMemoryGb} GB`,
        `CPU ${hardware.cpuCount} cores`,
      ].filter(Boolean).join(' · ')
    : null

  return (
    <SettingsCard
      title={t.settings_local_ai_title}
      headingLevel={3}
      description={available
        ? `${t.settings_local_ai_desc} ${status?.engine ?? 'local'} · ${status?.endpoint ?? ''}`
        : t.settings_local_ai_unavailable}
      aside={(
        <StatusLabel tone={available ? 'ok' : 'neutral'}>
          {available ? t.settings_local_ai_running : t.settings_local_ai_not_running}
        </StatusLabel>
      )}
    >
      {showRuntimeInstallPanel && (
        <SettingsRow
          label={t.settings_local_ai_install_runtime_title}
          description={t.settings_local_ai_install_runtime_desc}
        >
          <Button
            size="sm"
            shape="rect"
            variant="primary"
            appearance="solid"
            type="button"
            onClick={onInstallOllama}
            disabled={openingRuntimePage}
          >
            {t.settings_local_ai_install_ollama}
          </Button>
        </SettingsRow>
      )}

      {suggestions.slice(0, 5).map((model) => {
        const activeDownloadProgress = downloads[model.id] ?? null
        const isDownloading = activeDownloadProgress !== null
        const isUninstalling = uninstallingModel === model.id
        const activeDownloadPercent = Math.max(1, Math.min(100, activeDownloadProgress?.percent ?? 1))
        const activeDownloadBytes = activeDownloadProgress ? formatModelDownloadBytes(activeDownloadProgress) : null
        const buttonLabel = model.installed
          ? t.settings_local_ai_uninstall
          : canDownloadModels
            ? t.settings_local_ai_download
            : t.settings_local_ai_waiting_runtime
        const meta = [
          model.installed ? t.settings_local_ai_installed : null,
          model.id === recommended?.id ? t.settings_local_ai_recommended : null,
          model.estimatedSizeGb ? `~${model.estimatedSizeGb} GB` : null,
        ].filter(Boolean).join(' · ')
        return (
          <SettingsRow
            key={model.id}
            label={<code className="local-ai-model-id">{model.id}</code>}
            description={[meta, model.name].filter(Boolean).join(' · ')}
            below={activeDownloadProgress ? (
              <div className="local-ai-download">
                <div className="local-ai-download__meta">
                  <span>{t.settings_local_ai_downloading_model}: {activeDownloadProgress.message}</span>
                  <span>{activeDownloadBytes ? `${activeDownloadBytes} · ` : ''}{activeDownloadPercent}%</span>
                </div>
                <Meter value={activeDownloadPercent} min={0} max={100} label={t.settings_local_ai_downloading_model} valueText={`${activeDownloadPercent}%`} />
              </div>
            ) : undefined}
          >
            {canDownloadModels ? (
              <Button
                size="sm"
                shape="rect"
                variant={model.installed ? 'danger' : 'neutral'}
                appearance={model.installed ? 'ghost' : 'outline'}
                type="button"
                onClick={() => model.installed ? onUninstallModel(model.id) : onDownloadModel(model.id)}
                disabled={anyDownloading || Boolean(uninstallingModel)}
              >
                {(isDownloading || isUninstalling) && <SpinnerIcon className="animate-spin" />}
                {!model.installed && !isDownloading && <DownloadIcon />}
                {isDownloading
                  ? `${activeDownloadPercent}%`
                  : isUninstalling
                    ? t.settings_local_ai_uninstalling
                    : buttonLabel}
              </Button>
            ) : (
              <span className="local-ai-model-state">{buttonLabel}</span>
            )}
          </SettingsRow>
        )
      })}

      <SettingsRow
        label={t.settings_local_ai_performance}
        description={hardwareSummary ?? (available
          ? `${models.length} ${t.settings_local_ai_models_found}`
          : t.settings_local_ai_start_runtime)}
        below={showDetails && (metrics || status?.engine === 'ollama') ? (
          <div className="local-ai-performance">
            {metrics && (
              <dl className="local-ai-metrics">
                <div>
                  <dt title={metrics.runtimeModel}>
                    {metrics.runtimeTokensPerSecond
                      ? `${t.settings_local_ai_runtime_speed}${metrics.runtimeModel ? ` · ${metrics.runtimeModel}` : ''}`
                      : t.settings_local_ai_benchmark_duration}
                  </dt>
                  <dd>
                    {metrics.runtimeTokensPerSecond
                      ? `${metrics.runtimeTokensPerSecond} tok/s`
                      : `${Math.round(metrics.durationMs / 100) / 10}s`}
                  </dd>
                </div>
                {metrics.runtimeGpuPercent !== undefined && (
                  <div>
                    <dt>{t.settings_local_ai_gpu_offload}</dt>
                    <dd data-testid="local-ai-gpu-percent">{metrics.runtimeGpuPercent}%</dd>
                  </div>
                )}
                {metrics.runtimeLatencyMs && (
                  <div>
                    <dt>{t.settings_local_ai_runtime_latency}</dt>
                    <dd>{metrics.runtimeLatencyMs}ms</dd>
                  </div>
                )}
              </dl>
            )}
            {metrics?.runtimeGpuPercent !== undefined && metrics.runtimeGpuPercent < 100 && (
              <CapabilityNotice tone="warning" title={t.settings_local_ai_gpu_spill_warning} />
            )}
            {status?.engine === 'ollama' && <LocalAiPerformanceSection models={models} />}
          </div>
        ) : undefined}
      >
        {(metrics || status?.engine === 'ollama') && (
          <Button
            size="sm"
            shape="rect"
            variant="neutral"
            appearance={showDetails ? 'soft' : 'ghost'}
            type="button"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((value) => !value)}
          >
            {t.settings_local_ai_details}
          </Button>
        )}
        <Button
          size="sm"
          shape="icon"
          variant="neutral"
          appearance="ghost"
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label={t.model_refresh}
          title={t.model_refresh}
        >
          {loading ? <SpinnerIcon className="animate-spin" /> : <RefreshIcon />}
        </Button>
        <Button
          size="sm"
          shape="rect"
          variant="neutral"
          appearance="outline"
          type="button"
          onClick={onBenchmark}
          disabled={benchmarking}
        >
          {benchmarking ? <SpinnerIcon className="animate-spin" /> : null}
          {benchmarking ? t.settings_local_ai_benchmarking : t.settings_local_ai_benchmark}
        </Button>
      </SettingsRow>
    </SettingsCard>
  )
}

export function ApiKeysSection() {
  const setKeyStatus = useAppStore((state) => state.setKeyStatus)
  const setDynamicModels = useAppStore((state) => state.setDynamicModels)
  const setModelsLoading = useAppStore((state) => state.setModelsLoading)
  const setModelsError = useAppStore((state) => state.setModelsError)
  const setSelectedModel = useAppStore((state) => state.setSelectedModel)
  const costCurrency = useAppStore((state) => state.costCurrency)
  const setCostCurrency = useAppStore((state) => state.setCostCurrency)
  const apiKeyUsageTotals = useAppStore((state) => state.apiKeyUsageTotals)
  const resetProviderUsageCost = useAppStore((state) => state.resetProviderUsageCost)
  const resetAllUsageCost = useAppStore((state) => state.resetAllUsageCost)
  const t = useT()
  const cloudProviders = PROVIDERS.filter((provider) => provider.requiresApiKey !== false)

  const [keyData, setKeyData] = useState<Record<string, { exists: boolean; masked: string | null }>>({
    gemini: { exists: false, masked: null },
    claude: { exists: false, masked: null },
    openai: { exists: false, masked: null },
  })
  const [localStatus, setLocalStatus] = useState<LocalAiDiscoveryResult | null>(null)
  const [localBenchmark, setLocalBenchmark] = useState<LocalAiBenchmarkResult | null>(null)
  const [localLoading, setLocalLoading] = useState(false)
  const [localBenchmarking, setLocalBenchmarking] = useState(false)
  // Pulls keep running in the main process after Settings closes, so this is rebuilt from a
  // main-process snapshot on mount and then kept current by progress events keyed by model.
  const [downloads, setDownloads] = useState<Record<string, LocalAiModelDownloadProgress>>({})
  const [uninstallingModel, setUninstallingModel] = useState<string | null>(null)
  const [openingRuntimePage, setOpeningRuntimePage] = useState(false)
  const notify = useNotificationStore((state) => state.notify)
  const dismissNotification = useNotificationStore((state) => state.dismiss)
  /** Download/uninstall/install outcomes go to the toast stack, one at a time. */
  const reportLocalAi = (tone: 'success' | 'error', message: string) =>
    notify({ key: LOCAL_AI_NOTICE_KEY, tone, message })

  const refreshLocalAi = async (): Promise<LocalAiDiscoveryResult | null> => {
    if (!window.api?.discoverLocalAi) return null
    setLocalLoading(true)
    try {
      const result = window.api.ensureLocalAiRuntime
        ? await window.api.ensureLocalAiRuntime()
        : await window.api.discoverLocalAi(true)
      setLocalStatus(result)
      setLocalBenchmark({
        hardware: result.hardware,
        suggestedModels: result.suggestedModels,
        recommendedModel: result.suggestedModels[0]?.id,
      })
      setKeyStatus('local', result.available)
      setDynamicModels('local', result.models)
      // Only override the user's saved local model when their previous choice
      // is no longer installed/available — otherwise opening Settings (which
      // triggers a refresh) would silently reset the model back to the
      // recommended default every single time.
      const installedIds = result.models.map((m) => m.id)
      // Read live: this also runs from a long-lived progress listener whose render closure is stale.
      const previousLocalModel = useAppStore.getState().selectedModels.local
      const previousIsValid = Boolean(previousLocalModel) && (
        installedIds.includes(previousLocalModel) || previousLocalModel === 'local-auto'
      )
      if (!previousIsValid) {
        setSelectedModel('local', result.recommendedModel ?? 'local-auto')
      }
      return result
    } finally {
      setLocalLoading(false)
    }
  }

  const runLocalBenchmark = async () => {
    if (!window.api?.benchmarkLocalAi) return
    setLocalBenchmarking(true)
    try {
      const result = await window.api.benchmarkLocalAi()
      setLocalBenchmark(result)
    } finally {
      setLocalBenchmarking(false)
    }
  }

  const trackDownload = (progress: LocalAiModelDownloadProgress) => {
    setDownloads((prev) => ({ ...prev, [progress.model]: progress }))
  }

  const untrackDownload = (modelId: string) => {
    setDownloads((prev) => {
      if (!(modelId in prev)) return prev
      const { [modelId]: _removed, ...rest } = prev
      return rest
    })
  }

  const handleDownloadLocalModel = async (modelId: string) => {
    if (!window.api?.downloadLocalAiModel) return
    trackDownload({
      model: modelId,
      status: 'running',
      percent: 1,
      message: t.settings_local_ai_downloading_model,
    })
    dismissNotification(LOCAL_AI_NOTICE_KEY)
    try {
      const result = await window.api.downloadLocalAiModel(modelId)
      if (!result.success) {
        // Already running in main (e.g. started before Settings was closed): keep showing
        // its progress instead of reporting an error for a download that is healthy.
        if (result.error === ALREADY_DOWNLOADING_ERROR) return
        untrackDownload(modelId)
        reportLocalAi('error', result.error ?? t.settings_local_ai_download_failed)
        return
      }
      untrackDownload(modelId)
      reportLocalAi('success', `${t.settings_local_ai_downloaded}: ${result.model}`)
      await refreshLocalAi()
    } catch (err) {
      untrackDownload(modelId)
      reportLocalAi('error', err instanceof Error ? err.message : t.settings_local_ai_download_failed)
    }
  }

  const handleUninstallLocalModel = async (modelId: string) => {
    setUninstallingModel(modelId)
    dismissNotification(LOCAL_AI_NOTICE_KEY)
    try {
      if (!window.api?.uninstallLocalAiModel) {
        reportLocalAi('error', t.settings_local_ai_uninstall_failed)
        return
      }
      const result = await window.api.uninstallLocalAiModel(modelId)
      if (!result.success) {
        reportLocalAi('error', result.error ?? t.settings_local_ai_uninstall_failed)
        return
      }
      reportLocalAi('success', `${t.settings_local_ai_uninstalled}: ${result.model}`)
      await refreshLocalAi()
    } catch (err) {
      reportLocalAi('error', err instanceof Error ? err.message : t.settings_local_ai_uninstall_failed)
    } finally {
      setUninstallingModel(null)
    }
  }

  // Viezan only opens the runtime's download page; the user installs it, comes back
  // and presses Refresh. There is no installer process, so no progress or cancel.
  const handleInstallOllama = async () => {
    if (!window.api?.installOllama) return
    setOpeningRuntimePage(true)
    dismissNotification(LOCAL_AI_NOTICE_KEY)
    try {
      const result = await window.api.installOllama()
      if (!result.success) {
        reportLocalAi('error', result.error ?? t.settings_local_ai_install_failed)
        return
      }
      reportLocalAi('success', t.settings_local_ai_manual_install_opened)
    } catch (err) {
      reportLocalAi('error', err instanceof Error ? err.message : t.settings_local_ai_install_failed)
    } finally {
      setOpeningRuntimePage(false)
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: subscribe once on mount; the handlers only touch stable setters
  useEffect(() => {
    if (!window.api?.onLocalAiModelDownloadProgress) return
    let active = true
    const unsubscribe = window.api.onLocalAiModelDownloadProgress((progress) => {
      if (progress.status === 'running') {
        trackDownload(progress)
        return
      }
      untrackDownload(progress.model)
      if (progress.status === 'error') {
        reportLocalAi('error', progress.message)
        return
      }
      // A pull started before Settings was reopened finishes with no invoke() left to
      // refresh the catalog, so do it from the event.
      void refreshLocalAi()
    })
    // Resume pulls that kept running while Settings was closed.
    void window.api.getLocalAiActiveDownloads?.().then((running) => {
      if (!active) return
      setDownloads((prev) => {
        const next = { ...prev }
        for (const progress of running) next[progress.model] ??= progress
        return next
      })
    }).catch(() => { /* snapshot is best-effort; live events still update the UI */ })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount; store setters are stable
  useEffect(() => {
    const loadKeys = async () => {
      if (!window.api) return
      for (const p of cloudProviders) {
        try {
          const result = await window.api.keychain.get(p.id)
          setKeyData((prev) => ({
            ...prev,
            [p.id]: { exists: result.exists ?? false, masked: result.masked ?? null },
          }))
          setKeyStatus(p.id as Provider, result.exists ?? false)
        } catch { /* ignore */ }
      }
    }
    loadKeys()
    void refreshLocalAi()
  }, [])

  const handleSaveKey = async (providerId: string, key: string) => {
    if (!window.api) throw new Error('App API not available')
    const provider = providerId as Provider
    const result = await window.api.keychain.save(providerId, key)
    if (!result.success) throw new Error(result.error || 'Failed to save key')
    const updated = await window.api.keychain.get(providerId)
    setKeyData((prev) => ({
      ...prev,
      [providerId]: { exists: updated.exists ?? false, masked: updated.masked ?? null },
    }))
    setKeyStatus(provider, true)
    setDynamicModels(provider, [])
    resetProviderUsageCost(provider)

    // A stored key immediately unlocks the provider's model catalog. Model
    // discovery is best-effort: billing/permission/network issues must not
    // turn a successful keychain write into a failed save operation.
    setModelsLoading(provider, true)
    setModelsError(provider, null)
    try {
      const modelsResult = await window.api.fetchModels(providerId)
      if (!modelsResult.success || modelsResult.models.length === 0) {
        setModelsError(provider, modelsResult.error || 'No models available')
        return
      }

      setDynamicModels(provider, modelsResult.models)
      const availableIds = new Set(modelsResult.models.map((model) => model.id))
      const currentModel = useAppStore.getState().selectedModels[provider]
      if (!currentModel || !availableIds.has(currentModel)) {
        setSelectedModel(provider, modelsResult.recommendedModel ?? modelsResult.models[0].id)
      }
    } catch (error) {
      setModelsError(provider, error instanceof Error ? error.message : 'Failed to load models')
    } finally {
      setModelsLoading(provider, false)
    }
  }

  const handleDeleteKey = async (providerId: string) => {
    if (!window.api) throw new Error('App API not available')
    const result = await window.api.keychain.delete(providerId)
    if (!result.success) throw new Error(result.error || t.settings_key_store_failed)
    setKeyData((prev) => ({
      ...prev,
      [providerId]: { exists: false, masked: null },
    }))
    setKeyStatus(providerId as Provider, false)
    setDynamicModels(providerId as Provider, [])
    resetProviderUsageCost(providerId as Provider)
  }

  const totalUsd = Object.values(apiKeyUsageTotals).reduce((sum, total) => sum + (total?.amountUsd ?? 0), 0)

  return (
    <div className="settings-section-stack">
      <header>
        <h2 className="settings-section-title">{t.settings_api_keys}</h2>
        <p className="settings-section-desc">{t.settings_api_keys_desc}</p>
      </header>

      <LocalAiProviderCard
        status={localStatus}
        benchmark={localBenchmark}
        loading={localLoading}
        benchmarking={localBenchmarking}
        downloads={downloads}
        uninstallingModel={uninstallingModel}
        openingRuntimePage={openingRuntimePage}
        onRefresh={refreshLocalAi}
        onBenchmark={runLocalBenchmark}
        onDownloadModel={handleDownloadLocalModel}
        onUninstallModel={handleUninstallLocalModel}
        onInstallOllama={handleInstallOllama}
      />

      <SettingsCard
        title={t.settings_cloud_providers}
        headingLevel={3}
        description={t.settings_cloud_providers_desc}
        aside={(
          <span className="settings-card-meta">
            {t.settings_cost_total}: {formatUsageAmount(totalUsd, costCurrency)}
          </span>
        )}
      >
        {cloudProviders.map((provider) => (
          <ApiKeyInput
            key={provider.id}
            provider={provider}
            hasKey={keyData[provider.id]?.exists ?? false}
            maskedKey={keyData[provider.id]?.masked ?? null}
            usageTotal={apiKeyUsageTotals[provider.id]}
            usageCurrency={costCurrency}
            usageLabel={t.settings_cost_total}
            onSave={(key) => handleSaveKey(provider.id, key)}
            onDelete={() => handleDeleteKey(provider.id)}
            onResetUsage={() => resetProviderUsageCost(provider.id as Provider)}
          />
        ))}
      </SettingsCard>

      <SettingsCard
        title={t.settings_web_search_section}
        headingLevel={3}
        description={(
          <>
            {t.settings_web_search_desc_prefix}{' '}
            {/* Native exception: text link in copy, not a boxed control (see .settings-inline-link). */}
            <button
              type="button"
              className="settings-inline-link"
              onClick={() => window.api?.openExternal(JINA_DOCS_URL)}
            >
              Jina AI
            </button>
            {' '}{t.settings_web_search_desc_suffix}
          </>
        )}
      >
        <DeepResearchApiSection />
      </SettingsCard>

      {/* Spend, tokens and the per-feature breakdown behind the total above. */}
      <CostOverviewCard
        totals={apiKeyUsageTotals}
        currency={costCurrency}
        onCurrencyChange={setCostCurrency}
        onResetAll={resetAllUsageCost}
      />
    </div>
  )
}

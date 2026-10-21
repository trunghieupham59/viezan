import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/atoms'
import { ApiKeyInput } from '../../components/ApiKeyInput'
import { DeepResearchApiSection } from '../../components/chat/DeepResearchApiSection'
import { CostOverviewCard } from '../../components/cost/CostOverviewCard'
import { ProviderIcon } from '../../components/ProviderIcon'
import { DownloadIcon, RefreshIcon, SpinnerIcon, TrashIcon } from '../../components/ui/icons'
import { PROVIDERS } from '../../constants/providers'
import { JINA_DOCS_URL } from '../../constants/urls'
import { useAppStore, useT } from '../../store/useAppStore'
import type {
  LocalAiBenchmarkResult,
  LocalAiDiscoveryResult,
  LocalAiModelDownloadProgress,
  Provider,
} from '../../types'
import { LocalAiPerformanceSection } from './LocalAiPerformanceSection'

/** Main-process message for a model whose pull is already in flight (see downloadLocalAiModel). */
const ALREADY_DOWNLOADING_ERROR = 'This model is already being downloaded.'

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
  downloadError,
  downloadSuccess,
  installError,
  installSuccess,
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
  downloadError: string | null
  downloadSuccess: string | null
  installError: string | null
  installSuccess: string | null
}) {
  const t = useT()
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

  return (
    <div className="card p-4 space-y-3 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-gray-700 flex-shrink-0">
            <ProviderIcon provider="local" size={22} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t.settings_local_ai_title}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {available
                ? `${status?.engine ?? 'local'} · ${status?.endpoint ?? ''}`
                : t.settings_local_ai_unavailable}
            </p>
          </div>
        </div>
        <span className={[
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
          available
            ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
        ].join(' ')}>
          <span className={[
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            available ? 'bg-gray-500' : 'bg-gray-400',
          ].join(' ')} />
          {available ? t.settings_local_ai_running : t.settings_local_ai_not_running}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 settings-inset rounded-lg px-3 py-2 text-xs">
        <div className="min-w-0">
          <p className="font-medium text-gray-700 dark:text-gray-200">
            {recommended ? recommended.name : t.settings_local_ai_model_waiting}
          </p>
          <p className="text-gray-500 dark:text-gray-400">
            {available
              ? `${models.length} ${t.settings_local_ai_models_found} · ${hardware?.tier ?? 'balanced'}`
              : t.settings_local_ai_start_runtime}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button
            size="md"
            shape="rect"
            variant="neutral"
            appearance="outline"
            type="button"
            onClick={onBenchmark}
            disabled={benchmarking}
          >
            {benchmarking ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin" /> : null}
            {benchmarking ? t.settings_local_ai_benchmarking : t.settings_local_ai_benchmark}
          </Button>
          <Button
            size="md"
            shape="rect"
            variant="neutral"
            appearance="outline"
            type="button"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin" /> : <RefreshIcon className="w-3.5 h-3.5" />}
            {t.model_refresh}
          </Button>
        </div>
      </div>

      {hardware && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="settings-inset rounded-lg px-3 py-2">
            <p className="text-gray-400">{t.settings_local_ai_tier}</p>
            <p className="font-medium text-gray-700 dark:text-gray-200">{hardware.tier}</p>
          </div>
          <div className="settings-inset rounded-lg px-3 py-2">
            <p className="text-gray-400">GPU</p>
            <p className="font-medium text-gray-700 dark:text-gray-200" data-testid="local-ai-gpu">
              {hardware.vramGb === undefined
                ? '-'
                : hardware.vramGb > 0
                  ? `${hardware.gpuName ? `${hardware.gpuName} · ` : ''}${hardware.vramGb} GB`
                  : t.settings_local_ai_gpu_none}
            </p>
          </div>
          <div className="settings-inset rounded-lg px-3 py-2">
            <p className="text-gray-400">RAM</p>
            <p className="font-medium text-gray-700 dark:text-gray-200">{hardware.totalMemoryGb} GB</p>
          </div>
          <div className="settings-inset rounded-lg px-3 py-2">
            <p className="text-gray-400">CPU</p>
            <p className="font-medium text-gray-700 dark:text-gray-200">{hardware.cpuCount} cores</p>
          </div>
        </div>
      )}

      {metrics && (
        <div className="space-y-2 text-xs">
          {/* One compact row: the benchmark result must not push the model list down. */}
          <div className="flex gap-2">
            <div className="settings-inset min-w-0 flex-1 rounded-lg px-3 py-2">
              <p className="truncate text-gray-400" title={metrics.runtimeModel}>
                {metrics.runtimeTokensPerSecond
                  ? `${t.settings_local_ai_runtime_speed}${metrics.runtimeModel ? ` · ${metrics.runtimeModel}` : ''}`
                  : t.settings_local_ai_benchmark_duration}
              </p>
              <p className="font-medium text-gray-700 dark:text-gray-200">
                {metrics.runtimeTokensPerSecond
                  ? `${metrics.runtimeTokensPerSecond} tok/s`
                  : `${Math.round(metrics.durationMs / 100) / 10}s`}
              </p>
            </div>
            {metrics.runtimeGpuPercent !== undefined && (
              <div className="settings-inset min-w-0 flex-1 rounded-lg px-3 py-2">
                <p className="truncate text-gray-400">{t.settings_local_ai_gpu_offload}</p>
                <p className="font-medium text-gray-700 dark:text-gray-200" data-testid="local-ai-gpu-percent">
                  {metrics.runtimeGpuPercent}%
                </p>
              </div>
            )}
            {metrics.runtimeLatencyMs && (
              <div className="settings-inset min-w-0 flex-1 rounded-lg px-3 py-2">
                <p className="truncate text-gray-400">{t.settings_local_ai_runtime_latency}</p>
                <p className="font-medium text-gray-700 dark:text-gray-200">{metrics.runtimeLatencyMs}ms</p>
              </div>
            )}
          </div>
          {metrics.runtimeGpuPercent !== undefined && metrics.runtimeGpuPercent < 100 && (
            <p
              role="status"
              className="rounded-lg border px-3 py-2"
              style={{
                color: 'var(--vzn-warning)',
                background: 'var(--vzn-warning-soft)',
                borderColor: 'var(--vzn-warning-border)',
              }}
            >
              {t.settings_local_ai_gpu_spill_warning}
            </p>
          )}
        </div>
      )}

      {status?.engine === 'ollama' && <LocalAiPerformanceSection models={models} />}

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t.settings_local_ai_suggested_models}
            </h4>
            {canDownloadModels ? (
              <span className="ui-meta text-gray-400">{t.settings_local_ai_download_hint}</span>
            ) : (
              <Button
                size="md"
                shape="rect"
                variant="primary"
                appearance="solid"
                type="button"
                onClick={onInstallOllama}
                disabled={openingRuntimePage}
                className="flex-shrink-0"
              >
                {t.settings_local_ai_install_ollama}
              </Button>
            )}
          </div>

          {showRuntimeInstallPanel && (
            <div className="settings-inset rounded-xl px-3 py-3 text-xs">
              <p className="font-semibold text-gray-800 dark:text-gray-100">
                {t.settings_local_ai_install_runtime_title}
              </p>
              <p className="mt-1 text-gray-500 dark:text-gray-400">
                {t.settings_local_ai_install_runtime_desc}
              </p>
            </div>
          )}

          <div className="space-y-2">
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
              return (
                <div
                  key={model.id}
                  className="settings-inset-row rounded-lg px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-gray-800 dark:text-gray-100">{model.name}</p>
                        {model.id === recommended?.id && (
                          <span className="ui-badge text-xs font-medium text-gray-600 dark:bg-gray-950/50 dark:text-gray-300">
                            {t.settings_local_ai_recommended}
                          </span>
                        )}
                        {model.installed && (
                          <span className="ui-badge text-xs font-medium text-gray-600 dark:bg-gray-950/50 dark:text-gray-300">
                            {t.settings_local_ai_installed}
                          </span>
                        )}
                        {model.estimatedSizeGb && (
                          <span className="ui-badge text-xs font-medium text-gray-500 dark:text-gray-400">
                            {t.settings_local_ai_model_size} ~{model.estimatedSizeGb} GB
                          </span>
                        )}
                      </div>
                      <p className="text-gray-500 dark:text-gray-400">{model.description}</p>
                    </div>
                    {canDownloadModels ? (
                      <Button
                        size="md"
                        shape="rect"
                        variant={model.installed ? 'danger' : 'primary'}
                        appearance={model.installed ? 'soft' : 'solid'}
                        type="button"
                        onClick={() => model.installed ? onUninstallModel(model.id) : onDownloadModel(model.id)}
                        disabled={anyDownloading || Boolean(uninstallingModel)}
                        className="flex-shrink-0"
                      >
                        {(isDownloading || isUninstalling) && <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />}
                        {!model.installed && !isDownloading && <DownloadIcon className="w-3.5 h-3.5" />}
                        {model.installed && !isUninstalling && <TrashIcon className="w-3.5 h-3.5" />}
                        {isDownloading
                          ? `${activeDownloadPercent}%`
                          : isUninstalling
                            ? t.settings_local_ai_uninstalling
                            : buttonLabel}
                      </Button>
                    ) : (
                      <span className="hidden flex-shrink-0 settings-inset rounded-lg px-3 py-1.5 font-medium text-gray-400 sm:block">
                        {buttonLabel}
                      </span>
                    )}
                  </div>
                  {activeDownloadProgress && (
                    <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-950/20">
                      <div className="ui-meta flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate font-medium text-gray-700 dark:text-gray-300">
                          {t.settings_local_ai_downloading_model}: {activeDownloadProgress.message}
                        </span>
                        <span className="flex-shrink-0 font-semibold text-gray-700 dark:text-gray-300">
                          {activeDownloadBytes ? `${activeDownloadBytes} · ` : ''}{activeDownloadPercent}%
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white ring-1 ring-gray-100 dark:bg-gray-950 dark:ring-gray-900">
                        <div
                          className="h-full rounded-full bg-gray-600 transition-[width] duration-300"
                          style={{ width: `${activeDownloadPercent}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {(downloadError || downloadSuccess || installError || installSuccess) && (
        <p className={[
          'rounded-lg px-3 py-2 text-xs font-medium',
          downloadError || installError
            ? 'ui-error-box text-xs font-medium'
            : 'bg-gray-50 text-gray-700 dark:bg-gray-900/20 dark:text-gray-300',
        ].join(' ')}>
          {downloadError ?? installError ?? downloadSuccess ?? installSuccess}
        </p>
      )}

      {!available && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t.settings_local_ai_start_runtime}
        </p>
      )}
    </div>
  )
}

export function ApiKeysSection() {
  const setKeyStatus = useAppStore((state) => state.setKeyStatus)
  const keyStatus = useAppStore((state) => state.keyStatus)
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
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)
  const [installSuccess, setInstallSuccess] = useState<string | null>(null)

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
    setDownloadError(null)
    setDownloadSuccess(null)
    setInstallError(null)
    setInstallSuccess(null)
    try {
      const result = await window.api.downloadLocalAiModel(modelId)
      if (!result.success) {
        // Already running in main (e.g. started before Settings was closed): keep showing
        // its progress instead of reporting an error for a download that is healthy.
        if (result.error === ALREADY_DOWNLOADING_ERROR) return
        untrackDownload(modelId)
        setDownloadError(result.error ?? t.settings_local_ai_download_failed)
        return
      }
      untrackDownload(modelId)
      setDownloadSuccess(`${t.settings_local_ai_downloaded}: ${result.model}`)
      await refreshLocalAi()
    } catch (err) {
      untrackDownload(modelId)
      setDownloadError(err instanceof Error ? err.message : t.settings_local_ai_download_failed)
    }
  }

  const handleUninstallLocalModel = async (modelId: string) => {
    setUninstallingModel(modelId)
    setDownloadError(null)
    setDownloadSuccess(null)
    setInstallError(null)
    setInstallSuccess(null)
    try {
      if (!window.api?.uninstallLocalAiModel) {
        setDownloadError(t.settings_local_ai_uninstall_failed)
        return
      }
      const result = await window.api.uninstallLocalAiModel(modelId)
      if (!result.success) {
        setDownloadError(result.error ?? t.settings_local_ai_uninstall_failed)
        return
      }
      setDownloadSuccess(`${t.settings_local_ai_uninstalled}: ${result.model}`)
      await refreshLocalAi()
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : t.settings_local_ai_uninstall_failed)
    } finally {
      setUninstallingModel(null)
    }
  }

  // Viezan only opens the runtime's download page; the user installs it, comes back
  // and presses Refresh. There is no installer process, so no progress or cancel.
  const handleInstallOllama = async () => {
    if (!window.api?.installOllama) return
    setOpeningRuntimePage(true)
    setDownloadError(null)
    setDownloadSuccess(null)
    setInstallError(null)
    setInstallSuccess(null)
    try {
      const result = await window.api.installOllama()
      if (!result.success) {
        setInstallError(result.error ?? t.settings_local_ai_install_failed)
        return
      }
      setInstallSuccess(t.settings_local_ai_manual_install_opened)
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : t.settings_local_ai_install_failed)
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
        setDownloadError(progress.message)
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

  const configuredCount = PROVIDERS.filter((p) =>
    p.requiresApiKey === false ? localStatus?.available : keyStatus[p.id] || keyData[p.id]?.exists
  ).length

  return (
    <div className="space-y-8">
      {/* Cost tracking dashboard — surfaces aggregate spend, tokens, and feature breakdown.
          Replaces the bare currency dropdown that used to live in the API Keys header. */}
      <section className="space-y-3">
        <CostOverviewCard
          totals={apiKeyUsageTotals}
          currency={costCurrency}
          onCurrencyChange={setCostCurrency}
          onResetAll={resetAllUsageCost}
        />
      </section>

      {/* AI Provider API Keys */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-label">{t.settings_api_keys}</h2>
          <span className="text-xs text-gray-400">
            {configuredCount}/{PROVIDERS.length} {t.settings_configured}
          </span>
        </div>
        {PROVIDERS.map((provider) => (
          provider.requiresApiKey === false ? (
            <LocalAiProviderCard
              key={provider.id}
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
              downloadError={downloadError}
              downloadSuccess={downloadSuccess}
              installError={installError}
              installSuccess={installSuccess}
            />
          ) : (
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
          )
        ))}
      </section>

      {/* Deep Research Web Search API Keys */}
      <section className="space-y-3 border-t border-gray-200 pt-6 dark:border-gray-700">
        <div>
          <h2 className="section-label">{t.settings_web_search_section}</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t.settings_web_search_desc_prefix}{' '}
            <Button
              size="md"
              shape="rect"
              variant="neutral"
              appearance="ghost"
              type="button"
              onClick={() => window.api?.openExternal(JINA_DOCS_URL)}
            >
              Jina AI
            </Button>
            {' '}{t.settings_web_search_desc_suffix}
          </p>
        </div>

        {/* Shared provider table */}
        <DeepResearchApiSection />
      </section>
    </div>
  )
}

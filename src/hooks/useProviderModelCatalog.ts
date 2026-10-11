import { useCallback, useEffect, useRef, useState } from 'react'
import { PROVIDERS } from '../constants/providers'
import { useAppStore, useT } from '../store/useAppStore'
import type { Provider } from '../types'

/**
 * Providers whose catalog is loaded automatically once a key exists. `local` is excluded:
 * fetching it probes for a local runtime, so it stays a manual refresh.
 */
const AUTO_LOAD_PROVIDERS = PROVIDERS
  .filter((provider) => provider.requiresApiKey !== false)
  .map((provider) => provider.id as Provider)

/**
 * Keeps the live model catalog of keyed providers in the shared store.
 *
 * `dynamicModels` is in-memory only, so without this the picker would show the bundled
 * fallback list until someone pressed refresh. The first load per mount is automatic;
 * `isPending` lets the UI show a loading state instead of that fallback while it runs.
 */
export function useProviderModelCatalog() {
  const t = useT()
  const keyStatus = useAppStore((state) => state.keyStatus)
  const dynamicModels = useAppStore((state) => state.dynamicModels)
  const modelsLoading = useAppStore((state) => state.modelsLoading)
  const requested = useRef(new Set<Provider>())
  const [settled, setSettled] = useState<ReadonlySet<Provider>>(() => new Set())

  const markSettled = useCallback((provider: Provider) => {
    setSettled((previous) => new Set(previous).add(provider))
  }, [])

  const refreshProvider = useCallback(async (provider: Provider) => {
    const state = useAppStore.getState()
    const config = PROVIDERS.find((candidate) => candidate.id === provider)
    const hasKey = config?.requiresApiKey === false || state.keyStatus[provider]
    if (!hasKey || state.modelsLoading[provider]) return
    if (!window.api) {
      markSettled(provider)
      return
    }

    state.setModelsLoading(provider, true)
    state.setModelsError(provider, null)
    try {
      const result = await window.api.fetchModels(provider)
      if (result.success && result.models.length > 0) {
        useAppStore.getState().setDynamicModels(provider, result.models)
      } else {
        useAppStore.getState().setModelsError(provider, result.error || t.model_load_error)
      }
    } catch (_error) {
      useAppStore.getState().setModelsError(provider, t.model_load_error)
    } finally {
      useAppStore.getState().setModelsLoading(provider, false)
      markSettled(provider)
    }
  }, [markSettled, t.model_load_error])

  useEffect(() => {
    for (const provider of AUTO_LOAD_PROVIDERS) {
      if (
        !keyStatus[provider]
        || dynamicModels[provider].length > 0
        || modelsLoading[provider]
        || requested.current.has(provider)
      ) continue
      requested.current.add(provider)
      void refreshProvider(provider)
    }
  }, [dynamicModels, keyStatus, modelsLoading, refreshProvider])

  /** True while a keyed provider has no live catalog yet and its first load has not finished. */
  const isPending = (provider: Provider) =>
    AUTO_LOAD_PROVIDERS.includes(provider)
    && Boolean(keyStatus[provider])
    && dynamicModels[provider].length === 0
    && (modelsLoading[provider] || !settled.has(provider))

  return { refreshProvider, isPending }
}

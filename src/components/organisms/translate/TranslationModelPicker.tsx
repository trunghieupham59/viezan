import { type FocusEvent, useId, useMemo, useState } from 'react'
import { MAX_TRANSLATION_MODELS, PROVIDERS } from '../../../constants/providers'
import { useAppStore, useT } from '../../../store/useAppStore'
import type { Provider, TranslationModelSelection } from '../../../types'
import { dedupeModelsByFamily, formatModelName } from '../../../utils/modelDisplay'
import { ProviderIcon } from '../../ProviderIcon'
import { Button, Input } from '../../ui/atoms'
import { RefreshIcon, SearchIcon, SpinnerIcon } from '../../ui/icons'
import { ModelSelectionRow, SelectedModelChip } from '../../ui/molecules'

interface TranslationModelPickerProps {
  models: TranslationModelSelection[]
  onChange: (models: TranslationModelSelection[]) => void
  onOpenSettings: () => void
}

function modelKey({ provider, model }: TranslationModelSelection) {
  return `${provider}:${model}`
}

/** Searchable one-column model catalog. The owning dialog controls commit/cancel. */
export function TranslationModelPicker({
  models,
  onChange,
  onOpenSettings,
}: TranslationModelPickerProps) {
  const t = useT()
  const pickerId = useId()
  const limitNoticeId = `${pickerId}-limit`
  const [search, setSearch] = useState('')
  const {
    keyStatus,
    dynamicModels,
    modelsLoading,
    modelsError,
    setDynamicModels,
    setModelsLoading,
    setModelsError,
  } = useAppStore()
  const selectedKeys = useMemo(() => new Set(models.map(modelKey)), [models])
  const query = search.trim().toLowerCase()
  const isAtLimit = models.length >= MAX_TRANSLATION_MODELS

  const providerGroups = useMemo(() => PROVIDERS.map((provider) => {
    const providerId = provider.id as Provider
    const available = dynamicModels[providerId].length > 0
      ? dynamicModels[providerId]
      : provider.models
    const deduped = dedupeModelsByFamily(providerId, available)
    const visibleModels = query
      ? deduped.filter((model) => {
          const name = formatModelName(providerId, model.id, model.name).toLowerCase()
          return name.includes(query)
            || model.id.toLowerCase().includes(query)
            || provider.name.toLowerCase().includes(query)
        })
      : deduped
    return { provider, providerId, models: visibleModels }
  }).filter((group) => group.models.length > 0), [dynamicModels, query])

  const refreshProvider = async (provider: Provider) => {
    const config = PROVIDERS.find((candidate) => candidate.id === provider)
    const hasKey = config?.requiresApiKey === false || keyStatus[provider]
    if (!hasKey || modelsLoading[provider]) return

    setModelsLoading(provider, true)
    setModelsError(provider, null)
    try {
      const result = await window.api.fetchModels(provider)
      if (result.success && result.models.length > 0) {
        setDynamicModels(provider, result.models)
      } else {
        setModelsError(provider, result.error || t.model_load_error)
      }
    } catch (_error) {
      setModelsError(provider, t.model_load_error)
    } finally {
      setModelsLoading(provider, false)
    }
  }

  const toggleModel = (selection: TranslationModelSelection) => {
    const key = modelKey(selection)
    if (selectedKeys.has(key)) {
      onChange(models.filter((model) => modelKey(model) !== key))
      return
    }
    if (isAtLimit) return
    onChange([...models, selection])
  }

  const keepFocusedModelVisible = (event: FocusEvent<HTMLButtonElement>) => {
    const row = event.currentTarget
    const scrollRegion = row.closest<HTMLElement>('.translate-model-available-list')
    const providerGroup = row.closest<HTMLElement>('.translate-model-provider-group')
    const providerHeading = providerGroup?.querySelector<HTMLElement>(
      '.translate-model-provider-heading',
    )
    if (!scrollRegion || !providerHeading) return

    const rowBounds = row.getBoundingClientRect()
    const scrollBounds = scrollRegion.getBoundingClientRect()
    const headingBounds = providerHeading.getBoundingClientRect()
    const visibleTop = Math.max(scrollBounds.top, headingBounds.bottom)

    if (rowBounds.top < visibleTop) {
      scrollRegion.scrollTop += rowBounds.top - visibleTop
    } else if (rowBounds.bottom > scrollBounds.bottom) {
      scrollRegion.scrollTop += rowBounds.bottom - scrollBounds.bottom
    }
  }

  return (
    <div className="translate-model-picker">
      <section className="translate-model-selected" aria-labelledby={`${pickerId}-selected`}>
        <div className="translate-model-section-heading">
          <h3 id={`${pickerId}-selected`}>{t.translate_models_selected}</h3>
          <span>{models.length}/{MAX_TRANSLATION_MODELS}</span>
        </div>

        {models.length > 0 ? (
          <ul className="translate-model-selected-list">
            {models.map((selection, index) => {
              const key = modelKey(selection)
              const provider = PROVIDERS.find((candidate) => candidate.id === selection.provider)
              const modelName = formatModelName(selection.provider, selection.model)
              return (
                <li key={key} className="translate-model-selected-item">
                  <SelectedModelChip
                    provider={selection.provider}
                    modelName={modelName}
                    providerName={provider?.name ?? selection.provider}
                    positionLabel={t.translate_models_result_position(index + 1)}
                    removeLabel={t.translate_models_remove}
                    onRemove={() => toggleModel(selection)}
                  />
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="translate-model-selection-empty" role="status">
            {t.translate_models_none_selected}
          </p>
        )}

        {isAtLimit && (
          <p id={limitNoticeId} className="translate-model-limit-notice" role="status">
            {t.translate_models_replace_notice}
          </p>
        )}
      </section>

      <section className="translate-model-available" aria-labelledby={`${pickerId}-available`}>
        <div className="translate-model-catalog-toolbar">
          <div className="translate-model-section-heading">
            <h3 id={`${pickerId}-available`}>{t.translate_models_available}</h3>
          </div>
          <div className="translate-model-search-shell">
            <SearchIcon />
            <Input
              data-model-search
              type="search"
              size="md"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t.model_picker_search_placeholder}
              aria-label={t.model_picker_search_placeholder}
            />
          </div>
        </div>

        <div className="translate-model-available-list">
          {providerGroups.length === 0 && (
            <p className="translate-model-empty" role="status">{t.model_picker_no_results}</p>
          )}
          {providerGroups.map(({ provider, providerId, models: availableModels }) => {
            const hasKey = provider.requiresApiKey === false || keyStatus[providerId]
            const isLoading = modelsLoading[providerId]
            return (
              <section key={providerId} className="translate-model-provider-group">
                <header className="translate-model-provider-heading">
                  <ProviderIcon provider={providerId} size={14} />
                  <span>{provider.name}</span>
                  {!hasKey && <span className="translate-model-key-status">{t.model_no_key}</span>}
                  {!hasKey ? (
                    <Button size="xs" shape="pill" variant="neutral" appearance="ghost" onClick={onOpenSettings}>
                      {t.translate_error_open_settings}
                    </Button>
                  ) : (
                    <Button
                      size="xs"
                      shape="icon"
                      variant="neutral"
                      appearance="ghost"
                      disabled={isLoading}
                      aria-label={`${t.model_refresh}: ${provider.name}`}
                      onClick={() => void refreshProvider(providerId)}
                    >
                      {isLoading ? <SpinnerIcon className="translate-model-spinner" /> : <RefreshIcon />}
                    </Button>
                  )}
                </header>
                {modelsError[providerId] && (
                  <p className="translate-model-load-error" role="alert">{t.model_load_error}</p>
                )}
                <div className="translate-model-options">
                  {availableModels.map((model) => {
                    const selection = { provider: providerId, model: model.id }
                    const isSelected = selectedKeys.has(modelKey(selection))
                    const disabledByLimit = !isSelected && isAtLimit
                    const disabled = !hasKey || disabledByLimit
                    const modelName = formatModelName(providerId, model.id, model.name)
                    const selectionLabel = !hasKey
                      ? t.translate_models_needs_key
                      : disabledByLimit
                        ? t.translate_models_limit_reached
                        : isSelected
                      ? t.translate_models_selected_state
                      : t.translate_models_select
                    return (
                      <ModelSelectionRow
                        key={model.id}
                        modelName={modelName}
                        providerName={provider.name}
                        selected={isSelected}
                        disabled={disabled}
                        statusLabel={selectionLabel}
                        onSelect={() => toggleModel(selection)}
                        onFocus={keepFocusedModelVisible}
                      />
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </section>
    </div>
  )
}

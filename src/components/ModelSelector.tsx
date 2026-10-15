import { type RefObject, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PROVIDERS } from '../constants/providers'
import { useProviderModelCatalog } from '../hooks/useProviderModelCatalog'
import { useAppStore, useT } from '../store/useAppStore'
import type { Provider } from '../types'
import { dedupeModelsByFamily, formatModelName } from '../utils/modelDisplay'
import { ProviderIcon } from './ProviderIcon'
import { Button, Input } from './ui/atoms'
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  RefreshIcon,
  SearchIcon,
  SpinnerIcon,
} from './ui/icons'

type PickerView = 'root' | 'models' | 'providers' | 'advanced'
export type ModelPickerInlineView = Extract<PickerView, 'models' | 'advanced'>

interface PickerPosition {
  top: number
  left: number
  maxHeight: number
  placement: 'above' | 'below'
}

const PICKER_GAP = 6
const VIEWPORT_MARGIN = 8
const PICKER_WIDTH = 320
const PICKER_MAX_HEIGHT = 440

interface ModelSelectorProps {
  compact?: boolean
  /** Renders the searchable catalog immediately inside an owning configuration surface. */
  embedded?: boolean
  /** Renders the picker inside the owning surface instead of a portal. */
  inline?: boolean
  /** Opens directly into the searchable model list. */
  directModelList?: boolean
  /** Removes the trigger while an owning surface displays the inline picker. */
  hideTriggerWhenOpen?: boolean
  /** Lets an owning surface request that the inline picker return to its trigger. */
  closeRequest?: number
  /** Lets an owning surface open the inline advanced subview directly. */
  advancedOpenRequest?: number
  onOpenChange?: (open: boolean) => void
  onInlineViewChange?: (view: ModelPickerInlineView | null) => void
  advancedReturnFocusRef?: RefObject<HTMLButtonElement | null>
  /** Invalidates automatic async fallbacks when the owning context changes. */
  selectionContextKey?: string | null
  /** Lets a feature persist the selection in its own contextual state. */
  onSelectionChange?: (provider: Provider, model: string) => void
}

export function ModelSelector({
  compact = false,
  embedded = false,
  inline = false,
  directModelList = false,
  hideTriggerWhenOpen = false,
  closeRequest = 0,
  advancedOpenRequest = 0,
  onOpenChange,
  onInlineViewChange,
  advancedReturnFocusRef,
  selectionContextKey,
  onSelectionChange,
}: ModelSelectorProps) {
  const {
    selectedProvider, selectedModels, keyStatus,
    dynamicModels, modelsLoading, modelsError, recentModels,
    setSelectedProvider, setSelectedModel,
    setDynamicModels, setModelsLoading, setModelsError, recordModelUsage,
  } = useAppStore()
  const t = useT()
  const { isPending } = useProviderModelCatalog()

  const [open, setOpen] = useState(embedded)
  const [view, setView] = useState<PickerView>(embedded ? 'models' : 'root')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pickerPosition, setPickerPosition] = useState<PickerPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLElement | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const firstRootItemRef = useRef<HTMLButtonElement>(null)
  const advancedViewRef = useRef<HTMLDivElement>(null)
  const selectionContextRef = useRef(selectionContextKey)
  const closeRequestRef = useRef(closeRequest)
  const advancedOpenRequestRef = useRef(advancedOpenRequest)
  const pickerId = useId()
  const modelListId = `${pickerId}-models`
  const providerListId = `${pickerId}-providers`

  useLayoutEffect(() => {
    selectionContextRef.current = selectionContextKey
  }, [selectionContextKey])

  const closePicker = useCallback((restoreFocus = true) => {
    setOpen(false)
    onOpenChange?.(false)
    onInlineViewChange?.(null)
    setView('root')
    setAdvancedOpen(false)
    setSearch('')
    setPickerPosition(null)
    if (restoreFocus) {
      window.requestAnimationFrame(() => {
        const returnFocusTarget = view === 'advanced'
          ? advancedReturnFocusRef?.current ?? triggerRef.current
          : triggerRef.current
        returnFocusTarget?.focus()
      })
    }
  }, [advancedReturnFocusRef, onInlineViewChange, onOpenChange, view])

  useEffect(() => {
    if (closeRequestRef.current === closeRequest) return
    closeRequestRef.current = closeRequest
    if (open) closePicker()
  }, [closePicker, closeRequest, open])

  useEffect(() => {
    if (advancedOpenRequestRef.current === advancedOpenRequest) return
    advancedOpenRequestRef.current = advancedOpenRequest
    setView('advanced')
    setAdvancedOpen(false)
    setSearch('')
    setPickerPosition(null)
    setOpen(true)
    onOpenChange?.(true)
    onInlineViewChange?.('advanced')
  }, [advancedOpenRequest, onInlineViewChange, onOpenChange])

  const openPicker = () => {
    const nextView = directModelList ? 'models' : 'root'
    setView(nextView)
    setAdvancedOpen(false)
    setSearch('')
    setPickerPosition(null)
    setOpen(true)
    onOpenChange?.(true)
    onInlineViewChange?.(nextView === 'models' ? 'models' : null)
  }

  const repositionPicker = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const triggerRect = trigger.getBoundingClientRect()
    const panel = pickerRef.current
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const renderedWidth = panel?.offsetWidth || Math.min(PICKER_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2)
    const measuredHeight = Math.min(panel?.scrollHeight || 240, PICKER_MAX_HEIGHT)
    const spaceAbove = Math.max(0, triggerRect.top - PICKER_GAP - VIEWPORT_MARGIN)
    const spaceBelow = Math.max(0, viewportHeight - triggerRect.bottom - PICKER_GAP - VIEWPORT_MARGIN)
    const compactCanOpenAbove = spaceAbove >= Math.min(measuredHeight, 160) || spaceAbove >= spaceBelow
    const placement: PickerPosition['placement'] = compact && compactCanOpenAbove
      ? 'above'
      : spaceBelow >= measuredHeight || spaceBelow >= spaceAbove
        ? 'below'
        : 'above'
    const availableHeight = placement === 'above' ? spaceAbove : spaceBelow
    const maxHeight = Math.min(PICKER_MAX_HEIGHT, availableHeight)
    const visibleHeight = Math.min(measuredHeight, maxHeight)
    const unclampedTop = placement === 'above'
      ? triggerRect.top - PICKER_GAP - visibleHeight
      : triggerRect.bottom + PICKER_GAP
    const top = Math.min(
      Math.max(VIEWPORT_MARGIN, unclampedTop),
      Math.max(VIEWPORT_MARGIN, viewportHeight - visibleHeight - VIEWPORT_MARGIN),
    )
    const preferredLeft = compact ? triggerRect.right - renderedWidth : triggerRect.left
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, preferredLeft),
      Math.max(VIEWPORT_MARGIN, viewportWidth - renderedWidth - VIEWPORT_MARGIN),
    )

    setPickerPosition((current) => {
      const next = { top, left, maxHeight, placement }
      if (
        current
        && Math.abs(current.top - next.top) < 1
        && Math.abs(current.left - next.left) < 1
        && Math.abs(current.maxHeight - next.maxHeight) < 1
        && current.placement === next.placement
      ) {
        return current
      }
      return next
    })
  }, [compact])

  const fetchModels = async (provider: Provider) => {
    const requiresKey = PROVIDERS.find((p) => p.id === provider)?.requiresApiKey !== false
    if ((requiresKey && !keyStatus[provider]) || !window.api || useAppStore.getState().modelsLoading[provider]) return
    const requestContextKey = selectionContextKey
    const modelAtRequestStart = useAppStore.getState().selectedModels[provider]
    setModelsLoading(provider, true)
    setModelsError(provider, null)
    try {
      const result = await window.api.fetchModels(provider)
      if (result.success && result.models.length > 0) {
        setDynamicModels(provider, result.models)
        const ids = result.models.map((model) => model.id)
        const currentState = useAppStore.getState()
        const currentSelection = currentState.selectedModels[provider]
        const currentInList = Boolean(currentSelection) && ids.includes(currentSelection)
        const requestStillOwnsSelection = selectionContextRef.current === requestContextKey
          && currentState.selectedProvider === provider
          && currentSelection === modelAtRequestStart
        if (!currentInList && requestStillOwnsSelection) {
          const target = result.recommendedModel ?? result.models[0].id
          setSelectedModel(provider, target)
          onSelectionChange?.(provider, target)
        }
      } else {
        setModelsError(provider, result.error || t.model_load_error)
      }
    } catch (error) {
      setModelsError(provider, error instanceof Error ? error.message : t.settings_hotkey_status_error)
    } finally {
      setModelsLoading(provider, false)
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchModels uses the latest store state
  useEffect(() => {
    const hasKey = PROVIDERS.find((provider) => provider.id === selectedProvider)?.requiresApiKey === false
      || keyStatus[selectedProvider]
    // Keyed providers use the shared catalog hook. Keep local runtime discovery
    // and its conversation-aware model fallback on the existing selection path.
    if (selectedProvider === 'local' && hasKey && dynamicModels[selectedProvider].length === 0 && !modelsLoading[selectedProvider]) {
      fetchModels(selectedProvider)
    }
  }, [selectedProvider, keyStatus])

  const providerGroups = useMemo(() => {
    return PROVIDERS.map((provider) => {
      const providerId = provider.id as Provider
      const dynamic = dynamicModels[providerId]
      const raw = isPending(providerId) ? [] : dynamic.length > 0 ? dynamic : provider.models
      return { provider, models: dedupeModelsByFamily(providerId, raw) }
    })
  }, [dynamicModels, isPending])

  const currentProviderConfig = PROVIDERS.find((provider) => provider.id === selectedProvider) ?? PROVIDERS[0]
  const currentDynamic = dynamicModels[selectedProvider]
  const currentRaw = currentDynamic.length > 0 ? currentDynamic : currentProviderConfig.models
  const currentDisplayModels = dedupeModelsByFamily(selectedProvider, currentRaw)
  const selectedModelId = selectedModels[selectedProvider] ?? currentDisplayModels[0]?.id ?? ''
  const selectedModelName = formatModelName(
    selectedProvider,
    selectedModelId,
    currentDisplayModels.find((model) => model.id === selectedModelId)?.name,
  )
  const isCurrentLoading = modelsLoading[selectedProvider]
  const currentHasKey = currentProviderConfig.requiresApiKey === false || keyStatus[selectedProvider]

  const query = search.toLowerCase().trim()
  const filteredGroups = query
    ? providerGroups
        .map((group) => ({
          ...group,
          models: group.models.filter((model) => {
            const providerId = group.provider.id as Provider
            const name = formatModelName(providerId, model.id, model.name).toLowerCase()
            return name.includes(query)
              || group.provider.name.toLowerCase().includes(query)
              || model.id.toLowerCase().includes(query)
          }),
        }))
        .filter((group) => group.models.length > 0)
    : providerGroups

  const recentItems = recentModels
    .map((recent) => {
      const providerConfig = PROVIDERS.find((provider) => provider.id === recent.provider)
      if (!providerConfig) return null
      const dynamic = dynamicModels[recent.provider as Provider]
      const raw = dynamic.length > 0 ? dynamic : providerConfig.models
      const model = raw.find((candidate) => candidate.id === recent.modelId)
      if (!model) return null
      return {
        provider: recent.provider,
        modelId: recent.modelId,
        displayName: formatModelName(recent.provider, recent.modelId, model.name),
        providerName: providerConfig.name,
      }
    })
    .filter(Boolean) as Array<{
      provider: Provider
      modelId: string
      displayName: string
      providerName: string
    }>

  const handleSelectModel = (provider: Provider, modelId: string) => {
    setSelectedProvider(provider)
    setSelectedModel(provider, modelId)
    onSelectionChange?.(provider, modelId)
    recordModelUsage(provider, modelId)
    const hasKey = PROVIDERS.find((item) => item.id === provider)?.requiresApiKey === false || keyStatus[provider]
    if (hasKey && dynamicModels[provider].length === 0) {
      fetchModels(provider)
    }
    closePicker()
  }

  const handleSelectProvider = (provider: Provider) => {
    setSelectedProvider(provider)
    const providerModels = dynamicModels[provider].length > 0
      ? dynamicModels[provider]
      : PROVIDERS.find((item) => item.id === provider)?.models ?? []
    const model = selectedModels[provider] ?? providerModels[0]?.id
    if (model) onSelectionChange?.(provider, model)
    setSearch('')
    const hasKey = PROVIDERS.find((item) => item.id === provider)?.requiresApiKey === false || keyStatus[provider]
    if (hasKey && dynamicModels[provider].length === 0 && !modelsLoading[provider]) {
      fetchModels(provider)
    }
    setView('root')
  }

  const showRecent = !query && recentItems.length > 0

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !pickerRef.current?.contains(target)) {
        closePicker(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closePicker()
      }
    }

    if (!inline) document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      if (!inline) document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [inline, open, closePicker])

  useLayoutEffect(() => {
    if (!open || inline) return
    repositionPicker()
    const frame = window.requestAnimationFrame(repositionPicker)
    const panel = pickerRef.current
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && panel) {
      observer = new ResizeObserver(repositionPicker)
      observer.observe(panel)
    }
    window.addEventListener('resize', repositionPicker)
    window.addEventListener('scroll', repositionPicker, true)
    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', repositionPicker)
      window.removeEventListener('scroll', repositionPicker, true)
    }
  }, [inline, open, repositionPicker])

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      if (view === 'models') searchRef.current?.focus()
      if (view === 'root') firstRootItemRef.current?.focus()
      if (view === 'advanced') advancedViewRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, view])

  const advancedContent = (
    <div id={`${pickerId}-advanced`} className="model-picker-advanced-content">
      <div className="model-picker-advanced-model">
        <span className="model-picker-advanced-label">{t.model_picker_model_id}</span>
        <code className="model-picker-advanced-value" title={selectedModelId}>{selectedModelId}</code>
      </div>
      <button
        type="button"
        className="model-picker-refresh"
        onClick={() => fetchModels(selectedProvider)}
        disabled={!currentHasKey || isCurrentLoading}
      >
        {isCurrentLoading
          ? <SpinnerIcon className="model-picker-spinner" />
          : <RefreshIcon className="model-picker-refresh-icon" />}
        <span>{t.model_refresh}</span>
      </button>
      {!currentHasKey && (
        <p className="model-picker-advanced-status" role="status">{t.model_no_key}</p>
      )}
      {currentHasKey && modelsError[selectedProvider] && (
        <p className="model-picker-advanced-status model-picker-advanced-status--error" role="alert">
          {modelsError[selectedProvider]}
        </p>
      )}
    </div>
  )

  const advancedSection = (
    <>
      <hr className="model-picker-divider" />
      <button
        type="button"
        className="model-picker-advanced-trigger"
        aria-expanded={advancedOpen}
        aria-controls={`${pickerId}-advanced`}
        onClick={() => setAdvancedOpen((value) => !value)}
      >
        <span className="model-picker-row-label">{t.model_picker_advanced}</span>
        <ChevronDownIcon
          className={`model-picker-row-chevron model-picker-advanced-chevron${advancedOpen ? ' model-picker-advanced-chevron--open' : ''}`}
        />
      </button>
      {advancedOpen && advancedContent}
    </>
  )

  const rootMenu = (
    <div className="model-picker-root">
      <button
        ref={firstRootItemRef}
        type="button"
        className="model-picker-menu-row"
        aria-label={`${t.model_picker_model}: ${selectedModelName}`}
        onClick={() => setView('models')}
      >
        <span className="model-picker-row-label">{t.model_picker_model}</span>
        <span className="model-picker-row-value">{selectedModelName}</span>
        <ChevronRightIcon className="model-picker-row-chevron" />
      </button>
      <button
        type="button"
        className="model-picker-menu-row"
        aria-label={`${t.model_picker_provider}: ${currentProviderConfig.name}`}
        onClick={() => setView('providers')}
      >
        <span className="model-picker-row-label">{t.model_picker_provider}</span>
        <span className="model-picker-row-value">{currentProviderConfig.name}</span>
        <ChevronRightIcon className="model-picker-row-chevron" />
      </button>
      {advancedSection}
    </div>
  )

  const modelsView = (
    <div className="model-picker-subview model-picker-models-view">
      {!directModelList && (
        <PickerHeader label={t.model_picker_model} backLabel={t.model_picker_back} onBack={() => {
          setSearch('')
          setView('root')
        }} />
      )}
      <div className="model-picker-search-wrap">
        <div className="model-picker-search-shell">
          <SearchIcon className="model-picker-search-icon" />
          <Input
            ref={searchRef}
            size="md"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t.model_picker_search_placeholder}
            aria-label={t.model_picker_search_placeholder}
            aria-controls={modelListId}
            className="model-picker-search"
          />
        </div>
      </div>
      <div id={modelListId} className="model-picker-list">
        {showRecent && (
          <section className="model-picker-section" aria-labelledby={`${pickerId}-recent`}>
            <div id={`${pickerId}-recent`} className="model-picker-section-label">{t.model_picker_recent}</div>
            {recentItems.map((item) => {
              const isSelected = selectedProvider === item.provider && selectedModelId === item.modelId
              return (
                <ModelOption
                  key={`recent-${item.provider}-${item.modelId}`}
                  provider={item.provider}
                  modelId={item.modelId}
                  displayName={item.displayName}
                  providerName={item.providerName}
                  isSelected={isSelected}
                  showProvider
                  onSelect={handleSelectModel}
                />
              )
            })}
            <hr className="model-picker-divider model-picker-section-divider" />
          </section>
        )}

        {filteredGroups.length === 0 && (
          <div className="model-picker-empty" role="status">{t.model_picker_no_results}</div>
        )}
        {filteredGroups.map((group) => {
          const providerId = group.provider.id as Provider
          const hasKey = group.provider.requiresApiKey === false || keyStatus[providerId]
          const isLoading = modelsLoading[providerId]
          const error = modelsError[providerId]
          const sectionId = `${pickerId}-${providerId}`
          return (
            <section key={providerId} className="model-picker-section" aria-labelledby={sectionId}>
              <div className="model-picker-section-label model-picker-section-heading">
                <span aria-hidden="true"><ProviderIcon provider={providerId} size={13} /></span>
                <span id={sectionId}>{group.provider.name}</span>
                {!hasKey && <span className="model-picker-status">{t.model_no_key}</span>}
                {hasKey && (
                  <Button
                    size="xs"
                    shape="icon"
                    variant="neutral"
                    appearance="ghost"
                    disabled={isLoading}
                    aria-label={`${t.model_refresh}: ${group.provider.name}`}
                    onClick={() => void fetchModels(providerId)}
                  >
                    {isLoading ? <SpinnerIcon className="model-picker-spinner" /> : <RefreshIcon />}
                  </Button>
                )}
              </div>
              {isPending(providerId) && (
                <p className="model-picker-status" role="status">{t.model_loading}</p>
              )}
              {error && (
                <p className="model-picker-error model-picker-error--inline" role="alert">{t.model_load_error}</p>
              )}
              {group.models.map((model) => (
                <ModelOption
                  key={`${providerId}-${model.id}`}
                  provider={providerId}
                  modelId={model.id}
                  displayName={formatModelName(providerId, model.id, model.name)}
                  isSelected={selectedProvider === providerId && selectedModelId === model.id}
                  onSelect={handleSelectModel}
                />
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )

  const advancedView = (
    <div
      ref={advancedViewRef}
      className="model-picker-subview model-picker-advanced-view"
      tabIndex={-1}
    >
      {advancedContent}
    </div>
  )

  const providersView = (
    <div className="model-picker-subview model-picker-providers-view">
      <PickerHeader
        label={t.model_picker_provider}
        backLabel={t.model_picker_back}
        onBack={() => setView('root')}
      />
      <div id={providerListId} className="model-picker-list model-picker-provider-list">
        {PROVIDERS.map((provider) => {
          const providerId = provider.id as Provider
          const hasKey = provider.requiresApiKey === false || keyStatus[providerId]
          const isSelected = providerId === selectedProvider
          return (
            <button
              key={providerId}
              type="button"
              aria-current={isSelected ? 'true' : undefined}
              className={`model-picker-option model-picker-provider-option${isSelected ? ' model-picker-option--selected model-picker-provider-option--selected' : ''}`}
              onClick={() => handleSelectProvider(providerId)}
            >
              <span className="model-picker-provider-icon" aria-hidden="true">
                <ProviderIcon provider={providerId} size={16} />
              </span>
              <span className="model-picker-provider-copy">
                <span className="model-picker-provider-name">{provider.name}</span>
                {!hasKey && <span className="model-picker-provider-meta">{t.model_no_key}</span>}
              </span>
              {modelsLoading[providerId] && <SpinnerIcon className="model-picker-spinner" />}
              {isSelected && <CheckIcon className="model-picker-check" />}
            </button>
          )
        })}
      </div>
    </div>
  )

  const pickerContent = (
    <>
      {view === 'root' && rootMenu}
      {view === 'models' && modelsView}
      {view === 'providers' && providersView}
      {view === 'advanced' && advancedView}
    </>
  )
  const pickerPanelContent = !open ? null : inline ? (
    <fieldset
      ref={(node) => {
        pickerRef.current = node
      }}
      id={pickerId}
      className="model-picker-panel model-picker-panel--inline"
    >
      <legend className="sr-only">
        {view === 'advanced' ? t.model_picker_model_details : t.model_picker_model}
      </legend>
      {pickerContent}
    </fieldset>
  ) : (
    <div
      ref={(node) => {
        pickerRef.current = node
      }}
      id={pickerId}
      role="dialog"
      aria-label={t.model_picker_model}
      className={`model-picker-panel model-picker-panel--${pickerPosition?.placement ?? (compact ? 'above' : 'below')}`}
      style={{
        position: 'fixed',
        top: pickerPosition?.top ?? VIEWPORT_MARGIN,
        left: pickerPosition?.left ?? VIEWPORT_MARGIN,
        width: Math.min(PICKER_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2),
        maxHeight: pickerPosition?.maxHeight ?? PICKER_MAX_HEIGHT,
        visibility: pickerPosition ? 'visible' : 'hidden',
        zIndex: 9999,
      }}
    >
      {pickerContent}
    </div>
  )
  const pickerPanel = inline || !pickerPanelContent
    ? pickerPanelContent
    : createPortal(pickerPanelContent, document.body)

  return (
    <>
      {!embedded && (!open || !hideTriggerWhenOpen) && <Button
        ref={triggerRef}
        size="md"
        shape={compact ? 'pill' : 'rect'}
        variant={open ? 'primary' : 'neutral'}
        appearance={open ? 'soft' : compact ? 'ghost' : 'outline'}
        aria-haspopup={inline ? undefined : 'dialog'}
        aria-expanded={open}
        aria-controls={open ? pickerId : undefined}
        onClick={() => open ? closePicker(false) : openPicker()}
        className={`model-picker-trigger${compact ? ' model-picker-trigger--compact' : ' model-picker-trigger--field'}${open ? ' model-picker-trigger--open' : ''}`}
      >
        {!compact && (
          isCurrentLoading
            ? <SpinnerIcon className="model-picker-spinner" />
            : <span aria-hidden="true"><ProviderIcon provider={selectedProvider} size={14} /></span>
        )}
        <span className="model-picker-trigger-label">
          {isCurrentLoading && !compact ? t.model_loading : selectedModelName || t.settings_hotkey_model}
        </span>
        <ChevronDownIcon className="model-picker-trigger-icon model-picker-trigger-chevron" />
      </Button>}
      {pickerPanel}
    </>
  )
}

interface PickerHeaderProps {
  label: string
  backLabel: string
  onBack: () => void
}

function PickerHeader({ label, backLabel, onBack }: PickerHeaderProps) {
  return (
    <div className="model-picker-header">
      <button type="button" className="model-picker-back" aria-label={backLabel} onClick={onBack}>
        <ChevronLeftIcon className="model-picker-back-icon" />
      </button>
      <h2 className="model-picker-title">{label}</h2>
    </div>
  )
}

interface ModelOptionProps {
  provider: Provider
  modelId: string
  displayName: string
  providerName?: string
  isSelected: boolean
  showProvider?: boolean
  disabled?: boolean
  onSelect: (provider: Provider, modelId: string) => void
}

function ModelOption({
  provider,
  modelId,
  displayName,
  providerName,
  isSelected,
  showProvider = false,
  disabled = false,
  onSelect,
}: ModelOptionProps) {
  return (
    <button
      type="button"
      aria-current={isSelected ? 'true' : undefined}
      disabled={disabled}
      className={`model-picker-option${isSelected ? ' model-picker-option--selected' : ''}${disabled ? ' model-picker-option--disabled' : ''}`}
      onClick={() => onSelect(provider, modelId)}
      title={modelId}
    >
      {showProvider && <span aria-hidden="true"><ProviderIcon provider={provider} size={13} /></span>}
      <span className="model-picker-option-copy">
        <span className="model-picker-option-name">{displayName}</span>
        {showProvider && providerName && <span className="model-picker-option-meta">{providerName}</span>}
      </span>
      {isSelected && <CheckIcon className="model-picker-check" />}
    </button>
  )
}

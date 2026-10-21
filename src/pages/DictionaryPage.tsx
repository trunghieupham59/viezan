import { useEffect, useRef, useState } from 'react'
import {
  DictionaryAIConfiguration,
  DictionaryHistoryPanel,
  DictionaryResultPanel,
  DictionarySearchPanel,
} from '../components/organisms'
import { DictionaryWorkbenchTemplate } from '../components/templates'
import { useDictionaryLookup } from '../hooks/useDictionaryLookup'
import { useAppStore, useT } from '../store/useAppStore'
import { useNotificationStore } from '../store/useNotificationStore'
import { formatModelName, getProviderDisplayName } from '../utils/modelDisplay'
import '../styles/dictionary.css'

/** Owner key so a new lookup error replaces the previous toast instead of stacking. */
const LOOKUP_ERROR_KEY = 'dictionary-lookup-error'

export function DictionaryPage() {
  const t = useT()
  const {
    dictionaryEntries,
    toggleDictionaryFavorite,
    clearDictionaryHistory,
    setLanguagePair,
    selectedProvider,
    openSettings,
    costCurrency,
  } = useAppStore()
  const lookup = useDictionaryLookup()

  /** Controls visibility of the AI configuration popover. */
  const [showAIConfig, setShowAIConfig] = useState(false)

  const dictionaryErrorContext = lookup.model
    ? t.translate_error_context(
        getProviderDisplayName(selectedProvider),
        formatModelName(selectedProvider, lookup.model),
      )
    : ''

  // Lookup failures surface in the app-level toast stack. The toast's recovery
  // actions read the latest lookup state through a ref, so they stay correct
  // while the toast outlives the render that created it.
  const notify = useNotificationStore((state) => state.notify)
  const dismissNotification = useNotificationStore((state) => state.dismiss)
  const lookupRef = useRef(lookup)
  lookupRef.current = lookup
  const { error: lookupError, errorRecoverable } = lookup
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-notify only when the error itself changes
  useEffect(() => {
    if (!lookupError) {
      dismissNotification(LOOKUP_ERROR_KEY)
      return
    }
    const current = lookupRef.current
    notify({
      key: LOOKUP_ERROR_KEY,
      tone: 'error',
      message: lookupError,
      detail: errorRecoverable ? dictionaryErrorContext : undefined,
      actions: errorRecoverable
        ? [
            {
              label: t.dictionary_error_retry,
              onClick: () => void lookupRef.current.runLookup(),
              disabled: !current.term.trim() || !current.canSubmit || current.isLoading,
            },
            { label: t.translate_error_choose_model, onClick: () => setShowAIConfig(true) },
            { label: t.translate_error_open_settings, onClick: openSettings },
          ]
        : undefined,
      onDismiss: () => lookupRef.current.clearError(),
    })
    // Leaves with the page instead of following the user to other features.
    return () => dismissNotification(LOOKUP_ERROR_KEY)
  }, [lookupError, errorRecoverable])

  return (
    <DictionaryWorkbenchTemplate
      header={(
        <div className="page-section-header">
          <div className="dictionary-page-heading">
            <h1 className="dictionary-page-title">{t.dictionary_title}</h1>
            <p className="dictionary-page-subtitle">{t.dictionary_subtitle}</p>
          </div>
          <DictionaryAIConfiguration
            open={showAIConfig}
            title={t.ai_configuration_title}
            scopeDescription={t.ai_configuration_dictionary_scope}
            closeLabel={t.settings_close}
            modelsLabel={t.ai_configuration_models_section}
            onOpenChange={setShowAIConfig}
          />
        </div>
      )}
      search={(
        <DictionarySearchPanel
          term={lookup.term}
          onTermChange={lookup.setTerm}
          context={lookup.context}
          onContextChange={lookup.setContext}
          onLanguagePairChange={(pair) => setLanguagePair('translate', pair)}
          isLoading={lookup.isLoading}
          canSubmit={lookup.canSubmit}
          cannotSubmitReason={t.dictionary_lookup_needs_model}
          maxTermChars={lookup.maxTermChars}
          maxContextChars={lookup.maxContextChars}
          onSubmit={() => void lookup.runLookup()}
          t={t}
        />
      )}
      result={(
        <DictionaryResultPanel
          entry={lookup.selectedEntry}
          copied={lookup.copied}
          isEnriching={lookup.isEnriching}
          onCopy={() => void lookup.copyEntry()}
          onFavorite={() => { if (lookup.selectedEntry) toggleDictionaryFavorite(lookup.selectedEntry.id) }}
          onReuse={lookup.reuseInTranslate}
          onHintSelect={lookup.setTerm}
          selectionLookup={lookup.selectionLookup}
          onSelectionLookup={(text) => void lookup.runSelectionLookup(text)}
          onCloseSelectionLookup={lookup.closeSelectionLookup}
          t={t}
        />
      )}
      resultLabel={t.dictionary_title}
      history={(
        <DictionaryHistoryPanel
          entries={dictionaryEntries}
          selectedEntryId={lookup.selectedEntry?.id ?? null}
          activeTab={lookup.activeListTab}
          costCurrency={costCurrency}
          onTabChange={lookup.setActiveListTab}
          onSelect={lookup.setSelectedEntryId}
          onToggleFavorite={toggleDictionaryFavorite}
          onDeleteSelected={lookup.deleteSelectedEntry}
          onClearHistory={clearDictionaryHistory}
          t={t}
        />
      )}
    />
  )
}

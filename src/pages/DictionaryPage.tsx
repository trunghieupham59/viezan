import { useState } from 'react'
import {
  DictionaryAIConfiguration,
  DictionaryHistoryPanel,
  DictionaryResultPanel,
  DictionarySearchPanel,
} from '../components/organisms'
import { DictionaryWorkbenchTemplate } from '../components/templates'
import { RecoverableError } from '../components/ui/molecules'
import { useDictionaryLookup } from '../hooks/useDictionaryLookup'
import { useAppStore, useT } from '../store/useAppStore'
import { formatModelName, getProviderDisplayName } from '../utils/modelDisplay'
import '../styles/dictionary.css'

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
        <>
          <DictionarySearchPanel
            term={lookup.term}
            onTermChange={lookup.setTerm}
            context={lookup.context}
            onContextChange={lookup.setContext}
            onLanguagePairChange={(pair) => setLanguagePair('translate', pair)}
            isLoading={lookup.isLoading}
            canSubmit={lookup.canSubmit}
            cannotSubmitReason={t.dictionary_lookup_needs_model}
            error={lookup.errorRecoverable ? null : lookup.error}
            maxTermChars={lookup.maxTermChars}
            maxContextChars={lookup.maxContextChars}
            onSubmit={() => void lookup.runLookup()}
            t={t}
          />
          {lookup.error && lookup.errorRecoverable && (
            <div className="dictionary-recoverable-error">
              <RecoverableError
                message={lookup.error}
                context={dictionaryErrorContext}
                retryAction={{
                  label: t.dictionary_error_retry,
                  onClick: () => void lookup.runLookup(),
                  disabled: !lookup.term.trim() || !lookup.canSubmit || lookup.isLoading,
                }}
                alternativeAction={{
                  label: t.translate_error_choose_model,
                  onClick: () => setShowAIConfig(true),
                }}
                settingsAction={{
                  label: t.translate_error_open_settings,
                  onClick: openSettings,
                }}
                dismissLabel={t.translate_error_dismiss}
                onDismiss={lookup.clearError}
              />
            </div>
          )}
        </>
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

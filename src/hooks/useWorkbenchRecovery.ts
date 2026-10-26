import { useEffect, useState } from 'react'
import { MAX_CHAT_SESSIONS, MAX_DICTIONARY_FAVORITES, MAX_DICTIONARY_HISTORY, MAX_LIVE_SESSIONS, MAX_TRANSLATION_HISTORY } from '../constants/history'
import { workbenchRecovery } from '../services/workbenchRecovery'
import { flushPersistedStore, useAppStore, useT } from '../store/useAppStore'
import { useNotificationStore } from '../store/useNotificationStore'
import { useStorageStatus } from '../store/useStorageStatus'

/** Main window only. Hydrate before mounting a workbench so recovery cannot overwrite typing. */
export function useWorkbenchRecovery(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let active = true
    let changed = false
    const initial = useAppStore.getState()
    const unsubscribe = useAppStore.subscribe((state) => {
      if (state.sourceText !== initial.sourceText || state.pendingTranslateRestoreId !== initial.pendingTranslateRestoreId) changed = true
    })
    void workbenchRecovery.initialize().then(() => {
      if (!active) return
      const snapshot = workbenchRecovery.get('translate')?.snapshot
      if (snapshot && !changed && !initial.sourceText && !initial.pendingTranslateRestoreId) {
        useAppStore.setState({
          sourceText: snapshot.sourceText, translatedText: snapshot.translatedText, phoneticText: snapshot.phoneticText,
          ...(useAppStore.getState().activePage === 'translate' ? {
            sourceLang: snapshot.sourceLang, targetLang: snapshot.targetLang,
            translationModels: snapshot.translationModels, translationStyle: snapshot.translationStyle,
            translationReasoningEffort: snapshot.translationReasoningEffort,
          } : {}),
        })
      }
      unsubscribe()
      setReady(true)
    })
    return () => { active = false; unsubscribe() }
  }, [])

  useEffect(() => window.api?.onPrepareSessionSave?.(() => {
    for (const feature of ['translate', 'dictionary'] as const) workbenchRecovery.leave(feature)
    flushPersistedStore()
    void workbenchRecovery.flush().finally(() => { void window.api.completeSessionSave() })
  }), [])
  return ready
}

/** Errors survive feature navigation; a successful retry dismisses its own notice. */
export function useStorageNotifications(): void {
  const { settingsFailed, recoveryFailed, recoveryReadFailed } = useStorageStatus()
  const retentionWarning = useAppStore((state) => state.chatSessions.length >= MAX_CHAT_SESSIONS
    || state.history.length >= MAX_TRANSLATION_HISTORY || state.liveSessions.length >= MAX_LIVE_SESSIONS
    || state.dictionaryEntries.filter((entry) => !entry.favorite).length >= MAX_DICTIONARY_HISTORY
    || state.dictionaryEntries.filter((entry) => entry.favorite).length >= MAX_DICTIONARY_FAVORITES)
  const t = useT()
  useEffect(() => {
    const notifications = useNotificationStore.getState()
    if (settingsFailed || recoveryFailed || recoveryReadFailed) {
      notifications.notify({
        key: 'storage-failed', tone: 'error', dismissible: false,
        message: recoveryReadFailed ? t.session_recovery_unavailable : t.session_save_failed,
        actions: recoveryReadFailed ? [] : [{ label: t.session_retry_save, onClick: () => {
          flushPersistedStore()
          void workbenchRecovery.flush()
        } }],
      })
    } else notifications.dismiss('storage-failed')
    if (retentionWarning) notifications.notify({ key: 'history-retention', tone: 'warning', message: t.session_history_limits })
    else notifications.dismiss('history-retention')
  }, [settingsFailed, recoveryFailed, recoveryReadFailed, retentionWarning, t])
}

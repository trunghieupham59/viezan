import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../components/ui/atoms'
import { SettingsRow } from '../../components/ui/molecules'
import { useAppStore, useT } from '../../store/useAppStore'
import { useNotificationStore } from '../../store/useNotificationStore'
import {
  type ChatImageStoreStats,
  clearAllChatImages,
  collectReferencedImageKeys,
  getChatImageStoreStats,
  pruneUnusedChatImages,
} from '../../utils/chatImageStore'
import { tpl } from '../../utils/tpl'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * One row of Settings › Chat. Explicit cleanup of the images AI Chat keeps on this device. Nothing is ever
 * removed automatically; the user decides here, with the current size in view.
 */
export function ChatImageStorageCard() {
  const t = useT()
  const [stats, setStats] = useState<ChatImageStoreStats | null>(null)
  const [busy, setBusy] = useState(false)
  const notify = useNotificationStore((state) => state.notify)
  /** Cleanup results go to the toast stack. */
  const reportRemoved = (count: number) =>
    notify({ key: 'settings-chat-images', tone: 'success', message: tpl(t.settings_chat_images_removed, { count }) })

  const refresh = useCallback(async () => setStats(await getChatImageStoreStats()), [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const reportFailed = () =>
    notify({ key: 'settings-chat-images', tone: 'error', message: t.settings_chat_images_failed })

  /** Runs one cleanup; `busy` always clears so a failure never leaves both buttons disabled. */
  const runCleanup = async (cleanup: () => Promise<number>) => {
    setBusy(true)
    try {
      reportRemoved(await cleanup())
    } catch {
      reportFailed()
    } finally {
      try {
        await refresh()
      } catch {
        // Keep the last known stats; the failure toast (if any) already explains.
      }
      setBusy(false)
    }
  }

  const handlePrune = () => runCleanup(() =>
    pruneUnusedChatImages(collectReferencedImageKeys(useAppStore.getState().chatSessions)))

  const handleClear = async () => {
    if (!window.confirm(t.settings_chat_images_clear_confirm)) return
    const removed = stats?.count ?? 0
    await runCleanup(async () => {
      await clearAllChatImages()
      return removed
    })
  }

  const usage = stats === null
    ? '…'
    : stats.count === 0
      ? t.settings_chat_images_empty
      : tpl(t.settings_chat_images_usage, { count: stats.count, size: formatBytes(stats.bytes) })
  const isEmpty = stats !== null && stats.count === 0

  return (
    <SettingsRow
      label={t.settings_chat_images_title}
      description={(
        <>
          <span aria-live="polite">{usage}</span>
          <span className="settings-row-hint">{t.settings_chat_images_desc}</span>
        </>
      )}
    >
      <Button
        size="sm"
        shape="rect"
        variant="neutral"
        appearance="outline"
        disabled={busy || isEmpty}
        onClick={handlePrune}
        title={t.settings_chat_images_prune_desc}
      >
        {t.settings_chat_images_prune}
      </Button>
      <Button
        size="sm"
        shape="rect"
        variant="danger"
        appearance="ghost"
        disabled={busy || isEmpty}
        onClick={handleClear}
        title={t.settings_chat_images_clear_desc}
      >
        {t.settings_chat_images_clear}
      </Button>
    </SettingsRow>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../components/ui/atoms'
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
 * Explicit cleanup of the images AI Chat keeps on this device. Nothing is ever
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

  const handlePrune = async () => {
    setBusy(true)
    const referenced = collectReferencedImageKeys(useAppStore.getState().chatSessions)
    const removed = await pruneUnusedChatImages(referenced)
    reportRemoved(removed)
    await refresh()
    setBusy(false)
  }

  const handleClear = async () => {
    if (!window.confirm(t.settings_chat_images_clear_confirm)) return
    setBusy(true)
    const removed = stats?.count ?? 0
    await clearAllChatImages()
    reportRemoved(removed)
    await refresh()
    setBusy(false)
  }

  const usage = stats === null
    ? '…'
    : stats.count === 0
      ? t.settings_chat_images_empty
      : tpl(t.settings_chat_images_usage, { count: stats.count, size: formatBytes(stats.bytes) })
  const isEmpty = stats !== null && stats.count === 0

  return (
    <div className="card divide-y divide-gray-100 dark:divide-gray-700">
      <div className="px-4 py-3.5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_chat_images_title}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0" aria-live="polite">{usage}</p>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_chat_images_desc}</p>
      </div>

      <div className="flex items-center justify-between gap-4 px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_chat_images_prune}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_chat_images_prune_desc}</p>
        </div>
        <Button size="sm" appearance="outline" disabled={busy || isEmpty} onClick={handlePrune}>
          {t.settings_chat_images_prune}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4 px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_chat_images_clear}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_chat_images_clear_desc}</p>
        </div>
        <Button size="sm" variant="danger" appearance="outline" disabled={busy || isEmpty} onClick={handleClear}>
          {t.settings_chat_images_clear}
        </Button>
      </div>

    </div>
  )
}

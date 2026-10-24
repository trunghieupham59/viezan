import { type ShortcutId, useShortcutInventory } from '../../hooks/useShortcutInventory'
import type { Translations } from '../../i18n'
import { useAppStore, useT } from '../../store/useAppStore'
import { shortcutKeyCaps } from '../../utils/keyboardShortcuts'
import { ShortcutList, type ShortcutListItem } from '../ui/molecules'

const LABEL_KEYS: Record<ShortcutId, keyof Translations> = {
  launcher: 'shortcut_launcher',
  quickTranslate: 'shortcut_quick_translate',
  commandPalette: 'shortcut_command_palette',
  newChat: 'shortcut_new_chat',
  sendMessage: 'shortcut_send_message',
}

export interface ShortcutOverviewProps {
  /** Limit the list to these shortcuts, in this order; all of them when absent. */
  only?: readonly ShortcutId[]
}

function text(t: Translations, key: keyof Translations): string {
  const value = t[key]
  return typeof value === 'string' ? value : String(key)
}

/**
 * Every shortcut Viezan answers to, read live from main and the store, with
 * shortcuts that share keys flagged. Read-only: each shortcut is changed where
 * its feature is configured.
 */
export function ShortcutOverview({ only }: ShortcutOverviewProps) {
  const t = useT()
  const enabledModules = useAppStore((state) => state.enabledModules)
  const chatSendShortcut = useAppStore((state) => state.chatSendShortcut)
  const chatNewSessionShortcut = useAppStore((state) => state.chatNewSessionShortcut)
  const platform = window.api?.platform
  const { entries, conflicts } = useShortcutInventory({ enabledModules, chatSendShortcut, chatNewSessionShortcut, platform })

  const shown = only
    ? only.flatMap((id) => entries.filter((entry) => entry.id === id))
    : entries

  const items: ShortcutListItem[] = shown.map((entry) => ({
    id: entry.id,
    label: text(t, LABEL_KEYS[entry.id]),
    scope: entry.id === 'sendMessage'
      ? t.shortcut_scope_composer
      : entry.scope === 'global' ? t.shortcut_scope_global : t.shortcut_scope_window,
    keys: shortcutKeyCaps(entry.shortcut, platform),
    inactive: !entry.active,
    conflict: conflicts.has(entry.id),
  }))

  return (
    <ShortcutList
      items={items}
      label={t.shortcuts_all_title}
      conflictLabel={t.shortcut_conflict}
      unsetLabel={t.shortcut_unset}
      offLabel={t.shortcut_off}
    />
  )
}

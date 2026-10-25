import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ModuleEnabledState } from '../../shared/modules'
import { SHORTCUTS_CHANGED_EVENT } from '../constants/ui'
import type { ChatSendShortcut } from '../types'
import { chatSendAccelerator, DEFAULT_QUICK_TRANSLATE_SHORTCUT, defaultLauncherShortcut, findShortcutConflicts } from '../utils/keyboardShortcuts'

/** The palette opens with Cmd/Ctrl+K inside the window (see `App`). */
export const COMMAND_PALETTE_SHORTCUT = 'CommandOrControl+K'

export type ShortcutId = 'launcher' | 'quickTranslate' | 'commandPalette' | 'newChat' | 'sendMessage'

export interface ShortcutEntry {
  id: ShortcutId
  /** Electron accelerator; empty when none is set. */
  shortcut: string
  /** `global` works from any app; `window` only while Viezan is in front. */
  scope: 'global' | 'window'
  /** Turned on and its module enabled. Inactive entries are listed but never conflict. */
  active: boolean
}

export interface ShortcutInventory {
  entries: ShortcutEntry[]
  /** Ids of active entries that share a key combination with another active entry. */
  conflicts: Set<string>
  /** The global shortcuts have been read at least once. */
  loaded: boolean
  refresh: () => Promise<void>
}

interface GlobalShortcut { shortcut: string; enabled: boolean }

const NONE: GlobalShortcut = { shortcut: '', enabled: false }

/** Main stores no shortcut until one is recorded; like Settings, show the default it will use. */
function readSettings(settings: Record<string, unknown> | undefined, fallback: string): GlobalShortcut {
  return {
    shortcut: typeof settings?.hotkey === 'string' && settings.hotkey ? settings.hotkey : fallback,
    enabled: settings?.enabled === true,
  }
}

/**
 * Every keyboard shortcut Viezan answers to, in one list, with the ones that
 * collide. Global shortcuts are read from main (read-only calls) when the
 * window gains focus and whenever a shortcut is saved; in-window shortcuts come
 * from the store values passed in.
 */
export function useShortcutInventory(options: {
  enabledModules: ModuleEnabledState
  chatSendShortcut: ChatSendShortcut
  chatNewSessionShortcut: string
  platform?: string
}): ShortcutInventory {
  const { enabledModules, chatSendShortcut, chatNewSessionShortcut, platform } = options
  const [quickTranslate, setQuickTranslate] = useState<GlobalShortcut>(NONE)
  const [launcher, setLauncher] = useState<GlobalShortcut>(NONE)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    const api = window.api?.hotkey
    if (!api) { setLoaded(true); return }
    const [quick, chat] = await Promise.all([
      api.get?.().catch(() => undefined),
      api.chat?.get?.().catch(() => undefined),
    ])
    setQuickTranslate(quick?.success ? readSettings(quick.settings, DEFAULT_QUICK_TRANSLATE_SHORTCUT) : NONE)
    setLauncher(chat?.success ? readSettings(chat.settings, defaultLauncherShortcut(platform)) : NONE)
    setLoaded(true)
  }, [platform])

  useEffect(() => {
    const handle = () => { void refresh() }
    handle()
    window.addEventListener('focus', handle)
    window.addEventListener(SHORTCUTS_CHANGED_EVENT, handle)
    return () => {
      window.removeEventListener('focus', handle)
      window.removeEventListener(SHORTCUTS_CHANGED_EVENT, handle)
    }
  }, [refresh])

  const launcherOn = enabledModules.launcher !== false
  const chatOn = enabledModules.chat !== false
  // Main keeps Quick Translate unregistered while the Translate module is off.
  const translateOn = enabledModules.translate !== false

  const entries = useMemo<ShortcutEntry[]>(() => [
    ...(launcherOn ? [{ id: 'launcher' as const, shortcut: launcher.shortcut, scope: 'global' as const, active: launcher.enabled }] : []),
    { id: 'quickTranslate', shortcut: quickTranslate.shortcut, scope: 'global', active: translateOn && quickTranslate.enabled },
    { id: 'commandPalette', shortcut: COMMAND_PALETTE_SHORTCUT, scope: 'window', active: true },
    ...(chatOn ? [
      { id: 'newChat' as const, shortcut: chatNewSessionShortcut, scope: 'window' as const, active: Boolean(chatNewSessionShortcut) },
      { id: 'sendMessage' as const, shortcut: chatSendAccelerator(chatSendShortcut), scope: 'window' as const, active: true },
    ] : []),
  ], [launcherOn, chatOn, translateOn, launcher, quickTranslate, chatNewSessionShortcut, chatSendShortcut])

  // Sending is a key inside the composer only, so it never collides with the others.
  const conflicts = useMemo(
    () => findShortcutConflicts(entries.filter((entry) => entry.id !== 'sendMessage'), platform),
    [entries, platform],
  )

  return { entries, conflicts, loaded, refresh }
}

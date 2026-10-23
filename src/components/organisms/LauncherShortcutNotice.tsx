import { useEffect } from 'react'
import { useAppStore, useT } from '../../store/useAppStore'
import { useNotificationStore } from '../../store/useNotificationStore'
import { tpl } from '../../utils/tpl'

/** Toast owner key: one notice per app session, replaced rather than stacked. */
const LAUNCHER_CONFLICT_KEY = 'launcher-hotkey-system-conflict'

export type SystemShortcutOwner = 'spotlight' | 'finder-search' | 'system'

/** Human-readable owner of a conflicting macOS shortcut. */
export function systemShortcutOwnerLabel(owner: SystemShortcutOwner, t: ReturnType<typeof useT>): string {
  if (owner === 'spotlight') return 'Spotlight'
  if (owner === 'finder-search') return t.settings_chat_hotkey_owner_finder_search
  return 'macOS'
}

/**
 * Startup check (macOS): when the Launcher shortcut is enabled but Spotlight or another
 * system shortcut owns the same keys, the hotkey silently never fires. Tell the user once
 * and point them at the Settings card that explains how to fix it.
 */
export function LauncherShortcutNotice() {
  const t = useT()
  const notify = useNotificationStore((state) => state.notify)
  const dismiss = useNotificationStore((state) => state.dismiss)

  // Runs once at startup; the Settings card handles later changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: startup-only check
  useEffect(() => {
    const api = window.api?.hotkey?.chat
    if (!api?.systemConflict || window.api?.platform !== 'darwin') return
    let active = true
    void api.systemConflict().then((res) => {
      if (!active || !res?.success || !res.enabled || !res.conflict) return
      notify({
        key: LAUNCHER_CONFLICT_KEY,
        tone: 'warning',
        message: tpl(t.launcher_hotkey_system_conflict_toast, {
          owner: systemShortcutOwnerLabel(res.conflict.owner, t),
          hotkey: res.conflict.accelerator,
        }),
        durationMs: null,
        actions: [{
          label: t.launcher_hotkey_system_conflict_action,
          onClick: () => {
            dismiss(LAUNCHER_CONFLICT_KEY)
            useAppStore.setState({ settingsOpen: true, settingsInitialSection: 'hotkeys' })
          },
        }],
      })
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  return null
}

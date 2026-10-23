import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useT } from '../../store/useAppStore'
import { useNotificationStore } from '../../store/useNotificationStore'
import { trapTabFocus } from '../../utils/focusTrap'
import { Button } from '../ui/atoms'

/** Toast owner key for the outcome of the hand-over. */
const SPOTLIGHT_RESULT_KEY = 'launcher-spotlight-handover'

/**
 * First-run prompt (macOS): Spotlight owns Command+Space, the combination the Viezan
 * Launcher wants. Ask once whether to hand it over. "Replace" turns Spotlight's shortcut
 * off in the user's macOS preferences and enables the Launcher on Command+Space; "Keep"
 * leaves Spotlight alone and enables the Launcher on Option+Space. Either answer closes
 * the prompt for good; Settings keeps a way back.
 */
export function LauncherSpotlightPrompt({ blocked = false }: { blocked?: boolean }) {
  const t = useT()
  const notify = useNotificationStore((state) => state.notify)
  const [pending, setPending] = useState(false)
  const [busy, setBusy] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const open = pending && !blocked

  useEffect(() => {
    const api = window.api?.hotkey?.chat?.spotlight
    if (!api || window.api?.platform !== 'darwin') return
    let active = true
    void api.get().then((res) => {
      if (active && res?.success && res.shouldPrompt) setPending(true)
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  const resolve = useCallback(async (choice: 'replace' | 'keep') => {
    const api = window.api?.hotkey?.chat?.spotlight
    if (!api || busy) return
    setBusy(true)
    try {
      const res = await api.resolve(choice)
      if (!res?.success) {
        notify({
          key: SPOTLIGHT_RESULT_KEY,
          tone: 'error',
          message: choice === 'replace' ? t.launcher_spotlight_replace_failed : (res?.error ?? t.launcher_hotkey_failed),
        })
        // Keep the prompt open after a failure only for "replace": the user can still choose "keep".
        if (choice === 'keep') setPending(false)
        return
      }
      setPending(false)
      notify({
        key: SPOTLIGHT_RESULT_KEY,
        tone: choice === 'replace' && res.applied === false ? 'warning' : 'success',
        message: choice === 'keep' ? t.launcher_spotlight_kept
          : res.applied === false ? t.launcher_spotlight_relogin : t.launcher_spotlight_replaced,
        durationMs: res.applied === false ? null : undefined,
      })
    } catch {
      notify({ key: SPOTLIGHT_RESULT_KEY, tone: 'error', message: t.launcher_spotlight_replace_failed })
    } finally {
      setBusy(false)
    }
  }, [busy, notify, t])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    primaryRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      // Escape is the conservative answer: Spotlight stays as it is.
      if (event.key === 'Escape') { event.preventDefault(); void resolve('keep') }
      else trapTabFocus(event, dialogRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); previous?.focus() }
  }, [open, resolve])

  if (!open) return null
  return (
    <div className="modal-backdrop update-notification-backdrop">
      <section ref={dialogRef} className="modal-surface update-notification" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <h2 id={titleId}>{t.launcher_spotlight_prompt_title}</h2>
        <p id={descriptionId}>{t.launcher_spotlight_prompt_desc}</p>
        <p>{t.launcher_spotlight_prompt_note}</p>
        <div className="update-notification-actions">
          <Button size="md" variant="neutral" appearance="outline" disabled={busy} onClick={() => void resolve('keep')}>
            {t.launcher_spotlight_prompt_keep}
          </Button>
          <Button ref={primaryRef} size="md" variant="primary" appearance="solid" disabled={busy} onClick={() => void resolve('replace')}>
            {t.launcher_spotlight_prompt_replace}
          </Button>
        </div>
      </section>
    </div>
  )
}

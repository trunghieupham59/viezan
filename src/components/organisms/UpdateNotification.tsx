import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { GITHUB_RELEASES_URL } from '../../constants/urls'
import { useAppStore, useT } from '../../store/useAppStore'
import { useNotificationStore } from '../../store/useNotificationStore'
import { useUpdaterStore } from '../../store/useUpdaterStore'
import { trapTabFocus } from '../../utils/focusTrap'
import { tpl } from '../../utils/tpl'
import { Button } from '../ui/atoms'

/** Toast owner key for download/install failures raised from this dialog. */
const UPDATE_ACTION_ERROR_KEY = 'update-notification-action'

/** Keeps the updater subscription alive independently of the Settings modal. */
export function UpdateNotification({ blocked = false }: { blocked?: boolean }) {
  const t = useT()
  const locale = useAppStore((state) => state.locale)
  const theme = useAppStore((state) => state.theme)
  const themePreset = useAppStore((state) => state.themePreset)
  const themeAccent = useAppStore((state) => state.themeAccent)
  const nativeNotification = !!window.api?.updater?.getNotificationPreferences
  const { status, promptVersion, snoozes, receive, snooze } = useUpdaterStore()
  const [now, setNow] = useState(Date.now)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(false)
  const notify = useNotificationStore((state) => state.notify)
  const dismissNotification = useNotificationStore((state) => state.dismiss)
  const [visible, setVisible] = useState(document.visibilityState !== 'hidden')
  const dialogRef = useRef<HTMLElement>(null)
  const laterRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const version = status.version
  const until = version ? snoozes[version] ?? 0 : 0
  const actionable = status.type === 'available' || status.type === 'downloading' || status.type === 'downloaded'
  const open = !nativeNotification && actionable && !!version && promptVersion === version && until <= now && !blocked && visible
  const dismiss = useCallback(() => {
    if (version) snooze(version)
  }, [version, snooze])

  useEffect(() => {
    void window.api?.updater?.setNotificationPreferences?.({ locale, theme, themePreset, themeAccent }).catch(() => undefined)
  }, [locale, theme, themePreset, themeAccent])

  useEffect(() => {
    const api = window.api?.updater
    const open = async () => {
      try {
        if (await api?.consumeOpenSettings?.()) {
          useAppStore.setState({ settingsOpen: true, settingsInitialSection: 'updates' })
        }
      } catch { /* A later notification can retry when main is available. */ }
    }
    const unsubscribe = api?.onOpenSettings?.(() => void open())
    void open()
    return () => unsubscribe?.()
  }, [])

  useEffect(() => {
    const api = window.api?.updater
    if (!api) return
    let active = true
    let receivedEvent = false
    const unsubscribe = api.onStatus((next) => {
      receivedEvent = true
      receive(next)
      setActionError(false)
    })
    void api.getStatus?.().then((snapshot) => {
      if (active && !receivedEvent && snapshot) receive(snapshot)
    }).catch(() => undefined)
    return () => { active = false; unsubscribe() }
  }, [receive])

  useEffect(() => {
    const refresh = () => {
      setNow(Date.now())
      setVisible(document.visibilityState !== 'hidden')
    }
    document.addEventListener('visibilitychange', refresh)
    const timer = until > Date.now() ? setTimeout(refresh, until - Date.now()) : undefined
    refresh()
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [until])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    laterRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); dismiss() }
      else trapTabFocus(event, dialogRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); previous?.focus() }
  }, [open, dismiss])

  const run = async (action: 'download' | 'install' | 'openDownload') => {
    if (busy) return
    setBusy(true)
    setActionError(false)
    try {
      const api = window.api?.updater
      const result = await (action === 'openDownload'
        ? api?.openDownload(GITHUB_RELEASES_URL.replace(/\/latest$/, `/tag/v${encodeURIComponent(version ?? '')}`))
        : api?.[action]())
      if (!result?.success) setActionError(true)
    } catch { setActionError(true) }
    finally { setBusy(false) }
  }

  const showActionError = open && (actionError || Boolean(status.error))
  useEffect(() => {
    if (!showActionError) {
      dismissNotification(UPDATE_ACTION_ERROR_KEY)
      return
    }
    notify({ key: UPDATE_ACTION_ERROR_KEY, tone: 'error', message: t.update_notification_action_error })
  }, [showActionError, notify, dismissNotification, t])

  if (!open) return null
  return (
    <div className="modal-backdrop update-notification-backdrop">
      <section ref={dialogRef} className="modal-surface update-notification" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <h2 id={titleId}>{tpl(status.type === 'downloaded' ? t.settings_update_downloaded : t.settings_update_available, { version })}</h2>
        <p id={descriptionId}>{t.update_notification_description}</p>
        {status.type === 'downloading' && <p role="status">{tpl(t.settings_update_downloading, { percent: status.percent ?? 0 })}</p>}
        <div className="update-notification-actions">
          <Button size="md" variant="neutral" appearance="ghost" disabled={busy} onClick={() => void run('openDownload')}>{t.update_notification_release_notes}</Button>
          <Button ref={laterRef} size="md" variant="neutral" appearance="outline" onClick={dismiss}>{t.update_notification_later}</Button>
          <Button size="md" variant="neutral" appearance="solid" disabled={busy || status.type === 'downloading'} onClick={() => void run(status.type === 'downloaded' ? 'install' : 'download')}>
            {status.type === 'downloaded' ? t.settings_update_install : t.settings_update_download}
          </Button>
        </div>
      </section>
    </div>
  )
}

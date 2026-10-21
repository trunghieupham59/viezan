import { useEffect, useState } from 'react'
import type { UpdateNotificationAction, UpdateNotificationSnapshot, UpdatePopupApi } from '../../shared/updateNotification'
import { AppLogoIcon, Button, XIcon } from '../components/ui/atoms'
import { TRANSLATIONS } from '../i18n'
import { tpl } from '../utils/tpl'

declare global { interface Window { updatePopup?: UpdatePopupApi } }

export function UpdatePopupPage() {
  const [snapshot, setSnapshot] = useState<UpdateNotificationSnapshot | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const api = window.updatePopup
    if (!api) return
    let active = true
    let received = false
    const unsubscribe = api.onSnapshot((next) => { received = true; setSnapshot(next); setError(false) })
    void api.getSnapshot().then((next) => { if (active && !received) setSnapshot(next) }).catch(() => setError(true))
    return () => { active = false; unsubscribe() }
  }, [])
  useEffect(() => {
    if (!snapshot) return
    document.documentElement.lang = snapshot.locale
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', snapshot.theme === 'dark' || (snapshot.theme === 'system' && media.matches))
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [snapshot])
  const act = async (action: UpdateNotificationAction) => {
    const updating = action === 'download' || action === 'install'
    if (busy && updating) return
    if (updating) setBusy(true)
    setError(false)
    try { if (!await window.updatePopup?.act(action)) setError(true) }
    catch { setError(true) }
    finally { if (updating) setBusy(false) }
  }
  if (!snapshot) return null
  const t = TRANSLATIONS[snapshot.locale]
  return (
    <main className="update-popup" aria-labelledby="update-title">
      <div className="update-popup-header">
        <div className="update-popup-brand"><AppLogoIcon size="md" /><strong>Viezan</strong></div>
        <Button size="md" shape="icon" variant="neutral" appearance="ghost" aria-label={t.update_popup_close} onClick={() => void act('dismiss')}><XIcon className="h-4 w-4" /></Button>
      </div>
      <div className="update-popup-content">
        <h1 id="update-title">{snapshot.ready ? t.update_popup_ready_title : t.update_popup_title}</h1>
        <p className="update-popup-version">{tpl(t.update_popup_version, { version: snapshot.version })}</p>
        <p className="update-popup-description">{snapshot.ready ? t.update_popup_ready_description : t.update_popup_description}</p>
      </div>
      {snapshot.downloading && <p role="status">{tpl(t.settings_update_downloading, { percent: snapshot.percent ?? 0 })}</p>}
      {(error || snapshot.error) && <p role="alert">{t.update_notification_action_error}</p>}
      <div className="update-popup-actions">
        <Button size="md" variant="neutral" appearance="outline" onClick={() => void act('later')}>{t.update_popup_later}</Button>
        <Button size="md" variant="primary" appearance="solid" disabled={busy || snapshot.downloading} onClick={() => void act(snapshot.ready ? 'install' : 'download')}>
          {snapshot.ready ? t.settings_update_install : t.update_popup_download}
        </Button>
      </div>
    </main>
  )
}

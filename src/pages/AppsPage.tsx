import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppAction, AppActionSession, AppRemovalPlan, AppsIssue, AppsReply, InstalledApp } from '../../shared/appsApi'
import { AppActionHistory, AppRemovalDetails } from '../components/organisms'
import { PageHeader } from '../components/templates'
import { Button, ProgressBar } from '../components/ui/atoms'
import { FilterInput } from '../components/ui/molecules'
import { useAppStore, useT } from '../store/useAppStore'
import { tpl } from '../utils/tpl'
import '../styles/apps.css'

export function AppsPage() {
  const labels = useT()
  const t = labels.apps
  const locale = useAppStore(s => s.locale)
  const [apps, setApps] = useState<InstalledApp[]>([])
  const [plan, setPlan] = useState<AppRemovalPlan | null>(null)
  const [sessions, setSessions] = useState<AppActionSession[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [action, setAction] = useState<AppAction>('uninstall')
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [issue, setIssue] = useState<AppsIssue | null>(null)
  const [message, setMessage] = useState('')
  const mounted = useRef(false)
  const pending = useRef(false)
  const api = window.api?.apps
  const run = useCallback(async <T,>(work: () => Promise<AppsReply<T>>, complete: (value: T) => void) => {
    if (pending.current) return
    pending.current = true
    setBusy(true); setIssue(null); setMessage('')
    try {
      const result = await work()
      if (!mounted.current) return
      if (result.success) complete(result.data)
      else setIssue(result.error)
    } catch { if (mounted.current) setIssue('failed') }
    finally { pending.current = false; if (mounted.current) setBusy(false) }
  }, [])
  const refresh = useCallback(() => {
    setPlan(null)
    if (!api) { setIssue('unsupported'); return }
    void run(async () => {
      const list = await api.inventory()
      const history = await api.sessions()
      if (!list.success) return list
      if (!history.success) return history
      return { success: true, data: { list: list.data, history: history.data } }
    }, data => { setApps(data.list); setSessions(data.history) })
  }, [api, run])
  useEffect(() => { mounted.current = true; refresh(); return () => { mounted.current = false } }, [refresh])
  const inspect = (app: InstalledApp) => {
    if (!api) return
    setPlan(null)
    void run(() => api.inspect(app.id), next => {
      setPlan(next); setAction('uninstall'); setSelected(next.items.filter(i => i.selected).map(i => i.id))
    })
  }
  const setMode = (mode: AppAction) => {
    setAction(mode)
    if (plan) setSelected(plan.items.filter(i => i.selected && (mode === 'uninstall' || i.kind !== 'bundle')).map(i => i.id))
  }
  const saveResult = (session: AppActionSession) => {
    setSessions(previous => [session, ...previous.filter(s => s.id !== session.id)])
    setPlan(null)
    setMessage(session.items.some(i => i.issue || i.status === 'pending' || i.status === 'failed') ? t.verifyIncomplete : tpl(t.done, { count: session.items.filter(i => i.status === 'trashed' || i.status === 'restored').length }))
  }
  const apply = () => {
    if (!api || !plan) return
    void run(() => api.apply({ planId: plan.id, itemIds: selected, action, quit: true, locale }), saveResult)
  }
  const visible = apps.filter(app => `${app.name} ${app.bundleId}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))
  return (
    <div className="app-page"><div className="app-workspace"><div className="glass-panel apps-page">
      <PageHeader title={labels.nav_apps} description={labels.apps_description} actions={<Button size="sm" variant="neutral" appearance="outline" disabled={busy} onClick={refresh}>{t.refresh}</Button>} />
      <div className="apps-body">
        <p className="apps-meta">{t.scope}</p>
        {busy && <div role="status"><ProgressBar label={t.loading} /><span>{t.loading}</span></div>}
        {issue && <p role="alert" className="apps-error">{t.errors[issue]}</p>}
        {message && <p role="status">{message}</p>}
        <div className="apps-grid">
          <section className="apps-panel" aria-label={t.inventory}>
            <h2>{t.inventory}</h2>
            <FilterInput value={filter} onValueChange={setFilter} clearLabel={t.clearSearch} aria-label={t.search} placeholder={t.search} />
            {!busy && visible.length === 0 && <p>{t.empty}</p>}
            <ul className="apps-list">
              {visible.map(app => <li key={app.id}>
                <Button size="sm" variant={plan?.app.id === app.id ? 'primary' : 'neutral'} appearance={plan?.app.id === app.id ? 'soft' : 'ghost'} className="apps-select" disabled={busy} aria-pressed={plan?.app.id === app.id} onClick={() => inspect(app)} title={app.path}>{app.name}</Button>
                <span className="apps-meta apps-path">{app.version} · {app.bundleId}{app.blocked ? ` · ${t.errors[app.blocked]}` : ''}</span>
              </li>)}
            </ul>
          </section>
          <section className="apps-panel" aria-label={t.details}>
            <h2>{plan?.app.name ?? t.details}</h2>
            {!plan && <p className="apps-meta">{t.selectApp}</p>}
            {plan && <>
              <fieldset className="apps-toolbar" aria-label={t.mode}>
                {(['uninstall', 'reset'] as const).map(mode => <Button key={mode} size="sm" variant={action === mode ? 'primary' : 'neutral'} appearance={action === mode ? 'soft' : 'ghost'} disabled={busy} aria-pressed={action === mode} onClick={() => setMode(mode)}>{t[mode]}</Button>)}
              </fieldset>
              {plan.running && <p>{t.running}</p>}
              {!plan.canUndo && <p role="alert">{t.errors['native-missing']}</p>}
              {plan.incomplete && <p>{t.verifyIncomplete}</p>}
              <AppRemovalDetails plan={plan} selected={selected} action={action} busy={busy}
                onToggle={id => setSelected(previous => previous.includes(id) ? previous.filter(i => i !== id) : [...previous, id])}
                onReveal={id => { if (api) void run(() => api.reveal(id), () => {}) }} />
              <div className="apps-toolbar">
                <span>{tpl(t.selected, { count: selected.length })}</span>
                <Button size="md" variant="danger" appearance="outline" disabled={busy || !plan.canUndo || Boolean(plan.app.blocked) || plan.incomplete || !selected.length} onClick={apply}>{plan.running ? t.quitThenContinue : t.proceed}</Button>
              </div>
            </>}
          </section>
        </div>
        <AppActionHistory sessions={sessions} busy={busy} onUndo={id => { if (api) void run(() => api.undo(id), saveResult) }} />
      </div>
    </div></div></div>
  )
}

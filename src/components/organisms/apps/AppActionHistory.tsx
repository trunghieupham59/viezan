import type { AppActionSession } from '../../../../shared/appsApi'
import { useAppStore, useT } from '../../../store/useAppStore'
import { tpl } from '../../../utils/tpl'
import { Button } from '../../ui/atoms'

export function AppActionHistory({ sessions, busy, onUndo }: { sessions: AppActionSession[]; busy: boolean; onUndo: (id: string) => void }) {
  const { apps: t } = useT()
  const locale = useAppStore(s => s.locale)
  return (
    <section className="apps-history" aria-label={t.history}>
      <h2>{t.history}</h2>
      {sessions.length === 0 && <p className="apps-meta">{t.historyEmpty}</p>}
      {sessions.map(session => (
        <details key={session.id} className="apps-session">
          <summary>{session.appName} · {t[session.action]} · {new Date(session.createdAt).toLocaleString(locale)}</summary>
          <p>{session.remaining === null ? t.verifyIncomplete : tpl(t.remaining, { count: session.remaining })}</p>
          <ul>
            {session.items.map((item) => <li key={item.path}><span className="apps-path">{item.path}</span> — {t.status[item.status]}{item.issue ? ` · ${t.errors[item.issue]}` : ''}</li>)}
          </ul>
          <Button size="sm" variant="neutral" appearance="outline" disabled={busy || !session.canUndo} onClick={() => onUndo(session.id)}>{t.undo}</Button>
        </details>
      ))}
    </section>
  )
}

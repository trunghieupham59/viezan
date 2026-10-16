import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/atoms'
import { SelectField } from '../../components/ui/molecules'
import { useT } from '../../store/useAppStore'
import type { LocalAiExecutionMode, LocalAiPerformanceState } from '../../types'

export function LocalAiPerformanceSection({ models }: { models: Array<{ id: string; name: string }> }) {
  const t = useT()
  const installed = models.filter(model => model.id !== 'local-auto')
  const [model, setModel] = useState(installed[0]?.id ?? '')
  const [state, setState] = useState<LocalAiPerformanceState>({})
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const currentModel = useRef(model)
  currentModel.current = model
  useEffect(() => {
    if (!installed.some(item => item.id === model)) setModel(installed[0]?.id ?? '')
  }, [installed, model])
  useEffect(() => {
    let active = true
    setState({}); setError(''); setConfirming(false); setLoading(true)
    if (!model || !window.api?.getLocalAiPerformance) { setLoading(false); return }
    void window.api.getLocalAiPerformance(model).then(result => { if (active) { setState(result); setBusy(Boolean(result.running)) } })
      .catch(err => { if (active) setError(String(err)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [model])
  useEffect(() => {
    if (!busy || !model || !window.api?.getLocalAiPerformance) return
    let active = true
    const timer = setInterval(() => {
      void window.api.getLocalAiPerformance(model).then(result => {
        if (active && !result.running) { setState(result); setBusy(false) }
      }).catch(() => { /* The invoking request reports its error. */ })
    }, 1000)
    return () => { active = false; clearInterval(timer) }
  }, [busy, model])
  const compare = async () => {
    const target = model
    setConfirming(false); setBusy(true); setError('')
    try {
      const result = await window.api.compareLocalAiPerformance({ model: target, consentToReload: true })
      if (currentModel.current === target) setState(result)
    } catch (err) { if (currentModel.current === target) setError(String(err)) }
    finally { setBusy(false) }
  }
  const select = async (mode: LocalAiExecutionMode | 'auto') => {
    const target = model
    setLoading(true); setError('')
    try {
      const result = await window.api.selectLocalAiPerformance(target, mode)
      if (currentModel.current === target) setState(result)
    } catch (err) { if (currentModel.current === target) setError(String(err)) }
    finally { setLoading(false) }
  }
  if (!installed.length || !window.api?.getLocalAiPerformance) return null
  const label = (mode: LocalAiExecutionMode | 'auto') => mode === 'gpu' ? t.settings_local_perf_gpu : mode === 'hybrid' ? t.settings_local_perf_hybrid : t.settings_local_perf_auto
  return (
    <section className="settings-inset rounded-lg p-3 space-y-3" aria-label={t.settings_local_perf_title}>
      <h4 className="font-semibold">{t.settings_local_perf_title}</h4>
      <p className="text-xs text-muted">{t.settings_local_perf_description}</p>
      <SelectField label={t.settings_local_perf_model} value={model} onChange={setModel}
        disabled={busy || loading} options={installed.map(item => ({ value: item.id, label: item.name }))} />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="md" variant="primary" appearance="outline" disabled={busy || loading || !model} onClick={() => setConfirming(true)}>
          {busy ? t.settings_local_ai_benchmarking : t.settings_local_perf_compare}
        </Button>
        {busy && <Button size="md" variant="danger" appearance="outline" onClick={() => { void window.api.cancelLocalAiPerformance().catch(err => setError(String(err))) }}>{t.settings_local_perf_stop}</Button>}
      </div>
      {confirming && <div role="alertdialog" aria-label={t.settings_local_perf_compare} className="space-y-2">
        <p className="text-xs">{t.settings_local_perf_reload_warning}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="md" variant="primary" onClick={() => { void compare() }}>{t.settings_local_perf_start}</Button>
          <Button size="md" variant="neutral" appearance="outline" onClick={() => setConfirming(false)}>{t.settings_local_perf_dismiss}</Button>
        </div>
      </div>}
      {busy && <p role="status" className="text-xs">{t.settings_local_perf_running}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {state.comparison && <>
        <p className="text-xs text-muted">{model} · {new Date(state.comparison.measuredAt).toLocaleString()}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <caption className="text-left text-muted">{t.settings_local_perf_metrics_note}</caption>
            <thead><tr>
              <th className="p-2 text-left">{t.settings_local_perf_mode}</th>
              <th className="p-2 text-left">{t.settings_local_ai_runtime_speed}</th>
              <th className="p-2 text-left">{t.settings_local_perf_ttft}</th>
              <th className="p-2 text-left">{t.settings_local_perf_memory}</th>
            </tr></thead>
            <tbody>{state.comparison.results.map(result => <tr key={result.mode}>
              <th className="p-2 text-left font-medium">{label(result.mode)}{state.comparison?.recommendedMode === result.mode ? ` · ${t.settings_local_perf_recommended}` : ''}
                {Boolean(result.runnerRecoveries) && <details className="font-normal"><summary>{t.settings_local_perf_recovered.replace('{count}', String(result.runnerRecoveries))}</summary>
                  <p>{t.settings_local_perf_recovery_note}</p>
                  {[...new Set(result.runnerRecoveryErrors)].map(message => <p key={message}>{message}</p>)}
                </details>}
              </th>
              <td className="p-2">{result.status === 'ok' ? `${result.tokensPerSecond} tok/s` : '—'}</td>
              <td className="p-2">{result.status === 'ok' ? `${result.firstTokenMs} ms` : '—'}</td>
              <td className="p-2">{result.status === 'ok' ? `${((result.vramBytes ?? 0) / 1024 ** 3).toFixed(2)} / ${((result.modelRamBytes ?? 0) / 1024 ** 3).toFixed(2)} GB`
                : <>{t.settings_local_perf_failed}<details><summary>{t.settings_local_perf_details}</summary>{result.error}</details></>}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </>}
      <p className="text-xs">{t.settings_local_perf_selected}: {label(state.selection?.mode ?? 'auto')}</p>
      <fieldset className="flex flex-wrap gap-2" aria-label={t.settings_local_perf_selected}>
        {(['auto', 'gpu', 'hybrid'] as const).map(mode => <Button key={mode} size="md"
          variant={(state.selection?.mode ?? 'auto') === mode ? 'primary' : 'neutral'} appearance={(state.selection?.mode ?? 'auto') === mode ? 'soft' : 'outline'}
          aria-pressed={(state.selection?.mode ?? 'auto') === mode} disabled={busy || loading || (mode !== 'auto' && !state.comparison?.results.some(r => r.mode === mode && r.status === 'ok' && r.qualityPassed))}
          onClick={() => { void select(mode) }}>{label(mode)}</Button>)}
      </fieldset>
      <p className="text-xs text-muted">{t.settings_local_perf_apply_note}</p>
    </section>
  )
}

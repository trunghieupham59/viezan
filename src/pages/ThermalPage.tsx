import { useCallback, useMemo } from 'react'
import type { ThermalFan, ThermalSensorGroup as ThermalGroupId, ThermalSensor, ThermalTraySettings } from '../../shared/thermalApi'
import { ThermalFanList, ThermalSensorGroup, ThermalSummary, type ThermalSummaryItem, ThermalTrayOptions } from '../components/organisms'
import { CapabilityNotice, FeatureLoadingState } from '../components/ui/molecules'
import { THERMAL_HISTORY_SAMPLES, THERMAL_SAMPLE_INTERVAL_MS, useThermalMonitor } from '../hooks/useThermalMonitor'
import { useThermalSettings } from '../hooks/useThermalSettings'
import type { Translations } from '../i18n'
import { useAppStore, useT } from '../store/useAppStore'
import { useNotificationStore } from '../store/useNotificationStore'
import { tpl } from '../utils/tpl'
import '../styles/thermal.css'

const GROUPS: readonly ThermalGroupId[] = ['cpu', 'gpu', 'other']
/** Toast owner key so repeated save failures replace each other. */
const TRAY_ERROR_KEY = 'thermal-tray'

function labelKeyFor(sensor: ThermalSensor): keyof Translations | null {
  if (!sensor.label) return null
  return `thermal_label_${sensor.label.replace(/-/g, '_')}` as keyof Translations
}

/** Temperatures, fan speeds and CPU load for this machine, live while the page is open. */
export function ThermalPage() {
  const t = useT()
  const locale = useAppStore((state) => state.locale)
  const { support, snapshot, history, error, retry } = useThermalMonitor()
  const { settings, busy: settingsBusy, update: updateSettings } = useThermalSettings()
  const notify = useNotificationStore((state) => state.notify)
  const dismiss = useNotificationStore((state) => state.dismiss)

  const numberFormat = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }), [locale])
  const integerFormat = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), [locale])
  const formatCelsius = useCallback((celsius: number) => `${numberFormat.format(celsius)}°C`, [numberFormat])
  const formatRpm = useCallback((rpm: number) => `${integerFormat.format(rpm)} RPM`, [integerFormat])

  const labelFor = useCallback((sensor: ThermalSensor) => {
    const key = labelKeyFor(sensor)
    const localized = key ? t[key] : undefined
    if (typeof localized === 'string') return sensor.name && sensor.name !== sensor.code ? `${localized} · ${sensor.name}` : localized
    return sensor.name ?? sensor.code
  }, [t])
  const fanName = useCallback((fan: ThermalFan) => fan.name ?? tpl(t.thermal_fan_name, { n: fan.index + 1 }), [t])
  const fanRange = useCallback((fan: ThermalFan) => {
    const parts: string[] = []
    if (fan.minRpm !== undefined && fan.maxRpm !== undefined) parts.push(tpl(t.thermal_fan_range, { min: integerFormat.format(fan.minRpm), max: integerFormat.format(fan.maxRpm) }))
    if (fan.targetRpm !== undefined) parts.push(tpl(t.thermal_fan_target, { rpm: integerFormat.format(fan.targetRpm) }))
    return parts.length > 0 ? parts.join(' · ') : undefined
  }, [t, integerFormat])

  const historyLabel = tpl(t.thermal_history_hint, { minutes: Math.round((THERMAL_HISTORY_SAMPLES * THERMAL_SAMPLE_INTERVAL_MS) / 60_000) })
  const groupTitle: Record<ThermalGroupId, string> = { cpu: t.thermal_group_cpu, gpu: t.thermal_group_gpu, other: t.thermal_group_other }

  const summary = useMemo<ThermalSummaryItem[]>(() => {
    if (!snapshot) return []
    const hottest = snapshot.sensors.reduce<ThermalSensor | null>((best, sensor) => (!best || sensor.celsius > best.celsius ? sensor : best), null)
    const items: ThermalSummaryItem[] = []
    if (snapshot.cpuLoadPercent !== undefined) items.push({ id: 'cpu', label: t.thermal_cpu_load, value: `${snapshot.cpuLoadPercent}%` })
    if (hottest) items.push({ id: 'hottest', label: t.thermal_hottest, value: formatCelsius(hottest.celsius), caption: labelFor(hottest) })
    items.push({ id: 'count', label: t.thermal_group_other, value: tpl(t.thermal_sensor_count, { count: snapshot.sensors.length }), caption: historyLabel })
    return items
  }, [snapshot, t, formatCelsius, labelFor, historyLabel])

  const trayPlacement = support?.supported && support.trayPlacement && support.trayPlacement !== 'none' ? support.trayPlacement : null
  const onTrayChange = useCallback(async (patch: Partial<ThermalTraySettings>) => {
    dismiss(TRAY_ERROR_KEY)
    const res = await updateSettings({ tray: patch })
    if (!res.success) notify({ key: TRAY_ERROR_KEY, tone: 'error', message: t.thermal_tray_error })
  }, [dismiss, notify, updateSettings, t])

  if (!support) return <FeatureLoadingState label={t.thermal_title} layout="list" />

  return (
    <div className="app-page thermal-page">
      <header className="thermal-header">
        <div>
          <h1 className="thermal-title">{t.thermal_title}</h1>
          <p className="thermal-subtitle">{t.thermal_subtitle}</p>
        </div>
        {snapshot && <ThermalSummary items={summary} />}
      </header>

      {!support.supported && (
        <CapabilityNotice
          tone="warning"
          title={support.reason === 'reader-missing' ? t.thermal_reader_missing_title : t.thermal_unsupported_title}
          description={support.reason === 'reader-missing' ? t.thermal_reader_missing_desc : t.thermal_unsupported_desc}
        />
      )}

      {support.supported && error && (
        <CapabilityNotice
          tone="danger"
          title={t.thermal_error_title}
          description={error}
          actions={[{ label: t.thermal_retry, onClick: retry, primary: true }]}
        />
      )}

      {support.supported && !snapshot && !error && (
        <p className="thermal-empty" role="status">{t.thermal_waiting}</p>
      )}

      {trayPlacement && settings && (
        <ThermalTrayOptions
          placement={trayPlacement}
          settings={settings.tray}
          busy={settingsBusy}
          onChange={(patch) => void onTrayChange(patch)}
          labels={{
            title: trayPlacement === 'menu-bar' ? t.thermal_tray_section_menu_bar : t.thermal_tray_section_tray,
            enable: t.thermal_tray_enable,
            enableDescription: trayPlacement === 'menu-bar' ? t.thermal_tray_enable_desc_menu_bar : t.thermal_tray_enable_desc_tray,
            metric: t.thermal_tray_metric,
            metricOptions: { hottest: t.thermal_hottest, cpu: t.thermal_group_cpu, gpu: t.thermal_group_gpu },
            showFan: t.thermal_tray_show_fan,
          }}
        />
      )}

      {support.supported && snapshot && (
        <div className="thermal-body">
          {snapshot.sensors.length === 0 && <p className="thermal-empty">{t.thermal_no_sensors}</p>}
          {GROUPS.map((group) => (
            <ThermalSensorGroup
              key={group}
              title={groupTitle[group]}
              sensors={snapshot.sensors.filter((sensor) => sensor.group === group)}
              history={history}
              labelFor={labelFor}
              historyLabel={historyLabel}
              formatCelsius={formatCelsius}
            />
          ))}
          <ThermalFanList
            title={t.thermal_fans_title}
            fans={snapshot.fans}
            history={history}
            nameFor={fanName}
            rangeFor={fanRange}
            formatRpm={formatRpm}
            emptyText={t.thermal_no_fans}
            historyLabel={historyLabel}
          />
        </div>
      )}
    </div>
  )
}

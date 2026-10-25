import { useCallback, useMemo, useState } from 'react'
import type { FanCommand, FanProfile, ThermalFan, ThermalSensor, ThermalSensorGroup, ThermalTraySettings } from '../../shared/thermalApi'
import { ThermalFanDisclaimer, ThermalFanPanel, type ThermalFanSources, ThermalOptionsConfiguration, ThermalSensorTable, ThermalTrayOptions } from '../components/organisms'
import { PageHeader } from '../components/templates'
import { Button, SpinnerIcon, StopIcon } from '../components/ui/atoms'
import { CapabilityNotice, ConfigSection, FeatureLoadingState, StatusChip } from '../components/ui/molecules'
import { useFanCalibration } from '../hooks/useFanCalibration'
import { useFanControl } from '../hooks/useFanControl'
import { useFanProfiles } from '../hooks/useFanProfiles'
import { useThermalMonitor } from '../hooks/useThermalMonitor'
import { useThermalSettings } from '../hooks/useThermalSettings'
import type { Translations } from '../i18n'
import { useAppStore, useT } from '../store/useAppStore'
import { useNotificationStore } from '../store/useNotificationStore'
import { fanDisplayName, fanProfileDescription, fanProfileName } from '../utils/fanProfileText'
import { buildSensorRows, hottestSensor, THERMAL_GROUPS, type ThermalSensorRow } from '../utils/thermalSensorRows'
import { tpl } from '../utils/tpl'
import { buildTrayPreview } from '../utils/trayPreview'
import '../styles/thermal.css'

/** Toast owner keys so repeated failures replace each other. */
const TRAY_ERROR_KEY = 'thermal-tray'
const FAN_ERROR_KEY = 'thermal-fan'
const PROFILE_ERROR_KEY = 'thermal-fan-profile'
/** Must match the helper's default `--ceiling`; shown in the disclaimer. */
const FAN_CEILING_CELSIUS = 105
/** The long tail of chassis sensors starts folded; CPU and GPU stay open. */
const COLLAPSED_SENSOR_GROUPS: readonly ThermalSensorGroup[] = ['other']
function labelKeyFor(sensor: Pick<ThermalSensor, 'label'>): keyof Translations | null {
  if (!sensor.label) return null
  return `thermal_label_${sensor.label.replace(/-/g, '_')}` as keyof Translations
}

/** Temperatures, fan speeds and fan control for this machine, live while the page is open. */
export function ThermalPage() {
  const t = useT()
  const locale = useAppStore((state) => state.locale)
  const { support, snapshot, error, retry } = useThermalMonitor()
  const { settings, busy: settingsBusy, update: updateSettings } = useThermalSettings()
  const fanControl = useFanControl()
  const fanProfiles = useFanProfiles()
  const fanCalibration = useFanCalibration()
  const [disclaimerOpen, setDisclaimerOpen] = useState(false)
  const [calibrateConfirmOpen, setCalibrateConfirmOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const notify = useNotificationStore((state) => state.notify)
  const dismiss = useNotificationStore((state) => state.dismiss)

  const numberFormat = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }), [locale])
  const integerFormat = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), [locale])
  const formatCelsius = useCallback((celsius: number) => `${numberFormat.format(celsius)}°C`, [numberFormat])
  const formatRpm = useCallback((rpm: number) => `${integerFormat.format(rpm)} RPM`, [integerFormat])

  const localizedLabel = useCallback((sensor: Pick<ThermalSensor, 'label'>) => {
    const key = labelKeyFor(sensor)
    const localized = key ? t[key] : undefined
    return typeof localized === 'string' ? localized : undefined
  }, [t])
  const labelFor = useCallback((sensor: ThermalSensor) => {
    const localized = localizedLabel(sensor)
    if (localized) return sensor.name && sensor.name !== sensor.code ? `${localized} · ${sensor.name}` : localized
    return sensor.name ?? sensor.code
  }, [localizedLabel])
  // A fan is named by what the machine says it is (left / right / CPU), else by its number.
  const fanName = useCallback((fan: Pick<ThermalFan, 'index' | 'name' | 'label'>) => fanDisplayName(t, fan), [t])
  const fanNameById = useCallback((fanId: string) => {
    const fan = snapshot?.fans.find((candidate) => candidate.id === fanId)
    return fan ? fanName(fan) : fanId
  }, [snapshot, fanName])

  const groupTitle = useMemo(() => ({ cpu: t.thermal_group_cpu, gpu: t.thermal_group_gpu, other: t.thermal_group_other }), [t])
  const sensorRows = useMemo(() => buildSensorRows(snapshot?.sensors ?? []), [snapshot])
  const rowTitle = useCallback((row: ThermalSensorRow) => (row.unlabeled ? t.thermal_sensor_unlabeled : localizedLabel(row) ?? row.name ?? row.sensors[0]?.code ?? ''), [t, localizedLabel])
  const rowCaption = useCallback((row: ThermalSensorRow) => tpl(t.thermal_sensor_row_caption, { count: row.count, avg: formatCelsius(row.avg) }), [t, formatCelsius])
  const hottest = snapshot ? hottestSensor(snapshot.sensors) : null

  const trayPlacement = support?.supported && support.trayPlacement && support.trayPlacement !== 'none' ? support.trayPlacement : null
  const onTrayChange = useCallback(async (patch: Partial<ThermalTraySettings>) => {
    dismiss(TRAY_ERROR_KEY)
    const res = await updateSettings({ tray: patch })
    if (!res.success) notify({ key: TRAY_ERROR_KEY, tone: 'error', message: t.thermal_tray_error })
  }, [dismiss, notify, updateSettings, t])

  const reportFan = useCallback((res: { success: boolean; error?: string }) => {
    if (!res.success) notify({ key: FAN_ERROR_KEY, tone: 'error', message: res.error ?? t.thermal_fan_error })
  }, [notify, t])
  const reportProfile = useCallback((res: { success: boolean; error?: string }) => {
    if (!res.success) notify({ key: PROFILE_ERROR_KEY, tone: 'error', message: res.error ?? t.thermal_fan_profile_error })
  }, [notify, t])
  const startFanControl = useCallback(async () => {
    dismiss(FAN_ERROR_KEY)
    reportFan(await fanControl.enable())
  }, [dismiss, fanControl, reportFan])
  const onFanEnable = useCallback(() => {
    if (settings && !settings.fanControl.acknowledged) {
      setDisclaimerOpen(true)
      return
    }
    void startFanControl()
  }, [settings, startFanControl])
  const onDisclaimerAccept = useCallback(() => {
    setDisclaimerOpen(false)
    void updateSettings({ fanControl: { acknowledged: true } })
    void startFanControl()
  }, [updateSettings, startFanControl])
  const onSetFan = useCallback((fanId: string, command: FanCommand) => {
    dismiss(FAN_ERROR_KEY)
    void fanControl.setFan(fanId, command).then(reportFan)
  }, [dismiss, fanControl, reportFan])
  const profileName = useCallback((profile: FanProfile) => fanProfileName(t, profile), [t])
  const profileDescription = useCallback((profile: FanProfile) => fanProfileDescription(t, profile), [t])
  // What a fan may follow: the hottest of a group, the hottest of a meaning (the table's rows), or one raw sensor.
  const controlSources = useMemo((): ThermalFanSources => {
    if (!snapshot) return { affinity: {}, groups: [], kinds: [], raw: [] }
    const groupOption = (id: string, label: string, list: readonly ThermalSensor[]) => {
      const top = hottestSensor(list)
      return top ? [{ id, label, value: formatCelsius(top.celsius) }] : []
    }
    const groups = [
      ...groupOption('group:cpu', t.thermal_fan_source_group_cpu, snapshot.sensors.filter((sensor) => sensor.group === 'cpu')),
      ...groupOption('group:gpu', t.thermal_fan_source_group_gpu, snapshot.sensors.filter((sensor) => sensor.group === 'gpu')),
      ...groupOption('group:all', t.thermal_fan_source_group_all, snapshot.sensors),
    ]
    const kinds = THERMAL_GROUPS.flatMap((group) => sensorRows[group])
      .filter((row) => row.label)
      .map((row) => ({ id: `label:${row.label}`, label: row.count > 1 ? `${rowTitle(row)} · ${row.count}` : rowTitle(row), value: formatCelsius(row.max) }))
    const raw = THERMAL_GROUPS.flatMap((group) => snapshot.sensors.filter((sensor) => sensor.group === group))
      .map((sensor) => ({ id: sensor.id, code: sensor.code, label: labelFor(sensor), value: formatCelsius(sensor.celsius) }))
    // After a calibration each fan gets "the sensors near it": the hottest of what it cools, named by their meanings.
    const affinity: Record<string, { id: string; label: string; value?: string }> = {}
    for (const fanAffinity of fanCalibration.state?.result?.fans ?? []) {
      const owned = fanAffinity.sensors.filter((entry) => (entry.contrast ?? 0) >= 0.4 || entry.share >= 0.6).slice(0, 12)
      const members = (owned.length > 0 ? owned : [...fanAffinity.sensors].sort((a, b) => b.cooling - a.cooling).slice(0, 12))
        .map((entry) => snapshot.sensors.find((sensor) => sensor.id === entry.sensorId))
        .filter((sensor): sensor is ThermalSensor => sensor !== undefined)
      if (members.length === 0) continue
      const names = [...new Set(members.map((sensor) => localizedLabel(sensor) ?? sensor.name ?? sensor.code))].slice(0, 3).join(', ')
      const top = hottestSensor(members)
      const fanKey = fanAffinity.fanId.replace(/^smc:/, '')
      affinity[fanAffinity.fanId] = { id: `affinity:${fanKey}`, label: tpl(t.thermal_fan_source_affinity, { fan: fanNameById(fanAffinity.fanId) }), value: top ? `${formatCelsius(top.celsius)} · ${tpl(t.thermal_fan_source_affinity_desc, { sensors: names })}` : undefined }
    }
    return { affinity, groups, kinds, raw }
  }, [snapshot, sensorRows, rowTitle, labelFor, localizedLabel, formatCelsius, t, fanCalibration.state, fanNameById])
  // Fan control exists only where the SMC helper can run; elsewhere the fan panel shows readings only.
  const control = support?.supported === true && support.source === 'smc' && fanControl.state && fanControl.state.helper !== 'unsupported' ? fanControl.state : null
  const busy = fanControl.busy || fanProfiles.busy || fanCalibration.busy
  const reportCalibration = useCallback((res: { success: boolean; error?: string }) => {
    if (!res.success) notify({ key: FAN_ERROR_KEY, tone: 'error', message: res.error ?? t.thermal_fan_calibrate_error })
  }, [notify, t])
  const calibrationPhase = useCallback((phase: string | undefined) => (
    phase === 'baseline' ? t.thermal_fan_calibrate_phase_baseline : phase === 'spin' ? t.thermal_fan_calibrate_phase_spin : t.thermal_fan_calibrate_phase_settle
  ), [t])
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }), [locale])
  // "Detected <when> · Left fan: 74 sensors · Right fan: 14 sensors" — the counts tell whether a run made sense.
  const calibrationSummary = (() => {
    const result = fanCalibration.state?.result
    if (!result) return null
    const perFan = result.fans.map((fan) => tpl(t.thermal_fan_calibrate_fan_count, { fan: fanNameById(fan.fanId), count: fan.sensors.filter((entry) => (entry.contrast ?? 0) >= 0.4 || entry.share >= 0.6).length }))
    return [tpl(t.thermal_fan_calibrated_at, { date: dateFormat.format(new Date(result.calibratedAt)) }), ...perFan].join(' · ')
  })()
  const calibrationStatusLine = (() => {
    const state = fanCalibration.state
    if (!state) return null
    switch (state.status) {
      case 'running': return tpl(t.thermal_fan_calibrate_progress, { fan: state.fanId ? fanNameById(state.fanId) : '', current: (state.fanIndex ?? 0) + 1, total: state.fanCount ?? 0, phase: calibrationPhase(state.phase), seconds: state.secondsLeft ?? 0 })
      case 'done': return calibrationSummary ?? t.thermal_fan_calibrate_done
      case 'cancelled': return t.thermal_fan_calibrate_cancelled
      case 'error': return `${t.thermal_fan_calibrate_error} ${state.error ?? ''}`.trim()
      default: return calibrationSummary
    }
  })()
  const restoreReason = control?.lastRestoreReason && control.lastRestoreReason !== 'client'
    ? ({ watchdog: t.thermal_fan_reason_watchdog, ceiling: t.thermal_fan_reason_ceiling, sleep: t.thermal_fan_reason_sleep, 'can-sleep': t.thermal_fan_reason_sleep, wake: t.thermal_fan_reason_wake, disconnect: t.thermal_fan_reason_disconnect } as Record<string, string>)[control.lastRestoreReason] ?? control.lastRestoreReason
    : null

  if (!support) return <FeatureLoadingState label={t.thermal_title} layout="list" />

  /** Helper status chip + the one action it needs, in the command bar. */
  const helperControls = control ? (() => {
    switch (control.helper) {
      case 'missing':
        return <StatusChip tone="warning" title={t.thermal_fan_helper_missing}>{t.thermal_fan_helper_missing_short}</StatusChip>
      case 'starting':
        return (
          <>
            <StatusChip tone="info" icon={<SpinnerIcon />}>{t.thermal_fan_helper_starting}</StatusChip>
            <Button size="md" shape="rect" variant="primary" appearance="solid" disabled>{t.thermal_fan_enable}</Button>
          </>
        )
      case 'error':
        return (
          <>
            <StatusChip tone="danger" title={control.error}>{t.thermal_fan_helper_error_title}</StatusChip>
            <Button size="md" shape="rect" variant="primary" appearance="solid" disabled={busy} onClick={onFanEnable}>{t.thermal_fan_retry}</Button>
          </>
        )
      case 'ready':
        return (
          <>
            <StatusChip tone="ok">{tpl(t.thermal_fan_helper_ready, { version: control.helperVersion ?? '?' })}</StatusChip>
            <Button size="md" shape="rect" variant="danger" appearance="outline" disabled={busy} onClick={() => void fanControl.disable().then(reportFan)}>
              <StopIcon className="w-3.5 h-3.5" />{t.thermal_fan_disable}
            </Button>
          </>
        )
      default:
        return (
          <>
            <StatusChip tone="neutral">{t.thermal_fan_helper_idle_title}</StatusChip>
            <Button size="md" shape="rect" variant="primary" appearance="solid" disabled={busy} onClick={onFanEnable}>{t.thermal_fan_enable}</Button>
          </>
        )
    }
  })() : null

  return (
    <div className="app-page relative">
      <div className="app-workspace">
        <div className="glass-panel flex-1 min-h-0 flex flex-col overflow-hidden">
          <PageHeader
            title={t.thermal_title}
            actions={(
              <>
                {helperControls}
                {trayPlacement && settings && (
                  <ThermalOptionsConfiguration
                    open={optionsOpen}
                    title={t.thermal_options_title}
                    scopeDescription={control ? t.thermal_options_desc_fans : t.thermal_options_desc}
                    closeLabel={t.settings_close}
                    onOpenChange={setOptionsOpen}
                  >
                    {control && (
                      <ConfigSection title={t.thermal_fan_calibrate}>
                        <div className="thermal-calibrate">
                          <p className="thermal-calibrate__desc">{t.thermal_fan_calibrate_desc}</p>
                          {calibrationStatusLine && (
                            <p className="thermal-calibrate__status" data-status={fanCalibration.state?.status} role="status">{calibrationStatusLine}</p>
                          )}
                          <div className="thermal-calibrate__actions">
                            {fanCalibration.state?.status === 'running' ? (
                              <Button size="sm" shape="rect" variant="danger" appearance="outline" disabled={busy} onClick={() => void fanCalibration.cancel().then(reportCalibration)}>{t.thermal_fan_calibrate_cancel}</Button>
                            ) : (
                              <Button size="sm" shape="rect" variant="primary" appearance="solid" disabled={busy || control.helper !== 'ready'} title={control.helper !== 'ready' ? t.thermal_fan_profiles_need_helper : undefined} onClick={() => { setOptionsOpen(false); setCalibrateConfirmOpen(true) }}>{fanCalibration.state?.result ? t.thermal_fan_calibrate_again : t.thermal_fan_calibrate}</Button>
                            )}
                            {fanCalibration.state?.status !== 'running' && fanCalibration.state?.result && (
                              <Button size="sm" shape="rect" variant="neutral" appearance="ghost" disabled={busy} onClick={() => void fanCalibration.clear().then(reportCalibration)}>{t.thermal_fan_calibrate_clear}</Button>
                            )}
                          </div>
                        </div>
                      </ConfigSection>
                    )}
                    <ThermalTrayOptions
                      placement={trayPlacement}
                      settings={settings.tray}
                      preview={snapshot ? buildTrayPreview(snapshot, settings.tray, trayPlacement) : null}
                      busy={settingsBusy}
                      onChange={(patch) => void onTrayChange(patch)}
                      labels={{
                        title: trayPlacement === 'menu-bar' ? t.thermal_tray_section_menu_bar : t.thermal_tray_section_tray,
                        enable: t.thermal_tray_enable,
                        enableDescription: trayPlacement === 'menu-bar' ? t.thermal_tray_enable_desc_menu_bar : t.thermal_tray_enable_desc_tray,
                        metric: t.thermal_tray_metric,
                        metricOptions: { hottest: t.thermal_hottest, cpu: t.thermal_group_cpu, gpu: t.thermal_group_gpu },
                        showFan: t.thermal_tray_show_fan,
                        layout: t.thermal_tray_layout,
                        layoutOptions: { inline: t.thermal_tray_layout_inline, stacked: t.thermal_tray_layout_stacked },
                        fanFormat: t.thermal_tray_fan_format,
                        fanFormatOptions: { rpm: t.thermal_tray_fan_format_rpm, short: t.thermal_tray_fan_format_short },
                        showUnit: t.thermal_tray_show_unit,
                        preview: t.thermal_tray_preview,
                      }}
                    />
                  </ThermalOptionsConfiguration>
                )}
              </>
            )}
          />

          {restoreReason && <p className="thermal-notice">{tpl(t.thermal_fan_restored_reason, { reason: restoreReason })}</p>}

          <div className="thermal-panels-body">
            {!support.supported && (
              <CapabilityNotice
                tone="warning"
                title={support.reason === 'reader-missing' ? t.thermal_reader_missing_title : support.reason === 'no-sensors' ? t.thermal_no_sensors_title : t.thermal_unsupported_title}
                description={support.reason === 'reader-missing' ? t.thermal_reader_missing_desc : support.reason === 'no-sensors' ? t.thermal_no_sensors_desc : t.thermal_unsupported_desc}
              />
            )}

            {/* The helper's state is readable here, not only from the chip's tooltip. */}
            {control?.helper === 'missing' && (
              <CapabilityNotice tone="warning" title={t.thermal_fan_helper_missing_short} description={t.thermal_fan_helper_missing} />
            )}
            {control?.helper === 'error' && (
              <CapabilityNotice tone="danger" title={t.thermal_fan_helper_error_title} description={control.error} />
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

            {support.supported && snapshot && (
              <div className="app-panel-grid thermal-panels">
                <ThermalFanPanel
                  fans={snapshot.fans}
                  control={control}
                  profiles={fanProfiles.state}
                  sources={controlSources}
                  nameFor={fanName}
                  formatRpm={formatRpm}
                  formatCelsius={formatCelsius}
                  calibration={fanCalibration.state}
                  busy={busy}
                  onRestoreAll={() => void fanControl.restoreAll().then(reportFan)}
                  onCancelCalibration={() => void fanCalibration.cancel().then(reportCalibration)}
                  onSetFan={onSetFan}
                  onApplyProfile={(id) => { dismiss(PROFILE_ERROR_KEY); void fanProfiles.apply(id).then(reportProfile) }}
                  onSaveProfile={(name) => { dismiss(PROFILE_ERROR_KEY); void fanProfiles.saveCurrent(name).then(reportProfile) }}
                  onRemoveProfile={(id) => { dismiss(PROFILE_ERROR_KEY); void fanProfiles.remove(id).then(reportProfile) }}
                  labels={{
                    title: t.thermal_fans_title,
                    empty: t.thermal_no_fans,
                    restoreAll: t.thermal_fan_restore_all,
                    modeSystem: t.thermal_fan_mode_system,
                    modeAuto: t.thermal_fan_mode_auto,
                    modeFixed: t.thermal_fan_mode_fixed,
                    modeSensor: t.thermal_fan_mode_sensor,
                    targetLabel: t.thermal_fan_target_label,
                    sensorSource: t.thermal_fan_sensor_source,
                    sensorLow: t.thermal_fan_sensor_low,
                    sensorHigh: t.thermal_fan_sensor_high,
                    sensorNow: (celsius, rpm) => tpl(t.thermal_fan_sensor_now, { celsius, rpm }),
                    sensorMissing: t.thermal_fan_sensor_missing,
                    sourceGroups: t.thermal_fan_source_groups,
                    sourceKinds: t.thermal_fan_source_kinds,
                    sourceAdvanced: t.thermal_fan_source_advanced,
                    sourceDialogTitle: t.thermal_fan_source_dialog_title,
                    sourceDialogDescription: t.thermal_fan_source_dialog_desc,
                    sourceFilter: t.thermal_fan_source_filter,
                    sourceFilterClear: t.thermal_fan_source_filter_clear,
                    sourceNoMatch: t.thermal_fan_source_no_match,
                    sourceRaw: (code) => tpl(t.thermal_fan_source_raw, { code }),
                    sourceClose: t.thermal_fan_source_close,
                    targetTitle: (rpm) => tpl(t.thermal_fan_target, { rpm: integerFormat.format(rpm) }),
                    unitRpm: 'RPM',
                    unitCelsius: '°C',
                    profileLabel: t.thermal_fan_profiles_title,
                    profileCustom: t.thermal_fan_profile_custom,
                    profileSave: t.thermal_fan_profile_save,
                    profileNamePlaceholder: t.thermal_fan_profile_name_placeholder,
                    profileSaveConfirm: t.thermal_fan_profile_save_confirm,
                    profileSaveCancel: t.thermal_fan_profile_save_cancel,
                    profileDelete: (name) => tpl(t.thermal_fan_profile_delete, { name }),
                    profileName,
                    profileDescription,
                    calibrateCancel: t.thermal_fan_calibrate_cancel,
                    calibrateTitle: t.thermal_fan_calibrate,
                    calibrateProgress: (state) => tpl(t.thermal_fan_calibrate_progress, {
                      fan: state.fanId ? fanNameById(state.fanId) : '',
                      current: (state.fanIndex ?? 0) + 1,
                      total: state.fanCount ?? 0,
                      phase: calibrationPhase(state.phase),
                      seconds: state.secondsLeft ?? 0,
                    }),
                  }}
                />

                <section className="glass-panel thermal-panel" aria-label={t.thermal_sensors_title}>
                  <div className="live-panel-toolbar">
                    <div className="live-toolbar-start">
                      <h2 className="live-panel-title">{t.thermal_sensors_title}</h2>
                    </div>
                    <div className="live-toolbar-end thermal-stats">
                      {snapshot.cpuLoadPercent !== undefined && (
                        <span className="thermal-stat"><span className="thermal-stat__label">{t.thermal_cpu_load}</span><strong className="thermal-stat__value">{snapshot.cpuLoadPercent}%</strong></span>
                      )}
                      {hottest && (
                        <span className="thermal-stat" title={labelFor(hottest)}><span className="thermal-stat__label">{t.thermal_hottest}</span><strong className="thermal-stat__value">{formatCelsius(hottest.celsius)}</strong></span>
                      )}
                      <span className="thermal-stat"><strong className="thermal-stat__value">{tpl(t.thermal_sensor_count, { count: snapshot.sensors.length })}</strong></span>
                    </div>
                  </div>
                  <div className="thermal-panel__body">
                    <ThermalSensorTable
                      rows={sensorRows}
                      formatCelsius={formatCelsius}
                      collapsedGroups={COLLAPSED_SENSOR_GROUPS}
                      labels={{
                        groupTitle,
                        groupExpand: (group) => tpl(t.thermal_group_expand, { group }),
                        groupCollapse: (group) => tpl(t.thermal_group_collapse, { group }),
                        rowTitle,
                        rowCaption,
                        expand: t.thermal_sensor_expand,
                        collapse: t.thermal_sensor_collapse,
                        empty: t.thermal_no_sensors,
                      }}
                    />
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>

      {calibrateConfirmOpen && (
        <ThermalFanDisclaimer
          title={t.thermal_fan_calibrate_confirm_title}
          intro={t.thermal_fan_calibrate_confirm_intro}
          points={[t.thermal_fan_calibrate_confirm_point_time, t.thermal_fan_calibrate_confirm_point_speed, t.thermal_fan_calibrate_confirm_point_setup]}
          pointTone="neutral"
          acceptLabel={t.thermal_fan_calibrate_confirm_accept}
          cancelLabel={t.thermal_fan_disclaimer_cancel}
          closeLabel={t.thermal_fan_disclaimer_cancel}
          onAccept={() => { setCalibrateConfirmOpen(false); dismiss(FAN_ERROR_KEY); void fanCalibration.start().then(reportCalibration) }}
          onCancel={() => setCalibrateConfirmOpen(false)}
        />
      )}

      {disclaimerOpen && (
        <ThermalFanDisclaimer
          title={t.thermal_fan_disclaimer_title}
          intro={t.thermal_fan_disclaimer_intro}
          points={[t.thermal_fan_disclaimer_point_range, t.thermal_fan_disclaimer_point_restore, tpl(t.thermal_fan_disclaimer_point_ceiling, { ceiling: FAN_CEILING_CELSIUS })]}
          warning={t.thermal_fan_disclaimer_warning}
          acceptLabel={t.thermal_fan_disclaimer_accept}
          cancelLabel={t.thermal_fan_disclaimer_cancel}
          closeLabel={t.thermal_fan_disclaimer_cancel}
          onAccept={onDisclaimerAccept}
          onCancel={() => setDisclaimerOpen(false)}
        />
      )}
    </div>
  )
}

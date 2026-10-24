import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FanControlState, FanProfilesState, ThermalSnapshot } from '../../../shared/thermalApi'
import { TRANSLATIONS } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { ThermalPage } from '../ThermalPage'

const t = TRANSLATIONS.en

const snapshot: ThermalSnapshot = {
  timestamp: 1_700_000_000_000,
  source: 'smc',
  cpuLoadPercent: 23,
  sensors: [
    { id: 'smc:Tp01', code: 'Tp01', group: 'cpu', label: 'cpu-performance-core', celsius: 61.4 },
    { id: 'smc:Tg05', code: 'Tg05', group: 'gpu', label: 'gpu', celsius: 47 },
    { id: 'smc:TRD0', code: 'TRD0', group: 'other', celsius: 92.2 },
  ],
  fans: [{ id: 'smc:fan0', index: 0, rpm: 2374, minRpm: 1499, maxRpm: 5348, targetRpm: 2371 }],
}

let pushSnapshot: ((s: ThermalSnapshot) => void) | null = null
let pushError: ((e: { message: string }) => void) | null = null

beforeEach(() => {
  vi.clearAllMocks()
  pushSnapshot = null
  pushError = null
  act(() => useAppStore.setState({ locale: 'en' }))
  vi.mocked(window.api.thermal.getSupport).mockResolvedValue({ success: true, support: { supported: true, source: 'smc' } })
  vi.mocked(window.api.thermal.setMonitoring).mockResolvedValue({ success: true })
  vi.mocked(window.api.thermal.onSnapshot).mockImplementation((cb) => { pushSnapshot = cb; return () => { pushSnapshot = null } })
  vi.mocked(window.api.thermal.onError).mockImplementation((cb) => { pushError = cb; return () => { pushError = null } })
})

describe('ThermalPage', () => {
  it('starts monitoring on mount, folds sensors into rows per group, lists fans, and stops on unmount', async () => {
    const view = render(<ThermalPage />)
    await waitFor(() => expect(window.api.thermal.setMonitoring).toHaveBeenCalledWith(true))
    expect(screen.getByRole('status')).toHaveTextContent(t.thermal_waiting)

    act(() => { pushSnapshot?.(snapshot) })

    // One row per meaning: the performance cores fold into a single row showing the hottest core.
    const cpu = screen.getByRole('region', { name: t.thermal_group_cpu })
    expect(cpu).toHaveTextContent('Performance core')
    expect(cpu).toHaveTextContent('61.4°C')
    expect(screen.getByRole('region', { name: t.thermal_group_gpu })).toHaveTextContent('GPU')
    // The "other" group starts folded but keeps its hottest reading (and tone) on the heading.
    const other = screen.getByRole('region', { name: t.thermal_group_other })
    const otherToggle = within(other).getByRole('button', { expanded: false })
    expect(other.querySelector('[data-tone="hot"]')).not.toBeNull()
    expect(screen.queryByText('TRD0')).toBeNull()
    fireEvent.click(otherToggle)
    expect(otherToggle).toHaveAttribute('aria-expanded', 'true')
    // Unknown keys sit in one unidentified row, marked hot.
    expect(other).toHaveTextContent(t.thermal_sensor_unlabeled)
    expect(other).toHaveTextContent('TRD0')
    // Fans show the live speed on a meter between min and max, on automatic control while no helper runs.
    const fans = screen.getByRole('region', { name: t.thermal_fans_title })
    expect(fans).toHaveTextContent('2,374 RPM')
    expect(within(fans).getByRole('meter', { name: 'Fan 1' })).toHaveAttribute('value', '2374')
    expect(fans).toHaveTextContent('1,499 RPM')
    expect(fans).toHaveTextContent('5,348 RPM')
    expect(fans).toHaveTextContent(t.thermal_fan_mode_system)
    expect(screen.getByText(t.thermal_cpu_load).parentElement).toHaveTextContent('23%')

    view.unmount()
    await waitFor(() => expect(window.api.thermal.setMonitoring).toHaveBeenLastCalledWith(false))
  })

  it('folds several sensors of one meaning into a row that expands to the raw sensors', async () => {
    const many: ThermalSnapshot = {
      ...snapshot,
      sensors: [
        { id: 'smc:Tp01', code: 'Tp01', group: 'cpu', label: 'cpu-performance-core', celsius: 61.4 },
        { id: 'smc:Tp05', code: 'Tp05', group: 'cpu', label: 'cpu-performance-core', celsius: 58 },
        { id: 'smc:Tp09', code: 'Tp09', group: 'cpu', label: 'cpu-performance-core', celsius: 55.2 },
      ],
    }
    render(<ThermalPage />)
    await waitFor(() => expect(pushSnapshot).not.toBeNull())
    act(() => { pushSnapshot?.(many) })

    const row = screen.getByRole('button', { name: /Performance core/ })
    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(row).toHaveTextContent('61.4°C')
    expect(row).toHaveTextContent('3 sensors · avg 58.2°C')
    expect(screen.queryByText('Tp05')).toBeNull()

    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Tp05').parentElement).toHaveTextContent('58.0°C')
    expect(screen.getByText('Tp09').parentElement).toHaveTextContent('55.2°C')
  })

  it('offers the menu bar reading where main reports a placement and round-trips changes through main', async () => {
    vi.mocked(window.api.thermal.getSupport).mockResolvedValue({ success: true, support: { supported: true, source: 'smc', trayPlacement: 'menu-bar' } })
    vi.mocked(window.api.thermal.updateSettings).mockResolvedValue({ success: true, settings: { tray: { enabled: true, metric: 'hottest', showFan: false, layout: 'inline', showUnit: true, fanFormat: 'rpm' }, fanControl: { acknowledged: false }, fanProfiles: { activeId: null, user: [] }, fanAffinity: null } })
    render(<ThermalPage />)
    await waitFor(() => expect(pushSnapshot).not.toBeNull())
    act(() => { pushSnapshot?.(snapshot) })

    // The option lives behind the command bar's gear, like the other features' configuration.
    fireEvent.click(await screen.findByRole('button', { name: t.thermal_options_title }))
    const section = await screen.findByRole('region', { name: t.thermal_tray_section_menu_bar })
    const enable = screen.getByRole('switch', { name: t.thermal_tray_enable })
    expect(enable).not.toBeChecked()
    expect(screen.queryByRole('switch', { name: t.thermal_tray_show_fan })).toBeNull()

    fireEvent.click(enable)
    await waitFor(() => expect(window.api.thermal.updateSettings).toHaveBeenCalledWith({ tray: { enabled: true } }))
    await waitFor(() => expect(screen.getByRole('switch', { name: t.thermal_tray_enable })).toBeChecked())
    expect(section).toHaveTextContent(t.thermal_tray_metric)
    expect(screen.getByRole('switch', { name: t.thermal_tray_show_fan })).not.toBeChecked()
  })

  it('hides the menu bar option when this run has nowhere to show it', async () => {
    vi.mocked(window.api.thermal.getSupport).mockResolvedValue({ success: true, support: { supported: true, source: 'hwmon', trayPlacement: 'none' } })
    render(<ThermalPage />)
    await waitFor(() => expect(window.api.thermal.setMonitoring).toHaveBeenCalledWith(true))
    expect(screen.queryByRole('switch', { name: t.thermal_tray_enable })).toBeNull()
  })

  it('asks for the disclaimer once, then starts the helper and drives a fan', async () => {
    const idle: FanControlState = { helper: 'idle', fans: [] }
    const ready: FanControlState = { helper: 'ready', helperVersion: '1.0.0', fans: [{ id: 'smc:fan0', index: 0, mode: 'auto', minRpm: 1499, maxRpm: 5348, currentRpm: 2374 }] }
    const fixed: FanControlState = { ...ready, fans: [{ ...ready.fans[0], mode: 'fixed', targetRpm: 2400 }] }
    vi.mocked(window.api.thermal.fanControl.getState).mockResolvedValue({ success: true, state: idle })
    vi.mocked(window.api.thermal.fanControl.enable).mockResolvedValue({ success: true, state: ready })
    vi.mocked(window.api.thermal.fanControl.setFan).mockResolvedValue({ success: true, state: fixed })
    vi.mocked(window.api.thermal.fanControl.restoreAll).mockResolvedValue({ success: true, state: ready })
    render(<ThermalPage />)
    await waitFor(() => expect(pushSnapshot).not.toBeNull())
    act(() => { pushSnapshot?.(snapshot) })

    await screen.findByRole('region', { name: t.thermal_fans_title })
    // The helper's status sits in the command bar as a chip next to the primary action.
    expect(screen.getByText(t.thermal_fan_helper_idle_title)).toBeInTheDocument()

    // First time: the disclaimer must be accepted before anything privileged starts.
    fireEvent.click(screen.getByRole('button', { name: t.thermal_fan_enable }))
    expect(window.api.thermal.fanControl.enable).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: t.thermal_fan_disclaimer_title })
    expect(dialog).toHaveTextContent('105°C')
    fireEvent.click(screen.getByRole('button', { name: t.thermal_fan_disclaimer_accept }))
    await waitFor(() => expect(window.api.thermal.updateSettings).toHaveBeenCalledWith({ fanControl: { acknowledged: true } }))
    await waitFor(() => expect(window.api.thermal.fanControl.enable).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).toBeNull()

    // Connected: the fan card appears with its mode switch; "Back to automatic" is idle until a fan is fixed.
    await screen.findByText('Helper connected (v1.0.0)')
    const fixedButton = screen.getByRole('button', { name: t.thermal_fan_mode_fixed })
    expect(fixedButton).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: t.thermal_fan_restore_all })).toBeDisabled()

    // The first fixed target is the current speed snapped to the slider step (2374 → 2350).
    fireEvent.click(fixedButton)
    await waitFor(() => expect(window.api.thermal.fanControl.setFan).toHaveBeenCalledWith('smc:fan0', { mode: 'fixed', rpm: 2350 }))
    await waitFor(() => expect(screen.getByRole('button', { name: t.thermal_fan_mode_fixed })).toHaveAttribute('aria-pressed', 'true'))
    // The target slider appears only while the fan is fixed.
    expect(screen.getByRole('slider')).toBeEnabled()
    expect(screen.getByRole('slider')).toHaveValue('2400')

    fireEvent.click(screen.getByRole('button', { name: t.thermal_fan_restore_all }))
    await waitFor(() => expect(window.api.thermal.fanControl.restoreAll).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('slider')).toBeNull())
  })

  it('switches a fan to a sensor rule with the first CPU sensor and the default thresholds', async () => {
    const ready: FanControlState = { helper: 'ready', helperVersion: '1.0.0', fans: [{ id: 'smc:fan0', index: 0, mode: 'auto', minRpm: 1499, maxRpm: 5348, currentRpm: 2374 }] }
    const bySensor: FanControlState = { ...ready, fans: [{ ...ready.fans[0], mode: 'sensor', sensor: { sensorId: 'group:cpu', minCelsius: 50, maxCelsius: 90 }, targetRpm: 2600, sensorCelsius: 61.4 }] }
    vi.mocked(window.api.thermal.fanControl.getState).mockResolvedValue({ success: true, state: ready })
    vi.mocked(window.api.thermal.fanControl.setFan).mockResolvedValue({ success: true, state: bySensor })
    render(<ThermalPage />)
    await waitFor(() => expect(pushSnapshot).not.toBeNull())
    act(() => { pushSnapshot?.(snapshot) })
    await screen.findByText('Helper connected (v1.0.0)')

    fireEvent.click(screen.getByRole('button', { name: t.thermal_fan_mode_sensor }))
    await waitFor(() => expect(window.api.thermal.fanControl.setFan).toHaveBeenCalledWith('smc:fan0', { mode: 'sensor', sensorId: 'group:cpu', minCelsius: 50, maxCelsius: 90 }))
    await waitFor(() => expect(screen.getByRole('button', { name: t.thermal_fan_mode_sensor })).toHaveAttribute('aria-pressed', 'true'))
    // The rule's controls replace the RPM slider: a source picker (groups and meanings, not raw keys) and two temperature boxes.
    const picker = screen.getByRole('button', { name: new RegExp(t.thermal_fan_sensor_source) })
    expect(picker).toHaveTextContent(t.thermal_fan_source_group_cpu)
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.getByRole('spinbutton', { name: t.thermal_fan_sensor_low })).toHaveValue(50)
    expect(screen.getByRole('spinbutton', { name: t.thermal_fan_sensor_high })).toHaveValue(90)
    expect(screen.getByText('61.4°C now → 2,600 RPM')).toBeInTheDocument()
    fireEvent.click(picker)
    const options = screen.getAllByRole('option').map((option) => option.textContent ?? '')
    expect(options.some((text) => text.includes(t.thermal_fan_source_group_gpu))).toBe(true)
    expect(options.some((text) => text.includes('Performance core'))).toBe(true)
    expect(options.some((text) => text.includes('Tp01'))).toBe(false)
    expect(options[options.length - 1]).toContain(t.thermal_fan_source_advanced)

    // The advanced dialog lists raw keys behind a filter and follows the one picked.
    fireEvent.click(screen.getByRole('option', { name: new RegExp(t.thermal_fan_source_advanced) }))
    const dialog = await screen.findByRole('dialog', { name: t.thermal_fan_source_dialog_title })
    fireEvent.change(screen.getByRole('textbox', { name: t.thermal_fan_source_filter }), { target: { value: 'tg0' } })
    expect(dialog).toHaveTextContent('Tg05')
    expect(dialog).not.toHaveTextContent('Tp01')
    fireEvent.click(screen.getByRole('button', { name: /Tg05/ }))
    await waitFor(() => expect(window.api.thermal.fanControl.setFan).toHaveBeenLastCalledWith('smc:fan0', { mode: 'sensor', sensorId: 'smc:Tg05', minCelsius: 50, maxCelsius: 90 }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: t.thermal_fan_restore_all })).toBeEnabled()
  })

  it('lists profiles in a picker with localized built-in names, applies one, and saves the current state under a name', async () => {
    const ready: FanControlState = { helper: 'ready', helperVersion: '1.0.0', fans: [{ id: 'smc:fan0', index: 0, mode: 'auto', minRpm: 1499, maxRpm: 5348, currentRpm: 2374 }] }
    const builtin = [
      { id: 'builtin:system', name: 'System', builtin: true, fans: { '*': { mode: 'auto' as const } } },
      { id: 'builtin:quiet', name: 'Quiet', builtin: true, fans: { '*': { mode: 'sensor-group' as const, group: 'cpu' as const, minCelsius: 70, maxCelsius: 100 } } },
    ]
    const mine = { id: 'user:abc', name: 'Render night', builtin: false, fans: { 'smc:fan0': { mode: 'fixed' as const, rpm: 3000 } } }
    const none: FanProfilesState = { activeId: null, applied: false, profiles: builtin }
    const quiet: FanProfilesState = { activeId: 'builtin:quiet', applied: true, profiles: builtin }
    const saved: FanProfilesState = { activeId: mine.id, applied: true, profiles: [...builtin, mine] }
    vi.mocked(window.api.thermal.fanControl.getState).mockResolvedValue({ success: true, state: ready })
    vi.mocked(window.api.thermal.fanControl.profiles.get).mockResolvedValue({ success: true, state: none })
    vi.mocked(window.api.thermal.fanControl.profiles.apply).mockResolvedValue({ success: true, state: quiet })
    vi.mocked(window.api.thermal.fanControl.profiles.saveCurrent).mockResolvedValue({ success: true, state: saved })
    vi.mocked(window.api.thermal.fanControl.profiles.remove).mockResolvedValue({ success: true, state: quiet })
    render(<ThermalPage />)
    await waitFor(() => expect(pushSnapshot).not.toBeNull())
    act(() => { pushSnapshot?.(snapshot) })
    await screen.findByText('Helper connected (v1.0.0)')

    // Nothing applied: the picker shows "Custom".
    const picker = screen.getByRole('button', { name: new RegExp(t.thermal_fan_profiles_title) })
    expect(picker).toHaveTextContent(t.thermal_fan_profile_custom)
    fireEvent.click(picker)
    fireEvent.click(screen.getByRole('option', { name: new RegExp(t.thermal_fan_profile_builtin_quiet) }))
    await waitFor(() => expect(window.api.thermal.fanControl.profiles.apply).toHaveBeenCalledWith('builtin:quiet'))
    await waitFor(() => expect(screen.getByRole('button', { name: new RegExp(t.thermal_fan_profiles_title) })).toHaveTextContent(t.thermal_fan_profile_builtin_quiet))
    // A built-in cannot be deleted.
    expect(screen.queryByRole('button', { name: /Delete profile/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: t.thermal_fan_profile_save }))
    fireEvent.change(screen.getByPlaceholderText(t.thermal_fan_profile_name_placeholder), { target: { value: 'Render night' } })
    fireEvent.click(screen.getByRole('button', { name: t.thermal_fan_profile_save_confirm }))
    await waitFor(() => expect(window.api.thermal.fanControl.profiles.saveCurrent).toHaveBeenCalledWith('Render night'))
    await waitFor(() => expect(screen.getByRole('button', { name: new RegExp(t.thermal_fan_profiles_title) })).toHaveTextContent('Render night'))

    fireEvent.click(screen.getByRole('button', { name: 'Delete profile Render night' }))
    await waitFor(() => expect(window.api.thermal.fanControl.profiles.remove).toHaveBeenCalledWith('user:abc'))
    await waitFor(() => expect(screen.getByRole('button', { name: new RegExp(t.thermal_fan_profiles_title) })).toHaveTextContent(t.thermal_fan_profile_builtin_quiet))
  })

  it('hides fan control where the helper cannot run and shows why it is missing in a checkout', async () => {
    vi.mocked(window.api.thermal.fanControl.getState).mockResolvedValue({ success: true, state: { helper: 'missing', fans: [] } })
    const first = render(<ThermalPage />)
    await waitFor(() => expect(pushSnapshot).not.toBeNull())
    act(() => { pushSnapshot?.(snapshot) })
    const chip = (await screen.findByText(t.thermal_fan_helper_missing_short)).closest('.ui-status-chip')
    expect(chip).toHaveAttribute('title', t.thermal_fan_helper_missing)
    expect(chip).toHaveAttribute('data-tone', 'warning')
    expect(screen.queryByRole('button', { name: t.thermal_fan_enable })).toBeNull()
    first.unmount()

    // Linux (hwmon) has no helper: the section is not rendered at all.
    vi.mocked(window.api.thermal.fanControl.getState).mockResolvedValue({ success: true, state: { helper: 'unsupported', fans: [] } })
    vi.mocked(window.api.thermal.getSupport).mockResolvedValue({ success: true, support: { supported: true, source: 'hwmon' } })
    render(<ThermalPage />)
    await waitFor(() => expect(pushSnapshot).not.toBeNull())
    act(() => { pushSnapshot?.(snapshot) })
    const fans = screen.getByRole('region', { name: t.thermal_fans_title })
    expect(fans).toHaveTextContent(t.thermal_fan_mode_system)
    expect(screen.queryByRole('button', { name: t.thermal_fan_enable })).toBeNull()
  })

  it('explains an unsupported platform and never starts monitoring', async () => {
    vi.mocked(window.api.thermal.getSupport).mockResolvedValue({ success: true, support: { supported: false, reason: 'unsupported-platform' } })
    render(<ThermalPage />)
    expect(await screen.findByText(t.thermal_unsupported_title)).toBeInTheDocument()
    expect(window.api.thermal.setMonitoring).not.toHaveBeenCalled()
  })

  it('names the missing reader and offers a retry after a read error', async () => {
    vi.mocked(window.api.thermal.getSupport).mockResolvedValue({ success: true, support: { supported: false, reason: 'reader-missing', detail: '/x/viezan-smc' } })
    const { unmount } = render(<ThermalPage />)
    expect(await screen.findByText(t.thermal_reader_missing_title)).toBeInTheDocument()
    unmount()

    vi.mocked(window.api.thermal.getSupport).mockResolvedValue({ success: true, support: { supported: true, source: 'smc' } })
    vi.mocked(window.api.thermal.read).mockResolvedValue({ success: true, snapshot })
    render(<ThermalPage />)
    await waitFor(() => expect(pushError).not.toBeNull())
    act(() => { pushError?.({ message: 'SMC reader timed out.' }) })
    expect(await screen.findByText(t.thermal_error_title)).toBeInTheDocument()
    expect(screen.getByText('SMC reader timed out.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: t.thermal_retry }))
    await waitFor(() => expect(window.api.thermal.read).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText(t.thermal_error_title)).not.toBeInTheDocument())
    expect(screen.getByRole('region', { name: t.thermal_group_cpu })).toHaveTextContent('61.4°C')
  })
})

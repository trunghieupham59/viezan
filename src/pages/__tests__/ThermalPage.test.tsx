import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThermalSnapshot } from '../../../shared/thermalApi'
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
  it('starts monitoring on mount, renders grouped sensors and fans, and stops on unmount', async () => {
    const view = render(<ThermalPage />)
    await waitFor(() => expect(window.api.thermal.setMonitoring).toHaveBeenCalledWith(true))
    expect(screen.getByRole('status')).toHaveTextContent(t.thermal_waiting)

    act(() => { pushSnapshot?.(snapshot) })

    expect(screen.getByRole('region', { name: t.thermal_group_cpu })).toHaveTextContent('Performance core')
    expect(screen.getByRole('region', { name: t.thermal_group_cpu })).toHaveTextContent('61.4°C')
    expect(screen.getByRole('region', { name: t.thermal_group_gpu })).toHaveTextContent('GPU')
    // Unknown keys fall back to their code and hot readings are marked.
    const other = screen.getByRole('region', { name: t.thermal_group_other })
    expect(other).toHaveTextContent('TRD0')
    expect(other.querySelector('[data-tone="hot"]')).not.toBeNull()
    expect(screen.getByRole('region', { name: t.thermal_fans_title })).toHaveTextContent('2,374 RPM')
    expect(screen.getByRole('region', { name: t.thermal_fans_title })).toHaveTextContent('1,499–5,348 RPM')
    expect(screen.getByText(t.thermal_cpu_load).parentElement).toHaveTextContent('23%')

    view.unmount()
    await waitFor(() => expect(window.api.thermal.setMonitoring).toHaveBeenLastCalledWith(false))
  })

  it('offers the menu bar reading where main reports a placement and round-trips changes through main', async () => {
    vi.mocked(window.api.thermal.getSupport).mockResolvedValue({ success: true, support: { supported: true, source: 'smc', trayPlacement: 'menu-bar' } })
    vi.mocked(window.api.thermal.updateSettings).mockResolvedValue({ success: true, settings: { tray: { enabled: true, metric: 'hottest', showFan: false } } })
    render(<ThermalPage />)

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

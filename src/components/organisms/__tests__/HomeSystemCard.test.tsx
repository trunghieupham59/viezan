import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThermalMonitorState } from '../../../hooks/useThermalMonitor'
import { TRANSLATIONS } from '../../../i18n'
import { useAppStore } from '../../../store/useAppStore'
import { HomeSystemCard } from '../home/HomeSystemCard'

const monitor: { current: ThermalMonitorState } = {
  current: { support: null, snapshot: null, history: {}, error: null, retry: () => {} },
}

vi.mock('../../../hooks/useThermalMonitor', () => ({ useThermalMonitor: () => monitor.current }))
vi.mock('../../../hooks/useBackgroundStatus', () => ({ useBackgroundStatus: () => ({ fans: null }) }))

const t = () => TRANSLATIONS[useAppStore.getState().locale]

beforeEach(() => {
  act(() => useAppStore.setState({ locale: 'en' }))
})

describe('HomeSystemCard', () => {
  it('shows the monitor error with a Retry button instead of reading forever', () => {
    const retry = vi.fn()
    monitor.current = { support: { supported: true, source: 'smc' } as ThermalMonitorState['support'], snapshot: null, history: {}, error: 'SMC read failed', retry }
    render(<HomeSystemCard onOpen={() => {}} />)

    expect(screen.queryByText(t().home_system_loading)).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('SMC read failed')
    const button = screen.getByRole('button', { name: t().thermal_retry })
    expect(button).toHaveAttribute('data-control-variant', 'neutral')
    fireEvent.click(button)
    expect(retry).toHaveBeenCalledOnce()
  })

  it('says there are no sensors when a supported machine reports none', () => {
    monitor.current = {
      support: { supported: true, source: 'hwmon' } as ThermalMonitorState['support'],
      snapshot: { sensors: [], fans: [] } as unknown as ThermalMonitorState['snapshot'],
      history: {},
      error: null,
      retry: () => {},
    }
    render(<HomeSystemCard onOpen={() => {}} />)
    expect(screen.getByText(t().thermal_no_sensors)).toBeInTheDocument()
    expect(screen.queryByText(t().home_system_loading)).not.toBeInTheDocument()
  })
})

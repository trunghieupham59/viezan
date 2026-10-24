import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Meter } from '../Meter'
import { ProgressBar } from '../ProgressBar'
import { StatusDot } from '../StatusDot'

describe('StatusDot', () => {
  it('is decorative next to text and spoken when it stands alone', () => {
    const { container } = render(<StatusDot tone="ok" />)
    const decorative = container.querySelector('.ui-status-dot')
    expect(decorative).toHaveAttribute('aria-hidden', 'true')
    expect(decorative).toHaveAttribute('data-tone', 'ok')
    expect(screen.queryByRole('img')).toBeNull()

    render(<StatusDot tone="danger" label="Helper disconnected" />)
    const labelled = screen.getByRole('img', { name: 'Helper disconnected' })
    expect(labelled).toHaveAttribute('data-tone', 'danger')
    expect(labelled).not.toHaveAttribute('aria-hidden')
  })

  it('defaults to the neutral tone', () => {
    const { container } = render(<StatusDot />)
    expect(container.querySelector('.ui-status-dot')).toHaveAttribute('data-tone', 'neutral')
  })
})

describe('Meter', () => {
  it('is a named native gauge that clamps its value and speaks the formatted reading', () => {
    render(<Meter label="Left fan" value={6200} min={1499} max={5348} valueText="6,200 RPM" />)
    const gauge = screen.getByRole('meter', { name: 'Left fan' })
    expect(gauge).toHaveAttribute('value', '5348')
    expect(gauge).toHaveAttribute('min', '1499')
    expect(gauge).toHaveAttribute('max', '5348')
    expect(gauge).toHaveAttribute('aria-valuetext', '6,200 RPM')
    expect(gauge.closest('.ui-meter')).toHaveAttribute('data-emphasis', 'neutral')
  })

  it('draws a marker at the target and switches emphasis while the app is in control', () => {
    const { container } = render(<Meter label="Left fan" value={2300} min={1000} max={5000} emphasis="action" marker={{ value: 3000, title: 'Target 3,000 RPM' }} />)
    const marker = container.querySelector('.ui-meter__marker') as HTMLElement
    expect(marker).toHaveAttribute('title', 'Target 3,000 RPM')
    expect(marker).toHaveAttribute('aria-hidden', 'true')
    expect(marker.style.getPropertyValue('--ui-meter-marker')).toBe('50%')
    expect(container.querySelector('.ui-meter')).toHaveAttribute('data-emphasis', 'action')
  })

  it('omits the marker when there is no target', () => {
    const { container } = render(<Meter label="Right fan" value={0} min={1499} max={5776} />)
    expect(container.querySelector('.ui-meter__marker')).toBeNull()
    expect(screen.getByRole('meter', { name: 'Right fan' })).toHaveAttribute('value', '1499')
  })
})

describe('ProgressBar', () => {
  it('reports determinate progress through ARIA and the fill variable', () => {
    render(<ProgressBar label="Sensor detection" value={0.68} max={1} valueText="Right fan, 24 s left" />)
    const bar = screen.getByRole('progressbar', { name: 'Sensor detection' })
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '1')
    expect(bar).toHaveAttribute('aria-valuenow', '0.68')
    expect(bar).toHaveAttribute('aria-valuetext', 'Right fan, 24 s left')
    expect(bar).not.toHaveAttribute('data-indeterminate')
    expect(bar.style.getPropertyValue('--ui-progress')).toBe('68%')
  })

  it('clamps out-of-range values', () => {
    render(<ProgressBar label="Download" value={140} />)
    const bar = screen.getByRole('progressbar', { name: 'Download' })
    expect(bar).toHaveAttribute('aria-valuenow', '100')
    expect(bar.style.getPropertyValue('--ui-progress')).toBe('100%')
  })

  it('marks work of unknown length as indeterminate without a current value', () => {
    render(<ProgressBar label="Starting helper" />)
    const bar = screen.getByRole('progressbar', { name: 'Starting helper' })
    expect(bar).toHaveAttribute('data-indeterminate', 'true')
    expect(bar).not.toHaveAttribute('aria-valuenow')
  })
})

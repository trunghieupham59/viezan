import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HistoryTrigger } from '../HistoryTrigger'

describe('HistoryTrigger', () => {
  it('renders one md neutral control with the caption and count', () => {
    render(<HistoryTrigger label="History" count={3} expanded={false} showLabel="Show history" hideLabel="Hide history" onToggle={() => {}} />)
    const trigger = screen.getByRole('button', { name: 'Show history' })
    expect(trigger).toHaveAttribute('data-control-size', 'md')
    expect(trigger).toHaveAttribute('data-control-shape', 'rect')
    expect(trigger).toHaveAttribute('data-control-variant', 'neutral')
    expect(trigger).toHaveAttribute('data-control-appearance', 'outline')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveTextContent('History')
    expect(screen.getByText('3')).toHaveClass('history-trigger-count')
  })

  it('reads as selected while expanded and hides a zero count', () => {
    const onToggle = vi.fn()
    render(<HistoryTrigger label="History" count={0} expanded showLabel="Show history" hideLabel="Hide history" controlsId="panel" onToggle={onToggle} />)
    const trigger = screen.getByRole('button', { name: 'Hide history' })
    expect(trigger).toHaveAttribute('data-control-appearance', 'soft')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveAttribute('aria-controls', 'panel')
    expect(trigger.querySelector('.history-trigger-count')).toBeNull()
    fireEvent.click(trigger)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('announces a dialog when it opens a modal instead of a panel', () => {
    render(<HistoryTrigger label="History" expanded={false} hasPopup="dialog" onToggle={() => {}} />)
    const trigger = screen.getByRole('button', { name: 'History' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    expect(trigger).not.toHaveAttribute('aria-controls')
  })
})

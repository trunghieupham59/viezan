import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ButtonGroup } from '../../ButtonGroup'
import { ProgressSteps } from '../ProgressSteps'
import { StatusChip } from '../StatusChip'

describe('StatusChip', () => {
  it('pairs a decorative dot with the text that carries the meaning', () => {
    const { container } = render(<StatusChip tone="ok" title="Helper v1.0.0">Helper connected</StatusChip>)
    const chip = container.querySelector('.ui-status-chip') as HTMLElement
    expect(chip).toHaveAttribute('data-tone', 'ok')
    expect(chip).toHaveAttribute('title', 'Helper v1.0.0')
    expect(chip).toHaveTextContent('Helper connected')
    expect(chip.querySelector('.ui-status-dot')).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows an icon instead of the dot when given one', () => {
    const { container } = render(<StatusChip tone="info" icon={<svg data-testid="spinner" />}>Starting…</StatusChip>)
    expect(screen.getByTestId('spinner')).toBeInTheDocument()
    expect(container.querySelector('.ui-status-dot')).toBeNull()
  })
})

describe('ProgressSteps', () => {
  const statusLabels = { done: 'done', active: 'in progress', pending: 'waiting', error: 'failed' }

  it('lists the steps in order, marks the running one as current and speaks each status', () => {
    render(
      <ProgressSteps
        label="Research progress"
        statusLabels={statusLabels}
        steps={[
          { id: 'plan', label: 'Plan sub-questions', status: 'done', detail: '4 questions' },
          { id: 'read', label: 'Read and cite', status: 'active', detail: '7 / 12' },
          { id: 'write', label: 'Write the report', status: 'pending' },
        ]}
      />,
    )
    const list = screen.getByRole('list', { name: 'Research progress' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((item) => item.getAttribute('data-status'))).toEqual(['done', 'active', 'pending'])
    expect(items[1]).toHaveAttribute('aria-current', 'step')
    expect(items[0]).not.toHaveAttribute('aria-current')
    expect(items[0]).toHaveTextContent('Plan sub-questions, done')
    expect(items[0]).toHaveTextContent('4 questions')
    expect(items[2]).toHaveTextContent('Write the report, waiting')
  })

  it('shows a failed step', () => {
    render(<ProgressSteps label="Install" statusLabels={statusLabels} steps={[{ id: 'model', label: 'Download model', status: 'error' }]} />)
    expect(screen.getByRole('listitem')).toHaveAttribute('data-status', 'error')
    expect(screen.getByRole('listitem')).toHaveTextContent('Download model, failed')
  })
})

describe('ButtonGroup', () => {
  it('is a named group of pressed-state buttons at the requested size', () => {
    const onChange = vi.fn()
    render(
      <ButtonGroup
        label="Layout"
        size="sm"
        value="inline"
        onChange={onChange}
        options={[{ value: 'inline', label: 'One line' }, { value: 'stacked', label: 'Stacked' }]}
      />,
    )
    const group = screen.getByRole('group', { name: 'Layout' })
    const [inline, stacked] = within(group).getAllByRole('button')
    expect(inline).toHaveAttribute('aria-pressed', 'true')
    expect(stacked).toHaveAttribute('aria-pressed', 'false')
    expect(inline).toHaveAttribute('data-control-size', 'sm')
    fireEvent.click(stacked)
    expect(onChange).toHaveBeenCalledWith('stacked')
  })

  it('keeps the form size by default', () => {
    render(<ButtonGroup value={1} onChange={() => {}} options={[{ value: 1, label: 'S' }]} />)
    expect(screen.getByRole('button', { name: 'S' })).toHaveAttribute('data-control-size', 'md')
  })
})

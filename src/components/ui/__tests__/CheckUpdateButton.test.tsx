import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CheckUpdateButton, type UpdaterButtonStatus } from '../CheckUpdateButton'

const renderButton = (status: UpdaterButtonStatus) =>
  render(<CheckUpdateButton status={status} checkLabel="Check for Updates" checkingLabel="Checking…" onClick={() => {}} />)

describe('CheckUpdateButton', () => {
  it.each<UpdaterButtonStatus>(['idle', 'available', 'not-available', 'downloaded', 'error'])(
    'stays a neutral outline control when %s (never a second solid action)',
    (status) => {
      renderButton(status)
      const button = screen.getByRole('button', { name: 'Check for Updates' })
      expect(button).toHaveAttribute('data-control-variant', 'neutral')
      expect(button).toHaveAttribute('data-control-appearance', 'outline')
      expect(button).not.toBeDisabled()
    },
  )

  it('shows a spinner, the checking label and native disabled while checking', () => {
    const { container } = renderButton('checking')
    const button = screen.getByRole('button', { name: 'Checking…' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('.animate-spin')).not.toBeNull()
  })

  it('is disabled while an update downloads', () => {
    renderButton('downloading')
    expect(screen.getByRole('button', { name: 'Check for Updates' })).toBeDisabled()
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CapabilityNotice } from '../CapabilityNotice'

describe('CapabilityNotice', () => {
  it('renders title, description and tone as a status row', () => {
    render(<CapabilityNotice title="Accessibility" description="Granted." tone="ok" />)
    const row = screen.getByRole('status')
    expect(row).toHaveAttribute('data-tone', 'ok')
    expect(row).toHaveTextContent('Accessibility')
    expect(row).toHaveTextContent('Granted.')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders the primary action solid and the others outline, and forwards clicks and disabled', () => {
    const fix = vi.fn()
    const alt = vi.fn()
    render(
      <CapabilityNotice
        title="Spotlight is using Command+Space"
        tone="warning"
        actions={[
          { label: 'Turn Spotlight off', onClick: fix, primary: true },
          { label: 'Use Option+Space', onClick: alt, disabled: true },
        ]}
      />,
    )
    const primary = screen.getByRole('button', { name: 'Turn Spotlight off' })
    const secondary = screen.getByRole('button', { name: 'Use Option+Space' })
    expect(primary).toHaveAttribute('data-control-appearance', 'solid')
    expect(secondary).toHaveAttribute('data-control-appearance', 'outline')
    expect(secondary).toBeDisabled()
    fireEvent.click(primary)
    expect(fix).toHaveBeenCalledTimes(1)
    fireEvent.click(secondary)
    expect(alt).not.toHaveBeenCalled()
  })

  it('lays a single action out inline beside the copy', () => {
    const { container } = render(<CapabilityNotice title="t" actions={[{ label: 'Open', onClick: () => {} }]} />)
    expect(container.firstChild).toHaveClass('capability-notice--inline')
  })
})

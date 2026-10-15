import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRef, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Button } from '../../ui/atoms'
import { AIConfigurationPopover } from '../AIConfigurationPopover'

function Harness() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <div>
      <Button
        ref={triggerRef}
        aria-label="AI configuration"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Configure
      </Button>
      <AIConfigurationPopover
        open={open}
        title="AI configuration"
        scopeDescription="Applies to this session."
        closeLabel="Close"
        triggerRef={triggerRef}
        onClose={() => setOpen(false)}
      >
        <Button data-ai-config-autofocus>Model</Button>
      </AIConfigurationPopover>
    </div>
  )
}

describe('AIConfigurationPopover', () => {
  it('announces scope, moves focus inside, and restores focus after Escape', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'AI configuration' })

    fireEvent.click(trigger)

    expect(screen.getByRole('dialog', { name: 'AI configuration' })).toHaveAccessibleDescription(
      'Applies to this session.',
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Model' })).toHaveFocus())

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('dismisses on an outside pointer interaction', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'AI configuration' }))

    fireEvent.pointerDown(document.body)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

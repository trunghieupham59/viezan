import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button } from '../../ui/atoms'
import { SelectField } from '../../ui/molecules'
import { AIConfigurationPopover } from '../AIConfigurationPopover'

function Harness({ withSelect = false }: { withSelect?: boolean }) {
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
        {withSelect && (
          <SelectField
            label="Style"
            value="natural"
            options={[
              { value: 'natural', label: 'Natural' },
              { value: 'formal', label: 'Formal' },
            ]}
            onChange={() => {}}
          />
        )}
      </AIConfigurationPopover>
    </div>
  )
}

function AutoHarness() {
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <div className="app-workspace">
      <Button ref={triggerRef} aria-label="Task">Task</Button>
      <AIConfigurationPopover open title="Task" scopeDescription="Next message." closeLabel="Close"
        triggerRef={triggerRef} placement="auto" align="start" onClose={() => {}}>
        <Button>Chat</Button>
      </AIConfigurationPopover>
    </div>
  )
}

const box = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect

describe('AIConfigurationPopover', () => {
  afterEach(() => vi.restoreAllMocks())

  it('auto placement measures room from the workspace, not the window, so it never covers the header', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1000)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('app-workspace') ? box(120, 1000) : box(700, 736)
    })
    render(<AutoHarness />)
    const dialog = screen.getByRole('dialog', { name: 'Task' })
    expect(dialog).toHaveClass('ai-configuration-popover--above')
    expect(dialog.style.getPropertyValue('--ai-configuration-room')).toBe('580px')
  })

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

  it('lets an open nested Select consume Escape before the popover closes', async () => {
    render(<Harness withSelect />)
    const trigger = screen.getByRole('button', { name: 'AI configuration' })
    fireEvent.click(trigger)
    const styleTrigger = screen.getByRole('button', { name: /^Style / })

    fireEvent.click(styleTrigger)
    const selected = screen.getByRole('option', { name: 'Natural' })
    await waitFor(() => expect(selected).toHaveFocus())

    fireEvent.keyDown(selected, { key: 'Escape' })

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'AI configuration' })).toBeInTheDocument()
    expect(styleTrigger).toHaveFocus()

    fireEvent.keyDown(styleTrigger, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('keeps the popover open when Escape reaches the Select trigger before an option focuses', () => {
    render(<Harness withSelect />)
    fireEvent.click(screen.getByRole('button', { name: 'AI configuration' }))
    const styleTrigger = screen.getByRole('button', { name: /^Style / })

    fireEvent.click(styleTrigger)
    fireEvent.keyDown(styleTrigger, { key: 'Escape' })

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'AI configuration' })).toBeInTheDocument()
    expect(styleTrigger).toHaveFocus()
  })
})

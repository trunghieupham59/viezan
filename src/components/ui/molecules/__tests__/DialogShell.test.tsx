import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DialogShell } from '../DialogShell'

describe('DialogShell', () => {
  it('renders a labelled modal with title, subtitle, body and footer', () => {
    render(
      <DialogShell
        label="Translation detail"
        title="cải tiến"
        subtitle="Translation detail"
        closeLabel="Close translation detail"
        onClose={() => {}}
        footer={<button type="button">Confirm</button>}
      >
        <p>Body copy</p>
      </DialogShell>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Translation detail' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: 'cải tiến' })).toBeInTheDocument()
    expect(screen.getByText('Body copy')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close translation detail' })).toHaveAttribute('data-ui-control', 'button')
  })

  it('closes on Escape, on the backdrop and on the close button, but not on body clicks', () => {
    const onClose = vi.fn()
    render(
      <DialogShell
        label="Look up selection"
        title="Cải tiến"
        closeLabel="Close"
        onClose={onClose}
        backdropTestId="dialog-backdrop"
      >
        <p>Body copy</p>
      </DialogShell>,
    )

    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByTestId('dialog-backdrop'))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('moves focus to the close button and returns it to the opener on unmount', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()

    const { unmount } = render(
      <DialogShell label="Dialog" title="Title" closeLabel="Close" onClose={() => {}}>
        <p>Body copy</p>
      </DialogShell>,
    )

    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('keeps Tab focus inside the dialog', () => {
    render(
      <DialogShell
        label="Dialog"
        title="Title"
        closeLabel="Close"
        onClose={() => {}}
        footer={<button type="button">Last</button>}
      >
        <p>Body copy</p>
      </DialogShell>,
    )

    const close = screen.getByRole('button', { name: 'Close' })
    const last = screen.getByRole('button', { name: 'Last' })
    last.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
  })
})

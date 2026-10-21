import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NotificationToast } from '../NotificationToast'

describe('NotificationToast', () => {
  it('renders an accessible error notification with atomic actions', () => {
    const onAction = vi.fn()
    const onDismiss = vi.fn()

    render(
      <NotificationToast
        tone="error"
        title="Voice input is unavailable"
        message="Check microphone access and STT settings."
        actionLabel="Open Settings"
        onAction={onAction}
        dismissLabel="Dismiss"
        onDismiss={onDismiss}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Voice input is unavailable')
    expect(screen.getByRole('alert')).toHaveClass('notification-toast--error')

    const action = screen.getByRole('button', { name: 'Open Settings' })
    const dismiss = screen.getByRole('button', { name: 'Dismiss' })
    expect(action).toHaveAttribute('data-control-size', 'sm')
    expect(dismiss).toHaveAttribute('data-control-size', 'sm')

    fireEvent.click(action)
    fireEvent.click(dismiss)
    expect(onAction).toHaveBeenCalledOnce()
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('renders a detail line and a list of recovery actions, emphasising the first', () => {
    const retry = vi.fn()
    const pick = vi.fn()

    render(
      <NotificationToast
        tone="error"
        message="Chat failed: no local runtime."
        detail="OpenAI · GPT 6.1"
        actions={[
          { label: 'Retry', onClick: retry, disabled: true },
          { label: 'Choose another model', onClick: pick },
        ]}
        dismissLabel="Dismiss"
        onDismiss={vi.fn()}
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('OpenAI · GPT 6.1')
    const retryButton = screen.getByRole('button', { name: 'Retry' })
    expect(retryButton).toBeDisabled()
    expect(retryButton).toHaveAttribute('data-control-size', 'sm')
    fireEvent.click(screen.getByRole('button', { name: 'Choose another model' }))
    expect(pick).toHaveBeenCalledOnce()
    expect(retry).not.toHaveBeenCalled()
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EmptyPanelState } from '../EmptyPanelState'
import { FeatureLoadingState } from '../FeatureLoadingState'
import { RecoverableError } from '../RecoverableError'

describe('UX reliability molecules', () => {
  it('renders a labelled, page-shaped loading state', () => {
    const { container } = render(
      <FeatureLoadingState label="Loading Dictionary" layout="split" />,
    )

    expect(screen.getByRole('status', { name: 'Loading Dictionary' })).toBeInTheDocument()
    expect(container.querySelectorAll('.feature-loading-panel')).toHaveLength(2)
  })

  it('offers explicit recovery paths without exposing implementation details', () => {
    const onRetry = vi.fn()
    const onAlternative = vi.fn()
    const onSettings = vi.fn()
    const onDismiss = vi.fn()

    render(
      <RecoverableError
        message="Translation failed."
        context="OpenAI · GPT 5"
        retryAction={{ label: 'Retry', onClick: onRetry }}
        alternativeAction={{ label: 'Choose another model', onClick: onAlternative }}
        settingsAction={{ label: 'Open Settings', onClick: onSettings }}
        dismissLabel="Dismiss"
        onDismiss={onDismiss}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('OpenAI · GPT 5')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose another model' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(onAlternative).toHaveBeenCalledOnce()
    expect(onSettings).toHaveBeenCalledOnce()
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('uses the shared Button atom for an empty-state action', () => {
    const onAction = vi.fn()
    render(
      <EmptyPanelState
        icon={<span aria-hidden="true">I</span>}
        description="Start the input"
        actionLabel="Start"
        onAction={onAction}
      />,
    )

    const action = screen.getByRole('button', { name: 'Start' })
    expect(action).toHaveAttribute('data-ui-control', 'button')
    fireEvent.click(action)
    expect(onAction).toHaveBeenCalledOnce()
  })
})

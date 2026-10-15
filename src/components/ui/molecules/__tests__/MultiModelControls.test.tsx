import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ModelSelectionRow } from '../ModelSelectionRow'
import { SelectedModelChip } from '../SelectedModelChip'
import { TranslationResultTab } from '../TranslationResultTab'

describe('multi-model translation molecules', () => {
  it('keeps selected-model removal separate from result navigation', () => {
    const onRemove = vi.fn()
    render(
      <SelectedModelChip
        provider="openai"
        modelName="GPT 5.5 Pro"
        providerName="OpenAI"
        positionLabel="Result 1"
        removeLabel="Remove model"
        onRemove={onRemove}
      />,
    )

    expect(screen.getByRole('group', { name: 'GPT 5.5 Pro · OpenAI' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove model: GPT 5.5 Pro' }))
    expect(onRemove).toHaveBeenCalledOnce()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('distinguishes selected and unavailable catalog rows with text and ARIA state', () => {
    const onSelect = vi.fn()
    const onFocus = vi.fn()
    const { rerender } = render(
      <ModelSelectionRow
        modelName="GPT 5.5 Pro"
        providerName="OpenAI"
        selected
        statusLabel="Selected"
        onSelect={onSelect}
        onFocus={onFocus}
      />,
    )

    const selected = screen.getByRole('button', { name: 'GPT 5.5 Pro · OpenAI · Selected' })
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(selected)
    expect(onSelect).toHaveBeenCalledOnce()
    fireEvent.focus(selected)
    expect(onFocus).toHaveBeenCalledOnce()

    rerender(
      <ModelSelectionRow
        modelName="Claude Sonnet"
        providerName="Anthropic Claude"
        selected={false}
        disabled
        statusLabel="API key needed"
        onSelect={onSelect}
      />,
    )
    const unavailable = screen.getByRole('button', {
      name: 'Claude Sonnet · Anthropic Claude · API key needed',
    })
    expect(unavailable).toBeDisabled()
    expect(unavailable).toHaveAttribute('aria-pressed', 'false')
  })

  it('exposes result selection and model-scoped run status', () => {
    const onClick = vi.fn()
    render(
      <TranslationResultTab
        id="result-tab"
        controls="result-panel"
        selected
        provider="openai"
        modelName="GPT 5.5 Pro"
        providerName="OpenAI"
        status="loading"
        statusLabel="Running"
        onClick={onClick}
        onKeyDown={vi.fn()}
      />,
    )

    const tab = screen.getByRole('tab', { name: 'GPT 5.5 Pro · OpenAI · Running' })
    expect(tab).toHaveAttribute('aria-selected', 'true')
    expect(tab).toHaveAttribute('aria-controls', 'result-panel')
    expect(tab).toHaveAttribute('aria-busy', 'true')
    expect(tab.querySelector('[data-run-status="loading"]')).toBeInTheDocument()
    fireEvent.click(tab)
    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: /Remove model/i })).not.toBeInTheDocument()
  })
})

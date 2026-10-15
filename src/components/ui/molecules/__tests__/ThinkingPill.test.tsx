import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { stripTrailingEllipsis, ThinkingPill } from '../ThinkingPill'

describe('ThinkingPill', () => {
  it('announces the label politely and drops locale ellipses next to the animated dots', () => {
    const { container } = render(<ThinkingPill label="Thinking…" />)

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent(/^Thinking$/)
    expect(container.querySelectorAll('.thinking-dot-accent')).toHaveLength(3)
  })

  it('adds the shimmer sheen only while running', () => {
    const { container, rerender } = render(<ThinkingPill label="Searching" shimmer />)
    expect(screen.getByRole('status')).toHaveClass('thinking-state-pill-shimmer')
    expect(container.querySelector('.thinking-shimmer-sheen')).toBeInTheDocument()

    rerender(<ThinkingPill label="Searching" shimmer running={false} />)
    expect(container.querySelector('.thinking-shimmer-sheen')).not.toBeInTheDocument()
    expect(container.querySelector('.thinking-dots')).not.toBeInTheDocument()
  })

  it('keeps the pill silhouette in the error tone without motion', () => {
    const { container } = render(<ThinkingPill label="Failed" tone="error" shimmer title="Network down" />)

    const status = screen.getByRole('status')
    expect(status).toHaveClass('thinking-state-pill-error')
    expect(status).not.toHaveClass('thinking-state-pill-shimmer')
    expect(status).not.toHaveAttribute('aria-live')
    expect(status).toHaveAttribute('title', 'Network down')
    expect(container.querySelector('.thinking-dots')).not.toBeInTheDocument()
  })
})

describe('stripTrailingEllipsis', () => {
  it('removes trailing ellipsis, dots and whitespace only', () => {
    expect(stripTrailingEllipsis('考え中…')).toBe('考え中')
    expect(stripTrailingEllipsis('Đang suy nghĩ ...')).toBe('Đang suy nghĩ')
    expect(stripTrailingEllipsis('Step 1. done')).toBe('Step 1. done')
  })
})

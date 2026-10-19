import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UsageCostBadge } from '../UsageCostBadge'

describe('UsageCostBadge', () => {
  it('renders cost and tokens as lightweight metadata without a pill separator', () => {
    const { container } = render(
      <UsageCostBadge
        currency="VND"
        cost={{
          amountUsd: 0,
          estimated: true,
          inputTokens: 20,
          outputTokens: 25,
          totalTokens: 45,
        }}
      />,
    )

    const metadata = container.querySelector<HTMLElement>('.usage-cost-badge')
    if (!metadata) throw new Error('Expected usage cost metadata')
    expect(metadata).toHaveClass('usage-cost-badge', 'usage-cost-badge--sm')
    expect(metadata).toHaveAttribute('title', expect.stringMatching(/~0đ.*20 in.*25 out/i))
    expect(screen.getByText('~0đ')).toHaveClass('usage-cost-badge-amount')
    expect(screen.getByText('45')).toHaveClass('usage-cost-badge-tokens')
    expect(metadata.querySelector('.usage-cost-badge-divider')).toBeInTheDocument()
    expect(metadata).not.toHaveClass('ui-badge', 'ring-1')
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageFallback } from '../../App'

describe('lazy feature route fallback', () => {
  it.each([
    ['live', 'Loading AI Interpret'],
    ['dictionary', 'Loading Dictionary'],
  ] as const)('keeps the %s route visibly occupied while loading', (page, label) => {
    render(<PageFallback page={page} label={label} />)
    expect(screen.getByRole('status', { name: label })).toBeInTheDocument()
  })

  it('does not alter the existing Chat fallback contract', () => {
    const { container } = render(<PageFallback page="chat" label="Loading AI Chat" />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

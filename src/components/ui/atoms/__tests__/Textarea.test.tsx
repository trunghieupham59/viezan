import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Textarea } from '../Textarea'

describe('Textarea atom', () => {
  it('shares the Input contract classes and honours native disabled', () => {
    render(<Textarea aria-label="Context" className="feature-field" disabled />)

    const field = screen.getByRole('textbox', { name: 'Context' })
    expect(field).toHaveAttribute('data-ui-control', 'textarea')
    expect(field).toHaveClass('ui-input', 'ui-textarea', 'feature-field')
    expect(field).toBeDisabled()
  })
})

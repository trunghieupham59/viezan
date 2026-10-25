import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FontSizePicker } from '../FontSizePicker'

describe('FontSizePicker', () => {
  it('names its group with the given label', () => {
    render(
      <FontSizePicker
        label="Font Size"
        value="medium"
        onChange={() => {}}
        labels={{ small: 'Small', medium: 'Medium', large: 'Large' }}
      />,
    )
    expect(screen.getByRole('group', { name: 'Font Size' })).toBeInTheDocument()
  })
})

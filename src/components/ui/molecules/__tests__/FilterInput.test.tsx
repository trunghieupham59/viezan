import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FilterInput } from '../FilterInput'

describe('FilterInput', () => {
  it('wraps the Input atom and reports value changes', () => {
    const onValueChange = vi.fn()
    render(
      <FilterInput
        value=""
        onValueChange={onValueChange}
        placeholder="Search history..."
        aria-label="Search history"
        clearLabel="Clear search"
      />,
    )

    const input = screen.getByRole('textbox', { name: 'Search history' })
    expect(input).toHaveAttribute('data-ui-control', 'input')
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'kin' } })
    expect(onValueChange).toHaveBeenCalledWith('kin')
  })

  it('shows a clear button that empties the field and returns focus to it', () => {
    const onValueChange = vi.fn()
    render(
      <FilterInput
        value="kintsugi"
        onValueChange={onValueChange}
        aria-label="Term"
        clearLabel="Clear search"
        trailing={<span>8/120</span>}
      />,
    )

    expect(screen.getByText('8/120')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onValueChange).toHaveBeenCalledWith('')
    expect(screen.getByRole('textbox', { name: 'Term' })).toHaveFocus()
  })

  it('marks the field invalid on both the input and the frame', () => {
    const { container } = render(
      <FilterInput value="x" onValueChange={() => {}} aria-label="Term" clearLabel="Clear" invalid />,
    )

    expect(screen.getByRole('textbox', { name: 'Term' })).toHaveAttribute('aria-invalid', 'true')
    expect(container.querySelector('.filter-input')).toHaveAttribute('data-invalid', 'true')
  })
})

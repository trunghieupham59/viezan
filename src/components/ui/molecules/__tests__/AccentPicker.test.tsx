import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AccentPicker } from '../AccentPicker'

const options = [
  { value: 'auto', label: 'Follow the style', auto: true },
  { value: 'violet', label: 'Violet' },
  { value: 'teal', label: 'Teal' },
]

describe('AccentPicker', () => {
  it('renders a radio group of swatches painted by their own accent', () => {
    render(<AccentPicker label="Accent" value="violet" options={options} onChange={() => {}} dark />)

    expect(screen.getByRole('radiogroup', { name: 'Accent' })).toBeInTheDocument()
    const auto = screen.getByRole('radio', { name: 'Follow the style' })
    const violet = screen.getByRole('radio', { name: 'Violet' })
    expect(auto).not.toHaveAttribute('data-accent')
    expect(auto).toHaveAttribute('data-auto', 'true')
    expect(violet).toHaveAttribute('data-accent', 'violet')
    expect(violet).toHaveAttribute('data-mode', 'dark')
    expect(auto).toHaveAttribute('data-mode', 'dark')
    expect(violet).toHaveAttribute('aria-checked', 'true')
    expect(violet).toHaveAttribute('tabindex', '0')
    expect(auto).toHaveAttribute('aria-checked', 'false')
    expect(auto).toHaveAttribute('tabindex', '-1')
  })

  it('selects on click, moves with arrow keys and previews on hover', () => {
    const onChange = vi.fn()
    const onPreview = vi.fn()
    render(<AccentPicker label="Accent" value="auto" options={options} onChange={onChange} onPreview={onPreview} />)

    const teal = screen.getByRole('radio', { name: 'Teal' })
    fireEvent.click(teal)
    expect(onChange).toHaveBeenLastCalledWith('teal')

    const auto = screen.getByRole('radio', { name: 'Follow the style' })
    auto.focus()
    fireEvent.keyDown(auto, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('violet')
    expect(screen.getByRole('radio', { name: 'Violet' })).toHaveFocus()
    fireEvent.keyDown(auto, { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith('teal')

    fireEvent.mouseEnter(teal)
    expect(onPreview).toHaveBeenLastCalledWith('teal')
    fireEvent.mouseLeave(teal)
    expect(onPreview).toHaveBeenLastCalledWith(null)
  })
})

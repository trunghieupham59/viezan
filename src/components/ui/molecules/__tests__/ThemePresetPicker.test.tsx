import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ThemePresetPicker } from '../ThemePresetPicker'

const options = [
  { value: 'graphite', label: 'Graphite' },
  { value: 'glass', label: 'Glass' },
  { value: 'midnight', label: 'Midnight', badge: 'Always dark' },
]

describe('ThemePresetPicker', () => {
  it('renders one radio group whose tiles paint their own style', () => {
    render(<ThemePresetPicker label="Style" value="glass" options={options} onChange={() => {}} />)

    expect(screen.getByRole('radiogroup', { name: 'Style' })).toBeInTheDocument()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    const glass = screen.getByRole('radio', { name: /Glass/ })
    expect(glass).toHaveAttribute('aria-checked', 'true')
    expect(glass).toHaveAttribute('tabindex', '0')
    expect(glass).toHaveAttribute('data-theme', 'glass')
    expect(glass).toHaveAttribute('data-selected', 'true')
    const graphite = screen.getByRole('radio', { name: /Graphite/ })
    expect(graphite).toHaveAttribute('aria-checked', 'false')
    expect(graphite).toHaveAttribute('tabindex', '-1')
    expect(graphite).not.toHaveAttribute('data-selected')
    expect(screen.getByText('Always dark')).toBeInTheDocument()
  })

  it('selects on click and moves the selection with arrow, Home and End keys', () => {
    const onChange = vi.fn()
    render(<ThemePresetPicker label="Style" value="graphite" options={options} onChange={onChange} />)

    fireEvent.click(screen.getByRole('radio', { name: /Midnight/ }))
    expect(onChange).toHaveBeenLastCalledWith('midnight')

    const graphite = screen.getByRole('radio', { name: /Graphite/ })
    graphite.focus()
    fireEvent.keyDown(graphite, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('glass')
    expect(screen.getByRole('radio', { name: /Glass/ })).toHaveFocus()

    fireEvent.keyDown(graphite, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith('midnight')
    fireEvent.keyDown(graphite, { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith('midnight')
    fireEvent.keyDown(graphite, { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith('graphite')
  })

  it('previews the tile under the pointer or focus and clears when it leaves', () => {
    const onPreview = vi.fn()
    render(<ThemePresetPicker label="Style" value="graphite" options={options} onChange={() => {}} onPreview={onPreview} />)

    const glass = screen.getByRole('radio', { name: /Glass/ })
    fireEvent.mouseEnter(glass)
    expect(onPreview).toHaveBeenLastCalledWith('glass')
    fireEvent.mouseLeave(glass)
    expect(onPreview).toHaveBeenLastCalledWith(null)
    fireEvent.focus(glass)
    expect(onPreview).toHaveBeenLastCalledWith('glass')
    fireEvent.blur(glass)
    expect(onPreview).toHaveBeenLastCalledWith(null)
  })
})

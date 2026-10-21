import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ThemePresetPicker } from '../ThemePresetPicker'

const options = [
  { value: 'graphite', label: 'Graphite', description: 'Quiet and compact' },
  { value: 'glass', label: 'Glass', description: 'Translucent glass' },
]

describe('ThemePresetPicker', () => {
  it('renders a labelled group of pressable cards that preview their own persona', () => {
    const { container } = render(<ThemePresetPicker label="Style" value="glass" options={options} onChange={() => {}} />)

    expect(screen.getByRole('group', { name: 'Style' })).toBeInTheDocument()
    const graphite = screen.getByRole('button', { name: /Graphite/ })
    const glass = screen.getByRole('button', { name: /Glass/ })
    expect(glass).toHaveAttribute('aria-pressed', 'true')
    expect(glass).toHaveAttribute('data-selected', 'true')
    expect(glass).toHaveAttribute('data-control-variant', 'primary')
    expect(glass).toHaveAttribute('data-theme', 'glass')
    expect(graphite).toHaveAttribute('aria-pressed', 'false')
    expect(graphite).not.toHaveAttribute('data-selected')
    expect(graphite).toHaveAttribute('data-control-variant', 'neutral')
    expect(graphite).toHaveAttribute('data-theme', 'graphite')
    expect(screen.getByText('Translucent glass')).toBeInTheDocument()
    // The miniature window is decorative: one per card, hidden from AT, with
    // the persona's chrome, reading type sample and accent action inside.
    const swatches = container.querySelectorAll('.theme-preset-swatch[aria-hidden="true"]')
    expect(swatches).toHaveLength(2)
    expect(swatches[0].querySelector('.theme-preset-swatch-nav-active')).not.toBeNull()
    expect(swatches[0].querySelector('.theme-preset-swatch-type')).toHaveTextContent('Aa')
    expect(swatches[0].querySelector('.theme-preset-swatch-action')).not.toBeNull()
  })

  it('reports the chosen preset', () => {
    const onChange = vi.fn()
    render(<ThemePresetPicker label="Style" value="graphite" options={options} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /Glass/ }))
    expect(onChange).toHaveBeenCalledWith('glass')
  })
})
